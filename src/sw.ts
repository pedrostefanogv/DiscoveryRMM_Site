/// <reference lib="webworker" />
/**
 * Service Worker do console Discovery RMM.
 *
 * Responsabilidades:
 *  - precache do shell da SPA (Workbox) com fallback de navegacao;
 *  - exibir notificacoes de Web Push mesmo com o console fechado;
 *  - abrir/focar o console na rota correta ao clicar na notificacao.
 *
 * Gerado pelo vite-plugin-pwa com a estrategia injectManifest.
 */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { clientsClaim } from "workbox-core";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  severity?: string;
  notificationId?: string;
  eventType?: string;
  topic?: string;
}

const DEFAULT_TITLE = "Discovery RMM";
const DEFAULT_BODY = "Voce tem uma nova notificacao no console.";
const ICON = "/pwa-192x192.png";

self.skipWaiting();
clientsClaim();

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Rotas de API/docs/realtime nao podem cair no fallback da SPA.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [
      /^\/api\//,
      /^\/hubs\//,
      /^\/nats\//,
      /^\/openapi(?:\/|$)/,
      /^\/scalar(?:\/|$)/,
    ],
  }),
);

self.addEventListener("push", (event) => {
  const payload = readPayload(event);
  const title = normalize(payload.title) ?? DEFAULT_TITLE;
  const body = normalize(payload.body) ?? DEFAULT_BODY;
  const url = normalize(payload.url) ?? "/";
  const tag = normalize(payload.tag) ?? normalize(payload.notificationId) ?? "discovery-notification";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      // ICON precisa existir em public/ (o build valida isso em verify-build.mjs):
      // sem o arquivo o navegador exibe a notificacao sem icone.
      icon: ICON,
      lang: "pt-BR",
      // Sem "badge": o Android usa apenas o canal alfa do badge e nossos PNGs
      // sao opacos — o resultado seria um bloco solido na barra de status.
      data: { url, severity: payload.severity ?? null, eventType: payload.eventType ?? null },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = (event.notification.data ?? {}) as { url?: string };
  const target = resolveUrl(data.url);

  event.waitUntil(focusOrOpen(target));
});

function readPayload(event: PushEvent): PushPayload {
  try {
    const parsed = event.data?.json() as PushPayload | undefined;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // Payload nao-JSON: cai no texto puro abaixo.
  }

  const text = event.data?.text();
  return text ? { body: text } : {};
}

function normalize(value: string | undefined | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveUrl(value: string | undefined): string {
  const fallback = new URL("/", self.location.origin);
  const candidate = normalize(value);
  if (!candidate) return fallback.toString();

  try {
    const parsed = new URL(candidate, self.location.origin);
    return parsed.origin === self.location.origin ? parsed.toString() : fallback.toString();
  } catch {
    return fallback.toString();
  }
}

async function focusOrOpen(url: string): Promise<void> {
  const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

  for (const client of clientList) {
    if (new URL(client.url).origin !== self.location.origin) continue;

    const windowClient = client as WindowClient;
    try {
      await windowClient.focus();
      await windowClient.navigate(url);
      return;
    } catch {
      // Segue para openWindow se o navigate nao for permitido.
    }
  }

  await self.clients.openWindow(url);
}

export {};
