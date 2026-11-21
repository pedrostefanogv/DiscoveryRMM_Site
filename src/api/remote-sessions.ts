import { api, apiFetchResponse } from './client';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Codec aceito pelo runtime do agent.
 *
 * 'h264' NÃO é válido em NENHUM transporte — inclusive WebRTC. O encoder AVC
 * está desativado por licença/patente e o WebRTC negocia VP8/VP9 internamente.
 * A API rejeita via QualityProfileMapping.IsCodecValidForTransport.
 */
export type RemoteCodecInput = 'jpeg' | 'webp';

/**
 * Transporte aceito para novas sessões.
 *
 * 'webrtc' é aceito, mas só é EFETIVO quando a política herdável de WebRTC está
 * ligada para o escopo do agente E o kind desta sessão está na lista
 * (RemoteAccessWebRtcPolicyJson / RemoteAccessWebRtcEnabled, editável em
 * Configurações → WebRTC). Fora disso a sessão sobe em NATS — o pedido não
 * falha, e o indicador de transporte mostra que o caminho efetivo é o relayado.
 */
export type RemoteTransportInput = 'nats' | 'http' | 'webrtc';

export interface StartRemoteSessionRequest {
    agentId: string;
    userId?: string;
    tenantId?: string;
    siteId?: string;
    kind: 'screen' | 'terminal' | 'files' | 'proxy' | 'processes' | 'rdp' | 'registry' | 'all';
    transport: RemoteTransportInput;
    quality: 'ultra' | 'fast' | 'high' | 'medium' | 'low' | 'ultralow' | 'unlimited';
    codec: RemoteCodecInput;
    durationMinutes: number;
    /** Sobrepõe sessões ativas existentes (fecha e cria nova). */
    force?: boolean;
    /** Shell para terminal interativo (powershell, cmd, wsl). Default: powershell. */
    shell?: string;
    /** Colunas iniciais do terminal. Default: 120. */
    termCols?: number;
    /** Identidade do console do terminal: "user" (usuário logado — default) | "system". */
    runAs?: string;
    /** Linhas iniciais do terminal. Default: 40. */
    termRows?: number;
    /** Raiz do explorador de arquivos no agent. Default: C:\\. */
    rootPath?: string;
    /** Índice do monitor para captura de tela (0 = primário). Default: 0. */
    monitorIndex?: number;
}

export interface RemoteSessionResponse {
    sessionId: string;
    natsSubject: string;
    agentId: string;
    kind: string;
    transport: string;
    qualityProfile: string;
    codec: string;
    status: string;
    expiresAtUtc: string;
    startedAtUtc: string;
    natsWssUrl?: string;
    /** Teto absoluto da sessao (startedAt + duracao maxima). */
    maxExpiresAtUtc?: string;
    /** Contrato de liveness (cadencia de ping) enviado pelo servidor. */
    liveness?: RemoteSessionLiveness;
    /** false quando a sessao ja nao esta mais ativa (ver endReason). */
    sessionActive?: boolean;
    /** Motivo do encerramento quando sessionActive=false. */
    endReason?: string | null;
    /** Sessão de desktop exige autorização do usuário local. */
    consentRequired?: boolean;
    /** pending | granted | denied | not_required | timeout-denied... */
    consentStatus?: string | null;
    consentDeadlineAtUtc?: string | null;
    consentMessage?: string | null;
    consentPolicySource?: string | null;
    /** Janela (s) após o deadline em que o console ainda aguarda a confirmação do agent. */
    consentDecisionGraceSeconds?: number | null;
    /**
     * Credenciais NATS do viewer já emitidas no start (sessões sem consentimento
     * pendente). Evita um POST /nats-credentials extra no caminho crítico do
     * terminal. Ausente em APIs antigas — o front mantém o fallback.
     */
    viewerCredentials?: SessionCredentials;
    /** Configuração WebRTC efetiva da sessão (iceServers com TURN efêmero). */
    webrtc?: RemoteSessionWebRtcConfig | null;
    /** Alias camelCase emitido por ASP.NET System.Text.Json para `WebRtc`. */
    webRtc?: RemoteSessionWebRtcConfig | null;
}

export interface RemoteSessionWebRtcConfig {
    enabled: boolean;
    iceServers: RTCIceServer[];
    relayOnly: boolean;
    fallbackToNats: boolean;
}

export interface RemoteSessionConsentStatus {
    sessionId: string;
    status: string;
    required: boolean;
    consentStatus: string;
    deadlineUtc?: string | null;
    decidedAtUtc?: string | null;
    outcome?: string | null;
    reason?: string | null;
    auto?: boolean | null;
    policySource?: string | null;
    promptBackend?: string | null;
    /** Janela (s) após o deadline em que a API ainda aceita a decisão do agent. */
    decisionGraceSeconds?: number | null;
}

export interface RemoteSessionLiveness {
    pingIntervalSeconds: number;
    missedPingsBeforeClose: number;
    initialGraceSeconds: number;
}

export interface ActiveSession {
    sessionId: string;
    agentId: string;
    userId: string;
    kind: string;
    transport: string;
    qualityProfile: string;
    codec: string;
    status: string;
    startedAtUtc: string;
    expiresAtUtc: string;
    recordingEnabled: boolean;
    natsSubject?: string;
}

export interface SessionCredentials {
    jwt: string;
    nkeySeed: string;
    expiresAtUtc: string;
    natsWssUrl?: string;
}

/**
 * Ticket efêmero de uso único para o handshake WebSocket em /tunnel/ws.
 * Espelha TunnelTicketResponseDto (RemoteSessionsController.cs:723).
 */
export interface TunnelTicket {
    ticket: string;
    expiresInSeconds: number;
    expiresAtUtc: string;
}

export interface RecordingResponse {
    recordingId: string;
    sessionId: string;
    status: string;
    startedAtUtc: string;
    storageUrl?: string;
}

export interface RecordingDownload {
    downloadUrl: string;
    containerFormat: string;
    bytes: number;
    durationSec: number;
    expiresAt?: string;
}

// ── API Client ─────────────────────────────────────────────────────────────

const BASE = '/api/v1/remote-sessions';

export const remoteSessionsApi = {
    /** Inicia uma nova sessão de acesso remoto. */
    startSession: async (agentId: string, request: StartRemoteSessionRequest): Promise<RemoteSessionResponse> => {
        const res = await api.post<RemoteSessionResponse>(`${BASE}/${agentId}`, request);
        const webrtc = res.webrtc ?? res.webRtc ?? null;
        return webrtc !== undefined ? { ...res, webrtc } : res;
    },

    /** Encerra uma sessão remota ativa. */
    stopSession: (agentId: string, sessionId: string): Promise<void> =>
        api.post<void>(`${BASE}/${agentId}/${sessionId}/stop`, undefined, { retryOnAuthError: false }),

    /** Renova o TTL de uma sessão remota. */
    renewSession: (agentId: string, sessionId: string): Promise<RemoteSessionResponse> =>
        api.post<RemoteSessionResponse>(`${BASE}/${agentId}/${sessionId}/renew`),

    /** Lista sessões ativas para um agent. */
    getActiveSessions: (agentId: string): Promise<ActiveSession[]> =>
        api.get<ActiveSession[]>(`${BASE}/${agentId}/active`),

    /**
     * Baixa o conteúdo do arquivo .rdp (mstsc) da sessão. O arquivo aponta para
     * 127.0.0.1:{localPort} — a porta local do túnel RDP mantida pelo agent/API.
     * Retorna o TEXTO do arquivo (content-type application/x-rdp), não JSON.
     */
    getRdpFile: async (agentId: string, sessionId: string, localPort: number): Promise<string> => {
        const res = await apiFetchResponse(
            `${BASE}/${encodeURIComponent(agentId)}/${encodeURIComponent(sessionId)}/rdp-file?localPort=${localPort}`,
        );
        if (!res.ok) {
            const message = await res.text().catch(() => '');
            throw new Error(message || `Falha ao obter o arquivo .rdp (HTTP ${res.status}).`);
        }
        return await res.text();
    },

    /**
     * Emite um ticket opaco de uso único (TTL curto) para autenticar o
     * handshake WebSocket em /tunnel/ws.
     *
     * Por que não mandar o JWT: o endpoint /tunnel/ws recusa explicitamente
     * ?access_token= na query string (UserAuthMiddleware.cs:53-55) — só aceita
     * header Authorization ou este ticket. A URL do WebSocket não carrega
     * headers, então o ticket é o único caminho.
     *
     * Endpoint: POST {BASE}/{agentId}/{sessionId}/tunnel/ticket
     */
    issueTunnelTicket: (agentId: string, sessionId: string): Promise<TunnelTicket> =>
        api.post<TunnelTicket>(
            `${BASE}/${encodeURIComponent(agentId)}/${encodeURIComponent(sessionId)}/tunnel/ticket`,
            undefined,
            { retryOnAuthError: false },
        ),

    /** Estado do consentimento (polling enquanto o usuário local decide). */
    getConsentStatus: (agentId: string, sessionId: string): Promise<RemoteSessionConsentStatus> =>
        api.get<RemoteSessionConsentStatus>(`${BASE}/${agentId}/${sessionId}/consent`),

    /** Obtém credenciais NATS (JWT + NKey) para o viewer se conectar ao stream. */
    getSessionCredentials: (agentId: string, sessionId: string): Promise<SessionCredentials> =>
        api.post<SessionCredentials>(`${BASE}/${agentId}/${sessionId}/nats-credentials`, undefined, { retryOnAuthError: false }),

    /** Inicia a gravação de uma sessão remota. */
    startRecording: (agentId: string, sessionId: string): Promise<RecordingResponse> =>
        api.post<RecordingResponse>(`${BASE}/${agentId}/${sessionId}/recording/start`),

    /** Para a gravação de uma sessão remota. */
    stopRecording: (agentId: string, sessionId: string): Promise<RecordingResponse> =>
        api.post<RecordingResponse>(`${BASE}/${agentId}/${sessionId}/recording/stop`),

    /** Obtém URL de download da gravação. */
    getRecordingDownload: (agentId: string, sessionId: string): Promise<RecordingDownload> =>
        api.get<RecordingDownload>(`${BASE}/${agentId}/${sessionId}/recording/download`),

    /**
     * Exclui a gravação (LGPD Art. 18).
     *
     * DELETE, não POST: o controller expõe
     * [HttpDelete("{agentId}/{sessionId}/recording")] (RemoteSessionsController.cs:364).
     * Não existe rota POST .../recording/delete na API — o POST dava 405 garantido.
     * Hoje sem chamador na UI; corrigido para não quebrar quando alguém usar.
     */
    deleteRecording: (agentId: string, sessionId: string): Promise<void> =>
        api.del<void>(`${BASE}/${agentId}/${sessionId}/recording`, { retryOnAuthError: false }),

    /** Altera qualidade/codec/FPS de uma sessão ativa. */
    /**
     * Politica de teto de banda configurada no servidor (presets e limites).
     * A UI usa para montar o seletor sem hardcode de valores.
     */
    getBandwidthPolicy: (): Promise<BandwidthPolicy> =>
        api.get<BandwidthPolicy>(`${BASE}/bandwidth-policy`),

    /**
     * Troca a POLITICA DE TETO DE BANDA em runtime (janela do visualizador).
     * Separado de changeQuality: um freia a PRODUCAO de frames, o outro reduz
     * a compressao.
     */
    // PUT (não POST): o backend expõe [HttpPut("{agentId}/{sessionId}/bandwidth")]
    // em RemoteSessionsController.cs — com POST a API respondia 405 (allow: PUT)
    // e a troca de teto em runtime nunca funcionava. Mantenha o verbo alinhado
    // ao controller (a rota /quality ao lado já usa PUT e funciona).
    changeBandwidth: (agentId: string, sessionId: string, request: ChangeBandwidthRequest): Promise<void> =>
        api.put<void>(`${BASE}/${agentId}/${sessionId}/bandwidth`, request, { retryOnAuthError: false }),

    changeQuality: (agentId: string, sessionId: string, request: ChangeQualityRequest): Promise<RemoteSessionResponse> =>
        api.put<RemoteSessionResponse>(`${BASE}/${agentId}/${sessionId}/quality`, request),

    // ── Terminal Multi-Tab ──

    /** Cria uma nova aba de terminal na sessão. */
    createTerminalTab: (agentId: string, sessionId: string, shell = 'powershell', cols = 120, rows = 40): Promise<{ tabId: string; shell: string; natsSubject: string }> =>
        api.post(`${BASE}/${agentId}/${sessionId}/terminal/tabs`, { shell, cols, rows }),

    /** Fecha uma aba de terminal. */
    closeTerminalTab: (agentId: string, sessionId: string, tabId: string): Promise<void> =>
        api.del(`${BASE}/${agentId}/${sessionId}/terminal/tabs/${tabId}`),

    /** Lista shells disponíveis no agent (inclui WSL). */
    getAvailableShells: (agentId: string, sessionId: string): Promise<{ shells: string[] }> =>
        api.get(`${BASE}/${agentId}/${sessionId}/terminal/shells`),
};

export interface ChangeQualityRequest {
    quality: 'ultra' | 'fast' | 'high' | 'medium' | 'low' | 'ultralow' | 'unlimited';
    codec?: RemoteCodecInput;
    imageQuality?: number;
    maxFps?: number;
    auto?: boolean;
}

/**
 * Modo do TETO DE BANDA do stream de tela. Espelha os modos da janela:
 *   - 'auto':   o agente ajusta o teto sozinho conforme o bitrate que o viewer
 *               efetivamente recebe (dentro de [autoMinKbps, autoMaxKbps]);
 *   - 'hd':     SEM teto - prioriza fluidez/fidelidade;
 *   - 'manual': teto FIXO escolhido pelo operador (preset).
 *
 * O teto e um controle SEPARADO da qualidade: a qualidade reduz a compressao, o
 * teto freia a PRODUCAO de frames quando o link nao escoa.
 */
export type BandwidthMode = 'auto' | 'hd' | 'manual';

/** Opcao pre-definida de teto de banda (vem da configuracao do servidor). */
export interface BandwidthPreset {
    id: string;
    label: string;
    /** Teto em kbps. 0 = sem limite. */
    kbps: number;
}

/**
 * Politica de teto de banda configurada no servidor.
 * Exposta pela API para a UI montar o seletor sem hardcode de valores.
 */
export interface BandwidthPolicy {
    defaultMode: BandwidthMode;
    manualDefaultKbps: number;
    manualPresets: BandwidthPreset[];
    autoMinKbps: number;
    autoMaxKbps: number;
    autoStepKbps: number;
    serverMaxKbps: number;
}

/** Pedido de troca da politica de banda em runtime. */
export interface ChangeBandwidthRequest {
    mode: BandwidthMode;
    /** Teto em kbps (modo manual). 0 = sem limite. */
    ceilingKbps?: number;
    autoMinKbps?: number;
    autoMaxKbps?: number;
    autoStepKbps?: number;
    serverMaxKbps?: number;
}

/** Estado corrente do gate de banda, reportado pelo agente. */
export interface BandwidthState {
    mode: BandwidthMode;
    /** Teto corrente em kbps (no modo auto, e o valor ajustado). 0 = sem teto. */
    ceilingKbps: number;
    paused: boolean;
    closes: number;
    opens: number;
    autoAdjusts: number;
    lastKbps: number;
}
