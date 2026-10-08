-- Rastreia qual usuário do sistema criou cada publicação.
-- Necessário para a feature "desativar QRs por usuário" na página Usuários.

alter table publicacoes
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists idx_publicacoes_created_by on publicacoes(created_by);
