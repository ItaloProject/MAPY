-- Acessos do SIA (matrícula + senha do aluno para ver o diploma).
-- Antes isso vivia só no localStorage do navegador (sumia ao limpar/trocar de máquina).
-- Agora é persistido no banco. A senha é guardada apenas como hash SHA-256;
-- o login do aluno continua validando pelo hash (mesmo formato do estacio/acessos.json no Storage).
create table if not exists acessos_estacio (
  id         uuid primary key default gen_random_uuid(),
  matricula  text not null unique,
  senha_hash text not null,
  nome       text not null default '',
  pub_id     text not null default '',
  url        text not null default '',
  criado_em  timestamptz not null default now()
);

create index if not exists idx_acessos_estacio_pub_id on acessos_estacio(pub_id);

alter table acessos_estacio enable row level security;

create policy "auth_select_acessos" on acessos_estacio
  for select to authenticated using (true);

create policy "auth_insert_acessos" on acessos_estacio
  for insert to authenticated with check (true);

create policy "auth_update_acessos" on acessos_estacio
  for update to authenticated using (true) with check (true);

create policy "auth_delete_acessos" on acessos_estacio
  for delete to authenticated using (true);
