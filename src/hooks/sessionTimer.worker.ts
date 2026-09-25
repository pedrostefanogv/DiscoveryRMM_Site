// Timer de segundo plano para o ping-pong do remote debug.
//
// Por que um Web Worker: o navegador estrangula timers da PAGINA quando a aba
// esta oculta (Chrome chega a 1 execucao por minuto em "intensive throttling"),
// e o agente encerra a sessao apos MissedPingsBeforeClose * PingIntervalSeconds
// sem sinal (3x5s = 15s). Resultado: bastava trocar de aba para o agente matar a
// sessao com "viewer-timeout". Timers dentro de um Worker sofrem bem menos
// estrangulamento, entao o ping continua na cadencia configurada.
let timer: ReturnType<typeof setInterval> | null = null;

self.onmessage = (event: MessageEvent<{ type: "start" | "stop"; intervalMs?: number }>) => {
  const data = event.data;

  if (data?.type === "start" && typeof data.intervalMs === "number" && data.intervalMs > 0) {
    if (timer !== null) clearInterval(timer);
    timer = setInterval(() => self.postMessage("tick"), data.intervalMs);
    return;
  }

  if (data?.type === "stop" && timer !== null) {
    clearInterval(timer);
    timer = null;
  }
};

export {};
