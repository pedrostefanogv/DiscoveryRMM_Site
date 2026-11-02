import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Button, ErrorDisplay, Icon, Input, Loading, Modal, Select } from '@/components/ui';
import { ApiError, agentsApi } from '@/api';
import { useAppStoreCatalog } from '@/hooks/useAppStore';
import {
  AppInstallationType,
  type AgentSoftwareInventoryItem,
  type AppStoreCatalogPackage,
} from '@/api/types';

/** Quantidade de pacotes retornada por busca na loja. */
const CATALOG_LIMIT = 25;
/** Limite do inventário carregado para detectar apps já instalados. */
const INSTALLED_LIMIT = 500;
/** Atraso do debounce da busca (ms), igual ao resto do app. */
const SEARCH_DEBOUNCE_MS = 300;

const INSTALL_TYPE_OPTIONS = [
  { value: String(AppInstallationType.Winget), label: 'Winget' },
  { value: String(AppInstallationType.Chocolatey), label: 'Chocolatey' },
  { value: String(AppInstallationType.Custom), label: 'Personalizado' },
];

/** Nome exibido do pacote (nome amigável, senão o ID). */
function packageLabel(item: AppStoreCatalogPackage): string {
  return item.name?.trim() || item.packageId;
}

/** Normaliza uma chave de comparação (minúsculas, sem espaços nas pontas). */
function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

/** Chave de um app do inventário: installId, senão nome+fabricante. */
function installedItemKey(item: AgentSoftwareInventoryItem): string {
  if (item.installId) return normalizeKey(item.installId);
  return normalizeKey(`${item.name}|${item.publisher ?? ''}`);
}

interface AgentAppInstallModalProps {
  agentId: string;
  open: boolean;
  onClose: () => void;
  /** Chamado após o agente aceitar o pedido de instalação. */
  onInstalled: () => void;
}

/** Modal que busca apps na loja e dispara a instalação no agente. */
export function AgentAppInstallModal({
  agentId,
  open,
  onClose,
  onInstalled,
}: AgentAppInstallModalProps) {
  const [installationType, setInstallationType] = useState<AppInstallationType>(
    AppInstallationType.Winget,
  );
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedPackage, setSelectedPackage] = useState<AppStoreCatalogPackage | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Pacote bloqueado pela loja por falta de aprovação (409) aguardando confirmação.
  const [pendingUnapproved, setPendingUnapproved] = useState<AppStoreCatalogPackage | null>(null);

  // Ao reabrir, recomeça busca e seleção do zero (o gerenciador escolhido fica retido).
  useEffect(() => {
    if (open) {
      setSearch('');
      setDebouncedSearch('');
      setSelectedPackage(null);
      setPendingUnapproved(null);
      setSubmitting(false);
    }
  }, [open]);

  // Debounce da busca antes de consultar a loja.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const trimmedSearch = debouncedSearch.trim();
  const canSearch = trimmedSearch.length >= 2;

  const catalog = useAppStoreCatalog(
    useMemo(
      () => ({ installationType, search: trimmedSearch, limit: CATALOG_LIMIT }),
      [installationType, trimmedSearch],
    ),
    { enabled: open && canSearch },
  );

  // Inventário atual do agente: detecta o que já está instalado. Reaproveita a
  // mesma chave da lista de aplicativos para o cache/invalidação continuar valendo.
  const installed = useQuery({
    queryKey: ['agents', 'software', agentId, { limit: INSTALLED_LIMIT }] as const,
    queryFn: () => agentsApi.getSoftware(agentId, { limit: INSTALLED_LIMIT }),
    enabled: open,
  });

  const installedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const item of installed.data?.items ?? []) keys.add(installedItemKey(item));
    return keys;
  }, [installed.data]);

  /** Verifica se o pacote da loja já consta no inventário do agente. */
  function isPackageInstalled(item: AppStoreCatalogPackage): boolean {
    if (installedKeys.has(normalizeKey(item.packageId))) return true;
    return installedKeys.has(normalizeKey(`${item.name ?? ''}|${item.publisher ?? ''}`));
  }

  /** Dispara a instalação; em 409 pede confirmação explícita do operador. */
  async function submitInstall(confirmUnapproved: boolean) {
    const selected = selectedPackage;
    if (!selected) return;
    setSubmitting(true);
    try {
      // O payload usa o tipo de instalação do próprio pacote da loja. O agente
      // pode estar offline: o servidor aceita o pedido e entrega quando voltar.
      const payload = confirmUnapproved
        ? { packageId: selected.packageId, installationType: selected.installationType, confirmUnapproved: true }
        : { packageId: selected.packageId, installationType: selected.installationType };
      await agentsApi.installSoftware(agentId, payload);
      toast.success(`Instalação de "${packageLabel(selected)}" enviada ao agente.`);
      onInstalled();
      onClose();
    } catch (error) {
      if (!confirmUnapproved && error instanceof ApiError && error.status === 409) {
        // App não aprovado na política da loja: pede confirmação explícita.
        setPendingUnapproved(selected);
        return;
      }
      toast.error(
        error instanceof ApiError && error.message
          ? error.message
          : 'Falha ao enviar a instalação para o agente.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const catalogItems = catalog.data?.items ?? [];

  return (
    <Modal open={open} onClose={onClose} title="Instalar aplicativo" maxWidth="max-w-2xl">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
          <Select
            label="Gerenciador"
            options={INSTALL_TYPE_OPTIONS}
            value={String(installationType)}
            onChange={(event) => {
              setInstallationType(Number(event.target.value) as AppInstallationType);
              setSelectedPackage(null);
              setPendingUnapproved(null);
            }}
          />
          <Input
            label="Buscar na loja"
            placeholder="Ex.: Firefox, 7-Zip, VLC"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoFocus
          />
        </div>

        {selectedPackage && (
          <p className="text-xs text-muted">
            Selecionado: <span className="font-medium text-foreground">{packageLabel(selectedPackage)}</span>{' '}
            <span className="font-mono">({selectedPackage.packageId})</span>
          </p>
        )}

        {pendingUnapproved && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
            <p>
              O aplicativo{' '}
              <span className="font-semibold text-foreground">{packageLabel(pendingUnapproved)}</span> não está
              aprovado na política da loja para este agente.
            </p>
            <p className="mt-1 text-muted">
              Deseja instalar mesmo assim? A ação será registrada no histórico de comandos do agente.
            </p>
          </div>
        )}

        <div className="min-h-[240px]">
          {!canSearch ? (
            <p className="py-10 text-center text-sm text-muted">
              Digite ao menos 2 caracteres para buscar na loja.
            </p>
          ) : catalog.isLoading ? (
            <Loading message="Buscando pacotes..." size="sm" />
          ) : catalog.isError ? (
            <ErrorDisplay message="Não foi possível buscar os pacotes da loja." onRetry={() => void catalog.refetch()} />
          ) : catalogItems.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">Nenhum pacote encontrado para esta busca.</p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {catalogItems.map((item) => {
                const alreadyInstalled = isPackageInstalled(item);
                const isSelected =
                  selectedPackage?.packageId === item.packageId &&
                  selectedPackage?.installationType === item.installationType;
                return (
                  <li key={`${item.installationType}:${item.packageId}`}>
                    <button
                      type="button"
                      disabled={alreadyInstalled}
                      onClick={() => {
                        setSelectedPackage(item);
                        setPendingUnapproved(null);
                      }}
                      className={
                        'flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ' +
                        (alreadyInstalled
                          ? 'cursor-not-allowed bg-surface/60'
                          : isSelected
                            ? 'bg-primary/10'
                            : 'hover:bg-surface-light')
                      }
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {packageLabel(item)}
                        </span>
                        <span className="block truncate font-mono text-xs text-muted">
                          {item.packageId}
                          {item.version ? ` · v${item.version}` : ''}
                        </span>
                      </span>
                      {alreadyInstalled ? (
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          Já instalado
                        </span>
                      ) : isSelected ? (
                        <Icon name="check_circle" className="h-5 w-5 shrink-0 text-primary" />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          {pendingUnapproved ? (
            <Button onClick={() => void submitInstall(true)} loading={submitting}>
              Instalar mesmo assim
            </Button>
          ) : (
            <Button onClick={() => void submitInstall(false)} loading={submitting} disabled={!selectedPackage}>
              Instalar
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
