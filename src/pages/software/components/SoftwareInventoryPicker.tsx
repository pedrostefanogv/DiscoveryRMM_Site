import { useState } from 'react';
import { Icon, Button } from '@/components/ui';
import { softwareInventoryApi } from '@/api/software-inventory';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useQuery } from '@tanstack/react-query';

/** App do inventário escolhido (o que é gravado no pacote custom). */
export interface InventorySoftwareSelection {
  softwareId: string;
  name: string;
  publisher: string | null;
}

interface SoftwareInventoryPickerProps {
  value: InventorySoftwareSelection | null;
  onChange: (value: InventorySoftwareSelection | null) => void;
  disabled?: boolean;
}

/** Quantos resultados a busca traz de uma vez. */
const RESULT_LIMIT = 10;

/**
 * A busca no inventário só dispara a partir daqui (evita varrer o catálogo
 * inteiro a cada tecla).
 */
const MIN_SEARCH_CHARS = 2;

/**
 * Seletor de app do inventário de software para vincular ao pacote custom.
 * Busca com debounce em `softwareInventoryApi.list` e devolve o
 * `softwareId`/`name`/`publisher` do app escolhido.
 */
export function SoftwareInventoryPicker({ value, onChange, disabled }: SoftwareInventoryPickerProps) {
  const [search, setSearch] = useState('');
  // A busca só dispara ~450ms depois da última tecla digitada.
  const debouncedSearch = useDebouncedValue(search, 450);
  const term = debouncedSearch.trim();
  const isTyping = search.trim() !== term;

  const query = useQuery({
    queryKey: ['softwareInventory', 'picker', term],
    queryFn: () => softwareInventoryApi.list({ search: term, limit: RESULT_LIMIT }),
    enabled: term.length >= MIN_SEARCH_CHARS,
    staleTime: 30_000,
  });

  const results = (query.data?.items ?? []).filter(
    (item) => item.softwareId !== value?.softwareId,
  );

  if (value) {
    return (
      <div className="rounded-xl border border-primary/40 bg-primary/10 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Icon name="check_circle" className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              <span className="truncate">{value.name}</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {value.publisher?.trim() || 'Fabricante não informado'}
            </p>
            <p className="mt-0.5 font-mono text-xs text-muted break-all">{value.softwareId}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onChange(null)}
            title="Remover vínculo com o app do inventário"
          >
            <Icon name="close" className="h-4 w-4" /> Trocar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div>
        <label htmlFor="inventory-software-search" className="mb-1.5 block text-sm font-medium text-muted-foreground">
          Buscar app no inventário
        </label>
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            id="inventory-software-search"
            type="search"
            value={search}
            disabled={disabled}
            placeholder={`Nome do app (mín. ${MIN_SEARCH_CHARS} letras)...`}
            aria-describedby="inventory-software-search-help"
            className="w-full rounded-lg border border-border bg-surface-light py-2 pl-9 pr-8 text-sm text-foreground placeholder-muted outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
            onChange={(event) => setSearch(event.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Limpar busca do inventário"
              title="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-foreground"
            >
              <Icon name="close" className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <p id="inventory-software-search-help" className="mt-1 text-xs text-muted">
          O vínculo é um snapshot (nome/fabricante): o agent casa com o inventário local do host.
        </p>
      </div>

      {term.length < MIN_SEARCH_CHARS && (
        <p className="text-xs text-muted">Digite ao menos {MIN_SEARCH_CHARS} letras para buscar.</p>
      )}

      {term.length >= MIN_SEARCH_CHARS && (query.isFetching || isTyping) && (
        <p className="flex items-center gap-2 text-xs text-muted" role="status" aria-live="polite">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
          Buscando apps no inventário…
        </p>
      )}

      {term.length >= MIN_SEARCH_CHARS && query.isError && !query.isFetching && (
        <p className="text-xs text-danger">Não foi possível consultar o inventário. Tente novamente.</p>
      )}

      {term.length >= MIN_SEARCH_CHARS && !query.isFetching && !query.isError && results.length === 0 && (
        <p className="text-xs text-muted">Nenhum app encontrado para “{term}”.</p>
      )}

      {results.length > 0 && (
        <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
          {results.map((item) => (
            <li key={item.softwareId}>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  onChange({
                    softwareId: item.softwareId,
                    name: item.name,
                    publisher: item.publisher ?? null,
                  })
                }
                className="flex w-full items-start gap-2 rounded-lg border border-border bg-surface-light px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="inventory_2" className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{item.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {item.publisher?.trim() || 'Fabricante não informado'}
                  </span>
                </span>
                {typeof item.installedCount === 'number' && (
                  <span className="shrink-0 text-xs text-muted">{item.installedCount} host(s)</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
