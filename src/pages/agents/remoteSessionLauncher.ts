import {
  remoteSessionsApi,
  type StartRemoteSessionRequest,
} from "@/api/remote-sessions";
import { realtimeConfig } from "@/config/realtime";

export interface OpenRemoteSessionParams {
  agentId: string;
  kind?: StartRemoteSessionRequest["kind"];
  transport?: StartRemoteSessionRequest["transport"];
  quality?: StartRemoteSessionRequest["quality"];
  codec?: StartRemoteSessionRequest["codec"];
  durationMinutes?: number;
}

export class PopupBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PopupBlockedError";
  }
}

const DEFAULT_PARAMS: Partial<StartRemoteSessionRequest> = {
  kind: "screen",
  transport: "webrtc",
  quality: "high",
  codec: "jpeg",
  durationMinutes: 30,
};

interface SessionUrlParams {
  sessionId: string;
  agentId: string;
  natsSubject: string;
  kind: string;
  transport: string;
  quality: string;
  codec: string;
  natsWssUrl?: string | null;
  expiresAtUtc: string;
  turnCredentials?: {
    urls: string[];
    username: string;
    credential: string;
    ttlSeconds: number;
  } | null;
  jwt?: string;
  nkeySeed?: string;
}

function toSessionUrl(params: SessionUrlParams): string {
  const query = new URLSearchParams({
    sessionId: params.sessionId,
    agentId: params.agentId,
    natsSubject: params.natsSubject,
    kind: params.kind,
    transport: params.transport,
    quality: params.quality,
    codec: params.codec,
    expiresAt: params.expiresAtUtc,
  });

  if (params.natsWssUrl) {
    query.set("natsUrl", params.natsWssUrl);
  }
  if (params.jwt) {
    query.set("jwt", params.jwt);
  }
  if (params.nkeySeed) {
    query.set("nkeySeed", params.nkeySeed);
  }
  if (params.turnCredentials) {
    query.set("turnUrls", params.turnCredentials.urls.join(","));
    query.set("turnUsername", params.turnCredentials.username);
    query.set("turnCredential", params.turnCredentials.credential);
    query.set("turnTtl", String(params.turnCredentials.ttlSeconds));
  }

  return `/agents/remote-session?${query.toString()}`;
}

export async function openRemoteSessionPopup({
  agentId,
  kind,
  transport,
  quality,
  codec,
  durationMinutes,
}: OpenRemoteSessionParams) {
  const request = {
    ...DEFAULT_PARAMS,
    ...(kind ? { kind } : {}),
    ...(transport ? { transport } : {}),
    ...(quality ? { quality } : {}),
    ...(codec ? { codec } : {}),
    ...(durationMinutes ? { durationMinutes } : {}),
    agentId,
  } as StartRemoteSessionRequest;

  let session: Awaited<ReturnType<typeof remoteSessionsApi.startSession>>;
  try {
    session = await remoteSessionsApi.startSession(agentId, request);
  } catch (err) {
    throw new Error(
      `Falha ao iniciar sessão remota: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const natsSubject = session.natsSubject;
  if (!natsSubject) {
    try {
      await remoteSessionsApi.stopSession(agentId, session.sessionId);
    } catch {
      // Mantém o erro principal para a UI
    }
    throw new Error(
      "Sessão remota criada sem subject NATS. Verifique a configuração do backend.",
    );
  }

  // Obtém credenciais NATS (opcional — o fluxo atual usa o JWT emitido pelo servidor)
  let jwt: string | undefined;
  let nkeySeed: string | undefined;

  // Obtém credenciais TURN
  let turnCredentials: SessionUrlParams["turnCredentials"] = null;
  try {
    const turn = await remoteSessionsApi.getTurnCredentials(
      agentId,
      session.sessionId,
    );
    turnCredentials = {
      urls: turn.urls,
      username: turn.username,
      credential: turn.credential,
      ttlSeconds: turn.ttlSeconds,
    };
  } catch {
    // TURN pode não estar configurado — prossegue sem
  }

  const popup = window.open(
    toSessionUrl({
      sessionId: session.sessionId,
      agentId: session.agentId,
      natsSubject,
      kind: session.kind,
      transport: session.transport,
      quality: session.qualityProfile,
      codec: session.codec,
      natsWssUrl: session.natsWssUrl ?? realtimeConfig.natsUrl,
      expiresAtUtc: session.expiresAtUtc,
      turnCredentials,
      jwt,
      nkeySeed,
    }),
    `remote-${session.sessionId}`,
    "width=1024,height=768,toolbar=no,menubar=no,scrollbars=no,resizable=yes,location=no,status=no",
  );

  if (!popup) {
    try {
      await remoteSessionsApi.stopSession(agentId, session.sessionId);
    } catch {
      // Mantém o erro principal para a UI
    }
    throw new PopupBlockedError(
      "Popup bloqueada pelo navegador. Permita popups para abrir o acesso remoto.",
    );
  }

  popup.focus();
  return session;
}
