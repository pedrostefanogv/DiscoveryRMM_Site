import { useCallback, useMemo, useState, type MouseEvent } from 'react';
import {
  Ban,
  CalendarClock,
  Clock,
  Copy,
  Pencil,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Input,
  Loading,
  Modal,
  Select,
  type Column,
} from '@/components/ui';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu';
import type { ScheduledTaskActionRequest, ScheduledTaskInfo } from '@/api';
import { ApiError } from '@/api';
import { useAgentScheduledTaskAction } from '@/hooks/useAgents';
import {
  awaitAgentCommandResult,
  normalizeScheduledTaskTriggerDesc,
  scheduledTaskStateColor,
  scheduledTaskTriggerLabel,
} from '@/pages/agents/agentDetailUtils';

const weekDayOptions = [
  { value: '0', label: 'Domingo' },
  { value: '1', label: 'Segunda' },
  { value: '2', label: 'Terça' },
  { value: '3', label: 'Quarta' },
  { value: '4', label: 'Quinta' },
  { value: '5', label: 'Sexta' },
  { value: '6', label: 'Sábado' },
];

const triggerTypeOptions = [
  { value: 'daily', label: 'Diário' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'once', label: 'Uma vez (data e hora)' },
  { value: 'logon', label: 'Ao fazer logon' },
  { value: 'boot', label: 'Na inicialização do sistema' },
];

const EDITABLE_TRIGGERS = new Set(['daily', 'weekly', 'once', 'logon', 'boot']);

const statusFilters = [
  { value: 'all', label: 'Todas as tarefas' },
  { value: 'enabled', label: 'Somente habilitadas' },
  { value: 'disabled', label: 'Somente desabilitadas' },
  { value: 'logon', label: 'Disparo no logon' },
  { value: 'boot', label: 'Disparo na inicialização' },
];

interface AgentScheduledTasksPanelProps {
  agentId: string;
  tasks: ScheduledTaskInfo[];
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
  task: ScheduledTaskInfo;
}

interface EditState {
  task: ScheduledTaskInfo;
}

interface ConfirmState {
  task: ScheduledTaskInfo;
  action: 'enable' | 'disable' | 'delete';
}

export default function AgentScheduledTasksPanel({
  agentId,
  tasks,
  canManage,
  isOnline,
  isLoading,
  isError,
  onRetry,
  isRefreshing,
  onRefresh,
  onDataRefetch,
}: AgentScheduledTasksPanelProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [isConfirmWorking, setIsConfirmWorking] = useState(false);

  // ── Campos do modal de edição ──
  const [editTriggerType, setEditTriggerType] = useState('daily');
  const [editTime, setEditTime] = useState('08:00');
  const [editDate, setEditDate] = useState('');
  const [editDays, setEditDays] = useState<number[]>([1]);
  const [editDaysInterval, setEditDaysInterval] = useState(1);
  const [editActionPath, setEditActionPath] = useState('');
  const [editActionArgs, setEditActionArgs] = useState('');
  const [isEditWorking, setIsEditWorking] = useState(false);

  const taskAction = useAgentScheduledTaskAction(agentId);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (statusFilter === 'enabled' || statusFilter === 'disabled') {
        if (task.state?.toLowerCase() !== statusFilter) return false;
      } else if (statusFilter === 'logon' || statusFilter === 'boot') {
        if (task.triggerType?.toLowerCase() !== statusFilter) return false;
      }
      if (!query) return true;
      return (
        task.taskName?.toLowerCase().includes(query) ||
        task.taskPath?.toLowerCase().includes(query) ||
        task.actionPath?.toLowerCase().includes(query) ||
        task.triggerDesc?.toLowerCase().includes(query)
      );
    });
  }, [tasks, search, statusFilter]);

  const openMenu = useCallback(
    (event: MouseEvent<HTMLTableRowElement>, task: ScheduledTaskInfo) => {
      event.preventDefault();
      setMenu({ x: event.clientX, y: event.clientY, task });
    },
    [],
  );

  const dispatchAndAwait = useCallback(
    async (
      request: ScheduledTaskActionRequest,
      sentMessage: string,
      commandLabel: 'ScheduledTask',
    ) => {
      const dispatchedAt = new Date();
      await taskAction.mutateAsync(request);
      toast.success(sentMessage);
      const outcome = await awaitAgentCommandResult(agentId, commandLabel, dispatchedAt);
      if (outcome.ok) {
        toast.success(outcome.message);
      } else {
        toast.error(outcome.message);
      }
      // O agent já re-sincronizou — recarrega para refletir o novo estado.
      onDataRefetch?.();
    },
    [agentId, taskAction, onDataRefetch],
  );

  const confirmAction = useCallback(async () => {
    if (!confirmState) return;
    const { task, action } = confirmState;
    setIsConfirmWorking(true);
    setMenu(null);
    try {
      const messages: Record<ConfirmState['action'], string> = {
        enable: 'Solicitação de habilitação enviada ao agent.',
        disable: 'Solicitação de desabilitação enviada ao agent.',
        delete: 'Solicitação de exclusão enviada ao agent.',
      };
      await dispatchAndAwait(
        { action, taskName: task.taskName, taskPath: task.taskPath },
        messages[action],
        'ScheduledTask',
      );
      setConfirmState(null);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Falha ao enviar ação ao agent.';
      toast.error(message);
    } finally {
      setIsConfirmWorking(false);
    }
  }, [confirmState, dispatchAndAwait]);

  const runNow = useCallback(
    async (task: ScheduledTaskInfo) => {
      setMenu(null);
      try {
        await dispatchAndAwait(
          { action: 'run', taskName: task.taskName, taskPath: task.taskPath },
          'Solicitação de execução imediata enviada ao agent.',
          'ScheduledTask',
        );
      } catch (error) {
        const message =
          error instanceof ApiError ? error.message : 'Falha ao enviar ação ao agent.';
        toast.error(message);
      }
    },
    [dispatchAndAwait],
  );

  const openEdit = useCallback(
    (task: ScheduledTaskInfo) => {
      setMenu(null);
      setEditTriggerType(
        EDITABLE_TRIGGERS.has(task.triggerType?.toLowerCase() ?? '')
          ? task.triggerType.toLowerCase()
          : 'daily',
      );
      setEditTime('08:00');
      setEditDate('');
      setEditDays([1]);
      setEditDaysInterval(1);
      setEditActionPath(task.actionPath ?? '');
      setEditActionArgs(task.actionArgs ?? '');
      setEditState({ task });
    },
    [],
  );

  const submitEdit = useCallback(async () => {
    if (!editState) return;
    const { task } = editState;
    setIsEditWorking(true);
    try {
      let time: string | null = null;
      if (editTriggerType === 'once') {
        if (!editDate) {
          toast.error('Informe a data e a hora do gatilho.');
          return;
        }
        time = editDate.replace('T', ' ');
      } else if (editTriggerType === 'daily' || editTriggerType === 'weekly') {
        if (!editTime) {
          toast.error('Informe o horário do gatilho.');
          return;
        }
        time = editTime;
      }

      // A ação só é reenviada se o usuário realmente alterou o valor — o
      // caminho coletado costuma vir com aspas e não deve ser reescrito à toa.
      const originalPath = (task.actionPath ?? '').trim();
      const originalArgs = (task.actionArgs ?? '').trim();
      const nextPath = editActionPath.trim();
      const nextArgs = editActionArgs.trim();

      const request: ScheduledTaskActionRequest = {
        action: 'edit',
        taskName: task.taskName,
        taskPath: task.taskPath,
        edit: {
          triggerType: editTriggerType as 'daily' | 'weekly' | 'once' | 'logon' | 'boot',
          time,
          daysOfWeek: editTriggerType === 'weekly' ? editDays : null,
          daysInterval: editTriggerType === 'daily' ? editDaysInterval : null,
          actionPath: nextPath && nextPath !== originalPath ? nextPath : null,
          actionArgs: nextArgs && nextArgs !== originalArgs ? nextArgs : null,
        },
      };
      await dispatchAndAwait(
        request,
        'Solicitação de edição enviada ao agent.',
        'ScheduledTask',
      );
      setEditState(null);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Falha ao enviar edição ao agent.';
      toast.error(message);
    } finally {
      setIsEditWorking(false);
    }
  }, [
    agentId,
    dispatchAndAwait,
    editActionArgs,
    editActionPath,
    editDate,
    editDays,
    editDaysInterval,
    editState,
    editTime,
    editTriggerType,
    taskAction,
  ]);

  const copyTaskId = useCallback((task: ScheduledTaskInfo) => {
    setMenu(null);
    void navigator.clipboard?.writeText((task.taskPath || '') + task.taskName);
    toast.success('Caminho da tarefa copiado.');
  }, []);

  const menuItems: ContextMenuItem[] = menu
    ? [
        {
          key: 'toggle',
          label:
            menu.task.state?.toLowerCase() === 'disabled'
              ? 'Habilitar tarefa'
              : 'Desabilitar tarefa',
          icon:
            menu.task.state?.toLowerCase() === 'disabled' ? (
              <Play className='h-4 w-4' />
            ) : (
              <Ban className='h-4 w-4' />
            ),
          disabled: !canManage || !isOnline,
          hint: !isOnline ? 'offline' : undefined,
          onClick: () => {
            const enable = menu.task.state?.toLowerCase() === 'disabled';
            setMenu(null);
            setConfirmState({ task: menu.task, action: enable ? 'enable' : 'disable' });
          },
        },
        {
          key: 'run',
          label: 'Executar agora',
          icon: <Zap className='h-4 w-4' />,
          disabled: !canManage || !isOnline,
          onClick: () => runNow(menu.task),
        },
        {
          key: 'edit',
          label: 'Editar gatilho/ação',
          icon: <Pencil className='h-4 w-4' />,
          disabled: !canManage || !isOnline,
          separatorBefore: true,
          onClick: () => openEdit(menu.task),
        },
        {
          key: 'copy',
          label: 'Copiar caminho da tarefa',
          icon: <Copy className='h-4 w-4' />,
          onClick: () => copyTaskId(menu.task),
        },
        {
          key: 'delete',
          label: 'Excluir tarefa',
          icon: <Trash2 className='h-4 w-4' />,
          danger: true,
          disabled: !canManage || !isOnline,
          separatorBefore: true,
          onClick: () => {
            setMenu(null);
            setConfirmState({ task: menu.task, action: 'delete' });
          },
        },
      ]
    : [];

  const columns: Column<ScheduledTaskInfo>[] = [
    {
      key: 'taskName',
      header: 'Tarefa',
      width: '24%',
      render: (task) => (
        <div className='min-w-0'>
          <p className='truncate font-medium text-foreground' title={task.taskName}>
            {task.taskName}
          </p>
          <p className='truncate text-xs text-muted' title={(task.taskPath || '') + task.taskName}>
            {task.taskPath || '\\'}{task.taskName}
          </p>
        </div>
      ),
    },
    {
      key: 'state',
      header: 'Estado',
      width: '12%',
      className: 'whitespace-nowrap',
      render: (task) => (
        <Badge color={scheduledTaskStateColor(task.state)}>
          {task.state?.toLowerCase() === 'disabled' ? 'Desabilitada' : 'Habilitada'}
        </Badge>
      ),
    },
    {
      key: 'trigger',
      header: 'Gatilho',
      width: '22%',
      render: (task) => {
        const label =
          normalizeScheduledTaskTriggerDesc(task.triggerDesc) ||
          scheduledTaskTriggerLabel(task.triggerType);
        return (
          <span className='block truncate' title={label}>
            {label}
          </span>
        );
      },
    },
    {
      key: 'nextRunTime',
      header: 'Próxima execução',
      width: '16%',
      className: 'hidden whitespace-nowrap lg:table-cell',
      render: (task) => (task.nextRunTime ? new Date(task.nextRunTime).toLocaleString('pt-BR') : '—'),
    },
    {
      key: 'lastRunTime',
      header: 'Última execução',
      width: '12%',
      className: 'hidden whitespace-nowrap xl:table-cell',
      render: (task) => (task.lastRunTime ? new Date(task.lastRunTime).toLocaleString('pt-BR') : '—'),
    },
    {
      key: 'actionPath',
      header: 'Executa',
      width: '14%',
      className: 'hidden xl:table-cell',
      render: (task) => (
        <span className='block truncate font-mono text-xs text-muted-foreground' title={(task.actionPath || '') + ' ' + (task.actionArgs || '')}>
          {task.actionPath || '—'}
        </span>
      ),
    },
  ];

  const confirmTitles: Record<ConfirmState['action'], string> = {
    enable: 'Habilitar tarefa agendada',
    disable: 'Desabilitar tarefa agendada',
    delete: 'Excluir tarefa agendada',
  };

  const confirmDescriptions: Record<ConfirmState['action'], string> = {
    enable: 'A tarefa voltará a ser executada automaticamente pelo Agendador de Tarefas do Windows.',
    disable: 'A tarefa deixará de ser executada automaticamente (a definição é preservada).',
    delete: 'A tarefa será REMOVIDA do Agendador de Tarefas do Windows. Esta ação é irreversível.',
  };

  const disabledCount = tasks.filter(
    (task) => task.state?.toLowerCase() === 'disabled',
  ).length;

  return (
    <div>
      <div className='mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h3 className='text-lg font-semibold text-foreground sm:text-xl'>
            Tarefas Agendadas
          </h3>
          <p className='text-sm text-muted'>
            {tasks.length} tarefa(s) — {disabledCount} desabilitada(s) · Agendador de Tarefas do Windows
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
            placeholder='Pesquisar por nome, caminho ou gatilho'
            className='pl-9'
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={statusFilters}
        />
      </div>

      {isLoading ? (
        <Loading message='Carregando tarefas agendadas...' />
      ) : isError ? (
        <EmptyState
          title='Não foi possível carregar as tarefas'
          description='Tente atualizar os dados.'
          action={{ label: 'Tentar novamente', onClick: onRetry }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title='Nenhuma tarefa encontrada'
          description='Nenhuma tarefa agendada coletada para este agent com os filtros atuais.'
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={(task) => (task.taskPath || '') + task.taskName}
          onRowContextMenu={openMenu}
          showPagination={false}
          emptyMessage='Nenhuma tarefa agendada encontrada'
          maxHeight='min(560px, 52vh)'
          fixedLayout
        />
      )}

      {menu && (
        <ContextMenu position={{ x: menu.x, y: menu.y }} items={menuItems} onClose={() => setMenu(null)} />
      )}

      {/* Confirmação de habilitar/desabilitar/excluir */}
      <Modal
        open={confirmState !== null}
        onClose={() => {
          if (!isConfirmWorking) setConfirmState(null);
        }}
        title={confirmState ? confirmTitles[confirmState.action] : ''}
      >
        {confirmState && (
          <div className='space-y-4'>
            <p className='text-sm text-muted'>
              {confirmDescriptions[confirmState.action]}
            </p>
            <div className='rounded-lg bg-surface-light px-3 py-2 text-sm'>
              <p className='font-medium text-foreground'>{confirmState.task.taskName}</p>
              <p className='mt-1 truncate text-xs text-muted'>
                {confirmState.task.taskPath || '\\'}{confirmState.task.taskName}
              </p>
            </div>
            <div className='flex justify-end gap-2'>
              <Button variant='ghost' size='sm' disabled={isConfirmWorking} onClick={() => setConfirmState(null)}>
                Cancelar
              </Button>
              <Button
                variant={confirmState.action === 'delete' ? 'danger' : confirmState.action === 'enable' ? 'primary' : 'secondary'}
                size='sm'
                loading={isConfirmWorking}
                onClick={confirmAction}
              >
                Confirmar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edição de gatilho/ação */}
      <Modal
        open={editState !== null}
        onClose={() => {
          if (!isEditWorking) setEditState(null);
        }}
        title='Editar tarefa agendada'
        maxWidth='max-w-xl'
      >
        {editState && (
          <div className='space-y-4'>
            <div className='rounded-lg bg-surface-light px-3 py-2 text-sm'>
              <p className='font-medium text-foreground'>{editState.task.taskName}</p>
              <p className='mt-1 text-xs text-muted'>
                Gatilho atual:{' '}
                {normalizeScheduledTaskTriggerDesc(editState.task.triggerDesc) ||
                  scheduledTaskTriggerLabel(editState.task.triggerType)}
              </p>
            </div>

            <div className='grid gap-3 sm:grid-cols-2'>
              <Select
                label='Tipo de gatilho'
                value={editTriggerType}
                onChange={(e) => setEditTriggerType(e.target.value)}
                options={triggerTypeOptions}
              />
              {(editTriggerType === 'daily' || editTriggerType === 'weekly') && (
                <Input
                  label='Horário'
                  type='time'
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                />
              )}
              {editTriggerType === 'once' && (
                <Input
                  label='Data e hora'
                  type='datetime-local'
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              )}
              {editTriggerType === 'daily' && (
                <Input
                  label='Repetir a cada (dias)'
                  type='number'
                  min={1}
                  value={String(editDaysInterval)}
                  onChange={(e) => setEditDaysInterval(Math.max(1, Number(e.target.value) || 1))}
                />
              )}
            </div>

            {editTriggerType === 'weekly' && (
              <div>
                <p className='mb-1 text-sm font-medium text-muted-foreground'>Dias da semana</p>
                <div className='flex flex-wrap gap-1.5'>
                  {weekDayOptions.map((day) => {
                    const dayValue = Number(day.value);
                    const selected = editDays.includes(dayValue);
                    return (
                      <button
                        key={day.value}
                        type='button'
                        onClick={() =>
                          setEditDays((prev) =>
                            prev.includes(dayValue)
                              ? prev.filter((d) => d !== dayValue)
                              : [...prev, dayValue].sort((a, b) => a - b),
                          )
                        }
                        className={selected
                          ? 'rounded-lg border border-primary/50 bg-primary/15 px-2.5 py-1 text-xs text-primary'
                          : 'rounded-lg border border-border bg-surface-light px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground'}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <details className='rounded-lg border border-border px-3 py-2'>
              <summary className='cursor-pointer text-sm text-muted-foreground'>
                O que a tarefa executa (opcional)
              </summary>
              <div className='mt-2 grid gap-3'>
                <Input
                  label='Programa (caminho do executável)'
                  value={editActionPath}
                  onChange={(e) => setEditActionPath(e.target.value)}
                  placeholder='Deixe vazio para manter o atual'
                />
                <Input
                  label='Argumentos'
                  value={editActionArgs}
                  onChange={(e) => setEditActionArgs(e.target.value)}
                  placeholder='Deixe vazio para manter os atuais'
                />
              </div>
            </details>

            <p className='flex items-start gap-2 text-xs text-muted'>
              <CalendarClock className='mt-0.5 h-3.5 w-3.5 shrink-0' />
              A edição substitui o gatilho principal da tarefa no agent via PowerShell (Set-ScheduledTask).
            </p>

            <div className='flex justify-end gap-2'>
              <Button variant='ghost' size='sm' disabled={isEditWorking} onClick={() => setEditState(null)}>
                Cancelar
              </Button>
              <Button variant='primary' size='sm' loading={isEditWorking} onClick={submitEdit}>
                Salvar alterações
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <p className='mt-3 flex items-center gap-2 text-xs text-muted'>
        <Clock className='h-3.5 w-3.5' />
        Clique com o botão direito em uma tarefa para habilitar, desabilitar, executar, editar ou excluir.
      </p>
    </div>
  );
}