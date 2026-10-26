import type { TicketActivityType, TicketTimelineEntry } from '@/api';
import type { MaterialSymbolName } from '@/components/ui';

export type TimelineTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

export interface TimelineMeta {
  label: string;
  icon: MaterialSymbolName;
  tone: TimelineTone;
}

/** Rótulo, ícone e tom visual de cada tipo de evento da timeline. */
export const TIMELINE_META: Record<TicketActivityType, TimelineMeta> = {
  Created: { label: 'Chamado criado', icon: "add_circle", tone: 'accent' },
  StateChanged: { label: 'Estado alterado', icon: "account_tree", tone: 'neutral' },
  Assigned: { label: 'Responsável alterado', icon: "person_add", tone: 'neutral' },
  Commented: { label: 'Comentário', icon: "chat", tone: 'neutral' },
  SlaWarning: { label: 'Aviso de SLA', icon: "schedule", tone: 'warning' },
  SlaBreached: { label: 'SLA violado', icon: "warning", tone: 'danger' },
  Escalated: { label: 'Chamado escalado', icon: "arrow_circle_up", tone: 'warning' },
  Reopened: { label: 'Chamado reaberto', icon: "restart_alt", tone: 'accent' },
  DepartmentChanged: { label: 'Departamento alterado', icon: "apartment", tone: 'neutral' },
  PriorityChanged: { label: 'Prioridade alterada', icon: "flag", tone: 'neutral' },
  DescriptionUpdated: { label: 'Descrição atualizada', icon: "description", tone: 'neutral' },
  CategoryChanged: { label: 'Categoria alterada', icon: "sell", tone: 'neutral' },
  Deleted: { label: 'Chamado excluído', icon: "delete", tone: 'danger' },
  RemoteSessionStarted: { label: 'Sessão remota iniciada', icon: "desktop_windows", tone: 'accent' },
  RemoteSessionEnded: { label: 'Sessão remota encerrada', icon: "desktop_windows", tone: 'neutral' },
  AutomationLinked: { label: 'Automação vinculada', icon: "link", tone: 'neutral' },
  AutomationApproved: { label: 'Automação aprovada', icon: "check_circle", tone: 'success' },
  AutomationRejected: { label: 'Automação rejeitada', icon: "cancel", tone: 'danger' },
  AutoCreatedFromAlert: { label: 'Criado por alerta', icon: "notifications", tone: 'accent' },
  TicketMerged: { label: 'Chamados mesclados', icon: "merge", tone: 'neutral' },
  TicketRelationAdded: { label: 'Relacionamento adicionado', icon: "link", tone: 'neutral' },
  TicketRelationRemoved: { label: 'Relacionamento removido', icon: "link_off", tone: 'neutral' },
  KnowledgeLinked: { label: 'Artigo vinculado', icon: "menu_book", tone: 'neutral' },
  KnowledgeUnlinked: { label: 'Artigo desvinculado', icon: "menu_book", tone: 'neutral' },
  Rated: { label: 'Chamado avaliado', icon: "star", tone: 'warning' },
  RequesterChanged: { label: 'Solicitante alterado', icon: "account_circle", tone: 'neutral' },
  AgentChanged: { label: 'Máquina alterada', icon: "memory", tone: 'neutral' },
  AiAssigned: { label: 'Atribuído pela IA', icon: "smart_toy", tone: 'accent' },
  AiAssignmentSuggested: { label: 'Sugestão da IA', icon: "auto_awesome", tone: 'accent' },
  ChatStarted: { label: 'Chat de suporte iniciado', icon: "forum", tone: 'accent' },
  ChatEnded: { label: 'Chat de suporte encerrado', icon: "chat_bubble_off", tone: 'neutral' },
};

/** Fallback para tipos que a API venha a adicionar antes do front. */
export function timelineMetaFor(type: string): TimelineMeta {
  return (
    (TIMELINE_META as Record<string, TimelineMeta>)[type] ?? {
      label: type || 'Evento',
      icon: "monitoring",
      tone: 'neutral',
    }
  );
}

export const TIMELINE_TONE_CLASS: Record<TimelineTone, string> = {
  neutral: 'bg-surface-hover text-muted',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
  accent: 'bg-accent/15 text-accent',
};

/** "há 5 min" / "há 3 h" / "há 2 d" — cai para a data após 30 dias. */
export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return 'agora';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'agora';

  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMinutes < 1) return 'agora';
  if (diffMinutes < 60) return `há ${diffMinutes} min`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `há ${diffHours} h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `há ${diffDays} d`;

  return date.toLocaleDateString('pt-BR');
}

export interface TimelineDayGroup {
  key: string;
  label: string;
  items: TicketTimelineEntry[];
}

function startOfDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function dayLabel(date: Date): string {
  if (Number.isNaN(date.getTime())) return 'Data desconhecida';
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  return date.toLocaleDateString('pt-BR');
}

/** Agrupa mantendo a ordem recebida (a API entrega o mais recente primeiro). */
export function groupTimelineByDay(entries: TicketTimelineEntry[]): TimelineDayGroup[] {
  const groups = new Map<string, TimelineDayGroup>();

  for (const entry of entries) {
    const date = new Date(entry.createdAt);
    const key = Number.isNaN(date.getTime())
      ? 'invalid'
      : `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

    const existing = groups.get(key);
    if (existing) {
      existing.items.push(entry);
    } else {
      groups.set(key, { key, label: dayLabel(date), items: [entry] });
    }
  }

  return [...groups.values()];
}
