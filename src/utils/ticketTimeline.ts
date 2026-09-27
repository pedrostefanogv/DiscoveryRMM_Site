import type { ComponentType } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpCircle,
  Bell,
  Bot,
  BookOpen,
  Building2,
  CheckCircle2,
  CircleUserRound,
  Clock,
  Cpu,
  FileText,
  Flag,
  GitBranch,
  GitMerge,
  Link,
  Link2,
  MessageSquare,
  Monitor,
  PlusCircle,
  RotateCcw,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Unlink,
  UserPlus,
  XCircle,
} from 'lucide-react';
import type { TicketActivityType, TicketTimelineEntry } from '@/api';

export type TimelineTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

export interface TimelineMeta {
  label: string;
  icon: ComponentType<{ className?: string }>;
  tone: TimelineTone;
}

/** Rótulo, ícone e tom visual de cada tipo de evento da timeline. */
export const TIMELINE_META: Record<TicketActivityType, TimelineMeta> = {
  Created: { label: 'Chamado criado', icon: PlusCircle, tone: 'accent' },
  StateChanged: { label: 'Estado alterado', icon: GitBranch, tone: 'neutral' },
  Assigned: { label: 'Responsável alterado', icon: UserPlus, tone: 'neutral' },
  Commented: { label: 'Comentário', icon: MessageSquare, tone: 'neutral' },
  SlaWarning: { label: 'Aviso de SLA', icon: Clock, tone: 'warning' },
  SlaBreached: { label: 'SLA violado', icon: AlertTriangle, tone: 'danger' },
  Escalated: { label: 'Chamado escalado', icon: ArrowUpCircle, tone: 'warning' },
  Reopened: { label: 'Chamado reaberto', icon: RotateCcw, tone: 'accent' },
  DepartmentChanged: { label: 'Departamento alterado', icon: Building2, tone: 'neutral' },
  PriorityChanged: { label: 'Prioridade alterada', icon: Flag, tone: 'neutral' },
  DescriptionUpdated: { label: 'Descrição atualizada', icon: FileText, tone: 'neutral' },
  CategoryChanged: { label: 'Categoria alterada', icon: Tag, tone: 'neutral' },
  Deleted: { label: 'Chamado excluído', icon: Trash2, tone: 'danger' },
  RemoteSessionStarted: { label: 'Sessão remota iniciada', icon: Monitor, tone: 'accent' },
  RemoteSessionEnded: { label: 'Sessão remota encerrada', icon: Monitor, tone: 'neutral' },
  AutomationLinked: { label: 'Automação vinculada', icon: Link, tone: 'neutral' },
  AutomationApproved: { label: 'Automação aprovada', icon: CheckCircle2, tone: 'success' },
  AutomationRejected: { label: 'Automação rejeitada', icon: XCircle, tone: 'danger' },
  AutoCreatedFromAlert: { label: 'Criado por alerta', icon: Bell, tone: 'accent' },
  TicketMerged: { label: 'Chamados mesclados', icon: GitMerge, tone: 'neutral' },
  TicketRelationAdded: { label: 'Relacionamento adicionado', icon: Link2, tone: 'neutral' },
  TicketRelationRemoved: { label: 'Relacionamento removido', icon: Unlink, tone: 'neutral' },
  KnowledgeLinked: { label: 'Artigo vinculado', icon: BookOpen, tone: 'neutral' },
  KnowledgeUnlinked: { label: 'Artigo desvinculado', icon: BookOpen, tone: 'neutral' },
  Rated: { label: 'Chamado avaliado', icon: Star, tone: 'warning' },
  RequesterChanged: { label: 'Solicitante alterado', icon: CircleUserRound, tone: 'neutral' },
  AgentChanged: { label: 'Máquina alterada', icon: Cpu, tone: 'neutral' },
  AiAssigned: { label: 'Atribuído pela IA', icon: Bot, tone: 'accent' },
  AiAssignmentSuggested: { label: 'Sugestão da IA', icon: Sparkles, tone: 'accent' },
};

/** Fallback para tipos que a API venha a adicionar antes do front. */
export function timelineMetaFor(type: string): TimelineMeta {
  return (
    (TIMELINE_META as Record<string, TimelineMeta>)[type] ?? {
      label: type || 'Evento',
      icon: Activity,
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
