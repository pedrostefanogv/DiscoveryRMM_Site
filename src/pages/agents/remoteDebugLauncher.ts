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

interface ConsoleUrlParams {
  sessionId: string;
  agentId: string;
  subject: string;
  natsUrl?: string | null;
  expiresAtUtc: string;
  jwt?: string;
  nkeySeed?: string;
  controlSubject?: string | null;
  pingIntervalSeconds?: number;
  missedPingsBeforeClose?: number;
  initialGraceSeconds?: number;
  keepAliveSeconds?: number;
}

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
  if (params.jwt) {
    query.set("jwt", params.jwt);
  }
  if (params.nkeySeed) {
    query.set("nkeySeed", params.nkeySeed);
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

export async function openRemoteDebugPopup({
  agentId,
  payload,
}: OpenRemoteDebugParams) {
  const session = await agentsApi.startRemoteDebugSession(agentId, {
    ...DEFAULT_PAYLOAD,
    ...payload,
  });

  const natsSubject = session.natsTenantSubject;
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

  let jwt: string | undefined;
  let nkeySeed: string | undefined;
  try {
    const creds = await agentsApi.getRemoteDebugNatsCredentials(
      agentId,
      session.sessionId,
    );
    jwt = creds.jwt;
    nkeySeed = creds.nkeySeed;
  } catch {
    // Endpoint pode nao existir ainda no backend — prossegue sem credentials JWT.
  }

  const popup = window.open(
    toConsoleUrl({
      sessionId: session.sessionId,
      agentId: session.agentId,
      subject: natsSubject,
      natsUrl: session.natsWssUrl,
      expiresAtUtc: session.expiresAtUtc,
      jwt,
      nkeySeed,
      controlSubject: session.natsControlSubject ?? null,
      pingIntervalSeconds: session.pingIntervalSeconds,
      missedPingsBeforeClose: session.missedPingsBeforeClose,
      initialGraceSeconds: session.initialGraceSeconds,
      keepAliveSeconds: session.keepAliveSeconds,
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
