import { useMemo } from 'react';
import { Badge, Loading } from '@/components/ui';
import { getCustomFieldDataTypeLabel, type TicketTemplateDto } from '@/api';
import { useDepartmentTicketSchema } from '@/hooks/useDepartmentCustomFields';
import { fieldMaskPlaceholder } from '@/utils/fieldMask';
import { parseTemplateQuestions } from '@/utils/templateQuestions';

/**
 * Conteúdo somente-leitura de um template de chamado (inclusive excluído):
 * dados, chave, questionário e valores padrão do departamento. Compartilhado
 * pela página de visualização e pelo modal de conferência rápida.
 *
 * O Título é o nome exibido (a Chave é o identificador padronizado).
 */
export function TemplateDetailsView({
  template,
  clientName,
  departmentName,
}: {
  template: TicketTemplateDto;
  clientName?: string | null;
  departmentName?: string | null;
}) {
  const departmentId = template.departmentId ?? null;
  const schemaQuery = useDepartmentTicketSchema(departmentId, Boolean(departmentId));

  const questions = useMemo(
    () => parseTemplateQuestions(template.questionsJson),
    [template.questionsJson],
  );

  const defaults = useMemo(() => {
    let parsed: Record<string, unknown> = {};
    try {
      const raw = JSON.parse(template.customFieldDefaultsJson);
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) parsed = raw as Record<string, unknown>;
    } catch {
      parsed = {};
    }
    const labelByKey = new Map((schemaQuery.data ?? []).map((f) => [f.definitionId, f.label]));
    return Object.entries(parsed)
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([key, value]) => ({ key, label: labelByKey.get(key) ?? key, value: formatValue(value) }));
  }, [template, schemaQuery.data]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Chave padronizada do template (identificador). */}
        <Badge color="slate">
          Chave: <code className="ml-1 font-mono">{template.name}</code>
        </Badge>
        {template.clientId ? (
          <Badge color="slate">{clientName ?? 'Cliente'}</Badge>
        ) : (
          <Badge color="slate">Global</Badge>
        )}
        {template.departmentId && <Badge color="accent">{departmentName ?? 'Departamento'}</Badge>}
        {template.priority && <Badge color="accent">Prioridade: {template.priority}</Badge>}
        {template.category && <Badge color="slate">Categoria: {template.category}</Badge>}
        {template.isActive ? <Badge color="success">Ativo</Badge> : <Badge color="warning">Inativo</Badge>}
        {template.deletedAt && (
          <Badge color="danger">
            Excluído {formatDate(template.deletedAt)}
            {template.deletedBy ? ` por ${template.deletedBy}` : ''}
          </Badge>
        )}
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted">Título do chamado</p>
        <p className="mt-1 text-sm text-foreground">{template.title}</p>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted">Descrição</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
          {template.description?.trim() ? template.description : '—'}
        </p>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted">
          Questionário do modelo ({questions.length})
        </p>
        {questions.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Nenhuma pergunta cadastrada.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {questions.map((question, index) => (
              <li key={`${question.key}-${index}`} className="rounded-lg border border-border bg-surface-light/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{question.label}</span>
                  <Badge color="slate">{getCustomFieldDataTypeLabel(question.dataType)}</Badge>
                  {question.isRequired && <Badge color="accent">Obrigatória</Badge>}
                  {question.isSensitive && <Badge color="warning">Sensível</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted">Chave: {question.key}</p>
                {question.options.length > 0 && (
                  <p className="mt-1 text-xs text-muted">Opções: {question.options.join(', ')}</p>
                )}
                {question.inputMask && (
                  <p className="mt-1 text-xs text-muted">
                    Máscara: {fieldMaskPlaceholder(question.inputMask)}
                  </p>
                )}
                {question.validationRegex && (
                  <p className="mt-1 break-all text-xs text-muted">Validador: {question.validationRegex}</p>
                )}
                {(question.minLength != null || question.maxLength != null) && (
                  <p className="mt-1 text-xs text-muted">
                    Tamanho: {question.minLength ?? '—'} até {question.maxLength ?? '—'}
                  </p>
                )}
                {(question.minValue != null || question.maxValue != null) && (
                  <p className="mt-1 text-xs text-muted">
                    Valor: {question.minValue ?? '—'} até {question.maxValue ?? '—'}
                  </p>
                )}
                {question.helpText && <p className="mt-1 text-xs text-muted">Ajuda: {question.helpText}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {departmentId && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            Valores padrão dos campos do departamento
          </p>
          {schemaQuery.isLoading ? (
            <Loading message="Carregando campos..." />
          ) : defaults.length === 0 ? (
            <p className="mt-1 text-sm text-muted">Nenhum valor padrão definido.</p>
          ) : (
            <ul className="mt-2 divide-y divide-white/5 rounded-lg border border-border">
              {defaults.map((item) => (
                <li key={item.key} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="min-w-0 break-words text-right text-foreground">{item.value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-4 border-t border-border pt-3 text-xs text-muted">
        <span>Criado em {formatDate(template.createdAt)}</span>
        <span>Atualizado em {formatDate(template.updatedAt)}</span>
        {template.createdBy && <span>por {template.createdBy}</span>}
      </div>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item ?? '')).join(', ') || '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
}
