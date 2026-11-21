/**
 * Lógica do indicador de transporte do acesso remoto.
 *
 * Existe separada do componente de propósito: a classificação dos estados e a
 * mensagem exibida são a parte que precisa de teste unitário, e o selo só as
 * consome. Manter as duas em sincronia evita o pior modo de falha do indicador —
 * exibir "WebRTC" quando a sessão já caiu para NATS, ou vice-versa.
 */

/** Estados publicados pelo agente no canal .control (ação transport_info). */
export const TRANSPORT_STATE_NATS = "nats";
export const TRANSPORT_STATE_WEBRTC = "webrtc";
export const TRANSPORT_STATE_FALLBACK = "webrtc-fallback";

export interface TransportInfo {
  /** nats | webrtc | webrtc-fallback. */
  state: string;
  /** Transporte que o servidor PEDIU (pode diferir do efetivo). */
  requested?: string;
  /** Transporte realmente em uso. */
  active?: string;
  /** Por que não está em WebRTC (vazio quando está). */
  reason?: string;
  hasStun?: boolean;
  hasTurn?: boolean;
  relayOnly?: boolean;
}

export type TransportTone = "success" | "slate" | "warning";

export interface TransportPresentation {
  /** Rótulo curto do selo. */
  label: string;
  /** Cor do selo. */
  tone: TransportTone;
  /** Texto do tooltip: o que está acontecendo e por quê. */
  title: string;
  /** Ícone Material Symbols. */
  icon: string;
}

/**
 * Converte o estado bruto do agente na apresentação do selo.
 *
 * Um estado desconhecido é tratado como NATS, e não como WebRTC: o caminho
 * seguro para EXIBIR é o mesmo princípio do caminho seguro para OPERAR — na
 * dúvida, o operador vê o transporte básico, nunca uma promessa de P2P que pode
 * não ser verdade.
 */
export function describeTransport(info: TransportInfo | null | undefined): TransportPresentation {
  if (!info || !info.state) {
    return {
      label: "NATS",
      tone: "slate",
      icon: "cloud",
      title: "Transporte relayado pelo servidor (NATS).",
    };
  }

  switch (info.state) {
    case TRANSPORT_STATE_WEBRTC:
      return {
        label: "WebRTC",
        tone: "success",
        icon: "bolt",
        title: buildWebRtcTitle(info),
      };

    case TRANSPORT_STATE_FALLBACK:
      // O caso que o operador MAIS precisa enxergar: a sessão funciona, mas não
      // pelo caminho que ele configurou. Por isso o tom é de ATENÇÃO, e não de
      // sucesso nem de erro.
      return {
        label: "NATS (fallback)",
        tone: "warning",
        icon: "swap_horiz",
        title:
          "A sessão caiu para o transporte relayado (NATS) porque o WebRTC não estabeleceu."
          + (info.reason ? ` Motivo: ${info.reason}.` : "")
          + " A sessão continua funcionando normalmente.",
      };

    case TRANSPORT_STATE_NATS:
      return {
        label: "NATS",
        tone: "slate",
        icon: "cloud",
        title:
          "Transporte relayado pelo servidor (NATS)."
          + (info.reason ? ` ${info.reason}.` : ""),
      };

    default:
      return {
        label: "NATS",
        tone: "slate",
        icon: "cloud",
        title: `Estado de transporte desconhecido (${info.state}); assumindo NATS.`,
      };
  }
}

/** Monta o tooltip do estado WebRTC, citando a configuração ICE aplicada. */
function buildWebRtcTitle(info: TransportInfo): string {
  const parts: string[] = ["Conexão direta (peer-to-peer) entre este navegador e o equipamento."];

  if (info.relayOnly) {
    parts.push("Todo o tráfego está forçado pelo servidor TURN (relayOnly).");
  } else if (info.hasTurn) {
    parts.push("TURN configurado para redes com NAT restritivo.");
  } else if (info.hasStun) {
    parts.push("Apenas STUN configurado; redes com NAT simétrico podem não estabelecer.");
  } else {
    parts.push("Nenhum STUN/TURN configurado: só conexões na mesma rede (LAN).");
  }

  return parts.join(" ");
}

/**
 * Lê os kinds autorizados a usar WebRTC a partir da configuração EFETIVA do
 * site (já resolvida com herança servidor → cliente → site pelo backend).
 *
 * Fail-CLOSED: qualquer ausência, tipo errado ou JSON corrompido resulta em
 * lista VAZIA, isto é, nenhuma sessão pede WebRTC. O pedido é uma otimização; na
 * dúvida, o caminho NATS — que sempre funciona — é o escolhido.
 *
 * A política é um blob JSON (`remoteAccessWebRtcPolicyJson`) acompanhado do
 * kill switch booleano (`remoteAccessWebRtcEnabled`); os DOIS precisam estar
 * ligados, exatamente como o agente revalida.
 */
export function resolveWebRtcKinds(effective: unknown): string[] {
  if (!effective || typeof effective !== "object") return [];

  const config = effective as Record<string, unknown>;

  // O kill switch herdável tem precedência: desligado ⇒ nada de WebRTC, mesmo
  // que o blob diga o contrário.
  if (config.remoteAccessWebRtcEnabled !== true) return [];

  const raw = config.remoteAccessWebRtcPolicyJson;
  if (typeof raw !== "string" || !raw.trim()) return [];

  let policy: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    policy = parsed as Record<string, unknown>;
  } catch {
    return [];
  }

  if (policy.enabled !== true) return [];

  const kinds = policy.kinds;
  if (!Array.isArray(kinds)) return [];

  return kinds.filter(
    (k): k is string => typeof k === "string" && (WEBRTC_KIND_CANDIDATES as readonly string[]).includes(k),
  );
}

/**
 * Kinds que o console pode pedir como WebRTC. Precisa espelhar
 * RemoteAccessWebRtcPolicy.AllowedKinds do backend — se divergirem, o operador
 * salva uma política que a API recusa.
 *
 * Inclui "all" porque a sessão composta também usa tela. "proxy" entra pelo
 * mesmo motivo do "rdp": são o MESMO SessionTunnel no agente (multiplexação TCP
 * com framing binário de 6 B), e o destino do proxy costuma estar em outra rede
 * — onde o P2P mais ajuda.
 *
 * Terminal e registry ficam FORA: no terminal o gargalo é 1 round-trip com
 * volume de KB/s; no registry a resposta já é paginada em 500 itens porque
 * estouraria o limite do NATS, então o gargalo é o tamanho da página, não o
 * transporte.
 */
export const WEBRTC_KIND_CANDIDATES = ["screen", "rdp", "files", "proxy", "all"] as const;

/**
 * Extrai o bloco de transporte de um frame do canal .control.
 *
 * O agente publica `{ action: "transport_info", transport: {...} }`. Devolve
 * null quando o frame não é do transporte ou não tem a forma esperada — um frame
 * irrelevante não pode virar um selo incorreto.
 */
export function parseTransportControlFrame(raw: unknown): TransportInfo | null {
  if (!raw || typeof raw !== "object") return null;

  const frame = raw as Record<string, unknown>;
  if (frame.action !== "transport_info") return null;

  const transport = frame.transport;
  if (!transport || typeof transport !== "object" || Array.isArray(transport)) return null;

  const info = transport as Record<string, unknown>;
  if (typeof info.state !== "string" || !info.state) return null;

  return {
    state: info.state,
    requested: typeof info.requested === "string" ? info.requested : undefined,
    active: typeof info.active === "string" ? info.active : undefined,
    reason: typeof info.reason === "string" ? info.reason : undefined,
    hasStun: info.hasStun === true,
    hasTurn: info.hasTurn === true,
    relayOnly: info.relayOnly === true,
  };
}

/**
 * Extrai o bloco de transporte de um evento de sessão (`transport` ou
 * `started`), cujo `data` já é o TransportInfo.
 */
export function parseTransportEvent(data: unknown): TransportInfo | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;

  const info = data as Record<string, unknown>;
  if (typeof info.state !== "string" || !info.state) return null;

  return {
    state: info.state,
    requested: typeof info.requested === "string" ? info.requested : undefined,
    active: typeof info.active === "string" ? info.active : undefined,
    reason: typeof info.reason === "string" ? info.reason : undefined,
    hasStun: info.hasStun === true,
    hasTurn: info.hasTurn === true,
    relayOnly: info.relayOnly === true,
  };
}
