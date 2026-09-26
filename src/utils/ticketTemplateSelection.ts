import type { TicketTemplateDto } from '@/api';

/**
 * Templates utilizáveis na abertura do chamado, respeitando o escopo:
 *
 *   Global -> (globais + do departamento)
 *   Cliente -> (do cliente + globais + do departamento)
 *
 * Ou seja: templates sem cliente/departamento são sempre elegíveis; os
 * vinculados só entram quando o escopo escolhido casa. Sem departamento
 * escolhido, apenas os gerais aparecem.
 */
export function selectableTemplates(
  templates: TicketTemplateDto[],
  scope: { clientId?: string | null; departmentId?: string | null },
): TicketTemplateDto[] {
  const clientId = scope.clientId ?? null;
  const departmentId = scope.departmentId ?? null;

  return templates.filter((template) => {
    // A API omite propriedades nulas: ausente significa global (não "sem
    // escopo"), então normaliza antes de comparar.
    const templateClientId = template.clientId ?? null;
    const templateDepartmentId = template.departmentId ?? null;

    const clientOk = clientId
      ? templateClientId === null || templateClientId === clientId
      : templateClientId === null;
    const departmentOk = departmentId
      ? templateDepartmentId === null || templateDepartmentId === departmentId
      : templateDepartmentId === null;
    return clientOk && departmentOk;
  });
}