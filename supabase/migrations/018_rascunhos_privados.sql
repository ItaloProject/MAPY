-- Rascunhos são PRIVADOS: cada usuário enxerga, edita e apaga apenas os próprios.
-- (A 017 deixava qualquer usuário autenticado ver todos os rascunhos.)

alter table rascunhos alter column created_by set default auth.uid();

drop policy if exists "auth_select_rascunhos" on rascunhos;
drop policy if exists "auth_insert_rascunhos" on rascunhos;
drop policy if exists "auth_update_rascunhos" on rascunhos;
drop policy if exists "auth_delete_rascunhos" on rascunhos;

create policy "dono_select_rascunhos" on rascunhos
  for select to authenticated using (created_by = auth.uid());

create policy "dono_insert_rascunhos" on rascunhos
  for insert to authenticated with check (created_by = auth.uid());

create policy "dono_update_rascunhos" on rascunhos
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "dono_delete_rascunhos" on rascunhos
  for delete to authenticated using (created_by = auth.uid());

-- Rascunhos sem dono (criados antes desta regra, sem usuário) ficariam invisíveis para todos.
delete from rascunhos where created_by is null;
