-- Link curto (encurtador externo, ex.: TinyURL) usado no QR code no lugar de `url`.
-- Em branco, o QR continua usando `url`. O destino do link curto é trocado no próprio encurtador.
alter table publicacoes
  add column if not exists url_curta text;
