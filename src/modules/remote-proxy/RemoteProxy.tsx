import { useCallback, useEffect, useRef, useState } from 'react';
import {
  bytesFromBase64,
  useProxyStream,
  type ProxyHttpResponse,
  type TunnelOpenOptions,
} from './useProxyStream';
import {
  detectExternalDependencies,
  injectBaseTag,
  resolveBaseUrl,
} from './proxyRender';
import type { BrowsableDestination } from './proxyDestinations';

interface RemoteProxyProps {
  sessionId: string;
  agentId: string;
  natsSubject?: string;
  /** URL WebSocket do NATS escopado da sessão (vem do start da sessão). */
  natsUrl?: string;
  jwt?: string;
  nkeySeed?: string;
  getFreshCredentials?: () => Promise<string>;
  /**
   * Destinos aprovados para o escopo deste agente, derivados da allowlist
   * cadastrada. Substituem os antigos atalhos chumbados no código, que
   * apareciam para todo cliente (inclusive sem esses equipamentos) e cujo
   * clique era bloqueado pela própria allowlist.
   */
  destinations?: BrowsableDestination[];
}

type Mode = 'http' | 'tunnel';

interface LogEntry {
  at: number;
  kind: 'info' | 'warn' | 'error';
  text: string;
}

const MAX_LOG_ENTRIES = 40;

const STATUS_LABEL: Record<string, string> = {
  connecting: 'Conectando ao agent…',
  connected: 'Conectado ao agent',
  error: 'Falha na conexão',
};

/**
 * Proxy LAN do acesso remoto (F22/R2). TODO o tráfego passa pelo agent via
 * NATS (.proxy.req/.proxy.resp para HTTP e .tunnel.in/.tunnel.out para TCP/SSH):
 * a página nunca carrega a URL externa direto num iframe — a allowlist/SSRF
 * do agent é a barreira e o resultado chega como conteúdo para o srcdoc.
 */
export default function RemoteProxy({
  sessionId: _sessionId,
  agentId: _agentId,
  natsSubject = '',
  natsUrl = '',
  jwt = '',
  nkeySeed = '',
  getFreshCredentials,
  destinations = [],
}: RemoteProxyProps) {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<Mode>('http');
  const [pageHtml, setPageHtml] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageStatus, setPageStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [showLog, setShowLog] = useState(false);

  // Túnel TCP/SSH
  const [tunnelHost, setTunnelHost] = useState('');
  const [tunnelPort, setTunnelPort] = useState('');
  const [tunnelProtocol, setTunnelProtocol] = useState<'tcp' | 'ssh'>('tcp');
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [openStreams, setOpenStreams] = useState<{ streamId: number; target: string }[]>([]);

  const pushLog = useCallback((kind: LogEntry['kind'], text: string) => {
    setLog((prev) => {
      const next = [...prev, { at: Date.now(), kind, text }];
      return next.length > MAX_LOG_ENTRIES ? next.slice(next.length - MAX_LOG_ENTRIES) : next;
    });
  }, []);

  const stream = useProxyStream({
    natsSubject,
    natsUrl,
    jwt,
    nkeySeed,
    getFreshCredentials,
  });

  // Aviso de conexão no log (uma linha por transição relevante).
  const statusRef = useRef(stream.status);
  useEffect(() => {
    if (statusRef.current !== stream.status) {
      statusRef.current = stream.status;
      pushLog(stream.status === 'connected' ? 'info' : 'warn', STATUS_LABEL[stream.status] ?? stream.status);
    }
    if (stream.error) pushLog('error', stream.error);
  }, [stream.status, stream.error, pushLog]);

  // Túnel: registra fechos e mantém a lista de streams abertos.
  useEffect(() => stream.onTunnelClose((streamId, reason) => {
    setOpenStreams((prev) => prev.filter((s) => s.streamId !== streamId));
    pushLog('warn', `Túnel #${streamId} encerrado: ${reason}`);
  }), [stream, pushLog]);

  useEffect(() => stream.onTunnelControl((msg) => {
    if (msg.op === 'opened') {
      pushLog('info', `Túnel #${msg.streamId ?? '?'} aberto (${msg.targetHost ?? ''}:${msg.targetPort ?? ''})`);
    } else if (msg.op === 'error') {
      pushLog('error', `Túnel #${msg.streamId ?? '?'}: ${msg.error ?? 'erro no agent'}`);
    }
  }), [stream, pushLog]);

  const navigate = useCallback(async (targetUrl: string) => {
    const trimmed = targetUrl.trim();
    if (!trimmed) return; // URL vazia/só espaços: não publica nada
    setPageStatus('loading');
    setPageError(null);
    try {
      const resp: ProxyHttpResponse = await stream.httpRequest({ url: trimmed, method: 'GET' });
      if (!resp.success) {
        setPageStatus('error');
        const msg = resp.error
          ? `Erro ${resp.statusCode ?? ''}: ${resp.error}`
          : `Erro ${resp.statusCode ?? 'desconhecido'} no proxy LAN`;
        setPageError(msg);
        pushLog('error', `${trimmed} → ${msg}`);
        return;
      }
      const bytes = bytesFromBase64(resp.bodyBase64);
      const rawHtml = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

      // Injeta <base href> com a URL EFETIVA da resposta. Sem isto o srcdoc não
      // tem origem e todo recurso relativo (CSS, imagens) é resolvido contra
      // about:srcdoc e falha — a página aparece sem estilo, "quebrada".
      // finalUrl cobre o caso de redirect (ex.: "/" -> "/portal/").
      const baseUrl = resolveBaseUrl(trimmed, resp.finalUrl);
      const html = injectBaseTag(rawHtml, baseUrl);

      setPageHtml(html);
      setPageStatus('loaded');
      pushLog('info', `${trimmed} → HTTP ${resp.statusCode ?? 200} (${bytes.length} bytes)`);
      if (baseUrl) pushLog('info', `Base de resolução: ${baseUrl}`);

      // Avisa (não bloqueia) quando a página depende de recursos que o proxy
      // HTTP não transporta: eles exigem acesso DIRETO do navegador à internet,
      // o que contraria o modelo do proxy e falha em rede isolada.
      const deps = detectExternalDependencies(rawHtml);
      if (deps.hasExternalAssets) {
        pushLog(
          'warn',
          'A página referencia CSS/JS externos: o proxy transporta o documento, não os sub-recursos. Para navegar o site completo, use o modo Túnel TCP/SSH.',
        );
      }
      if (deps.hasCspMeta) {
        pushLog(
          'warn',
          'A página declara Content-Security-Policy: parte do conteúdo pode ser bloqueada pelo navegador dentro do frame.',
        );
      }

      if (resp.truncated) pushLog('warn', `Resposta de ${trimmed} foi truncada pelo agent.`);
    } catch (err) {
      setPageStatus('error');
      const msg = err instanceof Error ? err.message : String(err);
      setPageError(`Erro: ${msg}`);
      pushLog('error', `${trimmed} → ${msg}`);
    }
  }, [stream, pushLog]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    void navigate(url);
  }, [url, navigate]);

  const openTunnelNow = useCallback(async () => {
    const host = tunnelHost.trim();
    const port = Number.parseInt(tunnelPort, 10);
    if (!host || !Number.isFinite(port) || port <= 0 || port > 65535) {
      pushLog('warn', 'Informe host e porta válidos para o túnel.');
      return;
    }
    setTunnelBusy(true);
    try {
      const opts: TunnelOpenOptions = { targetHost: host, targetPort: port, protocol: tunnelProtocol };
      const streamId = await stream.openTunnel(opts);
      setOpenStreams((prev) => [...prev, { streamId, target: `${host}:${port}` }]);
      pushLog('info', `Abrindo túnel #${streamId} (${tunnelProtocol.toUpperCase()} ${host}:${port})…`);
    } catch (err) {
      pushLog('error', `Falha ao abrir túnel: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTunnelBusy(false);
    }
  }, [tunnelHost, tunnelPort, tunnelProtocol, stream, pushLog]);

  const hasSession = !!natsSubject && !!natsUrl;

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Barra de URL (faixa única) + alternância Navegação / Túnel */}
      <div className="flex items-center gap-2 px-3 py-2 bg-surface border-b border-border">
        <button
          type="button"
          className="rounded px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          onClick={() => setMode((m) => (m === 'http' ? 'tunnel' : 'http'))}
          title="Alternar entre navegação HTTP e túnel TCP/SSH"
        >
          {mode === 'http' ? '⇄ Túnel TCP/SSH' : '⇄ Navegação HTTP'}
        </button>
        {mode === 'http' ? (
          <form onSubmit={handleSubmit} className="flex flex-1 items-center gap-2">
            <span className="text-muted text-sm">🔗</span>
            <input
              type="text"
              className="flex-1 bg-surface border border-border rounded px-3 py-1.5 text-sm text-foreground font-mono outline-none focus:border-primary/50"
              placeholder="http://<ip-do-equipamento>/ (ex.: http://192.168.10.250:8006/)"
              value={url}
              onChange={e => setUrl(e.target.value)}
              aria-label="URL de destino na rede local"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-primary/20 text-primary text-sm rounded hover:bg-primary/30 transition-colors"
            >
              Navegar
            </button>
            {destinations.length > 0 && (
              <div
                className="flex shrink-0 items-center gap-1 overflow-x-auto"
                role="group"
                aria-label="Destinos aprovados para este escopo"
              >
                {destinations.map(d => (
                  <button
                    key={d.url}
                    type="button"
                    className="whitespace-nowrap rounded px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                    title={`${d.label} — ${d.url}`}
                    onClick={() => { setUrl(d.url); void navigate(d.url); }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </form>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); void openTunnelNow(); }}
            className="flex flex-1 items-center gap-2"
          >
            <span className="text-muted text-sm">🔌</span>
            <input
              type="text"
              className="flex-1 min-w-0 bg-surface border border-border rounded px-3 py-1.5 text-sm text-foreground font-mono outline-none focus:border-primary/50"
              placeholder="host (ex.: 192.168.1.10)"
              value={tunnelHost}
              onChange={e => setTunnelHost(e.target.value)}
              aria-label="Host de destino do túnel"
            />
            <input
              type="text"
              className="w-20 bg-surface border border-border rounded px-3 py-1.5 text-sm text-foreground font-mono outline-none focus:border-primary/50"
              placeholder="porta"
              value={tunnelPort}
              onChange={e => setTunnelPort(e.target.value)}
              aria-label="Porta de destino do túnel"
            />
            <select
              className="bg-surface border border-border rounded px-1 py-1.5 text-xs text-foreground cursor-pointer"
              value={tunnelProtocol}
              onChange={e => setTunnelProtocol(e.target.value as 'tcp' | 'ssh')}
              aria-label="Protocolo do túnel"
            >
              <option value="tcp">TCP</option>
              <option value="ssh">SSH</option>
            </select>
            <button
              type="submit"
              className="px-3 py-1.5 bg-primary/20 text-primary text-sm rounded hover:bg-primary/30 transition-colors disabled:opacity-50"
              disabled={tunnelBusy}
            >
              {tunnelBusy ? 'Abrindo…' : 'Abrir túnel'}
            </button>
          </form>
        )}
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs whitespace-nowrap ${
            stream.status === 'connected'
              ? 'bg-success/20 text-success'
              : stream.status === 'error'
                ? 'bg-danger/20 text-danger'
                : 'bg-warning/20 text-warning'
          }`}
          title={stream.error ?? undefined}
        >
          <span className={`inline-block w-1.5 h-1.5 rounded-full bg-current`} aria-hidden />
          {STATUS_LABEL[stream.status] ?? stream.status}
        </span>
        <button
          type="button"
          className="rounded px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          onClick={() => setShowLog((v) => !v)}
          title="Mostrar/ocultar o log de status do proxy"
        >
          📋 Log
        </button>
      </div>

      {/* Aviso de allowlist/SSRF: a política é aplicada no agent (fail closed). */}
      <div className="px-3 py-1 bg-warning/20 text-warning text-xs">
        ⚠ O agent aplica a allowlist de destinos (proteção SSRF). Destinos fora da lista são bloqueados com erro.
        O modo HTTP transporta <strong>um documento</strong> por vez: páginas que dependem de CSS/JS
        externos podem aparecer sem estilo. Para navegar um site completo, use o Túnel TCP/SSH.
      </div>

      {!hasSession && (
        <div className="px-3 py-1 bg-surface text-muted-foreground text-xs">
          Sessão do proxy não iniciada — clique em Conectar para abrir a sessão no agent.
        </div>
      )}

      {/* Log de status */}
      {showLog && (
        <div className="max-h-40 overflow-auto border-b border-border bg-surface px-3 py-2 font-mono text-[11px] leading-4">
          {log.length === 0 && <div className="text-muted">Sem eventos ainda.</div>}
          {log.map((entry, i) => (
            <div
              key={`${entry.at}-${i}`}
              className={entry.kind === 'error' ? 'text-danger' : entry.kind === 'warn' ? 'text-warning' : 'text-foreground'}
            >
              {new Date(entry.at).toLocaleTimeString()} — {entry.text}
            </div>
          ))}
        </div>
      )}

      {/* Conteúdo: navegação HTTP via srcdoc (nunca URL externa direta) ou painel do túnel */}
      {mode === 'http' ? (
        <div className="flex-1 relative">
          {pageStatus === 'loading' && (
            <div className="px-3 py-1 bg-warning/30 text-warning text-xs">Carregando via agent…</div>
          )}
          {pageError && (
            <div className="px-3 py-1 bg-danger/30 text-danger text-xs" role="alert">
              ⛔ {pageError}
            </div>
          )}
          {pageStatus === 'loaded' && pageHtml !== null ? (
            <iframe
              className="w-full h-full border-0 bg-white"
              sandbox="allow-forms allow-scripts"
              srcDoc={pageHtml}
              title="Conteúdo navegado via Proxy LAN do agent"
            />
          ) : (
            pageStatus !== 'loading' && !pageError && (
              <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-muted">
                <div className="text-4xl">🔗</div>

                {destinations.length > 0 ? (
                  <>
                    <p className="text-sm">
                      Destinos aprovados para este escopo ({destinations.length}):
                    </p>
                    <div className="flex max-w-3xl flex-wrap justify-center gap-2">
                      {destinations.map(d => (
                        <button
                          key={d.url}
                          type="button"
                          className="rounded-lg border border-border bg-surface px-3 py-2 text-left text-xs transition-colors hover:bg-surface-hover hover:text-foreground"
                          title={`Abrir ${d.url}`}
                          onClick={() => { setUrl(d.url); void navigate(d.url); }}
                        >
                          <span className="block font-medium text-foreground">{d.label}</span>
                          <span className="block font-mono text-[11px] text-muted-foreground">
                            {d.url}
                          </span>
                          {d.fromCidr && (
                            <span className="block text-[10px] text-warning">
                              endereço sugerido (rede {d.host.split('.').slice(0, 3).join('.')}.x)
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    <p className="max-w-lg text-center text-xs text-muted-foreground">
                      Vêm da allowlist cadastrada em Configurações → Destinos do Proxy. Se o
                      endereço sugerido não for o equipamento, digite a URL correta na barra acima.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm mb-1">Nenhum destino cadastrado para este escopo</p>
                    <p className="max-w-md text-center text-xs">
                      O tráfego HTTP/HTTPS sai do agent pela allowlist configurada no servidor e
                      volta por este console via NATS. Nenhuma URL externa é carregada diretamente
                      pelo navegador. Para liberar destinos, use Configurações → Destinos do Proxy.
                    </p>
                  </>
                )}
              </div>
            )
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-3 text-xs">
          <p className="mb-2 text-muted-foreground">
            Túnel TCP/SSH multiplexado do agent: cada destino vira um stream (#id) roteado por
            <span className="font-mono"> .tunnel.in/.tunnel.out</span>.
          </p>
          {openStreams.length === 0 ? (
            <p className="text-muted">Nenhum stream aberto. Informe host/porta e clique em Abrir túnel.</p>
          ) : (
            <ul className="space-y-1">
              {openStreams.map((s) => (
                <li key={s.streamId} className="flex items-center justify-between gap-2 rounded bg-surface px-2 py-1">
                  <span className="font-mono">#{s.streamId} — {s.target}</span>
                  <button
                    type="button"
                    className="rounded px-2 py-0.5 bg-danger/70 hover:bg-danger text-white"
                    onClick={() => stream.closeTunnel(s.streamId)}
                    title={`Encerrar o túnel #${s.streamId}`}
                  >
                    Encerrar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
