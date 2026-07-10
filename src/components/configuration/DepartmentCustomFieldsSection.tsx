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

type RegexPreset = {
  value: string;
  label: string;
  regex: string;
  validSamples: string[];
  invalidSamples: string[];
  description: string;
  dataTypes?: CustomFieldDataType[];
};

const REGEX_ASSISTANT_PRESETS: RegexPreset[] = [
  {
    value: "numbers-only",
    label: "Apenas numeros",
    regex: "^\\d+$",
    validSamples: ["123456", "0099"],
    invalidSamples: ["123A", "12 34"],
    description: "Aceita apenas caracteres numericos.",
    dataTypes: [CustomFieldDataType.Text, CustomFieldDataType.Integer],
  },
  {
    value: "email",
    label: "Email basico",
    regex: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
    validSamples: ["suporte@empresa.com", "nome.sobrenome@dominio.com"],
    invalidSamples: ["usuario@@dominio.com", "usuario sem arroba"],
    description: "Valida formato comum de email.",
    dataTypes: [CustomFieldDataType.Text],
  },
  {
    value: "cpf",
    label: "CPF sem pontuacao",
    regex: "^\\d{11}$",
    validSamples: ["12345678901", "00011122233"],
    invalidSamples: ["123.456.789-01", "1234567890"],
    description: "Exige exatamente 11 digitos numericos.",
    dataTypes: [CustomFieldDataType.Text],
  },
  {
    value: "cnpj",
    label: "CNPJ sem pontuacao",
    regex: "^\\d{14}$",
    validSamples: ["12345678000199", "00998877000155"],
    invalidSamples: ["12.345.678/0001-99", "1234567800019"],
    description: "Exige exatamente 14 digitos numericos.",
    dataTypes: [CustomFieldDataType.Text],
  },
  {
    value: "phone-br",
    label: "Telefone BR",
    regex: "^\\(?\\d{2}\\)?\\s?\\d{4,5}-?\\d{4}$",
    validSamples: ["(11) 98888-7777", "1133334444"],
    invalidSamples: ["11-333", "(11) 33333-444"],
    description: "Aceita formatos comuns de telefone brasileiro.",
    dataTypes: [CustomFieldDataType.Text],
  },
  {
    value: "custom-code",
    label: "Codigo no formato CC-0000",
    regex: "^CC-\\d{4}$",
    validSamples: ["CC-1024", "CC-0001"],
    invalidSamples: ["cc-1024", "CC-123"],
    description: "Padrao de codigo com prefixo fixo e 4 digitos.",
    dataTypes: [CustomFieldDataType.Text],
  },
  {
    value: "slug",
    label: "Slug alfanumerico",
    regex: "^[A-Za-z0-9_-]+$",
    validSamples: ["campo_personalizado_01", "setor-financeiro"],
    invalidSamples: ["setor financeiro", "setor@financeiro"],
    description: "Permite letras, numeros, underline e hifen.",
    dataTypes: [CustomFieldDataType.Text],
  },
];

function parseRegexTestCasesInput(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function runRegexTest(regex: RegExp, value: string): boolean {
  const isolatedRegex = new RegExp(regex.source, regex.flags);
  return isolatedRegex.test(value);
}

function parseRegexInput(input: string): { regex: RegExp | null; error: string | null } {
  const trimmed = input.trim();
  if (!trimmed) return { regex: null, error: null };

  try {
    if (trimmed.startsWith("/") && trimmed.length > 2) {
      const lastSlashIndex = trimmed.lastIndexOf("/");
      if (lastSlashIndex > 0) {
        const pattern = trimmed.slice(1, lastSlashIndex);
        const flags = trimmed.slice(lastSlashIndex + 1);
        return { regex: new RegExp(pattern, flags), error: null };
      }
    }

    return { regex: new RegExp(trimmed), error: null };
  } catch (error) {
    return {
      regex: null,
      error: error instanceof Error ? error.message : "Regex invalida.",
    };
  }
}

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
          <h3 className="text-sm font-semibold text-foreground">Campos Customizados</h3>
          <p className="text-xs text-muted">
            {fields.length} campo(s) — esses campos aparecerão no formulário de abertura de chamado
          </p>
        </div>
        <CreateFieldButton departmentId={departmentId} />
      </div>

      {fields.length === 0 ? (
        <p className="text-sm text-muted py-4 text-center">
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
          field.isActive ? "border-border bg-surface-light" : "border-border bg-surface-light opacity-60"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-medium text-foreground">{field.label}</span>
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
            <p className="mt-0.5 text-xs text-muted">
              <code className="text-[11px]">{field.name}</code>
              {field.description && ` — ${field.description}`}
            </p>
            {options.length > 0 && (
              <p className="mt-1 text-xs text-muted">
                Opções: {options.join(", ")}
              </p>
            )}
            {field.validationRegex && (
              <p className="mt-0.5 text-[11px] text-muted">
                Regex: <code>{field.validationRegex}</code>
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setEditOpen(true)}
              aria-label="Editar"
              className="p-1 text-muted hover:text-foreground transition-colors"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={handleDelete}
              aria-label="Remover"
              className="p-1 text-muted hover:text-danger transition-colors"
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

  const [selectedRegexPreset, setSelectedRegexPreset] = useState(() => {
    if (!field?.validationRegex) return "";
    const preset = REGEX_ASSISTANT_PRESETS.find(
      (item) => item.regex === field.validationRegex,
    );
    return preset?.value ?? "";
  });
  const [regexValidCasesText, setRegexValidCasesText] = useState(() => {
    if (!field?.validationRegex) return "";
    const preset = REGEX_ASSISTANT_PRESETS.find(
      (item) => item.regex === field.validationRegex,
    );
    return preset ? preset.validSamples.join("\n") : "";
  });
  const [regexInvalidCasesText, setRegexInvalidCasesText] = useState(() => {
    if (!field?.validationRegex) return "";
    const preset = REGEX_ASSISTANT_PRESETS.find(
      (item) => item.regex === field.validationRegex,
    );
    return preset ? preset.invalidSamples.join("\n") : "";
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
    form.dataType === CustomFieldDataType.Text && !form.validationRegex;

  const showRegex = form.dataType === CustomFieldDataType.Text;

  const availableRegexPresets = useMemo(
    () =>
      REGEX_ASSISTANT_PRESETS.filter(
        (preset) => !preset.dataTypes || preset.dataTypes.includes(form.dataType),
      ),
    [form.dataType],
  );

  const selectedPreset = useMemo(
    () =>
      availableRegexPresets.find((preset) => preset.value === selectedRegexPreset) ?? null,
    [availableRegexPresets, selectedRegexPreset],
  );

  const regexEvaluation = useMemo(
    () => parseRegexInput(form.validationRegex ?? ""),
    [form.validationRegex],
  );

  const validRegexCases = useMemo(
    () => parseRegexTestCasesInput(regexValidCasesText),
    [regexValidCasesText],
  );

  const invalidRegexCases = useMemo(
    () => parseRegexTestCasesInput(regexInvalidCasesText),
    [regexInvalidCasesText],
  );

  const regexCaseEvaluation = useMemo(() => {
    if (!regexEvaluation.regex) {
      return {
        valid: [] as Array<{ value: string; passed: boolean }>,
        invalid: [] as Array<{ value: string; passed: boolean }>,
        total: 0,
        passed: 0,
      };
    }

    const valid = validRegexCases.map((value) => ({
      value,
      passed: runRegexTest(regexEvaluation.regex as RegExp, value),
    }));

    const invalid = invalidRegexCases.map((value) => ({
      value,
      passed: !runRegexTest(regexEvaluation.regex as RegExp, value),
    }));

    const passedCount =
      valid.filter((item) => item.passed).length +
      invalid.filter((item) => item.passed).length;
    const totalCount = valid.length + invalid.length;

    return {
      valid,
      invalid,
      total: totalCount,
      passed: passedCount,
    };
  }, [invalidRegexCases, regexEvaluation.regex, validRegexCases]);

  function applySelectedRegexPreset() {
    if (!selectedPreset) return;

    setForm((current) => ({
      ...current,
      validationRegex: selectedPreset.regex,
    }));
    setRegexValidCasesText(selectedPreset.validSamples.join("\n"));
    setRegexInvalidCasesText(selectedPreset.invalidSamples.join("\n"));
  }

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

    const parsedRegex = parseRegexInput(payload.validationRegex ?? "");
    if (parsedRegex.error) {
      toast.error(`Regex invalida: ${parsedRegex.error}`);
      return;
    }

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
      <div className="space-y-5">

        {/* ── Basic Info ── */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Informações Básicas
          </p>
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
        </div>

        {/* ── Behaviour ── */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Comportamento
          </p>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={form.isRequired ?? false}
                onChange={(e) => setForm((f) => ({ ...f, isRequired: e.target.checked }))}
                className="rounded bg-surface-light border-border"
              />
              Obrigatório
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={form.isInternal ?? false}
              onChange={(e) => setForm((f) => ({ ...f, isInternal: e.target.checked }))}
              className="rounded bg-surface-light border-border"
            />
            <Shield className="h-3.5 w-3.5" />
            Campo Interno (visível apenas para atendentes)
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={form.isActive ?? true}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="rounded bg-surface-light border-border"
            />
            Ativo
          </label>
        </div>
        </div>

        {/* ── Validation ── */}
        {(showMinMax || showLength || showRegex) && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Validação
            </p>
            {showMinMax && (
              <div className="rounded-lg border border-border bg-surface-light p-3">
                <p className="text-xs font-medium text-muted mb-2">Faixa de Valor</p>
                <div className="grid grid-cols-2 gap-3">
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
                </div>
              </div>
            )}

            {showLength && (
              <div className="rounded-lg border border-border bg-surface-light p-3">
                <p className="text-xs font-medium text-muted mb-2">Tamanho do Texto</p>
                <div className="grid grid-cols-2 gap-3">
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
                </div>
              </div>
            )}

            {form.dataType === CustomFieldDataType.Text && form.validationRegex && (
              <p className="mb-2 text-xs text-muted">
                Regex ativo — os campos de tamanho mínimo/máximo foram ocultados pois o próprio regex já controla o comprimento.
              </p>
            )}

            {showRegex && (
              <div className="space-y-3">
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

                {form.validationRegex && (
                  <div className="rounded-lg border border-border bg-background/30 p-3">
                    <p className="text-xs font-medium text-muted">Assistente de Regex</p>
                    <p className="mt-1 text-xs text-muted">
                      Escolha um modelo pronto, ajuste se necessario e teste antes de salvar.
                    </p>

                    <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                      <Select
                        label="Modelo sugerido"
                        value={selectedRegexPreset}
                        options={[
                          { value: "", label: "Selecionar modelo" },
                          ...availableRegexPresets.map((preset) => ({
                            value: preset.value,
                            label: preset.label,
                          })),
                        ]}
                        onChange={(e) => setSelectedRegexPreset(e.target.value)}
                      />
                      <div className="flex items-end gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={applySelectedRegexPreset}
                          disabled={!selectedPreset}
                        >
                          Aplicar modelo
                        </Button>
                        {selectedPreset && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setRegexValidCasesText(selectedPreset.validSamples.join("\n"));
                              setRegexInvalidCasesText(selectedPreset.invalidSamples.join("\n"));
                            }}
                          >
                            Usar exemplos
                          </Button>
                        )}
                      </div>
                    </div>

                    {selectedPreset && (
                      <p className="mt-2 text-xs text-muted">{selectedPreset.description}</p>
                    )}

                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <TextArea
                        label="Casos que devem passar"
                        rows={4}
                        value={regexValidCasesText}
                        onChange={(e) => setRegexValidCasesText(e.target.value)}
                        hint="Um valor por linha."
                      />
                      <TextArea
                        label="Casos que devem falhar"
                        rows={4}
                        value={regexInvalidCasesText}
                        onChange={(e) => setRegexInvalidCasesText(e.target.value)}
                        hint="Um valor por linha."
                      />
                    </div>

                    {regexEvaluation.error && (
                      <p className="mt-2 text-xs text-danger">
                        Regex invalida: {regexEvaluation.error}
                      </p>
                    )}

                    {!regexEvaluation.error && regexCaseEvaluation.total > 0 && (
                      <div className="mt-3 space-y-3 rounded-lg border border-border bg-surface-light p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            color={
                              regexCaseEvaluation.passed === regexCaseEvaluation.total
                                ? "success"
                                : "warning"
                            }
                          >
                            {regexCaseEvaluation.passed}/{regexCaseEvaluation.total} cenarios aprovados
                          </Badge>
                          <Badge color="slate">
                            {regexCaseEvaluation.total - regexCaseEvaluation.passed} falha(s)
                          </Badge>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted">
                              Esperado: passar
                            </p>
                            <div className="space-y-1">
                              {regexCaseEvaluation.valid.length === 0 && (
                                <p className="text-xs text-muted">Sem casos definidos.</p>
                              )}
                              {regexCaseEvaluation.valid.map((item) => (
                                <div
                                  key={`valid-${item.value}`}
                                  className="flex items-center justify-between gap-2 rounded bg-background/40 px-2 py-1"
                                >
                                  <code className="truncate text-xs text-muted-foreground">{item.value}</code>
                                  <Badge color={item.passed ? "success" : "danger"}>
                                    {item.passed ? "OK" : "Falhou"}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div>
                            <p className="mb-2 text-xs font-medium text-muted">
                              Esperado: falhar
                            </p>
                            <div className="space-y-1">
                              {regexCaseEvaluation.invalid.length === 0 && (
                                <p className="text-xs text-muted">Sem casos definidos.</p>
                              )}
                              {regexCaseEvaluation.invalid.map((item) => (
                                <div
                                  key={`invalid-${item.value}`}
                                  className="flex items-center justify-between gap-2 rounded bg-background/40 px-2 py-1"
                                >
                                  <code className="truncate text-xs text-muted-foreground">{item.value}</code>
                                  <Badge color={item.passed ? "success" : "danger"}>
                                    {item.passed ? "OK" : "Falhou"}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {!regexEvaluation.error && regexCaseEvaluation.total === 0 && (
                      <p className="mt-2 text-xs text-muted">
                        Adicione casos de teste para validar o comportamento do regex antes de salvar.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
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
