import { useSearchParams } from 'react-router-dom';
import { Button, Card } from '@/components/ui';
import { useEffect, useState } from 'react';
import { remoteSessionsApi, SessionCredentials } from '@/api/remote-sessions';
import { configureApiClient } from '@/api/client';
import RemoteScreenViewer from '@/modules/remote-screen/RemoteScreenViewer';
import RemoteTerminal from '@/modules/remote-terminal/RemoteTerminal';
import RemoteFiles from '@/modules/remote-files/RemoteFiles';
import RemoteProxy from '@/modules/remote-proxy/RemoteProxy';
import { useWebrtcSession } from '@/modules/remote-webrtc/useWebrtcSession';
import { RecordingControls } from '@/modules/remote-recording/RecordingControls';

type Tab = 'screen' | 'terminal' | 'files' | 'proxy';



function formatRemaining(expiresAtUtc: string | null): string {
  if (!expiresAtUtc) return '--';
  const remaining = new Date(expiresAtUtc).getTime() - Date.now();
  if (remaining <= 0) return 'Expirada';
  const min = Math.floor(remaining / 60000);
  const sec = Math.floor((remaining % 60000) / 1000);
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export default function RemoteSession() {
  const [searchParams] = useSearchParams();

  const sessionId = searchParams.get('sessionId') ?? '';
  const agentId = searchParams.get('agentId') ?? '';
  const natsSubject = searchParams.get('natsSubject') ?? '';
  const kind = searchParams.get('kind') ?? 'screen';
  const transport = searchParams.get('transport') ?? 'nats';
  const quality = searchParams.get('quality') ?? 'high';
  const codec = searchParams.get('codec') ?? 'jpeg';
  const expiresAt = searchParams.get('expiresAt') ?? '';
  const accessToken = searchParams.get('accessToken') ?? '';

  // Configura o apiClient com o token JWT passado pela aba pai via query string.
  // A popup não compartilha sessionStorage com a aba pai, então sem isso todas
  // as chamadas autenticadas falham com 401.
  useEffect(() => {
    if (!accessToken) return;
    configureApiClient({
      getAccessToken: () => accessToken,
      refreshAccessToken: async () => null, // popup não tem refresh token
      onAuthFailure: () => {
        setErrorMsg('Sessão expirada. Feche esta janela e abra o acesso remoto novamente.');
      },
    });
  }, [accessToken]);

  const [remaining, setRemaining] = useState<string>(formatRemaining(expiresAt));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>(kind as Tab);
  const [natsCredentials, setNatsCredentials] = useState<SessionCredentials | null>(null);
  const [turnCreds, setTurnCreds] = useState<{ username: string; credential: string; urls: string[] } | null>(null);
  const [, setRemoteStream] = useState<MediaStream | null>(null);
  const [rtt, setRtt] = useState<number>(0);

  // Timer de expiração
  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(formatRemaining(expiresAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  // Conexão NATS (primária) — obtém credenciais e conecta imediatamente.
  // TURN/WebRTC é opcional e buscado em background sem bloquear o fluxo principal.
  useEffect(() => {
    if (!sessionId || !agentId) return;

    let cancelled = false;
    (async () => {
      try {
        // NATS é obrigatório para o transporte primário dos frames
        const natsCreds = await remoteSessionsApi.getSessionCredentials(agentId, sessionId);
        if (cancelled) return;
        setNatsCredentials(natsCreds);
        setIsConnected(true);

        // TURN é opcional — busca em background para habilitar WebRTC quando disponível
        try {
          const turn = await remoteSessionsApi.getTurnCredentials(agentId, sessionId);
          if (!cancelled && turn.urls.length > 0) {
            setTurnCreds({
              username: turn.username,
              credential: turn.credential,
              urls: turn.urls,
            });
          }
        } catch {
          // TURN não configurado — NATS é o transporte primário, prossegue normalmente
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(`Falha ao obter credenciais NATS: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [sessionId, agentId]);

  // WebRTC (apenas quando transport=webrtc, screen, e TURN disponível)
  const webrtc = useWebrtcSession({
    stunUrls: ['stun:stun.l.google.com:19302'],
    turnUrls: turnCreds?.urls ?? [],
    turnUsername: turnCreds?.username ?? '',
    turnCredential: turnCreds?.credential ?? '',
    onRemoteStream: (stream) => setRemoteStream(stream),
    onError: (err) => setErrorMsg(`WebRTC: ${err}`),
  });

  // Inicia WebRTC quando credenciais TURN disponíveis
  useEffect(() => {
    if (turnCreds && turnCreds.urls.length > 0 && transport === 'webrtc' && activeTab === 'screen') {
      webrtc.start();
    }
    return () => {
      webrtc.stop();
    };
  }, [turnCreds, transport, activeTab]);

  const handleRenew = async () => {
    try {
      await remoteSessionsApi.renewSession(agentId, sessionId);
    } catch (err) {
      setErrorMsg(`Falha ao renovar: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleStop = async () => {
    try {
      await remoteSessionsApi.stopSession(agentId, sessionId);
      window.close();
    } catch (err) {
      setErrorMsg(`Falha ao encerrar: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'screen', label: 'Tela' },
    { key: 'terminal', label: 'Terminal' },
    { key: 'files', label: 'Arquivos' },
    { key: 'proxy', label: 'Proxy' },
  ];

  if (!sessionId || !agentId) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <Card className="p-6 text-center">
          <p className="text-red-400">Parâmetros inválidos. Feche esta janela e tente novamente.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">
            Acesso Remoto — {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
          </h1>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${isConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
            {isConnected ? 'Conectado' : 'Conectando...'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Tempo restante: <strong className="text-slate-300">{remaining}</strong></span>
          <Button variant="secondary" size="sm" onClick={handleRenew}>Renovar</Button>
          <Button variant="danger" size="sm" onClick={handleStop}>Encerrar</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 py-1.5 bg-slate-850 border-b border-slate-700">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`px-3 py-1 text-xs rounded-t transition-colors ${
              activeTab === tab.key
                ? 'bg-slate-700 text-slate-200'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
        {/* Status bar info */}
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          <span>Transport: <span className="text-slate-400">{transport.toUpperCase()}</span></span>
          <span>Quality: <span className="text-slate-400">{quality}</span></span>
          <span>Codec: <span className="text-slate-400">{codec.toUpperCase()}</span></span>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'screen' && (
          <div className="h-full flex flex-col">
            <div className="flex-1">
              <RemoteScreenViewer
                natsSubject={natsSubject}
                natsUrl={natsCredentials?.natsWssUrl}
                jwt={natsCredentials?.jwt}
                nkeySeed={natsCredentials?.nkeySeed}
                quality={quality}
                codec={codec}
                onError={(msg) => setErrorMsg(msg)}
                onLatency={(rttMs) => setRtt(rttMs)}
              />
            </div>
            {transport === 'webrtc' && webrtc.state.status === 'connected' && (
              <div className="text-xs text-slate-500 px-4 py-1 bg-slate-800">
                WebRTC P2P — latência: {rtt}ms
              </div>
            )}
          </div>
        )}

        {activeTab === 'terminal' && (
          <RemoteTerminal
            sessionId={sessionId}
            agentId={agentId}
            natsSubject={natsSubject}
            jwt={natsCredentials?.jwt}
            nkeySeed={natsCredentials?.nkeySeed}
          />
        )}

        {activeTab === 'files' && (
          <RemoteFiles
            sessionId={sessionId}
            agentId={agentId}
            natsSubject={natsSubject}
            jwt={natsCredentials?.jwt}
            nkeySeed={natsCredentials?.nkeySeed}
          />
        )}

        {activeTab === 'proxy' && (
          <RemoteProxy
            sessionId={sessionId}
            agentId={agentId}
            natsSubject={natsSubject}
            jwt={natsCredentials?.jwt}
            nkeySeed={natsCredentials?.nkeySeed}
          />
        )}
      </div>

      {/* Recording controls */}
      <RecordingControls
        agentId={agentId}
        sessionId={sessionId}
        onError={(msg) => setErrorMsg(msg)}
      />

      {/* Error toast */}
      {errorMsg && (
        <div className="absolute bottom-4 right-4 bg-red-900/80 text-red-200 px-4 py-2 rounded text-sm max-w-sm z-50">
          {errorMsg}
          <button className="ml-2 text-red-400 hover:text-red-200" onClick={() => setErrorMsg(null)}>✕</button>
        </div>
      )}
    </div>
  );
}
