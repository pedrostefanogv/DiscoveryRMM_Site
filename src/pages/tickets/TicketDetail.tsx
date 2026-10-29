import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { MarkdownViewer } from '@/components/ui/MarkdownViewer';
import { useAuth } from '@/auth/AuthContext';
import { getUserIdFromJwt, getUserNameFromJwt } from '@/auth/jwt';
import { AppApprovalScopeType, AutomationTaskActionType } from '@/api';
import {
  useTicket,
  useTicketComments,
  useAddComment,
  useUpdateTicketWorkflow,
  useUpdateTicket,
  useTicketTimeline,
  useSlaDetails,
  useTicketAttachments,
  useAllTicketAttachments,
  usePrepareTicketUpload,
  useCompleteTicketUpload,
  usePrepareCommentUpload,
  useCompleteCommentUpload,
  useDeleteComment,
  useReopenTicket,
  useDeleteTicket,
} from '@/hooks/useTickets';
import { useTicketMacros } from '@/hooks/useSupportProductivity';
import { useAuthorization } from '@/auth/authorization';
import TicketChatHistory from './TicketChatHistory';
import { TicketRunbookPanel } from './TicketRunbookPanel';
import { TicketRatingCard } from '@/components/tickets/TicketRatingCard';
import { TicketStateBadge } from '@/components/tickets/TicketStateBadge';
import { WatchersSection } from '@/components/tickets/WatchersSection';
import { TicketAiAssignmentCard } from '@/components/tickets/TicketAiAssignmentCard';
import { TicketFieldsSection } from '@/components/tickets/TicketFieldsSection';
import { TicketRelationsSection } from '@/components/tickets/TicketRelationsSection';
import { RequesterPickerModal } from '@/components/tickets/RequesterPickerModal';
import { AgentPickerModal } from '@/components/tickets/AgentPickerModal';
import { DepartmentPickerModal } from '@/components/tickets/DepartmentPickerModal';
import { useDepartments } from '@/hooks/useDepartments';
import { useAgentsByClient, useAgentsBySite } from '@/hooks/useAgents';
import { describeSlaPause, hasPausedShift, resolveSlaExpiryDisplay } from './slaDisplay';
import { useTicketAnswers } from '@/hooks/useTicketAnswers';
import { useAutomationTasks } from '@/hooks/useAutomation';
import { useTicketAttachmentSettings } from '@/hooks/useConfigurationApi';
import { useSiteTicketAttachmentSettings, useClientTicketAttachmentSettings } from '@/hooks/useConfigurationApi';
import { useWorkflowStates } from '@/hooks/useWorkflow';
import { useIamUsers } from '@/hooks/useIdentity';
import { useWheelScrollChaining } from '@/hooks/useWheelScrollChaining';
import { useAgent } from '@/hooks/useAgents';
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
import { Icon, Button, Card, CardHeader, Badge, Loading, ErrorDisplay, TextArea, Select, Input, ImageLightbox,
PageHeader,
} from '@/components/ui';
import { ticketsApi } from '@/api';
import type {
  AutomationTaskSummary,
  Ticket,
  TicketAutomationLink,
  TicketAiSuggestedReplyResponse,
  TicketAiSummaryResponse,
  TicketAiTriageResponse,
  TicketPriority,
  UserDto,
} from '@/api';
import toast from 'react-hot-toast';
import { getTicketPriorityMeta } from '@/utils/labels';
import { triggerBlobDownload, isImageAttachment } from '@/utils/chatAttachment';
import { upsertCommentPage, type CommentPage } from '@/utils/commentPages';
import {
  formatRelativeTime,
  groupTimelineByDay,
  TIMELINE_TONE_CLASS,
  timelineMetaFor,
} from '@/utils/ticketTimeline';

type Tab = 'comments' | 'timeline' | 'attachments' | 'automation' | 'ai' | 'chat';

/** Permissões que habilitam iniciar/responder o chat do chamado. */
const TICKET_CHAT_PERMISSIONS = ['tickets.chat', 'tickets.*', 'tickets.edit', 'admin.*'];

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

/**
 * Config efetiva de anexos de chamado: herda Site > Cliente > Servidor.
 * Compartilhada entre o gate da aba e o próprio painel.
 */
function useEffectiveTicketAttachmentSettings(siteId: string | null, clientId: string | null) {
  const siteSettings = useSiteTicketAttachmentSettings(siteId);
  const clientSettings = useClientTicketAttachmentSettings(!siteId ? clientId : null);
  const serverSettings = useTicketAttachmentSettings();

  // IMPORTANTE: nunca use `return` antecipado aqui dentro de um caminho que
  // mude a QUANTIDADE de hooks entre renders. Este hook precisa montar sempre
  // os mesmos tres useQuery; apenas a resolucao do valor e condicional.
  return useMemo(() => {
    if (siteId && siteSettings.data) return { data: siteSettings.data, isLoading: false };
    if (clientId && clientSettings.data) return { data: clientSettings.data, isLoading: false };
    return serverSettings;
  }, [
    siteId,
    clientId,
    siteSettings.data,
    clientSettings.data,
    serverSettings,
  ]);
}

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const ticket   = useTicket(id!);
  const comments = useTicketComments(id!);
  const states   = useWorkflowStates();
  const iamUsers = useIamUsers();
  // ?tab=chat permite deep-link (notificação de nova mensagem no chat).
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === 'undefined') return 'comments';
    const requested = new URLSearchParams(window.location.search).get('tab');
    return requested === 'chat' ? 'chat' : 'comments';
  });
  const [commentSeed, setCommentSeed] = useState<CommentSeed | null>(null);
  const iamUsersData = useMemo(
    () => (Array.isArray(iamUsers.data) ? iamUsers.data : []),
    [iamUsers.data],
  );
  const iamUsersById = useMemo(
    () => new Map<string, UserDto>(iamUsersData.map((user) => [user.id, user])),
    [iamUsersData],
  );
  const currentUserId = useMemo(
    () => getUserIdFromJwt(session.accessToken),
    [session.accessToken],
  );
  // "Próprio" na conversa do chamado: o autor do comentário é o LOGIN do
  // usuário. Fonte primária é o claim unique_name do JWT; sem ele (token sem
  // login), cai para o login do usuário na lista do IAM.
  const currentUserLogin = useMemo(() => {
    const fromToken = getUserNameFromJwt(session.accessToken);
    if (fromToken) return fromToken.trim().toLowerCase();

    const fromIam = currentUserId
      ? iamUsersById.get(currentUserId)?.login
      : undefined;
    return (fromIam ?? '').trim().toLowerCase();
  }, [session.accessToken, currentUserId, iamUsersById]);

  // Hook chamado antes dos returns condicionais (usa dados do ticket quando disponíveis).
  const attachmentSettings = useEffectiveTicketAttachmentSettings(
    ticket.data?.siteId ?? null,
    ticket.data?.clientId ?? null,
  );

  const attachmentsEnabled = attachmentSettings.data?.enabled !== false;

  // Chat do chamado: só o atendente com permissão de edição pode iniciar/responder.
  const authz = useAuthorization();
  const canManageChat = authz.hasAnyPermission(TICKET_CHAT_PERMISSIONS);

  // Effect registrado ANTES dos returns condicionais: chamá-lo depois do
  // "if (ticket.isLoading) return" mudava a ORDEM de hooks entre o render de
  // loading e o render com dados, disparando
  // "Rendered more hooks than during the previous render".
  // Se os anexos forem desabilitados com a aba aberta, volta para comentários
  // (senão o conteúdo mostra CommentsPanel sem nenhuma aba ativa).
  useEffect(() => {
    if (!attachmentsEnabled && tab === 'attachments') {
      setTab('comments');
    }
  }, [attachmentsEnabled, tab]);

  if (ticket.isLoading) return <Loading />;
  if (ticket.isError || !ticket.data) return <ErrorDisplay onRetry={() => ticket.refetch()} />;

  const t = ticket.data;
  const p = getTicketPriorityMeta(t.priority);
  const currentUserName = currentUserId
    ? resolveUserDisplayName(iamUsersById, currentUserId)
    : 'Portal';
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
      <PageHeader
        title={t.title}
        description={`Criado em ${new Date(t.createdAt).toLocaleDateString('pt-BR')}${t.closedAt ? ` · Encerrado em ${new Date(t.closedAt).toLocaleDateString('pt-BR')}` : ''}`}
        onBack={() => navigate('/tickets')}
      >
        <Badge color={p.color}>{p.label}</Badge>
        {currentState && (
          <TicketStateBadge name={currentState.name} color={currentState.color} />
        )}
        <ReopenButton ticketId={t.id} isClosed={Boolean(t.closedAt) || currentState?.isFinal === true} />
        <Button size="sm" variant="ghost" onClick={() => navigate(knowledgeUrl)}>
          <Icon name="menu_book" className="h-4 w-4" /> Conhecimento
        </Button>
        <DeleteTicketButton ticketId={t.id} title={t.title} />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Solicitação original: descrição + abertura (template/respostas).
              Somente leitura: depois de aberto, o pedido não é editado; a evolução
              acontece nos comentários e na timeline. */}
          <Card>
            <CardHeader
              title="Chamado"
              subtitle="Solicitação original — somente leitura"
            />
            <div className="space-y-5">
              <section>
                <h4 className="text-xs font-medium uppercase tracking-wider text-muted">
                  Descrição
                </h4>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                  {t.description?.trim() ? t.description : 'Sem descrição informada.'}
                </p>
              </section>

              <TicketOpeningSection ticket={t} />
            </div>
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
                <Icon name="monitoring" className="inline h-4 w-4 mr-1" />
                Timeline
              </button>
              {attachmentsEnabled && (
                <button
                  className={`px-4 py-3 text-sm font-medium transition-colors ${tab === 'attachments' ? 'border-b-2 border-primary text-foreground' : 'text-muted hover:text-foreground'}`}
                  onClick={() => setTab('attachments')}
                >
                  <Icon name="attach_file" className="inline h-4 w-4 mr-1" />
                  Anexos
                </button>
              )}
              <button
                className={`px-4 py-3 text-sm font-medium transition-colors ${tab === 'automation' ? 'border-b-2 border-primary text-foreground' : 'text-muted hover:text-foreground'}`}
                onClick={() => setTab('automation')}
              >
                <Icon name="build" className="inline h-4 w-4 mr-1" />
                Automação
              </button>
              <button
                className={`px-4 py-3 text-sm font-medium transition-colors ${tab === 'ai' ? 'border-b-2 border-primary text-foreground' : 'text-muted hover:text-foreground'}`}
                onClick={() => setTab('ai')}
              >
                IA
              </button>
              <button
                className={`px-4 py-3 text-sm font-medium transition-colors ${tab === 'chat' ? 'border-b-2 border-primary text-foreground' : 'text-muted hover:text-foreground'}`}
                onClick={() => setTab('chat')}
              >
                <Icon name="desktop_windows" className="inline h-4 w-4 mr-1" />
                Chat
              </button>
            </div>
            <div className="p-4">
              {tab === 'comments' ? (
                <CommentsPanel
                  ticketId={id!}
                  draftSeed={commentSeed}
                  currentUserLogin={currentUserLogin}
                  onOpenAttachments={() => setTab('attachments')}
                />
              ) : tab === 'timeline' ? (
                <TimelinePanel
                  ticketId={id!}
                  onOpenComments={() => setTab('comments')}
                  onOpenChat={() => setTab('chat')}
                />
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
              ) : tab === 'chat' ? (
                // Lista + histórico (somente leitura): a conversa ao vivo fica
                // na janela separada, para sobreviver à navegação do atendente.
                <TicketChatHistory
                  ticketId={id!}
                  agentId={t.agentId}
                  clientId={t.clientId}
                  siteId={t.siteId}
                  canManage={canManageChat}
                />
              ) : attachmentsEnabled ? (
                <AttachmentsPanel
                  ticketId={id!}
                  siteId={t.siteId}
                  clientId={t.clientId}
                  uploadedBy={currentUserName}
                />
              ) : (
                <CommentsPanel
                  ticketId={id!}
                  draftSeed={commentSeed}
                  currentUserLogin={currentUserLogin}
                  onOpenAttachments={() => setTab('attachments')}
                />
              )}
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* CSAT primeiro; o card só aparece depois do encerramento. */}
          <TicketRatingCard
            ticket={t}
            currentUserId={currentUserId}
            requesterName={resolveUserDisplayName(iamUsersById, t.requesterUserId)}
          />
          <TicketSummaryPanel
            ticketId={id!}
            category={t.category}
            priorityLabel={p.label}
            priorityColor={p.color}
            assignedDisplayName={assignedDisplayName}
            assignedEmail={assignedEmail}
            assignedToUserId={t.assignedToUserId}
            departmentId={t.departmentId}
            requesterUserId={t.requesterUserId ?? null}
            agentId={t.agentId}
            clientId={t.clientId}
            siteId={t.siteId}
            currentUserId={currentUserId}
            updatedAt={t.updatedAt}
            closedAt={t.closedAt}
            templateName={t.templateName}
            currentStateId={t.workflowStateId}
          />
        </div>
      </div>
    </div>
  );
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
           Usa o contrato real do backend para triagem, resumo e próxima resposta. A triagem pode aplicar categoria e prioridade em um clique; o departamento sugerido pode ser transferido na linha "Departamento" do Resumo geral.
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
                    <Badge color={getTicketPriorityMeta(parsedTriage.priority).color}>
                      {getTicketPriorityMeta(parsedTriage.priority).label}
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
                    Departamento sugerido: use a linha "Departamento" do Resumo geral para transferir o chamado.
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
                    <Icon name="content_copy" className="h-4 w-4" /> Copiar saida
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
                  <Icon name="content_copy" className="h-4 w-4" /> Copiar saida
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
                <Icon name="content_copy" className="h-4 w-4" /> Copiar resumo
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
                <Icon name="content_copy" className="h-4 w-4" /> Copiar resposta
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
          <Icon name="build" className="h-4 w-4 text-muted" />
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
            <Icon name="build" className="h-4 w-4" /> Vincular automação
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
                          {task.requiresApproval ? 'Notifica o usuário' : 'Execução direta'}
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

function ReopenButton({ ticketId, isClosed }: { ticketId: string; isClosed: boolean }) {
  const reopen = useReopenTicket();

  if (!isClosed) return null;

  const handleReopen = () => {
    const reason = window.prompt('Motivo da reabertura (opcional):') ?? undefined;
    reopen.mutate(
      { id: ticketId, data: { reason: reason?.trim() || null } },
      {
        onSuccess: () => toast.success('Chamado reaberto'),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao reabrir o chamado'),
      },
    );
  };

  return (
    <Button size="sm" variant="secondary" onClick={handleReopen} loading={reopen.isPending}>
      <Icon name="restart_alt" className="h-4 w-4" /> Reabrir
    </Button>
  );
}

/** Exportado para teste: a seção só existe em abertura por modelo/template. */
export function TicketOpeningSection({ ticket }: { ticket: Ticket }) {
  const hasTemplate = Boolean(ticket.templateName);
  // Chamado comum (sem template) não busca respostas: a seção inteira é do
  // formulário de abertura.
  const answers = useTicketAnswers(ticket.id, hasTemplate);
  const items = answers.data ?? [];
  const templateRemoved = hasTemplate && !ticket.templateId;

  // A seção existe apenas para abertura por modelo/template. Sem template, o
  // chamado segue com os dados normais (Descrição, campos do departamento,
  // timeline); o snapshot markdown legado de aberturas comuns não é exibido.
  if (!hasTemplate) return null;

  return (
    <section className="space-y-4 border-t border-border pt-4">
      <div>
        <h4 className="text-xs font-medium uppercase tracking-wider text-muted">
          Abertura do chamado
        </h4>
        <p className="text-xs text-muted">
          Formulário e respostas registrados na abertura.
        </p>
      </div>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={templateRemoved ? 'warning' : 'accent'}>
            <Icon name="assignment" className="mr-0.5 inline h-3 w-3" />
            {ticket.templateName}
          </Badge>
          {templateRemoved && (
            <span className="text-xs text-muted">Template removido do catálogo</span>
          )}
        </div>

        {answers.isLoading && <Loading message="Carregando respostas..." />}
        {answers.isError && (
          <p className="text-sm text-muted">Não foi possível carregar as respostas deste chamado.</p>
        )}

        {!answers.isLoading && items.length > 0 && (
          <dl className="space-y-2">
            {items.map((answer) => (
              <div
                key={answer.questionKey}
                className="rounded-lg border border-border bg-surface-light px-3 py-2"
              >
                <dt className="text-xs font-medium text-muted">{answer.questionLabel}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
                  {answer.valueText?.trim() ? answer.valueText : '—'}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {!answers.isLoading && items.length === 0 && (
          <p className="text-sm text-muted">
            Nenhuma resposta registrada para este chamado (modelo sem perguntas ou respostas vazias).
          </p>
        )}

        {ticket.submissionSnapshotMarkdown && (
          <details
            className="rounded-lg border border-border bg-surface-light p-3"
            open={items.length === 0}
          >
            <summary className="cursor-pointer text-xs font-medium text-muted">
              Registro original da abertura (markdown)
            </summary>
            <div className="mt-3 text-sm">
              <MarkdownViewer source={ticket.submissionSnapshotMarkdown} />
            </div>
          </details>
        )}
      </div>
    </section>
  );
}


/**
 * Move o chamado para a lixeira (soft delete no backend).
 * Confirma com o usuário e volta para a lista de chamados.
 */
function DeleteTicketButton({ ticketId, title }: { ticketId: string; title: string }) {
  const navigate = useNavigate();
  const deleteTicket = useDeleteTicket();

  const handleDelete = () => {
    if (!window.confirm(`Excluir o chamado "${title}"?\n\nEle será movido para a lixeira e deixará de aparecer nas listagens.`))
      return;
    deleteTicket.mutate(ticketId, {
      onSuccess: () => {
        toast.success('Chamado movido para a lixeira');
        navigate('/tickets');
      },
      onError: (error: unknown) =>
        toast.error(
          error instanceof Error && error.message
            ? error.message
            : 'Não foi possível excluir o chamado',
        ),
    });
  };

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={handleDelete}
      loading={deleteTicket.isPending}
      aria-label="Excluir chamado"
      title="Excluir chamado"
      className="text-danger hover:bg-danger/10"
    >
      <Icon name="delete" className="h-4 w-4" /> Excluir
    </Button>
  );
}
function TicketSummaryPanel({
  ticketId,
  category,
  priorityLabel,
  priorityColor,
  assignedDisplayName,
  assignedEmail,
  assignedToUserId,
  departmentId,
  requesterUserId,
  agentId,
  clientId,
  siteId,
  currentUserId,
  currentStateId,
  updatedAt,
  closedAt,
  templateName,
}: {
  ticketId: string;
  category: string | null;
  priorityLabel: string;
  priorityColor: 'slate' | 'success' | 'warning' | 'danger';
  assignedDisplayName: string;
  assignedEmail: string | null;
  assignedToUserId: string | null;
  departmentId: string | null;
  requesterUserId: string | null;
  agentId: string | null;
  clientId: string;
  siteId: string | null;
  currentUserId: string | null;
  currentStateId: string | null;
  updatedAt: string;
  closedAt: string | null;
  templateName?: string | null;
}) {
  const updateRequester = useUpdateTicket();
  const iamUsers = useIamUsers();
  const agentQuery = useAgent(agentId ?? undefined);

  const agentHostname = agentQuery.data?.hostname ?? null;
  const agentDisplayName = agentId
    ? (agentQuery.data?.displayName || agentHostname || 'Agent vinculado')
    : null;
  const [requesterModalOpen, setRequesterModalOpen] = useState(false);
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [departmentModalOpen, setDepartmentModalOpen] = useState(false);

  // Máquinas do escopo do chamado: site quando houver, senão o cliente.
  const siteAgents = useAgentsBySite(siteId ?? '');
  const clientAgents = useAgentsByClient(siteId ? '' : clientId);
  const agentOptions = siteId ? (siteAgents.data ?? []) : (clientAgents.data ?? []);
  const agentScopeLabel = siteId ? 'do site do chamado' : 'do cliente do chamado';

  const changeAgent = (newAgentId: string | null) => {
    updateRequester.mutate(
      { id: ticketId, data: { agentId: newAgentId, clearAgent: newAgentId === null } },
      {
        onSuccess: () => {
          toast.success(newAgentId ? 'Agent vinculado' : 'Agent removido');
          setAgentModalOpen(false);
        },
        onError: (error: unknown) =>
          toast.error(error instanceof Error ? error.message : 'Erro ao vincular o agent'),
      },
    );
  };

  // Estado do workflow: fica no Resumo (antes do Template), revelado por ícone.
  const workflowStates = useWorkflowStates();
  const updateWorkflow = useUpdateTicketWorkflow();
  const [stateEditing, setStateEditing] = useState(false);
  const [selectedState, setSelectedState] = useState(currentStateId ?? '');

  useEffect(() => {
    setSelectedState(currentStateId ?? '');
    setStateEditing(false);
  }, [ticketId, currentStateId]);

  const stateOptions = [
    { value: '', label: 'Selecione...' },
    ...(Array.isArray(workflowStates.data) ? workflowStates.data : []).map((state) => ({
      value: state.id,
      label: state.name,
    })),
  ];
  const currentStateName =
    (workflowStates.data ?? []).find((state) => state.id === currentStateId)?.name ?? 'Não definido';

  const saveState = () => {
    if (!selectedState || selectedState === currentStateId) return;
    updateWorkflow.mutate(
      { id: ticketId, data: { workflowStateId: selectedState } },
      {
        onSuccess: () => {
          toast.success('Estado atualizado');
          setStateEditing(false);
        },
        onError: (error: unknown) =>
          toast.error(
            error instanceof Error && error.message
              ? error.message
              : 'Transição inválida ou erro ao atualizar',
          ),
      },
    );
  };
  // Departamentos do escopo do chamado (do cliente + globais) para a
  // transferência. Hook incondicional para não alterar a ordem no render.
  const departmentsQuery = useDepartments({ clientId, includeGlobal: true });
  const iamUsersById = useMemo(
    () => new Map((iamUsers.data ?? []).map((user) => [user.id, user])),
    [iamUsers.data],
  );
  const departmentName =
    (departmentsQuery.data ?? []).find((department) => department.id === departmentId)?.name ?? null;
  const requesterDisplayName = requesterUserId
    ? resolveUserDisplayName(iamUsersById, requesterUserId)
    : null;

  const changeRequester = (userId: string | null) => {
    updateRequester.mutate(
      { id: ticketId, data: { requesterUserId: userId, clearRequester: userId === null } },
      {
        onSuccess: () => {
          toast.success(userId ? 'Solicitante atualizado' : 'Solicitante removido');
          setRequesterModalOpen(false);
        },
        onError: (error: unknown) =>
          toast.error(error instanceof Error ? error.message : 'Erro ao atualizar o solicitante'),
      },
    );
  };

  const changeDepartment = (nextDepartmentId: string | null) => {
    if (nextDepartmentId === (departmentId ?? null)) {
      setDepartmentModalOpen(false);
      return;
    }

    updateRequester.mutate(
      {
        id: ticketId,
        data: nextDepartmentId
          ? { departmentId: nextDepartmentId }
          : { clearDepartment: true },
      },
      {
        onSuccess: () => {
          toast.success(
            nextDepartmentId ? 'Departamento transferido' : 'Departamento removido',
          );
          setDepartmentModalOpen(false);
        },
        onError: (error: unknown) =>
          toast.error(
            error instanceof Error ? error.message : 'Erro ao transferir o chamado',
          ),
      },
    );
  };

  const assumeTicket = () => {
    if (!currentUserId) {
      toast.error('Não foi possível identificar o usuário autenticado.');
      return;
    }
    updateRequester.mutate(
      { id: ticketId, data: { assignedToUserId: currentUserId } },
      {
        onSuccess: () => toast.success('Chamado assumido com sucesso.'),
        onError: (error: unknown) =>
          toast.error(error instanceof Error ? error.message : 'Não foi possível assumir o chamado.'),
      },
    );
  };
  const sla = useSlaDetails(ticketId);

  const renderSlaContent = () => {
    if (sla.isLoading) {
      return (
        <div className="flex items-center gap-2 text-muted">
          <Icon name="schedule" className="h-4 w-4 animate-pulse" />
          <span className="text-sm">Carregando SLA...</span>
        </div>
      );
    }

    if (sla.isError || !sla.data) {
      return <p className="text-sm text-muted">Não foi possível carregar os dados de SLA.</p>;
    }

    const d = sla.data;
    // B1: exibir o prazo EFETIVO (original + tempo pausado). O campo cru
    // slaExpiresAt ignorava a pausa e contradizia o percentual do servidor.
    const expiryDisplay = resolveSlaExpiryDisplay(d);
    const pausedShift = hasPausedShift(d);
    const pauseText = describeSlaPause(d);
    const pct = Math.min(d.percentUsed ?? 0, 100);
    const isBreached = Boolean(d.breached);
    // Chamado encerrado (ou SLA já marcado como congelado): o relógio parou no
    // fechamento, então o percentual exibido é o valor no momento do encerramento.
    const isFrozen = Boolean(d.slaFrozen) || Boolean(closedAt);
    const frozenAt = d.closedAt ?? closedAt;
    const barColor = isBreached ? 'bg-danger' : isFrozen ? 'bg-slate-400' : pct >= 75 ? 'bg-warning' : 'bg-success';

    if (d.message && !expiryDisplay) {
      return <p className="text-sm text-muted">Sem SLA definido para o chamado.</p>;
    }

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={isBreached ? 'danger' : isFrozen ? 'slate' : d.onHold ? 'accent' : 'success'}>
            {isBreached ? 'SLA violado' : isFrozen ? 'SLA encerrado' : d.onHold ? 'SLA em pausa' : d.status ?? 'SLA ativo'}
          </Badge>
          {d.warningLevel && !isBreached && !isFrozen && (
            <Badge color={d.warningLevel === 'low' ? 'success' : d.warningLevel === 'medium' ? 'warning' : 'danger'}>
              Nivel {d.warningLevel}
            </Badge>
          )}
        </div>
        {isFrozen ? (
          <p className="text-xs text-muted">
            SLA congelado no fechamento{frozenAt ? ` em ${new Date(frozenAt).toLocaleString('pt-BR')}` : ''} — o tempo não continua contando.
          </p>
        ) : expiryDisplay ? (
          <p className="text-xs text-muted">
            Expira em {new Date(expiryDisplay).toLocaleString('pt-BR')}
            {pausedShift ? ' (já com o tempo pausado)' : ''}
          </p>
        ) : null}
        {pauseText && (
          <p className="text-xs text-accent">{pauseText}</p>
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
      />
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="sm:col-span-2">
          <dt className="text-muted">Estado</dt>
          <dd className="text-foreground">
            <div className="flex items-start justify-between gap-2">
              <Badge color="slate">{currentStateName}</Badge>
              <button
                type="button"
                onClick={() => setStateEditing((current) => !current)}
                aria-label="Alterar estado"
                title="Alterar estado"
                className="shrink-0 rounded-lg p-1 text-muted transition-colors hover:bg-surface-light hover:text-foreground"
              >
                <Icon name="refresh" className="h-4 w-4" />
              </button>
            </div>
            {stateEditing && (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <div className="min-w-[220px] flex-1">
                  <Select
                    aria-label="Novo estado"
                    options={stateOptions}
                    value={selectedState}
                    disabled={workflowStates.isLoading}
                    onChange={(event) => setSelectedState(event.target.value)}
                    hint="A transição precisa ser permitida pelo workflow."
                  />
                </div>
                <Button
                  size="sm"
                  onClick={saveState}
                  loading={updateWorkflow.isPending}
                  disabled={!selectedState || selectedState === currentStateId}
                >
                  Salvar
                </Button>
              </div>
            )}
          </dd>
        </div>
        {templateName && (
          <div className="sm:col-span-2">
            <dt className="text-muted">Template</dt>
            <dd className="text-foreground">{templateName}</dd>
          </div>
        )}
        <div>
          <dt className="text-muted">Categoria</dt>
          <dd className="text-foreground">{category ?? '\u2014'}</dd>
        </div>
        <div>
          <dt className="text-muted">Prioridade</dt>
          <dd><Badge color={priorityColor}>{priorityLabel}</Badge></dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted">Solicitado por</dt>
          <dd className="text-foreground">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-words">{requesterDisplayName ?? 'Não informado'}</p>
                {!requesterUserId && (
                  <p className="mt-1 text-xs text-muted">
                    Vincule o solicitante para restringir a avaliação.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setRequesterModalOpen(true)}
                aria-label={requesterUserId ? 'Alterar solicitante' : 'Vincular solicitante'}
                title={requesterUserId ? 'Alterar solicitante' : 'Vincular solicitante'}
                className="shrink-0 rounded-lg p-1 text-muted transition-colors hover:bg-surface-light hover:text-foreground"
              >
                <Icon name="manage_accounts" className="h-4 w-4" />
              </button>
            </div>
          </dd>
        </div>

        <div className="sm:col-span-2">
          <dt className="text-muted">Agent (máquina)</dt>
          <dd className="text-foreground">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-words">{agentDisplayName ?? 'Não vinculado'}</p>
                {!agentId && (
                  <p className="mt-1 text-xs text-muted">
                    Vincule a máquina relacionada a este chamado.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setAgentModalOpen(true)}
                aria-label={agentId ? 'Alterar agent' : 'Vincular agent'}
                title={agentId ? 'Alterar agent' : 'Vincular agent'}
                className="shrink-0 rounded-lg p-1 text-muted transition-colors hover:bg-surface-light hover:text-foreground"
              >
                <Icon name="desktop_windows" className="h-4 w-4" />
              </button>
            </div>
          </dd>
        </div>

        <div className="sm:col-span-2">
          <dt className="text-muted">Departamento</dt>
          <dd className="text-foreground">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-words">
                  {departmentsQuery.isLoading ? 'Carregando...' : departmentName ?? 'Não definido'}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Transferir altera o perfil de workflow e o SLA do chamado.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDepartmentModalOpen(true)}
                aria-label="Alterar departamento"
                title="Alterar departamento"
                className="shrink-0 rounded-lg p-1 text-muted transition-colors hover:bg-surface-light hover:text-foreground"
              >
                <Icon name="apartment" className="h-4 w-4" />
              </button>
            </div>
          </dd>
        </div>

        <div className="sm:col-span-2">
          <dt className="text-muted">Responsável</dt>
          <dd className="text-foreground">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 break-words">
                  {assignedDisplayName}
                  {assignedToUserId && assignedToUserId === currentUserId && <Badge color="accent">você</Badge>}
                </p>
                {assignedEmail && <p className="text-xs text-muted">{assignedEmail}</p>}
              </div>
              {!assignedToUserId && currentUserId && (
                <button
                  type="button"
                  onClick={assumeTicket}
                  disabled={updateRequester.isPending}
                  aria-label="Assumir chamado"
                  title="Assumir este chamado"
                  className="shrink-0 rounded-lg p-1 text-muted transition-colors hover:bg-surface-light hover:text-foreground disabled:opacity-50"
                >
                  <Icon name="how_to_reg" className="h-4 w-4" />
                </button>
              )}
            </div>
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
        <WatchersSection ticketId={ticketId} assignedToUserId={assignedToUserId} />
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <TicketAiAssignmentCard ticketId={ticketId} />
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <div className="mb-2 flex items-center gap-2 text-muted-foreground">
          <Icon name="schedule" className="h-4 w-4" />
          <p className="text-sm font-medium">SLA</p>
        </div>
        {renderSlaContent()}
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <TicketFieldsSection ticketId={ticketId} departmentId={departmentId} />
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <TicketRelationsSection ticketId={ticketId} />
      </div>

      <RequesterPickerModal
        open={requesterModalOpen}
        users={iamUsers.data ?? []}
        selectedId={requesterUserId}
        isSaving={updateRequester.isPending}
        onClose={() => setRequesterModalOpen(false)}
        onSave={changeRequester}
      />

      <AgentPickerModal
        open={agentModalOpen}
        agents={agentOptions}
        isLoading={siteId ? siteAgents.isLoading : clientAgents.isLoading}
        selectedId={agentId}
        scopeLabel={agentScopeLabel}
        isSaving={updateRequester.isPending}
        onClose={() => setAgentModalOpen(false)}
        onSave={changeAgent}
      />

      <DepartmentPickerModal
        open={departmentModalOpen}
        departments={departmentsQuery.data ?? []}
        isLoading={departmentsQuery.isLoading}
        selectedId={departmentId}
        scopeLabel="do cliente do chamado"
        isSaving={updateRequester.isPending}
        onClose={() => setDepartmentModalOpen(false)}
        onSave={changeDepartment}
      />
    </Card>
  );
}

type CommentItem = {
  id: string;
  author: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
  /** Soft delete: o comentário continua legível e marcado como excluído. */
  deletedAt?: string | null;
  deletedBy?: string | null;
  /** Anexos do nível conversa (pequenos, com miniatura). */
  attachments?: Array<{
    id: string;
    fileName: string;
    contentType?: string | null;
    sizeBytes?: number;
  }> | null;
};

/** Ordem cronológica da conversa: (createdAt, id) crescente. */
function compareCommentsAsc(a: CommentItem, b: CommentItem) {
  const byDate = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
}

function CommentsPanel({
  ticketId,
  draftSeed,
  currentUserLogin,
  onOpenAttachments,
}: {
  ticketId: string;
  draftSeed?: CommentSeed | null;
  /** Login do usuário logado já em minúsculas; vazio quando não resolvido. */
  currentUserLogin: string;
  /** Atalho para a aba Anexos (repositório) quando o arquivo da conversa é grande. */
  onOpenAttachments?: () => void;
}) {
  // Rolagem do histórico: ao chegar no fim, o restante do delta vai para a
  // página (mesmo comportamento do agent desktop).
  const commentsListRef = useWheelScrollChaining<HTMLDivElement>();
  // Paginação por cursor. Os itens são acumulados por ID, não por página: a
  // janela da página 0 muda quando entra comentário novo, e antes o item que
  // saía dela sumia (gap) e a página seguinte (sobreposta) gerava duplicatas e
  // desordem. Com o mapa, item que sai da janela permanece e páginas
  // sobrepostas só atualizam a mesma chave.
  const [itemsById, setItemsById] = useState<Map<string, CommentItem>>(new Map());
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const comments = useTicketComments(ticketId, { cursor });

  // A conversa é lida em ordem CRONOLÓGICA (mais antigo primeiro). A API pagina
  // do mais novo para o mais antigo; a ordenação é feita aqui.
  const items = useMemo(
    () => [...itemsById.values()].sort(compareCommentsAsc),
    [itemsById],
  );

  // Preserva a posição de leitura quando histórico MAIS ANTIGO é prependado.
  // Ancora por ELEMENTO (offsetTop), não por altura: o botão do topo e o
  // "carregando" aparecem/somem e tornavam a conta por altura imprecisa.
  const scrollAnchorRef = useRef<{ id: string; top: number; scrollTop: number } | null>(null);
  const scrollToBottomRef = useRef(false);
  const removeComment = useDeleteComment();

  const handleDeleteComment = (commentId: string) => {
    if (!window.confirm('Excluir este comentário? Ele continua visível no histórico, marcado como excluído.')) {
      return;
    }
    removeComment.mutate(
      { ticketId, commentId },
      {
        onSuccess: () => toast.success('Comentário excluído'),
        onError: (error) =>
          toast.error(error instanceof Error && error.message ? error.message : 'Erro ao excluir comentário'),
      },
    );
  };

  const isOwnComment = (author: string | null | undefined) =>
    Boolean(currentUserLogin) &&
    (author ?? '').trim().toLowerCase() === currentUserLogin;

  // Troca de ticket reinicia a paginação (e zera âncoras pendentes).
  useEffect(() => {
    setItemsById(new Map());
    setCursor(undefined);
    scrollAnchorRef.current = null;
    scrollToBottomRef.current = false;
  }, [ticketId]);

  // Falha ao carregar o histórico não pode deixar uma âncora pendente: o
  // próximo crescimento da lista a aplicaria por engano.
  useEffect(() => {
    if (comments.isError) scrollAnchorRef.current = null;
  }, [comments.isError]);

  // Mescla cada página carregada por id. O refetch da página 0 (comentário novo)
  // ATUALIZA os itens e ADICIONA o novo sem remover os que saíram da janela; o
  // comentário novo aparece sem F5.
  useEffect(() => {
    const data = comments.data;
    if (!data?.items) return;
    setItemsById(prev => {
      const next = new Map(prev);
      for (const item of data.items ?? []) next.set(item.id, item);
      return next;
    });
  }, [comments.data]);

  // "Carregar mais" traz a página MAIS ANTIGA (cursor da API), que entra no topo.
  const loadOlderComments = () => {
    const el = commentsListRef.current;
    if (el) {
      // Primeiro comentário visível vira a âncora da rolagem.
      const first = el.querySelector<HTMLElement>('[data-comment-id]');
      if (first?.dataset.commentId) {
        scrollAnchorRef.current = {
          id: first.dataset.commentId,
          top: first.offsetTop,
          scrollTop: el.scrollTop,
        };
      }
    }
    // Histórico antigo entra no TOPO: não pode herdar o "descer até o fim"
    // deixado por um comentário recém-enviado.
    scrollToBottomRef.current = false;
    setCursor(comments.data?.nextCursor ?? undefined);
  };

  // Roda depois do DOM: ancora o scroll no MESMO comentário ao prepender
  // histórico e desce até o fim quando um comentário novo foi enviado.
  useLayoutEffect(() => {
    const el = commentsListRef.current;
    if (!el) return;
    if (scrollToBottomRef.current) {
      scrollToBottomRef.current = false;
      // Uma âncora pendente de outro fluxo não deve ser aplicada depois.
      scrollAnchorRef.current = null;
      el.scrollTop = el.scrollHeight;
      return;
    }
    const anchor = scrollAnchorRef.current;
    if (!anchor) return;
    scrollAnchorRef.current = null;
    const node = el.querySelector<HTMLElement>(`[data-comment-id="${anchor.id}"]`);
    if (node) el.scrollTop = anchor.scrollTop + (node.offsetTop - anchor.top);
  }, [items.length]);

  return (
    <>
      <div ref={commentsListRef} className="space-y-3 max-h-80 overflow-y-auto">
        {comments.isLoading && <Loading />}
        {comments.isError && !comments.isLoading && (
          <div className="flex flex-col items-center gap-2 py-4 text-center text-sm text-danger">
            <span>Erro ao carregar comentários.</span>
            <Button size="sm" variant="ghost" onClick={() => void comments.refetch()}>
              Tentar novamente
            </Button>
          </div>
        )}
        {!comments.isError && comments.data?.hasMore && (
          <div className="flex justify-center pb-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={comments.isFetching}
              onClick={loadOlderComments}
              title="Carregar os comentários anteriores a estes"
            >
              Carregar comentários mais antigos
            </Button>
          </div>
        )}
        {!comments.isError &&
          items.map(c => {
            const own = isOwnComment(c.author);
            // Classe por combinação (proprio/suporte x publico/interno): uma única
            // classe de cor de borda por balão, sem depender da ordem do Tailwind.
            const deleted = Boolean(c.deletedAt);
            const bubbleTone = deleted
              ? 'bg-surface-light/60 text-muted rounded-bl-md border border-dashed border-danger/50'
              : own
                ? c.isInternal
                  ? 'bg-primary text-white rounded-br-md border border-warning/40'
                  : 'bg-primary text-white rounded-br-md'
                : c.isInternal
                  ? 'bg-surface-light text-foreground rounded-bl-md border border-warning/40'
                  : 'bg-surface-light text-foreground rounded-bl-md border border-border';
            const commentAttachments = Array.isArray(c.attachments) ? c.attachments : [];
            return (
              <div
                key={c.id}
                data-comment-id={c.id}
                className={`flex flex-col ${own ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${bubbleTone}`}
                >
                  {/* Excluído continua LEGÍVEL: o conteúdo não é apagado, só marcado. */}
                  {deleted ? <em className="opacity-80">{c.content}</em> : c.content}

                  {commentAttachments.length > 0 && (
                    <div className={`mt-2 flex flex-wrap gap-2 ${deleted ? 'opacity-60' : ''}`}>
                      {commentAttachments.map((attachment) => (
                        <AttachmentPreviewButton
                          key={attachment.id}
                          ticketId={ticketId}
                          commentId={c.id}
                          attachment={attachment}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                  <span className="text-sm font-medium text-foreground">{c.author}</span>
                  <span className="text-xs text-muted">{new Date(c.createdAt).toLocaleString('pt-BR')}</span>
                  {c.isInternal && <Badge color="warning"><Icon name="lock" className="mr-1 h-3 w-3" />Interno</Badge>}
                  {deleted && (
                    <Badge color="danger">
                      <Icon name="delete" className="mr-1 h-3 w-3" />
                      Excluído{c.deletedBy ? ` por ${c.deletedBy}` : ''}
                    </Badge>
                  )}
                  {!deleted && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded px-1 text-xs text-muted hover:text-danger"
                      onClick={() => handleDeleteComment(c.id)}
                      title="Excluir comentário"
                    >
                      <Icon name="delete" className="h-3 w-3" />
                      Excluir
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        {!comments.isError && !comments.isLoading && items.length === 0 && (
          <p className="text-sm text-muted py-4 text-center">Sem comentários ainda</p>
        )}
      </div>
      <TicketAttachmentsStrip ticketId={ticketId} />
      <CommentForm
        ticketId={ticketId}
        draftSeed={draftSeed}
        onOpenAttachments={onOpenAttachments}
        onAdded={() => {
          // Garante que a 1ª página esteja ativa: a invalidação da mutation só
          // refaz queries ativas.
          setCursor(undefined);
          // A conversa é cronológica e o comentário novo entra no FIM: desce
          // até lá para o autor ver o que acabou de enviar.
          scrollToBottomRef.current = true;
        }}
      />
    </>
  );
}

function TimelinePanel({
  ticketId,
  onOpenComments,
  onOpenChat,
}: {
  ticketId: string;
  onOpenComments?: () => void;
  onOpenChat?: () => void;
}) {
  const timeline = useTicketTimeline(ticketId);

  if (timeline.isLoading) return <Loading />;
  if (timeline.isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-center text-sm text-danger">
        <span>Erro ao carregar timeline.</span>
        <Button size="sm" variant="ghost" onClick={() => void timeline.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const entries = timeline.data ?? [];

  if (entries.length === 0) {
    return <p className="text-sm text-muted py-4 text-center">Nenhum evento registrado</p>;
  }

  const groups = groupTimelineByDay(entries);

  return (
    <div className="min-h-[24rem] max-h-[70vh] space-y-4 overflow-y-auto pr-1">
      <p className="text-xs text-muted">{entries.length} evento(s)</p>

      {groups.map((group) => (
        <div key={group.key}>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {group.label}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-3">
            {group.items.map((entry) => {
              const meta = timelineMetaFor(entry.activityType);

              return (
                <div key={entry.id} className="flex gap-3">
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${TIMELINE_TONE_CLASS[meta.tone]}`}
                  >
                    <Icon name={meta.icon} className="h-3.5 w-3.5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{meta.label}</span>
                      <span
                        className="text-xs text-muted"
                        title={new Date(entry.createdAt).toLocaleString('pt-BR')}
                      >
                        {formatRelativeTime(entry.createdAt)}
                      </span>
                    </div>

                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {entry.description ?? meta.label}
                    </p>

                    <p className="mt-0.5 text-[11px] text-muted">
                      {entry.changedByName ?? 'Sistema'}
                    </p>

                    {entry.activityType === 'Commented' && onOpenComments && (
                      <button
                        type="button"
                        onClick={onOpenComments}
                        className="mt-1 text-[11px] text-primary hover:underline"
                      >
                        Ver comentários
                      </button>
                    )}

                    {(entry.activityType === 'ChatStarted' || entry.activityType === 'ChatEnded') && onOpenChat && (
                      <button
                        type="button"
                        onClick={onOpenChat}
                        className="mt-1 text-[11px] text-primary hover:underline"
                      >
                        Ver conversa
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function CommentForm({
  ticketId,
  draftSeed,
  onAdded,
  onOpenAttachments,
}: {
  ticketId: string;
  draftSeed?: CommentSeed | null;
  onAdded?: () => void;
  /** Atalho para a aba Anexos quando o arquivo excede o limite da conversa. */
  onOpenAttachments?: () => void;
}) {
  const addComment = useAddComment();
  const macrosQuery = useTicketMacros({ includeGlobal: true });
  const [content, setContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);

  // Anexos do comentário = nível CONVERSA (EntityType "TicketComment"): o
  // arquivo pertence ao COMENTÁRIO e usa o TicketAttachmentSettings UNIFICADO
  // (mesma allowlist de todos os contextos) com o limite de conversas
  // (maxFileSizeBytes, 10 MB por padrão). O repositório do chamado (aba Anexos)
  // é outra família e continua sendo o destino de arquivos grandes/resumíveis.
  //
  // O comentário precisa existir antes do anexo (o pai é o comentário), então o
  // envio acontece depois do POST do comentário, com o id devolvido.
  const prepareCommentUpload = usePrepareCommentUpload();
  const completeCommentUpload = useCompleteCommentUpload();
  const attachmentSettingsQuery = useTicketAttachmentSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  type PendingFile = {
    key: string;
    file: File;
    fileName: string;
    status: 'queued' | 'uploading' | 'done' | 'error';
    error?: string;
  };
  const [pending, setPending] = useState<PendingFile[]>([]);
  const uploading = pending.some((item) => item.status === 'uploading');

  // Limite/tipos do nível conversa vêm do TicketAttachmentSettings unificado
  // (comentários, chat do chamado, chat de suporte e chat de IA/LLM).
  const commentAttachmentsEnabled = attachmentSettingsQuery.data?.enabled !== false;

  const commentLimitBytes = useMemo(() => {
    const raw = attachmentSettingsQuery.data?.maxFileSizeBytes;
    return typeof raw === 'number' && raw > 0 ? raw : 10 * 1024 * 1024;
  }, [attachmentSettingsQuery.data]);

  const commentAllowedTypes = useMemo(() => {
    const raw = attachmentSettingsQuery.data?.allowedContentTypes;
    const types = Array.isArray(raw)
      ? raw.map((value) => value.trim().toLowerCase()).filter(Boolean)
      : [];
    return types.length > 0
      ? types
      : ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  }, [attachmentSettingsQuery.data]);

  const uploadOne = async (commentId: string, entry: PendingFile) => {
    const { file } = entry;
    setPending((prev) =>
      prev.map((item) => (item.key === entry.key ? { ...item, status: 'uploading' } : item)),
    );

    const contentType = file.type || 'application/octet-stream';
    try {
      const prepared = await prepareCommentUpload.mutateAsync({
        ticketId,
        commentId,
        data: { fileName: file.name, contentType, sizeBytes: file.size },
      });

      const response = await fetch(prepared.uploadUrl, {
        method: prepared.httpMethod || 'PUT',
        headers: { 'Content-Type': contentType },
        body: file,
      });
      if (!response.ok) throw new Error(`upload HTTP ${response.status}`);

      await completeCommentUpload.mutateAsync({
        ticketId,
        commentId,
        data: {
          attachmentId: prepared.attachmentId,
          objectKey: prepared.objectKey,
          fileName: file.name,
          contentType,
          sizeBytes: file.size,
          // Ignorado pelo backend (autoria vem do token), mas exigido pelo tipo.
          uploadedBy: '',
        },
      });

      setPending((prev) =>
        prev.map((item) => (item.key === entry.key ? { ...item, status: 'done' } : item)),
      );
      toast.success(`Anexo enviado: ${file.name}`);
    } catch (error) {
      const detail = error instanceof Error && error.message ? error.message : 'falha no anexo';
      setPending((prev) =>
        prev.map((item) => (item.key === entry.key ? { ...item, status: 'error', error: detail } : item)),
      );
      toast.error(`Não foi possível anexar ${file.name} — ${detail}`);
    }
  };

  const handleFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    if (!commentAttachmentsEnabled) {
      toast.error('Anexos estão desabilitados nas configurações do servidor.');
      return;
    }
    Array.from(files).forEach((file) => {
      const contentType = (file.type || '').toLowerCase();
      const key = `${file.name}:${file.size}:${Date.now()}:${Math.random().toString(16).slice(2)}`;

      if (contentType && !commentAllowedTypes.includes(contentType)) {
        toast.error(
          `Tipo não permitido na conversa: ${file.name}. Para outros formatos use a aba Anexos.`,
        );
        return;
      }

      if (file.size > commentLimitBytes) {
        // Aviso com o limite — o arquivo NÃO é movido automaticamente para o
        // repositório: mostramos o atalho e o usuário decide (o repositório tem
        // fluxo próprio, com outros limites e upload resumível).
        toast.error(
          `${file.name} (${formatBytes(file.size)}) excede o limite de anexo de comentário ` +
            `(${formatBytes(commentLimitBytes)}). Envie pela aba Anexos (repositório do chamado).`,
        );
        onOpenAttachments?.();
        return;
      }

      setPending((prev) => [...prev, { key, file, fileName: file.name, status: 'queued' }]);
    });
  };

  const macroOptions = [
    { value: '', label: 'Inserir macro...' },
    ...(macrosQuery.data ?? []).map((m) => ({ value: m.id, label: m.name })),
  ];
  const applyMacro = (id: string) => {
    if (!id) return;
    const macro = (macrosQuery.data ?? []).find((m) => m.id === id);
    if (!macro) return;
    setContent(
      macro.content
        .split('{ticket_id}').join(ticketId)
        .split('{cliente}').join('')
        .split('{tecnico}').join(''),
    );
  };

  useEffect(() => {
    if (!draftSeed?.content) return;

    setContent(draftSeed.content);
    setIsInternal(false);
  }, [draftSeed?.nonce]);

  const handleSubmit = () => {
    const trimmed = content.trim();
    if (trimmed.length < 3) return;
    if (uploading) {
      toast.error('Aguarde o envio dos anexos terminar.');
      return;
    }
    const queued = pending.filter((item) => item.status === 'queued');
    addComment.mutate(
      // Autoria é derivada do token no backend — não enviar author.
      { id: ticketId, data: { content: trimmed, isInternal } },
      {
        onSuccess: (created) => {
          setContent('');
          setIsInternal(false);
          // O comentário nasce ANTES dos anexos: o anexo de conversa é filho do
          // comentário (EntityType "TicketComment"), não do chamado.
          const createdId =
            (created as { commentId?: string } | undefined)?.commentId ??
            (created as { id?: string } | undefined)?.id;
          if (createdId && queued.length > 0) {
            void (async () => {
              for (const entry of queued) {
                // Sequencial de propósito: o backend rejeita complete-upload em
                // paralelo com o mesmo comentário em alguns providers.
                await uploadOne(createdId, entry);
              }
            })();
          } else if (queued.length > 0) {
            setPending((prev) =>
              prev.map((item) =>
                item.status === 'queued'
                  ? { ...item, status: 'error', error: 'comentário não devolveu id' }
                  : item,
              ),
            );
            toast.error('Comentário criado, mas não foi possível anexar os arquivos.');
          }
          // Garante que o comentário recém-criado apareça sem F5.
          onAdded?.();
          toast.success('Comentário adicionado');
        },
        onError:   (err) => toast.error(err instanceof Error && err.message ? err.message : 'Erro ao adicionar comentário'),
      },
    );
  };

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      {(macrosQuery.data?.length ?? 0) > 0 && (
        <Select
          aria-label="Inserir macro de resposta"
          options={macroOptions}
          value=""
          onChange={(event) => applyMacro(event.target.value)}
        />
      )}
      <TicketRunbookPanel ticketId={ticketId} macros={macrosQuery.data ?? []} />
      {/* O print colado (Ctrl+V) da ferramenta de captura entra como anexo. */}
      <div
        onPaste={(event) => {
          const files = event.clipboardData?.files;
          if (files && files.length > 0) {
            event.preventDefault();
            handleFiles(files);
          }
        }}
      >
        <TextArea placeholder="Escreva um comentário... (mín. 3 chars)" value={content} onChange={e => setContent(e.target.value)} />
      </div>
      {pending.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pending.map((item) => (
            <span key={item.key} className="flex items-center gap-2 rounded-lg border border-border bg-surface-light px-2 py-1 text-xs">
              <Icon name="attach_file" className="h-3 w-3" />
              <span className="max-w-[180px] truncate">{item.fileName}</span>
              {item.status === 'uploading' && <Icon name="progress_activity" className="h-3 w-3 animate-spin" />}
              {item.status === 'done' && <Icon name="check_circle" className="h-3 w-3 text-success" />}
              {item.status === 'error' && (
                <>
                  <Icon name="cancel" className="h-3 w-3 text-danger" />
                  <span className="text-danger" title={item.error}>falhou</span>
                </>
              )}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || !commentAttachmentsEnabled}
            title={
              commentAttachmentsEnabled
                ? `Anexar arquivo ou print (ou cole com Ctrl+V). Limite: ${formatBytes(commentLimitBytes)}`
                : 'Anexos desabilitados nas configurações do servidor'
            }
          >
            <Icon name="attach_file" className="h-4 w-4" /> Anexar
          </Button>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)} className="rounded bg-surface-light border-border" />
            {isInternal ? <Icon name="lock" className="h-3.5 w-3.5" /> : <Icon name="lock_open" className="h-3.5 w-3.5" />}
            Nota interna
          </label>
        </div>
        <Button size="sm" onClick={handleSubmit} loading={addComment.isPending} disabled={content.trim().length < 3 || uploading}>
          <Icon name="send" className="h-4 w-4" /> Enviar
        </Button>
      </div>
    </div>
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

/**
 * Miniatura do anexo: imagens são baixadas pela API autenticada (blob) e
 * exibidas como preview; qualquer outro tipo cai no ícone de arquivo.
 */
function AttachmentThumb({ ticketId, commentId, attachment, size = 'md' }: {
  ticketId: string;
  /** Quando presente, o anexo pertence ao COMENTÁRIO (conversa), não ao chamado. */
  commentId?: string | null;
  attachment: { id: string; fileName: string; contentType?: string | null };
  size?: 'sm' | 'md';
}) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = isImageAttachment(attachment.contentType, attachment.fileName);
  const dimension = size === 'sm' ? 'h-8 w-8' : 'h-12 w-12';

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    const request = commentId
      ? ticketsApi.downloadCommentAttachment(ticketId, commentId, attachment.id)
      : ticketsApi.downloadAttachment(ticketId, attachment.id);
    request
      .then(({ blob }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        /* sem preview: mantém o ícone */
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ticketId, commentId, attachment.id, isImage]);

  if (!isImage || !url) {
    return <Icon name="draft" className="h-4 w-4 shrink-0 text-muted" />;
  }

  return (
    <img
      src={url}
      alt={attachment.fileName}
      className={`${dimension} shrink-0 rounded border border-border object-cover`}
    />
  );
}

/**
 * Anexo (de comentário ou do chamado) cujo conteúdo é imagem. A imagem NÃO
 * baixa ao clicar: abre no modal (lightbox) usando o mesmo blob autenticado da
 * miniatura, e um preview maior aparece no hover. Arquivos que não são imagem
 * continuam baixando.
 */
function AttachmentPreviewButton({
  ticketId,
  commentId,
  attachment,
  buttonClassName = 'flex items-center gap-2 rounded-lg border border-border bg-background/60 px-2 py-1 text-left hover:border-primary/60',
  fileNameClassName = 'max-w-[160px] truncate text-xs',
}: {
  ticketId: string;
  /** Quando presente, o anexo pertence ao COMENTÁRIO (conversa). */
  commentId?: string | null;
  attachment: { id: string; fileName: string; contentType?: string | null; sizeBytes?: number };
  /** Classes do botão (o bloco "Anexos do chamado" usa o tom surface). */
  buttonClassName?: string;
  fileNameClassName?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [hover, setHover] = useState<{ top: number; left: number; below: boolean } | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // URL do blob: criada sob demanda e revogada UMA vez, no unmount.
  const objectUrlRef = useRef<string | null>(null);
  const aliveRef = useRef(true);
  const isImage = isImageAttachment(attachment.contentType, attachment.fileName);

  // Um único download autenticado serve miniatura, hover e modal. O anexo é do
  // COMENTÁRIO quando há commentId; senão, do repositório do chamado.
  const loadAttachment = () =>
    commentId
      ? ticketsApi.downloadCommentAttachment(ticketId, commentId, attachment.id)
      : ticketsApi.downloadAttachment(ticketId, attachment.id);

  /** Garante a URL do blob mesmo quando o clique chega ANTES do load terminar. */
  const ensureImageUrl = async (): Promise<string | null> => {
    if (objectUrlRef.current) return objectUrlRef.current;
    try {
      const { blob } = await loadAttachment();
      const created = URL.createObjectURL(blob);
      if (!aliveRef.current) {
        URL.revokeObjectURL(created);
        return null;
      }
      // Corrida: outro caminho já criou a URL enquanto esta buscava.
      if (objectUrlRef.current) {
        URL.revokeObjectURL(created);
        return objectUrlRef.current;
      }
      objectUrlRef.current = created;
      setUrl(created);
      return created;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    aliveRef.current = true;
    if (isImage) void ensureImageUrl();
    return () => {
      aliveRef.current = false;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
    // ensureImageUrl é recriada a cada render; as dependências reais são as de
    // identidade do anexo abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, commentId, attachment.id, isImage]);

  const download = () => {
    void loadAttachment()
      .then(({ blob, fileName }) => triggerBlobDownload(blob, fileName || attachment.fileName))
      .catch(() => toast.error('Não foi possível abrir o anexo.'));
  };

  const showHoverPreview = () => {
    if (!isImage || !url) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Abaixo quando não houver espaço para o preview (até 288px) acima do botão.
    const below = rect.top < 300;
    setHover({ top: below ? rect.bottom + 8 : rect.top - 8, left: rect.left + rect.width / 2, below });
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (!isImage) {
            download();
            return;
          }
          setHover(null);
          if (url) {
            setLightboxOpen(true);
            return;
          }
          // Rede lenta/falha: busca o blob e abre o modal — não baixa o arquivo.
          void ensureImageUrl().then(created => {
            if (created) setLightboxOpen(true);
            else if (aliveRef.current) toast.error('Não foi possível abrir a imagem.');
          });
        }}
        onMouseEnter={showHoverPreview}
        onMouseLeave={() => setHover(null)}
        title={`${attachment.fileName} — ${formatBytes(attachment.sizeBytes ?? 0)}${isImage ? ' (clique para ampliar)' : ''}`}
        className={buttonClassName}
      >
        {isImage && url ? (
          <img
            src={url}
            alt={attachment.fileName}
            className="h-8 w-8 shrink-0 rounded border border-border object-cover"
          />
        ) : (
          <Icon name="draft" className="h-4 w-4 shrink-0 text-muted" />
        )}
        <span className={fileNameClassName}>{attachment.fileName}</span>
      </button>
      {hover && url &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[120]"
            style={{
              top: hover.top,
              left: hover.left,
              transform: `translate(-50%, ${hover.below ? '0' : '-100%'})`,
            }}
          >
            <img
              src={url}
              alt={attachment.fileName}
              className="max-h-72 max-w-[min(420px,80vw)] rounded-lg border border-border bg-surface object-contain p-1 shadow-2xl"
            />
          </div>,
          document.body,
        )}
      <ImageLightbox
        open={lightboxOpen}
        src={url}
        alt={attachment.fileName}
        onClose={() => setLightboxOpen(false)}
        onError={() => {
          // Arquivo que se diz imagem mas não renderiza (corrompido/renomeado):
          // entrega o arquivo em vez de deixar o modal em branco.
          toast.error('Não foi possível exibir o anexo. Baixando o arquivo…');
          setLightboxOpen(false);
          download();
        }}
      />
    </>
  );
}

/**
 * Anexos do CHAMADO logo abaixo dos comentários. A API guarda o anexo no
 * chamado (não vinculado ao comentário), então a lista aparece no mesmo lugar
 * do composer — com miniatura quando for imagem.
 */
function TicketAttachmentsStrip({ ticketId }: { ticketId: string }) {
  const attachments = useTicketAttachments(ticketId);
  const items = Array.isArray(attachments.data?.items) ? attachments.data.items : [];

  if (items.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Anexos do chamado</p>
      <div className="flex flex-wrap gap-2">
        {items.map((a) => (
          <AttachmentPreviewButton
            key={a.id}
            ticketId={ticketId}
            attachment={a}
            buttonClassName="flex items-center gap-2 rounded-lg border border-border bg-surface-light px-2 py-1 text-left hover:border-primary/60"
            fileNameClassName="max-w-[180px] truncate text-xs text-foreground"
          />
        ))}
      </div>
    </div>
  );
}
function AttachmentsPanel({
  ticketId,
  siteId,
  clientId,
  uploadedBy,
}: {
  ticketId: string
  siteId: string | null
  clientId: string | null
  uploadedBy: string
}) {
  // Prioridade de herança: Site > Client > Server
  const siteSettings = useSiteTicketAttachmentSettings(siteId);
  const clientSettings = useClientTicketAttachmentSettings(!siteId ? clientId : null);
  const serverSettings = useTicketAttachmentSettings();

  // Determina qual config usar baseado na hierarquia.
  // Mesmo cuidado do useEffectiveTicketAttachmentSettings: a resolucao do valor
  // fica em useMemo, com os tres useQuery sempre montados na mesma ordem.
  const settings = useMemo(() => {
    if (siteId && siteSettings.data) return { data: siteSettings.data, isLoading: false };
    if (clientId && clientSettings.data) return { data: clientSettings.data, isLoading: false };
    return serverSettings;
  }, [
    siteId,
    clientId,
    siteSettings.data,
    clientSettings.data,
    serverSettings,
  ]);

  const prepare = usePrepareTicketUpload();
  const complete = useCompleteTicketUpload();

  // Aba consolidada: repositório (EntityType "Ticket") + conversa
  // (EntityType "TicketComment"), paginada NO SERVIDOR por /attachments/all.
  // Antes os anexos de conversa vinham dos comentários da primeira página:
  // num chamado com muitos comentários, os anexos antigos desapareciam.
  const [attachmentCursor, setAttachmentCursor] = useState<string | undefined>(undefined);
  const [attachmentPages, setAttachmentPages] = useState<
    CommentPage<import('@/api').TicketAttachmentEntry>[]
  >([]);
  const allAttachments = useAllTicketAttachments(ticketId, { cursor: attachmentCursor });

  useEffect(() => {
    setAttachmentPages([]);
    setAttachmentCursor(undefined);
  }, [ticketId]);

  useEffect(() => {
    const data = allAttachments.data;
    if (!data) return;
    setAttachmentPages(prev => upsertCommentPage(prev, attachmentCursor, data.items ?? []));
  }, [allAttachments.data, attachmentCursor]);
  const [originFilter, setOriginFilter] = useState<'all' | 'repository' | 'comment'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'document' | 'other'>('all');
  const [periodFilter, setPeriodFilter] = useState<'all' | '7' | '30'>('all');
  const [search, setSearch] = useState('');
  const [downloadingCommentId, setDownloadingCommentId] = useState<string | null>(null);

  type UnifiedAttachment = {
    id: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    createdAt: string;
    uploadedBy?: string | null;
    origin: 'repository' | 'comment';
    commentId?: string;
    author?: string;
    deletedComment?: boolean;
  };

  const unified = useMemo<UnifiedAttachment[]>(
    () =>
      attachmentPages
        .flatMap(page => page.items)
        .map(a => ({
          id: a.id,
          fileName: a.fileName,
          contentType: a.contentType ?? '',
          sizeBytes: a.sizeBytes ?? 0,
          createdAt: a.createdAt,
          uploadedBy: a.uploadedBy,
          origin: a.origin === 'comment' ? ('comment' as const) : ('repository' as const),
          commentId: a.commentId ?? undefined,
          author: a.commentAuthor ?? undefined,
          deletedComment: Boolean(a.commentDeleted),
        })),
    [attachmentPages],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const cutoff =
      periodFilter === 'all' ? 0 : Date.now() - Number(periodFilter) * 24 * 60 * 60 * 1000;

    return unified.filter((item) => {
      if (originFilter !== 'all' && item.origin !== originFilter) return false;

      const mime = item.contentType.toLowerCase();
      const isImage = mime.startsWith('image/');
      const isDocument = mime === 'application/pdf' || mime.startsWith('text/');
      if (typeFilter === 'image' && !isImage) return false;
      if (typeFilter === 'document' && !isDocument) return false;
      if (typeFilter === 'other' && (isImage || isDocument)) return false;

      if (cutoff > 0 && new Date(item.createdAt).getTime() < cutoff) return false;

      if (
        term &&
        !item.fileName.toLowerCase().includes(term) &&
        !String(item.uploadedBy ?? '').toLowerCase().includes(term)
      ) {
        return false;
      }
      return true;
    });
  }, [unified, originFilter, typeFilter, periodFilter, search]);

  const openUnified = async (item: UnifiedAttachment) => {
    if (item.origin === 'comment' && item.commentId) {
      setDownloadingCommentId(item.id);
      try {
        const { blob, fileName } = await ticketsApi.downloadCommentAttachment(
          ticketId,
          item.commentId,
          item.id,
        );
        triggerBlobDownload(blob, fileName || item.fileName);
      } catch {
        toast.error('Não foi possível abrir o anexo.');
      } finally {
        setDownloadingCommentId(null);
      }
      return;
    }
    await handleDownload(item.id, item.fileName);
  };

  const [queue, setQueue] = useState<FileEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Baixa via API autenticada (blob) — um <a href> não envia Authorization.
  const handleDownload = async (attachmentId: string, fileName: string) => {
    setDownloadingId(attachmentId);
    try {
      const { blob, fileName: returnedName } = await ticketsApi.downloadAttachment(ticketId, attachmentId);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = returnedName || fileName || 'anexo';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível baixar o anexo.');
    } finally {
      setDownloadingId(null);
    }
  };

  const cfg = settings.data;
  const isEnabled = cfg?.enabled !== false;

  // Allowlist ÚNICA (todos os contextos). O limite da aba Anexos/repositório
  // do chamado é o de arquivos grandes (maxLargeFileSizeBytes, 2 GB padrão).
  const accept = cfg?.allowedContentTypes?.join(',') ?? 'image/jpeg,image/png,image/webp,application/pdf';
  const maxBytes = cfg?.maxLargeFileSizeBytes ?? 2147483648;

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

  // Espelho da fila mais recente: o "Carregar/Enviar" não pode operar sobre um
  // snapshot antigo (item removido no meio do upload não deve ser enviado).
  const queueRef = useRef<FileEntry[]>([]);
  queueRef.current = queue;

  const uploadAll = async () => {
    if (uploading) return;
    const targetFiles = queue
      .filter((entry) => entry.status === 'idle')
      .map((entry) => entry.file);
    if (targetFiles.length === 0) return;
    setUploading(true);

    for (const file of targetFiles) {
      // Re-resolve pelo File: se o item foi removido da fila, pula; se a fila
      // mudou de ordem, o índice é recalculado no estado atual.
      const idx = queueRef.current.findIndex((entry) => entry.file === file);
      if (idx < 0) continue;
      const entry = queueRef.current[idx];
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
            uploadedBy,
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
    idle: <Icon name="upload" className="h-4 w-4 text-muted" />,
    preparing: <Icon name="progress_activity" className="h-4 w-4 animate-spin text-sky-600 dark:text-sky-400" />,
    uploading: <Icon name="progress_activity" className="h-4 w-4 animate-spin text-sky-600 dark:text-sky-400" />,
    confirming: <Icon name="progress_activity" className="h-4 w-4 animate-spin text-sky-600 dark:text-sky-400" />,
    done: <Icon name="check_circle" className="h-4 w-4 text-success" />,
    error: <Icon name="cancel" className="h-4 w-4 text-danger" />,
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
            role="button"
            tabIndex={0}
            aria-label="Selecionar ou arrastar arquivos para anexar"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-8 text-center transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileRef.current?.click();
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          >
            <Icon name="attach_file" className="h-6 w-6 text-muted" />
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
                  <Icon name="draft" className="h-4 w-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{entry.file.name}</p>
                    <p className="text-xs text-muted">{formatBytes(entry.file.size)}</p>
                    {entry.error && <p className="text-xs text-danger">{entry.error}</p>}
                  </div>
                  <span className={`text-xs ${entry.status === 'error' ? 'text-danger' : entry.status === 'done' ? 'text-success' : 'text-muted'}`}>
                    {STATUS_LABEL[entry.status]}
                  </span>
                  {STATUS_ICON[entry.status]}
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remover ${entry.file.name} da fila`}
                    onClick={() => setQueue((q) => q.filter((_item, index) => index !== idx))}
                  >
                    <Icon name="cancel" className="h-4 w-4" />
                  </Button>
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
                  <Icon name="upload" className="h-4 w-4" /> Enviar todos
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Aba consolidada: os DOIS níveis de anexo, com origem e filtros. */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Arquivos anexados ({filtered.length} de {unified.length})
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filtrar por origem"
              value={originFilter}
              onChange={(e) => setOriginFilter(e.target.value as typeof originFilter)}
              className="rounded-lg border border-border bg-surface-light px-2 py-1 text-xs text-foreground"
            >
              <option value="all">Todas as origens</option>
              <option value="repository">Repositório do chamado</option>
              <option value="comment">Conversa (comentários)</option>
            </select>
            <select
              aria-label="Filtrar por tipo"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
              className="rounded-lg border border-border bg-surface-light px-2 py-1 text-xs text-foreground"
            >
              <option value="all">Todos os tipos</option>
              <option value="image">Imagens</option>
              <option value="document">Documentos</option>
              <option value="other">Outros</option>
            </select>
            <select
              aria-label="Filtrar por período"
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value as typeof periodFilter)}
              className="rounded-lg border border-border bg-surface-light px-2 py-1 text-xs text-foreground"
            >
              <option value="all">Todo o período</option>
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
            </select>
            <Input
              aria-label="Buscar anexo por nome ou autor"
              placeholder="Buscar por nome/autor"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48"
            />
          </div>
        </div>

        {allAttachments.isLoading && <Loading />}
        {allAttachments.isError && !allAttachments.isLoading && (
          <div className="flex flex-col items-center gap-2 py-4 text-center text-sm text-danger">
            <span>Não foi possível carregar os anexos.</span>
            <Button size="sm" variant="ghost" onClick={() => void allAttachments.refetch()}>
              Tentar novamente
            </Button>
          </div>
        )}
        {!allAttachments.isError &&
          filtered.length === 0 &&
          !allAttachments.isLoading && (
            <p className="py-4 text-center text-sm text-muted">
              {unified.length === 0 ? 'Nenhum anexo ainda.' : 'Nenhum anexo para os filtros atuais.'}
            </p>
          )}
        {!allAttachments.isError &&
          filtered.map((item) => (
            <div key={`${item.origin}:${item.id}`} className="flex items-center gap-3 rounded-lg border border-border bg-surface-light px-3 py-2">
              <AttachmentThumb
                ticketId={ticketId}
                commentId={item.origin === 'comment' ? item.commentId ?? null : undefined}
                attachment={item}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{item.fileName}</p>
                <p className="text-xs text-muted">
                  {formatBytes(item.sizeBytes)} · {item.contentType || 'desconhecido'} ·{' '}
                  {new Date(item.createdAt).toLocaleString('pt-BR')}
                </p>
              </div>
              {/* Origem: distingue repositório (arquivo grande) de conversa. */}
              <Badge color={item.origin === 'repository' ? 'slate' : 'accent'}>
                {item.origin === 'repository' ? 'Repositório' : 'Conversa'}
              </Badge>
              {item.origin === 'comment' && item.author && (
                <span className="text-xs text-muted" title={`Comentário de ${item.author}`}>
                  {item.deletedComment ? 'comentário excluído' : item.author}
                </span>
              )}
              <button
                type="button"
                onClick={() => void openUnified(item)}
                disabled={downloadingId === item.id || downloadingCommentId === item.id}
                className="text-xs font-medium text-primary underline hover:text-primary/80 disabled:opacity-50"
              >
                {downloadingId === item.id || downloadingCommentId === item.id ? 'Baixando...' : 'Baixar'}
              </button>
              {item.uploadedBy && <Badge color="slate">{item.uploadedBy}</Badge>}
            </div>
          ))}
        {!allAttachments.isError && allAttachments.data?.hasMore && (
          <div className="flex justify-center pt-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={allAttachments.isFetching}
              onClick={() => setAttachmentCursor(allAttachments.data?.nextCursor ?? undefined)}
            >
              Carregar mais anexos
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}