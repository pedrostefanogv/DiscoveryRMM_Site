import { useCallback, useEffect, useRef, useState } from "react";
import {
  createNatsService,
  type DashboardEvent,
  type NatsService,
} from "@/api/nats";
import { remoteSessionsApi } from "@/api/remote-sessions";
import {
  buildViewerRemoteControlEnvelope,
  decodeRemoteControlEnvelope,
  isOwnRemoteControlEnvelope,
  toLivenessConnectionState,
} from "@/api/remoteSessionControl";
import {
  useSessionLiveness,
  type SessionLivenessStatus,
} from "@/hooks/useSessionLiveness";

export type RemoteSessionConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed";

export interface UseRemoteSessionLivenessOptions {
  enabled: boolean;
  agentId: string;
  sessionId: string;
  natsSubject?: string;
  natsUrl?: string;
  jwt?: string;
  nkeySeed?: string;
  credsExpiresAtUtc?: string;
  pingIntervalSeconds?: number;
  missedPingsBeforeClose?: number;
  initialGraceSeconds?: number;
  keepAliveSeconds?: number;
  onStatus?: (status: SessionLivenessStatus) => void;
  onPeerLost?: () => void;
  onExpired?: (reason: string) => void;
  onKeepAlive?: (expiresAtUtc: string, maxExpiresAtUtc?: string | null) => void;
}

export interface RemoteSessionLivenessState {
  status: SessionLivenessStatus;
  connectionState: RemoteSessionConnectionState;
  errorMessage: string | null;
}

/**
 * Liveness de uma sessao de acesso remoto. Reutiliza o nucleo
 * useSessionLiveness (ping/watchdog/keepalive) e adiciona o transporte: uma
 * conexao NATS ISOLADA por sessao, assinada no subject .control.
 *
 * Cada aba/sessao tem credenciais escopadas proprias, por isso NAO usa o
 * singleton getNatsService (que so admite um conjunto de credenciais).
 */
export function useRemoteSessionLiveness(
  options: UseRemoteSessionLivenessOptions,
): RemoteSessionLivenessState {
  const { enabled, agentId, sessionId, natsSubject, natsUrl, jwt, nkeySeed } =
    options;
  const [connectionState, setConnectionState] =
    useState<RemoteSessionConnectionState>("closed");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const serviceRef = useRef<NatsService | null>(null);
  const notePeerSignalRef = useRef<() => void>(() => {});
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const active = enabled && !!sessionId && !!natsSubject && !!natsUrl && !!jwt;

  const sendPing = useCallback(
    (sequence: number) => {
      const service = serviceRef.current;
      if (!service || !natsSubject) return;
      const envelope = buildViewerRemoteControlEnvelope(
        "ping",
        sessionId,
        sequence,
      );
      void service
        .publish(
          natsSubject + ".control",
          envelope as unknown as Record<string, unknown>,
        )
        .catch(() => {
          // Falha ao publicar o ping e tolerada: o agente tambem envia o seu e
          // a ausencia real aparece na falta de resposta.
        });
    },
    [sessionId, natsSubject],
  );

  const keepAlive = useCallback(async () => {
    const result = await remoteSessionsApi.renewSession(agentId, sessionId);
    return {
      expiresAtUtc: result.expiresAtUtc,
      maxExpiresAtUtc: result.maxExpiresAtUtc ?? null,
      sessionActive: result.sessionActive ?? result.status === "active",
      endReason: result.endReason ?? null,
    };
  }, [agentId, sessionId]);

  const liveness = useSessionLiveness({
    enabled: active,
    sessionId,
    connectionState,
    pingIntervalSeconds: options.pingIntervalSeconds,
    missedPingsBeforeClose: options.missedPingsBeforeClose,
    initialGraceSeconds: options.initialGraceSeconds,
    keepAliveSeconds: options.keepAliveSeconds,
    sendPing,
    keepAlive,
    onStatus: (status) => optionsRef.current.onStatus?.(status),
    onPeerLost: () => optionsRef.current.onPeerLost?.(),
    onExpired: (reason) => optionsRef.current.onExpired?.(reason),
    onKeepAlive: (result) =>
      optionsRef.current.onKeepAlive?.(
        result.expiresAtUtc,
        result.maxExpiresAtUtc,
      ),
  });
  notePeerSignalRef.current = liveness.notePeerSignal;

  useEffect(() => {
    if (!active || !natsSubject || !natsUrl || !jwt) {
      setConnectionState("closed");
      return;
    }

    let disposed = false;
    setConnectionState("connecting");
    setErrorMessage(null);

    const controlSubject = natsSubject + ".control";
    const subscribeSubjects = [natsSubject, controlSubject];
    const service = createNatsService({
      url: natsUrl,
      enabled: true,
      // Sempre credenciais JWT escopadas da sessao: a rota global do dashboard
      // autentica com o token da API e ignora a allow-list do subject.
      authMode: "jwt_credentials",
      credentialsProvider: async () => {
        const fresh = await remoteSessionsApi.getSessionCredentials(
          agentId,
          sessionId,
        );
        return {
          jwt: fresh.jwt,
          nkeySeed: fresh.nkeySeed,
          publicKey: "",
          expiresAtUtc: fresh.expiresAtUtc,
          publishSubjects: [],
          subscribeSubjects,
        };
      },
      scopeMode: "preserve",
    });
    serviceRef.current = service;

    service.setPreSuppliedCredentials({
      jwt,
      nkeySeed: nkeySeed ?? "",
      publicKey: "",
      // A expiracao e do JWT, nao da sessao: usar a da sessao fazia o servico
      // reemitir credenciais pela rota global.
      expiresAtUtc:
        options.credsExpiresAtUtc ??
        new Date(Date.now() + 60 * 60_000).toISOString(),
      publishSubjects: [],
      subscribeSubjects,
    });

    const offState = service.onConnectionStateChange((state) => {
      if (disposed) return;
      setConnectionState(toLivenessConnectionState(state));
    });

    const onControl = (message: DashboardEvent | Record<string, unknown>) => {
      if (disposed) return;
      const data =
        "data" in message && (message as DashboardEvent).data
          ? (message as DashboardEvent).data
          : message;
      const envelope = decodeRemoteControlEnvelope(data);
      if (!envelope) return;
      if (isOwnRemoteControlEnvelope(envelope, "viewer")) return;
      // O legado ({action:"keyframe"}) nao carrega sessionId; o subject ja e o
      // da propria sessao.
      if (envelope.sessionId && envelope.sessionId !== sessionId) return;

      notePeerSignalRef.current();

      if (envelope.type === "closed") {
        const reason =
          typeof envelope.payload?.reason === "string"
            ? envelope.payload.reason
            : "encerrada";
        optionsRef.current.onExpired?.(reason);
      }
    };

    void (async () => {
      const connected = await service.connect();
      if (disposed) return;
      if (!connected) {
        setConnectionState("closed");
        setErrorMessage(
          "Nao foi possivel conectar ao canal de controle da sessao.",
        );
        return;
      }

      const subscribed = await service.subscribe(controlSubject, onControl, {
        connectIfNeeded: false,
      });
      if (disposed) return;
      if (!subscribed) {
        setConnectionState("closed");
        setErrorMessage(
          "Canal de controle indisponivel; a sessao nao renovara sozinha.",
        );
        return;
      }
      setConnectionState("connected");
    })();

    return () => {
      disposed = true;
      offState();
      try {
        service.unsubscribe(controlSubject, onControl);
      } catch {
        // teardown best-effort
      }
      void service.dispose().catch(() => {});
      if (serviceRef.current === service) serviceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    active,
    agentId,
    sessionId,
    natsSubject,
    natsUrl,
    jwt,
    nkeySeed,
    options.credsExpiresAtUtc,
  ]);

  return {
    status: liveness.status,
    connectionState,
    errorMessage,
  };
}
