-- Tabela principal de publicações
CREATE TABLE IF NOT EXISTS publicacoes (
  id           BIGSERIAL PRIMARY KEY,
  pub_id       TEXT        UNIQUE NOT NULL,
  nome         TEXT        NOT NULL DEFAULT '',
  cpf          TEXT        NOT NULL DEFAULT '',
  curso        TEXT        NOT NULL DEFAULT '',
  status       TEXT        NOT NULL DEFAULT 'Publicado',
  data         TEXT        NOT NULL DEFAULT '',
  nascimento   TEXT        NOT NULL DEFAULT '',
  rg           TEXT        NOT NULL DEFAULT '',
  nome_mae     TEXT        NOT NULL DEFAULT '',
  nome_pai     TEXT        NOT NULL DEFAULT '',
  observacao   TEXT        NOT NULL DEFAULT '',
  instituicao  TEXT        NOT NULL DEFAULT '',
  inep         TEXT        NOT NULL DEFAULT '',
  endereco     TEXT        NOT NULL DEFAULT '',
  bairro       TEXT        NOT NULL DEFAULT '',
  municipio    TEXT        NOT NULL DEFAULT '',
  cep          TEXT        NOT NULL DEFAULT '',
  modalidade   TEXT        NOT NULL DEFAULT 'PRESENCIAL',
  ano_conclusao TEXT       NOT NULL DEFAULT '',
  protocolo    TEXT        NOT NULL DEFAULT '',
  url          TEXT        NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE publicacoes ENABLE ROW LEVEL SECURITY;

-- Qualquer pessoa pode ler (necessário para a página pública /pub/:id)
CREATE POLICY "leitura_publica" ON publicacoes
  FOR SELECT TO anon, authenticated
  USING (true);

-- Apenas usuários autenticados podem inserir
CREATE POLICY "admin_inserir" ON publicacoes
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Apenas usuários autenticados podem atualizar
CREATE POLICY "admin_atualizar" ON publicacoes
  FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- Apenas usuários autenticados podem deletar
CREATE POLICY "admin_deletar" ON publicacoes
  FOR DELETE TO authenticated
  USING (true);
