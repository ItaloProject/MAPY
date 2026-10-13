-- Campos do diploma Estácio que não existiam no formulário.
-- Frente: naturalidade do aluno e a linha "Cidade - UF, dia de Mês de ano."
-- Verso: dados do registro do diploma e reconhecimento do curso.

alter table publicacoes
  add column if not exists naturalidade         text,
  add column if not exists cidade_expedicao     text,
  add column if not exists data_expedicao       text,
  add column if not exists registro_numero      text,
  add column if not exists registro_livro       text,
  add column if not exists registro_folha       text,
  add column if not exists registro_data        text,
  add column if not exists registro_processo    text,
  add column if not exists curso_reconhecimento text;
