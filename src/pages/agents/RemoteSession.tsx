import { useSearchParams } from 'react-router-dom';
import { Button, Card } from '@/components/ui';
import { ThemeToggle } from '@/components/auth/ThemeToggle';
import { Film, Image, Gauge, Monitor } from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { remoteSessionsApi, type ChangeQualityRequest, type StartRemoteSessionRequest } from '@/api/remote-sessions';
import { agentsApi } from '@/api/agents';
import { sitesApi } from '@/api/sites';
import { clientsApi } from '@/api/clients';
import { configureApiClient } from '@/api/client';
import RemoteScreenViewer, { type MonitorInfo } from '@/modules/remote-screen/RemoteScreenViewer';
import { fullscreenApi } from '@/utils/fullscreen';
import RemoteTerminal from '@/modules/remote-terminal/RemoteTerminal';
import RemoteFiles from '@/modules/remote-files/RemoteFiles';
import RemoteProxy from '@/modules/remote-proxy/RemoteProxy';
import { RemoteProcesses } from '@/modules/remote-processes/RemoteProcesses';
import { RemoteServices } from '@/modules/remote-processes/RemoteServices';
import { RecordingControls } from '@/modules/remote-recording/RecordingControls';
import {
  onCrossTabMessage,
  postCrossTabMessage,
  startActivityPing,
  type CrossTabMessage,
} from '@/auth/crossTabSync';

type Tab = 'screen' | 'terminal' | 'files' | 'proxy' | 'processes' | 'services';

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

// Detecta o erro específico do backend quando já existe uma sessão ativa no agent
// ("Agent already has N active session(s) (max M). Use force=true to override.").
// Usado para acionar o fluxo de sobreposição (force=true) apenas nesse caso.
function isSessionConflictError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // Aceita "has" e "have" ("Agent already has/have N active session(s)") ou a dica
  // explícita "force=true to override" — evita regressão se a mensagem mudar.
  return /already\s+(has|have)/i.test(msg)
    && /active session/i.test(msg);
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
  // Modo do cursor na tela (padrão: somente o cursor local do navegador).
  const [cursorMode, setCursorMode] = useState<'remote' | 'local' | 'both'>('local');
  const screenContainerRef = useRef<HTMLDivElement | null>(null);
  // Shell ativo do terminal (powershell | cmd). Trocar reinicia a sessão de terminal.
  const [shell, setShell] = useState('powershell');
  const [shellSwitching, setShellSwitching] = useState(false);
  // Shells disponíveis reportados pelo agent via term.ready (populará o seletor).
  const [availableShells, setAvailableShells] = useState<string[]>([]);
  // Status de conexão do terminal (reportado pelo RemoteTerminal).
  const [terminalConnected, setTerminalConnected] = useState(false);
  // Sinaliza que o backend rejeitou a criação de sessão por já existir uma
  // ativa no agent (conflito). Mantém visível a ação "Forçar conexão" mesmo
  // sem uma sessão no estado local — caso comum quando outra janela/fluxo
  // deixou uma sessão presa/órfã no agent.
  const [sessionConflict, setSessionConflict] = useState(false);
  // Aba com conflito de sessão pendente de decisão do usuário (forçar ou não).
  // Quando definida, exibe o aviso com botões "Forçar reconexão" / "Cancelar".
  const [forcePromptTab, setForcePromptTab] = useState<Tab | null>(null);
  const [forcePromptConnecting, setForcePromptConnecting] = useState(false);

  const screenSession = sessions.screen;

  // Processos e Serviços compartilham o MESMO subject/sessão (kind 'processes'
  // no backend — não existe RemoteSessionKind.Services). Uma sessão ativa de
  // processos pode ser reutilizada pela aba serviços (e vice-versa), evitando
  // stop+start desnecessário a cada troca de aba.
  const processSession = sessions.processes ?? sessions.services;

  const CODECS: { value: NonNullable<ChangeQualityRequest['codec']>; label: string }[] = [
    { value: 'webp', label: 'WebP' },
    { value: 'jpeg', label: 'JPEG' },
  ];

  // Range aceito pelo agent para override manual (quality.go: imageQualityMin/Max 10-90).
  const IMAGE_QUALITY_PRESETS = [
    { value: 90, label: '90%' },
    { value: 80, label: '80%' },
    { value: 70, label: '70%' },
    { value: 60, label: '60%' },
    { value: 50, label: '50%' },
    { value: 40, label: '40%' },
    { value: 30, label: '30%' },
    { value: 20, label: '20%' },
    { value: 10, label: '10%' },
  ];

  const FPS_PRESETS = [
    { value: 0, label: 'Sem limite' },
    { value: 30, label: '30' },
    { value: 20, label: '20 (Fast)' },
    { value: 12, label: '12 (Médio)' },
    { value: 5, label: '5 (Baixo)' },
    { value: 2, label: '2 (Mínimo)' },
  ];

  // ── Aviso de conflito de sessão ──
  // Quando já existe uma sessão ativa no agent, não encerramos a anterior
  // silenciosamente: exibimos um aviso com a opção de forçar a reconexão
  // (força=true encerra a anterior e cria a nova).
  const openForcePrompt = useCallback((tab: Tab) => {
    setForcePromptTab(tab);
  }, []);

  const closeForcePrompt = useCallback(() => {
    setForcePromptTab(null);
    setForcePromptConnecting(false);
  }, []);

  // ── Inicia a sessão de uma aba sob demanda ──
  // `force` permite sobrepor uma sessão ativa existente do mesmo agent (o
  // backend encerra a anterior e cria a nova). No fluxo normal (force=false)
  // um conflito NÃO é resolvido automaticamente: o usuário é avisado e decide
  // se quer forçar.
  const startTabSession = useCallback(async (tab: Tab, force = false) => {
    if (!agentId || connectingTab) return;
    setConnectingTab(tab);
    setErrorMsg(null);
    setSessionConflict(false);
    setForcePromptTab(null);

    // Processos e Serviços compartilham a MESMA sessão (kind 'processes').
    // Se a aba "irmã" já está conectada, reutiliza a sessão em vez de criar
    // nova (evita stop+start desnecessário). Sem `force`.
    if (!force && (tab === 'processes' || tab === 'services')) {
      const shared = tab === 'processes' ? sessions.services : sessions.processes;
      if (shared) {
        setSessions((prev) => ({ ...prev, [tab]: shared }));
        setConnectingTab(null);
        return;
      }
    }

    const run = async (useForce: boolean) => {
      // Com MaxConcurrentSessionsPerAgent=1, abrir uma nova aba substitui a
      // sessão ativa de OUTRA aba: encerra a anterior explicitamente (stop no
      // agent + limpa estado) antes de iniciar a nova — comportamento "a aba
      // ativa substitui", sem orfãs e sem force silencioso no backend.
      // Processos/Serviços compartilham sessão: a aba irmã não é encerrada
      // (será sobrescrita com a nova sessão do mesmo kind abaixo).
      const sibling = tab === 'processes' ? 'services' : tab === 'services' ? 'processes' : null;
      const others = (Object.entries(sessions) as [Tab, TabSession | undefined][])
        .filter(([k]) => k !== tab && k !== sibling)
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

      // 'services' comparte a mesma sessão/subject de 'processes' (backend
      // RemoteSessionKind.Processes). Enviamos o kind 'processes' no request.
      const kind = tab === 'screen' ? 'screen' : tab === 'services' ? 'processes' : tab; // screen | terminal | files | processes | proxy
      const session = await remoteSessionsApi.startSession(agentId, {
        agentId,
        kind: kind as StartRemoteSessionRequest['kind'],
        transport: transport as StartRemoteSessionRequest['transport'],
        quality: liveQuality as StartRemoteSessionRequest['quality'],
        codec: liveCodec as StartRemoteSessionRequest['codec'],
        durationMinutes: 30,
        // force=false (default): não mata outras sessões silenciosamente. As
        // sessões concorrentes já foram encerradas acima com stop explícito.
        // force=true: sobrepõe uma sessão ativa existente do mesmo agent.
        force: useForce,
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

      setSessions((prev) => {
        // Processos/Serviços compartilham a sessão: sobrescreve AMBAS as chaves
        // com a nova sessão, mantendo consistência (evita que a aba "irmã"
        // guarde uma sessão antiga/dead com subject diferente).
        if (tab === 'processes' || tab === 'services') {
          const shared: TabSession = {
            sessionId: session.sessionId,
            natsSubject: session.natsSubject,
            natsUrl,
            jwt,
            nkeySeed,
            expiresAtUtc: session.expiresAtUtc,
            kind: session.kind,
            qualityProfile: session.qualityProfile,
            codec: session.codec,
          };
          return { ...prev, processes: shared, services: shared };
        }
        return {
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
        };
      });
    };

    try {
      await run(force);
    } catch (err) {
      // Conflito de sessão: já existe uma sessão ativa no agent (de outra
      // janela/fluxo). NÃO encerramos a sessão anterior silenciosamente —
      // apenas avisamos e damos ao usuário a opção de forçar a reconexão
      // (força=true encerra a anterior e cria a nova).
      if (!force && isSessionConflictError(err)) {
        setSessionConflict(true);
        openForcePrompt(tab);
        return;
      }
      // Qualquer outro erro de conflito não resolvido também habilita o botão.
      if (isSessionConflictError(err)) setSessionConflict(true);
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao iniciar sessão.');
    } finally {
      setConnectingTab(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, connectingTab, transport, liveQuality, liveCodec, monitorIndex, sessions]);

  // Inicia a sessão da aba com força (vinda do aviso de conflito de sessão).
  const confirmForce = useCallback(async (tab: Tab) => {
    if (forcePromptConnecting) return;
    setForcePromptConnecting(true);
    setErrorMsg(null);
    try {
      await startTabSession(tab, true);
      // Sucesso: fecha o aviso e limpa o conflito. (startTabSession já seta
      // setForcePromptTab(null)/setSessionConflict(false) no início.)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao forçar a reconexão.');
    } finally {
      setForcePromptConnecting(false);
    }
  }, [startTabSession, forcePromptConnecting]);

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
    // Processos e Serviços compartilham a mesma sessão: encerrar uma aba do
    // par limpa as duas, evitando que a sessão permaneça "ativa" na irmã.
    if (tab === 'processes' || tab === 'services') {
      setSessions((prev) => ({ ...prev, processes: undefined, services: undefined }));
    } else {
      setSessions((prev) => ({ ...prev, [tab]: undefined }));
    }
    // Reseta o status de conexão do terminal ao encerrar a sessão.
    if (tab === 'terminal') setTerminalConnected(false);
    // Ao encerrar explicitamente, não há mais sessão presa — limpa o conflito.
    setSessionConflict(false);
  }, [agentId, sessions]);

  // ── Troca de shell do terminal: reinicia a sessão de terminal com o novo shell ──
  const handleSwitchShell = useCallback(async (newShell: string) => {
    if (newShell === shell || shellSwitching || !agentId) return;
    setShellSwitching(true);
    setErrorMsg(null);

    // Encerra a sessão de terminal atual (se houver) — ambos os caminhos (normal
    // e force) dependem de uma shell válida; encerra antes de tentar.
    const current = sessions.terminal;
    if (current) {
      try { await remoteSessionsApi.stopSession(agentId, current.sessionId); } catch { /* best-effort */ }
    }

    const startNew = async (useForce: boolean) => {
      const session = await remoteSessionsApi.startSession(agentId, {
        agentId,
        kind: 'terminal',
        transport: transport as StartRemoteSessionRequest['transport'],
        quality: liveQuality as StartRemoteSessionRequest['quality'],
        codec: liveCodec as StartRemoteSessionRequest['codec'],
        durationMinutes: 30,
        force: useForce,
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
    };

    try {
      await startNew(false);
    } catch (err) {
      // Sessão órfã no agent → refaz UMA vez com force=true (encerra e cria nova).
      if (isSessionConflictError(err)) {
        try { await startNew(true); }
        catch { /* reporta o erro original abaixo */ }
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Falha ao trocar de shell.');
      }
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

    // Encerra a sessão de tela atual (se houver) antes de iniciar a nova.
    if (screenSession) {
      try { await remoteSessionsApi.stopSession(agentId, screenSession.sessionId); } catch { /* best-effort */ }
    }

    const startNew = async (useForce: boolean) => {
      const session = await remoteSessionsApi.startSession(agentId, {
        agentId,
        kind: 'screen',
        transport: transport as StartRemoteSessionRequest['transport'],
        quality: liveQuality as StartRemoteSessionRequest['quality'],
        codec: liveCodec as StartRemoteSessionRequest['codec'],
        durationMinutes: 30,
        force: useForce,
        monitorIndex: newMonitor,
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
    };

    try {
      await startNew(false);
    } catch (err) {
      // Sessão órfã no agent → refaz UMA vez com force=true (encerra e cria nova).
      if (isSessionConflictError(err)) {
        try {
          await startNew(true);
          setErrorMsg('Sessão anterior encerrada e nova conexão iniciada.');
        } catch { /* reporta o erro original abaixo */ }
      } else {
        console.error('Falha ao trocar de monitor:', err);
        setErrorMsg(err instanceof Error ? err.message : 'Falha ao trocar de monitor.');
      }
    } finally {
      setMonitorChanging(false);
    }
  }, [monitorChanging, agentId, screenSession, transport, liveQuality, liveCodec]);

  // Timer de expiração removido — a sessão gerencia a própria expiração e o
  // backend encerra quando necessário (viewer recebe onSessionEnded).

  const handleStop = async () => {
    // Encerra TODAS as sessões ativas (não só a da aba atual), para não
    // deixar sessões órfãs consumindo recursos do agent. Deduplica por
    // sessionId (Processos e Serviços podem apontar para a MESMA sessão).
    const active = (Object.values(sessions).filter(Boolean) as TabSession[]);
    const seen = new Set<string>();
    const unique = active.filter((s) => (seen.has(s.sessionId) ? false : (seen.add(s.sessionId), true)));
    await Promise.allSettled(
      unique.map((s) => remoteSessionsApi.stopSession(agentId, s.sessionId)),
    );
    window.close();
  };

  // Alterna o fullscreen da tela (barra de rodapé + Ctrl+F no viewer).
  // O estado é sincronizado pelo listener `fullscreenchange` (cobre Esc/API).
  const toggleScreenFullscreen = useCallback(async () => {
    const target = screenContainerRef.current ?? document.documentElement;
    const ok = fullscreenApi.isFullscreen()
      ? await fullscreenApi.exit()
      : await fullscreenApi.request(target);
    if (!ok) setErrorMsg('Não foi possível alternar o modo tela cheia.');
  }, []);

  // Mantém o estado de fullscreen em sincronia com o estado real do browser
  // (Esc, mudanças externas, etc.).
  useEffect(() => {
    return fullscreenApi.onChange((fs) => setScreenFullscreen(fs));
  }, []);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'screen', label: 'Tela' },
    { key: 'terminal', label: 'Terminal' },
    { key: 'files', label: 'Arquivos' },
    { key: 'processes', label: 'Processos' },
    { key: 'services', label: 'Serviços' },
    { key: 'proxy', label: 'Proxy' },
  ];

  if (!agentId) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Card className="p-6 text-center">
          <p className="text-danger">Parâmetros inválidos. Feche esta janela e tente novamente.</p>
        </Card>
      </div>
    );
  }

  const activeSession = sessions[activeTab];
  const isActiveConnected = !!activeSession;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 bg-surface border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-sm font-semibold flex items-center gap-2 whitespace-nowrap">
            Acesso Remoto — {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
          </h1>
          {agentIdentity && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-hover text-foreground/80 text-xs font-medium truncate max-w-[40vw]"
              title={`${agentIdentity.hostname} — ${agentIdentity.site}`}
            >
              <span className="text-muted">🖥</span>
              <span className="text-muted">{agentIdentity.client || '—'}</span>
              <span className="text-muted-foreground">→</span>
              <span className="text-muted">{agentIdentity.site || '—'}</span>
              <span className="text-muted-foreground">→</span>
              <strong className="text-foreground">{agentIdentity.hostname}</strong>
            </span>
          )}
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${isActiveConnected ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>
            {isActiveConnected ? 'Conectado' : 'Não conectado'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Button variant="danger" size="sm" onClick={handleStop} title="Encerra todas as sessões ativas e fecha esta janela">Fechar</Button>
          <ThemeToggle />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 py-1.5 bg-surface-light border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`px-3 py-1 text-xs rounded-t transition-colors ${
              activeTab === tab.key
                ? 'bg-surface-hover text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface'
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            {(tab.key === 'processes' || tab.key === 'services')
              ? processSession && (
                <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-success align-middle" title="Sessão ativa" />
              )
              : sessions[tab.key] && (
                <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-success align-middle" title="Sessão ativa" />
              )}
          </button>
        ))}
        {/* Status bar info — controles de qualidade em tempo real (aba Tela) */}
        {activeTab === 'screen' && screenSession && (
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          {/* Auto/Manual toggle */}
          <div className="flex items-center gap-1">
            <button
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                autoMode
                  ? 'bg-success/20 text-success border border-success/30'
                  : 'bg-surface text-muted-foreground border border-border hover:text-foreground'
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
                  ? 'bg-accent/20 text-accent border border-accent/30'
                  : 'bg-surface text-muted-foreground border border-border hover:text-foreground'
              }`}
              onClick={() => { if (autoMode) handleAutoToggle(); }}
              disabled={qualityChanging}
              title="Modo manual: escolha codec, qualidade e FPS"
            >
              Manual
            </button>
          </div>

          {/* Em Auto: nenhum controle/badge de qualidade (o agent adapta sozinho).
              Em Manual: controles finos. */}
          {!autoMode && (
            <>
              {/* Codec selector — Manual */}
              <div className="flex items-center gap-0.5">
                <Film className="mr-1 h-3.5 w-3.5 text-muted" aria-hidden />
                <select
                  className="bg-surface border border-border rounded px-1 py-0.5 text-xs text-foreground cursor-pointer hover:border-border-strong disabled:opacity-50"
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
                <Image className="mr-1 h-3.5 w-3.5 text-muted" aria-hidden />
                <select
                  className="bg-surface border border-border rounded px-1 py-0.5 text-xs text-foreground cursor-pointer hover:border-border-strong disabled:opacity-50"
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
                <Gauge className="mr-1 h-3.5 w-3.5 text-muted" aria-hidden />
                <select
                  className="bg-surface border border-border rounded px-1 py-0.5 text-xs text-foreground cursor-pointer hover:border-border-strong disabled:opacity-50"
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
            <Monitor className="mr-1 h-3.5 w-3.5 text-muted" aria-hidden />
            <select
              className="bg-surface border border-border rounded px-1 py-0.5 text-xs text-foreground cursor-pointer hover:border-border-strong disabled:opacity-50"
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
      {/* min-h-0: sem ele, o flex-1 não encolhe abaixo do conteúdo (canvas) e o
          viewer calcula o fit com uma altura maior que a viewport — ao reduzir a
          ALTURA da janela a tela remota não redimensionava. */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'screen' && (
          screenSession ? (
            <div ref={screenContainerRef} className="h-full min-h-0 flex flex-col">
              <div className="flex-1 min-h-0">
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
                  onToggleFullscreen={toggleScreenFullscreen}
                  cursorMode={cursorMode}
                />
              </div>
            </div>
          ) : (
            <ConnectPlaceholder
              label="Tela"
              icon="🖥"
              connecting={connectingTab === 'screen'}
              onConnect={() => startTabSession('screen')}
              conflict={sessionConflict}
              onForce={() => startTabSession('screen', true)}
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
              conflict={sessionConflict}
              onForce={() => startTabSession('terminal', true)}
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
              conflict={sessionConflict}
              onForce={() => startTabSession('files', true)}
            />
          )
        )}

        {activeTab === 'processes' && (
          processSession ? (
            <div className="h-full flex flex-col min-h-0">
              <div className="flex-1 min-h-0">
                <RemoteProcesses
                  key={`processes-${processSession.sessionId}-${reconnectKeys.processes ?? 0}`}
                  sessionId={processSession.sessionId}
                  agentId={agentId}
                  natsSubject={processSession.natsSubject}
                  natsUrl={processSession.natsUrl}
                  jwt={processSession.jwt}
                  nkeySeed={processSession.nkeySeed}
                />
              </div>
            </div>
          ) : (
            <ConnectPlaceholder
              label="Processos"
              icon="🗔"
              connecting={connectingTab === 'processes'}
              onConnect={() => startTabSession('processes')}
              conflict={sessionConflict}
              onForce={() => startTabSession('processes', true)}
            />
          )
        )}

        {activeTab === 'services' && (
          processSession ? (
            <div className="h-full flex flex-col min-h-0">
              <div className="flex-1 min-h-0">
                <RemoteServices
                  key={`services-${processSession.sessionId}-${reconnectKeys.services ?? 0}`}
                  sessionId={processSession.sessionId}
                  agentId={agentId}
                  natsSubject={processSession.natsSubject}
                  natsUrl={processSession.natsUrl}
                  jwt={processSession.jwt}
                  nkeySeed={processSession.nkeySeed}
                />
              </div>
            </div>
          ) : (
            <ConnectPlaceholder
              label="Serviços"
              icon="⚙"
              connecting={connectingTab === 'services'}
              onConnect={() => startTabSession('services')}
              conflict={sessionConflict}
              onForce={() => startTabSession('services', true)}
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
      <div className="flex items-center gap-2 px-3 py-1.5 bg-surface border-t border-border text-xs">
        {/* Mesmo sem sessão ativa, se houver conflito (sessão presa no agent) o
            botão "Forçar conexão" permanece acessível para sobrepor. */}
        {activeSession && (
          <>
            <button
              className="px-2 py-1 bg-surface-hover hover:bg-border text-foreground rounded"
              onClick={() => handleReconnect(activeTab)}
              title={`Reconectar a sessão de ${activeTab}`}
            >
              ⟳ Reconectar
            </button>
            <button
              className="px-2 py-1 bg-danger/70 hover:bg-danger text-white rounded"
              onClick={() => stopTabSession(activeTab)}
              title={`Encerrar a sessão de ${activeTab}`}
            >
              ⏹ Encerrar
            </button>
            <span className="mx-1 h-4 w-px bg-border" />
          </>
        )}
        {/* Controles específicos da aba Terminal: select de shell + status */}
        {activeTab === 'terminal' && sessions.terminal && (
          <>
            <span className="text-muted-foreground">Console</span>
            <select
              value={shell}
              disabled={shellSwitching}
              onChange={e => handleSwitchShell(e.target.value)}
              className="bg-surface border border-border rounded px-1 py-0.5 text-foreground text-xs disabled:opacity-50"
            >
              {/* Shells reportados pelo agent via term.ready; fallback estático */}
              {(availableShells.length > 0 ? availableShells : ['powershell', 'cmd']).map((s) => (
                <option key={s} value={s}>
                  {s.startsWith('wsl:') ? s.replace('wsl:', 'WSL: ') : s === 'powershell' ? 'PowerShell' : s === 'cmd' ? 'CMD' : s}
                </option>
              ))}
            </select>
            {shellSwitching && <span className="text-muted">trocar shell…</span>}
            <span className={`inline-flex items-center gap-1 ${terminalConnected ? 'text-success' : 'text-danger'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${terminalConnected ? 'bg-success' : 'bg-danger'}`} />
              {terminalConnected ? 'Conectado' : 'Desconectado'}
            </span>
            <span className="mx-1 h-4 w-px bg-border" />
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
            <span className="mx-1 h-4 w-px bg-border" />
            <label className="inline-flex items-center gap-1 text-muted-foreground">
              <span title="Modo do cursor na tela">🖱</span>
              <select
                value={cursorMode}
                onChange={(e) => setCursorMode(e.target.value as 'remote' | 'local' | 'both')}
                className="bg-surface border border-border rounded px-1 py-0.5 text-foreground text-xs"
                title="Modo do cursor (Local = cursor do navegador; Remoto = cursor da máquina remota)"
              >
                <option value="local">Local</option>
                <option value="remote">Remoto</option>
                <option value="both">Ambos</option>
              </select>
            </label>
            <button
              className="px-2 py-1 bg-surface-hover hover:bg-border text-foreground rounded"
              onClick={() => setScreenScale((s) => (s === 'fit' ? '100%' : 'fit'))}
              title="Alternar escala (Fit / 1:1)"
            >
              {screenScale === 'fit' ? '⊡ Fit' : '⊡ 1:1'}
            </button>
            <button
              className="px-2 py-1 bg-surface-hover hover:bg-border text-foreground rounded"
              onClick={toggleScreenFullscreen}
              title="Fullscreen (Ctrl+F)"
            >
              {screenFullscreen ? '⛶ Exit' : '⛶ Full'}
            </button>
          </>
        )}
      </div>

      {/* Aviso de conflito de sessão — já existe conexão ativa no agent */}
      {forcePromptTab && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
          <div className="bg-surface border border-border rounded-lg shadow-lg p-6 max-w-md mx-4 text-center">
            <div className="text-4xl mb-3">🔌</div>
            <h2 className="text-base font-semibold text-foreground mb-2">
              Já existe uma conexão aberta
            </h2>
            <p className="text-sm text-muted-foreground mb-5">
              Há uma sessão remota ativa neste agente. Para conectar, é necessário
              encerrar a sessão existente. Deseja <strong className="text-foreground">forçar a reconexão</strong>?
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                className="px-4 py-2 bg-warning/70 hover:bg-warning text-white text-sm rounded disabled:opacity-50"
                onClick={() => confirmForce(forcePromptTab)}
                disabled={forcePromptConnecting}
              >
                {forcePromptConnecting ? 'Forçando…' : '⚡ Forçar reconexão'}
              </button>
              <button
                className="px-4 py-2 bg-surface-hover hover:bg-border text-foreground text-sm rounded disabled:opacity-50"
                onClick={closeForcePrompt}
                disabled={forcePromptConnecting}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error toast */}
      {errorMsg && (
        <div className="absolute bottom-4 right-4 bg-danger/80 text-white px-4 py-2 rounded text-sm max-w-sm z-50">
          {errorMsg}
          <button className="ml-2 text-white/70 hover:text-white" onClick={() => setErrorMsg(null)}>✕</button>
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
  conflict = false,
  onForce,
  forcing = false,
}: {
  label: string;
  icon: string;
  connecting: boolean;
  onConnect: () => void;
  /** Existe sessão ativa no agent que impede a conexão (mesmo sem sessão local). */
  conflict?: boolean;
  /** Ação "Forçar conexão" — sobrepõe a sessão ativa existente do agent. */
  onForce?: () => void;
  forcing?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
      <div className="text-5xl mb-4">{icon}</div>
      <p className="text-sm mb-1">Sessão de {label} não iniciada</p>
      <p className="text-xs text-muted mb-5">
        Clique em Conectar para iniciar a sessão sob demanda (não consome recursos do agent até iniciar).
      </p>
      <div className="flex items-center gap-2">
        <button
          className="px-4 py-2 bg-primary/20 text-primary text-sm rounded hover:bg-primary/30 transition-colors disabled:opacity-50"
          onClick={onConnect}
          disabled={connecting || forcing}
        >
          {connecting ? 'Conectando…' : `▶ Conectar ${label}`}
        </button>
        {conflict && onForce && (
          <button
            className="px-4 py-2 bg-warning/70 hover:bg-warning text-white text-sm rounded disabled:opacity-50"
            onClick={onForce}
            disabled={connecting || forcing}
            title="Encerra a sessão remota existente do agente e inicia uma nova conexão. Use se a sessão anterior estiver presa/órfã em outra janela."
          >
            {forcing ? 'Forçando…' : '⚡ Forçar conexão'}
          </button>
        )}
      </div>
    </div>
  );
}
