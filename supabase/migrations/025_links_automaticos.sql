-- Garante o link curto (Encurtador) em TODA publicação nova do grupo Publicação,
-- não importa por onde ela entre (app atual, versão antiga em cache, outro sistema ou script).
-- O app já cria o link ao publicar; este gatilho só age quando url_curta vem vazio.
--
-- Parte 1: gatilho para as próximas publicações.
-- Parte 2: conserta as que já existem sem link curto (idempotente, igual à migração 024).
--
-- Domínio do link curto: o mesmo de VITE_SHORT_BASE_URL. Troque nos dois pontos abaixo se mudar.

-- ── Parte 1: gatilho ────────────────────────────────────────────────────────────
create or replace function public.publicacoes_link_curto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base constant text := 'https://e-meccom.vercel.app';
  v_slug text;
begin
  -- Estácio usa o endereço do diploma da própria Estácio; quem já tem link curto fica como está
  if coalesce(new.grupo, '') = 'estacio'
     or coalesce(new.url_curta, '') <> ''
     or coalesce(new.url, '') !~* '^https?://' then
    return new;
  end if;

  loop
    v_slug := substr(md5(random()::text || clock_timestamp()::text || coalesce(new.pub_id, '')), 1, 7);
    exit when not exists (select 1 from links where slug = v_slug);
  end loop;

  insert into links (slug, target) values (v_slug, new.url);
  new.url_curta := v_base || '/g/' || v_slug;
  return new;
end;
$$;

drop trigger if exists trg_publicacoes_link_curto on publicacoes;
create trigger trg_publicacoes_link_curto
  before insert on publicacoes
  for each row execute function public.publicacoes_link_curto();

-- ── Parte 2: quem já está sem link curto ────────────────────────────────────────
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
