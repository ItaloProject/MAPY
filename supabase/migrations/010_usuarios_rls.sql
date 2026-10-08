-- Restringe a tabela usuarios:
--   * só administrador cria, apaga e altera perfil/status/matrícula/token de qualquer usuário;
--   * cada pessoa lê a própria linha e pode alterar apenas o próprio nome (e ultimo_acesso).
-- Antes, qualquer usuário logado podia ler/alterar tudo (inclusive se promover a Administrador).

-- Administrador = admin-mestre (e-mail do seed) ou linha ativa com perfil Administrador
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    lower(auth.jwt() ->> 'email') = 'italo.fontes2026@gmail.com'
    or exists (
      select 1
      from public.usuarios u
      where u.perfil = 'Administrador'
        and u.status = 'Ativo'
        and (
          u.auth_user_id = auth.uid()
          or (u.auth_user_id is null and u.email is not null
              and lower(u.email) = lower(auth.jwt() ->> 'email'))
        )
    ),
    false
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Políticas
drop policy if exists "admin_select_usuarios" on usuarios;
drop policy if exists "admin_insert_usuarios" on usuarios;
drop policy if exists "admin_update_usuarios" on usuarios;
drop policy if exists "admin_delete_usuarios" on usuarios;
drop policy if exists "usuarios_select" on usuarios;
drop policy if exists "usuarios_insert" on usuarios;
drop policy if exists "usuarios_update" on usuarios;
drop policy if exists "usuarios_delete" on usuarios;

create policy "usuarios_select" on usuarios
  for select to authenticated
  using (
    public.is_admin()
    or auth_user_id = auth.uid()
    or (auth_user_id is null and email is not null and lower(email) = lower(auth.jwt() ->> 'email'))
  );

create policy "usuarios_insert" on usuarios
  for insert to authenticated
  with check (public.is_admin());

create policy "usuarios_delete" on usuarios
  for delete to authenticated
  using (public.is_admin());

create policy "usuarios_update" on usuarios
  for update to authenticated
  using (
    public.is_admin()
    or auth_user_id = auth.uid()
    or (auth_user_id is null and email is not null and lower(email) = lower(auth.jwt() ->> 'email'))
  )
  with check (
    public.is_admin()
    or auth_user_id = auth.uid()
    or (auth_user_id is null and email is not null and lower(email) = lower(auth.jwt() ->> 'email'))
  );

-- Quem não é administrador só pode mudar nome (e ultimo_acesso) da própria linha
create or replace function public.usuarios_proteger_colunas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- service role (rotas /api) e SQL Editor passam direto
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;
  if new.id            is distinct from old.id
  or new.email         is distinct from old.email
  or new.perfil        is distinct from old.perfil
  or new.status        is distinct from old.status
  or new.matricula     is distinct from old.matricula
  or new.auth_user_id  is distinct from old.auth_user_id
  or new.token_hash    is distinct from old.token_hash
  or new.created_at    is distinct from old.created_at
  then
    raise exception 'Sem permissão para alterar estes campos.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_usuarios_proteger_colunas on usuarios;
create trigger trg_usuarios_proteger_colunas
  before update on usuarios
  for each row execute function public.usuarios_proteger_colunas();
