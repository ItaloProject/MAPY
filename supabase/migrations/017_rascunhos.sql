-- Rascunhos de publicação ("Concluir mais tarde").
-- Guarda o formulário NOVO (Publicação/Estácio) parcialmente preenchido para ser retomado
-- depois, de qualquer aparelho. Aparecem na aba "Andamento" do Controle.
-- A senha de acesso do SIA nunca é gravada aqui.
create table if not exists rascunhos (
  id          uuid primary key default gen_random_uuid(),
  grupo       text not null default 'publicacao',
  nome        text not null default '',
  cpf         text not null default '',
  curso       text not null default '',
  dados       jsonb not null default '{}'::jsonb,
  progresso   integer not null default 0,
  faltando    text[] not null default '{}',
  edicao      boolean not null default false,
  autor_nome  text not null default '',
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_rascunhos_grupo on rascunhos(grupo);
create index if not exists idx_rascunhos_updated_at on rascunhos(updated_at desc);

alter table rascunhos enable row level security;

create policy "auth_select_rascunhos" on rascunhos
  for select to authenticated using (true);

create policy "auth_insert_rascunhos" on rascunhos
  for insert to authenticated with check (true);

create policy "auth_update_rascunhos" on rascunhos
  for update to authenticated using (true) with check (true);

create policy "auth_delete_rascunhos" on rascunhos
  for delete to authenticated using (true);
