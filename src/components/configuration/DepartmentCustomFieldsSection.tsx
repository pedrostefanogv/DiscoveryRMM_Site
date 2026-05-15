import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Pencil, Trash2, Shield } from "lucide-react";
import {
  Badge,
  Button,
  ErrorDisplay,
  Input,
  Loading,
  Modal,
  Select,
  TextArea,
} from "@/components/ui";
import {
  CustomFieldDataType,
  getCustomFieldDataTypeLabel,
  type DepartmentCustomFieldDefinition,
  type CreateDepartmentCustomFieldRequest,
} from "@/api";
import {
  useDepartmentCustomFields,
  useCreateDepartmentCustomField,
  useUpdateDepartmentCustomField,
  useDeleteDepartmentCustomField,
} from "@/hooks/useDepartmentCustomFields";

// ── Helpers ──────────────────────────────────────────────

function parseOptionsFromJson(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed.map((s) => String(s ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
  return [];
}

function formatOptionsForInput(options: string[]): string {
  return options.join(", ");
}

function parseOptionsFromInput(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const DATA_TYPE_OPTIONS = Object.values(CustomFieldDataType)
  .filter((v): v is CustomFieldDataType => typeof v === "number")
  .map((v) => ({ value: String(v), label: getCustomFieldDataTypeLabel(v) }));

// ── Main Component ──────────────────────────────────────

export function DepartmentCustomFieldsSection({
  departmentId,
}: {
  departmentId: string;
}) {
  const fieldsQuery = useDepartmentCustomFields(departmentId);

  if (fieldsQuery.isLoading) return <Loading message="Carregando campos..." />;
  if (fieldsQuery.isError)
    return (
      <ErrorDisplay
        message="Erro ao carregar campos customizados."
        onRetry={() => fieldsQuery.refetch()}
      />
    );

  const fields = fieldsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Campos Customizados</h3>
          <p className="text-xs text-slate-400">
            {fields.length} campo(s) — esses campos aparecerão no formulário de abertura de chamado
          </p>
        </div>
        <CreateFieldButton departmentId={departmentId} />
      </div>

      {fields.length === 0 ? (
        <p className="text-sm text-slate-500 py-4 text-center">
          Nenhum campo customizado. Adicione campos para o formulário de chamados.
        </p>
      ) : (
        <div className="space-y-2">
          {fields.map((field) => (
            <FieldRow key={field.id} field={field} departmentId={departmentId} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Field Row ────────────────────────────────────────────

function FieldRow({
  field,
  departmentId,
}: {
  field: DepartmentCustomFieldDefinition;
  departmentId: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const deleteMutation = useDeleteDepartmentCustomField();

  const options = useMemo(() => parseOptionsFromJson(field.optionsJson), [field.optionsJson]);

  const handleDelete = () => {
    if (!confirm(`Remover o campo "${field.label}"? Os valores já preenchidos serão preservados.`))
      return;
    deleteMutation.mutate(
      { departmentId, fieldId: field.id },
      {
        onSuccess: () => toast.success("Campo removido."),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remover campo."),
      },
    );
  };

  return (
    <>
      <div
        className={`rounded-lg border px-3 py-2.5 ${
          field.isActive ? "border-white/10 bg-white/5" : "border-white/5 bg-white/[0.02] opacity-60"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-medium text-white">{field.label}</span>
              <Badge color="slate">{getCustomFieldDataTypeLabel(field.dataType)}</Badge>
              {field.isRequired && <Badge color="warning">Obrigatório</Badge>}
              {field.isInternal && (
                <Badge color="accent">
                  <Shield className="h-3 w-3 mr-0.5 inline" />
                  Interno
                </Badge>
              )}
              {!field.isActive && <Badge color="danger">Inativo</Badge>}
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              <code className="text-[11px]">{field.name}</code>
              {field.description && ` — ${field.description}`}
            </p>
            {options.length > 0 && (
              <p className="mt-1 text-xs text-slate-400">
                Opções: {options.join(", ")}
              </p>
            )}
            {field.validationRegex && (
              <p className="mt-0.5 text-[11px] text-slate-500">
                Regex: <code>{field.validationRegex}</code>
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setEditOpen(true)}
              aria-label="Editar"
              className="p-1 text-slate-500 hover:text-white transition-colors"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={handleDelete}
              aria-label="Remover"
              className="p-1 text-slate-500 hover:text-danger transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {editOpen && (
        <FieldFormModal
          departmentId={departmentId}
          field={field}
          open={editOpen}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}

// ── Create Button ────────────────────────────────────────

function CreateFieldButton({ departmentId }: { departmentId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Adicionar Campo
      </Button>
      {open && (
        <FieldFormModal
          departmentId={departmentId}
          open={open}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ── Form Modal (Create / Edit) ───────────────────────────

const EMPTY_FORM: CreateDepartmentCustomFieldRequest = {
  name: "",
  label: "",
  description: null,
  dataType: CustomFieldDataType.Text,
  isRequired: false,
  isInternal: false,
  isActive: true,
  options: [],
  validationRegex: null,
  minLength: null,
  maxLength: null,
  minValue: null,
  maxValue: null,
};

function FieldFormModal({
  departmentId,
  field,
  open,
  onClose,
}: {
  departmentId: string;
  field?: DepartmentCustomFieldDefinition;
  open: boolean;
  onClose: () => void;
}) {
  const isEdit = !!field;
  const createMutation = useCreateDepartmentCustomField();
  const updateMutation = useUpdateDepartmentCustomField();

  const [form, setForm] = useState<CreateDepartmentCustomFieldRequest>(() => {
    if (!field) return { ...EMPTY_FORM };
    const options = parseOptionsFromJson(field.optionsJson);
    return {
      name: field.name,
      label: field.label,
      description: field.description,
      dataType: field.dataType,
      isRequired: field.isRequired,
      isInternal: field.isInternal,
      isActive: field.isActive,
      options,
      validationRegex: field.validationRegex,
      minLength: field.minLength,
      maxLength: field.maxLength,
      minValue: field.minValue,
      maxValue: field.maxValue,
    };
  });

  const [optionsText, setOptionsText] = useState(() => {
    if (!field) return "";
    return formatOptionsForInput(parseOptionsFromJson(field.optionsJson));
  });

  const isPending = createMutation.isPending || updateMutation.isPending;
  const isValid = form.name.trim().length >= 2 && form.label.trim().length >= 1;

  const needsOptions =
    form.dataType === CustomFieldDataType.Dropdown ||
    form.dataType === CustomFieldDataType.ListBox;

  const showMinMax =
    form.dataType === CustomFieldDataType.Integer ||
    form.dataType === CustomFieldDataType.Decimal;

  const showLength =
    form.dataType === CustomFieldDataType.Text;

  const handleSubmit = async () => {
    if (!isValid) return;
    if (needsOptions && parseOptionsFromInput(optionsText).length === 0) {
      toast.error("Dropdown e ListBox exigem pelo menos uma opção.");
      return;
    }

    const payload = {
      ...form,
      name: form.name.trim(),
      label: form.label.trim(),
      description: form.description?.trim() || null,
      options: needsOptions ? parseOptionsFromInput(optionsText) : [],
      validationRegex: form.validationRegex?.trim() || null,
    };

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          departmentId,
          fieldId: field.id,
          data: payload,
        });
        toast.success("Campo atualizado.");
      } else {
        await createMutation.mutateAsync({
          departmentId,
          data: payload,
        });
        toast.success("Campo criado.");
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar campo.");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Editar: ${field.label}` : "Adicionar Campo Customizado"}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Nome do Campo *"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="ex: tipo_solicitacao"
            hint="Identificador único ([a-z0-9_-])"
          />
          <Input
            label="Label *"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="ex: Tipo de Solicitação"
          />
        </div>

        <Input
          label="Descrição"
          value={form.description ?? ""}
          onChange={(e) =>
            setForm((f) => ({ ...f, description: e.target.value || null }))
          }
          placeholder="Texto de ajuda exibido no formulário"
        />

        <Select
          label="Tipo do Campo *"
          value={String(form.dataType)}
          options={DATA_TYPE_OPTIONS}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              dataType: Number(e.target.value) as CustomFieldDataType,
            }))
          }
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

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.isRequired ?? false}
              onChange={(e) => setForm((f) => ({ ...f, isRequired: e.target.checked }))}
              className="rounded bg-white/5 border-white/10"
            />
            Obrigatório
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.isInternal ?? false}
              onChange={(e) => setForm((f) => ({ ...f, isInternal: e.target.checked }))}
              className="rounded bg-white/5 border-white/10"
            />
            <Shield className="h-3.5 w-3.5" />
            Campo Interno (visível apenas para atendentes)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.isActive ?? true}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="rounded bg-white/5 border-white/10"
            />
            Ativo
          </label>
        </div>

        {/* Validation constraints */}
        {(showMinMax || showLength || true) && (
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-xs font-medium text-slate-400 mb-2">Validações Adicionais</p>
            <div className="grid grid-cols-2 gap-3">
              {showLength && (
                <>
                  <Input
                    label="Tamanho Mínimo"
                    type="number"
                    value={form.minLength ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        minLength: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                  />
                  <Input
                    label="Tamanho Máximo"
                    type="number"
                    value={form.maxLength ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        maxLength: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                  />
                </>
              )}
              {showMinMax && (
                <>
                  <Input
                    label="Valor Mínimo"
                    type="number"
                    value={form.minValue ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        minValue: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                  />
                  <Input
                    label="Valor Máximo"
                    type="number"
                    value={form.maxValue ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        maxValue: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                  />
                </>
              )}
            </div>
            <div className="mt-2">
              <Input
                label="Regex de Validação"
                value={form.validationRegex ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    validationRegex: e.target.value || null,
                  }))
                }
                placeholder="ex: ^CC-\d{4}$"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} loading={isPending} disabled={!isValid}>
            {isEdit ? "Salvar" : "Criar Campo"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
