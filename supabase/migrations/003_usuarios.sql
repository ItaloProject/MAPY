create table if not exists usuarios (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  email       text not null unique,
  perfil      text not null default 'Operador', -- Administrador | Operador | Suporte | Visualizador
  status      text not null default 'Ativo',    -- Ativo | Suspenso
  ultimo_acesso timestamptz,
  created_at  timestamptz not null default now()
);

alter table usuarios enable row level security;

create policy "admin_select_usuarios"
  on usuarios for select to authenticated using (true);

create policy "admin_insert_usuarios"
  on usuarios for insert to authenticated with check (true);

create policy "admin_update_usuarios"
  on usuarios for update to authenticated using (true);

create policy "admin_delete_usuarios"
  on usuarios for delete to authenticated using (true);

-- Seed: admin inicial
insert into usuarios (nome, email, perfil, status, ultimo_acesso)
values ('Italo Admin', 'suporte.ferramentas@cgbengenharia.com.br', 'Administrador', 'Ativo', now())
on conflict (email) do nothing;
