import { useMemo, useState } from 'react';
import { AlertTriangle, Bell, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  AlertScopeType,
  PsadtAlertType,
  type AgentAlertIcon,
  type TicketAlertRule,
  type UpsertTicketAlertRuleRequest,
  type WorkflowState,
} from '@/api';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorDisplay,
  Input,
  Loading,
  Select,
  TextArea,
} from '@/components/ui';
import {
  useCreateTicketAlertRule,
  useDeleteTicketAlertRule,
  useTicketAlertRules,
  useToggleTicketAlertRule,
  useUpdateTicketAlertRule,
  useWorkflowStates,
} from '@/hooks';

type RuleFormState = {
  workflowStateId: string;
  title: string;
  message: string;
  alertType: string;
  timeoutSeconds: string;
  actionsJson: string;
  defaultAction: string;
  icon: AgentAlertIcon;
  scopePreference: string;
  isEnabled: boolean;
};

const DEFAULT_FORM: RuleFormState = {
  workflowStateId: '',
  title: '',
  message: '',
  alertType: String(PsadtAlertType.Toast),
  timeoutSeconds: '15',
  actionsJson: '',
  defaultAction: '',
  icon: 'info',
  scopePreference: String(AlertScopeType.Agent),
  isEnabled: true,
};

const ALERT_TYPE_OPTIONS = [
  { value: String(PsadtAlertType.Toast), label: 'Toast (fecha sozinho)' },
  { value: String(PsadtAlertType.Modal), label: 'Modal (exige interacao)' },
];

const TIMEOUT_OPTIONS = [
  { value: '5', label: '5 segundos' },
  { value: '15', label: '15 segundos' },
  { value: '30', label: '30 segundos' },
];

const ICON_OPTIONS = [
  { value: 'info', label: 'info' },
  { value: 'success', label: 'success' },
  { value: 'warning', label: 'warning' },
  { value: 'error', label: 'error' },
];

const SCOPE_OPTIONS = [
  { value: String(AlertScopeType.Agent), label: 'Agent' },
  { value: String(AlertScopeType.Site), label: 'Site' },
  { value: String(AlertScopeType.Client), label: 'Client' },
  { value: String(AlertScopeType.Label), label: 'Label' },
];

function getScopeLabel(scopePreference: AlertScopeType) {
  if (scopePreference === AlertScopeType.Agent) return 'Agent';
  if (scopePreference === AlertScopeType.Site) return 'Site';
  if (scopePreference === AlertScopeType.Client) return 'Client';
  if (scopePreference === AlertScopeType.Label) return 'Label';
  return 'Desconhecido';
}

function getAlertTypeLabel(alertType: PsadtAlertType) {
  return alertType === PsadtAlertType.Modal ? 'Modal' : 'Toast';
}

function parseOptionalJson(raw: string) {
  if (!raw.trim()) return null;
  return JSON.stringify(JSON.parse(raw));
}

function toFormState(rule: TicketAlertRule): RuleFormState {
  return {
    workflowStateId: rule.workflowStateId,
    title: rule.title,
    message: rule.message,
    alertType: String(rule.alertType),
    timeoutSeconds: rule.timeoutSeconds ? String(rule.timeoutSeconds) : '15',
    actionsJson: rule.actionsJson ?? '',
    defaultAction: rule.defaultAction ?? '',
    icon: rule.icon,
    scopePreference: String(rule.scopePreference),
    isEnabled: rule.isEnabled,
  };
}

function buildPayload(form: RuleFormState): UpsertTicketAlertRuleRequest {
  return {
    workflowStateId: form.workflowStateId,
    title: form.title.trim(),
    message: form.message.trim(),
    alertType: Number(form.alertType) as PsadtAlertType,
    timeoutSeconds:
      Number(form.alertType) === PsadtAlertType.Modal
        ? null
        : Number(form.timeoutSeconds || '15'),
    actionsJson: parseOptionalJson(form.actionsJson),
    defaultAction: form.defaultAction.trim() || null,
    icon: form.icon,
    scopePreference: Number(form.scopePreference) as AlertScopeType,
    isEnabled: form.isEnabled,
  };
}

export default function TicketAlertsPage() {
  const workflowStates = useWorkflowStates();
  const rulesQuery = useTicketAlertRules();
  const createRule = useCreateTicketAlertRule();
  const updateRule = useUpdateTicketAlertRule();
  const toggleRule = useToggleTicketAlertRule();
  const deleteRule = useDeleteTicketAlertRule();

  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [filterWorkflowStateId, setFilterWorkflowStateId] = useState('');
  const [form, setForm] = useState<RuleFormState>(DEFAULT_FORM);

  const states: WorkflowState[] = workflowStates.data ?? [];
  const rules = rulesQuery.data ?? [];
  const stateMap = useMemo(
    () => new Map<string, WorkflowState>(states.map((state) => [state.id, state])),
    [states],
  );

  const filteredRules = useMemo(() => {
    const items = filterWorkflowStateId
      ? rules.filter((rule) => rule.workflowStateId === filterWorkflowStateId)
      : rules;

    return [...items].sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );
  }, [filterWorkflowStateId, rules]);

  const workflowStateOptions = [
    { value: '', label: 'Selecione um workflow state' },
    ...states.map((state) => ({
      value: state.id,
      label: state.name,
    })),
  ];

  const filterOptions = [
    { value: '', label: 'Todos os workflow states' },
    ...states.map((state) => ({
      value: state.id,
      label: state.name,
    })),
  ];

  const isLoading =
    (workflowStates.isLoading && states.length === 0) ||
    (rulesQuery.isLoading && rules.length === 0);
  const hasError = workflowStates.isError || rulesQuery.isError;
  const isSaving = createRule.isPending || updateRule.isPending;

  if (isLoading) {
    return <Loading />;
  }

  if (hasError) {
    return (
      <ErrorDisplay
        onRetry={() => {
          void workflowStates.refetch();
          void rulesQuery.refetch();
        }}
      />
    );
  }

  const enabledCount = rules.filter((rule) => rule.isEnabled).length;
  const statesInUse = new Set(rules.map((rule) => rule.workflowStateId)).size;

  async function handleSubmit() {
    if (!form.workflowStateId) {
      toast.error('Selecione o workflow state da regra.');
      return;
    }

    if (!form.title.trim()) {
      toast.error('Informe um titulo para a regra.');
      return;
    }

    if (!form.message.trim()) {
      toast.error('Informe a mensagem do alerta.');
      return;
    }

    try {
      const payload = buildPayload(form);

      if (editingRuleId) {
        await updateRule.mutateAsync({ id: editingRuleId, data: payload });
        toast.success('Regra atualizada com sucesso.');
      } else {
        await createRule.mutateAsync(payload);
        toast.success('Regra criada com sucesso.');
      }

      setEditingRuleId(null);
      setForm(DEFAULT_FORM);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Nao foi possivel salvar a regra.';
      toast.error(message);
    }
  }

  function handleStartEdit(rule: TicketAlertRule) {
    setEditingRuleId(rule.id);
    setForm(toFormState(rule));
  }

  function handleResetForm() {
    setEditingRuleId(null);
    setForm(DEFAULT_FORM);
  }

  async function handleToggle(rule: TicketAlertRule) {
    try {
      await toggleRule.mutateAsync(rule.id);
      toast.success(rule.isEnabled ? 'Regra desativada.' : 'Regra ativada.');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Nao foi possivel alterar o status da regra.';
      toast.error(message);
    }
  }

  async function handleDelete(rule: TicketAlertRule) {
    if (!window.confirm(`Excluir a regra "${rule.title}"?`)) {
      return;
    }

    try {
      await deleteRule.mutateAsync(rule.id);
      if (editingRuleId === rule.id) {
        handleResetForm();
      }
      toast.success('Regra removida com sucesso.');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Nao foi possivel remover a regra.';
      toast.error(message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Regras de alerta de tickets</h1>
          <p className="text-sm text-slate-400">
            Configure alertas PSADT que sao disparados automaticamente quando o ticket entra em um workflow state.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge color="primary">Workflow</Badge>
          <Badge color="warning">PSADT</Badge>
          <Badge color="accent">CRUD real</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-slate-500">Regras</p>
            <p className="text-2xl font-semibold text-white">{rules.length}</p>
          </div>
        </Card>
        <Card>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-slate-500">Ativas</p>
            <p className="text-2xl font-semibold text-white">{enabledCount}</p>
          </div>
        </Card>
        <Card>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-slate-500">States em uso</p>
            <p className="text-2xl font-semibold text-white">{statesInUse}</p>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title={editingRuleId ? 'Editar regra' : 'Nova regra'}
              subtitle="Preencha o conteudo do alerta e vincule a regra a um workflow state."
              action={
                <Button variant="secondary" onClick={handleResetForm}>
                  <Plus className="h-4 w-4" />
                  Nova regra
                </Button>
              }
            />

            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="Workflow state"
                options={workflowStateOptions}
                value={form.workflowStateId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    workflowStateId: event.target.value,
                  }))
                }
              />
              <Select
                label="Tipo de alerta"
                options={ALERT_TYPE_OPTIONS}
                value={form.alertType}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    alertType: event.target.value,
                  }))
                }
              />
              <Select
                label="Escopo preferencial"
                options={SCOPE_OPTIONS}
                value={form.scopePreference}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    scopePreference: event.target.value,
                  }))
                }
              />
              <Select
                label="Icone"
                options={ICON_OPTIONS}
                value={form.icon}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    icon: event.target.value as AgentAlertIcon,
                  }))
                }
              />
              <Select
                label="Timeout"
                options={TIMEOUT_OPTIONS}
                value={form.timeoutSeconds}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    timeoutSeconds: event.target.value,
                  }))
                }
                disabled={Number(form.alertType) === PsadtAlertType.Modal}
              />
              <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.isEnabled}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      isEnabled: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-white/20 bg-transparent"
                />
                <span>
                  Regra habilitada
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Quando desabilitada, o estado continua funcionando sem disparar alerta.
                  </span>
                </span>
              </label>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Input
                label="Titulo"
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="Atendimento iniciado"
              />
              <Input
                label="defaultAction"
                value={form.defaultAction}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    defaultAction: event.target.value,
                  }))
                }
                placeholder="confirmar"
                hint="Opcional. Mais util para alertas do tipo Modal."
              />
            </div>

            <div className="mt-4 space-y-4">
              <TextArea
                label="Mensagem"
                value={form.message}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    message: event.target.value,
                  }))
                }
                rows={5}
                placeholder="Seu ticket mudou de estado e requer atencao do usuario."
              />

              <TextArea
                label="actionsJson"
                value={form.actionsJson}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    actionsJson: event.target.value,
                  }))
                }
                rows={6}
                hint='Exemplo: [{"label":"Confirmar","value":"ok"}]'
                placeholder='[{"label":"Confirmar","value":"ok"}]'
              />
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={handleSubmit} loading={isSaving}>
                <Bell className="h-4 w-4" />
                {editingRuleId ? 'Salvar alteracoes' : 'Criar regra'}
              </Button>
              {editingRuleId && (
                <Button variant="ghost" onClick={handleResetForm}>
                  Cancelar edicao
                </Button>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Observacoes"
              subtitle="Comportamento do backend para estas regras."
            />

            <div className="space-y-3 text-sm text-slate-300">
              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p>
                  O disparo ocorre automaticamente quando o ticket entra no workflow state configurado.
                </p>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p>
                  Para Toast, o backend aceita timeout de 5, 15 ou 30 segundos. Para Modal, o timeout e ignorado.
                </p>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p>
                  O escopo preferencial usa o contexto do ticket e faz fallback conforme os dados disponiveis no servidor.
                </p>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Regras cadastradas"
              subtitle="Lista atual de regras automaticas vinculadas a workflow states."
            />

            <div className="mb-4">
              <Select
                label="Filtrar por workflow state"
                options={filterOptions}
                value={filterWorkflowStateId}
                onChange={(event) => setFilterWorkflowStateId(event.target.value)}
              />
            </div>

            <div className="space-y-3">
              {filteredRules.length === 0 && (
                <p className="text-sm text-slate-500">Nenhuma regra encontrada para o filtro atual.</p>
              )}

              {filteredRules.map((rule) => {
                const workflowState = stateMap.get(rule.workflowStateId);

                return (
                  <div
                    key={rule.id}
                    className="rounded-xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium text-white">{rule.title}</p>
                          <Badge color={rule.isEnabled ? 'success' : 'slate'}>
                            {rule.isEnabled ? 'Ativa' : 'Desativada'}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">
                          {workflowState?.name ?? 'Workflow state removido'}
                        </p>
                      </div>
                      <Badge color="accent">{getAlertTypeLabel(rule.alertType)}</Badge>
                    </div>

                    <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{rule.message}</p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge color="primary">Escopo: {getScopeLabel(rule.scopePreference)}</Badge>
                      <Badge color="slate">Icone: {rule.icon}</Badge>
                      <Badge color="slate">
                        Timeout: {rule.timeoutSeconds ?? 'manual'}
                      </Badge>
                      {rule.actionsJson && <Badge color="warning">Com actionsJson</Badge>}
                    </div>

                    <p className="mt-3 text-[11px] text-slate-500">
                      Atualizada em {new Date(rule.updatedAt).toLocaleString('pt-BR')}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" onClick={() => handleStartEdit(rule)}>
                        <Pencil className="h-4 w-4" />
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleToggle(rule)}
                        loading={toggleRule.isPending}
                      >
                        <Power className="h-4 w-4" />
                        {rule.isEnabled ? 'Desativar' : 'Ativar'}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => void handleDelete(rule)}
                        loading={deleteRule.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}