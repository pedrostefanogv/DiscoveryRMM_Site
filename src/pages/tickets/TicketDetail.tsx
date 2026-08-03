import { useState, useRef, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Lock, Unlock, Clock, Activity, ChevronDown, BookOpen, Paperclip, Upload, File, CheckCircle, XCircle, Loader2, UserPlus, UserMinus, Wrench, Copy } from 'lucide-react';
import { MarkdownViewer } from '@/components/ui/MarkdownViewer';
import { useAuth } from '@/auth/AuthContext';
import { getUserIdFromJwt } from '@/auth/jwt';
import { AppApprovalScopeType, AutomationTaskActionType } from '@/api';
import {
  useTicket,
  useTicketComments,
  useTicketWatchers,
  useAddComment,
  useAddTicketWatcher,
  useRemoveTicketWatcher,
  useUpdateTicketWorkflow,
  useUpdateTicket,
  useTicketTimeline,
  useSlaDetails,
  useTicketAttachments,
  usePrepareTicketUpload,
  useCompleteTicketUpload,
} from '@/hooks/useTickets';
import { useAutomationTasks } from '@/hooks/useAutomation';
import { useTicketAttachmentSettings } from '@/hooks/useConfigurationApi';
import { useSiteTicketAttachmentSettings, useClientTicketAttachmentSettings } from '@/hooks/useConfigurationApi';
import { useWorkflowStates } from '@/hooks/useWorkflow';
import { useCustomFieldDefinitions } from '@/hooks/useCustomFields';
import { useIamUsers } from '@/hooks/useIdentity';
import {
  useApproveTicketAutomationLink,
  useCreateTicketAutomationLink,
  useRejectTicketAutomationLink,
  useTicketAutomationLinks,
} from '@/hooks/useTicketAutomationLinks';
import {
  useTicketAiSuggestReply,
  useTicketAiSummary,
  useTicketAiTriage,
} from '@/hooks/useTicketAi';
import {
  useTicketCustomFields,
  useUpsertTicketCustomFieldValue,
} from '@/hooks/useTicketCustomFields';
import { Button, Card, CardHeader, Badge, Loading, ErrorDisplay, TextArea, Select, Input } from '@/components/ui';
import {
  CustomFieldDataType,
  CustomFieldScopeType,
  formatCustomFieldValue,
  getCustomFieldDataTypeLabel,
  parseCustomFieldValue,
} from '@/api';
import type {
  AutomationTaskSummary,
  CustomFieldDefinition,
  Ticket,
  TicketAutomationLink,
  TicketAiSuggestedReplyResponse,
  TicketAiSummaryResponse,
  TicketAiTriageResponse,
  TicketPriority,
  UpdateTicketRequest,
  UserDto,
} from '@/api';
import toast from 'react-hot-toast';

const PRIORITY_META: Record<TicketPriority, { label: string; color: 'slate' | 'success' | 'warning' | 'danger' }> = {
  Low:      { label: 'Baixa',    color: 'slate'   },
  Medium:   { label: 'Média',    color: 'success' },
  High:     { label: 'Alta',     color: 'warning' },
  Critical: { label: 'Crítica',  color: 'danger'  },
};

const ACTIVITY_LABELS: Record<string, string> = {
  Created:           'Criado',
  StateChanged:      'Estado alterado',
  Assigned:          'Atribuído',
  Commented:         'Comentado',
  SlaWarning:        'Aviso SLA',
  SlaBreached:       'SLA violado',
  Escalated:         'Escalado',
  Reopened:          'Reaberto',
  DepartmentChanged: 'Depto. alterado',
  PriorityChanged:   'Prioridade alterada',
  DescriptionUpdated:'Descrição atualizada',
  CategoryChanged:   'Categoria alterada',
   AutomationLinked:  'Automação vinculada',
   AutomationApproved:'Automação aprovada',
   AutomationRejected:'Automação rejeitada',
};

type Tab = 'comments' | 'timeline' | 'attachments' | 'automation' | 'ai';

type CommentSeed = {
  nonce: number;
  content: string;
};

function resolveUserDisplayName(usersById: Map<string, UserDto>, userId: string | null | undefined) {
  if (!userId) return '\u2014';
  const user = usersById.get(userId);
  if (!user) return userId;
  return user.fullName || user.email || user.login || user.id;
}

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ticket   = useTicket(id!);
  const comments = useTicketComments(id!);
  const states   = useWorkflowStates();
  const iamUsers = useIamUsers();
  const [tab, setTab] = useState<Tab>('comments');
  const [editing, setEditing] = useState(false);
  const [commentSeed, setCommentSeed] = useState<CommentSeed | null>(null);
  const iamUsersData = useMemo(
    () => (Array.isArray(iamUsers.data) ? iamUsers.data : []),
    [iamUsers.data],
  );
  const iamUsersById = useMemo(
    () => new Map<string, UserDto>(iamUsersData.map((user) => [user.id, user])),
    [iamUsersData],
  );

  if (ticket.isLoading) return <Loading />;
  if (ticket.isError || !ticket.data) return <ErrorDisplay onRetry={() => ticket.refetch()} />;

  const t = ticket.data;
  const p = PRIORITY_META[t.priority] ?? { label: t.priority, color: 'slate' as const };
  const currentState = states.data?.find(s => s.id === t.workflowStateId);
  const assignedUser = t.assignedToUserId ? iamUsersById.get(t.assignedToUserId) : undefined;
  const assignedDisplayName = t.assignedToUserId && iamUsers.isLoading
    ? 'Carregando usuario...'
    : resolveUserDisplayName(iamUsersById, t.assignedToUserId);
  const assignedEmail =
    assignedUser?.email && assignedUser.email !== assignedDisplayName ? assignedUser.email : null;
  const knowledgeQuery = new URLSearchParams();
  if (t.clientId) knowledgeQuery.set('clientId', t.clientId);
  if (t.siteId) knowledgeQuery.set('siteId', t.siteId);
  const knowledgeUrl = `/knowledge${knowledgeQuery.toString() ? `?${knowledgeQuery.toString()}` : ''}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate('/tickets')}
          aria-label="Voltar"
          className="mt-1 rounded-lg p-2 text-muted hover:bg-surface-light hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-foreground truncate">{t.title}</h1>
          <p className="text-sm text-muted">
            Criado em {new Date(t.createdAt).toLocaleDateString('pt-BR')}
            {t.closedAt && `  Encerrado em ${new Date(t.closedAt).toLocaleDateString('pt-BR')}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge color={p.color}>{p.label}</Badge>
          {currentState && (
            <Badge color="accent">
              <span className="flex items-center gap-1.5">
                {currentState.color && (
                  <svg className="h-2 w-2" viewBox="0 0 8 8" aria-hidden="true">
                    <circle cx="4" cy="4" r="4" fill={currentState.color} />
                  </svg>
                )}
                {currentState.name}
              </span>
            </Badge>
          )}
          <Button size="sm" variant="ghost" onClick={() => setEditing(e => !e)}>
            {editing ? 'Cancelar edição' : 'Editar'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigate(knowledgeUrl)}>
            <BookOpen className="h-4 w-4" /> Conhecimento
          </Button>
        </div>
      </div>

      {editing && <EditTicketForm ticket={t} onDone={() => setEditing(false)} />}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Description */}
          <Card>
            <CardHeader title="Descrição" />
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{t.description}</p>
          </Card>

          {/* Tabs: Comments / Timeline */}
          <Card padding={false}>
            <div className="flex border-b border-border">
              <button
                className={`px-4 py-3 text-sm font-medium transition-colors ${tab === 'comments' ? 'border-b-2 border-primary text-foreground' : 'text-muted hover:text-foreground'}`}
                onClick={() => setTab('comments')}
              >
                Comentários ({comments.data?.items?.length ?? 0})
              </button>
              <button
                className={`px-4 py-3 text-sm font-medium transition-colors ${tab === 'timeline' ? 'border-b-2 border-primary text-foreground' : 'text-muted hover:text-foreground'}`}
                onClick={() => setTab('timeline')}
              >
                <Activity className="inline h-4 w-4 mr-1" />
                Timeline
              </button>
              <button
                className={`px-4 py-3 text-sm font-medium transition-colors ${tab === 'attachments' ? 'border-b-2 border-primary text-foreground' : 'text-muted hover:text-foreground'}`}
                onClick={() => setTab('attachments')}
              >
                <Paperclip className="inline h-4 w-4 mr-1" />
                Anexos
              </button>
              <button
                className={`px-4 py-3 text-sm font-medium transition-colors ${tab === 'automation' ? 'border-b-2 border-primary text-foreground' : 'text-muted hover:text-foreground'}`}
                onClick={() => setTab('automation')}
              >
                <Wrench className="inline h-4 w-4 mr-1" />
                Automação
              </button>
              <button
                className={`px-4 py-3 text-sm font-medium transition-colors ${tab === 'ai' ? 'border-b-2 border-primary text-foreground' : 'text-muted hover:text-foreground'}`}
                onClick={() => setTab('ai')}
              >
                IA
              </button>
            </div>
            <div className="p-4">
              {tab === 'comments' ? (
                <CommentsPanel ticketId={id!} draftSeed={commentSeed} />
              ) : tab === 'timeline' ? (
                <TimelinePanel ticketId={id!} />
              ) : tab === 'automation' ? (
                <AutomationLinksPanel
                  ticketId={id!}
                  clientId={t.clientId}
                  siteId={t.siteId}
                  agentId={t.agentId}
                />
              ) : tab === 'ai' ? (
                <TicketAiPanel
                  ticket={t}
                  onUseSuggestedReply={(content) => {
                    setCommentSeed({
                      nonce: Date.now(),
                      content,
                    });
                    setTab('comments');
                    toast.success('Resposta sugerida enviada para o rascunho do comentario.');
                  }}
                />
              ) : (
                <AttachmentsPanel ticketId={id!} siteId={t.siteId} clientId={t.clientId} />
              )}
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <TicketSummaryPanel
            ticketId={id!}
            category={t.category}
            priorityLabel={p.label}
            priorityColor={p.color}
            assignedDisplayName={assignedDisplayName}
            assignedEmail={assignedEmail}
            updatedAt={t.updatedAt}
            closedAt={t.closedAt}
          />
          <TicketCustomFieldsPanel ticketId={id!} />
          <WorkflowPanel ticketId={id!} currentStateId={t.workflowStateId} />
          <WatchersPanel ticketId={id!} assignedToUserId={t.assignedToUserId} />
        </div>
      </div>
    </div>
  );
}

function formatDateInputValue(value: string) {
  return value.slice(0, 10);
}

function formatDateTimeLocalInputValue(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 16);
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatTicketCustomFieldDraftValue(
  dataType: CustomFieldDataType,
  value: unknown,
) {
  if (value === null || value === undefined) {
    return '';
  }

  switch (dataType) {
    case CustomFieldDataType.Boolean:
      return String(value);
    case CustomFieldDataType.ListBox:
      return Array.isArray(value)
        ? value.map((item) => String(item ?? '')).join(', ')
        : formatCustomFieldValue(value);
    case CustomFieldDataType.Date:
      return typeof value === 'string'
        ? formatDateInputValue(value)
        : formatDateInputValue(formatCustomFieldValue(value));
    case CustomFieldDataType.DateTime:
      return typeof value === 'string'
        ? formatDateTimeLocalInputValue(value)
        : formatDateTimeLocalInputValue(formatCustomFieldValue(value));
    default:
      return formatCustomFieldValue(value);
  }
}

function parseTicketCustomFieldDraftValue(
  dataType: CustomFieldDataType,
  input: string,
) {
  if (dataType === CustomFieldDataType.Boolean && !input.trim()) {
    return null;
  }

  return parseCustomFieldValue(dataType, input);
}

function normalizeTicketPriority(value: unknown): TicketPriority | null {
  if (value === 'Low' || value === 'Medium' || value === 'High' || value === 'Critical') {
    return value;
  }

  return null;
}

function normalizeTicketAiText(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function extractJsonPayload(raw: string) {
  const trimmed = raw.trim();
  const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const firstBrace = withoutFence.indexOf('{');
  const lastBrace = withoutFence.lastIndexOf('}');

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return withoutFence.slice(firstBrace, lastBrace + 1);
  }

  return withoutFence;
}

function parseTicketAiTriageSuggestion(raw: string | null | undefined) {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(extractJsonPayload(raw)) as Record<string, unknown>;

    return {
      category: normalizeTicketAiText(parsed.category),
      priority: normalizeTicketPriority(parsed.priority),
      department: normalizeTicketAiText(parsed.department),
      reasoning: normalizeTicketAiText(parsed.reasoning),
      raw: parsed,
    };
  } catch {
    return null;
  }
}

async function copyTextToClipboard(text: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch {
    toast.error('Não foi possível copiar o texto.');
  }
}

function TicketAiMetadata({
  data,
}: {
  data:
    | TicketAiTriageResponse
    | TicketAiSummaryResponse
    | TicketAiSuggestedReplyResponse;
}) {
  return (
    <p className="mt-2 text-[11px] text-muted">
      Modelo {data.model ?? 'desconhecido'}  {data.tokensUsed} tokens
    </p>
  );
}

function TicketAiPanel({
  ticket,
  onUseSuggestedReply,
}: {
  ticket: Ticket;
  onUseSuggestedReply: (content: string) => void;
}) {
  const triage = useTicketAiTriage();
  const summary = useTicketAiSummary();
  const suggestReply = useTicketAiSuggestReply();
  const updateTicket = useUpdateTicket();

  const parsedTriage = useMemo(
    () => parseTicketAiTriageSuggestion(triage.data?.suggestion),
    [triage.data?.suggestion],
  );

  const handleApplyTriage = () => {
    const nextCategory = parsedTriage?.category ?? ticket.category;
    const nextPriority = parsedTriage?.priority ?? ticket.priority;

    if (nextCategory === ticket.category && nextPriority === ticket.priority) {
      toast.error('A triagem não trouxe categoria ou prioridade aplicáveis.');
      return;
    }

    updateTicket.mutate(
      {
        id: ticket.id,
        data: {
          title: ticket.title,
          description: ticket.description,
          priority: nextPriority,
          category: nextCategory,
          assignedToUserId: ticket.assignedToUserId,
        },
      },
      {
        onSuccess: () => {
          toast.success('Categoria e prioridade atualizadas com base na triagem.');
        },
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : 'Não foi possível aplicar a triagem ao ticket.',
          );
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface-light p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Assistente de IA do ticket</p>
        <p className="mt-1 text-muted">
           Usa o contrato real do backend para triagem, resumo e próxima resposta. A triagem pode aplicar apenas categoria e prioridade, porque o update atual do ticket não aceita departamento.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface-light p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Triagem automática</h3>
            <p className="text-xs text-muted">
              Sugere categoria, prioridade e departamento para o chamado.
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              triage.mutate(ticket.id, {
                onError: (error) => {
                  toast.error(
                    error instanceof Error ? error.message : 'Erro ao gerar triagem.',
                  );
                },
              })
            }
            loading={triage.isPending}
          >
            Gerar triagem
          </Button>
        </div>

        {triage.data && (
          <div className="mt-4 rounded-lg border border-border bg-surface-light p-4">
            {parsedTriage ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {parsedTriage.priority && (
                    <Badge color={PRIORITY_META[parsedTriage.priority].color}>
                      {PRIORITY_META[parsedTriage.priority].label}
                    </Badge>
                  )}
                  {parsedTriage.category && (
                    <Badge color="accent">Categoria: {parsedTriage.category}</Badge>
                  )}
                  {parsedTriage.department && (
                    <Badge color="slate">Depto sugerido: {parsedTriage.department}</Badge>
                  )}
                </div>

                {parsedTriage.reasoning && (
                  <div className="mt-3">
                    <MarkdownViewer source={parsedTriage.reasoning} />
                  </div>
                )}

                {parsedTriage.department && (
                  <p className="mt-3 text-xs text-muted">
                    O departamento sugerido ainda depende de ajuste manual fora do endpoint atual de update do ticket.
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={handleApplyTriage}
                    loading={updateTicket.isPending}
                  >
                    Aplicar categoria e prioridade
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void copyTextToClipboard(
                        triage.data.suggestion,
                        'Saida da triagem copiada para a area de transferencia.',
                      )
                    }
                  >
                    <Copy className="h-4 w-4" /> Copiar saida
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                   A IA retornou uma saída não estruturada. O conteúdo bruto continua disponível abaixo.
                </p>
                <div className="rounded-lg bg-black/20 p-3">
                  <MarkdownViewer source={triage.data.suggestion} />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void copyTextToClipboard(
                      triage.data.suggestion,
                      'Saida da triagem copiada para a area de transferencia.',
                    )
                  }
                >
                  <Copy className="h-4 w-4" /> Copiar saida
                </Button>
              </div>
            )}

            <TicketAiMetadata data={triage.data} />
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface-light p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Resumo executivo</h3>
            <p className="text-xs text-muted">
              Consolida problema, histórico e status atual em texto curto.
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              summary.mutate(ticket.id, {
                onError: (error) => {
                  toast.error(
                    error instanceof Error ? error.message : 'Erro ao gerar resumo.',
                  );
                },
              })
            }
            loading={summary.isPending}
          >
            Gerar resumo
          </Button>
        </div>

        {summary.data && (
          <div className="mt-4 rounded-lg border border-border bg-surface-light p-4">
            <MarkdownViewer source={summary.data.summary} />
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void copyTextToClipboard(
                    summary.data.summary,
                    'Resumo copiado para a area de transferencia.',
                  )
                }
              >
                <Copy className="h-4 w-4" /> Copiar resumo
              </Button>
            </div>
            <TicketAiMetadata data={summary.data} />
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface-light p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Resposta sugerida</h3>
            <p className="text-xs text-muted">
              Gera a proxima resposta ao usuario com base no ticket e nos comentarios.
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              suggestReply.mutate(ticket.id, {
                onError: (error) => {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : 'Erro ao sugerir resposta.',
                  );
                },
              })
            }
            loading={suggestReply.isPending}
          >
            Sugerir resposta
          </Button>
        </div>

        {suggestReply.data && (
          <div className="mt-4 rounded-lg border border-border bg-surface-light p-4">
            <MarkdownViewer source={suggestReply.data.suggestedReply} />
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void copyTextToClipboard(
                    suggestReply.data.suggestedReply,
                    'Resposta sugerida copiada para a area de transferencia.',
                  )
                }
              >
                <Copy className="h-4 w-4" /> Copiar resposta
              </Button>
              <Button
                size="sm"
                onClick={() => onUseSuggestedReply(suggestReply.data.suggestedReply)}
              >
                Usar no comentario
              </Button>
            </div>
            <TicketAiMetadata data={suggestReply.data} />
          </div>
        )}
      </div>
    </div>
  );
}

function normalizeAutomationActionType(value: unknown): AutomationTaskActionType {
  if (typeof value === 'number') return value as AutomationTaskActionType;

  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric as AutomationTaskActionType;
    if (value === 'InstallPackage') return AutomationTaskActionType.InstallPackage;
    if (value === 'UpdatePackage') return AutomationTaskActionType.UpdatePackage;
    if (value === 'RunScript') return AutomationTaskActionType.RunScript;
    if (value === 'CustomCommand') return AutomationTaskActionType.CustomCommand;
    if (value === 'RemovePackage') return AutomationTaskActionType.RemovePackage;
    if (value === 'UpdateOrInstallPackage') return AutomationTaskActionType.UpdateOrInstallPackage;
  }

  return AutomationTaskActionType.RunScript;
}

function getAutomationActionLabel(value: unknown) {
  switch (normalizeAutomationActionType(value)) {
    case AutomationTaskActionType.InstallPackage:
      return 'Instalar pacote';
    case AutomationTaskActionType.UpdatePackage:
      return 'Atualizar pacote';
    case AutomationTaskActionType.RunScript:
      return 'Executar script';
    case AutomationTaskActionType.CustomCommand:
      return 'Comando customizado';
    case AutomationTaskActionType.RemovePackage:
      return 'Remover pacote';
    case AutomationTaskActionType.UpdateOrInstallPackage:
      return 'Atualizar ou instalar';
    default:
      return 'Automação';
  }
}

function normalizeApprovalScopeType(value: unknown): AppApprovalScopeType {
  if (typeof value === 'number') return value as AppApprovalScopeType;

  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric as AppApprovalScopeType;
    if (value === 'Global') return AppApprovalScopeType.Global;
    if (value === 'Client') return AppApprovalScopeType.Client;
    if (value === 'Site') return AppApprovalScopeType.Site;
    if (value === 'Agent') return AppApprovalScopeType.Agent;
  }

  return AppApprovalScopeType.Global;
}

function getAutomationScopeLabel(value: unknown) {
  switch (normalizeApprovalScopeType(value)) {
    case AppApprovalScopeType.Global:
      return 'Global';
    case AppApprovalScopeType.Client:
      return 'Cliente';
    case AppApprovalScopeType.Site:
      return 'Site';
    case AppApprovalScopeType.Agent:
      return 'Agent';
    default:
      return 'Desconhecido';
  }
}

function isTaskRelevantToTicket(
  task: AutomationTaskSummary,
  ticket: { clientId: string; siteId: string | null; agentId: string | null },
) {
  switch (normalizeApprovalScopeType(task.scopeType)) {
    case AppApprovalScopeType.Global:
      return true;
    case AppApprovalScopeType.Client:
      return task.scopeId === ticket.clientId;
    case AppApprovalScopeType.Site:
      return !!ticket.siteId && task.scopeId === ticket.siteId;
    case AppApprovalScopeType.Agent:
      return !!ticket.agentId && task.scopeId === ticket.agentId;
    default:
      return false;
  }
}

function getAutomationStatusTone(statusLabel: string) {
  const normalized = statusLabel.trim().toLowerCase();
  if (normalized === 'approved') return 'success' as const;
  if (normalized === 'rejected') return 'danger' as const;
  if (normalized === 'pending') return 'warning' as const;
  return 'slate' as const;
}

function isPendingAutomationLink(link: TicketAutomationLink) {
  return link.statusLabel.trim().toLowerCase() === 'pending';
}

function AutomationLinksPanel({
  ticketId,
  clientId,
  siteId,
  agentId,
}: {
  ticketId: string;
  clientId: string;
  siteId: string | null;
  agentId: string | null;
}) {
  const { session } = useAuth();
  const linksQuery = useTicketAutomationLinks(ticketId);
  const tasksQuery = useAutomationTasks({ activeOnly: true, limit: 200 });
  const createLink = useCreateTicketAutomationLink();
  const approveLink = useApproveTicketAutomationLink();
  const rejectLink = useRejectTicketAutomationLink();
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const currentUserId = useMemo(
    () => getUserIdFromJwt(session.accessToken),
    [session.accessToken],
  );

  const taskItems = tasksQuery.data?.items ?? [];
  const linkItems = useMemo(
    () =>
      [...(linksQuery.data ?? [])].sort(
        (left, right) =>
          new Date(right.requestedAt).getTime() - new Date(left.requestedAt).getTime(),
      ),
    [linksQuery.data],
  );

  const taskMap = useMemo(
    () => new Map(taskItems.map((task) => [task.id, task])),
    [taskItems],
  );

  const matchingTasks = useMemo(
    () =>
      taskItems.filter((task) =>
        isTaskRelevantToTicket(task, { clientId, siteId, agentId }),
      ),
    [agentId, clientId, siteId, taskItems],
  );

  const availableTasks = matchingTasks.length > 0 ? matchingTasks : taskItems;
  const usingFallbackTasks = matchingTasks.length === 0 && taskItems.length > 0;

  const taskOptions = [
    {
      value: '',
      label:
        tasksQuery.isLoading
          ? 'Carregando tarefas...'
          : availableTasks.length === 0
            ? 'Nenhuma tarefa ativa disponível'
            : 'Selecione uma tarefa',
    },
    ...availableTasks.map((task) => ({
      value: task.id,
      label: `${task.name}  ${getAutomationScopeLabel(task.scopeType)}`,
    })),
  ];

  const handleCreateLink = () => {
    if (!selectedTaskId) return;

    createLink.mutate(
      {
        ticketId,
        data: {
          automationTaskDefinitionId: selectedTaskId,
          requestedBy: currentUserId ?? 'portal',
          note: requestNote.trim() || null,
        },
      },
      {
        onSuccess: () => {
          setSelectedTaskId('');
          setRequestNote('');
           toast.success('Solicitação de automação vinculada ao ticket.');
         },
         onError: (error) => {
           toast.error(
             error instanceof Error
               ? error.message
               : 'Não foi possível vincular a automação.',
          );
        },
      },
    );
  };

  const handleReviewLink = (
    link: TicketAutomationLink,
    action: 'approve' | 'reject',
  ) => {
    const mutation = action === 'approve' ? approveLink : rejectLink;

    mutation.mutate(
      {
        ticketId,
        linkId: link.id,
        data: {
          reviewedBy: currentUserId ?? 'portal',
          note: reviewNotes[link.id]?.trim() || null,
        },
      },
      {
        onSuccess: () => {
          setReviewNotes((current) => ({ ...current, [link.id]: '' }));
          toast.success(
            action === 'approve'
              ? 'Automação aprovada com sucesso.'
               : 'Automação rejeitada com sucesso.',
          );
        },
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : 'Não foi possível revisar a automação.',
          );
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface-light p-4">
        <div className="mb-3 flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Solicitar automação</h3>
             <p className="text-xs text-muted">
               Vincule uma tarefa ativa ao ticket e deixe a revisão pendente quando necessário.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Tarefa"
            options={taskOptions}
            value={selectedTaskId}
            onChange={(event) => setSelectedTaskId(event.target.value)}
            disabled={tasksQuery.isLoading || availableTasks.length === 0}
          />
          <Input
            label="Nota"
            value={requestNote}
            onChange={(event) => setRequestNote(event.target.value)}
            placeholder="Opcional: contexto da solicitação"
          />
        </div>

        {usingFallbackTasks && (
          <p className="mt-3 text-xs text-muted">
            Nenhuma tarefa aderente ao escopo do ticket foi encontrada; exibindo o catálogo ativo completo.
          </p>
        )}

        {tasksQuery.isError && (
          <p className="mt-3 text-sm text-danger">
            Não foi possível carregar as tarefas de automação ativas.
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <Button
            size="sm"
            onClick={handleCreateLink}
            loading={createLink.isPending}
            disabled={!selectedTaskId}
          >
            <Wrench className="h-4 w-4" /> Vincular automação
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {linksQuery.isLoading ? (
          <Loading />
        ) : linksQuery.isError ? (
          <p className="text-sm text-danger">Erro ao carregar vinculações de automação.</p>
         ) : linkItems.length === 0 ? (
           <p className="py-6 text-center text-sm text-muted">
             Nenhuma automação vinculada a este ticket.
          </p>
        ) : (
          linkItems.map((link) => {
            const task = taskMap.get(link.automationTaskDefinitionId);
            const isPending = isPendingAutomationLink(link);

            return (
              <div key={link.id} className="rounded-xl border border-border bg-surface-light p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {task?.name ?? link.automationTaskDefinitionId}
                      </p>
                      <Badge color={getAutomationStatusTone(link.statusLabel)}>
                        {link.statusLabel}
                      </Badge>
                      {task && (
                        <Badge color="slate">{getAutomationActionLabel(task.actionType)}</Badge>
                      )}
                      {task && (
                        <Badge color={task.requiresApproval ? 'warning' : 'accent'}>
                          {task.requiresApproval ? 'Requer aprovação' : 'Execução direta'}
                        </Badge>
                      )}
                    </div>

                    {task?.description && (
                      <p className="mt-1 text-xs text-muted">{task.description}</p>
                    )}

                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
                      <span>Escopo: {task ? getAutomationScopeLabel(task.scopeType) : 'Desconhecido'}</span>
                      <span>Solicitado em {new Date(link.requestedAt).toLocaleString('pt-BR')}</span>
                      {link.requestedBy && <span>por {link.requestedBy}</span>}
                      {task?.lastUpdatedAt && (
                        <span>Tarefa atualizada em {new Date(task.lastUpdatedAt).toLocaleString('pt-BR')}</span>
                      )}
                    </div>

                    {link.note && (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                        {link.note}
                      </p>
                    )}

                    {link.reviewedAt && (
                      <p className="mt-2 text-[11px] text-muted">
                        Revisado em {new Date(link.reviewedAt).toLocaleString('pt-BR')}
                        {link.reviewedBy ? ` por ${link.reviewedBy}` : ''}
                      </p>
                    )}
                  </div>
                </div>

                {isPending && (
                  <div className="mt-4 space-y-3 border-t border-border pt-3">
                    <Input
                      label="Nota da revisao"
                      value={reviewNotes[link.id] ?? ''}
                      onChange={(event) =>
                        setReviewNotes((current) => ({
                          ...current,
                          [link.id]: event.target.value,
                        }))
                      }
                      placeholder="Opcional: motivo ou instruções adicionais"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleReviewLink(link, 'approve')}
                        loading={approveLink.isPending}
                      >
                        Aprovar
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleReviewLink(link, 'reject')}
                        loading={rejectLink.isPending}
                      >
                        Rejeitar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function TicketCustomFieldsPanel({ ticketId }: { ticketId: string }) {
  const definitionsQuery = useCustomFieldDefinitions({
    scopeType: CustomFieldScopeType.Ticket,
  });
  const valuesQuery = useTicketCustomFields(ticketId);
  const upsertValue = useUpsertTicketCustomFieldValue();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingDefinitionId, setSavingDefinitionId] = useState<string | null>(null);

  const definitions = useMemo(
    () =>
      (Array.isArray(definitionsQuery.data) ? [...definitionsQuery.data] : [])
        .filter((definition) => definition.isActive)
        .sort((left, right) => left.label.localeCompare(right.label, 'pt-BR')),
    [definitionsQuery.data],
  );

  const valuesByDefinitionId = useMemo(
    () => new Map((Array.isArray(valuesQuery.data) ? valuesQuery.data : []).map((item) => [item.definitionId, item])),
    [valuesQuery.data],
  );

  useEffect(() => {
    const nextDrafts = Object.fromEntries(
      definitions.map((definition) => [
        definition.id,
        formatTicketCustomFieldDraftValue(
          definition.dataType,
          valuesByDefinitionId.get(definition.id)?.value,
        ),
      ]),
    );

    setDrafts(nextDrafts);
  }, [definitions, valuesByDefinitionId]);

  const handleSaveValue = async (definition: CustomFieldDefinition) => {
    setSavingDefinitionId(definition.id);

    try {
      await upsertValue.mutateAsync({
        ticketId,
        definitionId: definition.id,
        value: parseTicketCustomFieldDraftValue(
          definition.dataType,
          drafts[definition.id] ?? '',
        ),
      });

      toast.success(`Campo ${definition.label} atualizado.`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar o campo customizado.',
      );
    } finally {
      setSavingDefinitionId(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Campos customizados"
        subtitle="Valores específicos deste chamado definidos pela operação."
      />
      <div className="space-y-3">
        {definitionsQuery.isLoading || valuesQuery.isLoading ? (
          <Loading />
        ) : definitionsQuery.isError || valuesQuery.isError ? (
          <p className="text-sm text-danger">
            Erro ao carregar os campos customizados do ticket.
          </p>
        ) : definitions.length === 0 ? (
          <p className="text-sm text-muted">
            Nenhum campo customizado ativo para tickets.
          </p>
        ) : (
          definitions.map((definition) => {
            const valueItem = valuesByDefinitionId.get(definition.id);

            return (
              <div
                key={definition.id}
                className="rounded-lg border border-border bg-surface-light px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {definition.label}
                      </p>
                      <Badge color="slate">
                        {getCustomFieldDataTypeLabel(definition.dataType)}
                      </Badge>
                    </div>
                    {definition.description && (
                      <p className="mt-1 text-xs text-muted">
                        {definition.description}
                      </p>
                    )}
                    {valueItem?.updatedAt && (
                      <p className="mt-2 text-[11px] text-muted">
                        Atualizado em{' '}
                        {new Date(valueItem.updatedAt).toLocaleString('pt-BR')}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleSaveValue(definition)}
                    loading={savingDefinitionId === definition.id}
                  >
                    Salvar
                  </Button>
                </div>

                <div className="mt-3">
                  <TicketCustomFieldInput
                    definition={definition}
                    value={drafts[definition.id] ?? ''}
                    onChange={(value) =>
                      setDrafts((current) => ({
                        ...current,
                        [definition.id]: value,
                      }))
                    }
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}

function TicketCustomFieldInput({
  definition,
  value,
  onChange,
}: {
  definition: CustomFieldDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  switch (definition.dataType) {
    case CustomFieldDataType.Boolean:
      return (
        <Select
          label="Valor"
          value={value}
          options={[
            { value: '', label: 'Não definido' },
            { value: 'true', label: 'Verdadeiro' },
            { value: 'false', label: 'Falso' },
          ]}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case CustomFieldDataType.Dropdown:
      return (
        <Select
          label="Valor"
          value={value}
          options={[
            { value: '', label: 'Selecione...' },
            ...definition.options.map((option) => ({
              value: option,
              label: option,
            })),
          ]}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case CustomFieldDataType.ListBox:
      return (
        <TextArea
          label="Valor"
          rows={2}
          value={value}
          hint={
            definition.options.length > 0
              ? `Opções permitidas: ${definition.options.join(', ')}`
              : 'Separe múltiplos valores por vírgula.'
          }
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case CustomFieldDataType.Integer:
      return (
        <Input
          label="Valor"
          type="number"
          step="1"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case CustomFieldDataType.Decimal:
      return (
        <Input
          label="Valor"
          type="number"
          step="any"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case CustomFieldDataType.Date:
      return (
        <Input
          label="Valor"
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case CustomFieldDataType.DateTime:
      return (
        <Input
          label="Valor"
          type="datetime-local"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    default:
      return (
        <Input
          label="Valor"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}

function WatchersPanel({
  ticketId,
  assignedToUserId,
}: {
  ticketId: string;
  assignedToUserId: string | null;
}) {
  const watchers = useTicketWatchers(ticketId);
  const users = useIamUsers();
  const addWatcher = useAddTicketWatcher();
  const removeWatcher = useRemoveTicketWatcher();
  const [selectedUserId, setSelectedUserId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const watcherItems = watchers.data ?? [];
  const userItems = users.data ?? [];

  const userMap = useMemo(
    () => new Map<string, UserDto>(userItems.map((user) => [user.id, user])),
    [userItems],
  );

  const existingWatcherIds = useMemo(
    () => new Set(watcherItems.map((watcher) => watcher.userId)),
    [watcherItems],
  );

  const availableUsers = useMemo(
    () => userItems.filter((user) => !existingWatcherIds.has(user.id)),
    [existingWatcherIds, userItems],
  );

  const filteredAvailableUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) {
      return availableUsers.slice(0, 30);
    }

    return availableUsers
      .filter((user) => {
        const haystack = `${user.fullName ?? ''} ${user.login ?? ''} ${user.email ?? ''}`.toLowerCase();
        return haystack.includes(term);
      })
      .slice(0, 30);
  }, [availableUsers, searchTerm]);

  const userOptions = [
    {
      value: '',
      label: filteredAvailableUsers.length === 0 ? 'Nenhum usuario encontrado' : 'Selecione um usuario',
    },
    ...filteredAvailableUsers.map((user) => ({
      value: user.id,
      label: user.fullName || user.login || user.email,
    })),
  ];

  const closeAddWatcher = () => {
    setIsAdding(false);
    setSelectedUserId('');
    setSearchTerm('');
  };

  const handleAddWatcher = () => {
    if (!selectedUserId) return;

    addWatcher.mutate(
      {
        ticketId,
        data: { userId: selectedUserId },
      },
      {
        onSuccess: () => {
          closeAddWatcher();
          toast.success('Watcher adicionado com sucesso.');
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'Erro ao adicionar watcher.');
        },
      },
    );
  };

  const handleRemoveWatcher = (userId: string) => {
    removeWatcher.mutate(
      { ticketId, userId },
      {
        onSuccess: () => {
          toast.success('Watcher removido com sucesso.');
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : 'Erro ao remover watcher.');
        },
      },
    );
  };

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-foreground">Watchers</h3>
          <p className="text-xs text-muted">
            {watcherItems.length === 0 ? 'Sem watchers' : `${watcherItems.length} acompanhando`}
          </p>
        </div>
        <Button
          size="sm"
          variant={isAdding ? 'secondary' : 'ghost'}
          className="px-2"
          onClick={() => (isAdding ? closeAddWatcher() : setIsAdding(true))}
          aria-label="Adicionar watcher"
        >
          <UserPlus className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3">
        {watchers.isLoading || users.isLoading ? (
          <Loading />
        ) : watchers.isError || users.isError ? (
          <p className="text-sm text-danger">Erro ao carregar watchers.</p>
        ) : (
          <>
            {watcherItems.length > 0 && (
              <div className="space-y-2">
              {watcherItems.map((watcher) => {
                const user = userMap.get(watcher.userId);
                const displayName = user?.fullName || user?.login || user?.email || watcher.userId;
                const isAssignedUser = assignedToUserId === watcher.userId;

                return (
                  <div key={watcher.id} className="rounded-lg border border-border bg-surface-light px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {user?.email && user.email !== displayName && <Badge color="slate">{user.email}</Badge>}
                          {isAssignedUser && <Badge color="accent">Responsavel</Badge>}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveWatcher(watcher.userId)}
                        loading={removeWatcher.isPending}
                        aria-label={`Remover watcher ${displayName}`}
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              </div>
            )}

            {isAdding && (
              <div className={`${watcherItems.length > 0 ? 'border-t border-border pt-3' : ''} space-y-3`}>
                <Input
                  label="Pesquisar usuario"
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setSelectedUserId('');
                  }}
                  placeholder="Nome, login ou e-mail"
                />
                <Select
                  label="Selecionar usuario"
                  options={userOptions}
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                  disabled={filteredAvailableUsers.length === 0}
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={closeAddWatcher}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAddWatcher}
                    loading={addWatcher.isPending}
                    disabled={!selectedUserId}
                  >
                    Adicionar
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function SlaProgressBar({ pct, barColor }: { pct: number; barColor: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rounded = Math.round(pct);
    if (trackRef.current) trackRef.current.setAttribute('aria-valuenow', String(rounded));
    if (fillRef.current) fillRef.current.style.width = `${pct}%`;
  }, [pct]);

  return (
    <div
      ref={trackRef}
      className="h-2 w-full rounded-full bg-surface-hover"
      role="progressbar"
      aria-label={`SLA: ${Math.round(pct)}% utilizado`}
    >
      <div ref={fillRef} className={`h-2 rounded-full transition-all ${barColor}`} />
    </div>
  );
}

function TicketSummaryPanel({
  ticketId,
  category,
  priorityLabel,
  priorityColor,
  assignedDisplayName,
  assignedEmail,
  updatedAt,
  closedAt,
}: {
  ticketId: string;
  category: string | null;
  priorityLabel: string;
  priorityColor: 'slate' | 'success' | 'warning' | 'danger';
  assignedDisplayName: string;
  assignedEmail: string | null;
  updatedAt: string;
  closedAt: string | null;
}) {
  const sla = useSlaDetails(ticketId);
  const navigate = useNavigate();

  const renderSlaContent = () => {
    if (sla.isLoading) {
      return (
        <div className="flex items-center gap-2 text-muted">
          <Clock className="h-4 w-4 animate-pulse" />
          <span className="text-sm">Carregando SLA...</span>
        </div>
      );
    }

    if (sla.isError || !sla.data) {
      return <p className="text-sm text-muted">Não foi possível carregar os dados de SLA.</p>;
    }

    const d = sla.data;
    const pct = Math.min(d.percentUsed ?? 0, 100);
    const isBreached = Boolean(d.breached);
    const barColor = isBreached ? 'bg-danger' : pct >= 75 ? 'bg-warning' : 'bg-success';

    if (d.message && !d.slaExpiresAt) {
      return (
        <div className="space-y-2">
          <p className="text-sm text-muted">{d.message}</p>
          <p className="text-xs text-muted">
            O SLA depende do perfil de workflow do departamento. Sem perfil definido, o prazo não é calculado.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={isBreached ? 'danger' : d.onHold ? 'accent' : 'success'}>
            {isBreached ? 'SLA violado' : d.onHold ? 'SLA em pausa' : d.status ?? 'SLA ativo'}
          </Badge>
          {d.warningLevel && !isBreached && (
            <Badge color={d.warningLevel === 'low' ? 'success' : d.warningLevel === 'medium' ? 'warning' : 'danger'}>
              Nivel {d.warningLevel}
            </Badge>
          )}
        </div>
        {d.slaExpiresAt && (
          <p className="text-xs text-muted">
            Expira em {new Date(d.slaExpiresAt).toLocaleString('pt-BR')}
          </p>
        )}
        {d.percentUsed != null && (
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted">
              <span>{pct.toFixed(0)}% utilizado</span>
              {typeof d.hoursRemaining === 'number' && <span>{d.hoursRemaining.toFixed(1)}h restantes</span>}
            </div>
            <SlaProgressBar pct={pct} barColor={barColor} />
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader
        title="Resumo geral"
        subtitle="Detalhes do chamado e status de SLA"
        action={
          <Button size="sm" variant="secondary" onClick={() => navigate('/tickets/sla')}>
            <Clock className="h-4 w-4" /> Gerenciar SLA
          </Button>
        }
      />
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">Categoria</dt>
          <dd className="text-foreground">{category ?? '\u2014'}</dd>
        </div>
        <div>
          <dt className="text-muted">Prioridade</dt>
          <dd><Badge color={priorityColor}>{priorityLabel}</Badge></dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted">Responsável</dt>
          <dd className="text-foreground">
            <p className="break-words">{assignedDisplayName}</p>
            {assignedEmail && <p className="text-xs text-muted">{assignedEmail}</p>}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Atualizado</dt>
          <dd className="text-foreground">{new Date(updatedAt).toLocaleString('pt-BR')}</dd>
        </div>
        {closedAt && (
          <div>
            <dt className="text-muted">Encerrado em</dt>
            <dd className="text-foreground">{new Date(closedAt).toLocaleString('pt-BR')}</dd>
          </div>
        )}
      </dl>

      <div className="mt-4 border-t border-border pt-4">
        <div className="mb-2 flex items-center gap-2 text-muted-foreground">
          <Clock className="h-4 w-4" />
          <p className="text-sm font-medium">SLA</p>
        </div>
        {renderSlaContent()}
      </div>
    </Card>
  );
}

function CommentsPanel({
  ticketId,
  draftSeed,
}: {
  ticketId: string;
  draftSeed?: CommentSeed | null;
}) {
  const comments = useTicketComments(ticketId);
  return (
    <>
      <div className="space-y-3 max-h-80 overflow-y-auto">
        {(comments.data?.items ?? []).map(c => (
          <div key={c.id} className={`rounded-lg px-4 py-3 ${c.isInternal ? 'bg-warning/10 border border-warning/20' : 'bg-surface-light'}`}>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">{c.author}</span>
              <span className="text-xs text-muted">{new Date(c.createdAt).toLocaleString('pt-BR')}</span>
              {c.isInternal && <Badge color="warning"><Lock className="mr-1 h-3 w-3" />Interno</Badge>}
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{c.content}</p>
          </div>
        ))}
        {(comments.data?.items?.length ?? 0) === 0 && (
          <p className="text-sm text-muted py-4 text-center">Sem comentários ainda</p>
        )}
      </div>
      <CommentForm ticketId={ticketId} draftSeed={draftSeed} />
    </>
  );
}

function TimelinePanel({ ticketId }: { ticketId: string }) {
  const timeline = useTicketTimeline(ticketId);

  if (timeline.isLoading) return <Loading />;
  if (timeline.isError) return <p className="text-sm text-danger">Erro ao carregar timeline</p>;

  const entries = timeline.data ?? [];

  return (
    <div className="space-y-3 max-h-96 overflow-y-auto">
      {entries.length === 0 ? (
        <p className="text-sm text-muted py-4 text-center">Nenhum evento registrado</p>
      ) : (
        entries.map(e => (
          <div key={e.id} className="flex gap-3">
            <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-hover">
              <Activity className="h-3 w-3 text-muted" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-foreground">
                  {ACTIVITY_LABELS[e.activityType] ?? e.activityType}
                </span>
                <span className="text-xs text-muted">
                  {new Date(e.createdAt).toLocaleString('pt-BR')}
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5">{e.description}</p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function CommentForm({
  ticketId,
  draftSeed,
}: {
  ticketId: string;
  draftSeed?: CommentSeed | null;
}) {
  const addComment = useAddComment();
  const [content, setContent] = useState('');
  const [author] = useState('Admin');
  const [isInternal, setIsInternal] = useState(false);

  useEffect(() => {
    if (!draftSeed?.content) return;

    setContent(draftSeed.content);
    setIsInternal(false);
  }, [draftSeed?.nonce]);

  const handleSubmit = () => {
    if (!content.trim() || content.trim().length < 3) return;
    addComment.mutate(
      { id: ticketId, data: { author, content, isInternal } },
      {
        onSuccess: () => { setContent(''); toast.success('Comentário adicionado'); },
        onError:   () => toast.error('Erro'),
      },
    );
  };

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      <TextArea placeholder="Escreva um comentário... (mín. 3 chars)" value={content} onChange={e => setContent(e.target.value)} />
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)} className="rounded bg-surface-light border-border" />
          {isInternal ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          Nota interna
        </label>
        <Button size="sm" onClick={handleSubmit} loading={addComment.isPending} disabled={content.trim().length < 3}>
          <Send className="h-4 w-4" /> Enviar
        </Button>
      </div>
    </div>
  );
}

function WorkflowPanel({ ticketId, currentStateId }: { ticketId: string; currentStateId: string | null }) {
  const states    = useWorkflowStates();
  const updateWf  = useUpdateTicketWorkflow();
  const [selected, setSelected] = useState(currentStateId ?? '');

  const stateOptions = [
    { value: '', label: 'Selecione...' },
    ...(Array.isArray(states.data) ? states.data : []).map(s => ({ value: s.id, label: s.name })),
  ];

  const handleChange = () => {
    if (!selected || selected === currentStateId) return;
    updateWf.mutate(
      { id: ticketId, data: { workflowStateId: selected } },
      {
        onSuccess: () => toast.success('Estado atualizado'),
        onError:   () => toast.error('Transição inválida ou erro ao atualizar'),
      },
    );
  };

  return (
    <Card>
      <CardHeader title="Alterar Estado" />
      <div className="space-y-3">
        <Select options={stateOptions} value={selected} onChange={e => setSelected(e.target.value)} />
        <Button
          size="sm"
          className="w-full"
          onClick={handleChange}
          loading={updateWf.isPending}
          disabled={!selected || selected === currentStateId}
        >
          <ChevronDown className="h-4 w-4" /> Atualizar Estado
        </Button>
      </div>
    </Card>
  );
}

function EditTicketForm({ ticket, onDone }: { ticket: { id: string; title: string; description: string; priority: TicketPriority; category: string | null; assignedToUserId: string | null }; onDone: () => void }) {
  const update = useUpdateTicket();
  const [form, setForm] = useState<UpdateTicketRequest>({
    title:           ticket.title,
    description:     ticket.description,
    priority:        ticket.priority,
    category:        ticket.category,
    assignedToUserId: ticket.assignedToUserId,
  });

  const set = <K extends keyof UpdateTicketRequest>(k: K, v: UpdateTicketRequest[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const valid = form.title.trim().length >= 3 && form.description.trim().length >= 3;

  const handleSubmit = () => {
    if (!valid) return;
    update.mutate(
      { id: ticket.id, data: form },
      {
        onSuccess: () => { toast.success('Chamado atualizado'); onDone(); },
        onError:   () => toast.error('Erro ao atualizar'),
      },
    );
  };

  return (
    <Card>
      <CardHeader title="Editar Chamado" />
      <div className="space-y-4">
        <Input label="Título *" value={form.title} onChange={e => set('title', e.target.value)} />
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">Descrição *</label>
          <textarea
            aria-label="Descrição do chamado"
            className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground placeholder-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            rows={4}
            placeholder="Descreva o chamado..."
            value={form.description}
            onChange={e => set('description', e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Prioridade"
            options={[
              { value: 'Low',      label: 'Baixa'   },
              { value: 'Medium',   label: 'Média'   },
              { value: 'High',     label: 'Alta'    },
              { value: 'Critical', label: 'Crítica' },
            ]}
            value={form.priority}
            onChange={e => set('priority', e.target.value as TicketPriority)}
          />
          <Input label="Categoria" value={form.category ?? ''} onChange={e => set('category', e.target.value || null)} />
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onDone}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={update.isPending} disabled={!valid}>Salvar</Button>
        </div>
      </div>
    </Card>
  );
}

// -- Attachments Panel --------------------------------------------------------

type UploadStatus = 'idle' | 'preparing' | 'uploading' | 'confirming' | 'done' | 'error';

interface FileEntry {
  file: File;
  status: UploadStatus;
  error?: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function AttachmentsPanel({
  ticketId,
  siteId,
  clientId,
}: {
  ticketId: string
  siteId: string | null
  clientId: string | null
}) {
  // Prioridade de herança: Site > Client > Server
  const siteSettings = useSiteTicketAttachmentSettings(siteId);
  const clientSettings = useClientTicketAttachmentSettings(!siteId ? clientId : null);
  const serverSettings = useTicketAttachmentSettings();

  // Determina qual config usar baseado na hierarquia
  const settings = (() => {
    if (siteId && siteSettings.data) return { data: siteSettings.data, isLoading: false };
    if (clientId && clientSettings.data) return { data: clientSettings.data, isLoading: false };
    return serverSettings;
  })();

  const attachments = useTicketAttachments(ticketId);
  const prepare = usePrepareTicketUpload();
  const complete = useCompleteTicketUpload();
  const [queue, setQueue] = useState<FileEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cfg = settings.data;
  const isEnabled = cfg?.enabled !== false;

  const accept = cfg?.allowedContentTypes?.join(',') ?? 'image/jpeg,image/png,image/webp,application/pdf';
  const maxBytes = cfg?.maxFileSizeBytes ?? 10485760;

  const handleFiles = (files: FileList | null) => {
    if (!files || !isEnabled) return;
    const entries: FileEntry[] = [];
    for (const file of Array.from(files)) {
      if (file.size > maxBytes) {
        entries.push({ file, status: 'error', error: `Arquivo excede o limite de ${formatBytes(maxBytes)}` });
        continue;
      }
      if (cfg?.allowedContentTypes && !cfg.allowedContentTypes.includes(file.type)) {
        entries.push({ file, status: 'error', error: `Tipo não permitido: ${file.type}` });
        continue;
      }
      entries.push({ file, status: 'idle' });
    }
    setQueue((q) => [...q, ...entries]);
  };

  const updateEntry = (idx: number, patch: Partial<FileEntry>) =>
    setQueue((q) => q.map((e, i) => (i === idx ? { ...e, ...patch } : e)));

  const uploadAll = async () => {
    if (uploading) return;
    const idleIndexes = queue.map((_e, i) => i).filter((i) => queue[i].status === 'idle');
    if (idleIndexes.length === 0) return;
    setUploading(true);

    for (const idx of idleIndexes) {
      const entry = queue[idx];
      updateEntry(idx, { status: 'preparing', error: undefined });

      let prepareRes: { attachmentId: string; objectKey: string; uploadUrl: string; httpMethod: string; expiresAtUtc: string };
      try {
        prepareRes = await prepare.mutateAsync({
          ticketId,
          data: {
            fileName: entry.file.name,
            contentType: entry.file.type,
            sizeBytes: entry.file.size,
          },
        });
      } catch (err) {
        updateEntry(idx, { status: 'error', error: err instanceof Error ? err.message : 'Erro ao preparar upload' });
        continue;
      }

      updateEntry(idx, { status: 'uploading' });
      try {
        const res = await fetch(prepareRes.uploadUrl, {
          method: prepareRes.httpMethod,
          headers: { 'Content-Type': entry.file.type },
          body: entry.file,
        });
        if (!res.ok) throw new Error(`Upload falhou: ${res.status} ${res.statusText}`);
      } catch (err) {
        updateEntry(idx, { status: 'error', error: err instanceof Error ? err.message : 'Erro no upload' });
        continue;
      }

      updateEntry(idx, { status: 'confirming' });
      try {
        await complete.mutateAsync({
          ticketId,
          data: {
            attachmentId: prepareRes.attachmentId,
            objectKey: prepareRes.objectKey,
            fileName: entry.file.name,
            contentType: entry.file.type,
            sizeBytes: entry.file.size,
            uploadedBy: 'Admin',
          },
        });
        updateEntry(idx, { status: 'done' });
      } catch (err) {
        updateEntry(idx, { status: 'error', error: err instanceof Error ? err.message : 'Erro ao confirmar upload' });
      }
    }

    setUploading(false);
  };

  const STATUS_ICON: Record<UploadStatus, React.ReactNode> = {
    idle: <Upload className="h-4 w-4 text-muted" />,
    preparing: <Loader2 className="h-4 w-4 animate-spin text-sky-400" />,
    uploading: <Loader2 className="h-4 w-4 animate-spin text-sky-400" />,
    confirming: <Loader2 className="h-4 w-4 animate-spin text-sky-400" />,
    done: <CheckCircle className="h-4 w-4 text-success" />,
    error: <XCircle className="h-4 w-4 text-danger" />,
  };

  const STATUS_LABEL: Record<UploadStatus, string> = {
    idle: 'Aguardando',
    preparing: 'Preparando',
    uploading: 'Enviando',
    confirming: 'Confirmando',
    done: 'Concluído',
    error: 'Erro',
  };

  return (
    <div className="space-y-4">
      {!isEnabled && (
        <div className="rounded-lg border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
          Upload de anexos está desabilitado nas configurações do servidor.
        </div>
      )}

      {isEnabled && (
        <>
          <div
            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-8 text-center transition-colors hover:border-border-strong cursor-pointer"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          >
            <Paperclip className="h-6 w-6 text-muted" />
            <p className="text-sm text-muted">
              Arraste arquivos aqui ou{' '}
              <span className="text-primary underline">clique para selecionar</span>
            </p>
            <p className="text-xs text-muted">
              Máx. {formatBytes(maxBytes)} · {accept}
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={accept}
            aria-label="Selecionar arquivos para anexar"
            title="Selecionar arquivos para anexar"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {queue.length > 0 && (
            <div className="space-y-2">
              {queue.map((entry, idx) => (
                <div key={idx} className="flex items-center gap-3 rounded-lg border border-border bg-surface-light px-3 py-2">
                  <File className="h-4 w-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{entry.file.name}</p>
                    <p className="text-xs text-muted">{formatBytes(entry.file.size)}</p>
                    {entry.error && <p className="text-xs text-danger">{entry.error}</p>}
                  </div>
                  <span className={`text-xs ${entry.status === 'error' ? 'text-danger' : entry.status === 'done' ? 'text-success' : 'text-muted'}`}>
                    {STATUS_LABEL[entry.status]}
                  </span>
                  {STATUS_ICON[entry.status]}
                </div>
              ))}
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setQueue([])}>Limpar</Button>
                <Button
                  size="sm"
                  onClick={uploadAll}
                  loading={uploading}
                  disabled={!queue.some((e) => e.status === 'idle')}
                >
                  <Upload className="h-4 w-4" /> Enviar todos
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Existing attachments list */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Arquivos anexados</p>
        {attachments.isLoading && <Loading />}
        {(Array.isArray(attachments.data?.items) ? attachments.data.items : []).length === 0 && !attachments.isLoading && (
          <p className="py-4 text-center text-sm text-muted">Nenhum anexo ainda.</p>
        )}
        {(Array.isArray(attachments.data?.items) ? attachments.data.items : []).map((a) => (
          <div key={a.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface-light px-3 py-2">
            <File className="h-4 w-4 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">{a.fileName}</p>
              <p className="text-xs text-muted">
                {formatBytes(a.sizeBytes)} · {a.contentType} · {new Date(a.createdAt).toLocaleString('pt-BR')}
              </p>
            </div>
            <Badge color="slate">{a.uploadedBy}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
