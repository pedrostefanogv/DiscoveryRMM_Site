import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Sparkles, FileText } from 'lucide-react';
import { Badge, Card, CardHeader, Input, Loading } from '@/components/ui';
import { useTicketAnswerSearch } from '@/hooks/useTicketAnswerSearch';

interface TicketAnswerSemanticSearchPanelProps {
  /**
   * Embute a busca dentro de outro card (sem o Card/CardHeader externo).
   * Usado na página de chamados para unificar filtros e busca num único card.
   */
  embedded?: boolean;
}

/**
 * Busca nos chamados pela resposta do questionário. Usa embeddings quando o
 * servidor tem a funcionalidade habilitada e degrada para correspondência por
 * texto automaticamente (o modo vem na resposta).
 */
export function TicketAnswerSemanticSearchPanel({ embedded = false }: TicketAnswerSemanticSearchPanelProps) {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 400);
    return () => clearTimeout(timer);
  }, [term]);

  const search = useTicketAnswerSearch({ q: debounced, limit: 8 });
  const hits = search.data?.hits ?? [];
  const mode = search.data?.mode;
  const hasQuery = debounced.length >= 3;

  const modeBadge =
    mode && hasQuery ? (
      <Badge color={mode === 'semantic' ? 'success' : 'slate'}>
        {mode === 'semantic' ? 'Semântica' : 'Por texto'}
      </Badge>
    ) : undefined;

  const body = (
    <>
      <Input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Buscar por resposta (mín. 3 caracteres)"
        hint={
          mode === 'disabled'
            ? 'Busca semântica desativada nas configurações de IA — usando correspondência por texto.'
            : 'Semântica usa o significado das respostas; se indisponível, cai automaticamente para texto.'
        }
      />

      {search.isFetching && <div className="mt-3"><Loading message="Buscando..." /></div>}

      {!search.isFetching && hasQuery && hits.length === 0 && (
        <p className="mt-3 text-sm text-muted">Nenhuma resposta semelhante encontrada.</p>
      )}

      {hits.length > 0 && (
        <div className="mt-3 space-y-2">
          {hits.map((hit) => (
            <button
              key={`${hit.ticketId}-${hit.questionKey}`}
              onClick={() => navigate(`/tickets/${hit.ticketId}`)}
              className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-left transition-colors hover:border-primary/60"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    <FileText className="mr-1 inline h-3.5 w-3.5 text-muted" />
                    {hit.ticketTitle}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    <span className="font-medium">{hit.questionLabel}</span>: {hit.valueText}
                  </p>
                </div>
                {mode === 'semantic' && (
                  <Badge color="accent">
                    <Sparkles className="mr-0.5 inline h-3 w-3" />
                    {Math.round(hit.score * 100)}%
                  </Badge>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {!hasQuery && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          <Search className="h-3.5 w-3.5" />
          Digite para buscar em todas as respostas dos chamados que você pode ver.
        </p>
      )}
    </>
  );

  if (embedded) {
    return (
      <section className="mt-5 border-t border-border pt-4" aria-label="Busca nas respostas dos chamados">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted" />
              <h3 className="text-sm font-semibold text-foreground">Busca nas respostas dos chamados</h3>
            </div>
            <p className="mt-1 text-xs text-muted">
              Encontre chamados por respostas de questionário (ex: 'Softwares de terceiros').
            </p>
          </div>
          {modeBadge}
        </div>
        {body}
      </section>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Busca nas respostas dos chamados"
        subtitle="Encontre chamados por respostas de questionário (ex: 'Softwares de terceiros')."
        action={modeBadge}
      />
      {body}
    </Card>
  );
}
