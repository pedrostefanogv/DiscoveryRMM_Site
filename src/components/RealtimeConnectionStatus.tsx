import { useRealtimeStatus } from '@/hooks/useRealtimeStatus';
import { Wifi, WifiOff } from 'lucide-react';

export function RealtimeConnectionStatus() {
  const status = useRealtimeStatus();

  const isConnected = status.natsConnected || status.signalrConnected;
  const providers = [];

  if (status.natsConnected) providers.push('NATS');
  if (status.signalrConnected) providers.push('SignalR');

  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
        isConnected
          ? 'bg-green-950 text-green-300'
          : 'bg-red-950 text-red-300'
      }`}>
        {isConnected ? (
          <Wifi className="h-3 w-3" />
        ) : (
          <WifiOff className="h-3 w-3" />
        )}
        <span>{providers.length > 0 ? providers.join(' + ') : 'Offline'}</span>
      </div>
    </div>
  );
}
