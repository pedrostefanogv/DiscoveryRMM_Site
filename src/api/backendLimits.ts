// Limites de coleta do backend (Discovery.Infrastructure.HardwareInventoryParser).
//
// Fonte única no frontend para o teto que o backend persiste por coleta:
// - o clamp das páginas por cursor (hooks useAgents.ts)
// - a opção "Todos" (que usa o teto em uma única requisição)
// - o aviso de lista truncada e a barra de abas do detalhe do agente
//
// Ao mudar MaxListeningPorts/MaxOpenSockets no backend, atualize aqui.
export const LISTENING_PORTS_BACKEND_LIMIT = 200;
export const OPEN_SOCKETS_BACKEND_LIMIT = 5000;

export const LISTENING_PORTS_MAX_PAGE_SIZE = LISTENING_PORTS_BACKEND_LIMIT;
export const OPEN_SOCKETS_MAX_PAGE_SIZE = OPEN_SOCKETS_BACKEND_LIMIT;
