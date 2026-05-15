import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Badge, Button, Card, CardHeader, ErrorDisplay, Input, Loading, Select, TextArea } from '@/components/ui';
import { agentsApi, clientsApi, sitesApi, type Agent, type Client, type Site } from '@/api';
import { agentLabelsApi } from '@/modules/agent-labels/api';
import {
  AgentLabelApplyMode,
  AgentLabelComparisonOperator,
  AgentLabelField,
  AgentLabelLogicalOperator,
  AgentLabelNodeType,
  AgentStatus,
  getAgentLabelApplyModeLabel,
  getAgentLabelComparisonOperatorLabel,
  getAgentLabelFieldLabel,
  getAgentLabelLogicalOperatorLabel,
  isCustomFieldAgentLabelField,
  isDiskAgentLabelField,
  type AgentLabelAvailableCustomField,
  type AgentLabelRuleAgentItem,
  type AgentLabelRuleDryRunResponse,
  type AgentLabelRuleExpressionNodeDto,
  type AgentLabelRuleResponse,
} from '@/modules/agent-labels/types';
import {
  getAllowedOperatorsForField,
  getCustomFieldScopeTypeForRuleField,
  validateRulePayload,
} from '@/modules/agent-labels/validation';
import {
  CustomFieldDataType,
  getCustomFieldDataTypeLabel,
  getCustomFieldScopeLabel,
} from '@/api/custom-fields';

const defaultExpression: AgentLabelRuleExpressionNodeDto = {
  nodeType: AgentLabelNodeType.Group,
  logicalOperator: AgentLabelLogicalOperator.And,
  children: [],
};

const defaultCondition: AgentLabelRuleExpressionNodeDto = {
  nodeType: AgentLabelNodeType.Condition,
  field: AgentLabelField.Hostname,
  operator: AgentLabelComparisonOperator.Contains,
  value: '',
  customFieldDefinitionId: null,
};

const defaultDiskGroup: AgentLabelRuleExpressionNodeDto = {
  nodeType: AgentLabelNodeType.DiskGroup,
  logicalOperator: AgentLabelLogicalOperator.Or,
  children: [],
};

const fieldOptions = Object.values(AgentLabelField)
  .filter((value): value is AgentLabelField => typeof value === 'number')
  .filter(field => !isDiskAgentLabelField(field))
  .map(field => ({ value: String(field), label: getAgentLabelFieldLabel(field) }));

const diskFieldOptions = Object.values(AgentLabelField)
  .filter((value): value is AgentLabelField => typeof value === 'number')
  .filter(field => isDiskAgentLabelField(field))
  .map(field => ({ value: String(field), label: getAgentLabelFieldLabel(field) }));

const logicalOperatorOptions = Object.values(AgentLabelLogicalOperator)
  .filter((value): value is AgentLabelLogicalOperator => typeof value === 'number')
  .map(operator => ({ value: String(operator), label: getAgentLabelLogicalOperatorLabel(operator) }));

const applyModeOptions = Object.values(AgentLabelApplyMode)
  .filter((value): value is AgentLabelApplyMode => typeof value === 'number')
  .map(mode => ({ value: String(mode), label: getAgentLabelApplyModeLabel(mode) }));

const GROUP_ACCENTS = [
  { border: 'border-l-cyan-500/50', dot: 'bg-cyan-500' },
  { border: 'border-l-violet-500/50', dot: 'bg-violet-500' },
  { border: 'border-l-amber-500/50', dot: 'bg-amber-500' },
  { border: 'border-l-emerald-500/50', dot: 'bg-emerald-500' },
  { border: 'border-l-rose-500/50', dot: 'bg-rose-500' },
  { border: 'border-l-sky-500/50', dot: 'bg-sky-500' },
  { border: 'border-l-orange-500/50', dot: 'bg-orange-500' },
  { border: 'border-l-teal-500/50', dot: 'bg-teal-500' },
];

type DryRunMode = 'site-batch' | 'single-agent';

export default function AgentLabelsSettings() {
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'view'>('list');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(true);
  const [rules, setRules] = useState<AgentLabelRuleResponse[]>([]);
  const [availableCustomFields, setAvailableCustomFields] = useState<AgentLabelAvailableCustomField[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [isRunningPreview, setIsRunningPreview] = useState(false);
  const [isLoadingAppliedAgents, setIsLoadingAppliedAgents] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [applyMode, setApplyMode] = useState<AgentLabelApplyMode>(AgentLabelApplyMode.ApplyOnly);
  const [editorMode, setEditorMode] = useState<'visual' | 'json'>('visual');
  const [showJsonInVisual, setShowJsonInVisual] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [expressionBuilder, setExpressionBuilder] = useState<AgentLabelRuleExpressionNodeDto>(defaultExpression);
  const [expressionText, setExpressionText] = useState(JSON.stringify(defaultExpression, null, 2));

  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [dryRunMode, setDryRunMode] = useState<DryRunMode>('site-batch');
  const [previewLimit, setPreviewLimit] = useState(25);
  const [previewResults, setPreviewResults] = useState<Array<AgentLabelRuleDryRunResponse & { agentName: string }>>([]);

  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [appliedAgentsTotal, setAppliedAgentsTotal] = useState(0);
  const [appliedResults, setAppliedResults] = useState<Array<{
    agentId: string;
    agentName: string;
    status: string;
    matchedAt: string | null;
    lastEvaluatedAt: string | null;
  }>>([]);

  const customFieldDataTypes = useMemo(() => {
    const entries = availableCustomFields.map((item) => [item.id, item.dataType as CustomFieldDataType]);
    return Object.fromEntries(entries) as Record<string, CustomFieldDataType>;
  }, [availableCustomFields]);

  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [rules],
  );

  function resetCreateState() {
    setEditingRuleId(null);
    setIsReadOnly(true);
    setName('');
    setLabel('');
    setDescription('');
    setApplyMode(AgentLabelApplyMode.ApplyOnly);
    setEditorMode('visual');
    setShowJsonInVisual(false);
    setShowHelp(false);
    setExpressionBuilder(structuredClone(defaultExpression));
    setSelectedClientId('');
    setSelectedSiteId('');
    setSelectedAgentId('');
    setDryRunMode('site-batch');
    setPreviewLimit(25);
    setPreviewResults([]);
  }

  function startCreateRule() {
    resetCreateState();
    setViewMode('create');
  }

  function startViewRule(rule: AgentLabelRuleResponse) {
    const expression = structuredClone(rule.expression);
    setEditingRuleId(rule.id);
    setIsReadOnly(true);
    setName(rule.name);
    setLabel(rule.label);
    setDescription(rule.description ?? '');
    setApplyMode(rule.applyMode);
    setEditorMode('visual');
    setShowJsonInVisual(false);
    setShowHelp(false);
    setExpressionBuilder(expression);
    setExpressionText(JSON.stringify(expression, null, 2));
    setSelectedClientId('');
    setSelectedSiteId('');
    setSelectedAgentId('');
    setDryRunMode('site-batch');
    setPreviewResults([]);
    setViewMode('view');
  }

  function enableEditing() {
    setIsReadOnly(false);
  }

  function toggleAppliedAgentsPanel(rule: AgentLabelRuleResponse) {
    if (expandedRuleId === rule.id) {
      setExpandedRuleId(null);
      return;
    }

    setExpandedRuleId(rule.id);
    setAppliedAgentsTotal(0);
    setAppliedResults([]);
    void handleLoadAppliedAgents(rule);
  }

  async function loadAll() {
    setError(null);
    setIsLoading(true);
    try {
      const [rulesData, clientsData, customFieldsData] = await Promise.all([
        agentLabelsApi.getRules(true),
        clientsApi.list(false),
        agentLabelsApi.getAvailableCustomFields(),
      ]);
      setRules(rulesData);
      setClients(clientsData);
      setAvailableCustomFields(customFieldsData);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Falha ao carregar regras e dependências.'));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSites() {
      if (!selectedClientId) {
        setSites([]);
        setSelectedSiteId('');
        setSelectedAgentId('');
        setAgents([]);
        return;
      }

      try {
        const data = await sitesApi.list(selectedClientId, false);
        if (cancelled) return;
        setSites(data);
        setSelectedSiteId('');
        setSelectedAgentId('');
        setAgents([]);
        setPreviewResults([]);
      } catch {
        if (cancelled) return;
        toast.error('Falha ao carregar sites para prévia.');
      }
    }

    void loadSites();
    return () => { cancelled = true; };
  }, [selectedClientId]);

  useEffect(() => {
    let cancelled = false;

    async function loadAgents() {
      if (!selectedSiteId) {
        setAgents([]);
        setSelectedAgentId('');
        setPreviewResults([]);
        return;
      }

      try {
        const data = await agentsApi.listBySite(selectedSiteId);
        if (cancelled) return;
        setAgents(data);
        setSelectedAgentId('');
        setPreviewResults([]);
      } catch {
        if (cancelled) return;
        toast.error('Falha ao carregar agentes para prévia.');
      }
    }

    void loadAgents();
    return () => { cancelled = true; };
  }, [selectedSiteId]);

  useEffect(() => {
    setExpressionText(JSON.stringify(expressionBuilder, null, 2));
  }, [expressionBuilder]);

  async function handleSaveRule() {
    let parsedExpression: AgentLabelRuleExpressionNodeDto;

    try {
      parsedExpression = JSON.parse(expressionText) as AgentLabelRuleExpressionNodeDto;
    } catch {
      toast.error('Expressão inválida: JSON malformado.');
      return;
    }

    const errors = validateRulePayload({
      name,
      label,
      expression: parsedExpression,
      customFieldDataTypes,
    });
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }

    setIsSaving(true);
    try {
      if (editingRuleId) {
        const currentRule = rules.find(rule => rule.id === editingRuleId);
        if (!currentRule) {
          toast.error('Não foi possível localizar a regra para edição.');
          return;
        }

        await agentLabelsApi.updateRule(editingRuleId, {
          name: name.trim(),
          label: label.trim(),
          description: normalizeOptionalText(description),
          isEnabled: currentRule.isEnabled,
          applyMode,
          expression: parsedExpression,
        });
        toast.success('Regra atualizada com sucesso.');
      } else {
        await agentLabelsApi.createRule({
          name: name.trim(),
          label: label.trim(),
          description: normalizeOptionalText(description),
          applyMode,
          expression: parsedExpression,
        });
        toast.success('Regra criada com sucesso.');
      }

      resetCreateState();
      setViewMode('list');
      await loadAll();
    } catch (err) {
      toast.error(getApiErrorMessage(err, editingRuleId ? 'Falha ao atualizar regra.' : 'Falha ao criar regra.'));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleRule(rule: AgentLabelRuleResponse) {
    try {
      await agentLabelsApi.updateRule(rule.id, {
        name: rule.name,
        label: rule.label,
        description: rule.description ?? null,
        isEnabled: !rule.isEnabled,
        applyMode: rule.applyMode,
        expression: rule.expression,
      });

      setRules(prev => prev.map(item => (item.id === rule.id ? { ...item, isEnabled: !item.isEnabled } : item)));
      toast.success(rule.isEnabled ? 'Regra desabilitada.' : 'Regra habilitada.');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Falha ao atualizar regra.'));
    }
  }

  async function handleDeleteRule(rule: AgentLabelRuleResponse) {
    if (!confirm(`Excluir a regra "${rule.name}"?`)) {
      return;
    }

    try {
      await agentLabelsApi.deleteRule(rule.id);
      setRules(prev => prev.filter(item => item.id !== rule.id));
      toast.success('Regra excluída.');
      resetCreateState();
      setViewMode('list');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Falha ao excluir regra.'));
    }
  }

  async function handleReprocessAll() {
    setIsReprocessing(true);
    try {
      const response = await agentLabelsApi.reprocessAll();
      toast.success(response.message || 'Reprocessamento iniciado.');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Falha ao reprocessar agentes.'));
    } finally {
      setIsReprocessing(false);
    }
  }

  async function handleRunPreview() {
    let parsedExpression: AgentLabelRuleExpressionNodeDto;
    try {
      parsedExpression = JSON.parse(expressionText) as AgentLabelRuleExpressionNodeDto;
    } catch {
      toast.error('Expressão inválida: JSON malformado.');
      return;
    }

    const validationErrors = validateRulePayload({
      name: name || 'Prévia',
      label,
      expression: parsedExpression,
      customFieldDataTypes,
    });
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      return;
    }

    const scopedAgents =
      dryRunMode === 'single-agent'
        ? agents.filter(agent => agent.id === selectedAgentId)
        : agents.slice(0, Math.min(Math.max(previewLimit, 1), 100));

    if (dryRunMode === 'single-agent' && !selectedAgentId) {
      toast.error('Selecione um agente para simulação individual.');
      return;
    }

    if (dryRunMode === 'site-batch' && !selectedSiteId) {
      toast.error('Selecione um site para simular a regra em lote.');
      return;
    }

    if (scopedAgents.length === 0) {
      toast.error('Nenhum agente encontrado para simulação.');
      return;
    }

    setIsRunningPreview(true);
    try {
      const responses = await Promise.all(
        scopedAgents.map(async agent => {
          const result = await agentLabelsApi.dryRun({
            agentId: agent.id,
            label: label.trim(),
            applyMode,
            expression: parsedExpression,
          });

          return {
            ...result,
            agentName: agent.displayName || agent.hostname || agent.id,
          };
        }),
      );

      setPreviewResults(responses);
      const matchedCount = responses.filter(item => item.matched).length;
      toast.success(`Prévia concluída: ${matchedCount}/${responses.length} agentes com match.`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Falha ao executar prévia da regra.'));
    } finally {
      setIsRunningPreview(false);
    }
  }

  async function handleLoadAppliedAgents(rule: AgentLabelRuleResponse) {
    setIsLoadingAppliedAgents(true);
    try {
      const response = await agentLabelsApi.getRuleAgents(rule.id);
      const mapped = response.agents.map((agent: AgentLabelRuleAgentItem) => ({
        agentId: agent.agentId,
        agentName: agent.displayName || agent.hostname || agent.agentId,
        status: agent.status || '-',
        matchedAt: agent.matchedAt,
        lastEvaluatedAt: agent.lastEvaluatedAt,
      }));

      setAppliedAgentsTotal(response.totalAgents);
      setAppliedResults(mapped);
      toast.success(`Consulta concluída: ${mapped.length} agentes retornados pela regra.`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Falha ao consultar labels aplicadas.'));
    } finally {
      setIsLoadingAppliedAgents(false);
    }
  }

  function handleUpdateNode(path: number[], updater: (node: AgentLabelRuleExpressionNodeDto) => AgentLabelRuleExpressionNodeDto) {
    setExpressionBuilder(prev => updateNodeAtPath(prev, path, updater));
  }

  function handleAddCondition(path: number[]) {
    setExpressionBuilder(prev => addChildAtPath(prev, path, defaultCondition));
  }

  function handleAddGroup(path: number[]) {
    setExpressionBuilder(prev => addChildAtPath(prev, path, defaultExpression));
  }

  function handleAddDiskGroup(path: number[]) {
    setExpressionBuilder(prev => addChildAtPath(prev, path, defaultDiskGroup));
  }

  function handleRemoveNode(path: number[]) {
    setExpressionBuilder(prev => removeNodeAtPath(prev, path));
  }

  function handleApplyJsonToVisual() {
    try {
      const parsed = JSON.parse(expressionText) as AgentLabelRuleExpressionNodeDto;
      if (parsed.nodeType !== AgentLabelNodeType.Group) {
        toast.error('A raiz da expressão precisa ser um Group.');
        return;
      }

      setExpressionBuilder(parsed);
      setEditorMode('visual');
      toast.success('Editor visual sincronizado com o JSON.');
    } catch {
      toast.error('Expressão inválida: JSON malformado.');
    }
  }

  if (isLoading) {
    return <Loading message="Carregando regras de labels..." />;
  }

  if (error) {
    return <ErrorDisplay message={error} onRetry={() => void loadAll()} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Labels Automáticas</h1>
          <p className="text-sm text-slate-400">
            Gerencie regras automáticas com campos nativos e custom fields por Agente, Cliente e Site.
          </p>
        </div>
        {viewMode === 'list' ? (
          <Button size="sm" onClick={startCreateRule}>
            Criar Regra
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              resetCreateState();
              setViewMode('list');
            }}
          >
            Voltar para Lista
          </Button>
        )}
      </div>

      {viewMode === 'create' ? (
        <>
          <Card>
            <CardHeader
              title={editingRuleId ? 'Editar Regra' : 'Nova Regra'}
              subtitle="Crie a regra via editor visual ou JSON, com suporte a custom fields e operadores por tipo."
            />

            <div className="mb-4 flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => setShowHelp(prev => !prev)}>
                {showHelp ? 'Recolher ajuda' : 'Ajuda das regras'}
              </Button>
            </div>

            {showHelp ? (
              <div className="mb-4 space-y-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                <div>
                  <p className="mb-1 font-medium text-white">Como combinar condições com E / OU</p>
                  <p>Use <strong>grupos (E / OU)</strong> para aninhar condições e criar regras complexas:</p>

                  <div className="mt-3 space-y-3">
                    <div className="rounded-lg bg-slate-900/60 p-3 font-mono text-xs text-slate-400">
                      <p className="text-slate-300 font-medium mb-1">Exemplo 1 — Simples: SO + (hostname OU memória)</p>
                      <p>Grupo raiz: <strong className="text-yellow-400">E</strong></p>
                      <p className="ml-2">├─ Condição: SO <em>contém</em> "Windows"</p>
                      <p className="ml-2">└─ Grupo filho: <strong className="text-yellow-400">OU</strong></p>
                      <p className="ml-4">&nbsp;&nbsp;├─ Condição: Hostname <em>contém</em> "PROD"</p>
                      <p className="ml-4">&nbsp;&nbsp;└─ Condição: Memória <em>&gt;=</em> "8589934592"</p>
                      <p className="mt-2 text-slate-500">Resultado: (SO contém "Windows") <strong className="text-yellow-400">E</strong> (Hostname contém "PROD" <strong className="text-yellow-400">OU</strong> Memória &gt;= 8GB)</p>
                    </div>

                    <div className="rounded-lg bg-slate-900/60 p-3 font-mono text-xs text-slate-400">
                      <p className="text-slate-300 font-medium mb-1">Exemplo 2 — Intermediário: Windows + (PROD OU 8GB) E (SP OU RJ)</p>
                      <p>Grupo raiz: <strong className="text-yellow-400">E</strong></p>
                      <p className="ml-2">├─ Condição: SO <em>contém</em> "Windows"</p>
                      <p className="ml-2">├─ Grupo filho: <strong className="text-yellow-400">OU</strong></p>
                      <p className="ml-4">&nbsp;&nbsp;├─ Condição: Hostname <em>contém</em> "PROD"</p>
                      <p className="ml-4">&nbsp;&nbsp;└─ Condição: Memória <em>&gt;=</em> "8589934592"</p>
                      <p className="ml-2">└─ Grupo filho: <strong className="text-yellow-400">OU</strong></p>
                      <p className="ml-4">&nbsp;&nbsp;├─ Condição: DisplayName <em>contém</em> "SP"</p>
                      <p className="ml-4">&nbsp;&nbsp;└─ Condição: DisplayName <em>contém</em> "RJ"</p>
                      <p className="mt-2 text-slate-500">Resultado: SO Windows <strong className="text-yellow-400">E</strong> (PROD <strong className="text-yellow-400">OU</strong> 8GB) <strong className="text-yellow-400">E</strong> (SP <strong className="text-yellow-400">OU</strong> RJ)</p>
                    </div>

                    <div className="rounded-lg bg-slate-900/60 p-3 font-mono text-xs text-slate-400">
                      <p className="text-slate-300 font-medium mb-1">Exemplo 3 — Avançado: servidores Windows com bastante memória OU estações Linux</p>
                      <p>Grupo raiz: <strong className="text-yellow-400">OU</strong></p>
                      <p className="ml-2">├─ Grupo filho: <strong className="text-yellow-400">E</strong> — Servidores Windows</p>
                      <p className="ml-4">&nbsp;&nbsp;├─ Condição: SO <em>contém</em> "Windows"</p>
                      <p className="ml-4">&nbsp;&nbsp;├─ Condição: Hostname <em>contém</em> "SRV"</p>
                      <p className="ml-4">&nbsp;&nbsp;└─ Condição: Memória <em>&gt;=</em> "17179869184"</p>
                      <p className="ml-2">└─ Grupo filho: <strong className="text-yellow-400">E</strong> — Estações Linux</p>
                      <p className="ml-4">&nbsp;&nbsp;├─ Condição: SO <em>contém</em> "Linux"</p>
                      <p className="ml-4">&nbsp;&nbsp;└─ Condição: Hostname <em>NÃO contém</em> "SRV"</p>
                      <p className="mt-2 text-slate-500">Resultado: (Windows <strong className="text-yellow-400">E</strong> SRV <strong className="text-yellow-400">E</strong> 16GB+) <strong className="text-yellow-400">OU</strong> (Linux <strong className="text-yellow-400">E</strong> NÃO estação)</p>
                    </div>

                    <div className="rounded-lg bg-slate-900/60 p-3 font-mono text-xs text-slate-400">
                      <p className="text-slate-300 font-medium mb-1">Exemplo 4 — Discos: SSD C: com menos de 20% livre</p>
                      <p>Grupo raiz: <strong className="text-yellow-400">E</strong></p>
                      <p className="ml-2">├─ <strong className="text-orange-400">Disco</strong> [<strong className="text-yellow-400">OU</strong> — algum disco atende]</p>
                      <p className="ml-4">&nbsp;&nbsp;├─ Condição: Letra <em>=</em> "C:"</p>
                      <p className="ml-4">&nbsp;&nbsp;├─ Condição: Tipo <em>=</em> "SSD"</p>
                      <p className="ml-4">&nbsp;&nbsp;└─ Condição: % Livre <em>&lt;</em> "20"</p>
                      <p className="ml-2">└─ Condição: Status <em>=</em> "Online"</p>
                      <p className="mt-2 text-slate-500">Resultado: (C: SSD &lt;20% livre) <strong className="text-yellow-400">E</strong> Online</p>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="mb-1 font-medium text-white">Custom fields e operadores</p>
                  <p>Ao selecionar um <strong>Custom Field</strong>, os operadores disponíveis mudam conforme o <strong>tipo de dado</strong>:</p>
                  <div className="mt-2 rounded-lg bg-slate-900/60 p-3 text-xs text-slate-400">
                    <p><strong className="text-slate-300">Texto:</strong> Contém, Não contém, Começa com, Termina com, Igual, Diferente, Regex</p>
                    <p><strong className="text-slate-300">Número inteiro/Decimal:</strong> &gt;, &gt;=, &lt;, &lt;=, Igual, Diferente</p>
                    <p><strong className="text-slate-300">Data / DataHora:</strong> &gt;, &gt;=, &lt;, &lt;=, Igual, Diferente</p>
                    <p><strong className="text-slate-300">Booleano (Sim/Não):</strong> Igual</p>
                    <p><strong className="text-slate-300">Dropdown/Lista:</strong> Igual, Diferente</p>
                  </div>
                </div>

                <div>
                  <p className="mb-1 font-medium text-white">Dry-run: simulando a regra antes de salvar</p>
                  <p>Você pode testar a regra de duas formas:</p>
                  <div className="mt-2 rounded-lg bg-slate-900/60 p-3 text-xs text-slate-400">
                    <p className="text-slate-300"><strong>Lote por site:</strong> selecione um cliente + site e defina um limite de agentes. A regra será testada em lote.</p>
                    <p className="mt-1 text-slate-300"><strong>Agente específico:</strong> selecione um cliente + site + agente para testar a regra em um único agente.</p>
                  </div>
                </div>

                <div>
                  <p className="mb-1 font-medium text-white">Grupo de Discos</p>
                  <p>Use o botão <strong>+ Disco</strong> para criar condições que avaliam discos do agente. Dentro de um grupo de discos, você pode usar campos como Letra da Unidade, Tipo de Mídia (SSD/HDD), % Livre, Sistema de Arquivos, entre outros.</p>
                  <div className="mt-2 rounded-lg bg-slate-900/60 p-3 text-xs text-slate-400">
                    <p className="text-slate-300"><strong>ANY (OU):</strong> pelo menos um disco do agente deve atender a todas as condições.</p>
                    <p className="mt-1 text-slate-300"><strong>ALL (E):</strong> todos os discos do agente devem atender a todas as condições.</p>
                    <p className="mt-2 text-slate-500">Campos de disco (Letra, Tipo, % Livre, etc.) só podem ser usados dentro de um grupo Disco.</p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
              <Input label="Nome" placeholder="Ex.: Windows Produção" value={name} maxLength={200} onChange={event => setName(event.target.value)} />
              <Input label="Label" placeholder="Ex.: PROD" value={label} maxLength={120} onChange={event => setLabel(event.target.value)} />
            </div>

            <div className="mt-4">
              <TextArea label="Descrição / Observação" rows={3} value={description} onChange={event => setDescription(event.target.value)} />
            </div>

            <div className="mt-4">
              <Select label="Modo de Aplicação" value={String(applyMode)} options={applyModeOptions} onChange={event => setApplyMode(Number(event.target.value) as AgentLabelApplyMode)} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant={editorMode === 'visual' ? 'primary' : 'secondary'} onClick={() => setEditorMode('visual')}>Editor Visual</Button>
              <Button size="sm" variant={editorMode === 'json' ? 'primary' : 'secondary'} onClick={() => setEditorMode('json')}>Editor JSON</Button>
              {editorMode === 'visual' ? (
                <Button size="sm" variant="ghost" onClick={() => setShowJsonInVisual(prev => !prev)}>
                  {showJsonInVisual ? 'Ocultar JSON' : 'Mostrar JSON'}
                </Button>
              ) : null}
            </div>

            {editorMode === 'visual' ? (
              <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <ExpressionNodeEditor
                  node={expressionBuilder}
                  path={[]}
                  isRoot
                  availableCustomFields={availableCustomFields}
                  onUpdateNode={handleUpdateNode}
                  onAddCondition={handleAddCondition}
                  onAddGroup={handleAddGroup}
                  onAddDiskGroup={handleAddDiskGroup}
                  onRemoveNode={handleRemoveNode}
                />
              </div>
            ) : null}

            {editorMode === 'json' || showJsonInVisual ? (
              <div className="mt-4">
                <TextArea label="Expressão (JSON)" rows={14} value={expressionText} onChange={event => setExpressionText(event.target.value)} className="font-mono" />
              </div>
            ) : null}

            {editorMode === 'json' ? (
              <div className="mt-2 flex justify-end">
                <Button size="sm" variant="secondary" onClick={handleApplyJsonToVisual}>Aplicar JSON no Editor Visual</Button>
              </div>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { resetCreateState(); setViewMode('list'); }}>Cancelar</Button>
              <Button onClick={() => void handleSaveRule()} loading={isSaving}>{editingRuleId ? 'Salvar Alterações' : 'Cadastrar Regra'}</Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Prévia de Aplicação" subtitle="Simule em lote por site ou em um agente específico antes de salvar" />

            <div className="grid gap-4 lg:grid-cols-4">
              <Select
                label="Modo de Dry-Run"
                value={dryRunMode}
                options={[{ value: 'site-batch', label: 'Lote por Site' }, { value: 'single-agent', label: 'Agente Único' }]}
                onChange={event => setDryRunMode(event.target.value as DryRunMode)}
              />

              <Select label="Cliente" value={selectedClientId} options={[{ value: '', label: 'Selecione...' }, ...clients.map(client => ({ value: client.id, label: client.name }))]} onChange={event => setSelectedClientId(event.target.value)} />
              <Select label="Site" value={selectedSiteId} options={[{ value: '', label: 'Selecione...' }, ...sites.map(site => ({ value: site.id, label: site.name }))]} onChange={event => setSelectedSiteId(event.target.value)} />

              {dryRunMode === 'site-batch' ? (
                <Input label="Limite de agentes" type="number" min={1} max={100} value={previewLimit} onChange={event => setPreviewLimit(Number(event.target.value || 1))} />
              ) : (
                <Select
                  label="Agente"
                  value={selectedAgentId}
                  options={[{ value: '', label: 'Selecione...' }, ...agents.map(agent => ({ value: agent.id, label: agent.displayName || agent.hostname || agent.id }))]}
                  onChange={event => setSelectedAgentId(event.target.value)}
                />
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <Button variant="secondary" loading={isRunningPreview} onClick={() => void handleRunPreview()}>Rodar Prévia</Button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
              <span>Agentes no site: {agents.length}</span>
              <span>•</span>
              <span>Prévia atual: {previewResults.length}</span>
              <span>•</span>
              <span>Com match: {previewResults.filter(item => item.matched).length}</span>
              <span>•</span>
              <span>Adicionaria label: {previewResults.filter(item => item.wouldAddLabel).length}</span>
              <span>•</span>
              <span>Removeria label: {previewResults.filter(item => item.wouldRemoveLabel).length}</span>
            </div>

            {previewResults.length > 0 ? (
              <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
                <table className="min-w-full divide-y divide-white/10 text-sm">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-300">Agente</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-300">Match</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-300">Adicionar</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-300">Remover</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-300">Labels automáticas atuais</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {previewResults.map(result => (
                      <tr key={result.agentId} className="bg-slate-900/20">
                        <td className="px-3 py-2 text-slate-200">{result.agentName}</td>
                        <td className="px-3 py-2"><Badge color={result.matched ? 'success' : 'slate'}>{result.matched ? 'Sim' : 'Não'}</Badge></td>
                        <td className="px-3 py-2"><Badge color={result.wouldAddLabel ? 'success' : 'slate'}>{result.wouldAddLabel ? 'Sim' : 'Não'}</Badge></td>
                        <td className="px-3 py-2"><Badge color={result.wouldRemoveLabel ? 'warning' : 'slate'}>{result.wouldRemoveLabel ? 'Sim' : 'Não'}</Badge></td>
                        <td className="px-3 py-2 text-slate-300">{result.currentAutomaticLabels.length > 0 ? result.currentAutomaticLabels.join(', ') : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">Execute a prévia para ver em quais agentes a regra teria efeito.</p>
            )}
          </Card>
        </>
      ) : null}

      {viewMode === 'view' ? (
        <>
          <Card>
            <CardHeader
              title={isReadOnly ? `Regra: ${name}` : `Editando: ${name}`}
              subtitle={isReadOnly ? 'Visualizando regra — clique em Editar para alterar.' : 'Modo de edição ativo.'}
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <Input label="Nome" placeholder="Ex.: Windows Produção" value={name} maxLength={200} disabled={isReadOnly} onChange={event => setName(event.target.value)} />
              <Input label="Label" placeholder="Ex.: PROD" value={label} maxLength={120} disabled={isReadOnly} onChange={event => setLabel(event.target.value)} />
            </div>

            <div className="mt-4">
              <TextArea label="Descrição / Observação" rows={3} value={description} disabled={isReadOnly} onChange={event => setDescription(event.target.value)} />
            </div>

            <div className="mt-4">
              <Select label="Modo de Aplicação" value={String(applyMode)} options={applyModeOptions} disabled={isReadOnly} onChange={event => setApplyMode(Number(event.target.value) as AgentLabelApplyMode)} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant={editorMode === 'visual' ? 'primary' : 'secondary'} disabled={isReadOnly} onClick={() => setEditorMode('visual')}>Editor Visual</Button>
              <Button size="sm" variant={editorMode === 'json' ? 'primary' : 'secondary'} disabled={isReadOnly} onClick={() => setEditorMode('json')}>Editor JSON</Button>
              {editorMode === 'visual' ? (
                <Button size="sm" variant="ghost" disabled={isReadOnly} onClick={() => setShowJsonInVisual(prev => !prev)}>
                  {showJsonInVisual ? 'Ocultar JSON' : 'Mostrar JSON'}
                </Button>
              ) : null}
            </div>

            {editorMode === 'visual' ? (
              <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
                <ExpressionNodeEditor
                  node={expressionBuilder}
                  path={[]}
                  isRoot
                  availableCustomFields={availableCustomFields}
                  onUpdateNode={isReadOnly ? () => {} : handleUpdateNode}
                  onAddCondition={isReadOnly ? () => {} : handleAddCondition}
                  onAddGroup={isReadOnly ? () => {} : handleAddGroup}
                  onAddDiskGroup={isReadOnly ? () => {} : handleAddDiskGroup}
                  onRemoveNode={isReadOnly ? () => {} : handleRemoveNode}
                />
              </div>
            ) : null}

            {editorMode === 'json' || showJsonInVisual ? (
              <div className="mt-4">
                <TextArea label="Expressão (JSON)" rows={14} value={expressionText} disabled={isReadOnly} onChange={event => setExpressionText(event.target.value)} className="font-mono" />
              </div>
            ) : null}

            <div className="mt-4 flex justify-between gap-2">
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => { resetCreateState(); setViewMode('list'); }}>Voltar para Lista</Button>
                {isReadOnly ? (
                  <Button onClick={enableEditing}>Editar</Button>
                ) : (
                  <>
                    <Button variant="danger" onClick={() => void handleDeleteRule({ id: editingRuleId!, name } as AgentLabelRuleResponse)}>Excluir</Button>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                {!isReadOnly ? (
                  <>
                    <Button variant="ghost" onClick={() => { resetCreateState(); setViewMode('list'); }}>Cancelar</Button>
                    <Button onClick={() => void handleSaveRule()} loading={isSaving}>Salvar Alterações</Button>
                  </>
                ) : null}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Dry-Run" subtitle="Simule a regra em lote por site ou em um agente específico" />

            <div className="grid gap-4 lg:grid-cols-4">
              <Select
                label="Modo de Dry-Run"
                value={dryRunMode}
                options={[{ value: 'site-batch', label: 'Lote por Site' }, { value: 'single-agent', label: 'Agente Único' }]}
                onChange={event => setDryRunMode(event.target.value as DryRunMode)}
              />

              <Select label="Cliente" value={selectedClientId} options={[{ value: '', label: 'Selecione...' }, ...clients.map(client => ({ value: client.id, label: client.name }))]} onChange={event => setSelectedClientId(event.target.value)} />
              <Select label="Site" value={selectedSiteId} options={[{ value: '', label: 'Selecione...' }, ...sites.map(site => ({ value: site.id, label: site.name }))]} onChange={event => setSelectedSiteId(event.target.value)} />

              {dryRunMode === 'site-batch' ? (
                <Input label="Limite de agentes" type="number" min={1} max={100} value={previewLimit} onChange={event => setPreviewLimit(Number(event.target.value || 1))} />
              ) : (
                <Select
                  label="Agente"
                  value={selectedAgentId}
                  options={[{ value: '', label: 'Selecione...' }, ...agents.map(agent => ({ value: agent.id, label: agent.displayName || agent.hostname || agent.id }))]}
                  onChange={event => setSelectedAgentId(event.target.value)}
                />
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <Button variant="secondary" loading={isRunningPreview} onClick={() => void handleRunPreview()}>Rodar Dry-Run</Button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
              <span>Agentes no site: {agents.length}</span>
              <span>•</span>
              <span>Prévia atual: {previewResults.length}</span>
              <span>•</span>
              <span>Com match: {previewResults.filter(item => item.matched).length}</span>
              <span>•</span>
              <span>Adicionaria label: {previewResults.filter(item => item.wouldAddLabel).length}</span>
              <span>•</span>
              <span>Removeria label: {previewResults.filter(item => item.wouldRemoveLabel).length}</span>
            </div>

            {previewResults.length > 0 ? (
              <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
                <table className="min-w-full divide-y divide-white/10 text-sm">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-300">Agente</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-300">Match</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-300">Adicionar</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-300">Remover</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-300">Labels automáticas atuais</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {previewResults.map(result => (
                      <tr key={result.agentId} className="bg-slate-900/20">
                        <td className="px-3 py-2 text-slate-200">{result.agentName}</td>
                        <td className="px-3 py-2"><Badge color={result.matched ? 'success' : 'slate'}>{result.matched ? 'Sim' : 'Não'}</Badge></td>
                        <td className="px-3 py-2"><Badge color={result.wouldAddLabel ? 'success' : 'slate'}>{result.wouldAddLabel ? 'Sim' : 'Não'}</Badge></td>
                        <td className="px-3 py-2"><Badge color={result.wouldRemoveLabel ? 'warning' : 'slate'}>{result.wouldRemoveLabel ? 'Sim' : 'Não'}</Badge></td>
                        <td className="px-3 py-2 text-slate-300">{result.currentAutomaticLabels.length > 0 ? result.currentAutomaticLabels.join(', ') : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">Execute o dry-run para ver em quais agentes a regra teria efeito.</p>
            )}
          </Card>
        </>
      ) : null}

      {viewMode === 'list' ? (
        <Card>
          <CardHeader
            title="Regras Cadastradas"
            subtitle={`${sortedRules.length} regra(s)`}
            action={(
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" loading={isReprocessing} onClick={() => void handleReprocessAll()}>Reprocessar Agentes</Button>
              </div>
            )}
          />

          {sortedRules.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">Nenhuma regra cadastrada.</p>
              <Button size="sm" onClick={startCreateRule}>Criar primeira regra</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedRules.map(rule => (
                <div key={rule.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-white">{rule.name}</h3>
                    <Badge color={rule.isEnabled ? 'success' : 'slate'}>{rule.isEnabled ? 'Habilitada' : 'Desabilitada'}</Badge>
                    <Badge color="accent">{rule.label}</Badge>
                    <Badge color="slate">{getAgentLabelApplyModeLabel(rule.applyMode)}</Badge>
                  </div>

                  <p className="mt-2 text-xs text-slate-400">Atualizada em {formatDateTime(rule.updatedAt)}</p>

                  {rule.description?.trim() ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{rule.description}</p> : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => startViewRule(rule)}>Visualizar</Button>
                    <Button size="sm" variant="ghost" onClick={() => void handleToggleRule(rule)}>{rule.isEnabled ? 'Desabilitar' : 'Habilitar'}</Button>
                    <Button size="sm" variant="secondary" onClick={() => toggleAppliedAgentsPanel(rule)}>{expandedRuleId === rule.id ? 'Ocultar Agentes com Label' : 'Ver Agentes com Label'}</Button>
                  </div>

                  {expandedRuleId === rule.id ? (
                    <div className="mt-4 space-y-3 rounded-lg border border-white/10 bg-slate-900/30 p-3">
                      <h4 className="text-sm font-medium text-slate-100">Agentes com a label "{rule.label}"</h4>

                      {isLoadingAppliedAgents ? (
                        <Loading message="Carregando agentes..." />
                      ) : (
                        <>
                      <p className="text-xs text-slate-400">Total informado pela API: {appliedAgentsTotal} • Retornados nesta consulta: {appliedResults.length}</p>

                      {appliedResults.length > 0 ? (
                        <div className="overflow-x-auto rounded-lg border border-white/10">
                          <table className="min-w-full divide-y divide-white/10 text-sm">
                            <thead className="bg-white/5">
                              <tr>
                                <th className="px-3 py-2 text-left font-medium text-slate-300">Agente</th>
                                <th className="px-3 py-2 text-left font-medium text-slate-300">Status</th>
                                <th className="px-3 py-2 text-left font-medium text-slate-300">Match em</th>
                                <th className="px-3 py-2 text-left font-medium text-slate-300">Última avaliação</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {appliedResults.map(item => (
                                <tr key={item.agentId} className="bg-slate-900/20">
                                  <td className="px-3 py-2 text-slate-200">{item.agentName}</td>
                                  <td className="px-3 py-2 text-slate-300">{item.status}</td>
                                  <td className="px-3 py-2 text-slate-300">{item.matchedAt ? formatDateTime(item.matchedAt) : '-'}</td>
                                  <td className="px-3 py-2 text-slate-300">{item.lastEvaluatedAt ? formatDateTime(item.lastEvaluatedAt) : '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">Nenhum agente retornado pela regra.</p>
                      )}
                      </>
                      )}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsed);
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const maybeErrors = (error as { errors?: unknown }).errors;
    if (Array.isArray(maybeErrors) && maybeErrors.length > 0 && typeof maybeErrors[0] === 'string') {
      return maybeErrors[0];
    }

    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
      return maybeMessage;
    }

    const maybeError = (error as { error?: unknown }).error;
    if (typeof maybeError === 'string' && maybeError.trim()) {
      return maybeError;
    }
  }

  return fallback;
}

function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

interface ExpressionNodeEditorProps {
  node: AgentLabelRuleExpressionNodeDto;
  path: number[];
  isRoot?: boolean;
  insideDiskGroup?: boolean;
  availableCustomFields: AgentLabelAvailableCustomField[];
  onUpdateNode: (path: number[], updater: (node: AgentLabelRuleExpressionNodeDto) => AgentLabelRuleExpressionNodeDto) => void;
  onAddCondition: (path: number[]) => void;
  onAddGroup: (path: number[]) => void;
  onAddDiskGroup: (path: number[]) => void;
  onRemoveNode: (path: number[]) => void;
}

function ExpressionNodeEditor({ node, path, isRoot = false, insideDiskGroup = false, availableCustomFields, onUpdateNode, onAddCondition, onAddGroup, onAddDiskGroup, onRemoveNode }: ExpressionNodeEditorProps) {
  const depth = path.length - 1;
  const nodeAccent = depth >= 0 ? GROUP_ACCENTS[depth % GROUP_ACCENTS.length] : null;

  if (node.nodeType === AgentLabelNodeType.DiskGroup || node.nodeType === AgentLabelNodeType.Group) {
    const children = node.children ?? [];
    const isDisk = node.nodeType === AgentLabelNodeType.DiskGroup;

    return (
      <div className={`space-y-3 rounded-lg border ${nodeAccent ? `${nodeAccent.border} border-t-white/10 border-r-white/10 border-b-white/10` : 'border-white/10'} bg-slate-900/40 p-3`}>
        <div className="flex flex-wrap items-center gap-2">
          {nodeAccent ? <span className={`inline-block h-2 w-2 rounded-full ${nodeAccent.dot} shrink-0`} /> : null}
          <Badge color={isDisk ? 'warning' : 'primary'}>{isDisk ? 'Disco' : 'Grupo'}</Badge>
          <div className="min-w-[180px]">
            <Select
              value={String(node.logicalOperator ?? AgentLabelLogicalOperator.And)}
              options={logicalOperatorOptions}
              onChange={event => {
                const logicalOperator = Number(event.target.value) as AgentLabelLogicalOperator;
                onUpdateNode(path, current => ({ ...current, logicalOperator }));
              }}
            />
          </div>
          {!isDisk ? (
            <Button size="sm" variant="secondary" onClick={() => onAddCondition(path)}>+ Condição</Button>
          ) : null}
          <Button size="sm" variant="secondary" onClick={() => onAddDiskGroup(path)}>+ Disco</Button>
          <Button size="sm" variant="secondary" onClick={() => onAddGroup(path)}>+ Grupo</Button>
          {!isRoot ? <Button size="sm" variant="danger" onClick={() => onRemoveNode(path)}>Remover</Button> : null}
        </div>

        {isDisk ? (
          <p className="text-xs text-slate-500">
            <strong>ANY (OU):</strong> algum disco atende todas as condições abaixo &nbsp;|&nbsp; <strong>ALL (E):</strong> todos os discos atendem
          </p>
        ) : null}

        {children.length === 0 ? (
          <p className="text-xs text-slate-400">{isDisk ? 'Adicione condições de disco a este grupo.' : 'Este grupo ainda não possui filhos.'}</p>
        ) : (
          <div className="space-y-3 border-l border-white/10 pl-3">
            {children.map((child, index) => (
              <ExpressionNodeEditor
                key={index}
                node={child}
                path={[...path, index]}
                insideDiskGroup={isDisk}
                availableCustomFields={availableCustomFields}
                onUpdateNode={onUpdateNode}
                onAddCondition={onAddCondition}
                onAddGroup={onAddGroup}
                onAddDiskGroup={onAddDiskGroup}
                onRemoveNode={onRemoveNode}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const currentField = node.field ?? AgentLabelField.Hostname;
  const customFieldScope = getCustomFieldScopeTypeForRuleField(currentField);
  const customFieldOptions = customFieldScope === null
    ? []
    : availableCustomFields
        .filter(item => item.scopeType === customFieldScope)
        .map(item => ({ value: item.id, label: `${item.label} (${getCustomFieldDataTypeLabel(item.dataType as CustomFieldDataType)})` }));
  const selectedCfDef = node.customFieldDefinitionId
    ? availableCustomFields.find(item => item.id === node.customFieldDefinitionId)
    : undefined;
  const customFieldDataType = selectedCfDef?.dataType as CustomFieldDataType | undefined;
  const operatorOptions = getAllowedOperatorsForField(currentField, customFieldDataType)
    .map(operator => ({ value: String(operator), label: getAgentLabelComparisonOperatorLabel(operator) }));
  const currentValue = node.value ?? '';
  const valueHint = isCustomFieldAgentLabelField(currentField) && node.customFieldDefinitionId
    ? `Tipo: ${getCustomFieldDataTypeLabel(customFieldDataType ?? CustomFieldDataType.Text)} • Escopo: ${getCustomFieldScopeLabel(customFieldScope ?? 3)}`
    : undefined;
  function handleValueChange(newVal: string) {
    onUpdateNode(path, current => ({ ...current, value: newVal }));
  }
  const valueInput = (() => {
    if (currentField === AgentLabelField.Status) {
      return (
        <Select
          label="Valor"
          value={currentValue}
          options={Object.values(AgentStatus).map(s => ({ value: s, label: s }))}
          onChange={e => handleValueChange(e.target.value)}
        />
      );
    }
    if (isCustomFieldAgentLabelField(currentField)) {
      if (customFieldDataType === CustomFieldDataType.Boolean) {
        return (
          <Select
            label="Valor"
            value={currentValue}
            options={[{ value: '', label: 'Selecione...' }, { value: 'true', label: 'Verdadeiro' }, { value: 'false', label: 'Falso' }]}
            onChange={e => handleValueChange(e.target.value)}
          />
        );
      }
      const cfOpts = selectedCfDef?.options ?? [];
      if ((customFieldDataType === CustomFieldDataType.Dropdown || customFieldDataType === CustomFieldDataType.ListBox) && cfOpts.length > 0) {
        return (
          <Select
            label="Valor"
            value={currentValue}
            options={[{ value: '', label: 'Selecione...' }, ...cfOpts.map(opt => ({ value: opt, label: opt }))]}
            onChange={e => handleValueChange(e.target.value)}
          />
        );
      }
      if (customFieldDataType === CustomFieldDataType.Integer) {
        return <Input label="Valor" type="number" step="1" value={currentValue} hint={valueHint} onChange={e => handleValueChange(e.target.value)} />;
      }
      if (customFieldDataType === CustomFieldDataType.Decimal) {
        return <Input label="Valor" type="number" step="any" value={currentValue} hint={valueHint} onChange={e => handleValueChange(e.target.value)} />;
      }
      if (customFieldDataType === CustomFieldDataType.Date) {
        return <Input label="Valor" type="date" value={currentValue} hint={valueHint} onChange={e => handleValueChange(e.target.value)} />;
      }
      if (customFieldDataType === CustomFieldDataType.DateTime) {
        return <Input label="Valor" type="datetime-local" value={currentValue} hint={valueHint} onChange={e => handleValueChange(e.target.value)} />;
      }
    }
    return <Input label="Valor" value={currentValue} hint={valueHint} onChange={e => handleValueChange(e.target.value)} />;
  })();

    return (
      <div className={`space-y-3 rounded-lg border ${nodeAccent ? `${nodeAccent.border} border-t-white/10 border-r-white/10 border-b-white/10` : 'border-white/10'} bg-slate-900/40 p-3`}>
        <div className="flex flex-wrap items-center gap-2">
          {nodeAccent ? <span className={`inline-block h-2 w-2 rounded-full ${nodeAccent.dot} shrink-0`} /> : null}
          <Badge color="accent">Condição</Badge>
        <Button size="sm" variant="danger" onClick={() => onRemoveNode(path)}>Remover</Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Select
          label="Campo"
          value={String(currentField)}
          options={insideDiskGroup ? [...diskFieldOptions, ...fieldOptions] : fieldOptions}
          onChange={event => {
            const field = Number(event.target.value) as AgentLabelField;
            onUpdateNode(path, current => {
              const nextCustomFieldDefinitionId = isCustomFieldAgentLabelField(field)
                ? current.customFieldDefinitionId ?? null
                : null;
              const nextCustomFieldDataType = nextCustomFieldDefinitionId
                ? availableCustomFields.find(item => item.id === nextCustomFieldDefinitionId)?.dataType as CustomFieldDataType | undefined
                : undefined;
              const nextOperator = getAllowedOperatorsForField(field, nextCustomFieldDataType)[0] ?? AgentLabelComparisonOperator.Equals;
              return { ...current, field, customFieldDefinitionId: nextCustomFieldDefinitionId, operator: nextOperator };
            });
          }}
        />

        {isCustomFieldAgentLabelField(currentField) ? (
          <Select
            label="Custom Field"
            value={node.customFieldDefinitionId ?? ''}
            options={[{ value: '', label: 'Selecione...' }, ...customFieldOptions]}
            onChange={event => {
              const customFieldDefinitionId = event.target.value || null;
              onUpdateNode(path, current => {
                const selected = availableCustomFields.find(item => item.id === customFieldDefinitionId);
                const nextOperator = getAllowedOperatorsForField(currentField, selected?.dataType as CustomFieldDataType | undefined)[0] ?? AgentLabelComparisonOperator.Equals;
                return { ...current, customFieldDefinitionId, operator: nextOperator, value: current.value ?? '' };
              });
            }}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-white/10 px-3 py-2 text-sm text-slate-500 lg:pt-8">Campo nativo sem definição de custom field.</div>
        )}

        <Select
          label="Operador"
          value={String(node.operator ?? operatorOptions[0]?.value ?? AgentLabelComparisonOperator.Equals)}
          options={operatorOptions}
          onChange={event => {
            const operator = Number(event.target.value) as AgentLabelComparisonOperator;
            onUpdateNode(path, current => ({ ...current, operator }));
          }}
        />
      </div>

      {valueInput}
    </div>
  );
}

function addChildAtPath(root: AgentLabelRuleExpressionNodeDto, path: number[], child: AgentLabelRuleExpressionNodeDto): AgentLabelRuleExpressionNodeDto {
  return updateNodeAtPath(root, path, node => {
    if (node.nodeType !== AgentLabelNodeType.Group) {
      return node;
    }

    const children = node.children ?? [];
    return { ...node, children: [...children, structuredClone(child)] };
  });
}

function removeNodeAtPath(root: AgentLabelRuleExpressionNodeDto, path: number[]): AgentLabelRuleExpressionNodeDto {
  if (path.length === 0) {
    return root;
  }

  const parentPath = path.slice(0, -1);
  const removeIndex = path[path.length - 1];

  return updateNodeAtPath(root, parentPath, parent => {
    if (parent.nodeType !== AgentLabelNodeType.Group) {
      return parent;
    }

    const children = parent.children ?? [];
    return { ...parent, children: children.filter((_, index) => index !== removeIndex) };
  });
}

function updateNodeAtPath(
  root: AgentLabelRuleExpressionNodeDto,
  path: number[],
  updater: (node: AgentLabelRuleExpressionNodeDto) => AgentLabelRuleExpressionNodeDto,
): AgentLabelRuleExpressionNodeDto {
  if (path.length === 0) {
    return updater(root);
  }

  const [currentIndex, ...nextPath] = path;
  if (root.nodeType !== AgentLabelNodeType.Group) {
    return root;
  }

  const children = root.children ?? [];
  return {
    ...root,
    children: children.map((child, index) => (index !== currentIndex ? child : updateNodeAtPath(child, nextPath, updater))),
  };
}