alter table usuarios
  add column if not exists matricula    text unique,
  add column if not exists auth_user_id uuid unique;

-- Índice para busca rápida por matrícula
create index if not exists idx_usuarios_matricula on usuarios(matricula);
