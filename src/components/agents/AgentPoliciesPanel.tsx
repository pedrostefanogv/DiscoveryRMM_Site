import { useMemo, type ReactNode } from 'react';
import { Info, Package, RefreshCw, ShieldCheck, Zap } from 'lucide-react';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Loading,
  type Column,
} from '@/components/ui';
import {
  AutomationNotificationMode,
  type AgentAutomationPolicyPreview,
  type AgentAutomationTaskPolicy,
} from '@/api';
import {
  describeCron,
  notificationModeFromTask,
  notificationModeLabel,
  toastTimingLabel,
} from '@/pages/automation/automationTasksUtils';

// ── Rótulos (aceitam enum numérico OU string: a API serializa enums como nome) ──

function actionTypeLabel(value: unknown): string {
  const key = typeof value === 'string' ? value : '';
  switch (key) {
    case 'InstallPackage':
      return 'Instalar pacote';
    case 'UpdatePackage':
      return 'Atualizar pacote';
    case 'UpdateOrInstallPackage':
      return 'Instalar ou atualizar';
    case 'RemovePackage':
      return 'Remover pacote';
    case 'RunScript':
      return 'Executar script';
    case 'CustomCommand':
      return 'Comando personalizado';
    default:
      break;
  }
  switch (value) {
    case 0:
      return 'Instalar pacote';
    case 1:
      return 'Atualizar pacote';
    case 2:
      return 'Executar script';
    case 3:
      return 'Comando personalizado';
    case 4:
      return 'Remover pacote';
    case 5:
      return 'Instalar ou atualizar';
    default:
      return String(value ?? '—');
  }
}

function scopeTypeLabel(value: unknown): string {
  const key = typeof value === 'string' ? value : '';
  switch (key) {
    case 'Global':
      return 'Global';
    case 'Client':
      return 'Cliente';
    case 'Site':
      return 'Site';
    case 'Agent':
      return 'Agente';
    default:
      break;
  }
  switch (value) {
    case 0:
      return 'Global';
    case 1:
      return 'Cliente';
    case 2:
      return 'Site';
    case 3:
      return 'Agente';
    default:
      return String(value ?? '—');
  }
}

function installationTypeLabel(value: unknown): string {
  const key = typeof value === 'string' ? value : '';
  switch (key) {
    case 'Winget':
    case 'winget':
      return 'Winget';
    case 'Chocolatey':
    case 'chocolatey':
    case 'choco':
      return 'Chocolatey';
    case 'Custom':
    case 'custom':
      return 'Personalizado';
    default:
      break;
  }
  switch (value) {
    case 0:
      return 'Winget';
    case 1:
      return 'Chocolatey';
    case 2:
      return 'Personalizado';
    default:
      return value ? String(value) : '';
  }
}

function actionTarget(policy: AgentAutomationTaskPolicy): string {
  if (policy.packageId) {
    const kind = policy.installationType
      ? ` (${installationTypeLabel(policy.installationType)})`
      : '';
    return `${policy.packageId}${kind}`;
  }
  if (policy.script) return `${policy.script.name} v${policy.script.version}`;
  if (policy.scriptId) return policy.scriptId;
  if (policy.commandPayload) return policy.commandPayload;
  return '—';
}

/** Resumo dos gatilhos: o que faz a política rodar no agent. */
function triggerSummary(policy: AgentAutomationTaskPolicy): string {
  const parts: string[] = [];
  if (policy.triggerImmediate) parts.push('Imediato');
  if (policy.triggerRecurring) parts.push('Recorrente');
  if (policy.triggerOnUserLogin) parts.push('No logon');
  if (policy.triggerOnAgentCheckIn) parts.push('No check-in do agent');
  if (policy.scheduleCron) parts.push(describeCron(policy.scheduleCron));
  return parts.length > 0 ? parts.join(' · ') : 'Somente sob demanda (run-now)';
}

function shortFingerprint(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  return raw.length > 12 ? `${raw.slice(0, 12)}…` : raw || '—';
}

/** Linha rótulo/valor usada no card de detalhes da política. */
function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className='min-w-0 rounded-lg border border-border bg-surface-light px-3 py-2'>
      <p className='text-[11px] uppercase tracking-wide text-muted'>{label}</p>
      <p
        className='mt-0.5 truncate text-sm text-foreground'
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </p>
    </div>
  );
}

interface AgentPoliciesPanelProps {
  /**
   * Permissão Automation.View. Sem ela o painel explica a restrição em vez de
   * disparar a consulta (que retornaria 403) e mostrar "nenhuma política".
   */
  canView: boolean;
  /** Permissão Automation.Execute — habilita o "Forçar sincronização". */
  canForceSync: boolean;
  policies: AgentAutomationPolicyPreview | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  isRefreshing: boolean;
  onRefresh: () => void;
  isForcing: boolean;
  onForceSync: () => void;
}

/**
 * Aba "Políticas": mostra exatamente o conjunto de políticas de automação que o
 * agent recebe no policy-sync (escopo global/cliente/site/agente com filtros de
 * tag), para o operador conferir o que se aplica àquela máquina.
 */
export default function AgentPoliciesPanel({
  canView,
  canForceSync,
  policies,
  isLoading,
  isError,
  onRetry,
  isRefreshing,
  onRefresh,
  isForcing,
  onForceSync,
}: AgentPoliciesPanelProps) {
  const tasks = policies?.tasks ?? [];
  const preload = policies?.preloadPackages ?? [];

  const renderDetails = (policy: AgentAutomationTaskPolicy) => {
    // Modo efetivo: payload antigo sem notificationMode cai em requiresApproval
    // (Prompt) ou Silent — sem isso um Toast aparecia como "Silencioso".
    const mode = notificationModeFromTask(policy.notificationMode, policy.requiresApproval);
    return (
    <div className='space-y-3'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='truncate text-sm font-semibold text-foreground'>{policy.name}</p>
          {policy.description ? (
            <p className='mt-0.5 text-xs text-muted'>{policy.description}</p>
          ) : null}
        </div>
        <Badge color='primary'>{scopeTypeLabel(policy.scopeType)}</Badge>
      </div>

      <div className='grid gap-2 sm:grid-cols-2'>
        <DetailItem label='Ação' value={actionTypeLabel(policy.actionType)} />
        <DetailItem label='Alvo' value={actionTarget(policy)} />
        <DetailItem label='Gatilhos' value={triggerSummary(policy)} />
        <DetailItem label='Notificação' value={notificationModeLabel(mode)} />
        {mode === AutomationNotificationMode.Toast ? (
          <DetailItem label='Momento do toast' value={toastTimingLabel(policy.toastTiming)} />
        ) : null}
        <DetailItem label='Permite adiar' value={policy.allowDefer ? 'Sim' : 'Não'} />
        <DetailItem label='Tempo de resposta' value={`${policy.promptTimeoutSeconds}s`} />
        <DetailItem label='Inclui tags' value={policy.includeTags.length > 0 ? policy.includeTags.join(', ') : 'Todas'} />
        <DetailItem label='Exclui tags' value={policy.excludeTags.length > 0 ? policy.excludeTags.join(', ') : '—'} />
        <DetailItem label='Fecha processos' value={policy.closeProcesses.length > 0 ? policy.closeProcesses.join(', ') : '—'} />
        <DetailItem label='Atualizada em' value={new Date(policy.lastUpdatedAt).toLocaleString('pt-BR')} />
      </div>

      {policy.script ? (
        <div className='min-w-0 rounded-lg border border-border bg-surface-light px-3 py-2'>
          <p className='text-[11px] uppercase tracking-wide text-muted'>Script</p>
          <p className='mt-0.5 truncate text-sm text-foreground'>
            {policy.script.name} v{policy.script.version}
          </p>
          {policy.script.summary ? (
            <p className='mt-0.5 text-xs text-muted'>{policy.script.summary}</p>
          ) : null}
        </div>
      ) : null}

      {policy.commandPayload ? (
        <div className='min-w-0 rounded-lg border border-border bg-surface-light px-3 py-2'>
          <p className='text-[11px] uppercase tracking-wide text-muted'>Comando</p>
          <p className='mt-0.5 break-all font-mono text-xs text-muted-foreground'>
            {policy.commandPayload}
          </p>
        </div>
      ) : null}
    </div>
    );
  };

  const columns: Column<AgentAutomationTaskPolicy>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Política',
        width: '38%',
        render: (policy) => (
          <div className='min-w-0'>
            <p className='truncate font-medium text-foreground' title={policy.name}>
              {policy.name}
            </p>
            {policy.description ? (
              <p className='truncate text-xs text-muted' title={policy.description}>
                {policy.description}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'action',
        header: 'Ação',
        width: '27%',
        render: (policy) => (
          <div className='min-w-0'>
            <p className='truncate text-foreground'>{actionTypeLabel(policy.actionType)}</p>
            <p className='truncate font-mono text-xs text-muted' title={actionTarget(policy)}>
              {actionTarget(policy)}
            </p>
          </div>
        ),
      },
      {
        key: 'scope',
        header: 'Escopo',
        width: '15%',
        className: 'whitespace-nowrap',
        render: (policy) => (
          <Badge color={scopeTypeLabel(policy.scopeType) === 'Agente' ? 'primary' : 'slate'}>
            {scopeTypeLabel(policy.scopeType)}
          </Badge>
        ),
      },
      {
        key: 'trigger',
        header: 'Disparo',
        width: '20%',
        render: (policy) => {
          const label = triggerSummary(policy);
          return (
            <span className='block truncate' title={label}>
              {label}
            </span>
          );
        },
      },
    ],
    [],
  );

  const taskCount = policies?.taskCount ?? tasks.length;

  return (
    <div>
      <div className='mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h3 className='text-lg font-semibold text-foreground sm:text-xl'>
            Políticas de Automação
          </h3>
          <p className='text-sm text-muted'>
            {canView ? (
              <>
                {taskCount} política(s) aplicável(is) · fingerprint{' '}
                <span className='font-mono'>{shortFingerprint(policies?.policyFingerprint)}</span>
              </>
            ) : (
              'Verificação das políticas aplicáveis a este agente'
            )}
          </p>
        </div>
        <div className='flex items-center gap-2'>
          {canView && policies ? (
            policies.upToDate ? (
              <Badge color='success'>Agent atualizado</Badge>
            ) : (
              <Badge color='warning'>
                {policies.lastSyncedPolicyFingerprint ? 'Agent desatualizado' : 'Nunca recebeu'}
              </Badge>
            )
          ) : null}
          {canForceSync && policies && !policies.upToDate ? (
            <Button
              size='sm'
              variant='secondary'
              onClick={onForceSync}
              loading={isForcing}
              title='Pedir ao agent para sincronizar as políticas agora'
            >
              <Zap className='h-4 w-4' />
              Forçar sincronização
            </Button>
          ) : null}
          <Button
            size='sm'
            variant='ghost'
            onClick={onRefresh}
            loading={isRefreshing}
            title='Consultar novamente as políticas aplicáveis a este agente'
          >
            <RefreshCw className='h-4 w-4' />
            Atualizar
          </Button>
        </div>
      </div>

      <p className='mb-3 flex items-start gap-2 rounded-lg border border-border bg-surface-light px-3 py-2 text-xs text-muted'>
        <ShieldCheck className='mt-0.5 h-3.5 w-3.5 shrink-0' />
        <span>
          Este é o conjunto que o agent recebe no policy-sync (políticas globais, do cliente, do site
          e do próprio agente, já filtradas pelas tags do dispositivo).
          {canView && policies ? (
            policies.upToDate ? (
              <>
                {' '}
                O agent já recebeu esta policy
                {policies.lastPolicySyncAt
                  ? ` (em ${new Date(policies.lastPolicySyncAt).toLocaleString('pt-BR')})`
                  : ''}
                .
              </>
            ) : policies.lastSyncedPolicyFingerprint ? (
              <>
                {' '}
                O agent ainda está com uma policy anterior — aguarde o próximo check-in dele
                {canForceSync ? ' ou use "Forçar sincronização" para antecipar' : ''}.
              </>
            ) : (
              <> Este agent ainda não registrou o recebimento de nenhuma policy.</>
            )
          ) : null}
        </span>
      </p>

      {!canView ? (
        <EmptyState
          title='Sem permissão para ver as políticas'
          description='Sua conta não tem a permissão Automation.View, necessária para consultar as políticas de automação aplicáveis a este agente.'
        />
      ) : isLoading ? (
        <Loading message='Carregando políticas de automação...' />
      ) : isError ? (
        <EmptyState
          title='Não foi possível carregar as políticas'
          description='Tente atualizar os dados.'
          action={{ label: 'Tentar novamente', onClick: onRetry }}
        />
      ) : tasks.length === 0 ? (
        <EmptyState
          title='Nenhuma política aplicável'
          description='Nenhuma política de automação ativa se aplica a este agente (escopo e tags considerados).'
        />
      ) : (
        <DataTable
          columns={columns}
          data={tasks}
          keyExtractor={(policy) => policy.taskId}
          rowHoverCard={renderDetails}
          rowHoverDelayMs={1500}
          showPagination={false}
          emptyMessage='Nenhuma política de automação encontrada'
          maxHeight='min(560px, 52vh)'
          fixedLayout
        />
      )}

      {canView && preload.length > 0 && (
        <div className='mt-4 rounded-lg border border-border bg-surface-light px-3 py-3'>
          <p className='flex items-center gap-2 text-sm font-medium text-foreground'>
            <Package className='h-4 w-4' />
            Pré-carga P2P ({preload.length})
          </p>
          <p className='mt-0.5 text-xs text-muted'>
            Pacotes que o agent pode baixar antecipadamente por causa destas políticas (sem instalar).
          </p>
          <div className='mt-2 flex flex-wrap gap-1.5'>
            {preload.map((item) => (
              <Badge key={item.packageId} color='slate'>
                {item.packageId} · {actionTypeLabel(item.actionType)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <p className='mt-3 flex items-center gap-2 text-xs text-muted'>
        <Info className='h-3.5 w-3.5' />
        Passe o mouse sobre uma política para ver gatilhos, tags, notificação e script.
      </p>
    </div>
  );
}
