-- Colunas que o app já grava em publicacoes mas que faltavam como migration.
-- Sem elas, um banco recriado do zero quebra no insert de publicação.
-- Frente do diploma: órgão expedidor do RG, nacionalidade, data da colação e reitor(a).
-- Operacional: link do .docx gerado (docx_url).
alter table publicacoes
  add column if not exists orgao_expedidor text,
  add column if not exists nacionalidade   text,
  add column if not exists data_colacao    text,
  add column if not exists reitor          text,
  add column if not exists docx_url        text;
