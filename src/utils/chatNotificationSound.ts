/**
 * Som discreto via Web Audio API para avisar novas mensagens do usuário final
 * quando a janela/aba do chat está em segundo plano. Sem dependências externas.
 */
let sharedAudioContext: AudioContext | null = null;

export function playChatNotificationSound(): void {
  if (typeof window === "undefined") return;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;

  try {
    if (!sharedAudioContext) {
      sharedAudioContext = new Ctx();
    }
    const ctx = sharedAudioContext;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(740, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.08);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  } catch {
    // Bloqueio de autoplay ou ambiente sem áudio: silencioso.
  }
}

export function notifyDesktopChatMessage(senderName: string, body: string): void {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  const showLocal = () => {
    try {
      const preview = body.trim().slice(0, 140) || "Nova mensagem recebida";
      new Notification(`Chat de suporte — ${senderName}`, {
        body: preview,
        tag: "discovery-support-chat",
      });
    } catch {
      // Algumas webviews não permitem new Notification() direto.
    }
  };

  // Se o navegador já possui inscrição Web Push ativa, o servidor entregará a
  // notificação via Service Worker — evita exibir duas notificações para a mesma mensagem.
  const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
  if (sw && typeof sw.getRegistration === "function") {
    void sw
      .getRegistration()
      .then((reg) => reg?.pushManager?.getSubscription?.() ?? null)
      .then((sub) => {
        if (!sub) showLocal();
      })
      .catch(() => {
        showLocal();
      });
    return;
  }

  showLocal();
}
