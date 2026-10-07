import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/auth/AuthContext";
import {
  getWebPushSnapshot,
  refreshWebPushState,
  subscribeWebPush,
  teardownWebPush,
  type WebPushState,
} from "@/services/webPush";

/**
 * Somente leitura do estado compartilhado do Web Push. Nao depende da sessao —
 * usado por componentes que podem renderizar fora do AuthProvider.
 */
export function useWebPushState(): WebPushState {
  return useSyncExternalStore(subscribeWebPush, getWebPushSnapshot, getWebPushSnapshot);
}

/**
 * Liga o estado do Web Push ao ciclo de sessao: sincroniza ao autenticar e
 * desfaz a inscricao local ao sair. Deve ser montado dentro do AuthProvider.
 */
export function useWebPush(): WebPushState {
  const { isAuthenticated, isBootstrapping } = useAuth();
  const state = useWebPushState();

  useEffect(() => {
    // Durante o bootstrap a sessao ainda esta sendo resolvida: desfazer a
    // inscricao aqui removeria o push de um usuario valido (e ele so voltaria
    // ao normal se reativasse manualmente).
    if (isBootstrapping) return;

    if (isAuthenticated) {
      void refreshWebPushState();
      return;
    }

    void teardownWebPush();
  }, [isAuthenticated, isBootstrapping]);

  return state;
}
