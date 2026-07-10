import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Badge, Button, Card, CardHeader, ErrorDisplay, Input, Loading, Select, TextArea } from '@/components/ui';
import {
  CustomFieldDataType,
  CustomFieldScopeType,
  formatCustomFieldValue,
  getCustomFieldDataTypeLabel,
  getCustomFieldScopeLabel,
  parseCustomFieldValue,
  type CustomFieldDefinition,
} from '@/api';
import {
  useCreateCustomFieldDefinition,
  useCustomFieldDefinitions,
  useCustomFieldValues,
  useDeleteCustomFieldDefinition,
  useUpdateCustomFieldDefinition,
  useUpsertCustomFieldValue,
} from '@/hooks';
import { agentsApi, clientsApi, sitesApi, type Agent, type Client, type Site } from '@/api';

type DefinitionFormState = {
  name: string;
  label: string;
  description: string;
  scopeType: string;
  dataType: string;
  optionsText: string;
};

const defaultDefinitionForm: DefinitionFormState = {
  name: '',
  label: '',
  description: '',
  scopeType: String(CustomFieldScopeType.Agent),
  dataType: String(CustomFieldDataType.Text),
  optionsText: '',
};

const scopeOptions = Object.values(CustomFieldScopeType)
  .filter((value): value is CustomFieldScopeType => typeof value === 'number')
  .map(value => ({ value: String(value), label: getCustomFieldScopeLabel(value) }));

const valueScopeOptions = scopeOptions.filter(
  option => option.value !== String(CustomFieldScopeType.Ticket),
);

const dataTypeOptions = Object.values(CustomFieldDataType)
  .filter((value): value is CustomFieldDataType => typeof value === 'number')
  .map(value => ({ value: String(value), label: getCustomFieldDataTypeLabel(value) }));

type StringifiedScope = `${CustomFieldScopeType}`;

export default function CustomFieldsSettings() {
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedScopeFilter, setSelectedScopeFilter] = useState('');
  const [editingDefinitionId, setEditingDefinitionId] = useState<string | null>(null);
  const [definitionForm, setDefinitionForm] = useState<DefinitionFormState>(defaultDefinitionForm);

  const [selectedValueScope, setSelectedValueScope] = useState<StringifiedScope>(`${CustomFieldScopeType.Agent}`);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [valueDrafts, setValueDrafts] = useState<Record<string, string>>({});

  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);

  const scopeFilter = selectedScopeFilter === '' ? undefined : (Number(selectedScopeFilter) as CustomFieldScopeType);
  const valueScope = Number(selectedValueScope) as CustomFieldScopeType;
  const valueEntityId = valueScope === CustomFieldScopeType.Server
    ? undefined
    : valueScope === CustomFieldScopeType.Client
      ? selectedClientId || undefined
      : valueScope === CustomFieldScopeType.Site
        ? selectedSiteId || undefined
        : valueScope === CustomFieldScopeType.Agent
          ? selectedAgentId || undefined
          : undefined;

  const definitionsQuery = useCustomFieldDefinitions({ scopeType: scopeFilter, includeInactive });
  const valuesQuery = useCustomFieldValues(
    valueScope,
    {
      entityId: valueEntityId,
      clientId: valueScope === CustomFieldScopeType.Site ? selectedClientId || undefined : undefined,
      includeSecrets,
    },
    valueScope === CustomFieldScopeType.Server || Boolean(valueEntityId),
  );
  const createDefinition = useCreateCustomFieldDefinition();
  const updateDefinition = useUpdateCustomFieldDefinition();
  const deleteDefinition = useDeleteCustomFieldDefinition();
  const upsertValue = useUpsertCustomFieldValue();

  useEffect(() => {
    let cancelled = false;

    async function loadClients() {
      try {
        const data = await clientsApi.list(false);
        if (cancelled) return;
        setClients(data);
      } catch {
        if (cancelled) return;
        toast.error('Falha ao carregar clientes.');
      }
    }

    void loadClients();
    return () => { cancelled = true; };
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
      } catch {
        if (cancelled) return;
        toast.error('Falha ao carregar sites.');
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
        return;
      }

      try {
        const data = await agentsApi.listBySite(selectedSiteId);
        if (cancelled) return;
        setAgents(data);
        setSelectedAgentId('');
      } catch {
        if (cancelled) return;
        toast.error('Falha ao carregar agentes.');
      }
    }

    void loadAgents();
    return () => { cancelled = true; };
  }, [selectedSiteId]);

  useEffect(() => {
    const nextDrafts = Object.fromEntries((valuesQuery.data ?? []).map(item => [item.definitionId, formatCustomFieldValue(item.value)]));
    setValueDrafts(nextDrafts);
  }, [valuesQuery.data]);

  const scopedDefinitions = useMemo(() => {
    const items = definitionsQuery.data ?? [];
    return items.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [definitionsQuery.data]);

  const valueDefinitions = useMemo(
    () => scopedDefinitions.filter(item => item.scopeType === valueScope),
    [scopedDefinitions, valueScope],
  );

  function resetDefinitionForm() {
    setEditingDefinitionId(null);
    setDefinitionForm(defaultDefinitionForm);
  }

  function editDefinition(definition: CustomFieldDefinition) {
    setEditingDefinitionId(definition.id);
    setDefinitionForm({
      name: definition.name,
      label: definition.label,
      description: definition.description ?? '',
      scopeType: String(definition.scopeType),
      dataType: String(definition.dataType),
      optionsText: definition.options.join(', '),
    });
  }

  async function handleSaveDefinition() {
    const name = definitionForm.name.trim();
    const label = definitionForm.label.trim();
    const scopeType = Number(definitionForm.scopeType) as CustomFieldScopeType;
    const dataType = Number(definitionForm.dataType) as CustomFieldDataType;
    const options = definitionForm.optionsText.split(',').map(item => item.trim()).filter(Boolean);

    if (!name || !label) {
      toast.error('Nome e label são obrigatórios.');
      return;
    }

    if ((dataType === CustomFieldDataType.Dropdown || dataType === CustomFieldDataType.ListBox) && options.length === 0) {
      toast.error('Dropdown e ListBox exigem opções.');
      return;
    }

    const payload = {
      name,
      label,
      description: definitionForm.description.trim() || null,
      scopeType,
      dataType,
      options,
    };

    try {
      if (editingDefinitionId) {
        await updateDefinition.mutateAsync({ id: editingDefinitionId, payload });
        toast.success('Definição atualizada.');
      } else {
        await createDefinition.mutateAsync(payload);
        toast.success('Definição criada.');
      }
      resetDefinitionForm();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Falha ao salvar definição.'));
    }
  }

  async function handleDeleteDefinition(definition: CustomFieldDefinition) {
    if (!confirm(`Desativar o custom field "${definition.label}"?`)) {
      return;
    }

    try {
      await deleteDefinition.mutateAsync(definition.id);
      toast.success('Definição desativada.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Falha ao desativar definição.'));
    }
  }

  async function handleSaveValue(definition: CustomFieldDefinition) {
    if (definition.scopeType !== CustomFieldScopeType.Server && !valueEntityId) {
      toast.error('Selecione a entidade do escopo antes de salvar.');
      return;
    }

    try {
      await upsertValue.mutateAsync({
        definitionId: definition.id,
        clientId: definition.scopeType === CustomFieldScopeType.Site ? selectedClientId || undefined : undefined,
        payload: {
          scopeType: definition.scopeType,
          entityId: definition.scopeType === CustomFieldScopeType.Server ? null : valueEntityId ?? null,
          value: parseCustomFieldValue(definition.dataType, valueDrafts[definition.id] ?? ''),
        },
      });
      toast.success(`Valor salvo para ${definition.label}.`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Falha ao salvar valor.'));
    }
  }

  if (definitionsQuery.isLoading) {
    return <Loading message="Carregando custom fields..." />;
  }

  if (definitionsQuery.isError) {
    return <ErrorDisplay message="Falha ao carregar custom fields." onRetry={() => void definitionsQuery.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Custom Fields</h1>
        <p className="text-sm text-muted">Gerencie definições por escopo e os valores por Servidor, Cliente, Site e Agente. Campos de Ticket sao preenchidos dentro do chamado.</p>
      </div>

      <Card>
        <CardHeader title={editingDefinitionId ? 'Editar Definição' : 'Nova Definição'} subtitle="Cadastre o campo e escolha o escopo e o tipo de dado." />
        <div className="grid gap-4 lg:grid-cols-2">
          <Input label="Name" value={definitionForm.name} onChange={event => setDefinitionForm(prev => ({ ...prev, name: event.target.value }))} />
          <Input label="Label" value={definitionForm.label} onChange={event => setDefinitionForm(prev => ({ ...prev, label: event.target.value }))} />
        </div>
        <div className="mt-4">
          <TextArea label="Descrição" rows={3} value={definitionForm.description} onChange={event => setDefinitionForm(prev => ({ ...prev, description: event.target.value }))} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Select label="Escopo" value={definitionForm.scopeType} options={scopeOptions} onChange={event => setDefinitionForm(prev => ({ ...prev, scopeType: event.target.value }))} />
          <Select label="Tipo de dado" value={definitionForm.dataType} options={dataTypeOptions} onChange={event => setDefinitionForm(prev => ({ ...prev, dataType: event.target.value }))} />
        </div>
        <div className="mt-4">
          <TextArea label="Opções (vírgula separada)" rows={2} hint="Obrigatório para Dropdown e ListBox." value={definitionForm.optionsText} onChange={event => setDefinitionForm(prev => ({ ...prev, optionsText: event.target.value }))} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={resetDefinitionForm}>Cancelar</Button>
          <Button onClick={() => void handleSaveDefinition()} loading={createDefinition.isPending || updateDefinition.isPending}>{editingDefinitionId ? 'Salvar Definição' : 'Criar Definição'}</Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Definições" subtitle="Liste, filtre e desative custom fields." />
        <div className="grid gap-4 lg:grid-cols-3">
          <Select label="Escopo" value={selectedScopeFilter} options={[{ value: '', label: 'Todos' }, ...scopeOptions]} onChange={event => setSelectedScopeFilter(event.target.value)} />
          <Select
            label="Inativos"
            value={includeInactive ? 'true' : 'false'}
            options={[{ value: 'false', label: 'Somente ativos' }, { value: 'true', label: 'Incluir inativos' }]}
            onChange={event => setIncludeInactive(event.target.value === 'true')}
          />
        </div>

        <div className="mt-4 space-y-3">
          {scopedDefinitions.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma definição encontrada.</p>
          ) : (
            scopedDefinitions.map(definition => (
              <div key={definition.id} className="rounded-lg border border-border bg-surface-light p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium text-foreground">{definition.label}</h3>
                  <Badge color={definition.isActive ? 'success' : 'warning'}>{definition.isActive ? 'Ativo' : 'Inativo'}</Badge>
                  <Badge color="accent">{getCustomFieldScopeLabel(definition.scopeType)}</Badge>
                  <Badge color="slate">{getCustomFieldDataTypeLabel(definition.dataType)}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted">Name: {definition.name}</p>
                {definition.description ? <p className="mt-2 text-sm text-muted-foreground">{definition.description}</p> : null}
                {definition.options.length > 0 ? <p className="mt-2 text-xs text-muted">Opções: {definition.options.join(', ')}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => editDefinition(definition)}>Editar</Button>
                  <Button size="sm" variant="danger" onClick={() => void handleDeleteDefinition(definition)}>Desativar</Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Valores por Escopo" subtitle="Selecione a entidade e edite os valores das definições correspondentes. Valores de Ticket sao gerenciados no detalhe do chamado." />
        <div className="grid gap-4 lg:grid-cols-4">
          <Select label="Escopo" value={selectedValueScope} options={valueScopeOptions} onChange={event => setSelectedValueScope(event.target.value as StringifiedScope)} />
          <Select label="Cliente" value={selectedClientId} options={[{ value: '', label: 'Selecione...' }, ...clients.map(client => ({ value: client.id, label: client.name }))]} onChange={event => setSelectedClientId(event.target.value)} disabled={valueScope === CustomFieldScopeType.Server} />
          <Select label="Site" value={selectedSiteId} options={[{ value: '', label: 'Selecione...' }, ...sites.map(site => ({ value: site.id, label: site.name }))]} onChange={event => setSelectedSiteId(event.target.value)} disabled={valueScope === CustomFieldScopeType.Server || valueScope === CustomFieldScopeType.Client} />
          <Select label="Agente" value={selectedAgentId} options={[{ value: '', label: 'Selecione...' }, ...agents.map(agent => ({ value: agent.id, label: agent.displayName || agent.hostname || agent.id }))]} onChange={event => setSelectedAgentId(event.target.value)} disabled={valueScope !== CustomFieldScopeType.Agent} />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Select label="Secrets" value={includeSecrets ? 'true' : 'false'} options={[{ value: 'false', label: 'Não incluir secrets' }, { value: 'true', label: 'Incluir secrets' }]} onChange={event => setIncludeSecrets(event.target.value === 'true')} />
        </div>

        {valuesQuery.isLoading ? (
          <div className="mt-4"><Loading message="Carregando valores..." /></div>
        ) : valuesQuery.isError ? (
          <div className="mt-4"><ErrorDisplay message="Falha ao carregar valores." onRetry={() => void valuesQuery.refetch()} /></div>
        ) : (
          <div className="mt-4 space-y-3">
            {valueDefinitions.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma definição para este escopo.</p>
            ) : (
              valueDefinitions.map(definition => (
                <div key={definition.id} className="rounded-lg border border-border bg-surface-light p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-foreground">{definition.label}</h3>
                    <Badge color="accent">{getCustomFieldDataTypeLabel(definition.dataType)}</Badge>
                    <Badge color="slate">{getCustomFieldScopeLabel(definition.scopeType)}</Badge>
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
                    <DefinitionValueInput
                      definition={definition}
                      value={valueDrafts[definition.id] ?? ''}
                      onChange={value => setValueDrafts(prev => ({ ...prev, [definition.id]: value }))}
                    />
                    <div className="flex items-end">
                      <Button className="w-full" loading={upsertValue.isPending} onClick={() => void handleSaveValue(definition)}>Salvar Valor</Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
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

function DefinitionValueInput({
  definition,
  value,
  onChange,
}: {
  definition: CustomFieldDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  switch (definition.dataType) {
    case CustomFieldDataType.Boolean:
      return (
        <Select
          label="Valor"
          value={value}
          options={[
            { value: '', label: 'Selecione...' },
            { value: 'true', label: 'Verdadeiro' },
            { value: 'false', label: 'Falso' },
          ]}
          onChange={e => onChange(e.target.value)}
        />
      );
    case CustomFieldDataType.Dropdown:
      return (
        <Select
          label="Valor"
          value={value}
          options={[
            { value: '', label: 'Selecione...' },
            ...definition.options.map(opt => ({ value: opt, label: opt })),
          ]}
          onChange={e => onChange(e.target.value)}
        />
      );
    case CustomFieldDataType.ListBox:
      return (
        <TextArea
          label="Valor (vírgula separado)"
          rows={2}
          value={value}
          hint={definition.options.length > 0 ? `Opções: ${definition.options.join(', ')}` : undefined}
          onChange={e => onChange(e.target.value)}
        />
      );
    case CustomFieldDataType.Integer:
      return <Input label="Valor" type="number" step="1" value={value} onChange={e => onChange(e.target.value)} />;
    case CustomFieldDataType.Decimal:
      return <Input label="Valor" type="number" step="any" value={value} onChange={e => onChange(e.target.value)} />;
    case CustomFieldDataType.Date:
      return <Input label="Valor" type="date" value={value} onChange={e => onChange(e.target.value)} />;
    case CustomFieldDataType.DateTime:
      return <Input label="Valor" type="datetime-local" value={value} onChange={e => onChange(e.target.value)} />;
    default:
      return <Input label="Valor" value={value} onChange={e => onChange(e.target.value)} />;
  }
}