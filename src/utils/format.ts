/**
 * Format utilities shared across the application.
 */

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

/**
 * Formats a date string or Date to Brazilian locale (dd/mm/yyyy HH:MM).
 */
export function formatDateBrazil(
  value: string | Date | null | undefined,
): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", DATE_FORMAT);
}

/**
 * Formats a date as relative time (e.g., "5 min atrás", "2 dias atrás").
 */
export function formatRelative(
  value: string | Date | null | undefined,
): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (isNaN(date.getTime())) return "-";

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "agora";
  if (diffMin < 60) return `${diffMin} min atrás`;
  if (diffHour < 24) return `${diffHour}h atrás`;
  if (diffDay < 7) return `${diffDay} dia(s) atrás`;
  return formatDateBrazil(value);
}

/**
 * Formats uptime in seconds to a short human-readable string.
 */
export function formatUptimeShort(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return "-";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Formats a date to a short date string (dd/mm/yyyy).
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR");
}

/** Traço usado como valor ausente em tabelas/listas. */
export const EMPTY_VALUE = "\u2014";

/**
 * Data + hora em pt-BR (ex.: "21/10/2026, 14:35"). Fonte única para o
 * "quando aconteceu" das tabelas e cards — evita toLocaleString espalhado.
 */
export function formatDateTime(
  value: string | Date | null | undefined,
  fallback: string = EMPTY_VALUE,
): string {
  if (!value) return fallback;
  const date = typeof value === "string" ? new Date(value) : value;
  if (isNaN(date.getTime())) return fallback;
  return date.toLocaleString("pt-BR");
}

/** Data compacta dia/mês + hora (ex.: "21/10 14:35"). */
export function formatDateCompact(
  value: string | Date | null | undefined,
  fallback: string = EMPTY_VALUE,
): string {
  if (!value) return fallback;
  const date = typeof value === "string" ? new Date(value) : value;
  if (isNaN(date.getTime())) return fallback;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Tamanho em bytes legível (ex.: "12,3 MB", "1,2 GB"). */
export function formatBytes(
  value: number | null | undefined,
  fallback: string = EMPTY_VALUE,
): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return fallback;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}
