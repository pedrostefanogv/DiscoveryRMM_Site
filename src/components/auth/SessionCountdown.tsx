import { useNowTick } from '@/hooks/useNowTick';

interface SessionCountdownProps {
  expiresAt: number | null;
  authenticated: boolean;
}

function formatCountdown(msRemaining: number) {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * BUG-10: Componente isolado para o countdown de expiração da sessão.
 * Re-renderiza apenas este componente a cada segundo, sem afetar o Header inteiro.
 */
export function SessionCountdown({ expiresAt, authenticated }: SessionCountdownProps) {
  const now = useNowTick(1_000);

  if (!expiresAt || !authenticated) {
    return null;
  }

  const remaining = expiresAt - now;
  const isLow = remaining < 5 * 60 * 1000;

  return (
    <span
      className={`text-xs font-mono tabular-nums ${
        isLow ? 'text-amber-400' : 'text-muted'
      }`}
      title="Tempo restante da sessão"
    >
      {formatCountdown(remaining)}
    </span>
  );
}
