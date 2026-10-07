import { useWebPush } from "@/hooks/useWebPush";

/**
 * Mantem o estado do Web Push sincronizado com a sessao em toda a aplicacao
 * (inclusive desfazendo a inscricao local no logout). Nao renderiza nada.
 */
export function BrowserPushManager() {
  useWebPush();
  return null;
}
