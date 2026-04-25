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
  preferredTransport: "signalr",
  ttlMinutes: 20,
};

function toConsoleUrl(params: {
  sessionId: string;
  agentId: string;
  signalRHub: string;
  expiresAtUtc: string;
}) {
  const query = new URLSearchParams({
    sessionId: params.sessionId,
    agentId: params.agentId,
    hubUrl: params.signalRHub,
    expiresAt: params.expiresAtUtc,
  });

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

  const popup = window.open(
    toConsoleUrl({
      sessionId: session.sessionId,
      agentId: session.agentId,
      signalRHub: session.signalRHub,
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
