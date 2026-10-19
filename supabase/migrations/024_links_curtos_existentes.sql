-- Liga ao Encurtador os QR codes que já existem (grupo Publicação).
-- Para cada publicação sem url_curta: reaproveita um link que já aponte para /r/<pub_id>
-- ou cria um novo (destino = url atual) e grava o link curto em publicacoes.url_curta.
--
-- Seguro para rodar mais de uma vez: só mexe em quem ainda está sem url_curta.
-- Não mexe no grupo Estácio (o QR do diploma é o endereço da Estácio) nem em quem já tem
-- um link curto (ex.: TinyURL). Os QR antigos (/r/<pub_id>) continuam abrindo normalmente.
--
-- Domínio do link curto: o mesmo de VITE_SHORT_BASE_URL. Troque abaixo se mudar.
do $$
declare
  v_base text := 'https://e-meccom.vercel.app';
  r      record;
  v_slug text;
  v_novos int := 0;
  v_reus  int := 0;
begin
  for r in
    select pub_id, url
    from publicacoes
    where grupo <> 'estacio'
      and coalesce(url_curta, '') = ''
      and coalesce(url, '') ~* '^https?://'
  loop
    select slug into v_slug from links where target like '%/r/' || r.pub_id limit 1;

    if v_slug is null then
      loop
        v_slug := substr(md5(random()::text || clock_timestamp()::text || r.pub_id), 1, 7);
        exit when not exists (select 1 from links where slug = v_slug);
      end loop;
      insert into links (slug, target) values (v_slug, r.url);
      v_novos := v_novos + 1;
    else
      v_reus := v_reus + 1;
    end if;

    update publicacoes set url_curta = v_base || '/g/' || v_slug where pub_id = r.pub_id;
  end loop;

  raise notice 'Links criados: %, reaproveitados: %', v_novos, v_reus;
end $$;
