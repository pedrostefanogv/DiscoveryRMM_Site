import { useEffect, useMemo, useState } from 'react';

import { Input } from '@/components/ui';
import { useAppStoreCatalog } from '@/hooks/useAppStore';
import type { AppInstallationType } from '@/api/types';

interface PackagePickerProps {
  /** Tipo do catálogo a consultar (o mesmo da regra que será criada). */
  installationType: AppInstallationType;
  /** Pacote já escolhido (vindo do catálogo ou digitado). */
  packageId: string;
  /** Trava o campo quando o pacote veio do catálogo. */
  locked: boolean;
  onChange: (packageId: string) => void;
}

/**
 * Campo de pacote da regra de aprovação com busca no catálogo.
 *
 * Antes o operador precisava digitar o packageId de cabeça — inclusive ao criar
 * uma regra para um cliente, quando o pacote já estava cadastrado no sistema.
 * Aqui a busca usa o mesmo endpoint da aba Catálogo (com debounce) e continua
 * aceitando texto livre, para pacotes que ainda não estão no catálogo.
 *
 * Fica num componente separado para a consulta existir apenas com o modal
 * aberto: o modal é renderizado (fechado) dentro da loja e, sem isso, cada
 * render da listagem dispararia uma consulta de catálogo extra.
 */
export function PackageCatalogPicker({
  installationType,
  packageId,
  locked,
  onChange,
}: PackagePickerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const catalogParams = useMemo(
    () => ({ installationType, search: debouncedSearch, limit: 20 }),
    [installationType, debouncedSearch],
  );
  // Só consulta com busca ativa: abrir o modal não dispara request nenhum.
  const catalog = useAppStoreCatalog(catalogParams, {
    enabled: !locked && debouncedSearch.length >= 2,
  });
  const items = catalog.data?.items ?? [];
  const total = catalog.data?.count ?? items.length;

  return (
    <div
      className="relative"
      // Fecha a lista quando o foco sai do bloco (clicar na opção mantém: os
      // botões da lista recebem o foco antes do clique).
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <Input
        label="Pacote"
        placeholder="Busque no catálogo ou digite o ID (ex: Microsoft.VSCode)"
        value={packageId}
        readOnly={locked}
        disabled={locked}
        autoComplete="off"
        title={locked ? 'ID definido pelo pacote selecionado no catálogo' : undefined}
        className={locked ? 'cursor-not-allowed opacity-70' : ''}
        onFocus={() => {
          if (!locked) setOpen(true);
        }}
        onChange={(event) => {
          if (locked) return;
          onChange(event.target.value);
          setSearchTerm(event.target.value);
          setOpen(true);
        }}
      />

      {!locked && open && debouncedSearch.length >= 2 && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-surface shadow-lg">
          {catalog.isLoading && (
            <p className="px-3 py-2 text-xs text-muted">Buscando pacotes…</p>
          )}
          {!catalog.isLoading && items.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted">
              Nenhum pacote encontrado. Você pode digitar o ID manualmente.
            </p>
          )}
          {items.map((item) => (
            <button
              key={`${item.installationType}:${item.packageId}`}
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-surface-light"
              onClick={() => {
                onChange(item.packageId);
                setSearchTerm('');
                setOpen(false);
              }}
            >
              <span className="min-w-0">
                <span className="block truncate font-mono text-xs text-foreground">{item.packageId}</span>
                {item.name && <span className="block truncate text-xs text-muted">{item.name}</span>}
              </span>
              {item.version && (
                <span className="shrink-0 text-xs text-muted">{item.version}</span>
              )}
            </button>
          ))}
          {total > items.length && (
            <p className="px-3 py-2 text-xs text-muted">
              Mostrando {items.length} de {total}. Refine a busca para achar o pacote.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
