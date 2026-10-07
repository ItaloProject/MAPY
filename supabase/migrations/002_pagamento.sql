-- Adiciona controle de pagamento nas publicações
ALTER TABLE publicacoes
  ADD COLUMN IF NOT EXISTS pagamento_status TEXT NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS pagamento_data   TIMESTAMPTZ;
