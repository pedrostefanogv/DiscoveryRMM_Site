import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Lock, Sparkles, Globe, Building2, Layers } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorDisplay,
  Input,
  Loading,
  Modal,
  Select,
  TextArea,
} from '@/components/ui';
import {
  CustomFieldDataType,
  getCustomFieldDataTypeLabel,
  type CustomFieldTemplateDto,
  type UpsertCustomFieldTemplateRequest,
} from '@/api';
import {
  useCreateCustomFieldTemplate,
  useCustomFieldTemplates,
  useDeleteCustomFieldTemplate,
  useUpdateCustomFieldTemplate,
} from '@/hooks/useCustomFieldTemplates';
import { useClients } from '@/hooks/useClients';
import { useDepartments } from '@/hooks/useDepartments';
import { fieldMaskPlaceholder } from '@/utils/fieldMask';

const DATA_TYPE_OPTIONS = Object.values(CustomFieldDataType)
  .filter((value): value is CustomFieldDataType => typeof value === 'number')
  .map((value) => ({ value: String(value), label: getCustomFieldDataTypeLabel(value) }));

const EMPTY: UpsertCustomFieldTemplateRequest = {
  clientId: null,
  departmentId: null,
  name: '',
  label: '',
  description: null,
  dataType: CustomFieldDataType.Text,
  options: [],
  validationRegex: null,
  inputMask: null,
  minLength: null,
  maxLength: null,
  minValue: null,
  maxValue: null,
  defaultIsRequired: false,
  isActive: true,
  sortOrder: 100,
};

/**
 * Gestão dos modelos de campos personalizados (catálogo pré-configurado) com
 * escopo global, por cliente e por departamento. Modelos built-in vêm semeados
 * pelo servidor e não podem ser excluídos — apenas desativados.
 */
export function CustomFieldTemplatesSection() {
  // allScopes: a gestão precisa enxergar modelos de cliente/departamento.
  const templatesQuery = useCustomFieldTemplates({ allScopes: true, includeInactive: true });
  const clients = useClients();
  const clientsById = useMemo(
    () => new Map((clients.data ?? []).map((client) => [client.id, client.name])),
    [clients.data],
  );

  const [scopeClient, setScopeClient] = useState('');
  const [scopeDepartment, setScopeDepartment] = useState('');
  const scopeDepartments = useDepartments({
    clientId: scopeClient || undefined,
    includeGlobal: true,
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CustomFieldTemplateDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomFieldTemplateDto | null>(null);
  const deleteMutation = useDeleteCustomFieldTemplate();

  const templates = useMemo(() => {
    const items = (templatesQuery.data ?? []).filter((template) => {
      // Filtrar por cliente mostra o escopo do cliente + os globais; o mesmo
      // vale para departamento (evita "sumir" com o catálogo global).
      if (scopeClient && template.clientId && template.clientId !== scopeClient) return false;
      if (scopeDepartment && template.departmentId && template.departmentId !== scopeDepartment) return false;
      return true;
    });
    return items
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'pt-BR'));
  }, [templatesQuery.data, scopeClient, scopeDepartment]);

  const openCreate = () => { setEditing(null); setOpen(true); };
  const openEdit = (template: CustomFieldTemplateDto) => { setEditing(template); setOpen(true); };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => { toast.success('Modelo desativado.'); setDeleteTarget(null); },
      onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Erro ao desativar modelo.'),
    });
  };

  const scopeBadge = (template: CustomFieldTemplateDto) => {
    if (template.clientId) {
      return (
        <Badge color="accent">
          <Building2 className="mr-0.5 inline h-3 w-3" />
          {clientsById.get(template.clientId) ?? 'Cliente'}
        </Badge>
      );
    }
    if (template.departmentId) {
      return (
        <Badge color="warning">
          <Layers className="mr-0.5 inline h-3 w-3" />
          Departamento
        </Badge>
      );
    }
    return (
      <Badge color="slate">
        <Globe className="mr-0.5 inline h-3 w-3" />
        Global
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader
        title="Modelos de campos"
        subtitle="Modelos pré-configurados (tipo, máscara, validador e limites) usados ao criar um campo personalizado. Podem ser globais, de um cliente ou de um departamento."
      />

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Select
          label="Filtrar por cliente"
          options={[
            { value: '', label: 'Todos os clientes' },
            ...(clients.data ?? []).map((client) => ({ value: client.id, label: client.name })),
          ]}
          value={scopeClient}
          onChange={(e) => { setScopeClient(e.target.value); setScopeDepartment(''); }}
        />
        <Select
          label="Filtrar por departamento"
          options={[
            { value: '', label: 'Todos os departamentos' },
            ...(scopeDepartments.data ?? []).map((department) => ({
              value: department.id,
              label: department.name,
            })),
          ]}
          value={scopeDepartment}
          disabled={(scopeDepartments.data ?? []).length === 0}
          onChange={(e) => setScopeDepartment(e.target.value)}
        />
        <div className="flex items-end justify-between gap-2">
          <p className="text-xs text-muted">
            {templates.length} modelo(s) — {templates.filter((t) => t.isBuiltIn).length} built-in.
          </p>
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4" /> Novo modelo</Button>
        </div>
      </div>

      {templatesQuery.isLoading && <Loading message="Carregando modelos..." />}
      {templatesQuery.isError && (
        <ErrorDisplay message="Falha ao carregar modelos de campos." onRetry={() => void templatesQuery.refetch()} />
      )}

      {!templatesQuery.isLoading && templates.length === 0 && (
        <p className="py-4 text-sm text-muted">Nenhum modelo encontrado para o filtro atual.</p>
      )}

      <div className="space-y-2">
        {templates.map((template) => (
          <div
            key={template.id}
            className={`rounded-lg border px-3 py-2.5 ${template.isActive ? 'border-border bg-surface-light' : 'border-border bg-surface-light opacity-60'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground">{template.label}</span>
                  {scopeBadge(template)}
                  <Badge color="slate">{getCustomFieldDataTypeLabel(template.dataType)}</Badge>
                  {template.defaultIsRequired && <Badge color="warning">Obrigatório</Badge>}
                  {template.isBuiltIn && (
                    <Badge color="accent"><Sparkles className="mr-0.5 inline h-3 w-3" />Built-in</Badge>
                  )}
                  {!template.isActive && <Badge color="danger">Inativo</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  <code className="text-[11px]">{template.name}</code>
                  {template.description && ` — ${template.description}`}
                </p>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted">
                  {template.validationRegex && <span>Regex: <code>{template.validationRegex}</code></span>}
                  {template.inputMask && <span>Máscara: <code>{template.inputMask}</code> ({fieldMaskPlaceholder(template.inputMask)})</span>}
                  {template.options.length > 0 && <span>Opções: {template.options.join(', ')}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => openEdit(template)} aria-label="Editar" className="p-1 text-muted hover:text-foreground transition-colors">
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDeleteTarget(template)}
                  aria-label="Desativar"
                  disabled={template.isBuiltIn}
                  title={template.isBuiltIn ? 'Modelos built-in não podem ser excluídos (apenas desativados pela API)' : 'Desativar'}
                  className="p-1 text-muted hover:text-danger transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {template.isBuiltIn ? <Lock className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <TemplateModelFormModal
          template={editing}
          clientOptions={(clients.data ?? []).map((client) => ({ value: client.id, label: client.name }))}
          onClose={() => setOpen(false)}
        />
      )}

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Desativar modelo"
        maxWidth="max-w-md"
      >
        <p className="text-sm text-muted-foreground">
          Desativar o modelo <strong>{deleteTarget?.label}</strong>? Ele deixa de aparecer no seletor de
          modelos, mas campos já criados a partir dele não são afetados.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
          <Button variant="danger" loading={deleteMutation.isPending} onClick={handleDelete}>Desativar</Button>
        </div>
      </Modal>
    </Card>
  );
}

function toFormState(template: CustomFieldTemplateDto | null): UpsertCustomFieldTemplateRequest {
  if (!template) return { ...EMPTY };
  return {
    clientId: template.clientId,
    departmentId: template.departmentId,
    name: template.name,
    label: template.label,
    description: template.description,
    dataType: template.dataType,
    options: template.options,
    validationRegex: template.validationRegex,
    inputMask: template.inputMask,
    minLength: template.minLength,
    maxLength: template.maxLength,
    minValue: template.minValue,
    maxValue: template.maxValue,
    defaultIsRequired: template.defaultIsRequired,
    isActive: template.isActive,
    sortOrder: template.sortOrder,
  };
}

function TemplateModelFormModal({
  template,
  clientOptions,
  onClose,
}: {
  template: CustomFieldTemplateDto | null;
  clientOptions: { value: string; label: string }[];
  onClose: () => void;
}) {
  const isEdit = template !== null;
  const createMutation = useCreateCustomFieldTemplate();
  const updateMutation = useUpdateCustomFieldTemplate();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const [form, setForm] = useState<UpsertCustomFieldTemplateRequest>(() => toFormState(template));
  const [optionsText, setOptionsText] = useState(() => (template?.options ?? []).join(', '));

  // Departamentos do cliente escolhido (+ globais).
  const departments = useDepartments({ clientId: form.clientId ?? undefined, includeGlobal: true });
  const departmentOptions = [
    { value: '', label: 'Nenhum (qualquer departamento)' },
    ...(departments.data ?? []).map((department) => ({ value: department.id, label: department.name })),
  ];

  const needsOptions =
    form.dataType === CustomFieldDataType.Dropdown || form.dataType === CustomFieldDataType.ListBox;
  const showLength = form.dataType === CustomFieldDataType.Text;
  const showMinMax =
    form.dataType === CustomFieldDataType.Integer || form.dataType === CustomFieldDataType.Decimal;

  const set = <K extends keyof UpsertCustomFieldTemplateRequest>(key: K, value: UpsertCustomFieldTemplateRequest[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async () => {
    const name = form.name.trim();
    const label = form.label.trim();
    if (name.length < 2 || !label) {
      toast.error('Informe nome (mín. 2) e rótulo do modelo.');
      return;
    }

    const options = optionsText.split(',').map((item) => item.trim()).filter(Boolean);
    if (needsOptions && options.length === 0) {
      toast.error('Dropdown e ListBox exigem pelo menos uma opção.');
      return;
    }

    const regex = form.validationRegex?.trim() || null;
    if (regex) {
      try {
        // eslint-disable-next-line no-new
        new RegExp(regex);
      } catch {
        toast.error('Regex de validação inválida.');
        return;
      }
    }

    if (form.minLength != null && form.maxLength != null && form.minLength > form.maxLength) {
      toast.error('Tamanho mínimo não pode ser maior que o máximo.');
      return;
    }
    if (form.minValue != null && form.maxValue != null && form.minValue > form.maxValue) {
      toast.error('Valor mínimo não pode ser maior que o máximo.');
      return;
    }

    const payload: UpsertCustomFieldTemplateRequest = {
      ...form,
      name,
      label,
      description: form.description?.trim() || null,
      options: needsOptions ? options : [],
      validationRegex: regex,
      inputMask: form.inputMask?.trim() || null,
      minLength: showLength ? form.minLength : null,
      maxLength: showLength ? form.maxLength : null,
      minValue: showMinMax ? form.minValue : null,
      maxValue: showMinMax ? form.maxValue : null,
    };

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: template.id, data: payload });
        toast.success('Modelo atualizado.');
      } else {
        await createMutation.mutateAsync(payload);
        toast.success('Modelo criado.');
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar modelo.');
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `Editar modelo: ${template.label}` : 'Novo modelo de campo'}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Cliente (escopo)"
            options={[{ value: '', label: 'Global (todos os clientes)' }, ...clientOptions]}
            value={form.clientId ?? ''}
            onChange={(e) => {
              // Troca de cliente zera o departamento (escopo muda).
              setForm((current) => ({ ...current, clientId: e.target.value || null, departmentId: null }));
            }}
          />
          <Select
            label="Departamento (escopo)"
            options={departmentOptions}
            value={form.departmentId ?? ''}
            disabled={departments.isLoading}
            onChange={(e) => set('departmentId', e.target.value || null)}
            hint="Deixe vazio para valer em todos os departamentos do escopo."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Nome *"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="ex: cpf"
            hint="Identificador único no escopo ([a-z0-9_-])"
            disabled={template?.isBuiltIn}
          />
          <Input label="Rótulo *" value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="ex: CPF" />
        </div>

        <Input
          label="Descrição"
          value={form.description ?? ''}
          onChange={(e) => set('description', e.target.value || null)}
          placeholder="Texto de ajuda exibido no seletor"
        />

        <Select
          label="Tipo do campo *"
          value={String(form.dataType)}
          options={DATA_TYPE_OPTIONS}
          onChange={(e) => set('dataType', Number(e.target.value) as CustomFieldDataType)}
          disabled={template?.isBuiltIn}
          hint={template?.isBuiltIn ? 'O tipo de um modelo built-in não pode ser alterado.' : undefined}
        />

        {needsOptions && (
          <TextArea
            label="Opções *"
            rows={3}
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            hint="Valores separados por vírgula. Ex: Orçamento, Compra, Cotação"
          />
        )}

        <Input
          label="Máscara de entrada"
          value={form.inputMask ?? ''}
          onChange={(e) => set('inputMask', e.target.value || null)}
          placeholder="ex: 999.999.999-99"
          hint={
            form.inputMask
              ? `Exemplo: ${fieldMaskPlaceholder(form.inputMask)} (9=dígito, A=letra, *=alfanumérico)`
              : 'Opcional. 9=dígito, A=letra, *=alfanumérico; demais caracteres são literais.'
          }
        />

        <Input
          label="Validador (regex)"
          value={form.validationRegex ?? ''}
          onChange={(e) => set('validationRegex', e.target.value || null)}
          placeholder="ex: ^\d{11}$"
          hint="Aplicado no servidor quando o campo for preenchido."
        />

        {showLength && (
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Tamanho mínimo"
              type="number"
              value={form.minLength ?? ''}
              onChange={(e) => set('minLength', e.target.value ? Number(e.target.value) : null)}
            />
            <Input
              label="Tamanho máximo"
              type="number"
              value={form.maxLength ?? ''}
              onChange={(e) => set('maxLength', e.target.value ? Number(e.target.value) : null)}
            />
          </div>
        )}

        {showMinMax && (
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Valor mínimo"
              type="number"
              value={form.minValue ?? ''}
              onChange={(e) => set('minValue', e.target.value ? Number(e.target.value) : null)}
            />
            <Input
              label="Valor máximo"
              type="number"
              value={form.maxValue ?? ''}
              onChange={(e) => set('maxValue', e.target.value ? Number(e.target.value) : null)}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={form.defaultIsRequired}
              onChange={(e) => set('defaultIsRequired', e.target.checked)}
              className="rounded border-border bg-surface-light"
            />
            Sugerir como obrigatório
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set('isActive', e.target.checked)}
              className="rounded border-border bg-surface-light"
            />
            Ativo
          </label>
          <Input
            label="Ordem"
            type="number"
            className="w-24"
            value={form.sortOrder}
            onChange={(e) => set('sortOrder', Number(e.target.value) || 0)}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void handleSubmit()} loading={isPending}>{isEdit ? 'Salvar' : 'Criar modelo'}</Button>
        </div>
      </div>
    </Modal>
  );
}
