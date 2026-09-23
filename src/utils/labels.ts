import { LogLevel, type TicketPriority } from '@/api';

export type MetaColor = 'primary' | 'success' | 'warning' | 'danger' | 'slate' | 'accent';

export interface Meta {
  label: string;
  color: MetaColor;
}

/** Cores possíveis para prioridade de chamado (sem primary/accent). */
export type TicketPriorityColor = 'slate' | 'success' | 'warning' | 'danger';

export interface TicketPriorityMeta {
  label: string;
  color: TicketPriorityColor;
}

/** Rótulo e cor padronizados para prioridade de chamado. */
export const TICKET_PRIORITY_META: Record<TicketPriority, TicketPriorityMeta> = {
  Low: { label: 'Baixa', color: 'slate' },
  Medium: { label: 'Média', color: 'success' },
  High: { label: 'Alta', color: 'warning' },
  Critical: { label: 'Crítica', color: 'danger' },
};

/** Rótulo e cor padronizados para nível de log. */
export const LOG_LEVEL_META: Record<number, Meta> = {
  [LogLevel.Trace]: { label: 'Trace', color: 'slate' },
  [LogLevel.Debug]: { label: 'Debug', color: 'slate' },
  [LogLevel.Info]: { label: 'Info', color: 'primary' },
  [LogLevel.Warn]: { label: 'Aviso', color: 'warning' },
  [LogLevel.Error]: { label: 'Erro', color: 'danger' },
  [LogLevel.Fatal]: { label: 'Crítico', color: 'danger' },
};

const FALLBACK: Meta = { label: '?', color: 'slate' };
const PRIORITY_FALLBACK: TicketPriorityMeta = { label: '?', color: 'slate' };

export function getTicketPriorityMeta(priority: TicketPriority | null | undefined): TicketPriorityMeta {
  return (priority && TICKET_PRIORITY_META[priority]) || PRIORITY_FALLBACK;
}

export function getLogLevelMeta(level: number | null | undefined): Meta {
  return (level !== null && level !== undefined && LOG_LEVEL_META[level]) || FALLBACK;
}
