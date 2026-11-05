import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

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

export default function AutoTicketRulesPage() {
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
        title="Regras de Criação Automática de Tickets"
        description="Configure quando o sistema abre um chamado automaticamente a partir de eventos de monitoramento. O escopo efetivo (cliente/site) e a ativação são definidos pela Política de Auto-Ticket."
      >
        <Button onClick={() => setShowCreate(true)} disabled={showCreate || !!editingId}>
          <Icon name="add" className="w-4 h-4 mr-2" />
          Nova Regra
        </Button>
      </PageHeader>

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
                onChange={(e) => setForm({ ...form, scopeLevel: e.target.value })}
                options={SCOPE_LEVELS.map((level) => ({ value: level, label: level }))}
              />
              {form.scopeLevel !== 'Global' && (
                <Input
                  label={`ID do ${form.scopeLevel === 'Site' ? 'site' : 'cliente'} (GUID)`}
                  value={form.scopeId}
                  onChange={(e) => setForm({ ...form, scopeId: e.target.value })}
                  placeholder="00000000-0000-0000-0000-000000000000"
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
              <Input
                label="Departamento (GUID)"
                value={form.targetDepartmentId}
                onChange={(e) => setForm({ ...form, targetDepartmentId: e.target.value })}
                placeholder="Opcional"
              />
              <Input
                label="Workflow Profile (GUID)"
                value={form.targetWorkflowProfileId}
                onChange={(e) => setForm({ ...form, targetWorkflowProfileId: e.target.value })}
                placeholder="Opcional"
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
            <Input
              label="Cliente (GUID)"
              value={simulateClientId}
              onChange={(e) => setSimulateClientId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
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
            onSuccess: () => toast.success('Regra excluída.'),
            onError: (err) =>
              toast.error(err instanceof Error ? err.message : 'Não foi possível excluir a regra.'),
            onSettled: () => setDeleteTarget(null),
          });
        }}
        onClose={() => setDeleteTarget(null)}
        isLoading={deleteMutation.isPending}
      />
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
