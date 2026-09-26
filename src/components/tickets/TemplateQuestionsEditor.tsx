import { useState } from 'react';
import { Plus, Trash2, ClipboardList } from 'lucide-react';
import { Button, Input, Select, TextArea } from '@/components/ui';
import { CustomFieldDataType, getCustomFieldDataTypeLabel } from '@/api';
import { useCustomFieldTemplates } from '@/hooks/useCustomFieldTemplates';
import { fieldMaskPlaceholder } from '@/utils/fieldMask';
import {
  EMPTY_TEMPLATE_QUESTION,
  slugifyQuestionKey,
  type TemplateQuestion,
} from '@/utils/templateQuestions';

const DATA_TYPE_OPTIONS = Object.values(CustomFieldDataType)
  .filter((value): value is CustomFieldDataType => typeof value === 'number')
  .map((value) => ({ value: String(value), label: getCustomFieldDataTypeLabel(value) }));

/**
 * Editor do mini questionário de um template de chamado. As perguntas são
 * próprias do modelo — não são campos do chamado. Os "modelos de campos"
 * podem ser usados para preencher tipo/máscara/validador de uma pergunta.
 */
export function TemplateQuestionsEditor({
  questions,
  onChange,
  clientId = null,
  departmentId = null,
}: {
  questions: TemplateQuestion[];
  onChange: (questions: TemplateQuestion[]) => void;
  clientId?: string | null;
  departmentId?: string | null;
}) {
  // Modelos globais + do escopo do template (cliente/departamento).
  const templatesQuery = useCustomFieldTemplates({
    clientId: clientId ?? undefined,
    departmentId: departmentId ?? undefined,
    includeGlobal: true,
  });
  const [modelSelection, setModelSelection] = useState<Record<number, string>>({});
  // Índices em que o usuário editou a chave à mão — enquanto não editar, a chave
  // é derivada do rótulo a cada digitação.
  const [manualKeyIndexes, setManualKeyIndexes] = useState<Record<number, boolean>>({});

  const update = (index: number, patch: Partial<TemplateQuestion>) => {
    onChange(questions.map((question, i) => (i === index ? { ...question, ...patch } : question)));
  };

  const reindex = <T,>(prev: Record<number, T>, removed: number): Record<number, T> => {
    const next: Record<number, T> = {};
    for (const [key, value] of Object.entries(prev)) {
      const position = Number(key);
      if (position < removed) next[position] = value;
      else if (position > removed) next[position - 1] = value;
    }
    return next;
  };

  const remove = (index: number) => {
    onChange(questions.filter((_, i) => i !== index));
    // Reindexa os mapas por posição para não aplicar modelo/marca na pergunta errada.
    setModelSelection((prev) => reindex(prev, index));
    setManualKeyIndexes((prev) => reindex(prev, index));
  };

  const add = () => {
    onChange([
      ...questions,
      { ...EMPTY_TEMPLATE_QUESTION, key: '', label: '' },
    ]);
  };

  const applyModel = (index: number, modelId: string) => {
    const model = (templatesQuery.data ?? []).find((item) => item.id === modelId);
    if (!model) return;
    const current = questions[index];
    update(index, {
      dataType: model.dataType,
      isRequired: current.isRequired || model.defaultIsRequired,
      options: model.options,
      validationRegex: model.validationRegex,
      inputMask: model.inputMask,
      minLength: model.minLength,
      maxLength: model.maxLength,
      minValue: model.minValue,
      maxValue: model.maxValue,
      helpText: current.helpText || model.description,
    });
  };

  return (
    <div className="rounded-lg border border-border bg-surface-light p-4">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <ClipboardList className="h-3.5 w-3.5" />
            Questionário do modelo
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Perguntas extras feitas na abertura do chamado (ex: nome, e-mail, telefone). Não são campos do
            chamado — as respostas ficam registradas no ticket.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={add}>
          <Plus className="h-4 w-4" /> Pergunta
        </Button>
      </div>

      {questions.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Nenhuma pergunta. O modelo pode ser usado apenas como atalho de título/descrição/prioridade.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {questions.map((question, index) => {
            const needsOptions =
              question.dataType === CustomFieldDataType.Dropdown ||
              question.dataType === CustomFieldDataType.ListBox;
            const showLength = question.dataType === CustomFieldDataType.Text;
            const showMinMax =
              question.dataType === CustomFieldDataType.Integer ||
              question.dataType === CustomFieldDataType.Decimal;

            return (
              <div key={index} className="rounded-lg border border-border bg-background/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Pergunta {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    aria-label="Remover pergunta"
                    className="p-1 text-muted transition-colors hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Rótulo *"
                    value={question.label}
                    placeholder="ex: Nome completo"
                    onChange={(e) => {
                      const label = e.target.value;
                      // Chave manual é preservada; caso contrário, deriva do rótulo
                      // a cada digitação (antes ela "congelava" no primeiro caractere).
                      const key = manualKeyIndexes[index]
                        ? question.key
                        : slugifyQuestionKey(label, index);
                      update(index, { label, key });
                    }}
                  />
                  <Input
                    label="Chave *"
                    value={question.key}
                    placeholder="ex: nome_completo"
                    hint="Identificador da resposta ([a-z0-9_])"
                    onChange={(e) => {
                      setManualKeyIndexes((prev) => ({ ...prev, [index]: true }));
                      update(index, { key: e.target.value });
                    }}
                  />
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Select
                    label="Tipo"
                    value={String(question.dataType)}
                    options={DATA_TYPE_OPTIONS}
                    onChange={(e) => update(index, { dataType: Number(e.target.value) as CustomFieldDataType })}
                  />
                  <Select
                    label="Usar modelo de campo"
                    value={modelSelection[index] ?? ''}
                    options={[
                      { value: '', label: 'Selecionar modelo...' },
                      ...(templatesQuery.data ?? []).map((model) => ({
                        value: model.id,
                        label: model.isBuiltIn ? model.label : `${model.label} (personalizado)`,
                      })),
                    ]}
                    onChange={(e) => {
                      setModelSelection((prev) => ({ ...prev, [index]: e.target.value }));
                      applyModel(index, e.target.value);
                    }}
                  />
                </div>

                {needsOptions && (
                  <div className="mt-3">
                    <TextArea
                      label="Opções *"
                      rows={2}
                      value={question.options.join(', ')}
                      onChange={(e) =>
                        update(index, {
                          options: e.target.value.split(',').map((item) => item.trim()).filter(Boolean),
                        })
                      }
                      hint="Valores separados por vírgula. Ex: Sistemas internos, Softwares de terceiros"
                    />
                  </div>
                )}

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Máscara"
                    value={question.inputMask ?? ''}
                    placeholder="ex: 999.999.999-99"
                    hint={
                      question.inputMask
                        ? `Exemplo: ${fieldMaskPlaceholder(question.inputMask)}`
                        : 'Opcional (9=dígito, A=letra, *=alfanumérico)'
                    }
                    onChange={(e) => update(index, { inputMask: e.target.value || null })}
                  />
                  <Input
                    label="Validador (regex)"
                    value={question.validationRegex ?? ''}
                    placeholder="ex: ^\\d{11}$"
                    onChange={(e) => update(index, { validationRegex: e.target.value || null })}
                  />
                </div>

                {showLength && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Tamanho mínimo"
                      type="number"
                      value={question.minLength ?? ''}
                      onChange={(e) => update(index, { minLength: e.target.value ? Number(e.target.value) : null })}
                    />
                    <Input
                      label="Tamanho máximo"
                      type="number"
                      value={question.maxLength ?? ''}
                      onChange={(e) => update(index, { maxLength: e.target.value ? Number(e.target.value) : null })}
                    />
                  </div>
                )}

                {showMinMax && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Valor mínimo"
                      type="number"
                      value={question.minValue ?? ''}
                      onChange={(e) => update(index, { minValue: e.target.value ? Number(e.target.value) : null })}
                    />
                    <Input
                      label="Valor máximo"
                      type="number"
                      value={question.maxValue ?? ''}
                      onChange={(e) => update(index, { maxValue: e.target.value ? Number(e.target.value) : null })}
                    />
                  </div>
                )}

                <div className="mt-3">
                  <Input
                    label="Texto de ajuda"
                    value={question.helpText ?? ''}
                    placeholder="Explicação exibida junto da pergunta"
                    onChange={(e) => update(index, { helpText: e.target.value || null })}
                  />
                </div>

                <label className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={question.isRequired}
                    onChange={(e) => update(index, { isRequired: e.target.checked })}
                    className="rounded border-border bg-surface-light"
                  />
                  Resposta obrigatória
                </label>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
