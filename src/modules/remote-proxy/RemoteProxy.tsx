import { useState, useCallback, useRef } from 'react';

interface RemoteProxyProps {
  sessionId: string;
  agentId: string;
}

type ProxyStatus = 'idle' | 'loading' | 'loaded' | 'blocked' | 'error';

export default function RemoteProxy({ sessionId, agentId }: RemoteProxyProps) {
  const [url, setUrl] = useState('');
  const [proxyUrl, setProxyUrl] = useState('');
  const [status, setStatus] = useState<ProxyStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const navigate = useCallback(async (targetUrl: string) => {
    if (!targetUrl) return;
    setStatus('loading');
    setError(null);

    try {
      // Placeholder: enviaria proxy.req via NATS (Fase 5)
      // Por enquanto, tenta carregar diretamente no iframe
      setProxyUrl(targetUrl);
      setStatus('loaded');
    } catch (err) {
      setStatus('error');
      setError(String(err));
    }
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    navigate(url);
  }, [url, navigate]);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-300">
      {/* URL bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800">
        <form onSubmit={handleSubmit} className="flex flex-1 items-center gap-2">
          <span className="text-slate-500 text-sm">🔗</span>
          <input
            type="text"
            className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-300 font-mono outline-none focus:border-primary/50"
            placeholder="http://192.168.1.1/ ou http://roteador/"
            value={url}
            onChange={e => setUrl(e.target.value)}
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-primary/20 text-primary text-sm rounded hover:bg-primary/30 transition-colors"
          >
            Navegar
          </button>
        </form>
      </div>

      {/* Quick links */}
      <div className="flex gap-1 px-3 py-2 bg-slate-900/50 border-b border-slate-800/50 text-xs">
        <span className="text-slate-600 mr-2">Acessos rápidos:</span>
        {[
          { label: 'Roteador', url: 'http://192.168.1.1/' },
          { label: 'Router Alt', url: 'http://192.168.0.1/' },
          { label: 'Impressora', url: 'http://192.168.1.100/' },
        ].map(q => (
          <button
            key={q.url}
            className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded hover:bg-slate-700 hover:text-slate-300 transition-colors"
            onClick={() => { setUrl(q.url); navigate(q.url); }}
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Status */}
      {status === 'loading' && (
        <div className="px-3 py-1 bg-amber-900/30 text-amber-400 text-xs">Carregando...</div>
      )}
      {status === 'blocked' && (
        <div className="px-3 py-1 bg-red-900/30 text-red-400 text-xs">
          ⛔ Acesso bloqueado — allowlist não configurada. Solicite ao administrador.
        </div>
      )}
      {error && (
        <div className="px-3 py-1 bg-red-900/30 text-red-400 text-xs">Erro: {error}</div>
      )}

      {/* Iframe */}
      <div className="flex-1 relative">
        {proxyUrl && status === 'loaded' ? (
          <iframe
            ref={iframeRef}
            src={proxyUrl}
            className="w-full h-full border-0 bg-white"
            sandbox="allow-same-origin allow-forms allow-scripts"
            title="Remote Proxy"
            onError={() => {
              setStatus('error');
              setError('Falha ao carregar a página no iframe');
            }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-600">
            <div className="text-4xl mb-3">🔗</div>
            <p className="text-sm mb-1">Proxy de Rede — Bloqueio Total Inicial</p>
            <p className="text-xs text-slate-700">
              A allowlist está vazia por padrão. Configure os IPs permitidos para acessar dispositivos na rede do agent.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
