import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import "./lib/pwa";


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// PWA: o manifest não é anunciado nas páginas públicas /pub/*
if (!location.pathname.startsWith("/pub/")) {
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = "/manifest.webmanifest";
  document.head.appendChild(link);
}

// Atualização automática: cada deploy gera um novo service worker (ver vite.config.ts).
// Ele assume sozinho e a página recarrega — na hora se acabou de abrir, ou ao ir para segundo plano.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  const jaControlado = !!navigator.serviceWorker.controller;
  let recarregando = false;

  const recarregar = () => {
    if (recarregando) return;
    recarregando = true;
    location.reload();
  };

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!jaControlado) return; // primeira instalação, nada a atualizar
    if (document.hidden || performance.now() < 15000) { recarregar(); return; }
    document.addEventListener("visibilitychange", () => { if (document.hidden) recarregar(); });
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      const verificar = () => reg.update().catch(() => {});
      document.addEventListener("visibilitychange", () => { if (!document.hidden) verificar(); });
      setInterval(verificar, 10 * 60 * 1000);
    }).catch(() => {});
  });
}
