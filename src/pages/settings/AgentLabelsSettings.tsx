import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Card, CardHeader, Button, Input, Select, TextArea, Loading, ErrorDisplay, Badge } from '@/components/ui';
import { agentsApi, clientsApi, sitesApi } from '@/api';
import { agentLabelsApi } from '@/modules/agent-labels/api';
import {
  AgentLabelApplyMode,
  AgentLabelComparisonOperator,
  AgentLabelField,
  AgentLabelLogicalOperator,
  AgentLabelNodeType,
  type AgentLabelRuleDryRunResponse,
  type AgentLabelRuleExpressionNodeDto,
  type AgentLabelRuleResponse,
} from '@/modules/agent-labels/types';
import { validateRulePayload } from '@/modules/agent-labels/validation';
import type { Agent, Client, Site } from '@/api';

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
};

const textFields = new Set<AgentLabelField>([
  AgentLabelField.Hostname,
  AgentLabelField.DisplayName,
  AgentLabelField.IpAddress,
  AgentLabelField.OperatingSystem,
  AgentLabelField.OsVersion,
  AgentLabelField.SoftwareName,
  AgentLabelField.SoftwarePublisher,
  AgentLabelField.SoftwareVersion,
  AgentLabelField.Processor,
]);

const numericFields = new Set<AgentLabelField>([
  AgentLabelField.SoftwareCount,
  AgentLabelField.TotalMemoryBytes,
  AgentLabelField.TotalDisksCount,
]);

const statusFields = new Set<AgentLabelField>([AgentLabelField.Status]);

const fieldOptions = Object.values(AgentLabelField).map(field => ({ value: field, label: field }));
const logicalOperatorOptions = Object.values(AgentLabelLogicalOperator).map(operator => ({ value: operator, label: operator }));

const applyModeOptions = [
  { value: AgentLabelApplyMode.ApplyOnly, label: 'Aplicar apenas (ApplyOnly)' },
  { value: AgentLabelApplyMode.ApplyAndRemove, label: 'Aplicar e remover (ApplyAndRemove)' },
];

export default function AgentLabelsSettings() {
  const [rules, setRules] = useState<AgentLabelRuleResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [isRunningPreview, setIsRunningPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [applyMode, setApplyMode] = useState<AgentLabelApplyMode>(AgentLabelApplyMode.ApplyOnly);
  const [editorMode, setEditorMode] = useState<'visual' | 'json'>('visual');
  const [showJsonInVisual, setShowJsonInVisual] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [expressionBuilder, setExpressionBuilder] = useState<AgentLabelRuleExpressionNodeDto>(
    defaultExpression,
  );
  const [expressionText, setExpressionText] = useState(JSON.stringify(defaultExpression, null, 2));

  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [previewLimit, setPreviewLimit] = useState(25);
  const [previewResults, setPreviewResults] = useState<Array<AgentLabelRuleDryRunResponse & { agentName: string }>>([]);

  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [rules],
  );

  async function loadRules() {
    setError(null);
    setIsLoading(true);
    try {
      const data = await agentLabelsApi.getRules(true);
      setRules(data);
    } catch (err) {
      const message = getApiErrorMessage(err, 'Falha ao carregar regras de labels.');
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadRules();
  }, []);

  useEffect(() => {
    async function loadClients() {
      try {
        const data = await clientsApi.list(false);
        setClients(data);
      } catch {
        toast.error('Falha ao carregar clientes para prévia.');
      }
    }

    void loadClients();
  }, []);

  useEffect(() => {
    async function loadSites() {
      if (!selectedClientId) {
        setSites([]);
        setSelectedSiteId('');
        setAgents([]);
        return;
      }

      try {
        const data = await sitesApi.list(selectedClientId, false);
        setSites(data);
        setSelectedSiteId('');
        setAgents([]);
        setPreviewResults([]);
      } catch {
        toast.error('Falha ao carregar sites para prévia.');
      }
    }

    void loadSites();
  }, [selectedClientId]);

  useEffect(() => {
    async function loadAgents() {
      if (!selectedSiteId) {
        setAgents([]);
        setPreviewResults([]);
        return;
      }

      try {
        const data = await agentsApi.listBySite(selectedSiteId);
        setAgents(data);
        setPreviewResults([]);
      } catch {
        toast.error('Falha ao carregar agents para prévia.');
      }
    }

    void loadAgents();
  }, [selectedSiteId]);

  useEffect(() => {
    setExpressionText(JSON.stringify(expressionBuilder, null, 2));
  }, [expressionBuilder]);

  async function handleCreateRule() {
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
    });

    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }

    setIsSaving(true);
    try {
      await agentLabelsApi.createRule({
        name: name.trim(),
        label: label.trim(),
        applyMode,
        expression: parsedExpression,
      });

      toast.success('Regra criada com sucesso.');
      setName('');
      setLabel('');
      setApplyMode(AgentLabelApplyMode.ApplyOnly);
      setEditorMode('visual');
      setExpressionBuilder(defaultExpression);
      await loadRules();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Falha ao criar regra.'));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleRule(rule: AgentLabelRuleResponse) {
    try {
      await agentLabelsApi.updateRule(rule.id, {
        name: rule.name,
        label: rule.label,
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
      toast.error(getApiErrorMessage(err, 'Falha ao reprocessar agents.'));
    } finally {
      setIsReprocessing(false);
    }
  }

  async function handleRunPreview() {
    if (!selectedSiteId) {
      toast.error('Selecione um site para simular a regra.');
      return;
    }

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
    });

    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      return;
    }

    const scopedAgents = agents.slice(0, Math.min(Math.max(previewLimit, 1), 100));
    if (scopedAgents.length === 0) {
      toast.error('Nenhum agent encontrado neste site para simulação.');
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
      toast.success(`Prévia concluída: ${matchedCount}/${responses.length} agents com match.`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Falha ao executar prévia da regra.'));
    } finally {
      setIsRunningPreview(false);
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
    return <ErrorDisplay message={error} onRetry={() => void loadRules()} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Labels Automáticas</h1>
        <p className="text-sm text-slate-400">
          Gerencie o cadastro e comportamento das regras de labels automáticas para agentes.
        </p>
      </div>

      <Card>
        <CardHeader title="Nova Regra" subtitle="Crie uma regra com editor visual ou JSON" />

        <div className="mb-4 flex justify-end">
          <Button size="sm" variant="ghost" onClick={() => setShowHelp(prev => !prev)}>
            {showHelp ? 'Recolher ajuda' : 'Ajuda das regras'}
          </Button>
        </div>

        {showHelp ? (
          <div className="mb-4 space-y-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            <div>
              <h3 className="font-semibold text-white">Como a regra funciona</h3>
              <p>
                Uma regra tem Nome, Label, Modo de Aplicação e uma expressão lógica. Quando a expressão dá match
                para um agent, a label pode ser adicionada ou removida conforme o modo.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-white">Grupo (Group)</h3>
              <p>
                O grupo combina filhos usando operador lógico And ou Or. And exige que todas as condições sejam
                verdadeiras. Or exige ao menos uma.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                No editor visual, use + Condição para regra simples e + Grupo para criar blocos aninhados.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-white">Condição (Condition)</h3>
              <p>
                Cada condição compara Campo, Operador e Valor, por exemplo: OperatingSystem Contains Windows.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-white">Operadores por tipo</h3>
              <p>
                Campos de texto aceitam Contains, StartsWith, EndsWith, Equals, NotEquals e Regex. Campos numéricos
                aceitam comparações numéricas. Status aceita apenas Equals e NotEquals.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-white">Modo de aplicação</h3>
              <p>
                ApplyOnly apenas adiciona a label quando der match. ApplyAndRemove adiciona quando der match e remove
                quando deixar de atender a expressão.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-white">Boas práticas</h3>
              <p>
                Use a seção Prévia de Aplicação para validar impacto antes de salvar. Se preferir, edite em JSON e
                clique em Aplicar JSON no Editor Visual para sincronizar.
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <Input
            label="Nome"
            placeholder="Ex.: Windows + VS"
            value={name}
            maxLength={200}
            onChange={event => setName(event.target.value)}
          />
          <Input
            label="Label"
            placeholder="Ex.: DEV"
            value={label}
            maxLength={120}
            onChange={event => setLabel(event.target.value)}
          />
        </div>
        <div className="mt-4">
          <Select
            label="Modo de Aplicação"
            value={applyMode}
            options={applyModeOptions}
            onChange={event => setApplyMode(event.target.value as AgentLabelApplyMode)}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={editorMode === 'visual' ? 'primary' : 'secondary'}
            onClick={() => setEditorMode('visual')}
          >
            Editor Visual
          </Button>
          <Button
            size="sm"
            variant={editorMode === 'json' ? 'primary' : 'secondary'}
            onClick={() => setEditorMode('json')}
          >
            Editor JSON
          </Button>
          {editorMode === 'visual' ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowJsonInVisual(prev => !prev)}
            >
              {showJsonInVisual ? 'Recolher JSON' : 'Mostrar JSON'}
            </Button>
          ) : null}
        </div>

        {editorMode === 'visual' ? (
          <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <ExpressionNodeEditor
              node={expressionBuilder}
              path={[]}
              isRoot
              onUpdateNode={handleUpdateNode}
              onAddCondition={handleAddCondition}
              onAddGroup={handleAddGroup}
              onRemoveNode={handleRemoveNode}
            />
          </div>
        ) : null}

        {editorMode === 'json' || showJsonInVisual ? (
          <div className="mt-4">
            <TextArea
              label="Expressão (JSON)"
              rows={12}
              value={expressionText}
              onChange={event => setExpressionText(event.target.value)}
            />
          </div>
        ) : null}
        {editorMode === 'json' ? (
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="secondary" onClick={handleApplyJsonToVisual}>
              Aplicar JSON no Editor Visual
            </Button>
          </div>
        ) : null}
        <div className="mt-4 flex justify-end">
          <Button onClick={() => void handleCreateRule()} loading={isSaving}>
            Cadastrar Regra
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Prévia de Aplicação"
          subtitle="Simule em agents de um site antes de salvar ou reprocessar"
        />
        <div className="grid gap-4 lg:grid-cols-4">
          <Select
            label="Cliente"
            value={selectedClientId}
            options={[
              { value: '', label: 'Selecione...' },
              ...clients.map(client => ({ value: client.id, label: client.name })),
            ]}
            onChange={event => setSelectedClientId(event.target.value)}
          />

          <Select
            label="Site"
            value={selectedSiteId}
            options={[
              { value: '', label: 'Selecione...' },
              ...sites.map(site => ({ value: site.id, label: site.name })),
            ]}
            onChange={event => setSelectedSiteId(event.target.value)}
          />

          <Input
            label="Limite de agents"
            type="number"
            min={1}
            max={100}
            value={previewLimit}
            onChange={event => setPreviewLimit(Number(event.target.value || 1))}
          />

          <div className="flex items-end">
            <Button
              className="w-full"
              variant="secondary"
              loading={isRunningPreview}
              onClick={() => void handleRunPreview()}
            >
              Rodar Prévia
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
          <span>Agents no site: {agents.length}</span>
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
                  <th className="px-3 py-2 text-left font-medium text-slate-300">Agent</th>
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
                    <td className="px-3 py-2">
                      <Badge color={result.matched ? 'success' : 'slate'}>{result.matched ? 'Sim' : 'Não'}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge color={result.wouldAddLabel ? 'success' : 'slate'}>
                        {result.wouldAddLabel ? 'Sim' : 'Não'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge color={result.wouldRemoveLabel ? 'warning' : 'slate'}>
                        {result.wouldRemoveLabel ? 'Sim' : 'Não'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {result.currentAutomaticLabels.length > 0
                        ? result.currentAutomaticLabels.join(', ')
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            Execute a prévia para ver em quais agents a regra teria efeito.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Regras Cadastradas"
          subtitle={`${sortedRules.length} regra(s)`}
          action={(
            <Button variant="secondary" size="sm" loading={isReprocessing} onClick={() => void handleReprocessAll()}>
              Reprocessar Agents
            </Button>
          )}
        />

        {sortedRules.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma regra cadastrada.</p>
        ) : (
          <div className="space-y-3">
            {sortedRules.map(rule => (
              <div key={rule.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium text-white">{rule.name}</h3>
                  <Badge color={rule.isEnabled ? 'success' : 'slate'}>
                    {rule.isEnabled ? 'Habilitada' : 'Desabilitada'}
                  </Badge>
                  <Badge color="accent">{rule.label}</Badge>
                  <Badge color="slate">{rule.applyMode}</Badge>
                </div>

                <p className="mt-2 text-xs text-slate-400">
                  Atualizada em {formatDateTime(rule.updatedAt)}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" onClick={() => void handleToggleRule(rule)}>
                    {rule.isEnabled ? 'Desabilitar' : 'Habilitar'}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void handleDeleteRule(rule)}>
                    Excluir
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
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

    const maybeError = (error as { error?: unknown }).error;
    if (typeof maybeError === 'string' && maybeError.trim()) {
      return maybeError;
    }
  }

  return fallback;
}

interface ExpressionNodeEditorProps {
  node: AgentLabelRuleExpressionNodeDto;
  path: number[];
  isRoot?: boolean;
  onUpdateNode: (path: number[], updater: (node: AgentLabelRuleExpressionNodeDto) => AgentLabelRuleExpressionNodeDto) => void;
  onAddCondition: (path: number[]) => void;
  onAddGroup: (path: number[]) => void;
  onRemoveNode: (path: number[]) => void;
}

function ExpressionNodeEditor({
  node,
  path,
  isRoot = false,
  onUpdateNode,
  onAddCondition,
  onAddGroup,
  onRemoveNode,
}: ExpressionNodeEditorProps) {
  if (node.nodeType === AgentLabelNodeType.Group) {
    const children = node.children ?? [];

    return (
      <div className="space-y-3 rounded-lg border border-white/10 bg-slate-900/40 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color="primary">Grupo</Badge>
          <div className="min-w-[180px]">
            <Select
              value={node.logicalOperator ?? AgentLabelLogicalOperator.And}
              options={logicalOperatorOptions}
              onChange={event => {
                const logicalOperator = event.target.value as AgentLabelLogicalOperator;
                onUpdateNode(path, current => ({ ...current, logicalOperator }));
              }}
            />
          </div>
          <Button size="sm" variant="secondary" onClick={() => onAddCondition(path)}>
            + Condição
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onAddGroup(path)}>
            + Grupo
          </Button>
          {!isRoot ? (
            <Button size="sm" variant="danger" onClick={() => onRemoveNode(path)}>
              Remover
            </Button>
          ) : null}
        </div>

        {children.length === 0 ? (
          <p className="text-xs text-slate-400">Este grupo ainda não possui filhos.</p>
        ) : (
          <div className="space-y-3 border-l border-white/10 pl-3">
            {children.map((child, index) => (
              <ExpressionNodeEditor
                key={index}
                node={child}
                path={[...path, index]}
                onUpdateNode={onUpdateNode}
                onAddCondition={onAddCondition}
                onAddGroup={onAddGroup}
                onRemoveNode={onRemoveNode}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const currentField = node.field ?? AgentLabelField.Hostname;
  const operatorOptions = getOperatorOptions(currentField);

  return (
    <div className="space-y-3 rounded-lg border border-white/10 bg-slate-900/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge color="accent">Condição</Badge>
        <Button size="sm" variant="danger" onClick={() => onRemoveNode(path)}>
          Remover
        </Button>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Select
          label="Campo"
          value={currentField}
          options={fieldOptions}
          onChange={event => {
            const field = event.target.value as AgentLabelField;
            onUpdateNode(path, current => {
              const nextOperator = normalizeOperator(field, current.operator ?? null);
              return { ...current, field, operator: nextOperator };
            });
          }}
        />
        <Select
          label="Operador"
          value={node.operator ?? operatorOptions[0]?.value ?? AgentLabelComparisonOperator.Equals}
          options={operatorOptions}
          onChange={event => {
            const operator = event.target.value as AgentLabelComparisonOperator;
            onUpdateNode(path, current => ({ ...current, operator }));
          }}
        />
        <Input
          label="Valor"
          value={node.value ?? ''}
          onChange={event => {
            const value = event.target.value;
            onUpdateNode(path, current => ({ ...current, value }));
          }}
        />
      </div>
    </div>
  );
}

function addChildAtPath(
  root: AgentLabelRuleExpressionNodeDto,
  path: number[],
  child: AgentLabelRuleExpressionNodeDto,
): AgentLabelRuleExpressionNodeDto {
  return updateNodeAtPath(root, path, node => {
    if (node.nodeType !== AgentLabelNodeType.Group) {
      return node;
    }

    const children = node.children ?? [];
    return {
      ...node,
      children: [...children, structuredClone(child)],
    };
  });
}

function removeNodeAtPath(
  root: AgentLabelRuleExpressionNodeDto,
  path: number[],
): AgentLabelRuleExpressionNodeDto {
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
    return {
      ...parent,
      children: children.filter((_, index) => index !== removeIndex),
    };
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
    children: children.map((child, index) => {
      if (index !== currentIndex) {
        return child;
      }

      return updateNodeAtPath(child, nextPath, updater);
    }),
  };
}

function getOperatorOptions(field: AgentLabelField): Array<{ value: AgentLabelComparisonOperator; label: string }> {
  if (numericFields.has(field)) {
    return [
      AgentLabelComparisonOperator.Equals,
      AgentLabelComparisonOperator.NotEquals,
      AgentLabelComparisonOperator.GreaterThan,
      AgentLabelComparisonOperator.GreaterThanOrEqual,
      AgentLabelComparisonOperator.LessThan,
      AgentLabelComparisonOperator.LessThanOrEqual,
    ].map(operator => ({ value: operator, label: operator }));
  }

  if (statusFields.has(field)) {
    return [AgentLabelComparisonOperator.Equals, AgentLabelComparisonOperator.NotEquals].map(operator => ({
      value: operator,
      label: operator,
    }));
  }

  return [
    AgentLabelComparisonOperator.Contains,
    AgentLabelComparisonOperator.NotContains,
    AgentLabelComparisonOperator.StartsWith,
    AgentLabelComparisonOperator.EndsWith,
    AgentLabelComparisonOperator.Equals,
    AgentLabelComparisonOperator.NotEquals,
    AgentLabelComparisonOperator.Regex,
  ].map(operator => ({ value: operator, label: operator }));
}

function normalizeOperator(
  field: AgentLabelField,
  current: AgentLabelComparisonOperator | null,
): AgentLabelComparisonOperator {
  const options = getOperatorOptions(field).map(option => option.value);
  if (current && options.includes(current)) {
    return current;
  }

  if (numericFields.has(field)) {
    return AgentLabelComparisonOperator.Equals;
  }

  if (statusFields.has(field)) {
    return AgentLabelComparisonOperator.Equals;
  }

  if (textFields.has(field)) {
    return AgentLabelComparisonOperator.Contains;
  }

  return AgentLabelComparisonOperator.Equals;
}