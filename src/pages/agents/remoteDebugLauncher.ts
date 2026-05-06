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
  logLevel: "info",
  preferredTransport: "nats",
  ttlMinutes: 20,
};

function toConsoleUrl(params: {
  sessionId: string;
  agentId: string;
  natsSubject: string;
  natsUrl?: string | null;
  expiresAtUtc: string;
}) {
  const query = new URLSearchParams({
    sessionId: params.sessionId,
    agentId: params.agentId,
    subject: params.natsSubject,
    expiresAt: params.expiresAtUtc,
  });

  if (params.natsUrl) {
    query.set("natsUrl", params.natsUrl);
  }

  return `/agents/remote-debug-console?${query.toString()}`;
}

export async function openRemoteDebugPopup({
  agentId,
  payload,
}: OpenRemoteDebugParams) {
  const session = await agentsApi.startRemoteDebugSession(agentId, {
    ...DEFAULT_PAYLOAD,
    ...payload,
  });

  const natsSubject = session.natsTenantSubject ?? session.natsLegacySubject;
  if (!natsSubject) {
    try {
      await agentsApi.stopRemoteDebugSession(agentId, session.sessionId);
    } catch {
      // Mantem o erro principal para a UI.
    }

    throw new Error(
      "Sessão de remote debug criada sem subject NATS. Verifique a configuração do backend.",
    );
  }

  const popup = window.open(
    toConsoleUrl({
      sessionId: session.sessionId,
      agentId: session.agentId,
      natsSubject,
      natsUrl: session.natsWssUrl,
      expiresAtUtc: session.expiresAtUtc,
    }),
    `rdebug-${session.sessionId}`,
    "width=980,height=700,toolbar=no,menubar=no,scrollbars=no,resizable=yes,location=no,status=no",
  );

  if (!popup) {
    // Evita deixar sessão ativa quando o navegador bloqueia popup.
    try {
      await agentsApi.stopRemoteDebugSession(agentId, session.sessionId);
    } catch {
      // Mantem o erro principal para a UI.
    }
    throw new PopupBlockedError(
      "Popup bloqueada pelo navegador. Permita popups para abrir o console de debug.",
    );
  }

  popup.focus();
  return session;
}
