import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Icon, Input, Loading } from '@/components/ui';
import {
  useKnowledgeSearch,
  useLinkTicketKnowledge,
  useSendTicketKnowledgeFeedback,
  useTicketKnowledgeLinks,
  useTicketKnowledgeSuggestions,
  useUnlinkTicketKnowledge,
} from '@/hooks';
import { useAuthorization } from '@/auth/authorization';
import toast from 'react-hot-toast';

const KNOWLEDGE_CREATE_PERMISSIONS = [
  'KnowledgeBase.Create',
  'KnowledgeBase.*',
  'knowledgebase.create',
  'knowledgebase.*',
  'admin.*',
];

interface TicketCommentLike {
  body?: string | null;
  isInternal?: boolean;
  authorName?: string | null;
}

export interface TicketKnowledgePanelProps {
  ticketId: string;
  ticketTitle: string;
  ticketDescription?: string | null;
  ticketCategory?: string | null;
  clientId?: string | null;
  siteId?: string | null;
  departmentId?: string | null;
  canManageLinks?: boolean;
  comments?: TicketCommentLike[];
}

export function TicketKnowledgePanel({
  ticketId,
  ticketTitle,
  ticketDescription,
  ticketCategory,
  clientId,
  siteId,
  departmentId,
  canManageLinks = true,
  comments = [],
}: TicketKnowledgePanelProps) {
  const navigate = useNavigate();
  const { hasAnyPermission } = useAuthorization();
  const canCreateArticle = hasAnyPermission(KNOWLEDGE_CREATE_PERMISSIONS);

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [feedbackSent, setFeedbackSent] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setSearchInput('');
    setSearchQuery('');
    setFeedbackSent({});
  }, [ticketId]);

  const linksQuery = useTicketKnowledgeLinks(ticketId);
  const suggestionsQuery = useTicketKnowledgeSuggestions(
    ticketId,
    {
      q: ticketTitle,
      clientId: clientId || undefined,
      siteId: siteId || undefined,
      departmentId: departmentId || undefined,
      maxResults: 5,
    },
    canManageLinks,
  );
  const manualSearchQuery = useKnowledgeSearch(
    {
      q: searchQuery,
      clientId: clientId || undefined,
      siteId: siteId || undefined,
      departmentId: departmentId || undefined,
      mode: 'hybrid',
      maxResults: 5,
    },
    searchQuery.trim().length > 0,
  );

  const linkMutation = useLinkTicketKnowledge();
  const unlinkMutation = useUnlinkTicketKnowledge();
  const feedbackMutation = useSendTicketKnowledgeFeedback();

  const linkedArticleIds = useMemo(
    () => new Set((linksQuery.data ?? []).map((item) => item.articleId)),
    [linksQuery.data],
  );

  const availableSuggestions = useMemo(
    () => (suggestionsQuery.data ?? []).filter((item) => !linkedArticleIds.has(item.id)),
    [suggestionsQuery.data, linkedArticleIds],
  );

  const availableSearchResults = useMemo(
    () => (manualSearchQuery.data ?? []).filter((item) => !linkedArticleIds.has(item.id)),
    [manualSearchQuery.data, linkedArticleIds],
  );

  const handleLink = (articleId: string) => {
    linkMutation.mutate(
      { ticketId, data: { articleId } },
      {
        onSuccess: () => toast.success('Artigo vinculado ao chamado.'),
        onError: () => toast.error('Falha ao vincular artigo.'),
      },
    );
  };

  const handleUnlink = (linkId: string) => {
    unlinkMutation.mutate(
      { ticketId, linkId },
      {
        onSuccess: () => toast.success('Vínculo removido.'),
        onError: () => toast.error('Falha ao desvincular artigo.'),
      },
    );
  };

  const handleFeedback = (articleId: string, useful: boolean) => {
    feedbackMutation.mutate(
      { ticketId, articleId, useful },
      {
        onSuccess: () => {
          setFeedbackSent((prev) => ({ ...prev, [articleId]: useful }));
          toast.success(useful ? 'Marcado como útil.' : 'Feedback registrado.');
        },
        onError: () => toast.error('Falha ao enviar feedback.'),
      },
    );
  };

  const handleCreateFromTicket = () => {
    const publicComments = comments
      .filter((c) => !c.isInternal && c.body?.trim())
      .map((c) => `- ${c.body!.trim()}`)
      .slice(-3);

    const sections = [
      `## Problema\n\n${ticketDescription?.trim() || ticketTitle}`,
      publicComments.length > 0
        ? `## Resolução\n\n${publicComments.join('\n\n')}`
        : `## Resolução\n\nDescreva aqui o procedimento aplicado para resolver o chamado.`,
    ];

    navigate('/knowledge/new', {
      state: {
        prefill: {
          title: ticketTitle,
          content: sections.join('\n\n'),
          category: ticketCategory ?? '',
          clientId: clientId ?? '',
          siteId: siteId ?? '',
          departmentId: departmentId ?? '',
          fromTicketId: ticketId,
        },
      },
    });
  };

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon name="menu_book" className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Base de Conhecimento</h3>
        </div>
        {canCreateArticle && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleCreateFromTicket}
            title="Criar novo artigo na KB pré-preenchido com este chamado"
          >
            <Icon name="add" className="h-3.5 w-3.5" /> Criar artigo
          </Button>
        )}
      </div>

      {/* Artigos vinculados */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Vinculados ({linksQuery.data?.length ?? 0})
        </p>

        {linksQuery.isLoading ? (
          <Loading message="Carregando vínculos..." />
        ) : (linksQuery.data?.length ?? 0) === 0 ? (
          <p className="text-xs text-muted">Nenhum artigo vinculado a este chamado.</p>
        ) : (
          <ul className="space-y-2">
            {linksQuery.data?.map((link) => {
              const sent = feedbackSent[link.articleId];
              return (
                <li
                  key={link.linkId}
                  className="rounded-lg border border-border bg-surface-light p-2.5 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        to={`/knowledge/${link.articleId}`}
                        className="font-medium text-foreground hover:text-primary hover:underline line-clamp-2"
                      >
                        {link.articleTitle}
                      </Link>
                      {link.category && (
                        <Badge color="slate" className="mt-1">
                          {link.category}
                        </Badge>
                      )}
                    </div>
                    {canManageLinks && (
                      <button
                        type="button"
                        onClick={() => handleUnlink(link.linkId)}
                        disabled={unlinkMutation.isPending && unlinkMutation.variables?.linkId === link.linkId}
                        className="shrink-0 rounded p-1 text-muted hover:text-danger"
                        title="Desvincular artigo"
                        aria-label={`Desvincular ${link.articleTitle}`}
                      >
                        <Icon name="link_off" className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="mt-2 flex items-center gap-1.5 border-t border-border/60 pt-2">
                    <span className="text-[11px] text-muted">Foi útil?</span>
                    <button
                      type="button"
                      onClick={() => handleFeedback(link.articleId, true)}
                      disabled={feedbackMutation.isPending && feedbackMutation.variables?.articleId === link.articleId}
                      aria-label={`Marcar ${link.articleTitle} como útil`}
                      className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${
                        sent === true
                          ? 'bg-success/20 text-success'
                          : 'text-muted hover:bg-surface-hover hover:text-foreground'
                      }`}
                    >
                      <Icon name="check" className="h-3 w-3 inline mr-0.5" />
                      Sim
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFeedback(link.articleId, false)}
                      disabled={feedbackMutation.isPending && feedbackMutation.variables?.articleId === link.articleId}
                      aria-label={`Marcar ${link.articleTitle} como não útil`}
                      className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${
                        sent === false
                          ? 'bg-danger/20 text-danger'
                          : 'text-muted hover:bg-surface-hover hover:text-foreground'
                      }`}
                    >
                      <Icon name="close" className="h-3 w-3 inline mr-0.5" />
                      Não
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Sugestões automáticas */}
      {canManageLinks && availableSuggestions.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-border pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Sugestões para este chamado
          </p>
          <ul className="space-y-1.5">
            {availableSuggestions.map((article) => (
              <li
                key={article.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-light px-2.5 py-2 text-xs"
              >
                <Link
                  to={`/knowledge/${article.id}`}
                  className="min-w-0 flex-1 truncate font-medium text-foreground hover:text-primary hover:underline"
                >
                  {article.title}
                </Link>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  loading={linkMutation.isPending && linkMutation.variables?.data.articleId === article.id}
                  onClick={() => handleLink(article.id)}
                >
                  <Icon name="add" className="h-3.5 w-3.5" /> Vincular
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Busca rápida para vincular */}
      {canManageLinks && (
        <div className="mt-4 space-y-2 border-t border-border pt-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSearchQuery(searchInput.trim());
            }}
          >
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar artigo para vincular..."
              aria-label="Buscar artigo para vincular"
            />
            <Button type="submit" size="sm" variant="secondary" disabled={!searchInput.trim()}>
              <Icon name="search" className="h-3.5 w-3.5" />
            </Button>
          </form>

          {manualSearchQuery.isFetching && <Loading message="Buscando..." />}
          {manualSearchQuery.isError && !manualSearchQuery.isFetching && (
            <div className="flex items-center justify-between text-xs text-danger">
              <span>Erro ao buscar artigos.</span>
              <button
                type="button"
                onClick={() => void manualSearchQuery.refetch()}
                className="underline hover:text-foreground"
              >
                Tentar novamente
              </button>
            </div>
          )}
          {!manualSearchQuery.isFetching && !manualSearchQuery.isError && searchQuery && availableSearchResults.length === 0 && (
            <p className="text-xs text-muted">Nenhum artigo encontrado.</p>
          )}
          {availableSearchResults.length > 0 && (
            <ul className="space-y-1.5">
              {availableSearchResults.map((article) => (
                <li
                  key={article.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-light px-2.5 py-1.5 text-xs"
                >
                  <Link
                    to={`/knowledge/${article.id}`}
                    className="min-w-0 flex-1 truncate text-foreground hover:text-primary hover:underline"
                  >
                    {article.title}
                  </Link>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    loading={linkMutation.isPending && linkMutation.variables?.data.articleId === article.id}
                    onClick={() => handleLink(article.id)}
                  >
                    <Icon name="add" className="h-3.5 w-3.5" /> Vincular
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
