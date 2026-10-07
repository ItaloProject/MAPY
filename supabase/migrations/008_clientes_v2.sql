-- Recria a tabela clientes com o schema correto (controle_status)
-- Se já existir com schema antigo, dropa e recria
drop table if exists clientes cascade;

create table clientes (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  cpf             text,
  controle_status text not null default 'Pendente', -- Pendente | Concluído
  created_at      timestamptz not null default now()
);

alter table clientes enable row level security;

create policy "auth_select_clientes"
  on clientes for select to authenticated using (true);

create policy "auth_insert_clientes"
  on clientes for insert to authenticated with check (true);

create policy "auth_update_clientes"
  on clientes for update to authenticated using (true);

create policy "auth_delete_clientes"
  on clientes for delete to authenticated using (true);
