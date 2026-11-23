import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AutoTicketScopeSelector } from '@/components/settings/AutoTicketPolicyEditor';

import {
  Icon,
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  ErrorDisplay,
  Input,
  Loading,
  Select,
  PageHeader,
} from '@/components/ui';

import { autoTicketRulesApi } from '@/api';
import type {
  AutoTicketRuleDto,
  AutoTicketRuleDryRunResponse,
  AutoTicketRuleStatsResponse,
  UpsertAutoTicketRuleRequest,
} from '@/api/auto-ticket-rules';
import { TICKET_PRIORITY_META } from '@/utils/labels';
import type { TicketPriority } from '@/api';
import { useClients } from '@/hooks/useClients';
import { useAllSites } from '@/hooks/useSites';
import { useDepartments } from '@/hooks/useDepartments';
import { useWorkflowProfiles } from '@/hooks/useWorkflowProfiles';

const SCOPE_LEVELS = ['Global', 'Client', 'Site'] as const;
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;

interface FormState {
  name: string;
  scopeLevel: string;
  scopeId: string;
  alertCodeFilter: string;
  targetCategory: string;
  targetPriority: string;
  targetDepartmentId: string;
  targetWorkflowProfileId: string;
  dedupWindowMinutes: number;
  cooldownMinutes: number;
  isEnabled: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  scopeLevel: 'Global',
  scopeId: '',
  alertCodeFilter: '',
  targetCategory: '',
  targetPriority: 'Medium',
  targetDepartmentId: '',
  targetWorkflowProfileId: '',
  dedupWindowMinutes: 60,
  cooldownMinutes: 0,
  isEnabled: true,
};

type AutoTicketTab = 'rules' | 'policy';

const AUTO_TICKET_TABS: { id: AutoTicketTab; label: string; icon: 'checklist' | 'layers' }[] = [
  { id: 'rules', label: 'Regras', icon: 'checklist' },
  { id: 'policy', label: 'Política por Escopo', icon: 'layers' },
];

export default function AutoTicketRulesPage({
  initialTab = 'rules',
}: {
  initialTab?: AutoTicketTab;
} = {}) {
  const [activeTab, setActiveTab] = useState<AutoTicketTab>(initialTab);
  const tabRefs = useRef<Record<AutoTicketTab, HTMLButtonElement | null>>({
    rules: null,
    policy: null,
  });

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const selectTab = (tab: AutoTicketTab) => {
    setActiveTab(tab);
    tabRefs.current[tab]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % AUTO_TICKET_TABS.length;
    else if (event.key === 'ArrowLeft')
      nextIndex = (index - 1 + AUTO_TICKET_TABS.length) % AUTO_TICKET_TABS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = AUTO_TICKET_TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const target = AUTO_TICKET_TABS[nextIndex];
    selectTab(target.id);
    tabRefs.current[target.id]?.focus();
  };

  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AutoTicketRuleDto | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Simulação (dry-run). Sem escolher regra, usa POST /simulate.
  const [simulateFor, setSimulateFor] = useState<AutoTicketRuleDto | null>(null);
  const [simulateAlertCode, setSimulateAlertCode] = useState('');
  const [simulateClientId, setSimulateClientId] = useState('');
  const [simulateResult, setSimulateResult] =
    useState<AutoTicketRuleDryRunResponse | null>(null);

  // Estatísticas da regra selecionada.
  const [statsFor, setStatsFor] = useState<AutoTicketRuleDto | null>(null);

  const { data: rules = [], isLoading, error } = useQuery({
    queryKey: ['auto-ticket-rules'],
    queryFn: () => autoTicketRulesApi.list(),
  });

  const clientsQuery = useClients();
  const sitesQuery = useAllSites();
  const departmentsQuery = useDepartments();
  const profilesQuery = useWorkflowProfiles();

  const clientOptions = [
    { value: '', label: 'Selecione um cliente...' },
    ...(clientsQuery.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];
  const siteOptions = [
    { value: '', label: 'Selecione um site...' },
    ...(sitesQuery.data ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];
  const departmentOptions = [
    { value: '', label: 'Padrão / Opcional' },
    ...(departmentsQuery.data ?? []).map((d) => ({ value: d.id, label: d.name })),
  ];
  const profileOptions = [
    { value: '', label: 'Padrão / Opcional' },
    ...(profilesQuery.data ?? []).map((p) => ({ value: p.id, label: p.name })),
  ];

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['auto-ticket-rules', 'stats', statsFor?.id],
    queryFn: () => autoTicketRulesApi.getStats(statsFor!.id),
    enabled: !!statsFor,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['auto-ticket-rules'] });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => autoTicketRulesApi.delete(id),
    onSuccess: () => {
      invalidate();
      toast.success('Regra excluída');
    },
    onError: () => toast.error('Erro ao excluir regra'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enable }: { id: string; enable: boolean }) =>
      enable ? autoTicketRulesApi.enable(id) : autoTicketRulesApi.disable(id),
    onSuccess: () => {
      invalidate();
      toast.success('Status atualizado');
    },
    onError: () => toast.error('Erro ao alterar status'),
  });

  const saveMutation = useMutation({
    mutationFn: (data: FormState) => {
      const payload: UpsertAutoTicketRuleRequest = {
        name: data.name,
        isEnabled: data.isEnabled,
        scopeLevel: data.scopeLevel,
        scopeId: data.scopeId || null,
        alertCodeFilter: data.alertCodeFilter || null,
        targetCategory: data.targetCategory || null,
        targetPriority: data.targetPriority || null,
        targetDepartmentId: data.targetDepartmentId || null,
        targetWorkflowProfileId: data.targetWorkflowProfileId || null,
        dedupWindowMinutes: data.dedupWindowMinutes,
        cooldownMinutes: data.cooldownMinutes,
      };
      return editingId
        ? autoTicketRulesApi.update(editingId, payload)
        : autoTicketRulesApi.create(payload);
    },
    onSuccess: () => {
      invalidate();
      toast.success(editingId ? 'Regra atualizada' : 'Regra criada');
      resetForm();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar regra'),
  });

  const simulateMutation = useMutation({
    mutationFn: () => {
      const request = {
        clientId: simulateClientId,
        agentId: crypto.randomUUID(),
        alertCode: simulateAlertCode,
        severity: 2,
      };
      return simulateFor
        ? autoTicketRulesApi.dryRun(simulateFor.id, request)
        : autoTicketRulesApi.simulate(request);
    },
    onSuccess: (result) => setSimulateResult(result),
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Erro ao simular'),
  });

  const seedMutation = useMutation({
    mutationFn: () => autoTicketRulesApi.seedDefaults(simulateClientId),
    onSuccess: (result) => {
      invalidate();
      toast.success(
        `Regras padrão: ${result.createdCount} criada(s), ${result.updatedCount} atualizada(s)`,
      );
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Erro ao semear regras'),
  });

  const resetForm = () => {
    setEditingId(null);
    setShowCreate(false);
    setForm(EMPTY_FORM);
  };

  const startEdit = (rule: AutoTicketRuleDto) => {
    setForm({
      name: rule.name,
      scopeLevel: rule.scopeLevel || 'Global',
      scopeId: rule.scopeId || '',
      alertCodeFilter: rule.alertCodeFilter || '',
      targetCategory: rule.targetCategory || '',
      targetPriority: rule.targetPriority || 'Medium',
      targetDepartmentId: rule.targetDepartmentId || '',
      targetWorkflowProfileId: rule.targetWorkflowProfileId || '',
      dedupWindowMinutes: rule.dedupWindowMinutes ?? 60,
      cooldownMinutes: rule.cooldownMinutes ?? 0,
      isEnabled: rule.isEnabled,
    });
    setEditingId(rule.id);
    setShowCreate(false);
  };

  if (isLoading) return <Loading message="Carregando regras..." />;
  if (error) return <ErrorDisplay message={(error as Error).message} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auto-Ticket"
        description="Configure regras de abertura automática a partir de alertas e defina em quais escopos (Global → Cliente → Site) o recurso opera."
      >
        {activeTab === 'rules' && (
          <Button onClick={() => setShowCreate(true)} disabled={showCreate || !!editingId}>
            <Icon name="add" className="w-4 h-4 mr-2" />
            Nova Regra
          </Button>
        )}
      </PageHeader>

      <div
        role="tablist"
        aria-label="Configurações de Auto-Ticket"
        className="flex flex-nowrap items-center gap-1 overflow-x-auto border-b border-border"
      >
        {AUTO_TICKET_TABS.map((tab, index) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              id={`auto-ticket-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={`relative flex-none inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                isSelected
                  ? 'text-foreground after:absolute after:inset-x-0 after:bottom-0 after:border-b-2 after:border-primary'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              <Icon name={tab.icon} className="h-4 w-4" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'policy' ? (
        <div role="tabpanel" aria-labelledby="auto-ticket-tab-policy" tabIndex={0}>
          <AutoTicketScopeSelector />
        </div>
      ) : (
        <div role="tabpanel" aria-labelledby="auto-ticket-tab-rules" tabIndex={0} className="space-y-6">

      {(showCreate || editingId) && (
        <Card>
          <CardHeader title={editingId ? 'Editar Regra' : 'Nova Regra'} />
          <div className="p-4 space-y-4">
            <Input
              label="Nome"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Disco cheio abre chamado para Infra"
            />

            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="Nível de escopo"
                value={form.scopeLevel}
                onChange={(e) => setForm({ ...form, scopeLevel: e.target.value, scopeId: '' })}
                options={SCOPE_LEVELS.map((level) => ({ value: level, label: level }))}
              />
              {form.scopeLevel === 'Client' && (
                <Select
                  label="Cliente"
                  value={form.scopeId}
                  onChange={(e) => setForm({ ...form, scopeId: e.target.value })}
                  options={clientOptions}
                />
              )}
              {form.scopeLevel === 'Site' && (
                <Select
                  label="Site"
                  value={form.scopeId}
                  onChange={(e) => setForm({ ...form, scopeId: e.target.value })}
                  options={siteOptions}
                />
              )}
            </div>

            <Input
              label="Código do alerta (filtro)"
              value={form.alertCodeFilter}
              onChange={(e) => setForm({ ...form, alertCodeFilter: e.target.value })}
              placeholder="Ex: sensor:disk_space"
            />
            <p className="-mt-3 text-xs text-muted-foreground">
              Vazio = casa qualquer alerta. Sensores chegam como{' '}
              <code>sensor:&lt;chave&gt;</code>.
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="Prioridade do chamado"
                value={form.targetPriority}
                onChange={(e) => setForm({ ...form, targetPriority: e.target.value })}
                options={PRIORITIES.map((priority) => ({
                  value: priority,
                  label: TICKET_PRIORITY_META[priority as TicketPriority].label,
                }))}
              />
              <Input
                label="Categoria"
                value={form.targetCategory}
                onChange={(e) => setForm({ ...form, targetCategory: e.target.value })}
                placeholder="Ex: Capacity"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="Departamento"
                value={form.targetDepartmentId}
                onChange={(e) => setForm({ ...form, targetDepartmentId: e.target.value })}
                options={departmentOptions}
              />
              <Select
                label="Workflow Profile"
                value={form.targetWorkflowProfileId}
                onChange={(e) => setForm({ ...form, targetWorkflowProfileId: e.target.value })}
                options={profileOptions}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Janela de deduplicação (minutos)"
                type="number"
                value={String(form.dedupWindowMinutes)}
                onChange={(e) =>
                  setForm({ ...form, dedupWindowMinutes: Number(e.target.value) || 0 })
                }
              />
              <Input
                label="Cooldown (minutos)"
                type="number"
                value={String(form.cooldownMinutes)}
                onChange={(e) =>
                  setForm({ ...form, cooldownMinutes: Number(e.target.value) || 0 })
                }
              />
            </div>

            <p className="text-xs text-muted-foreground">
              A janela de deduplicação evita abrir um chamado por sintoma repetido: alertas do
              mesmo alvo dentro dela são agrupados no mesmo chamado.
            </p>

            <div className="flex gap-2">
              <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button variant="secondary" onClick={resetForm}>
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Simulação: mostra o que aconteceria SEM gravar nada. */}
      <Card>
        <CardHeader title="Simular (dry-run)" />
        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Nada é gravado. A simulação aplica a política efetiva, o motor de regras e o
            avaliador de sinal, e mostra o que aconteceria.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="Cliente"
              value={simulateClientId}
              onChange={(e) => setSimulateClientId(e.target.value)}
              options={clientOptions}
            />
            <Input
              label="Código do alerta"
              value={simulateAlertCode}
              onChange={(e) => setSimulateAlertCode(e.target.value)}
              placeholder="Ex: sensor:disk_space"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => simulateMutation.mutate()}
              disabled={!simulateClientId || !simulateAlertCode || simulateMutation.isPending}
            >
              {simulateMutation.isPending ? 'Simulando...' : 'Simular'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => seedMutation.mutate()}
              disabled={!simulateClientId || seedMutation.isPending}
              title="Cria um conjunto conservador de regras padrão para o cliente"
            >
              {seedMutation.isPending ? 'Semeando...' : 'Semear regras padrão'}
            </Button>
          </div>

          {simulateResult && (
            <div
              className={`rounded-lg border p-3 text-sm ${
                simulateResult.wouldCreateTicket
                  ? 'border-success/40 bg-success/10'
                  : 'border-warning/40 bg-warning/10'
              }`}
            >
              <p className="font-medium">
                {simulateResult.wouldCreateTicket
                  ? 'Criaria um chamado'
                  : 'NÃO criaria um chamado'}
              </p>
              <p className="mt-1 text-muted-foreground">{simulateResult.reason}</p>
              {simulateResult.dedupKey && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Chave de dedup: <code>{simulateResult.dedupKey}</code>
                </p>
              )}
            </div>
          )}
        </div>
      </Card>

      {rules.length === 0 ? (
        <Card>
          <div className="p-8 text-center text-muted-foreground">
            <Icon name="bolt" className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma regra configurada</p>
            <p className="text-sm">
              Sem regra, nenhum chamado automático é aberto. Use “Semear regras padrão” para
              começar de um conjunto conservador.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{rule.name}</h3>
                      <Badge color={rule.isEnabled ? 'success' : 'slate'}>
                        {rule.isEnabled ? 'Ativo' : 'Inativo'}
                      </Badge>
                      <Badge color="slate">{rule.scopeLevel}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
                      <span>
                        Alerta: <code>{rule.alertCodeFilter || 'qualquer'}</code>
                      </span>
                      <span>Prioridade: {rule.targetPriority}</span>
                      <span>Dedup: {rule.dedupWindowMinutes} min</span>
                      {rule.targetCategory && <span>Categoria: {rule.targetCategory}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleMutation.mutate({ id: rule.id, enable: !rule.isEnabled })}
                      title={rule.isEnabled ? 'Desativar' : 'Ativar'}
                    >
                      <Icon name="power_settings_new" className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setStatsFor(rule);
                      }}
                      title="Ver estatísticas de decisão"
                    >
                      <Icon name="bar_chart" className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSimulateFor(rule);
                        setSimulateResult(null);
                      }}
                      title="Simular esta regra"
                    >
                      <Icon name="play_arrow" className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => startEdit(rule)} title="Editar">
                      <Icon name="edit" className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(rule)}
                      title="Excluir"
                    >
                      <Icon name="delete" className="w-4 h-4 text-danger" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Estatísticas de decisão da regra selecionada. */}
      {statsFor && (
        <Card>
          <CardHeader title={`Estatísticas — ${statsFor.name}`} />
          <div className="p-4">
            {statsLoading ? (
              <Loading message="Carregando estatísticas..." />
            ) : stats ? (
              <StatsView stats={stats} onClose={() => setStatsFor(null)} />
            ) : (
              <p className="text-sm text-muted-foreground">Sem dados no período.</p>
            )}
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Excluir regra"
        message={
          <>
            Tem certeza que deseja excluir a regra{' '}
            <span className="font-semibold text-foreground">{deleteTarget?.name}</span>? Esta ação
            não pode ser desfeita.
          </>
        }
        confirmLabel="Excluir"
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate(deleteTarget.id, {
            onSettled: () => setDeleteTarget(null),
          });
        }}
        onClose={() => setDeleteTarget(null)}
        isLoading={deleteMutation.isPending}
      />
        </div>
      )}
    </div>
  );
}

/**
 * Série de decisões da regra. Os contadores vêm direto do
 * AutoTicketRuleStatsResponse — são exatamente os AutoTicketDecision gravados.
 */
function StatsView({
  stats,
  onClose,
}: {
  stats: AutoTicketRuleStatsResponse;
  onClose: () => void;
}) {
  const rows: { label: string; value: number; hint: string }[] = [
    { label: 'Criados', value: stats.createdCount, hint: 'Chamados efetivamente abertos' },
    { label: 'Deduplicados', value: stats.dedupedCount, hint: 'Agrupados em chamado existente' },
    { label: 'Suprimidos', value: stats.suppressedCount, hint: 'Manutenção, dependência ou flapping' },
    { label: 'Sem ação', value: stats.matchedNoActionCount, hint: 'Regra casou mas não cria' },
    { label: 'Limitados', value: stats.rateLimitedCount, hint: 'Teto por hora atingido' },
    { label: 'Falhas', value: stats.failedCount, hint: 'Erro ao criar' },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Últimas {stats.periodHours}h — {stats.totalEvaluations} avaliação(ões) no escopo da regra,{' '}
        {stats.selectedExecutions} selecionada(s) por ela.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-lg border border-border p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{row.label}</p>
            <p className="mt-1 text-2xl font-semibold">{row.value}</p>
            <p className="text-xs text-muted-foreground">{row.hint}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Taxa de criação: {(stats.createRate * 100).toFixed(1)}% · Dedup:{' '}
          {(stats.dedupRate * 100).toFixed(1)}% · Falha: {(stats.failureRate * 100).toFixed(1)}%
        </p>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </div>
  );
}
