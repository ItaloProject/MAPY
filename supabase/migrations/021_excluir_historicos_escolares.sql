-- Permite excluir o histórico escolar de um registro (volta ao status "pendente").
-- A exclusão também vira um evento na linha do tempo (historico_publicacoes), como a criação e as edições.

drop policy if exists "historicos_escolares_delete" on historicos_escolares;

create policy "historicos_escolares_delete" on historicos_escolares
  for delete to authenticated using (true);

create or replace function public.historicos_escolares_registrar_exclusao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text := '';
  v_cpf  text := '';
begin
  select coalesce(p.nome, ''), coalesce(p.cpf, '') into v_nome, v_cpf
  from publicacoes p where p.pub_id = old.pub_id limit 1;

  insert into historico_publicacoes (pub_id, grupo, evento, descricao, nome, cpf, autor_id, autor_nome)
  values (old.pub_id, old.grupo, 'historico', 'Histórico escolar excluído', v_nome, v_cpf,
          auth.uid(), public.historico_autor_nome());
  return old;
end;
$$;

drop trigger if exists trg_historicos_escolares_exclusao on historicos_escolares;
create trigger trg_historicos_escolares_exclusao
  after delete on historicos_escolares
  for each row execute function public.historicos_escolares_registrar_exclusao();
