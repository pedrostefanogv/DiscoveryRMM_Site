/**
 * Agenda um tick periodico resistente ao estrangulamento de timers da pagina.
 *
 * Usa um Web Worker quando disponivel (aba oculta continua pingando) e cai no
 * `window.setInterval` classico quando o ambiente nao tem Worker (jsdom nos
 * testes, navegadores antigos).
 */
export function createBackgroundTimer(intervalMs: number, onTick: () => void): () => void {
  const worker = createSessionTimerWorker();
  if (worker) {
    worker.onmessage = () => onTick();
    worker.postMessage({ type: "start", intervalMs });

    return () => {
      try {
        worker.postMessage({ type: "stop" });
      } catch {
        // worker já encerrado: nada a fazer
      }
      worker.terminate();
    };
  }

  const timer = window.setInterval(onTick, intervalMs);
  return () => window.clearInterval(timer);
}

function createSessionTimerWorker(): Worker | null {
  if (typeof Worker === "undefined" || typeof URL === "undefined") return null;

  try {
    // O bundle servido e same-origin ('self'), portanto permitido pela CSP.
    return new Worker(new URL("./sessionTimer.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}
