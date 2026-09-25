import { agentsApi, type StartRemoteDebugSessionRequest } from "@/api";

export interface OpenRemoteDebugParams {
  agentId: string;
  payload?: StartRemoteDebugSessionRequest;
}

export class PopupBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PopupBlockedError";
  }
}

const DEFAULT_PAYLOAD: StartRemoteDebugSessionRequest = {
  logLevel: "debug",
  preferredTransport: "nats",
  ttlMinutes: 20,
};

const POPUP_FEATURES =
  "width=980,height=700,toolbar=no,menubar=no,scrollbars=no,resizable=yes,location=no,status=no";

interface ConsoleUrlParams {
  sessionId: string;
  agentId: string;
  subject: string;
  natsUrl?: string | null;
  expiresAtUtc: string;
  controlSubject?: string | null;
  pingIntervalSeconds?: number;
  missedPingsBeforeClose?: number;
  initialGraceSeconds?: number;
  keepAliveSeconds?: number;
}

/**
 * Monta a URL do console.
 *
 * NÃO inclui jwt/nkeySeed: o console busca a credencial escopada da sessão via
 * o endpoint dedicado (credentialsProvider do NatsService). Segredo de
 * assinatura em query string vai para histórico/referrer — e a rota global de
 * credenciais não autoriza o subject da sessão.
 */
function toConsoleUrl(params: ConsoleUrlParams) {
  const query = new URLSearchParams({
    sessionId: params.sessionId,
    agentId: params.agentId,
    subject: params.subject,
    expiresAt: params.expiresAtUtc,
  });

  if (params.natsUrl) {
    query.set("natsUrl", params.natsUrl);
  }
  if (params.controlSubject) {
    query.set("controlSubject", params.controlSubject);
  }
  if (typeof params.pingIntervalSeconds === "number") {
    query.set("pingInterval", String(params.pingIntervalSeconds));
  }
  if (typeof params.missedPingsBeforeClose === "number") {
    query.set("misses", String(params.missedPingsBeforeClose));
  }
  if (typeof params.initialGraceSeconds === "number") {
    query.set("grace", String(params.initialGraceSeconds));
  }
  if (typeof params.keepAliveSeconds === "number") {
    query.set("keepAlive", String(params.keepAliveSeconds));
  }

  return `/agents/remote-debug-console?${query.toString()}`;
}

async function stopQuietly(agentId: string, sessionId: string): Promise<void> {
  try {
    await agentsApi.stopRemoteDebugSession(agentId, sessionId);
  } catch {
    // best-effort: mantém o erro principal da UI
  }
}

export async function openRemoteDebugPopup({
  agentId,
  payload,
}: OpenRemoteDebugParams) {
  // 1) Abre a janela SINCRONAMENTE, antes de qualquer await. Popup blockers
  //    estritos barram window.open depois de chamadas de rede (o fluxo antigo
  //    abria após 2 requisições e virava PopupBlockedError).
  const popup = window.open("about:blank", "rdebug-console", POPUP_FEATURES);
  if (!popup) {
    throw new PopupBlockedError(
      "Popup bloqueada pelo navegador. Permita popups para abrir o console de debug.",
    );
  }

  try {
    const session = await agentsApi.startRemoteDebugSession(agentId, {
      ...DEFAULT_PAYLOAD,
      ...payload,
    });

    const natsSubject = session.natsTenantSubject;
    if (!natsSubject) {
      await stopQuietly(agentId, session.sessionId);
      throw new Error(
        "Sessão de remote debug criada sem subject NATS. Verifique a configuração do backend.",
      );
    }

    // 2) Navega a janela já aberta para o console.
    popup.location.href = toConsoleUrl({
      sessionId: session.sessionId,
      agentId: session.agentId,
      subject: natsSubject,
      natsUrl: session.natsWssUrl,
      expiresAtUtc: session.expiresAtUtc,
      controlSubject: session.natsControlSubject ?? null,
      pingIntervalSeconds: session.pingIntervalSeconds,
      missedPingsBeforeClose: session.missedPingsBeforeClose,
      initialGraceSeconds: session.initialGraceSeconds,
      keepAliveSeconds: session.keepAliveSeconds,
    });
    popup.focus();
    return session;
  } catch (error) {
    try {
      popup.close();
    } catch {
      // janela já fechada
    }
    throw error;
  }
}
