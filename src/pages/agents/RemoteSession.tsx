import { useSearchParams } from 'react-router-dom';
import { Button, Card } from '@/components/ui';
import { useEffect, useRef, useState, useCallback } from 'react';
import { remoteSessionsApi, SessionCredentials, type ChangeQualityRequest } from '@/api/remote-sessions';
import { configureApiClient } from '@/api/client';
import RemoteScreenViewer from '@/modules/remote-screen/RemoteScreenViewer';
import RemoteTerminal from '@/modules/remote-terminal/RemoteTerminal';
import RemoteFiles from '@/modules/remote-files/RemoteFiles';
import RemoteProxy from '@/modules/remote-proxy/RemoteProxy';
import { useWebrtcSession } from '@/modules/remote-webrtc/useWebrtcSession';
import { RecordingControls } from '@/modules/remote-recording/RecordingControls';
import {
  onCrossTabMessage,
  postCrossTabMessage,
  startActivityPing,
  type CrossTabMessage,
} from '@/auth/crossTabSync';

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
  const natsUrlFromQuery = searchParams.get('natsUrl') ?? '';
  const initialAccessToken = searchParams.get('accessToken') ?? '';
  // Credenciais NATS pré-buscadas pelo launcher (evita chamada extra à API na popup)
  const preFetchedJwt = searchParams.get('jwt') ?? '';
  const preFetchedNkeySeed = searchParams.get('nkeySeed') ?? '';

  // Ref mutável para o accessToken — atualizado via BroadcastChannel quando
  // a aba principal faz refresh. O apiClient lê desta ref via getAccessToken.
  const accessTokenRef = useRef(initialAccessToken);

  useEffect(() => {
    accessTokenRef.current = initialAccessToken;
  }, [initialAccessToken]);

  // Configura o apiClient com o token JWT da query string, atualizável via BroadcastChannel.
  // A popup não compartilha sessionStorage com a aba pai, então recebe tokens via
  // BroadcastChannel quando a aba principal faz refresh.
  useEffect(() => {
    configureApiClient({
      getAccessToken: () => accessTokenRef.current,
      refreshAccessToken: async () => {
        // Pede à aba principal o token mais recente
        postCrossTabMessage({ type: 'TOKEN_REQUEST' });
        // Aguarda um tick para o listener atualizar accessTokenRef
        await new Promise((resolve) => setTimeout(resolve, 100));
        return accessTokenRef.current || null;
      },
      onAuthFailure: () => {
        setErrorMsg('Sessão expirada. Feche esta janela e abra o acesso remoto novamente.');
      },
    });
  }, []);

  // ── Cross-tab sync: recebe tokens atualizados e mantém a aba principal viva ──
  useEffect(() => {
    // Escuta tokens atualizados da aba principal
    const cleanup = onCrossTabMessage((message: CrossTabMessage) => {
      if (message.type === 'TOKEN_REFRESHED' && message.accessToken) {
        accessTokenRef.current = message.accessToken;
      }
    });

    // Envia pings de atividade para manter a aba principal viva enquanto a
    // popup de acesso remoto estiver aberta
    const stopPing = startActivityPing(10_000);

    // Pede os tokens atuais ao abrir (caso a aba principal tenha renovado
    // depois que esta popup foi criada)
    postCrossTabMessage({ type: 'TOKEN_REQUEST' });

    return () => {
      cleanup();
      stopPing();
    };
  }, []);

  const [remaining, setRemaining] = useState<string>(formatRemaining(expiresAt));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  // Aba ativa por padrão: 'screen' (Tela). Se o kind da query for uma aba
  // válida e diferente (terminal/files/proxy), usa-a; caso contrário ('all',
  // vazio, inválido) cai para 'screen' — evita nenhuma aba ativa ao abrir.
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (kind === 'terminal' || kind === 'files' || kind === 'proxy' || kind === 'screen') {
      return kind as Tab;
    }
    return 'screen';
  });
  const [natsCredentials, setNatsCredentials] = useState<SessionCredentials | null>(
    preFetchedJwt && preFetchedNkeySeed
      ? { jwt: preFetchedJwt, nkeySeed: preFetchedNkeySeed, expiresAtUtc: expiresAt || '', natsWssUrl: natsUrlFromQuery || undefined }
      : null,
  );
  const [turnCreds, setTurnCreds] = useState<{ username: string; credential: string; urls: string[] } | null>(null);
  const [, setRemoteStream] = useState<MediaStream | null>(null);
  const [rtt, setRtt] = useState<number>(0);

  // ── Controles de qualidade em tempo real (independentes) ──
  const [liveQuality, setLiveQuality] = useState(quality);
  const [liveCodec, setLiveCodec] = useState(codec);
  const [liveImageQuality, setLiveImageQuality] = useState(75); // compressão JPEG 1-100
  const [liveMaxFps, setLiveMaxFps] = useState(15);            // FPS máximo
  const [autoMode, setAutoMode] = useState(false);
  const [qualityChanging, setQualityChanging] = useState(false);

  const QUALITIES: { value: ChangeQualityRequest['quality']; label: string; fps: number; jpegQ: number }[] = [
    { value: 'ultra', label: 'Ultra', fps: 30, jpegQ: 92 },
    { value: 'high', label: 'Alta', fps: 15, jpegQ: 75 },
    { value: 'medium', label: 'Média', fps: 10, jpegQ: 60 },
    { value: 'low', label: 'Baixa', fps: 5, jpegQ: 40 },
    { value: 'ultralow', label: 'Mínima', fps: 2, jpegQ: 25 },
  ];

  const CODECS: { value: NonNullable<ChangeQualityRequest['codec']>; label: string }[] = [
    { value: 'jpeg', label: 'JPEG' },
    { value: 'webp', label: 'WebP' },
    { value: 'h264', label: 'H.264' },
  ];

  const IMAGE_QUALITY_PRESETS = [
    { value: 90, label: '90%' },
    { value: 75, label: '75%' },
    { value: 60, label: '60%' },
    { value: 40, label: '40%' },
    { value: 25, label: '25%' },
  ];

  const FPS_PRESETS = [
    { value: 30, label: '30' },
    { value: 15, label: '15' },
    { value: 10, label: '10' },
    { value: 5, label: '5' },
    { value: 2, label: '2' },
  ];

  const handleQualityChange = useCallback(async (newQuality: ChangeQualityRequest['quality']) => {
    if (qualityChanging) return;
    const preset = QUALITIES.find(q => q.value === newQuality);
    const prevQuality = liveQuality;
    setLiveQuality(newQuality);
    setAutoMode(false);
    setQualityChanging(true);
    try {
      await remoteSessionsApi.changeQuality(agentId, sessionId, {
        quality: newQuality,
        codec: liveCodec as ChangeQualityRequest['codec'],
        imageQuality: preset?.jpegQ ?? 75,
        maxFps: preset?.fps ?? 15,
        auto: false,
      });
    } catch (err) {
      setLiveQuality(prevQuality);
      console.error('Falha ao alterar qualidade:', err);
    } finally {
      setQualityChanging(false);
    }
  }, [qualityChanging, sessionId, agentId, liveCodec, liveQuality]);

  const handleImageQualityChange = useCallback(async (newImageQ: number) => {
    if (qualityChanging || !sessionId || !agentId) return;
    const prevImageQ = liveImageQuality;
    setQualityChanging(true);
    setLiveImageQuality(newImageQ);
    setAutoMode(false);
    try {
      await remoteSessionsApi.changeQuality(agentId, sessionId, {
        quality: liveQuality as ChangeQualityRequest['quality'],
        imageQuality: newImageQ,
        maxFps: liveMaxFps,        // preserva FPS atual
        auto: false,
      });
    } catch (err) {
      setLiveImageQuality(prevImageQ);
      console.error('Falha ao alterar qualidade da imagem:', err);
    } finally {
      setQualityChanging(false);
    }
  }, [qualityChanging, sessionId, agentId, liveQuality, liveImageQuality, liveMaxFps]);

  const handleFpsChange = useCallback(async (newFps: number) => {
    if (qualityChanging || !sessionId || !agentId) return;
    const prevFps = liveMaxFps;
    setQualityChanging(true);
    setLiveMaxFps(newFps);
    setAutoMode(false);
    try {
      await remoteSessionsApi.changeQuality(agentId, sessionId, {
        quality: liveQuality as ChangeQualityRequest['quality'],
        imageQuality: liveImageQuality,  // preserva qualidade de imagem atual
        maxFps: newFps,
        auto: false,
      });
    } catch (err) {
      setLiveMaxFps(prevFps);
      console.error('Falha ao alterar FPS:', err);
    } finally {
      setQualityChanging(false);
    }
  }, [qualityChanging, sessionId, agentId, liveQuality, liveImageQuality, liveMaxFps]);

  const handleCodecChange = useCallback(async (newCodec: NonNullable<ChangeQualityRequest['codec']>) => {
    if (qualityChanging || !sessionId || !agentId) return;
    const previousCodec = liveCodec;
    setQualityChanging(true);
    setLiveCodec(newCodec);
    setAutoMode(false);
    try {
      await remoteSessionsApi.changeQuality(agentId, sessionId, {
        quality: liveQuality as ChangeQualityRequest['quality'],
        codec: newCodec,
        imageQuality: liveImageQuality,  // preserva
        maxFps: liveMaxFps,              // preserva
        auto: false,
      });
    } catch (err) {
      setLiveCodec(previousCodec);
      console.error('Falha ao alterar codec:', err);
    } finally {
      setQualityChanging(false);
    }
  }, [qualityChanging, sessionId, agentId, liveQuality, liveCodec, liveImageQuality, liveMaxFps]);

  const handleAutoToggle = useCallback(async () => {
    if (qualityChanging || !sessionId || !agentId) return;
    const newAuto = !autoMode;
    setQualityChanging(true);
    setAutoMode(newAuto);
    try {
      await remoteSessionsApi.changeQuality(agentId, sessionId, {
        quality: liveQuality as ChangeQualityRequest['quality'],
        auto: newAuto,
      });
    } catch (err) {
      setAutoMode(!newAuto);
      console.error('Falha ao alternar modo auto:', err);
    } finally {
      setQualityChanging(false);
    }
  }, [qualityChanging, sessionId, agentId, autoMode, liveQuality]);

  // Timer de expiração
  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(formatRemaining(expiresAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  // Conexão NATS (primária) — usa credenciais pré-buscadas da URL quando disponíveis.
  // Se não houver credenciais na URL, busca da API (fallback para abas abertas manualmente).
  // TURN/WebRTC é opcional e buscado em background sem bloquear o fluxo principal.
  useEffect(() => {
    if (!sessionId || !agentId) return;

    let cancelled = false;
    (async () => {
      try {
        // Se já temos credenciais pré-buscadas da URL, conecta imediatamente
        if (preFetchedJwt && preFetchedNkeySeed) {
          setIsConnected(true);
        } else {
          // Fallback: busca credenciais da API (para abas abertas manualmente sem launcher)
          const natsCreds = await remoteSessionsApi.getSessionCredentials(agentId, sessionId);
          if (cancelled) return;
          setNatsCredentials(natsCreds);
          setIsConnected(true);
        }

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
  }, [sessionId, agentId, preFetchedJwt, preFetchedNkeySeed]);

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
        {/* Status bar info — controles de qualidade em tempo real */}
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          <span>Transport: <span className="text-slate-400">{transport.toUpperCase()}</span></span>

          {/* Quality preset selector */}
          <div className="flex items-center gap-0.5">
            <span className="mr-1 text-slate-600">Q:</span>
            <select
              className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-xs text-slate-300 cursor-pointer hover:border-slate-600 disabled:opacity-50"
              value={liveQuality}
              disabled={autoMode || qualityChanging}
              onChange={(e) => handleQualityChange(e.target.value as ChangeQualityRequest['quality'])}
            >
              {QUALITIES.map((q) => (
                <option key={q.value} value={q.value}>{q.label}</option>
              ))}
            </select>
          </div>

          {/* Image quality selector (compressão) */}
          <div className="flex items-center gap-0.5">
            <span className="mr-1 text-slate-600">🖼</span>
            <select
              className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-xs text-slate-300 cursor-pointer hover:border-slate-600 disabled:opacity-50"
              value={liveImageQuality}
              disabled={autoMode || qualityChanging}
              onChange={(e) => handleImageQualityChange(Number(e.target.value))}
              title="Qualidade da imagem (compressão JPEG)"
            >
              {IMAGE_QUALITY_PRESETS.map((iq) => (
                <option key={iq.value} value={iq.value}>{iq.label}</option>
              ))}
            </select>
          </div>

          {/* FPS selector */}
          <div className="flex items-center gap-0.5">
            <span className="mr-1 text-slate-600">⚡</span>
            <select
              className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-xs text-slate-300 cursor-pointer hover:border-slate-600 disabled:opacity-50"
              value={liveMaxFps}
              disabled={autoMode || qualityChanging}
              onChange={(e) => handleFpsChange(Number(e.target.value))}
              title="Taxa máxima de quadros por segundo"
            >
              {FPS_PRESETS.map((f) => (
                <option key={f.value} value={f.value}>{f.label} FPS</option>
              ))}
            </select>
          </div>

          {/* Codec selector */}
          <div className="flex items-center gap-0.5">
            <select
              className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-xs text-slate-300 cursor-pointer hover:border-slate-600 disabled:opacity-50"
              value={liveCodec}
              disabled={autoMode || qualityChanging}
              onChange={(e) => handleCodecChange(e.target.value as NonNullable<ChangeQualityRequest['codec']>)}
            >
              {CODECS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Auto mode toggle */}
          <button
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              autoMode
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-slate-800 text-slate-500 border border-slate-700 hover:text-slate-300'
            }`}
            onClick={handleAutoToggle}
            disabled={qualityChanging}
            title={autoMode ? 'Modo automático ativo — qualidade se adapta à rede' : 'Clique para ativar modo automático'}
          >
            {autoMode ? '✓ Auto' : 'Auto'}
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'screen' && (
          <div className="h-full flex flex-col">
            <div className="flex-1">
              <RemoteScreenViewer
                natsSubject={natsSubject}
                natsUrl={natsCredentials?.natsWssUrl || natsUrlFromQuery || undefined}
                jwt={natsCredentials?.jwt}
                nkeySeed={natsCredentials?.nkeySeed}
                quality={liveQuality}
                codec={liveCodec}
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
            natsUrl={natsCredentials?.natsWssUrl || natsUrlFromQuery || undefined}
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
