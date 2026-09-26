import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, Search, Trash2 } from 'lucide-react';
import { Badge, Button, Input, Loading, Select } from '@/components/ui';
import {
  useCreateTicketRelation, useDeleteTicketRelation, useTicketRelations, useTickets,
} from '@/hooks/useTickets';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { TicketRelationKind } from '@/api';
import toast from 'react-hot-toast';

const RELATION_TYPE_OPTIONS: { value: TicketRelationKind; label: string }[] = [
  { value: 'Duplicate', label: 'Duplicado de' },
  { value: 'Blocks', label: 'Bloqueia' },
  { value: 'RelatesTo', label: 'Relacionado a' },
  { value: 'ParentOf', label: 'Pai de' },
  { value: 'ChildOf', label: 'Filho de' },
];

const RELATION_LABELS: Record<string, string> = {
  Duplicate: 'Duplicado de',
  Blocks: 'Bloqueia',
  RelatesTo: 'Relacionado a',
  ParentOf: 'Pai de',
  ChildOf: 'Filho de',
};

/** O que cada tipo significa (ajuda exibida junto do seletor). */
const RELATION_HELP: Record<TicketRelationKind, string> = {
  Duplicate: 'Este chamado é duplicado do escolhido — mesmo problema, um só atendimento.',
  Blocks: 'Este chamado está impedindo o andamento do chamado escolhido.',
  RelatesTo: 'Vínculo simples: os chamados falam do mesmo assunto.',
  ParentOf: 'Este chamado é o principal (pai); o escolhido é o desdobramento.',
  ChildOf: 'Este chamado é o desdobramento (filho) do chamado escolhido.',
};

const shortId = (id: string | null | undefined) => (id ? id.slice(0, 8) : '—');

/** Quantos vínculos aparecem antes do "Ver todos". */
const VISIBLE_RELATIONS = 3;

/** A busca de chamados só dispara a partir daqui (evita varredura a cada tecla). */
const MIN_SEARCH_CHARS = 3;

/**
 * Vínculos do chamado (duplicado, bloqueia, relacionado, pai/filho) dentro do
 * Resumo geral. Traz busca por chamados (título/descrição/resposta) e ajuda
 * explicando cada tipo.
 */
export function TicketRelationsSection({ ticketId }: { ticketId: string }) {
  const relations = useTicketRelations(ticketId);
  const create = useCreateTicketRelation();
  const remove = useDeleteTicketRelation();

  const [relationType, setRelationType] = useState<TicketRelationKind>('RelatesTo');
  const [showAll, setShowAll] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<{ id: string; title: string } | null>(null);
  // A busca só dispara ~450ms depois da última tecla digitada.
  const debouncedSearch = useDebouncedValue(search, 450);

  const items = Array.isArray(relations.data) ? relations.data : [];
  const linkedIds = useMemo(
    () => new Set(items.map((rel) => rel.otherTicketId ?? (rel.sourceTicketId === ticketId ? rel.targetTicketId : rel.sourceTicketId))),
    [items, ticketId],
  );

  const term = debouncedSearch.trim();
  const isTyping = search.trim() !== debouncedSearch.trim();
  const searchQuery = useTickets(
    { text: term || undefined, limit: 8 },
    { enabled: term.length >= MIN_SEARCH_CHARS },
  );
  const results = (searchQuery.data?.items ?? [])
    .filter((ticket) => ticket.id !== ticketId && !linkedIds.has(ticket.id))
    .slice(0, 8);

  const add = () => {
    if (!selected) return;
    create.mutate(
      { id: ticketId, data: { targetTicketId: selected.id, relationType } },
      {
        onSuccess: () => {
          toast.success('Vínculo criado');
          setSelected(null);
          setSearch('');
          setIsLinking(false);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao criar vínculo'),
      },
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Chamados vinculados</p>
          <p className="text-xs text-muted">
            {items.length === 0 ? 'Nenhum vínculo' : `${items.length} vínculo(s)`}
          </p>
        </div>
        <Button
          size="sm"
          variant={isLinking ? 'secondary' : 'ghost'}
          className="px-2"
          onClick={() => setIsLinking((current) => !current)}
          aria-label="Novo vínculo"
          title="Novo vínculo"
        >
          <Link2 className="h-4 w-4" />
        </Button>
      </div>

      {relations.isLoading && <Loading />}
      {relations.isError && !relations.isLoading && (
        <p className="text-sm text-danger">Erro ao carregar os vínculos. Tente novamente.</p>
      )}
      {!relations.isLoading && items.length > 0 && (
        <ul className={`space-y-2 ${showAll && items.length > VISIBLE_RELATIONS ? 'max-h-64 overflow-y-auto pr-1' : ''}`}>
          {(showAll ? items : items.slice(0, VISIBLE_RELATIONS)).map((rel) => {
            const otherId = rel.otherTicketId ?? (rel.sourceTicketId === ticketId ? rel.targetTicketId : rel.sourceTicketId);
            const title = rel.otherTicketTitle?.trim();

            return (
              <li key={rel.id} className="rounded-lg border border-border bg-surface-light px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  {/* Clicar abre o chamado vinculado. */}
                  <button
                    type="button"
                    onClick={() => otherId && navigate(`/tickets/${otherId}`)}
                    disabled={!otherId}
                    aria-label={title ? `Abrir chamado ${title}` : 'Abrir chamado vinculado'}
                    title={title ? `Abrir ${title}` : undefined}
                    className="min-w-0 flex-1 text-left transition-colors hover:text-primary disabled:cursor-default"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge color="slate">{RELATION_LABELS[rel.relationType] ?? rel.relationType}</Badge>
                      {rel.otherTicketIsClosed === true && <Badge color="success">Encerrado</Badge>}
                      {rel.otherTicketIsClosed === false && <Badge color="accent">Aberto</Badge>}
                    </div>
                    <p className="mt-1 truncate text-sm font-medium text-foreground hover:underline">
                      {title || 'Chamado não encontrado'}
                    </p>
                    <p className="truncate text-xs text-muted">
                      <code className="font-mono">{shortId(otherId)}</code>
                    </p>
                  </button>
                  <button
                    type="button"
                    aria-label="Remover vínculo"
                    onClick={() =>
                      remove.mutate(
                        { id: ticketId, relationId: rel.id },
                        { onError: () => toast.error('Erro ao remover vínculo') },
                      )
                    }
                    className="p-1 text-muted transition-colors hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {items.length > VISIBLE_RELATIONS && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="w-full"
          onClick={() => setShowAll((current) => !current)}
        >
          {showAll ? 'Mostrar menos' : `Ver todos (${items.length})`}
        </Button>
      )}

      {isLinking && (
      <div className="space-y-3 rounded-lg border border-border bg-surface-light p-3">
        <div>
          <Input
            label="Buscar chamado"
            value={search}
            placeholder="Título, descrição ou resposta do questionário"
            onChange={(event) => {
              setSearch(event.target.value);
              setSelected(null);
            }}
          />
          {search.trim().length > 0 && search.trim().length < MIN_SEARCH_CHARS && (
            <p className="mt-1 text-xs text-muted">
              Digite ao menos {MIN_SEARCH_CHARS} caracteres para buscar.
            </p>
          )}
          {search.trim().length >= MIN_SEARCH_CHARS && (isTyping || searchQuery.isFetching) && (
            <p className="mt-1 text-xs text-muted">Buscando...</p>
          )}
          {term.length >= MIN_SEARCH_CHARS && !isTyping && !searchQuery.isFetching && results.length === 0 && (
            <p className="mt-1 text-xs text-muted">Nenhum chamado encontrado para “{term}”.</p>
          )}
          {results.length > 0 && (
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              {results.map((ticket) => (
                <li key={ticket.id}>
                  <button
                    type="button"
                    onClick={() => setSelected({ id: ticket.id, title: ticket.title })}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-hover/60 ${
                      selected?.id === ticket.id ? 'bg-primary/10 text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate">{ticket.title}</span>
                    <code className="shrink-0 font-mono text-xs text-muted">{shortId(ticket.id)}</code>
                    {ticket.closedAt && <Badge color="success">Encerrado</Badge>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selected && (
            <p className="mt-2 text-xs text-foreground">
              Selecionado: <strong>{selected.title}</strong> <code className="font-mono">{shortId(selected.id)}</code>
            </p>
          )}
        </div>

        <Select
          label="Tipo de vínculo"
          options={RELATION_TYPE_OPTIONS}
          value={relationType}
          onChange={(event) => setRelationType(event.target.value as TicketRelationKind)}
          hint={RELATION_HELP[relationType]}
        />

        <Button
          size="sm"
          className="w-full"
          onClick={add}
          loading={create.isPending}
          disabled={!selected}
        >
          <Link2 className="h-4 w-4" /> Vincular chamado
        </Button>

        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setIsLinking(false);
              setSelected(null);
              setSearch('');
            }}
          >
            Cancelar
          </Button>
        </div>

        <details className="text-xs text-muted">
          <summary className="cursor-pointer select-none font-medium text-muted-foreground">
            Como funciona?
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>O vínculo aparece nos <strong>dois chamados</strong> (aqui e no vinculado).</li>
            <li>Não altera estado, prioridade nem SLA — é só um relacionamento.</li>
            <li>Use <em>Duplicado de</em> para o mesmo problema e <em>Bloqueia</em> quando um impede o outro.</li>
            <li>Um mesmo par de chamados aceita apenas um vínculo (evita duplicidade).</li>
          </ul>
        </details>
      </div>
      )}
    </div>
  );
}
