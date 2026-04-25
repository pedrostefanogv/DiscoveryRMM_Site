import { useRealtimeStatus } from '@/hooks/useRealtimeStatus';
import { Wifi, WifiOff } from 'lucide-react';

export function RealtimeConnectionStatus() {
  const status = useRealtimeStatus();

  const isConnected = status.natsConnected || status.signalrConnected;
  const isRecovering =
    status.natsState === 'connecting' ||
    status.natsState === 'reconnecting' ||
    status.signalrState === 'connecting' ||
    status.signalrState === 'reconnecting';
  const providers = [];

  if (status.natsConnected) providers.push('NATS');
  if (status.signalrConnected) providers.push('SignalR');

  if (!status.natsConnected && status.natsState === 'connecting') {
    providers.push('NATS conectando');
  }

  if (!status.natsConnected && status.natsState === 'reconnecting') {
    providers.push('NATS reconectando');
  }

  if (!status.signalrConnected && status.signalrState === 'connecting') {
    providers.push('SignalR conectando');
  }

  if (!status.signalrConnected && status.signalrState === 'reconnecting') {
    providers.push('SignalR reconectando');
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
    </div>
  );
}
