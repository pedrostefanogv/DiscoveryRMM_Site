// Helpers de formatação para métricas de processos/serviços.

/** Formata bytes em unidades legíveis (B, KB, MB, GB). */
export function formatBytes(bytes: number | undefined | null): string {
    if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return '—';
    if (bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i++;
    }
    const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return `${value.toFixed(digits)} ${units[i]}`;
}

/** Formata percentual de CPU (0 → "0.0%"; valores > 99.9 limitados). */
export function formatCpuPercent(value: number | undefined | null): string {
    if (value === undefined || value === null || Number.isNaN(value)) return '—';
    if (value <= 0) return '0.0%';
    return `${value.toFixed(1)}%`;
}

/** Formata nº de conexões. */
export function formatConnections(value: number | undefined | null): string {
    if (value === undefined || value === null || Number.isNaN(value)) return '—';
    return String(value);
}