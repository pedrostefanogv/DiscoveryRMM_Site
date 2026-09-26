import type { CreateTicketRequest } from '@/api';

/**
 * Monta o corpo de criação do chamado.
 *
 * O `templateId` é obrigatório para o backend vincular o template: sem ele o
 * chamado não recebe TemplateId/TemplateName (perde o histórico/snapshot), os
 * defaults do departamento não são mesclados no servidor e as respostas do
 * questionário são recusadas ("Respostas de questionário exigem um template
 * selecionado").
 *
 * Com template selecionado, os campos do departamento vazios são enviados como
 * `null` explícito: o servidor mescla os defaults do template e depois os
 * valores do request, então o null é o que garante que um campo que o usuário
 * limpou **não** receba o default de volta.
 */
export function buildCreateTicketPayload(input: {
  form: CreateTicketRequest;
  templateId: string | null;
  customFieldValues: Record<string, unknown>;
  templateAnswers: Record<string, unknown>;
  /** Ids dos campos do departamento carregados (defaults do template são limpos). */
  departmentFieldIds?: string[];
}): CreateTicketRequest {
  const { form, templateId, customFieldValues, templateAnswers, departmentFieldIds } = input;
  const hasTemplate = Boolean(templateId);

  const values: Record<string, unknown> = {};
  if (hasTemplate) {
    for (const definitionId of departmentFieldIds ?? []) values[definitionId] = null;
  }
  Object.assign(values, customFieldValues);

  return {
    ...form,
    templateId: hasTemplate ? templateId : null,
    // Campos vazios são omitidos quando não há template; com template entram
    // como null para não ressuscitar o default.
    ...(Object.keys(values).length > 0 ? { customFieldValues: values } : {}),
    ...(hasTemplate && Object.keys(templateAnswers).length > 0 ? { templateAnswers } : {}),
  };
}
