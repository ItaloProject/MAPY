-- Adiciona controle de ativação por publicação.
-- ativo = true (padrão) → QR code funciona normalmente.
-- ativo = false → PubViewer mostra página "desativado".

alter table publicacoes
  add column if not exists ativo boolean not null default true;
