// O id abaixo é carimbado a cada build (vite.config.ts): cada deploy gera um novo service worker
const BUILD = "__BUILD_ID__";
const CACHE = "emec-" + BUILD;
const SHELL = "/index.html";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.add(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Nunca intercepta Supabase (outra origem) nem as rotas /api
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Navegação: rede primeiro; offline cai no shell em cache
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const tipo = res.headers.get("content-type") || "";
          if (res.ok && !res.redirected && res.type === "basic" && tipo.includes("text/html")) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(SHELL, copia));
          }
          return res;
        })
        .catch(() => caches.match(SHELL))
    );
    return;
  }

  // Arquivos com hash (/assets/*): cache primeiro
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return res;
      }))
    );
    return;
  }

  // Ícones e imagens: usa o cache e atualiza em segundo plano
  if (/\.(png|jpg|jpeg|svg|webp|ico|webmanifest)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then((hit) => {
        const rede = fetch(req).then((res) => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }
          return res;
        }).catch(() => hit);
        return hit || rede;
      })
    );
  }
});
