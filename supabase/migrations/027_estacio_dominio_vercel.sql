-- O domínio estaciio.com.br foi suspenso (o DNS não resolve mais). Os diplomas da Estácio passam a abrir em
-- https://est-fawn-sigma.vercel.app/diploma/<código>. Esta migração troca o endereço já gravado no banco.
--
-- Idempotente: só mexe em quem ainda tem o domínio antigo. Os QR já impressos ou dentro de .docx já gerados
-- continuam com o domínio antigo (o desenho do QR não muda); para eles é preciso gerar o diploma de novo.

update acessos_estacio
set url = replace(url, 'https://consultadiploma.estaciio.com.br/diploma', 'https://est-fawn-sigma.vercel.app/diploma')
where url like '%consultadiploma.estaciio.com.br%';

update publicacoes
set url = replace(url, 'https://consultadiploma.estaciio.com.br/diploma', 'https://est-fawn-sigma.vercel.app/diploma')
where url like '%consultadiploma.estaciio.com.br%';

-- Conferência: os dois números devem ser 0
select
  (select count(*) from acessos_estacio where url like '%estaciio.com.br%') as acessos_com_dominio_antigo,
  (select count(*) from publicacoes     where url like '%estaciio.com.br%') as publicacoes_com_dominio_antigo;
