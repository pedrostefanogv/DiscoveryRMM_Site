import { useRealtimeStatus } from '@/hooks/useRealtimeStatus';
import { AlertTriangle, Wifi, WifiOff } from 'lucide-react';

export function RealtimeConnectionStatus() {
  const status = useRealtimeStatus();

  const handleReloadSession = () => {
    if (typeof window === 'undefined') return;
    window.location.reload();
  };

  const isConnected = status.natsConnected;
  const isRecovering =
    status.natsState === 'connecting' ||
    status.natsState === 'reconnecting';
  const isAuthError =
    status.natsState === 'auth_error' || status.natsLastErrorType === 'auth';
  const hasConnectionError = !isConnected && status.natsLastErrorType !== null;
  const providers = [];
  const isServerOverloaded = status.serverOverloaded === true;

  if (status.natsConnected) providers.push('NATS');

  if (!status.natsConnected && status.natsState === 'connecting') {
    providers.push('NATS conectando');
  }

  if (!status.natsConnected && status.natsState === 'reconnecting') {
    providers.push('NATS reconectando');
  }

  if (!status.natsConnected && status.natsState === 'auth_error') {
    providers.push('NATS auth_error');
  }

  const toneClasses = isConnected
    ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
    : isRecovering
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
      : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300';

  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${toneClasses}`}>
        {isConnected ? (
          <Wifi className="h-3 w-3" />
        ) : (
          <WifiOff className="h-3 w-3" />
        )}
        <span>
          {providers.length > 0
            ? providers.join(' + ')
            : isRecovering
              ? 'Conectando'
              : isAuthError
                ? 'Erro de autenticação'
              : 'Offline'}
        </span>
      </div>
      {hasConnectionError && (
        <div
          className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-200"
          title={
            status.natsLastErrorAtUtc
              ? `${status.natsLastErrorMessage ?? 'Erro NATS'} @ ${status.natsLastErrorAtUtc}`
              : (status.natsLastErrorMessage ?? 'Erro NATS')
          }
        >
          <AlertTriangle className="h-3 w-3" />
          <span>{isAuthError ? 'Credencial NATS rejeitada' : 'Falha de rede NATS'}</span>
        </div>
      )}
      {isAuthError && (
        <button
          type="button"
          onClick={handleReloadSession}
          className="rounded-full border border-red-300 bg-red-100/80 px-2 py-1 text-xs font-medium text-red-800 transition hover:bg-red-200 dark:border-red-800 dark:bg-red-950/80 dark:text-red-100 dark:hover:bg-red-900"
          title="Recarregar sessão autenticada"
        >
          Recarregar sessão
        </button>
      )}
      {isServerOverloaded && (
        <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="h-3 w-3" />
          <span>Servidor sobrecarregado</span>
        </div>
      )}
    </div>
  );
}
