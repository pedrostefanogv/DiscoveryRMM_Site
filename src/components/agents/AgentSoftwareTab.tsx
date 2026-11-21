import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, agentsApi, type AgentSoftwareInventoryItem } from '@/api';
import { AgentAppInstallModal } from '@/components/agents/AgentAppInstallModal';
import {
  Badge,
  Button,
  ContextMenu,
  DataTable,
  ErrorDisplay,
  Icon,
  Input,
  Loading,
  Modal,
  Pagination,
  Select,
  type Column,
  type ContextMenuItem,
} from '@/components/ui';
import { useAgentSoftwarePage, type useAgentSoftwareSnapshot } from '@/hooks/useAgents';
import { formatDate } from '@/pages/agents/agentDetailUtils';

const SOFTWARE_MAX_PAGE_SIZE = 2000;

const PAGE_SIZE_OPTIONS = [
  { value: '10', label: '10 por página' },
  { value: '30', label: '30 por página' },
  { value: '50', label: '50 por página' },
  { value: '100', label: '100 por página' },
  { value: 'max', label: 'Todos' },
];

const SOFTWARE_ORDER_OPTIONS = [
  { value: 'desc', label: 'Mais recente primeiro' },
  { value: 'asc', label: 'Mais antigo primeiro' },
];

const OFFLINE_QUEUE_HINT = 'agente offline — o comando entra na fila e é entregue quando ele reconectar';

interface AgentSoftwareTabProps {
  agentId: string;
  agentName: string;
  isOnline: boolean;
  canExecute: boolean;
  softwareSnapshot: ReturnType<typeof useAgentSoftwareSnapshot>;
}

export function AgentSoftwareTab({
  agentId,
  agentName,
  isOnline,
  canExecute,
  softwareSnapshot,
}: AgentSoftwareTabProps) {
  const [softwareLimitSelected, setSoftwareLimitSelected] = useState('10');
  const [softwareOrder, setSoftwareOrder] = useState<'asc' | 'desc'>('desc');
  const [softwareSearchInput, setSoftwareSearchInput] = useState('');
  const [softwareSearchApplied, setSoftwareSearchApplied] = useState('');
  const [softwarePage, setSoftwarePage] = useState(1);
  const [softwareOnlyUpdates, setSoftwareOnlyUpdates] = useState(false);
  const [isRefreshingSoftware, setIsRefreshingSoftware] = useState(false);
  const [updatingSoftwareId, setUpdatingSoftwareId] = useState<string | null>(null);
  const [pendingUnapprovedUpdate, setPendingUnapprovedUpdate] = useState<AgentSoftwareInventoryItem | null>(null);
  const [pendingUninstall, setPendingUninstall] = useState<AgentSoftwareInventoryItem | null>(null);
  const [uninstallConfirmText, setUninstallConfirmText] = useState('');
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [softwareMenu, setSoftwareMenu] = useState<{ x: number; y: number; item: AgentSoftwareInventoryItem } | null>(null);
  const [softwareDetails, setSoftwareDetails] = useState<AgentSoftwareInventoryItem | null>(null);

  const softwareRefetchTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => {
    softwareRefetchTimers.current.forEach(clearTimeout);
    softwareRefetchTimers.current = [];
  }, []);

  const softwarePageSize =
    softwareLimitSelected === 'max' ? SOFTWARE_MAX_PAGE_SIZE : Number(softwareLimitSelected);
  const software = useAgentSoftwarePage(agentId, {
    page: softwarePage,
    pageSize: softwarePageSize,
    search: softwareSearchApplied,
    order: softwareOrder,
    onlyUpdates: softwareOnlyUpdates,
  });

  const softwareTotalCount =
    software.data?.totalCount ?? softwareSnapshot.data?.totalInstalled ?? 0;
  const softwareTotalPages =
    software.data?.totalPages ?? Math.max(1, Math.ceil(softwareTotalCount / softwarePageSize));
  const safeSoftwarePage = Math.min(softwarePage, softwareTotalPages);
  const softwareItemsAll = software.data?.items ?? [];
  const softwareItems = softwareOnlyUpdates
    ? softwareItemsAll.filter(item => item.updateAvailable)
    : softwareItemsAll;
  const softwareUpdatesCount = softwareItemsAll.filter(item => item.updateAvailable).length;
  const softwareUpdatesTotal = softwareSnapshot.data?.updateAvailableCount ?? softwareUpdatesCount;

  useEffect(() => {
    if (softwarePage !== safeSoftwarePage) {
      setSoftwarePage(safeSoftwarePage);
    }
  }, [softwarePage, safeSoftwarePage]);

  const resetSoftwarePagination = () => setSoftwarePage(1);

  const handleApplySoftwareFilters = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSoftwareSearchApplied(softwareSearchInput.trim());
    resetSoftwarePagination();
  };

  const handleClearSoftwareSearch = () => {
    setSoftwareSearchInput('');
    setSoftwareSearchApplied('');
    resetSoftwarePagination();
  };

  const handleToggleSoftwareOnlyUpdates = () => {
    setSoftwareOnlyUpdates(prev => !prev);
    resetSoftwarePagination();
  };

  const handleSoftwareLimitChange = (value: string) => {
    setSoftwareLimitSelected(value);
    resetSoftwarePagination();
  };

  const handleSoftwareOrderChange = (value: 'asc' | 'desc') => {
    setSoftwareOrder(value);
    resetSoftwarePagination();
  };

  const scheduleSoftwareRefetch = () => {
    softwareRefetchTimers.current.forEach(clearTimeout);
    softwareRefetchTimers.current = [];
    [45_000, 110_000, 170_000].forEach(delay => {
      const timer = setTimeout(() => {
        void software.refetch();
        void softwareSnapshot.refetch();
      }, delay);
      softwareRefetchTimers.current.push(timer);
    });
  };

  const handleRefreshSoftware = async () => {
    if (!agentId || isRefreshingSoftware) return;
    setIsRefreshingSoftware(true);
    try {
      await agentsApi.refreshData(agentId, { software: true });
      toast.success('Solicitação de coleta de software enviada ao agente.');

      const previousUpdatedAt = softwareSnapshot.data?.updatedAt;
      let attempts = 0;
      const maxAttempts = 10;
      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 2000));
        const refreshed = await softwareSnapshot.refetch();
        if (refreshed.data?.updatedAt && refreshed.data.updatedAt !== previousUpdatedAt) break;
        attempts++;
      }

      await software.refetch();
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'Falha ao solicitar refresh de software.';
      toast.error(msg);
    } finally {
      setIsRefreshingSoftware(false);
    }
  };

  const handleUpdateSoftware = async (item: AgentSoftwareInventoryItem, confirmUnapproved = false) => {
    if (!agentId || updatingSoftwareId) return;
    setUpdatingSoftwareId(item.inventoryId);
    try {
      await agentsApi.updateSoftware(agentId, item.inventoryId, confirmUnapproved);
      setPendingUnapprovedUpdate(null);
      toast.success(`Atualização de "${item.name}" enviada ao agente.`);
      scheduleSoftwareRefetch();
    } catch (error) {
      if (!confirmUnapproved && error instanceof ApiError && error.status === 409) {
        setPendingUnapprovedUpdate(item);
        return;
      }
      const msg = error instanceof ApiError ? error.message : 'Falha ao solicitar atualização do aplicativo.';
      toast.error(msg);
    } finally {
      setUpdatingSoftwareId(null);
    }
  };

  const uninstallConfirmTarget = (pendingUninstall?.name ?? '').trim();
  const canConfirmUninstall =
    uninstallConfirmTarget !== '' && uninstallConfirmText.trim() === uninstallConfirmTarget;

  const openUninstallModal = (item: AgentSoftwareInventoryItem) => {
    setUninstallConfirmText('');
    setPendingUninstall(item);
  };

  const closeUninstallModal = () => {
    setPendingUninstall(null);
    setUninstallConfirmText('');
  };

  const handleUninstallSoftware = async (item: AgentSoftwareInventoryItem) => {
    if (!agentId || updatingSoftwareId) return;
    setUpdatingSoftwareId(item.inventoryId);
    try {
      await agentsApi.uninstallSoftware(agentId, item.inventoryId);
      closeUninstallModal();
      toast.success('Desinstalação de "' + item.name + '" enviada ao agente.');
      scheduleSoftwareRefetch();
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'Falha ao solicitar desinstalação do aplicativo.';
      toast.error(msg);
    } finally {
      setUpdatingSoftwareId(null);
    }
  };

  const softwareColumns = useMemo<Column<AgentSoftwareInventoryItem>[]>(
    () => [
      {
        key: 'name',
        header: 'Aplicativo',
        sortable: false,
        render: item => (
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium text-foreground" title={item.name}>
              {item.name}
            </span>
            {updatingSoftwareId === item.inventoryId && (
              <Icon name="refresh" className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" aria-label="Processando" />
            )}
          </div>
        ),
      },
      {
        key: 'version',
        header: 'Versão',
        className: 'font-mono whitespace-nowrap',
        sortable: false,
        render: item => (
          <div className="flex flex-wrap items-center gap-2">
            <span>{item.version ?? '\u2014'}</span>
            {item.updateAvailable && item.availableVersion && (
              <Badge color="warning">&rarr; {item.availableVersion}</Badge>
            )}
          </div>
        ),
      },
      {
        key: 'actions',
        header: '',
        className: 'text-right w-12',
        sortable: false,
        render: item => (
          <Button
            size="sm"
            variant="ghost"
            className="px-2"
            aria-label={`Ações para ${item.name}`}
            title="Mais ações"
            onClick={event => {
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              setSoftwareMenu({ x: rect.right - 200, y: rect.bottom + 4, item });
            }}
          >
            <Icon name="more_vert" className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    [updatingSoftwareId],
  );

  const softwareMenuItems: ContextMenuItem[] = softwareMenu
    ? [
        {
          key: 'details',
          label: 'Ver detalhes',
          icon: <Icon name="info" className="h-4 w-4" />,
          onClick: () => {
            const item = softwareMenu.item;
            setSoftwareMenu(null);
            setSoftwareDetails(item);
          },
        },
        {
          key: 'copy',
          label: 'Copiar nome',
          icon: <Icon name="content_copy" className="h-4 w-4" />,
          onClick: () => {
            const item = softwareMenu.item;
            setSoftwareMenu(null);
            void navigator.clipboard?.writeText(item.name);
            toast.success('Nome copiado.');
          },
        },
        ...(softwareMenu.item.updateAvailable
          ? [
              {
                key: 'update',
                label: 'Atualizar aplicativo',
                icon: <Icon name="arrow_circle_up" className="h-4 w-4" />,
                separatorBefore: true,
                disabled: !canExecute || updatingSoftwareId !== null,
                hint: !canExecute
                  ? 'sem permissão'
                  : !isOnline
                    ? OFFLINE_QUEUE_HINT
                    : undefined,
                onClick: () => {
                  const item = softwareMenu.item;
                  setSoftwareMenu(null);
                  void handleUpdateSoftware(item);
                },
              } satisfies ContextMenuItem,
            ]
          : []),
        ...(softwareMenu.item.uninstallAvailable
          ? [
              {
                key: 'uninstall',
                label: 'Desinstalar aplicativo',
                icon: <Icon name="delete" className="h-4 w-4" />,
                danger: true,
                disabled: !canExecute || updatingSoftwareId !== null,
                hint: !canExecute
                  ? 'sem permissão'
                  : !isOnline
                    ? OFFLINE_QUEUE_HINT
                    : undefined,
                onClick: () => {
                  const item = softwareMenu.item;
                  setSoftwareMenu(null);
                  openUninstallModal(item);
                },
              } satisfies ContextMenuItem,
            ]
          : []),
      ]
    : [];

  return (
    <>
      <div style={{ maxHeight: 'min(860px, 75vh)' }} className="w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-auto">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground sm:text-xl">Aplicativos</h3>
            <p className="text-sm text-muted">
              {softwareOnlyUpdates
                ? `${softwareTotalCount} aplicativo(s) com atualização pendente`
                : `${softwareTotalCount} aplicativo(s) no inventário`}
              {softwareUpdatesTotal > 0 && !softwareOnlyUpdates && (
                <span className="ml-2 font-medium text-warning">· {softwareUpdatesTotal} com atualização disponível</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => setInstallModalOpen(true)}
              title="Buscar aplicativo na loja para instalar no agente"
            >
              <Icon name="download" className="h-4 w-4" />
              Instalar aplicativo
            </Button>
            {softwareUpdatesTotal > 0 && (
              <Button
                size="sm"
                variant={softwareOnlyUpdates ? 'primary' : 'secondary'}
                onClick={handleToggleSoftwareOnlyUpdates}
                aria-pressed={softwareOnlyUpdates}
                title={
                  softwareOnlyUpdates
                    ? 'Mostrando apenas aplicativos com atualização pendente'
                    : 'Mostrar apenas aplicativos com atualização pendente'
                }
              >
                <Icon name="arrow_circle_up" className="h-4 w-4" />
                Com atualização
                <span className="ml-1 rounded-full bg-black/10 px-1.5 text-xs">{softwareUpdatesTotal}</span>
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRefreshSoftware}
              loading={isRefreshingSoftware}
              title={
                !isOnline
                  ? 'Agente offline — o pedido de coleta entra na fila e roda quando ele reconectar'
                  : 'Solicitar nova coleta de software ao agente'
              }
            >
              <Icon name="refresh" className="h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </div>
        {software.isLoading ? (
          <Loading message="Carregando inventário de aplicativos..." />
        ) : software.isError ? (
          <ErrorDisplay onRetry={() => software.refetch()} />
        ) : (
          <>
            {softwareSnapshot.data?.updatedAt && (
              <div className="mb-3 flex items-center justify-end gap-2 text-xs text-muted">
                <Icon name="schedule" className="h-3.5 w-3.5" />
                <span>Última coleta: <span className="text-muted-foreground">{formatDate(softwareSnapshot.data.updatedAt)}</span></span>
              </div>
            )}

            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg bg-surface-light px-3 py-2">
                <p className="text-xs text-muted">Total instalado</p>
                <p className="text-sm font-medium text-foreground">{softwareTotalCount}</p>
              </div>
              <div className="rounded-lg bg-surface-light px-3 py-2">
                <p className="text-xs text-muted">Última coleta</p>
                <p className="text-sm text-muted-foreground">{formatDate(softwareSnapshot.data?.lastCollectedAt ?? null)}</p>
              </div>
            </div>

            <form className="mb-4 grid gap-3 lg:grid-cols-[1fr_200px_160px_auto_auto]" onSubmit={handleApplySoftwareFilters}>
              <div className="relative">
                <Input
                  value={softwareSearchInput}
                  onChange={e => setSoftwareSearchInput(e.target.value)}
                  placeholder="Pesquisar por nome, versão, fabricante, installId, serial ou fonte"
                />
                {softwareSearchInput && (
                  <button
                    type="button"
                    onClick={handleClearSoftwareSearch}
                    aria-label="Limpar busca de aplicativos"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:bg-surface-hover hover:text-foreground"
                  >
                    <Icon name="close" className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <Select
                value={softwareOrder}
                options={SOFTWARE_ORDER_OPTIONS}
                onChange={e => handleSoftwareOrderChange(e.target.value as 'asc' | 'desc')}
              />
              <Select
                value={softwareLimitSelected}
                options={PAGE_SIZE_OPTIONS}
                onChange={e => handleSoftwareLimitChange(e.target.value)}
              />
              <Button type="submit" variant="secondary" size="sm">
                <Icon name="search" className="h-4 w-4" />
                Buscar
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleClearSoftwareSearch}>
                Limpar
              </Button>
            </form>

            <div style={{ minHeight: '400px' }} className="relative">
              <DataTable
                columns={softwareColumns}
                data={softwareItems}
                keyExtractor={item => item.inventoryId}
                onRowContextMenu={(event, item) => {
                  event.preventDefault();
                  setSoftwareMenu({ x: event.clientX, y: event.clientY, item });
                }}
                emptyMessage={
                  softwareOnlyUpdates
                    ? 'Nenhum aplicativo com atualização pendente'
                    : 'Nenhum aplicativo encontrado para este agente'
                }
                showPagination={false}
                maxHeight="min(640px, 55vh)"
              />
            </div>
            {softwareItems.length > 0 && (
              <Pagination
                className="mt-4"
                page={safeSoftwarePage}
                totalPages={softwareTotalPages}
                onPageChange={setSoftwarePage}
                totalItems={softwareTotalCount}
                pageSize={softwarePageSize}
              />
            )}
          </>
        )}
      </div>

      <Modal
        open={!!pendingUnapprovedUpdate}
        onClose={() => setPendingUnapprovedUpdate(null)}
        title="Atualização não aprovada na loja"
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
            <p>
              O aplicativo{' '}
              <span className="font-semibold text-foreground">{pendingUnapprovedUpdate?.name}</span>{' '}
              não está aprovado na política da loja para este agente.
            </p>
            <p className="mt-1 text-muted">
              Deseja executar a atualização mesmo assim? A ação será registrada no histórico de comandos do agente.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setPendingUnapprovedUpdate(null)}
              disabled={updatingSoftwareId !== null}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (pendingUnapprovedUpdate) {
                  void handleUpdateSoftware(pendingUnapprovedUpdate, true);
                }
              }}
              loading={updatingSoftwareId !== null && updatingSoftwareId === pendingUnapprovedUpdate?.inventoryId}
            >
              <Icon name="arrow_circle_up" className="h-4 w-4" />
              Atualizar mesmo assim
            </Button>
          </div>
        </div>
      </Modal>

      {installModalOpen && agentId && (
        <AgentAppInstallModal
          agentId={agentId}
          open={installModalOpen}
          onClose={() => setInstallModalOpen(false)}
          onInstalled={scheduleSoftwareRefetch}
        />
      )}

      <Modal
        open={!!pendingUninstall}
        onClose={closeUninstallModal}
        title="Desinstalar aplicativo"
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-foreground">
            <p>
              Você está prestes a desinstalar{' '}
              <span className="font-semibold text-foreground">{pendingUninstall?.name}</span>
              {pendingUninstall?.version ? ' (v' + pendingUninstall.version + ')' : ''} do agente{' '}
              <span className="font-semibold text-foreground">{agentName}</span>.
            </p>
            <p className="mt-1 text-muted">
              O agent tentará pelo gerenciador de pacotes (winget/choco), pelo MSI (ProductCode) ou pelo
              desinstalador do registro. A ação não pode ser desfeita no host.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="uninstall-confirm-name" className="text-sm font-medium text-foreground">
              Digite <span className="font-semibold text-danger">{uninstallConfirmTarget}</span> para confirmar:
            </label>
            <Input
              id="uninstall-confirm-name"
              value={uninstallConfirmText}
              onChange={e => setUninstallConfirmText(e.target.value)}
              placeholder={uninstallConfirmTarget}
              disabled={updatingSoftwareId !== null}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={closeUninstallModal}
              disabled={updatingSoftwareId !== null}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (pendingUninstall) {
                  void handleUninstallSoftware(pendingUninstall);
                }
              }}
              loading={updatingSoftwareId !== null && updatingSoftwareId === pendingUninstall?.inventoryId}
              disabled={!canConfirmUninstall || updatingSoftwareId !== null}
              title={
                canConfirmUninstall
                  ? 'Desinstalar ' + uninstallConfirmTarget
                  : 'Digite o nome do aplicativo para liberar a desinstalação'
              }
            >
              <Icon name="delete" className="h-4 w-4" />
              Desinstalar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!softwareDetails}
        onClose={() => setSoftwareDetails(null)}
        title="Detalhes do aplicativo"
        maxWidth="max-w-lg"
      >
        {softwareDetails && (
          <div className="space-y-4">
            <div>
              <p className="font-medium text-foreground">{softwareDetails.name}</p>
              <p className="text-sm text-muted">{softwareDetails.publisher ?? 'Sem fabricante'}</p>
            </div>

            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">Versão instalada</dt>
                <dd className="font-mono text-foreground">{softwareDetails.version ?? '\u2014'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Versão disponível</dt>
                <dd className="font-mono text-foreground">
                  {softwareDetails.updateAvailable && softwareDetails.availableVersion ? (
                    <span className="text-warning">&rarr; {softwareDetails.availableVersion}</span>
                  ) : (
                    '\u2014'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Fonte</dt>
                <dd className="text-foreground">{softwareDetails.source ?? '\u2014'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Gerenciador</dt>
                <dd className="text-foreground">{softwareDetails.updateSource ?? '\u2014'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Última coleta</dt>
                <dd className="text-foreground">{formatDate(softwareDetails.collectedAt)}</dd>
              </div>
              {softwareDetails.installSource && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted">Origem da instalação</dt>
                  <dd className="break-all font-mono text-xs text-muted-foreground">{softwareDetails.installSource}</dd>
                </div>
              )}
            </dl>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSoftwareDetails(null)}>
                Fechar
              </Button>
              {softwareDetails.updateAvailable && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    const item = softwareDetails;
                    setSoftwareDetails(null);
                    void handleUpdateSoftware(item);
                  }}
                  disabled={!canExecute || updatingSoftwareId !== null}
                >
                  <Icon name="arrow_circle_up" className="h-4 w-4" />
                  Atualizar
                </Button>
              )}
              {softwareDetails.uninstallAvailable && (
                <Button
                  variant="danger"
                  onClick={() => {
                    const item = softwareDetails;
                    setSoftwareDetails(null);
                    openUninstallModal(item);
                  }}
                  disabled={!canExecute || updatingSoftwareId !== null}
                >
                  <Icon name="delete" className="h-4 w-4" />
                  Desinstalar
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {softwareMenu && (
        <ContextMenu
          position={{ x: softwareMenu.x, y: softwareMenu.y }}
          items={softwareMenuItems}
          onClose={() => setSoftwareMenu(null)}
        />
      )}
    </>
  );
}
