alter table usuarios
  add column if not exists token_hash text;

create index if not exists idx_usuarios_token on usuarios(token_hash);
