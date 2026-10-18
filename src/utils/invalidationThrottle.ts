import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Invalidação de queries com coalescência, compartilhada entre hooks.
 *
 * Contexto (dashboard da página inicial):
 * - `useDashboardRealtime` invalidava `["dashboard", <escopo>, <janela>]` a CADA
 *   evento NATS, sem nenhum limite;
 * - `useAgentStatusNats` (montado no MainLayout) invalidava o prefixo
 *   `["dashboard"]` a cada heartbeat, com um throttle próprio.
 *
 * Os dois estados de throttle viviam em closures diferentes, então o mesmo
 * evento disparava DUAS invalidações da mesma query ativa — e a segunda chegava
 * em ~4 ms, cancelando/repetindo a primeira. Resultado observado no HAR:
 * /dashboard/global/summary a cada ~15 s (e duas entradas por ciclo), quase
 * sempre com o MESMO corpo, porque o backend responde de um cache de 45 s.
 *
 * Este módulo resolve três coisas de uma vez:
 * 1. estado compartilhado por QueryClient (dois hooks, um único throttle);
 * 2. coalescência com "trailing edge": uma rajada de eventos gera no máximo uma
 *    requisição por janela E a última invalidação da janela não é perdida
 *    (o throttle antigo simplesmente descartava o evento);
 * 3. aba em segundo plano não gera tráfego: as queries só são marcadas como
 *    stale e a atualização é disparada quando a aba volta a ficar visível.
 */

type RefetchType = "active" | "inactive" | "all" | "none";

interface ThrottleState {
  /** Última vez (ms) que a invalidação de cada chave foi executada. */
  lastRunAt: Map<string, number>;
  /** Timer do "trailing edge" pendente de cada chave. */
  timers: Map<string, ReturnType<typeof setTimeout>>;
  /** Chaves que precisam de refresh quando a aba voltar a ficar visível. */
  hiddenKeys: Map<string, QueryKey>;
  visibilityWatched: boolean;
}

const stateByClient = new WeakMap<QueryClient, ThrottleState>();

function getState(queryClient: QueryClient): ThrottleState {
  let state = stateByClient.get(queryClient);
  if (!state) {
    state = {
      lastRunAt: new Map(),
      timers: new Map(),
      hiddenKeys: new Map(),
      visibilityWatched: false,
    };
    stateByClient.set(queryClient, state);
  }
  return state;
}

function serializeKey(queryKey: QueryKey): string {
  return JSON.stringify(queryKey);
}

function isDocumentHidden(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof document.visibilityState === "string" &&
    document.visibilityState === "hidden"
  );
}

function runInvalidation(
  queryClient: QueryClient,
  queryKey: QueryKey,
  refetchType: RefetchType,
): void {
  void queryClient.invalidateQueries({ queryKey, refetchType });
}

function clearTimer(state: ThrottleState, key: string): void {
  const timer = state.timers.get(key);
  if (timer === undefined) return;
  clearTimeout(timer);
  state.timers.delete(key);
}

function watchVisibility(queryClient: QueryClient, state: ThrottleState): void {
  if (state.visibilityWatched || typeof document === "undefined") return;
  state.visibilityWatched = true;

  document.addEventListener("visibilitychange", () => {
    if (isDocumentHidden()) return;
    if (state.hiddenKeys.size === 0) return;

    const pending = [...state.hiddenKeys.values()];
    state.hiddenKeys.clear();
    for (const queryKey of pending) {
      state.lastRunAt.set(serializeKey(queryKey), Date.now());
      runInvalidation(queryClient, queryKey, "active");
    }
  });
}

/**
 * Invalida `queryKey` respeitando um intervalo mínimo por chave.
 *
 * - Se o intervalo já passou, invalida imediatamente (leading edge).
 * - Se ainda não passou, agenda UMA invalidação para o fim da janela
 *   (trailing edge) em vez de descartar o evento.
 * - Com a aba oculta, não gera requisição: marca como stale e guarda a chave
 *   para atualizar quando a aba voltar a ficar visível.
 */
export function invalidateThrottled(
  queryClient: QueryClient,
  queryKey: QueryKey,
  minIntervalMs = 1_500,
  refetchType: RefetchType = "active",
): void {
  const state = getState(queryClient);
  const key = serializeKey(queryKey);
  const now = Date.now();
  const lastRunAt = state.lastRunAt.get(key) ?? 0;
  const elapsed = now - lastRunAt;

  // Aba oculta: nada de rede. Marca como stale e reagenda para quando a aba
  // voltar a ficar visível (o refresh on-visibility é disparado pelo listener).
  if (isDocumentHidden()) {
    watchVisibility(queryClient, state);
    clearTimer(state, key);
    if (state.hiddenKeys.has(key)) return;
    state.hiddenKeys.set(key, queryKey);
    runInvalidation(queryClient, queryKey, "none");
    return;
  }

  if (elapsed >= minIntervalMs) {
    state.hiddenKeys.delete(key);
    clearTimer(state, key);
    state.lastRunAt.set(key, now);
    runInvalidation(queryClient, queryKey, refetchType);
    return;
  }

  if (state.timers.has(key)) return;

  const delay = Math.max(0, minIntervalMs - elapsed);
  const timer = setTimeout(() => {
    state.timers.delete(key);
    state.lastRunAt.set(key, Date.now());
    runInvalidation(queryClient, queryKey, refetchType);
  }, delay);
  state.timers.set(key, timer);
}

/**
 * Cancela invalidações agendadas. Útil em testes e em logout (evita disparar
 * requisições com credenciais já limpas).
 */
export function cancelScheduledInvalidations(queryClient: QueryClient): void {
  const state = stateByClient.get(queryClient);
  if (!state) return;

  for (const timer of state.timers.values()) {
    clearTimeout(timer);
  }
  state.timers.clear();
  state.hiddenKeys.clear();
}
