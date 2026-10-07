-- Adapta tabela clientes para o novo fluxo de Controle
alter table clientes
  add column if not exists cpf text,
  add column if not exists controle_status text not null default 'Pendente'; -- Pendente | Concluído

-- Limpa colunas que não serão mais usadas neste fluxo (opcional — mantidas para não quebrar dados antigos)
-- Registros antigos ficam como Pendente por padrão
