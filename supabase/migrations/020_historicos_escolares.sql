-- Histórico escolar por registro (documento editável + PDF na aba HISTÓRICO).
-- Um registro SEM linha aqui está "pendente"; com linha, o histórico escolar foi "criado".
-- Cada criação/edição também vira um evento na linha do tempo (historico_publicacoes).
-- pub_id não tem FK de propósito, como em historico_publicacoes: o documento sobrevive à exclusão do registro.

create table if not exists historicos_escolares (
  pub_id      text primary key,
  grupo       text not null default 'publicacao',
  dados       jsonb not null default '{}'::jsonb,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

create index if not exists idx_historicos_escolares_grupo on historicos_escolares(grupo);

-- Autoria e horários vêm do servidor; pub_id e criação não mudam em atualizações.
create or replace function public.historicos_escolares_carimbar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.pub_id     := old.pub_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_historicos_escolares_carimbar on historicos_escolares;
create trigger trg_historicos_escolares_carimbar
  before insert or update on historicos_escolares
  for each row execute function public.historicos_escolares_carimbar();

-- Aceita o novo tipo de evento na linha do tempo.
alter table historico_publicacoes drop constraint if exists historico_publicacoes_evento_check;
alter table historico_publicacoes add constraint historico_publicacoes_evento_check
  check (evento in ('criado','editado','diploma','ativado','desativado','pagamento','acesso','excluido','nota','historico'));

-- Evento "Histórico escolar" (criado / editado) com a diferença campo a campo.
create or replace function public.historicos_escolares_registrar_historico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome     text := '';
  v_cpf      text := '';
  k          text;
  v_changes  jsonb := '[]'::jsonb;
  v_n        int := 0;
  v_old      jsonb;
  v_new      jsonb;
  v_desc     text;
begin
  select coalesce(p.nome, ''), coalesce(p.cpf, '') into v_nome, v_cpf
  from publicacoes p where p.pub_id = new.pub_id limit 1;

  if tg_op = 'INSERT' then
    insert into historico_publicacoes (pub_id, grupo, evento, descricao, nome, cpf, autor_id, autor_nome)
    values (new.pub_id, new.grupo, 'historico', 'Histórico escolar criado', v_nome, v_cpf,
            auth.uid(), public.historico_autor_nome());
    return new;
  end if;

  if new.dados is not distinct from old.dados then
    return new;
  end if;

  v_old := coalesce(old.dados, '{}'::jsonb);
  v_new := coalesce(new.dados, '{}'::jsonb);

  for k in select distinct key from (
    select jsonb_object_keys(v_new) as key union select jsonb_object_keys(v_old)
  ) s loop
    if v_old -> k is not distinct from v_new -> k then
      continue;
    end if;
    v_n := v_n + 1;
    if k in ('t1', 't2') then
      -- Listas de disciplinas: mostra a contagem quando muda; caso contrário só "atualizado".
      if jsonb_typeof(v_old -> k) = 'array' and jsonb_typeof(v_new -> k) = 'array'
         and jsonb_array_length(v_old -> k) <> jsonb_array_length(v_new -> k) then
        v_changes := v_changes || jsonb_build_array(jsonb_build_object(
          'campo', 'he_' || k,
          'de',   jsonb_array_length(v_old -> k)::text || ' disciplinas',
          'para', jsonb_array_length(v_new -> k)::text || ' disciplinas'));
      else
        v_changes := v_changes || jsonb_build_array(jsonb_build_object('campo', 'he_' || k, 'de', null, 'para', null));
      end if;
    else
      v_changes := v_changes || jsonb_build_array(jsonb_build_object(
        'campo', 'he_' || k, 'de', v_old -> k, 'para', v_new -> k));
    end if;
  end loop;

  v_desc := 'Histórico escolar editado (' || v_n::text ||
            case when v_n = 1 then ' campo alterado)' else ' campos alterados)' end;

  insert into historico_publicacoes (pub_id, grupo, evento, descricao, alteracoes, nome, cpf, autor_id, autor_nome)
  values (new.pub_id, new.grupo, 'historico', v_desc, v_changes, v_nome, v_cpf,
          auth.uid(), public.historico_autor_nome());
  return new;
end;
$$;

drop trigger if exists trg_historicos_escolares_historico on historicos_escolares;
create trigger trg_historicos_escolares_historico
  after insert or update on historicos_escolares
  for each row execute function public.historicos_escolares_registrar_historico();

-- Segurança: mesma visibilidade da lista de publicações (todo usuário autenticado).
-- Sem delete: o histórico escolar não é apagado pelo app.
alter table historicos_escolares enable row level security;

drop policy if exists "historicos_escolares_select" on historicos_escolares;
drop policy if exists "historicos_escolares_insert" on historicos_escolares;
drop policy if exists "historicos_escolares_update" on historicos_escolares;

create policy "historicos_escolares_select" on historicos_escolares
  for select to authenticated using (true);

create policy "historicos_escolares_insert" on historicos_escolares
  for insert to authenticated with check (true);

create policy "historicos_escolares_update" on historicos_escolares
  for update to authenticated using (true) with check (true);
