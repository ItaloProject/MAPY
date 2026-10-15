-- Histórico por registro: toda publicação nasce com um histórico e cada mudança vira um evento.
-- Os eventos são gravados por TRIGGER no banco, então não dependem do app lembrar de registrar
-- e não podem ser editados nem apagados pela aplicação (somente anotações manuais são inseridas pelo app).
-- pub_id não tem FK de propósito: o histórico continua existindo depois que o registro é excluído.

create table if not exists historico_publicacoes (
  id          uuid primary key default gen_random_uuid(),
  pub_id      text not null,
  grupo       text not null default 'publicacao',
  evento      text not null check (evento in
                ('criado','editado','diploma','ativado','desativado','pagamento','acesso','excluido','nota')),
  descricao   text not null default '',
  alteracoes  jsonb not null default '[]'::jsonb,   -- [{campo, de, para}]
  nome        text not null default '',              -- retrato do aluno no momento do evento
  cpf         text not null default '',
  autor_id    uuid,
  autor_nome  text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists idx_historico_pub on historico_publicacoes(pub_id, created_at desc);
create index if not exists idx_historico_grupo on historico_publicacoes(grupo, created_at desc);

-- Nome de quem está logado (tabela usuarios), com fallback para o e-mail.
create or replace function public.historico_autor_nome()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.nome from public.usuarios u where u.auth_user_id = auth.uid() limit 1),
    (select u.nome from public.usuarios u
      where u.email is not null and lower(u.email) = lower(auth.jwt() ->> 'email') limit 1),
    nullif(auth.jwt() ->> 'email', ''),
    'Sistema'
  );
$$;

revoke all on function public.historico_autor_nome() from public, anon;
grant execute on function public.historico_autor_nome() to authenticated;

-- Em requisições autenticadas, autor e horário vêm do servidor (ninguém consegue forjar).
-- No SQL Editor (auth.uid() nulo) os valores informados são mantidos, o que permite o backfill abaixo.
create or replace function public.historico_forcar_autor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.autor_id   := auth.uid();
    new.autor_nome := public.historico_autor_nome();
    new.created_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_historico_forcar_autor on historico_publicacoes;
create trigger trg_historico_forcar_autor
  before insert on historico_publicacoes
  for each row execute function public.historico_forcar_autor();

-- Registro de eventos da publicação (criar / editar / ativar / pagar / excluir).
create or replace function public.publicacoes_registrar_historico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old      jsonb;
  v_new      jsonb;
  k          text;
  v_changes  jsonb := '[]'::jsonb;
  v_campos   text[] := '{}';
  v_evento   text;
  v_desc     text;
  v_ignorar  text[] := array['id', 'created_at', 'created_by', 'pub_id'];
  v_opacos   text[] := array['inep', 'docx_url'];  -- valores grandes/técnicos: só registra que mudou
begin
  if tg_op = 'INSERT' then
    insert into historico_publicacoes (pub_id, grupo, evento, descricao, nome, cpf, autor_id, autor_nome)
    values (new.pub_id, new.grupo, 'criado', 'Registro criado', new.nome, new.cpf,
            auth.uid(), public.historico_autor_nome());
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into historico_publicacoes (pub_id, grupo, evento, descricao, nome, cpf, autor_id, autor_nome)
    values (old.pub_id, old.grupo, 'excluido', 'Registro excluído', old.nome, old.cpf,
            auth.uid(), public.historico_autor_nome());
    return old;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);

  for k in select jsonb_object_keys(v_new) loop
    continue when k = any(v_ignorar);
    if coalesce(v_old ->> k, '') <> coalesce(v_new ->> k, '') then
      v_campos := v_campos || k;
      v_changes := v_changes || jsonb_build_array(jsonb_build_object(
        'campo', k,
        'de',   case when k = any(v_opacos) then null else v_old -> k end,
        'para', case when k = any(v_opacos) then null else v_new -> k end
      ));
    end if;
  end loop;

  if array_length(v_campos, 1) is null then
    return new;  -- UPDATE que não mudou nada
  end if;

  if v_campos = array['ativo'] then
    v_evento := case when new.ativo then 'ativado' else 'desativado' end;
    v_desc   := case when new.ativo then 'QR Code ativado' else 'QR Code desativado' end;
  elsif v_campos = array['pagamento_status'] then
    v_evento := 'pagamento';
    v_desc   := 'Pagamento: ' || coalesce(old.pagamento_status, '-') || ' → ' || coalesce(new.pagamento_status, '-');
  elsif v_campos <@ array['docx_url', 'inep'] and 'docx_url' = any(v_campos) then
    v_evento := 'diploma';
    v_desc   := 'Diploma (.docx) regenerado';
  else
    v_evento := 'editado';
    v_desc   := array_length(v_campos, 1)::text ||
                case when array_length(v_campos, 1) = 1 then ' campo alterado' else ' campos alterados' end;
  end if;

  insert into historico_publicacoes (pub_id, grupo, evento, descricao, alteracoes, nome, cpf, autor_id, autor_nome)
  values (new.pub_id, new.grupo, v_evento, v_desc, v_changes, new.nome, new.cpf,
          auth.uid(), public.historico_autor_nome());
  return new;
end;
$$;

drop trigger if exists trg_publicacoes_historico on publicacoes;
create trigger trg_publicacoes_historico
  after insert or update or delete on publicacoes
  for each row execute function public.publicacoes_registrar_historico();

-- Acesso do SIA (matrícula/senha) ligado ao registro: criação e troca de senha/matrícula.
-- A senha em si nunca vai para o histórico.
create or replace function public.acessos_estacio_registrar_historico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cpf  text := '';
  v_desc text;
begin
  if coalesce(new.pub_id, '') = '' then
    return new;
  end if;

  select p.cpf into v_cpf from publicacoes p where p.pub_id = new.pub_id;

  if tg_op = 'INSERT' then
    v_desc := 'Acesso do SIA criado (matrícula ' || new.matricula || ')';
  else
    if new.senha_hash is distinct from old.senha_hash then
      v_desc := 'Senha de acesso do SIA redefinida (matrícula ' || new.matricula || ')';
    elsif new.matricula is distinct from old.matricula then
      v_desc := 'Matrícula de acesso alterada: ' || old.matricula || ' → ' || new.matricula;
    else
      return new;
    end if;
  end if;

  insert into historico_publicacoes (pub_id, grupo, evento, descricao, nome, cpf, autor_id, autor_nome)
  values (new.pub_id, 'estacio', 'acesso', v_desc, coalesce(new.nome, ''), coalesce(v_cpf, ''),
          auth.uid(), public.historico_autor_nome());
  return new;
end;
$$;

drop trigger if exists trg_acessos_historico on acessos_estacio;
create trigger trg_acessos_historico
  after insert or update on acessos_estacio
  for each row execute function public.acessos_estacio_registrar_historico();

-- Segurança: todo usuário autenticado lê (mesma visibilidade da lista de publicações);
-- o app só pode inserir ANOTAÇÕES, em nome de si mesmo. Sem update/delete: o histórico é imutável.
alter table historico_publicacoes enable row level security;

drop policy if exists "historico_select" on historico_publicacoes;
drop policy if exists "historico_inserir_nota" on historico_publicacoes;

create policy "historico_select" on historico_publicacoes
  for select to authenticated using (true);

create policy "historico_inserir_nota" on historico_publicacoes
  for insert to authenticated
  with check (evento = 'nota' and autor_id = auth.uid());

-- Registros que já existiam ganham o evento de criação (todo registro precisa ter histórico).
insert into historico_publicacoes (pub_id, grupo, evento, descricao, nome, cpf, autor_id, autor_nome, created_at)
select p.pub_id, p.grupo, 'criado', 'Registro criado (anterior ao histórico)', p.nome, p.cpf,
       p.created_by,
       coalesce((select u.nome from usuarios u where u.auth_user_id = p.created_by limit 1), 'Sistema'),
       p.created_at
from publicacoes p
where not exists (select 1 from historico_publicacoes h where h.pub_id = p.pub_id);

-- Atualização ao vivo na aba HISTÓRICO.
do $$
begin
  alter publication supabase_realtime add table historico_publicacoes;
exception when others then
  null;
end $$;
