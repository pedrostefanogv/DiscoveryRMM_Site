import type { SlaDetails } from '@/api';

type SlaExpirySource = Pick<SlaDetails, 'slaExpiresAt' | 'effectiveSlaExpiresAt'>;
type SlaPauseSource = Pick<SlaDetails, 'onHold' | 'slaHoldStartedAt' | 'slaPausedSeconds'>;

/**
 * Prazo exibido ao usuário: SEMPRE o efetivo (prazo original + tempo pausado).
 * O `slaExpiresAt` cru ignora a pausa e fazia a data exibida contradizer o
 * percentual calculado no servidor.
 */
export function resolveSlaExpiryDisplay(sla: SlaExpirySource): string | null {
  return sla.effectiveSlaExpiresAt ?? sla.slaExpiresAt ?? null;
}

/** Indica se o prazo exibido já inclui tempo pausado. */
export function hasPausedShift(sla: SlaExpirySource): boolean {
  return Boolean(sla.effectiveSlaExpiresAt && sla.slaExpiresAt && sla.effectiveSlaExpiresAt !== sla.slaExpiresAt);
}

/** Duração legível em horas/minutos (ex.: "2h 15min", "45min", "30s"). */
export function formatPausedDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
  if (minutes > 0) return `${minutes}min`;
  return `${total}s`;
}

/** Texto de apoio quando o SLA está pausado; null quando não está. */
export function describeSlaPause(sla: SlaPauseSource): string | null {
  if (!sla.onHold) return null;
  const accumulated = formatPausedDuration(sla.slaPausedSeconds ?? 0);
  const since = sla.slaHoldStartedAt ? new Date(sla.slaHoldStartedAt).toLocaleString('pt-BR') : null;
  const suffix = accumulated ? ` — ${accumulated} já descontados` : '';
  return since ? `SLA pausado desde ${since}${suffix}` : `SLA pausado${suffix}`;
}
