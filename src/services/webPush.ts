import { pushApi, type PushTestResult, type RegisterPushSubscriptionRequest } from "@/api/push";

/**
 * Estado compartilhado do Web Push (notificacoes do navegador).
 *
 * Fica fora do React porque o ciclo de vida e do NAVEGADOR, nao de um
 * componente: a inscricao precisa sobreviver a navegacao e ser desfeita no
 * logout. Componentes consomem via useWebPush (useSyncExternalStore).
 */
export type WebPushStatus =
  | "loading"
  | "unsupported"
  | "server-disabled"
  | "denied"
  | "prompt"
  | "subscribed"
  | "error";

export interface WebPushState {
  status: WebPushStatus;
  /** Inscricoes do usuario conhecidas pelo servidor. */
  subscriptionCount: number;
  busy: boolean;
  error: string | null;
  lastTest: PushTestResult | null;
}

const INITIAL_STATE: WebPushState = {
  status: "loading",
  subscriptionCount: 0,
  busy: false,
  error: null,
  lastTest: null,
};

const SW_READY_TIMEOUT_MS = 8_000;

let state: WebPushState = INITIAL_STATE;
const listeners = new Set<() => void>();
let refreshInFlight: Promise<void> | null = null;

function setState(patch: Partial<WebPushState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function subscribeWebPush(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getWebPushSnapshot(): WebPushState {
  return state;
}

export function isWebPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function toMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Nao foi possivel configurar as notificacoes do navegador.";
}

/**
 * Aguarda um Service Worker ativo sem travar quando ele nao esta registrado
 * (em dev o PWA fica desligado por padrao e navigator.serviceWorker.ready nunca resolve).
 */
async function getReadyRegistration(timeoutMs = SW_READY_TIMEOUT_MS): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;

  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;

  return Promise.race<ServiceWorkerRegistration | null>([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), timeoutMs);
    }),
  ]);
}

/** VAPID usa base64url sem padding; a Push API exige bytes. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }

  return output;
}

function toRegisterRequest(subscription: PushSubscription): RegisterPushSubscriptionRequest {
  const json = subscription.toJSON() as { keys?: { p256dh?: string; auth?: string } };

  return {
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
    userAgent: navigator.userAgent,
  };
}

/**
 * Reconfere o estado real (suporte, servidor, permissao, inscricao) e garante
 * que o servidor conhece este navegador. Deduplicado por requisicao em voo.
 */
export function refreshWebPushState(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = doRefresh().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

async function doRefresh(): Promise<void> {
  if (!isWebPushSupported()) {
    setState({ status: "unsupported", busy: false, error: null });
    return;
  }

  try {
    const config = await pushApi.getConfig();

    if (!config.enabled || !config.vapidPublicKey) {
      setState({ status: "server-disabled", subscriptionCount: config.subscriptionCount, error: null });
      return;
    }

    if (Notification.permission === "denied") {
      setState({ status: "denied", subscriptionCount: config.subscriptionCount, error: null });
      return;
    }

    const registration = await getReadyRegistration();
    const subscription = registration ? await registration.pushManager.getSubscription() : null;

    if (!subscription) {
      setState({ status: "prompt", subscriptionCount: config.subscriptionCount, error: null });
      return;
    }

    // Upsert idempotente: mantem a inscricao vinculada ao usuario atual e
    // atualiza chaves rotacionadas pelo navegador.
    await pushApi.subscribe(toRegisterRequest(subscription));

    setState({
      status: "subscribed",
      subscriptionCount: Math.max(config.subscriptionCount, 1),
      busy: false,
      error: null,
    });
  } catch (error) {
    setState({ status: "error", busy: false, error: toMessage(error) });
  }
}

/** Pede permissao e inscreve este navegador (precisa de gesto do usuario). */
export async function enableWebPush(): Promise<void> {
  if (!isWebPushSupported()) {
    setState({ status: "unsupported", busy: false });
    return;
  }

  setState({ busy: true, error: null });

  try {
    const config = await pushApi.getConfig();
    if (!config.enabled || !config.vapidPublicKey) {
      setState({ status: "server-disabled", busy: false, subscriptionCount: config.subscriptionCount });
      return;
    }

    const permission =
      Notification.permission === "granted" ? "granted" : await Notification.requestPermission();

    if (permission !== "granted") {
      setState({ status: "denied", busy: false, error: null });
      return;
    }

    const registration = await getReadyRegistration();
    if (!registration) {
      throw new Error(
        "Service Worker indisponivel. Em desenvolvimento e preciso habilitar o PWA (devOptions).",
      );
    }

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey),
      });
    }

    await pushApi.subscribe(toRegisterRequest(subscription));

    setState({
      status: "subscribed",
      busy: false,
      error: null,
      subscriptionCount: Math.max(config.subscriptionCount, 1),
    });
  } catch (error) {
    setState({ status: "error", busy: false, error: toMessage(error) });
  }
}

/** Remove a inscricao no servidor e no navegador. */
export async function disableWebPush(): Promise<void> {
  if (!isWebPushSupported()) return;

  setState({ busy: true, error: null });

  try {
    const registration = await getReadyRegistration(3_000);
    const subscription = registration ? await registration.pushManager.getSubscription() : null;

    if (subscription) {
      try {
        await pushApi.unsubscribe(subscription.endpoint);
      } catch {
        // Mesmo sem confirmacao do servidor, o unsubscribe local interrompe a entrega.
      }
      await subscription.unsubscribe();
    }

    // O usuario pode ter outros dispositivos inscritos: consulta o total real
    // em vez de assumir zero.
    let subscriptionCount = 0;
    try {
      const config = await pushApi.getConfig();
      subscriptionCount = config.subscriptionCount;
    } catch {
      // Sem resposta do servidor mantem 0 (o proximo refresh corrige).
    }

    setState({ status: "prompt", busy: false, subscriptionCount, error: null });
  } catch (error) {
    setState({ status: "error", busy: false, error: toMessage(error) });
  }
}

/** Envia um push de teste para as inscricoes do usuario. */
export async function sendTestPush(): Promise<PushTestResult> {
  const result = await pushApi.sendTest();
  setState({ lastTest: result });
  return result;
}

/**
 * Desfaz a inscricao local no logout (best-effort). Sem token nao ha DELETE no
 * servidor; o registro remoto e reaproveitado/limpo no proximo login ou no
 * envio (HTTP 410).
 */
export async function teardownWebPush(): Promise<void> {
  try {
    if (isWebPushSupported()) {
      const registration = await getReadyRegistration(2_000);
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      if (subscription) await subscription.unsubscribe();
    }
  } catch {
    // best-effort
  }

  state = INITIAL_STATE;
  listeners.forEach((listener) => listener());
}
