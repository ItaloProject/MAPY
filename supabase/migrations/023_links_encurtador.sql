-- Encurtador interno: cada link curto (/g/<apelido>) redireciona para `target`.
-- Trocar o destino não muda o link, então o QR code impresso continua válido.
create table if not exists links (
  slug        text primary key check (slug ~ '^[A-Za-z0-9_-]{3,40}$'),
  target      text not null check (target ~* '^https?://'),
  clicks      integer not null default 0,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table links enable row level security;

create policy "auth_select_links" on links
  for select to authenticated using (true);

create policy "auth_insert_links" on links
  for insert to authenticated with check (true);

create policy "auth_update_links" on links
  for update to authenticated using (true) with check (true);

create policy "auth_delete_links" on links
  for delete to authenticated using (true);

-- Usada pela rota pública /g/:slug (api/go.ts, com service role):
-- devolve o destino e soma um clique numa única operação.
create or replace function public.resolver_link(p_slug text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target text;
begin
  update links set clicks = clicks + 1 where slug = p_slug returning target into v_target;
  return v_target;
end;
$$;

revoke all on function public.resolver_link(text) from public, anon, authenticated;
grant execute on function public.resolver_link(text) to service_role;
