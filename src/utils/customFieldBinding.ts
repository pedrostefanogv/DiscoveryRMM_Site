import {
  CustomFieldScopeType,
  type CustomFieldDefinition,
} from "@/api/custom-fields";

export interface CustomFieldBinding {
  /** Texto pronto para a listagem ("Departamento: TI", "Todos os clientes", ...). */
  label: string;
  /** true quando a definição aponta para uma entidade específica. */
  isSpecific: boolean;
}

type BindingSource = Pick<
  CustomFieldDefinition,
  "scopeType" | "departmentId" | "departmentName"
>;

/**
 * Descreve o vínculo de uma definição de custom field.
 *
 * Só o escopo Departamento guarda uma entidade específica (`department_id`);
 * os demais escopos são sempre globais dentro do seu tipo (o valor é que é
 * gravado por cliente/site/agente). Sem isso a listagem mostrava apenas o selo
 * "Departamento" sem dizer a qual departamento o campo pertence.
 */
export function describeCustomFieldBinding(
  definition: BindingSource,
): CustomFieldBinding {
  switch (definition.scopeType) {
    case CustomFieldScopeType.Department: {
      const departmentName = definition.departmentName?.trim();
      if (departmentName) {
        return { label: `Departamento: ${departmentName}`, isSpecific: true };
      }
      if (definition.departmentId) {
        return { label: "Departamento vinculado (nome indisponível)", isSpecific: true };
      }
      return { label: "Todos os departamentos", isSpecific: false };
    }
    case CustomFieldScopeType.Client:
      return { label: "Todos os clientes", isSpecific: false };
    case CustomFieldScopeType.Site:
      return { label: "Todos os sites", isSpecific: false };
    case CustomFieldScopeType.Agent:
      return { label: "Todos os agentes", isSpecific: false };
    case CustomFieldScopeType.Server:
      return { label: "Todos os servidores", isSpecific: false };
    case CustomFieldScopeType.Ticket:
      return { label: "Todos os chamados", isSpecific: false };
    default:
      return { label: "Todos", isSpecific: false };
  }
}
