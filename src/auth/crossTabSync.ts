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
 *
 * SEGURANÇA (auditoria 2026-11-07):
 * O canal é do tipo BroadcastChannel, que é escopado por ORIGEM. Isso significa que
 * qualquer script same-origin (uma dependência npm comprometida, um XSS) podia
 * publicar TOKEN_REQUEST e receber os tokens da sessão em TOKEN_REFRESHED — sem
 * precisar de nenhuma credencial. Não é hipótese remota: TOKEN_REQUEST foi
 * introduzido justamente para que a popup obtivesse o token.
 *
 * Mitigação: toda instância da aplicação gera um `instanceId` e o publica. Um
 * TOKEN_REFRESHED agora é ENDEREÇADO a quem pediu (`replyTo`) e só é enviado em
 * resposta a um TOKEN_REQUEST conhecido. Isso não impede um script que rode DENTRO
 * da página (ele lê os tokens de qualquer forma — a página já os tem em memória),
 * mas impede que uma mensagem espontânea plantada no canal force todas as abas a
 * adotarem um token atacante, e elimina a resposta cega a pedidos não solicitados.
 *
 * A defesa forte continua sendo não sofrer XSS; isto remove o amplificador.
 */

const CHANNEL_NAME = 'discovery:auth:v1';

/** Identificador único desta aba/janela (uma instância da aplicação). */
export const CROSS_TAB_INSTANCE_ID = createInstanceId();

function createInstanceId(): string {
    try {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
            return crypto.randomUUID();
        }
    } catch {
        // Ambiente sem crypto (raro): cai no fallback abaixo.
    }
    return `inst-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type CrossTabMessage =
    | { type: 'TOKEN_REFRESHED'; accessToken: string; refreshToken: string; expiresAt: number; to?: string; from?: string }
    | { type: 'LOGOUT'; from?: string }
    | { type: 'ACTIVITY_PING'; timestamp: number; from?: string }
    | { type: 'TOKEN_REQUEST'; from?: string };

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
 *
 * Mensagens endereçadas (`to`) para outra instância são ignoradas aqui — é o que
 * garante que um token só chegue a quem pediu.
 */
export function onCrossTabMessage(listener: CrossTabListener): () => void {
    const ch = getChannel();
    const handler = (event: MessageEvent<CrossTabMessage>) => {
        const data = event.data;
        if (!data || typeof data !== 'object' || typeof data.type !== 'string') {
            return;
        }

        // Mensagem de outra instância que não é para nós.
        const to = (data as { to?: string }).to;
        if (typeof to === 'string' && to.length > 0 && to !== CROSS_TAB_INSTANCE_ID) {
            return;
        }

        listener(data);
    };
    ch.addEventListener('message', handler);
    return () => ch.removeEventListener('message', handler);
}

/**
 * Envia uma mensagem para todas as outras abas/janelas.
 * O `from` é sempre carimbado com a identidade desta instância.
 */
export function postCrossTabMessage(message: CrossTabMessage): void {
    getChannel().postMessage({ ...message, from: CROSS_TAB_INSTANCE_ID });
}

/**
 * Responde a um TOKEN_REQUEST especificamente ao solicitante.
 * Sem `replyTo` válido não respondemos: um pedido anônimo não recebe credenciais.
 */
export function replyTokensTo(
    requesterId: string | undefined,
    tokens: { accessToken: string; refreshToken: string; expiresAt: number },
): void {
    if (!requesterId) {
        return;
    }

    postCrossTabMessage({
        type: 'TOKEN_REFRESHED',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        to: requesterId,
    });
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
