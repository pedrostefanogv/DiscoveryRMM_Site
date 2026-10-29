import { formatBytes as formatBytesBase } from '@/utils/format';

// Helpers de formatação para métricas de processos/serviços.

/** Formata bytes em unidades legíveis (B, KB, MB, GB). */
export function formatBytes(bytes: number | undefined | null): string {
    return formatBytesBase(bytes, '0 B');
}

/** Formata percentual de CPU (0 → "0.0%"). */
export function formatCpuPercent(value: number | undefined | null): string {
    if (value === undefined || value === null || Number.isNaN(value)) return '—';
    if (value <= 0) return '0.0%';
    return `${value.toFixed(1)}%`;
}

/** Formata taxa de bytes/s (B/s, KB/s, MB/s, GB/s). */
export function formatBytesPerSec(value: number | undefined | null): string {
    if (value === undefined || value === null || Number.isNaN(value)) return '—';
    if (value <= 0) return '0 B/s';
    return `${formatBytes(value)}/s`;
}

/** Formata nº de conexões. */
export function formatConnections(value: number | undefined | null): string {
    if (value === undefined || value === null || Number.isNaN(value)) return '—';
    return String(value);
}