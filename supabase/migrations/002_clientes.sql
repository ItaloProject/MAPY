create table if not exists clientes (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  email       text,
  telefone    text,
  plano       text not null default 'Básico',   -- Básico | Pro | Enterprise
  status      text not null default 'Pendente', -- Ativo | Pendente | Inativo
  created_at  timestamptz not null default now()
);

-- RLS
alter table clientes enable row level security;

create policy "admin_select_clientes"
  on clientes for select to authenticated using (true);

create policy "admin_insert_clientes"
  on clientes for insert to authenticated with check (true);

create policy "admin_update_clientes"
  on clientes for update to authenticated using (true);

create policy "admin_delete_clientes"
  on clientes for delete to authenticated using (true);
