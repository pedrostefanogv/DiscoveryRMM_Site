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
    const clientOk = clientId
      ? template.clientId === null || template.clientId === clientId
      : template.clientId === null;
    const departmentOk = departmentId
      ? template.departmentId === null || template.departmentId === departmentId
      : template.departmentId === null;
    return clientOk && departmentOk;
  });
}