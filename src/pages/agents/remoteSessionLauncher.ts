import {
  remoteSessionsApi,
  type StartRemoteSessionRequest,
} from "@/api/remote-sessions";
import { realtimeConfig } from "@/config/realtime";
import { getApiAccessToken, ApiError } from "@/api/client";

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
  transport: "nats",
  quality: "high",
  codec: "jpeg",
  durationMinutes: 30,
  // Força a sobreposição de sessões ativas existentes (1 sessão por agente).
  // O backend fecha as sessões antigas com motivo "overridden-by-new-session".
  force: true,
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
  accessToken?: string | null;
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
  // Passa o access token JWT da aba pai para a popup, pois sessionStorage
  // é isolado por janela e a popup não teria acesso aos tokens de autenticação.
  if (params.accessToken) {
    query.set("accessToken", params.accessToken);
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
  } catch (err) {
    // 401 indica sessão órfã ou problema de autorização — faz cleanup e reporta
    if (err instanceof ApiError && err.status === 401) {
      console.error("[RemoteSession] Erro de autorização ao obter TURN — encerrando sessão", {
        sessionId: session.sessionId,
        agentId,
      });
      try {
        await remoteSessionsApi.stopSession(agentId, session.sessionId);
      } catch {
        // cleanup best-effort
      }
      throw new Error(
        "Sessão remota inválida (possível bug no servidor). A sessão foi encerrada. Tente novamente.",
      );
    }
    // Outros erros (ex: TURN não configurado, rede) — prossegue sem credenciais
    console.warn("[RemoteSession] TURN credentials indisponíveis:", err);
  }

  // Credenciais NATS (fluxo futuro — atualmente usa JWT emitido pelo backend)
  const jwt = undefined;
  const nkeySeed = undefined;

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
      accessToken: getApiAccessToken(),
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
