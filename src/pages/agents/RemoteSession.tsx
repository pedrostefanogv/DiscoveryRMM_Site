import { useSearchParams } from 'react-router-dom';
import { Button, Card } from '@/components/ui';
import { useEffect, useState } from 'react';
import { remoteSessionsApi } from '@/api/remote-sessions';

function formatTimestamp(ts: string | null): string {
  if (!ts) return '--:--:--';
  const value = new Date(ts);
  if (Number.isNaN(value.getTime())) return '--:--:--';
  return value.toLocaleTimeString('pt-BR', { hour12: false });
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

  const sessionId = searchParams.get('sessionId') ?? '';
  const agentId = searchParams.get('agentId') ?? '';
  const natsSubject = searchParams.get('natsSubject') ?? '';
  const kind = searchParams.get('kind') ?? 'screen';
  const transport = searchParams.get('transport') ?? 'nats';
  const quality = searchParams.get('quality') ?? 'high';
  const codec = searchParams.get('codec') ?? 'jpeg';
  const expiresAt = searchParams.get('expiresAt') ?? '';
  const natsUrl = searchParams.get('natsUrl') ?? '';

  const [remaining, setRemaining] = useState<string>(formatRemaining(expiresAt));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(formatRemaining(expiresAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  // Simula conexão NATS para a Fase 1 (placeholder)
  useEffect(() => {
    if (!sessionId || !natsUrl) return;
    setIsConnected(true);
  }, [sessionId, natsUrl]);

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
            Acesso Remoto — {kind.charAt(0).toUpperCase() + kind.slice(1)}
          </h1>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${isConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
            {isConnected ? 'Conectado' : 'Conectando...'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Tempo restante: <strong className="text-slate-300">{remaining}</strong></span>
          <Button variant="outline" size="sm" onClick={handleRenew}>Renovar</Button>
          <Button variant="danger" size="sm" onClick={handleStop}>Encerrar</Button>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 px-4 py-1.5 bg-slate-850 border-b border-slate-700 text-xs text-slate-500">
        <span>Session: <span className="text-slate-400 font-mono">{sessionId.slice(0, 8)}...</span></span>
        <span>Transport: <span className="text-slate-400">{transport.toUpperCase()}</span></span>
        <span>Quality: <span className="text-slate-400">{quality}</span></span>
        <span>Codec: <span className="text-slate-400">{codec.toUpperCase()}</span></span>
        <span>Expires: <span className="text-slate-400">{formatTimestamp(expiresAt)}</span></span>
      </div>

      {/* Main area — placeholder para Fase 2 (screen capture) */}
      <div className="flex-1 flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <p className="text-slate-500 text-lg mb-2">Acesso Remoto Nativo DiscoveryRMM</p>
          <p className="text-slate-600 text-sm">Stream de tela será implementado na Fase 2</p>
          <p className="text-slate-600 text-sm mt-1">Sessão ativa com TTL controlado</p>
        </div>
      </div>

      {/* Error toast */}
      {errorMsg && (
        <div className="absolute bottom-4 right-4 bg-red-900/80 text-red-200 px-4 py-2 rounded text-sm">
          {errorMsg}
          <button className="ml-2 text-red-400 hover:text-red-200" onClick={() => setErrorMsg(null)}>✕</button>
        </div>
      )}
    </div>
  );
}
