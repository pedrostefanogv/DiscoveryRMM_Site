import { useNavigate } from 'react-router-dom';
import { FileText, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui';
import { useTicketAnswerSearch } from '@/hooks/useTicketAnswerSearch';

interface TicketAnswerSemanticSearchPanelProps {
  /**
   * Termo já debounced vindo do campo único de busca ("Buscar"). O painel não
   * tem campo próprio: ele reaproveita o termo e mostra apenas as sugestões de
   * resposta do questionário.
   */
  term: string;
  limit?: number;
  /** Restringe as sugestões ao template selecionado no filtro, quando houver. */
  templateId?: string;
}

/**
 * Sugestões de chamados por resposta do questionário para o campo único de
 * busca. Usa embeddings quando o servidor tem a funcionalidade habilitada e
 * degrada para correspondência por texto automaticamente (o modo vem na
 * resposta). Retorna `null` enquanto o termo tem menos de 3 caracteres.
 */
export function TicketAnswerSemanticSearchPanel({
  term,
  limit = 6,
  templateId,
}: TicketAnswerSemanticSearchPanelProps) {
  const navigate = useNavigate();
  const query = term.trim();
  const search = useTicketAnswerSearch({ q: query, limit, templateId });
  const hits = search.data?.hits ?? [];
  const mode = search.data?.mode;

  if (query.length < 3) return null;
  // Só ocupa espaço quando há resultado (ou enquanto busca): enquanto o usuário
  // apenas filtra por título, a lista de sugestões não aparece.
  if (!search.isFetching && hits.length === 0) return null;

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-border bg-surface-light">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <Sparkles className="h-3.5 w-3.5" />
          Respostas do questionário
        </span>
        {mode && (
          <Badge color={mode === 'semantic' ? 'success' : 'slate'}>
            {mode === 'semantic' ? 'Semântica' : 'Por texto'}
          </Badge>
        )}
      </div>

      {search.isFetching && hits.length === 0 && (
        <p className="px-3 py-2 text-xs text-muted">Buscando respostas...</p>
      )}

      {hits.length > 0 && (
        <ul className="max-h-56 divide-y divide-border overflow-y-auto">
          {hits.map((hit) => (
            <li key={`${hit.ticketId}-${hit.questionKey}`}>
              <button
                type="button"
                onClick={() => navigate(`/tickets/${hit.ticketId}`)}
                className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-hover"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-sm font-medium text-foreground">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted" />
                    <span className="truncate">{hit.ticketTitle}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    <span className="font-medium">{hit.questionLabel}</span>: {hit.valueText}
                  </span>
                </span>
                {mode === 'semantic' && (
                  <Badge color="accent">{Math.round(hit.score * 100)}%</Badge>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
