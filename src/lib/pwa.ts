import { useEffect, useState } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

// O evento dispara uma vez, cedo; guardamos aqui para a tela de Configurações usar depois.
let deferred: InstallPrompt | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach(fn => fn());

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferred = e as InstallPrompt;
  avisar();
});
window.addEventListener("appinstalled", () => {
  deferred = null;
  avisar();
});

const emStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function usePwaInstall() {
  const [, forcar] = useState(0);
  useEffect(() => {
    const fn = () => forcar(n => n + 1);
    ouvintes.add(fn);
    return () => { ouvintes.delete(fn); };
  }, []);

  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

  async function instalar() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => {});
    deferred = null;
    avisar();
  }

  return { instalado: emStandalone(), podeInstalar: !!deferred, ios, instalar };
}
