// Janela de frescor do console. Alinhada ao default do servidor
// (ServerConfiguration.AgentOnlineGraceSeconds = 120s): o backend só considera o
// agente Offline depois de now - max(60, grace), então o console não pode dizer
// "Offline" antes disso. Com 90s, agentes na faixa 90s-120s apareciam Offline na
// tela enquanto o servidor ainda os tratava como vivos (e mandava comandos).
// A env VITE_AGENT_OFFLINE_FALLBACK_MS continua tendo precedência.
const DEFAULT_AGENT_OFFLINE_FALLBACK_MS = 120 * 1000;

function parseFallbackMs(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_AGENT_OFFLINE_FALLBACK_MS;
  }
  return parsed;
}

export const AGENT_OFFLINE_FALLBACK_MS = parseFallbackMs(
  import.meta.env.VITE_AGENT_OFFLINE_FALLBACK_MS,
);

/**
 * Sinais aceitos para decidir se um agente está online AGORA.
 *
 * Três fontes, da mais local para a mais autoritativa:
 * - `lastSeenAt`/`lastSeen`: FRESCOR do sinal (heartbeat aplicado na hora pela UI).
 * - `isOnline`: status ONLINE AUTORITATIVO do servidor (Redis) — campo `isOnline` do
 *   payload. Existe porque o estado PERSISTIDO (`status`/`lastSeenAt` no banco) só é
 *   gravado na TRANSIÇÃO de heartbeat e pode estar defasado por design (até ~3 min
 *   para um agente que pulsa a cada ~60s). Quando o payload traz este campo, ele é a
 *   melhor resposta disponível para quem NÃO tem um sinal fresco — ver a ordem de
 *   precedência em isAgentOnlineNow.
 * - `status`: status PERSISTIDO pelo servidor ("Online"/"Offline"), último recurso.
 *
 * ATENÇÃO ao consumir: a ordem de precedência de isAgentOnlineNow continua sendo
 * FRESCOR primeiro. Telas cujo lastSeenAt também é um dado PERSISTIDO (congelado até
 * o próximo fetch) e que precisam que o servidor vença devem tratar `isOnline`
 * explicitamente ANTES de chamar esta função — é o que PatchesPending faz.
 */
export interface AgentStatusLike {
  status?: "Online" | "Offline";
  isOnline?: boolean | null;
  lastSeenAt?: string | null;
  lastSeen?: string | null;
}

export function getAgentLastSeen(agent: AgentStatusLike): string | null {
  return agent.lastSeenAt ?? agent.lastSeen ?? null;
}

/**
 * Decide se o agente está online agora, na ordem de precedência:
 *   1) `lastSeenAt` (ou `lastSeen`) válido → decide pelo FRESCOR;
 *   2) `isOnline` boolean → decide pelo SERVIDOR (campo autoritativo do payload);
 *   3) `status` "Online"/"Offline" → decide pelo status PERSISTIDO;
 *   4) nada disso → false.
 *
 * O frescor vem primeiro para preservar o comportamento das telas que já mandam um
 * `lastSeenAt` fresco (AgentListView, AgentCard, AgentDetail via heartbeat ao vivo):
 * ali o sinal é atualizado a cada heartbeat, então ele é mais novo que qualquer
 * status — inclusive que o `isOnline` do servidor. Quem só tem dado PERSISTIDO
 * (PatchesPending) inverte isso no call site, tratando `isOnline` antes.
 */
export function isAgentOnlineNow(
  agent: AgentStatusLike,
  now = Date.now(),
): boolean {
  const lastSeen = getAgentLastSeen(agent);

  if (lastSeen) {
    const lastSeenMs = new Date(lastSeen).getTime();
    if (Number.isFinite(lastSeenMs)) {
      return now - lastSeenMs <= AGENT_OFFLINE_FALLBACK_MS;
    }
  }

  if (typeof agent.isOnline === "boolean") {
    return agent.isOnline;
  }

  if (agent.status) {
    return agent.status === "Online";
  }

  return false;
}

/**
 * "Possivelmente online": união do sinal de freshness da UI com o status que o
 * SERVIDOR usa para decidir o descomissionamento remoto.
 *
 * Os dois critérios divergem numa janela de ~90s a ~3min (o status no banco só
 * vira Offline depois do TTL do heartbeat + a varredura de expiração). Nessa
 * janela a UI diria "offline" enquanto o servidor manda o comando e o PC é
 * desinstalado. Em confirmações destrutivas usamos o lado seguro: qualquer
 * sinal positivo exige a confirmação forte.
 */
export function isAgentPossiblyOnline(
  agent: AgentStatusLike,
  now = Date.now(),
): boolean {
  if (isAgentOnlineNow(agent, now)) {
    return true;
  }
  return agent.isOnline === true || (agent.status ?? "").toLowerCase() === "online";
}
