import { api } from './client';

// ── Types ──────────────────────────────────────────────────────────────────

export interface StartRemoteSessionRequest {
    agentId: string;
    userId?: string;
    tenantId?: string;
    siteId?: string;
    kind: 'screen' | 'terminal' | 'files' | 'proxy' | 'all';
    transport: 'webrtc' | 'nats' | 'http';
    quality: 'ultra' | 'high' | 'medium' | 'low' | 'ultralow';
    codec: 'jpeg' | 'webp' | 'h264';
    durationMinutes: number;
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
    turnCredentials?: TurnCredentials;
}

export interface TurnCredentials {
    urls: string[];
    username: string;
    credential: string;
    ttlSeconds: number;
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

// ── API Client ─────────────────────────────────────────────────────────────

const BASE = '/api/v1/remote-sessions';

export const remoteSessionsApi = {
    /** Inicia uma nova sessão de acesso remoto. */
    startSession: (agentId: string, request: StartRemoteSessionRequest): Promise<RemoteSessionResponse> =>
        api.post<RemoteSessionResponse>(`${BASE}/${agentId}`, request),

    /** Encerra uma sessão remota ativa. */
    stopSession: (agentId: string, sessionId: string): Promise<void> =>
        api.post<void>(`${BASE}/${agentId}/${sessionId}/stop`),

    /** Renova o TTL de uma sessão remota. */
    renewSession: (agentId: string, sessionId: string): Promise<RemoteSessionResponse> =>
        api.post<RemoteSessionResponse>(`${BASE}/${agentId}/${sessionId}/renew`),

    /** Lista sessões ativas para um agent. */
    getActiveSessions: (agentId: string): Promise<ActiveSession[]> =>
        api.get<ActiveSession[]>(`${BASE}/${agentId}/active`),

    /** Obtém credenciais TURN para WebRTC. */
    getTurnCredentials: (agentId: string, sessionId: string): Promise<TurnCredentials> =>
        api.post<TurnCredentials>(`${BASE}/${agentId}/${sessionId}/turn-credentials`),
};
