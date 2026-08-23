import { useSearchParams } from 'react-router-dom';
import { Button, Card } from '@/components/ui';
import { useEffect, useRef, useState, useCallback } from 'react';
import { remoteSessionsApi, type ChangeQualityRequest, type StartRemoteSessionRequest } from '@/api/remote-sessions';
import { agentsApi } from '@/api/agents';
import { sitesApi } from '@/api/sites';
import { clientsApi } from '@/api/clients';
import { configureApiClient } from '@/api/client';
import RemoteScreenViewer, { type MonitorInfo } from '@/modules/remote-screen/RemoteScreenViewer';
import RemoteTerminal from '@/modules/remote-terminal/RemoteTerminal';
import RemoteFiles from '@/modules/remote-files/RemoteFiles';
import RemoteProxy from '@/modules/remote-proxy/RemoteProxy';
import { RemoteProcesses } from '@/modules/remote-processes/RemoteProcesses';
import { RecordingControls } from '@/modules/remote-recording/RecordingControls';
import {
  onCrossTabMessage,
  postCrossTabMessage,
  startActivityPing,
  type CrossTabMessage,
} from '@/auth/crossTabSync';

type Tab = 'screen' | 'terminal' | 'files' | 'proxy' | 'processes';

// Sessão ativa de uma aba específica. Cada aba inicia sua própria sessão
// sob demanda (botão "Conectar") — nada é iniciado automaticamente ao abrir.
interface TabSession {
  sessionId: string;
  natsSubject: string;
  natsUrl?: string;
  jwt?: string;
  nkeySeed?: string;
  expiresAtUtc: string;
  kind: string;
  qualityProfile: string;
  codec: string;
}

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

  const agentId = searchParams.get('agentId') ?? '';
  const transport = searchParams.get('transport') ?? 'nats';
  const quality = searchParams.get('quality') ?? 'unlimited';
  const codec = searchParams.get('codec') ?? 'webp';
  const initialAccessToken = searchParams.get('accessToken') ?? '';

  // Ref mutável para o accessToken — atualizado via BroadcastChannel quando
  // a aba principal faz refresh. O apiClient lê desta ref via getAccessToken.
  const accessTokenRef = useRef(initialAccessToken);

  useEffect(() => {
    accessTokenRef.current = initialAccessToken;
  }, [initialAccessToken]);

  // Configura o apiClient com o token JWT da query string, atualizável via BroadcastChannel.
  useEffect(() => {
    configureApiClient({
      getAccessToken: () => accessTokenRef.current,
      refreshAccessToken: async () => {
        postCrossTabMessage({ type: 'TOKEN_REQUEST' });
        await new Promise((resolve) => setTimeout(resolve, 100));
        return accessTokenRef.current || null;
      },
      onAuthFailure: () => {
        setErrorMsg('Sessão expirada. Feche esta janela e abra o acesso remoto novamente.');
      },
    });
  }, []);

  // ── Cross-tab sync ──
  useEffect(() => {
    const cleanup = onCrossTabMessage((message: CrossTabMessage) => {
      if (message.type === 'TOKEN_REFRESHED' && message.accessToken) {
        accessTokenRef.current = message.accessToken;
      }
    });
    const stopPing = startActivityPing(10_000);
    postCrossTabMessage({ type: 'TOKEN_REQUEST' });
    return () => {
      cleanup();
      stopPing();
    };
  }, []);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('screen');

  // Sessões por aba — cada aba inicia a própria sessão sob demanda.
  const [sessions, setSessions] = useState<Partial<Record<Tab, TabSession>>>({});
  // Aba que está conectando (feedback no botão).
  const [connectingTab, setConnectingTab] = useState<Tab | null>(null);
  // Chave de reconexão por aba — incrementa para forçar o viewer a reconectar.
  const [reconnectKeys, setReconnectKeys] = useState<Partial<Record<Tab, number>>>({});
  // Tempo restante da sessão ativa (para exibir no header).
  const [remaining, setRemaining] = useState<string>('--');

  // Identidade do agente (Cliente → Site → Hostname) exibida no header para
  // evitar operar em máquinas indevidas.
  const [agentIdentity, setAgentIdentity] = useState<{ client: string; site: string; hostname: string } | null>(null);

  // Carrega a cadeia de identidade do agente (client → site → hostname).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!agentId) return;
      try {
        const agent = await agentsApi.get(agentId);
        if (cancelled) return;
        // O backend serializa Guid.Empty como string de zeros — normaliza
        // para '' para tratá-lo como "ausente" (fallback abaixo).
        const rawClientId = agent.clientId ?? '';
        let clientId = !/^0{8}-0{4}-0{4}-0{4}-0{12}$/i.test(rawClientId) ? rawClientId : '';
        let clientName = '';
        let siteName = '';
        try {
          // Similar ao AgentDetail: usa clientId do dto (agora populado pelo
          // backend) quando disponível; senão, descobre via siteId.
          if (!clientId) {
            // Fallback: resolve o site que pertence ao client buscando em todos.
            const clients = await clientsApi.list(false);
            for (const c of clients) {
              const sites = await sitesApi.list(c.id, true);
              const match = sites.find((s) => s.id === agent.siteId);
              if (match) {
                clientId = c.id;
                clientName = c.name;
                siteName = match.name;
                break;
              }
            }
          } else {
            const [site, client] = await Promise.all([
              sitesApi.get(clientId, agent.siteId),
              clientsApi.get(clientId),
            ]);
            siteName = site.name;
            clientName = client.name;
          }
        } catch {
          // Falha parcial ao resolver site/cliente — mostra apenas hostname.
        }
        if (cancelled) return;
        setAgentIdentity({
          client: clientName,
          site: siteName,
          hostname: agent.hostname || agent.displayName || agentId,
        });
      } catch {
        // Sem permissão ou falha de rede — header fica sem identidade.
      }
    })();
    return () => { cancelled = true; };
  }, [agentId]);

  // ── Controles de qualidade em tempo real (apenas aba Tela) ──
  const [liveQuality] = useState(quality);
  const [liveCodec, setLiveCodec] = useState(codec);
  const [liveImageQuality, setLiveImageQuality] = useState(75);
  const [liveMaxFps, setLiveMaxFps] = useState(0);
  const [autoMode, setAutoMode] = useState(true);
  const [qualityChanging, setQualityChanging] = useState(false);
  const [monitorIndex, setMonitorIndex] = useState(0);
  const [monitorChanging, setMonitorChanging] = useState(false);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  // Escala e fullscreen da tela (controlados na barra de rodapé unificada).
  const [screenScale, setScreenScale] = useState<'fit' | '100%'>('fit');
  const [screenFullscreen, setScreenFullscreen] = useState(false);
  // Shell ativo do terminal (powershell | cmd). Trocar reinicia a sessão de terminal.
  const [shell, setShell] = useState('powershell');
  const [shellSwitching, setShellSwitching] = useState(false);
  // Shells disponíveis reportados pelo agent via term.ready (populará o seletor).
  const [availableShells, setAvailableShells] = useState<string[]>([]);
  // Status de conexão do terminal (reportado pelo RemoteTerminal).
  const [terminalConnected, setTerminalConnected] = useState(false);

  const screenSession = sessions.screen;

  const CODECS: { value: NonNullable<ChangeQualityRequest['codec']>; label: string }[] = [
    { value: 'webp', label: 'WebP' },
    { value: 'jpeg', label: 'JPEG' },
  ];

  const IMAGE_QUALITY_PRESETS = [
    { value: 90, label: '90%' },
    { value: 75, label: '75%' },
    { value: 60, label: '60%' },
    { value: 40, label: '40%' },
    { value: 25, label: '25%' },
  ];

  const FPS_PRESETS = [
    { value: 0, label: 'Sem limite' },
    { value: 30, label: '30' },
    { value: 20, label: '20 (Fast)' },
    { value: 12, label: '12 (Médio)' },
    { value: 5, label: '5 (Baixo)' },
    { value: 2, label: '2 (Mínimo)' },
  ];

  // ── Inicia a sessão de uma aba sob demanda ──
  const startTabSession = useCallback(async (tab: Tab) => {
    if (!agentId || connectingTab) return;
    setConnectingTab(tab);
    setErrorMsg(null);
    try {
      // Com MaxConcurrentSessionsPerAgent=1, abrir uma nova aba substitui a
      // sessão ativa de OUTRA aba: encerra a anterior explicitamente (stop no
      // agent + limpa estado) antes de iniciar a nova — comportamento "a aba
      // ativa substitui", sem orfãs e sem force silencioso no backend.
      const others = (Object.entries(sessions) as [Tab, TabSession | undefined][])
        .filter(([k]) => k !== tab)
        .map(([, s]) => s)
        .filter((s): s is TabSession => !!s);
      for (const other of others) {
        try { await remoteSessionsApi.stopSession(agentId, other.sessionId); } catch { /* best-effort */ }
      }
      if (others.length > 0) {
        setSessions((prev) => {
          const next = { ...prev };
          for (const other of others) {
            const key = (Object.entries(prev) as [Tab, TabSession | undefined][]).find(([, s]) => s?.sessionId === other.sessionId)?.[0];
            if (key) next[key] = undefined;
          }
          return next;
        });
      }

      const kind = tab === 'screen' ? 'screen' : tab; // screen | terminal | files | proxy
      const session = await remoteSessionsApi.startSession(agentId, {
        agentId,
        kind: kind as StartRemoteSessionRequest['kind'],
        transport: transport as StartRemoteSessionRequest['transport'],
        quality: liveQuality as StartRemoteSessionRequest['quality'],
        codec: liveCodec as StartRemoteSessionRequest['codec'],
        durationMinutes: 30,
        // force=false (default): não mata outras sessões silenciosamente. As
        // sessões concorrentes já foram encerradas acima com stop explícito.
        force: false,
        ...(tab === 'screen' ? { monitorIndex } : {}),
      });

      if (!session.natsSubject) {
        throw new Error('Sessão criada sem subject NATS.');
      }

      // Obtém credenciais NATS para o viewer conectar.
      let jwt: string | undefined;
      let nkeySeed: string | undefined;
      let natsUrl: string | undefined;
      try {
        const creds = await remoteSessionsApi.getSessionCredentials(agentId, session.sessionId);
        jwt = creds.jwt;
        nkeySeed = creds.nkeySeed;
        natsUrl = creds.natsWssUrl;
      } catch {
        throw new Error('Falha ao obter credenciais de streaming.');
      }

      setSessions((prev) => ({
        ...prev,
        [tab]: {
          sessionId: session.sessionId,
          natsSubject: session.natsSubject,
          natsUrl,
          jwt,
          nkeySeed,
          expiresAtUtc: session.expiresAtUtc,
          kind: session.kind,
          qualityProfile: session.qualityProfile,
          codec: session.codec,
        },
      }));
      setRemaining(formatRemaining(session.expiresAtUtc));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao iniciar sessão.');
    } finally {
      setConnectingTab(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, connectingTab, transport, liveQuality, liveCodec, monitorIndex, sessions]);

  // ── Reconexão manual de uma aba ──
  // Se a sessão ainda estiver ativa no agent, apenas remonta o viewer (nova key).
  // Se não estiver mais ativa (expirou/caiu), reinicia a sessão sob demanda.
  const handleReconnect = useCallback(async (tab: Tab) => {
    const s = sessions[tab];
    if (!s) return;
    try {
      const active = await remoteSessionsApi.getActiveSessions(agentId);
      const stillActive = active.some((a) => a.sessionId === s.sessionId);
      if (stillActive) {
        // Sessão viva — apenas remonta o viewer.
        setReconnectKeys((prev) => ({ ...prev, [tab]: (prev[tab] ?? 0) + 1 }));
      } else {
        // Sessão morta — reinicia sob demanda.
        await startTabSession(tab);
      }
    } catch {
      // Falha ao consultar — tenta remontar mesmo assim.
      setReconnectKeys((prev) => ({ ...prev, [tab]: (prev[tab] ?? 0) + 1 }));
    }
  }, [sessions, agentId, startTabSession]);

  // ── Encerra a sessão de uma aba ──
  const stopTabSession = useCallback(async (tab: Tab) => {
    const s = sessions[tab];
    if (!s) return;
    try {
      await remoteSessionsApi.stopSession(agentId, s.sessionId);
    } catch {
      // best-effort
    }
    setSessions((prev) => ({ ...prev, [tab]: undefined }));
    // Reseta o status de conexão do terminal ao encerrar a sessão.
    if (tab === 'terminal') setTerminalConnected(false);
  }, [agentId, sessions]);

  // ── Troca de shell do terminal: reinicia a sessão de terminal com o novo shell ──
  const handleSwitchShell = useCallback(async (newShell: string) => {
    if (newShell === shell || shellSwitching || !agentId) return;
    setShellSwitching(true);
    setErrorMsg(null);
    try {
      // Encerra a sessão de terminal atual (se houver)
      const current = sessions.terminal;
      if (current) {
        try { await remoteSessionsApi.stopSession(agentId, current.sessionId); } catch { /* best-effort */ }
      }
      // Inicia nova sessão de terminal com o novo shell
      const session = await remoteSessionsApi.startSession(agentId, {
        agentId,
        kind: 'terminal',
        transport: transport as StartRemoteSessionRequest['transport'],
        quality: liveQuality as StartRemoteSessionRequest['quality'],
        codec: liveCodec as StartRemoteSessionRequest['codec'],
        durationMinutes: 30,
        // A sessão de terminal anterior já foi encerrada acima; não precisa force.
        force: false,
        shell: newShell,
      });
      if (!session.natsSubject) {
        throw new Error('Sessão criada sem subject NATS.');
      }
      let jwt: string | undefined;
      let nkeySeed: string | undefined;
      let natsUrl: string | undefined;
      try {
        const creds = await remoteSessionsApi.getSessionCredentials(agentId, session.sessionId);
        jwt = creds.jwt;
        nkeySeed = creds.nkeySeed;
        natsUrl = creds.natsWssUrl;
      } catch {
        throw new Error('Falha ao obter credenciais de streaming.');
      }
      setShell(newShell);
      setSessions((prev) => ({
        ...prev,
        terminal: {
          sessionId: session.sessionId,
          natsSubject: session.natsSubject,
          natsUrl,
          jwt,
          nkeySeed,
          expiresAtUtc: session.expiresAtUtc,
          kind: session.kind,
          qualityProfile: session.qualityProfile,
          codec: session.codec,
        },
      }));
      setRemaining(formatRemaining(session.expiresAtUtc));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao trocar de shell.');
    } finally {
      setShellSwitching(false);
    }
  }, [agentId, shell, shellSwitching, sessions.terminal, transport, liveQuality, liveCodec]);

  // ── Controles de qualidade (screen) ──
  const handleImageQualityChange = useCallback(async (newImageQ: number) => {
    if (qualityChanging || !screenSession) return;
    const prevImageQ = liveImageQuality;
    setQualityChanging(true);
    setLiveImageQuality(newImageQ);
    setAutoMode(false);
    try {
      await remoteSessionsApi.changeQuality(agentId, screenSession.sessionId, {
        quality: liveQuality as ChangeQualityRequest['quality'],
        imageQuality: newImageQ,
        maxFps: liveMaxFps,
        auto: false,
      });
    } catch (err) {
      setLiveImageQuality(prevImageQ);
      console.error('Falha ao alterar qualidade da imagem:', err);
    } finally {
      setQualityChanging(false);
    }
  }, [qualityChanging, screenSession, agentId, liveQuality, liveImageQuality, liveMaxFps]);

  const handleFpsChange = useCallback(async (newFps: number) => {
    if (qualityChanging || !screenSession) return;
    const prevFps = liveMaxFps;
    setQualityChanging(true);
    setLiveMaxFps(newFps);
    setAutoMode(false);
    try {
      await remoteSessionsApi.changeQuality(agentId, screenSession.sessionId, {
        quality: liveQuality as ChangeQualityRequest['quality'],
        imageQuality: liveImageQuality,
        maxFps: newFps,
        auto: false,
      });
    } catch (err) {
      setLiveMaxFps(prevFps);
      console.error('Falha ao alterar FPS:', err);
    } finally {
      setQualityChanging(false);
    }
  }, [qualityChanging, screenSession, agentId, liveQuality, liveImageQuality, liveMaxFps]);

  const handleCodecChange = useCallback(async (newCodec: NonNullable<ChangeQualityRequest['codec']>) => {
    if (qualityChanging || !screenSession) return;
    const previousCodec = liveCodec;
    setQualityChanging(true);
    setLiveCodec(newCodec);
    setAutoMode(false);
    try {
      await remoteSessionsApi.changeQuality(agentId, screenSession.sessionId, {
        quality: liveQuality as ChangeQualityRequest['quality'],
        codec: newCodec,
        imageQuality: liveImageQuality,
        maxFps: liveMaxFps,
        auto: false,
      });
    } catch (err) {
      setLiveCodec(previousCodec);
      console.error('Falha ao alterar codec:', err);
    } finally {
      setQualityChanging(false);
    }
  }, [qualityChanging, screenSession, agentId, liveQuality, liveCodec, liveImageQuality, liveMaxFps]);

  const handleAutoToggle = useCallback(async () => {
    if (qualityChanging || !screenSession) return;
    const newAuto = !autoMode;
    setQualityChanging(true);
    setAutoMode(newAuto);
    try {
      await remoteSessionsApi.changeQuality(agentId, screenSession.sessionId, {
        quality: liveQuality as ChangeQualityRequest['quality'],
        codec: (newAuto ? 'webp' : liveCodec) as NonNullable<ChangeQualityRequest['codec']>,
        auto: newAuto,
      });
    } catch (err) {
      setAutoMode(!newAuto);
      console.error('Falha ao alternar modo auto:', err);
    } finally {
      setQualityChanging(false);
    }
  }, [qualityChanging, screenSession, agentId, autoMode, liveQuality, liveCodec]);

  // Troca de monitor — reinicia a sessão de tela com o monitor selecionado.
  const handleMonitorChange = useCallback(async (newMonitor: number) => {
    if (monitorChanging || !agentId) return;
    setMonitorChanging(true);
    setMonitorIndex(newMonitor);
    try {
      if (screenSession) {
        try { await remoteSessionsApi.stopSession(agentId, screenSession.sessionId); } catch { /* best-effort */ }
      }
      const session = await remoteSessionsApi.startSession(agentId, {
        agentId,
        kind: 'screen',
        transport: transport as StartRemoteSessionRequest['transport'],
        quality: liveQuality as StartRemoteSessionRequest['quality'],
        codec: liveCodec as StartRemoteSessionRequest['codec'],
        durationMinutes: 30,
        // A sessão de tela atual já foi encerrada acima; stop precisa força.
        force: false,
        monitorIndex: newMonitor,
      });
      let jwt: string | undefined;
      let nkeySeed: string | undefined;
      let natsUrl: string | undefined;
      try {
        const creds = await remoteSessionsApi.getSessionCredentials(agentId, session.sessionId);
        jwt = creds.jwt;
        nkeySeed = creds.nkeySeed;
        natsUrl = creds.natsWssUrl;
      } catch { /* sem credenciais */ }
      setSessions((prev) => ({
        ...prev,
        screen: {
          sessionId: session.sessionId,
          natsSubject: session.natsSubject,
          natsUrl,
          jwt,
          nkeySeed,
          expiresAtUtc: session.expiresAtUtc,
          kind: session.kind,
          qualityProfile: session.qualityProfile,
          codec: session.codec,
        },
      }));
      setRemaining(formatRemaining(session.expiresAtUtc));
    } catch (err) {
      console.error('Falha ao trocar de monitor:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao trocar de monitor.');
    } finally {
      setMonitorChanging(false);
    }
  }, [monitorChanging, agentId, screenSession, transport, liveQuality, liveCodec]);

  // Timer de expiração da sessão ativa
  useEffect(() => {
    const active = sessions[activeTab];
    if (!active) return;
    const timer = setInterval(() => {
      setRemaining(formatRemaining(active.expiresAtUtc));
    }, 1000);
    return () => clearInterval(timer);
  }, [sessions, activeTab]);

  const handleRenew = async () => {
    const active = sessions[activeTab];
    if (!active) return;
    try {
      const renewed = await remoteSessionsApi.renewSession(agentId, active.sessionId);
      setSessions((prev) => ({
        ...prev,
        [activeTab]: { ...prev[activeTab]!, expiresAtUtc: renewed.expiresAtUtc },
      }));
      setRemaining(formatRemaining(renewed.expiresAtUtc));
    } catch (err) {
      setErrorMsg(`Falha ao renovar: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleStop = async () => {
    // Encerra TODAS as sessões ativas (não só a da aba atual), para não
    // deixar sessões órfãs consumindo recursos do agent.
    const active = Object.values(sessions).filter(Boolean) as TabSession[];
    await Promise.allSettled(
      active.map((s) => remoteSessionsApi.stopSession(agentId, s.sessionId)),
    );
    window.close();
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'screen', label: 'Tela' },
    { key: 'terminal', label: 'Terminal' },
    { key: 'files', label: 'Arquivos' },
    { key: 'processes', label: 'Processos' },
    { key: 'proxy', label: 'Proxy' },
  ];

  if (!agentId) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <Card className="p-6 text-center">
          <p className="text-red-400">Parâmetros inválidos. Feche esta janela e tente novamente.</p>
        </Card>
      </div>
    );
  }

  const activeSession = sessions[activeTab];
  const isActiveConnected = !!activeSession;

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold flex items-center gap-2">
            Acesso Remoto — {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
          </h1>
          {agentIdentity && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-700/60 text-slate-200 text-xs font-medium"
              title={`${agentIdentity.hostname} — ${agentIdentity.site}`}
            >
              <span className="text-slate-400">🖥</span>
              <span className="text-slate-400">{agentIdentity.client || '—'}</span>
              <span className="text-slate-500">→</span>
              <span className="text-slate-400">{agentIdentity.site || '—'}</span>
              <span className="text-slate-500">→</span>
              <strong className="text-slate-100">{agentIdentity.hostname}</strong>
            </span>
          )}
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${isActiveConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
            {isActiveConnected ? 'Conectado' : 'Não conectado'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Tempo restante: <strong className="text-slate-300">{remaining}</strong></span>
          <Button variant="secondary" size="sm" onClick={handleRenew} disabled={!isActiveConnected}>Renovar</Button>
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
            {sessions[tab.key] && (
              <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 align-middle" title="Sessão ativa" />
            )}
          </button>
        ))}
        {/* Status bar info — controles de qualidade em tempo real (aba Tela) */}
        {activeTab === 'screen' && screenSession && (
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          <span>Transport: <span className="text-slate-400">{transport.toUpperCase()}</span></span>

          {/* Auto/Manual toggle */}
          <div className="flex items-center gap-1">
            <button
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                autoMode
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 hover:text-slate-300'
              }`}
              onClick={handleAutoToggle}
              disabled={qualityChanging}
              title={autoMode ? 'Modo automático: perfil define qualidade/codec/FPS e adapta à rede' : 'Clique para ativar modo automático'}
            >
              {autoMode ? '✓ Auto' : 'Auto'}
            </button>
            <button
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                !autoMode
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 hover:text-slate-300'
              }`}
              onClick={() => { if (autoMode) handleAutoToggle(); }}
              disabled={qualityChanging}
              title="Modo manual: escolha codec, qualidade e FPS"
            >
              Manual
            </button>
          </div>

          {/* Em Auto: nenhum ajuste de qualidade/FPS é exibido. Em Manual: controles finos. */}
          {!autoMode && (
            <>
              {/* Codec selector — Manual */}
              <div className="flex items-center gap-0.5">
                <span className="mr-1 text-slate-600">🎞</span>
                <select
                  className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-xs text-slate-300 cursor-pointer hover:border-slate-600 disabled:opacity-50"
                  value={liveCodec}
                  disabled={qualityChanging}
                  onChange={(e) => handleCodecChange(e.target.value as NonNullable<ChangeQualityRequest['codec']>)}
                  title="Escolha o codec"
                >
                  {CODECS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Image quality selector (compressão) — Manual */}
              <div className="flex items-center gap-0.5">
                <span className="mr-1 text-slate-600">🖼</span>
                <select
                  className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-xs text-slate-300 cursor-pointer hover:border-slate-600 disabled:opacity-50"
                  value={liveImageQuality}
                  disabled={qualityChanging}
                  onChange={(e) => handleImageQualityChange(Number(e.target.value))}
                  title="Qualidade da imagem (compressão)"
                >
                  {IMAGE_QUALITY_PRESETS.map((iq) => (
                    <option key={iq.value} value={iq.value}>{iq.label}</option>
                  ))}
                </select>
              </div>

              {/* FPS selector — Manual */}
              <div className="flex items-center gap-0.5">
                <span className="mr-1 text-slate-600">⚡</span>
                <select
                  className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-xs text-slate-300 cursor-pointer hover:border-slate-600 disabled:opacity-50"
                  value={liveMaxFps}
                  disabled={qualityChanging}
                  onChange={(e) => handleFpsChange(Number(e.target.value))}
                  title="Taxa máxima de quadros por segundo"
                >
                  {FPS_PRESETS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label} FPS</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Monitor selector — troca o monitor capturado (reinicia a sessão de tela) */}
          <div className="flex items-center gap-0.5">
            <span className="mr-1 text-slate-600">🖥</span>
            <select
              className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-xs text-slate-300 cursor-pointer hover:border-slate-600 disabled:opacity-50"
              value={monitorIndex}
              disabled={monitorChanging}
              onChange={(e) => handleMonitorChange(Number(e.target.value))}
              title="Monitor capturado (0 = primário). Trocar reinicia a sessão de tela."
            >
              {monitors.length > 0 ? (
                monitors.map((m) => (
                  <option key={m.index} value={m.index}>
                    {m.isPrimary ? 'Monitor 1 (primário)' : `Monitor ${m.index + 1}`} — {m.width}x{m.height}
                  </option>
                ))
              ) : (
                <option value={0}>Monitor 1 (primário)</option>
              )}
            </select>
          </div>
        </div>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'screen' && (
          screenSession ? (
            <div className="h-full flex flex-col">
              <div className="flex-1">
                <RemoteScreenViewer
                  key={`screen-${screenSession.sessionId}-${reconnectKeys.screen ?? 0}`}
                  natsSubject={screenSession.natsSubject}
                  natsUrl={screenSession.natsUrl}
                  jwt={screenSession.jwt}
                  nkeySeed={screenSession.nkeySeed}
                  quality={liveQuality}
                  codec={liveCodec}
                  onError={(msg) => setErrorMsg(msg)}
                  onLatency={() => {}}
                  onMonitors={(mons) => setMonitors(mons)}
                  onSessionEnded={(reason) => setErrorMsg(`Sessão encerrada: ${reason}`)}
                  scale={screenScale}
                  isFullscreen={screenFullscreen}
                  onToggleFullscreen={() => setScreenFullscreen((v) => !v)}
                />
              </div>
            </div>
          ) : (
            <ConnectPlaceholder
              label="Tela"
              icon="🖥"
              connecting={connectingTab === 'screen'}
              onConnect={() => startTabSession('screen')}
            />
          )
        )}

        {activeTab === 'terminal' && (
          sessions.terminal ? (
            <div className="h-full flex flex-col">
              <div className="flex-1">
                <RemoteTerminal
                  key={`terminal-${sessions.terminal.sessionId}-${reconnectKeys.terminal ?? 0}`}
                  sessionId={sessions.terminal.sessionId}
                  agentId={agentId}
                  natsSubject={sessions.terminal.natsSubject}
                  natsUrl={sessions.terminal.natsUrl}
                  jwt={sessions.terminal.jwt}
                  nkeySeed={sessions.terminal.nkeySeed}
                  onConnectionChange={setTerminalConnected}
                  onShells={(shells) => setAvailableShells(shells)}
                />
              </div>
            </div>
          ) : (
            <ConnectPlaceholder
              label="Terminal"
              icon="⌨️"
              connecting={connectingTab === 'terminal'}
              onConnect={() => startTabSession('terminal')}
            />
          )
        )}

        {activeTab === 'files' && (
          sessions.files ? (
            <div className="h-full flex flex-col min-h-0">
              <div className="flex-1 min-h-0">
                <RemoteFiles
                  key={`files-${sessions.files.sessionId}-${reconnectKeys.files ?? 0}`}
                  sessionId={sessions.files.sessionId}
                  agentId={agentId}
                  natsSubject={sessions.files.natsSubject}
                  natsUrl={sessions.files.natsUrl}
                  jwt={sessions.files.jwt}
                  nkeySeed={sessions.files.nkeySeed}
                />
              </div>
            </div>
          ) : (
            <ConnectPlaceholder
              label="Arquivos"
              icon="📁"
              connecting={connectingTab === 'files'}
              onConnect={() => startTabSession('files')}
            />
          )
        )}

        {activeTab === 'processes' && (
          sessions.processes ? (
            <div className="h-full flex flex-col min-h-0">
              <div className="flex-1 min-h-0">
                <RemoteProcesses
                  key={`processes-${sessions.processes.sessionId}-${reconnectKeys.processes ?? 0}`}
                  sessionId={sessions.processes.sessionId}
                  agentId={agentId}
                  natsSubject={sessions.processes.natsSubject}
                  natsUrl={sessions.processes.natsUrl}
                  jwt={sessions.processes.jwt}
                  nkeySeed={sessions.processes.nkeySeed}
                />
              </div>
            </div>
          ) : (
            <ConnectPlaceholder
              label="Processos"
              icon="🗔"
              connecting={connectingTab === 'processes'}
              onConnect={() => startTabSession('processes')}
            />
          )
        )}

        {activeTab === 'proxy' && (
          <RemoteProxy
            sessionId={sessions.proxy?.sessionId ?? ''}
            agentId={agentId}
            natsSubject={sessions.proxy?.natsSubject}
            jwt={sessions.proxy?.jwt}
            nkeySeed={sessions.proxy?.nkeySeed}
          />
        )}
      </div>

      {/* Barra de rodapé unificada — Reconectar/Encerrar da aba ativa + gravação */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border-t border-slate-700 text-xs">
        {activeSession && (
          <>
            <button
              className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded"
              onClick={() => handleReconnect(activeTab)}
              title={`Reconectar a sessão de ${activeTab}`}
            >
              ⟳ Reconectar
            </button>
            <button
              className="px-2 py-1 bg-rose-700/70 hover:bg-rose-600 text-white rounded"
              onClick={() => stopTabSession(activeTab)}
              title={`Encerrar a sessão de ${activeTab}`}
            >
              ⏹ Encerrar
            </button>
            <span className="mx-1 h-4 w-px bg-slate-700" />
          </>
        )}
        {/* Controles específicos da aba Terminal: select de shell + status */}
        {activeTab === 'terminal' && sessions.terminal && (
          <>
            <span className="text-slate-400">Console</span>
            <select
              value={shell}
              disabled={shellSwitching}
              onChange={e => handleSwitchShell(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-slate-300 text-xs disabled:opacity-50"
            >
              {/* Shells reportados pelo agent via term.ready; fallback estático */}
              {(availableShells.length > 0 ? availableShells : ['powershell', 'cmd']).map((s) => (
                <option key={s} value={s}>
                  {s.startsWith('wsl:') ? s.replace('wsl:', 'WSL: ') : s === 'powershell' ? 'PowerShell' : s === 'cmd' ? 'CMD' : s}
                </option>
              ))}
            </select>
            {shellSwitching && <span className="text-slate-500">trocar shell…</span>}
            <span className={`inline-flex items-center gap-1 ${terminalConnected ? 'text-emerald-400' : 'text-red-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${terminalConnected ? 'bg-emerald-400' : 'bg-red-400'}`} />
              {terminalConnected ? 'Conectado' : 'Desconectado'}
            </span>
            <span className="mx-1 h-4 w-px bg-slate-700" />
          </>
        )}
        {screenSession && (
          <RecordingControls
            agentId={agentId}
            sessionId={screenSession.sessionId}
            onError={(msg) => setErrorMsg(msg)}
          />
        )}
        {/* Controles de escala/fullscreen da tela (aba Tela) */}
        {activeTab === 'screen' && screenSession && (
          <>
            <span className="mx-1 h-4 w-px bg-slate-700" />
            <button
              className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded"
              onClick={() => setScreenScale((s) => (s === 'fit' ? '100%' : 'fit'))}
              title="Alternar escala (Fit / 1:1)"
            >
              {screenScale === 'fit' ? '⊡ Fit' : '⊡ 1:1'}
            </button>
            <button
              className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded"
              onClick={() => setScreenFullscreen((v) => !v)}
              title="Fullscreen (Ctrl+F)"
            >
              {screenFullscreen ? '⛶ Exit' : '⛶ Full'}
            </button>
          </>
        )}
      </div>

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

// Placeholder exibido quando a aba ainda não tem sessão iniciada.
function ConnectPlaceholder({
  label,
  icon,
  connecting,
  onConnect,
}: {
  label: string;
  icon: string;
  connecting: boolean;
  onConnect: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-slate-950 text-slate-500">
      <div className="text-5xl mb-4">{icon}</div>
      <p className="text-sm mb-1">Sessão de {label} não iniciada</p>
      <p className="text-xs text-slate-600 mb-5">
        Clique em Conectar para iniciar a sessão sob demanda (não consome recursos do agent até iniciar).
      </p>
      <button
        className="px-4 py-2 bg-primary/20 text-primary text-sm rounded hover:bg-primary/30 transition-colors disabled:opacity-50"
        onClick={onConnect}
        disabled={connecting}
      >
        {connecting ? 'Conectando…' : `▶ Conectar ${label}`}
      </button>
    </div>
  );
}
