import { useCallback, useMemo, useState, type MouseEvent } from 'react';
import {
  Ban,
  Copy,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Button, DataTable, EmptyState, Input, Loading, Modal, Select, type Column } from '@/components/ui';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu';
import type { StartupItemActionRequest, StartupItemInfo } from '@/api';
import { ApiError } from '@/api';
import { useAgentStartupItemAction } from '@/hooks/useAgents';
import {
  awaitAgentCommandResult,
  startupItemStatusColor,
  startupItemStatusLabel,
  startupItemUserLabel,
} from '@/pages/agents/agentDetailUtils';

const typeLabels: Record<string, string> = {
  registry: 'Registro',
  folder: 'Atalho',
  service: 'Serviço',
};

const sourceFilters = [
  { value: 'all', label: 'Todas as origens' },
  { value: 'registry', label: 'Registro (Run/RunOnce)' },
  { value: 'folder', label: 'Pastas Startup' },
  { value: 'service', label: 'Serviços automáticos' },
  { value: 'status-disabled', label: 'Somente desabilitados' },
];

interface AgentStartupItemsPanelProps {
  agentId: string;
  items: StartupItemInfo[];
  canManage: boolean;
  isOnline: boolean;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  isRefreshing: boolean;
  onRefresh: () => void;
  /** Recarrega os componentes após o agent concluir a ação (evita estado defasado). */
  onDataRefetch?: () => void;
}

interface MenuState {
  x: number;
  y: number;
  item: StartupItemInfo;
}

interface ConfirmState {
  item: StartupItemInfo;
  enable: boolean;
}

export default function AgentStartupItemsPanel({
  agentId,
  items,
  canManage,
  isOnline,
  isLoading,
  isError,
  onRetry,
  isRefreshing,
  onRefresh,
  onDataRefetch,
}: AgentStartupItemsPanelProps) {
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [isConfirmWorking, setIsConfirmWorking] = useState(false);

  const startupAction = useAgentStartupItemAction(agentId);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (sourceFilter === 'status-disabled') {
        if (item.status?.toLowerCase() !== 'disabled') return false;
      } else if (sourceFilter !== 'all' && item.type !== sourceFilter) {
        return false;
      }
      if (!query) return true;
      return (
        item.name?.toLowerCase().includes(query) ||
        item.path?.toLowerCase().includes(query) ||
        item.source?.toLowerCase().includes(query) ||
        item.detail?.toLowerCase().includes(query)
      );
    });
  }, [items, search, sourceFilter]);

  const openMenu = useCallback(
    (event: MouseEvent<HTMLTableRowElement>, item: StartupItemInfo) => {
      event.preventDefault();
      setMenu({ x: event.clientX, y: event.clientY, item });
    },
    [],
  );

  const requestToggle = useCallback(
    (item: StartupItemInfo) => {
      const enable = item.status?.toLowerCase() === 'disabled';
      setMenu(null);
      setConfirmState({ item, enable });
    },
    [],
  );

  const confirmToggle = useCallback(async () => {
    if (!confirmState) return;
    const { item, enable } = confirmState;
    setIsConfirmWorking(true);
    const dispatchedAt = new Date();
    try {
      const request: StartupItemActionRequest = {
        action: enable ? 'enable' : 'disable',
        type: item.type,
        name: item.name,
        source: item.source,
        hive: item.hive ?? null,
      };
      await startupAction.mutateAsync(request);
      toast.success(
        enable
          ? 'Solicitação de habilitação enviada ao agent.'
          : 'Solicitação de desabilitação enviada ao agent.',
      );
      setConfirmState(null);
      const outcome = await awaitAgentCommandResult(agentId, 'StartupItem', dispatchedAt);
      if (outcome.ok) {
        toast.success(outcome.message);
      } else {
        toast.error(outcome.message);
      }
      // O agent já re-sincronizou — recarrega para refletir o novo estado.
      onDataRefetch?.();
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Falha ao enviar ação ao agent.';
      toast.error(message);
    } finally {
      setIsConfirmWorking(false);
    }
  }, [agentId, confirmState, startupAction, onDataRefetch]);

  const copyPath = useCallback(
    (item: StartupItemInfo) => {
      setMenu(null);
      void navigator.clipboard?.writeText(item.path || item.name);
      toast.success('Caminho copiado.');
    },
    [],
  );

  const menuItems: ContextMenuItem[] = menu
    ? [
        {
          key: 'toggle',
          label:
            menu.item.status?.toLowerCase() === 'disabled'
              ? 'Habilitar na inicialização'
              : 'Desabilitar na inicialização',
          icon:
            menu.item.status?.toLowerCase() === 'disabled' ? (
              <Play className='h-4 w-4' />
            ) : (
              <Ban className='h-4 w-4' />
            ),
          disabled: !canManage || !isOnline,
          hint: !isOnline ? 'offline' : undefined,
          onClick: () => requestToggle(menu.item),
        },
        {
          key: 'copy',
          label: 'Copiar caminho',
          icon: <Copy className='h-4 w-4' />,
          onClick: () => copyPath(menu.item),
          separatorBefore: true,
        },
      ]
    : [];

  const columns: Column<StartupItemInfo>[] = [
    {
      key: 'name',
      header: 'Item',
      width: '30%',
      render: (item) => (
        <div className='min-w-0'>
          <p className='truncate font-medium text-foreground' title={item.name}>
            {item.name}
          </p>
          <p className='truncate text-xs text-muted' title={item.path}>
            {item.path || '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Tipo',
      width: '11%',
      className: 'whitespace-nowrap',
      render: (item) => typeLabels[item.type] ?? item.type,
    },
    {
      key: 'source',
      header: 'Origem',
      width: '22%',
      render: (item) => (
        <span className='block truncate' title={item.source || undefined}>
          {item.source || '—'}
        </span>
      ),
    },
    {
      key: 'username',
      header: 'Usuário',
      width: '13%',
      className: 'hidden whitespace-nowrap lg:table-cell',
      render: (item) => (
        <span className='text-xs text-muted-foreground' title={item.hive ?? undefined}>
          {startupItemUserLabel(item)}
        </span>
      ),
    },
    {
      key: 'detail',
      header: 'Detalhe',
      width: '12%',
      className: 'hidden xl:table-cell',
      render: (item) => (
        <span className='block truncate' title={item.detail || undefined}>
          {item.detail || '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      width: '12%',
      className: 'whitespace-nowrap',
      render: (item) => (
        <Badge color={startupItemStatusColor(item.status)}>
          {startupItemStatusLabel(item.status)}
        </Badge>
      ),
    },
  ];

  const disabledCount = items.filter(
    (item) => item.status?.toLowerCase() === 'disabled',
  ).length;

  return (
    <div>
      <div className='mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h3 className='text-lg font-semibold text-foreground sm:text-xl'>
            Inicialização do Windows
          </h3>
          <p className='text-sm text-muted'>
            {items.length} item(s) — {disabledCount} desabilitado(s) · registro, pastas Startup e serviços automáticos
          </p>
        </div>
        <Button
          size='sm'
          variant='ghost'
          onClick={onRefresh}
          loading={isRefreshing}
          disabled={!isOnline}
          title={!isOnline ? 'Agente offline — refresh indisponível' : 'Solicitar nova coleta ao agent'}
        >
          <RefreshCw className='h-4 w-4' />
          Atualizar
        </Button>
      </div>

      {!canManage && (
        <p className='mb-3 flex items-center gap-2 rounded-lg border border-border bg-surface-light px-3 py-2 text-xs text-muted'>
          <ShieldAlert className='h-3.5 w-3.5 shrink-0' />
          Você possui permissão somente leitura — o menu de contexto fica desabilitado.
        </p>
      )}

      <div className='mb-4 grid gap-2 sm:grid-cols-[1fr_240px]'>
        <div className='relative'>
          <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted' />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='Pesquisar por nome, caminho ou origem'
            className='pl-9'
          />
        </div>
        <Select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          options={sourceFilters}
        />
      </div>

      {isLoading ? (
        <Loading message='Carregando itens de inicialização...' />
      ) : isError ? (
        <EmptyState
          title='Não foi possível carregar os itens'
          description='Tente atualizar os dados.'
          action={{ label: 'Tentar novamente', onClick: onRetry }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title='Nenhum item encontrado'
          description='Nenhum item de inicialização coletado para este agent com os filtros atuais.'
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={(item) =>
            [item.type, item.source, item.name, item.username ?? ''].join('|')
          }
          onRowContextMenu={openMenu}
          showPagination={false}
          emptyMessage='Nenhum item de inicialização encontrado'
          maxHeight='min(560px, 52vh)'
          fixedLayout
        />
      )}

      {menu && (
        <ContextMenu position={{ x: menu.x, y: menu.y }} items={menuItems} onClose={() => setMenu(null)} />
      )}

      <Modal
        open={confirmState !== null}
        onClose={() => {
          if (!isConfirmWorking) setConfirmState(null);
        }}
        title={confirmState?.enable ? 'Habilitar item de inicialização' : 'Desabilitar item de inicialização'}
      >
        {confirmState && (
          <div className='space-y-4'>
            <p className='text-sm text-muted'>
              {confirmState.enable
                ? 'O item voltará a executar automaticamente na inicialização do Windows.'
                : 'O item deixará de executar automaticamente na inicialização do Windows (mesmo mecanismo do Gerenciador de Tarefas).'}
            </p>
            <div className='rounded-lg bg-surface-light px-3 py-2 text-sm'>
              <p className='font-medium text-foreground'>{confirmState.item.name}</p>
              <p className='mt-1 truncate text-xs text-muted' title={confirmState.item.path}>
                {confirmState.item.path || confirmState.item.source}
              </p>
              <p className='mt-1 text-xs text-muted'>
                Origem: {confirmState.item.source}
                {confirmState.item.type === 'service'
                  ? ' · altera o modo de inicialização do serviço'
                  : ''}
              </p>
            </div>
            <div className='flex justify-end gap-2'>
              <Button variant='ghost' size='sm' disabled={isConfirmWorking} onClick={() => setConfirmState(null)}>
                Cancelar
              </Button>
              <Button
                variant={confirmState.enable ? 'primary' : 'danger'}
                size='sm'
                loading={isConfirmWorking}
                onClick={confirmToggle}
              >
                Confirmar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}