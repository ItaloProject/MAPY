-- Corrige publicações cujo endereço (url) começa com um caractere invisível (BOM, U+FEFF),
-- que vinha do valor da variável VITE_QR_BASE_URL. Dentro do QR ele faz o leitor do celular não
-- reconhecer o link, e fazia o gatilho/backfill do Encurtador (migrações 024/025) pular o cadastro.
--
-- Parte 1: o gatilho passa a LIMPAR o endereço antes de usar (BOM, espaços de largura zero, espaços nas pontas).
-- Parte 2: limpa os endereços que já estão assim.
-- Parte 3: liga ao Encurtador quem ficou sem link curto (mostra quais foram alterados).
--
-- Domínio do link curto: o mesmo de VITE_SHORT_BASE_URL. Troque nos pontos abaixo se mudar.

-- ── Parte 1: gatilho que normaliza o endereço ───────────────────────────────────
create or replace function public.publicacoes_link_curto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base constant text := 'https://e-meccom.vercel.app';
  v_url  text;
  v_slug text;
begin
  -- U+FEFF (65279), U+200B..U+200D (8203..8205) e espaços nas pontas
  v_url := btrim(replace(replace(replace(replace(coalesce(new.url, ''),
             chr(65279), ''), chr(8203), ''), chr(8204), ''), chr(8205), ''));
  new.url := v_url;

  -- Estácio usa o endereço do diploma da própria Estácio; quem já tem link curto fica como está
  if coalesce(new.grupo, '') = 'estacio'
     or coalesce(new.url_curta, '') <> ''
     or v_url !~* '^https?://' then
    return new;
  end if;

  loop
    v_slug := substr(md5(random()::text || clock_timestamp()::text || coalesce(new.pub_id, '')), 1, 7);
    exit when not exists (select 1 from links where slug = v_slug);
  end loop;

  insert into links (slug, target) values (v_slug, v_url);
  new.url_curta := v_base || '/g/' || v_slug;
  return new;
end;
$$;

-- ── Parte 2: limpa os endereços já gravados com caractere invisível ─────────────
update publicacoes
set url = btrim(replace(replace(replace(replace(url,
            chr(65279), ''), chr(8203), ''), chr(8204), ''), chr(8205), ''))
where url <> btrim(replace(replace(replace(replace(url,
            chr(65279), ''), chr(8203), ''), chr(8204), ''), chr(8205), ''));

-- ── Parte 3: liga ao Encurtador quem está sem link curto ────────────────────────
with sem as (
  select pub_id, url,
         substr(md5(random()::text || clock_timestamp()::text || pub_id), 1, 7) as slug
  from publicacoes
  where grupo <> 'estacio'
    and coalesce(url_curta, '') = ''
    and coalesce(url, '') ~* '^https?://'
),
novos as (
  insert into links (slug, target)
  select slug, url from sem
  returning slug
)
update publicacoes p
set url_curta = 'https://e-meccom.vercel.app/g/' || s.slug
from sem s
where p.pub_id = s.pub_id
returning p.nome, p.url, p.url_curta;
