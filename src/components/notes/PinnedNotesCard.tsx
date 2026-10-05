import { useEffect, useMemo } from 'react';
import { Pin } from 'lucide-react';
import { Badge, Button, Card, CardHeader, ErrorDisplay, Loading } from '@/components/ui';
import { useAgentNotesAll } from '@/hooks/useNotes';

interface PinnedNotesCardProps {
  agentId: string;
  /** Leva o operador até a aba "Anotações" (todas as anotações, fixadas ou não). */
  onViewAll?: () => void;
}

/**
 * Teto de páginas do carregamento completo. O backend aceita 200 notas por
 * página; 10 páginas cobrem com folga o volume real e protegem contra um
 * cursor inconsistente (evita loop infinito de requests).
 */
const MAX_PAGES = 10;

function noteTimestamp(note: { updatedAt?: string | null; createdAt: string }): number {
  const parsed = Date.parse(note.updatedAt || note.createdAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Coluna direita da aba Info: apenas as anotações fixadas do agente.
 * A lista completa (fixadas e não fixadas) fica na aba Anotações.
 */
export function PinnedNotesCard({ agentId, onViewAll }: PinnedNotesCardProps) {
  const notesQuery = useAgentNotesAll(agentId);
  const pages = notesQuery.data?.pages;
  const loadedPages = pages?.length ?? 0;

  // O endpoint de notas pagina por cursor e NÃO ordena as fixadas primeiro.
  // Carregamos as páginas restantes para não esconder uma fixada mais antiga.
  useEffect(() => {
    if (!notesQuery.hasNextPage || notesQuery.isFetchingNextPage) return;
    if (loadedPages >= MAX_PAGES) return;
    void notesQuery.fetchNextPage();
  }, [
    notesQuery.hasNextPage,
    notesQuery.isFetchingNextPage,
    notesQuery.fetchNextPage,
    loadedPages,
  ]);

  const pinnedNotes = useMemo(() => {
    const all = pages?.flatMap((page) => page.items) ?? [];
    return all
      .filter((note) => note.isPinned)
      .sort((a, b) => noteTimestamp(b) - noteTimestamp(a));
  }, [pages]);

  const reachedCap = Boolean(notesQuery.hasNextPage) && loadedPages >= MAX_PAGES;

  return (
    <Card>
      <CardHeader
        title="Anotações fixadas"
        subtitle={`${pinnedNotes.length} ${pinnedNotes.length === 1 ? 'anotação fixada' : 'anotações fixadas'}`}
        action={
          onViewAll ? (
            <Button size="sm" variant="ghost" onClick={onViewAll}>
              Ver todas
            </Button>
          ) : undefined
        }
      />

      {notesQuery.isLoading ? (
        <Loading message="Carregando anotações..." />
      ) : notesQuery.isError ? (
        <ErrorDisplay onRetry={() => notesQuery.refetch()} />
      ) : pinnedNotes.length === 0 ? (
        <p className="text-sm text-muted">
          Nenhuma anotação fixada. Fixe uma anotação na aba Anotações para exibi-la aqui.
        </p>
      ) : (
        <div className="space-y-2">
          {pinnedNotes.map((note) => (
            <div key={note.id} className="rounded-lg border border-border bg-surface-light p-3">
              <div className="mb-1 flex items-center gap-2">
                <Badge color="warning" className="text-[10px]">
                  <Pin className="h-3 w-3" />
                  Fixada
                </Badge>
                <span className="truncate text-xs font-medium text-foreground">
                  {note.author ?? 'Sem autor'}
                </span>
                <span className="ml-auto shrink-0 text-xs text-muted">
                  {new Date(note.createdAt).toLocaleString('pt-BR')}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{note.content}</p>
            </div>
          ))}
          {reachedCap && (
            <p className="text-xs text-muted">
              Exibindo as fixadas entre as {MAX_PAGES * 200} anotações mais recentes. Abra a aba
              Anotações para navegar pelo restante.
            </p>
          )}
        </div>
      )}

      {notesQuery.isFetchingNextPage && (
        <p className="mt-3 text-xs text-muted">Carregando mais anotações...</p>
      )}
    </Card>
  );
}
