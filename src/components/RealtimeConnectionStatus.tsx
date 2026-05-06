import { useRealtimeStatus } from '@/hooks/useRealtimeStatus';
import { AlertTriangle, Wifi, WifiOff } from 'lucide-react';

export function RealtimeConnectionStatus() {
  const status = useRealtimeStatus();

  const isConnected = status.natsConnected;
  const isRecovering =
    status.natsState === 'connecting' ||
    status.natsState === 'reconnecting';
  const providers = [];
  const isServerOverloaded = status.serverOverloaded === true;

  if (status.natsConnected) providers.push('NATS');

  if (!status.natsConnected && status.natsState === 'connecting') {
    providers.push('NATS conectando');
  }

  if (!status.natsConnected && status.natsState === 'reconnecting') {
    providers.push('NATS reconectando');
  }

  const toneClasses = isConnected
    ? 'bg-green-950 text-green-300'
    : isRecovering
      ? 'bg-amber-950 text-amber-300'
      : 'bg-red-950 text-red-300';

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
              : 'Offline'}
        </span>
      </div>
      {isServerOverloaded && (
        <div className="flex items-center gap-1 rounded-full bg-amber-950 px-2 py-1 text-xs font-medium text-amber-200">
          <AlertTriangle className="h-3 w-3" />
          <span>Servidor sobrecarregado</span>
        </div>
      )}
    </div>
  );
}
