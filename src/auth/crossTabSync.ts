/**
 * Sincronização de autenticação entre abas/janelas via BroadcastChannel.
 *
 * Problema resolvido:
 * - sessionStorage é isolado por aba → tokens NÃO são compartilhados
 * - Quando uma aba faz refresh do token, as outras abas não recebem o novo token
 * - A janela popup de acesso remoto não tem refreshToken e não pode renovar
 * - O detector de inatividade da aba principal não sabe que o usuário está ativo no popup
 *
 * Solução:
 * - Canal de broadcast `discovery:auth:v1` para sincronizar tokens, logout e atividade
 * - A aba principal transmite novos tokens quando faz refresh
 * - A popup de acesso remoto transmite pings de atividade para manter a aba principal viva
 * - Todas as abas escutam e atualizam seus tokens quando recebem TOKEN_REFRESHED
 */

const CHANNEL_NAME = 'discovery:auth:v1';

export type CrossTabMessage =
    | { type: 'TOKEN_REFRESHED'; accessToken: string; refreshToken: string; expiresAt: number }
    | { type: 'LOGOUT' }
    | { type: 'ACTIVITY_PING'; timestamp: number }
    | { type: 'TOKEN_REQUEST' }; // uma aba pede os tokens atuais (ex: popup abriu depois do refresh)

export type CrossTabListener = (message: CrossTabMessage) => void;

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel {
    if (!channel) {
        channel = new BroadcastChannel(CHANNEL_NAME);
    }
    return channel;
}

/**
 * Registra um listener para mensagens cross-tab.
 * Retorna uma função de cleanup.
 */
export function onCrossTabMessage(listener: CrossTabListener): () => void {
    const ch = getChannel();
    const handler = (event: MessageEvent<CrossTabMessage>) => {
        listener(event.data);
    };
    ch.addEventListener('message', handler);
    return () => ch.removeEventListener('message', handler);
}

/**
 * Envia uma mensagem para todas as outras abas/janelas.
 */
export function postCrossTabMessage(message: CrossTabMessage): void {
    getChannel().postMessage(message);
}

/**
 * Hook para broadcast de atividade (usado na popup de acesso remoto).
 * Envia ACTIVITY_PING a cada `intervalMs` para manter a aba principal viva.
 * Retorna função de cleanup.
 */
export function startActivityPing(intervalMs: number = 10_000): () => void {
    const intervalId = window.setInterval(() => {
        postCrossTabMessage({ type: 'ACTIVITY_PING', timestamp: Date.now() });
    }, intervalMs);

    // Envia um ping imediatamente
    postCrossTabMessage({ type: 'ACTIVITY_PING', timestamp: Date.now() });

    return () => window.clearInterval(intervalId);
}
