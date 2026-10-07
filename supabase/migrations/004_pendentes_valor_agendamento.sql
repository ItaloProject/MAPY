-- Adiciona valor individual e data de agendamento de pagamento
alter table publicacoes
  add column if not exists valor            numeric(10,2) not null default 100.00,
  add column if not exists agendamento_data date;

-- Preenche o valor para registros existentes
update publicacoes set valor = 100.00 where valor is null;
