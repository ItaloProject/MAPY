-- Separa publicações por grupo (ex.: 'publicacao', 'estacio').
-- Rows existentes recebem 'publicacao' como padrão.

alter table publicacoes
  add column if not exists grupo text not null default 'publicacao';

create index if not exists idx_publicacoes_grupo on publicacoes(grupo);
