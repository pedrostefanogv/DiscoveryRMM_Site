import {
  ReportDatasetType,
  ReportScopeType,
  ReportDateMode,
  ReportFilterFieldType,
  ReportFilterUiComponent,
  type ReportExecutionSchema,
} from "@/api/types";

/**
 * Schemas padrão de execução por tipo de dataset
 * Atualizado conforme nova documentação da API (março 2026)
 */
export const DEFAULT_EXECUTION_SCHEMAS: Record<
  ReportDatasetType,
  ReportExecutionSchema
> = {
  [ReportDatasetType.SoftwareInventory]: {
    scopeType: ReportScopeType.ClientSiteAgent,
    dateMode: ReportDateMode.None,
    allowedOrientations: ["landscape", "portrait"],
    defaultOrientation: "landscape",
    allowedSortFields: [
      "softwareName",
      "publisher",
      "version",
      "lastSeenAt",
      "agentHostname",
      "siteName",
    ],
    defaultSortField: "softwareName",
    allowedSortDirections: ["asc", "desc"],
    defaultSortDirection: "asc",
    filters: [
      {
        name: "clientId",
        label: "Cliente",
        type: ReportFilterFieldType.Guid,
        required: false,
        group: "Escopo",
        uiComponent: ReportFilterUiComponent.GuidInput,
        placeholder: "GUID do cliente",
      },
      {
        name: "siteId",
        label: "Site",
        type: ReportFilterFieldType.Guid,
        required: false,
        group: "Escopo",
        uiComponent: ReportFilterUiComponent.GuidInput,
        dependsOn: "clientId",
        placeholder: "GUID do site",
      },
      {
        name: "agentId",
        label: "Agente",
        type: ReportFilterFieldType.Guid,
        required: false,
        group: "Escopo",
        uiComponent: ReportFilterUiComponent.GuidInput,
        dependsOn: "siteId",
        placeholder: "GUID do agente",
      },
      {
        name: "softwareName",
        label: "Nome do Software",
        type: ReportFilterFieldType.Text,
        required: false,
        group: "Filtros",
        uiComponent: ReportFilterUiComponent.TextSearch,
        maxLength: 200,
        isPartialMatch: true,
        description: "Busca parcial por nome",
      },
      {
        name: "publisher",
        label: "Fabricante",
        type: ReportFilterFieldType.Text,
        required: false,
        group: "Filtros",
        uiComponent: ReportFilterUiComponent.TextSearch,
        maxLength: 200,
        isPartialMatch: true,
      },
      {
        name: "version",
        label: "Versão",
        type: ReportFilterFieldType.Text,
        required: false,
        group: "Filtros",
        uiComponent: ReportFilterUiComponent.TextInput,
        maxLength: 50,
      },
      {
        name: "limit",
        label: "Limite de linhas",
        type: ReportFilterFieldType.Integer,
        required: false,
        group: "Saída",
        uiComponent: ReportFilterUiComponent.NumberInput,
        defaultValue: "1000",
        min: 1,
        max: 10000,
      },
    ],
    sampleFilterPresets: [
      {
        name: "Inventário Completo",
        description: "Todos os softwares instalados",
        filtersJson: JSON.stringify({ limit: 5000 }),
      },
      {
        name: "Software Microsoft",
        description: "Apenas produtos Microsoft",
        filtersJson: JSON.stringify({ publisher: "Microsoft", limit: 5000 }),
      },
    ],
  },

  [ReportDatasetType.Logs]: {
    scopeType: ReportScopeType.ClientSiteAgent,
    dateMode: ReportDateMode.RequiredRange,
    allowedOrientations: ["landscape", "portrait"],
    defaultOrientation: "portrait",
    allowedSortFields: ["timestamp", "level", "source", "type"],
    defaultSortField: "timestamp",
    allowedSortDirections: ["asc", "desc"],
    defaultSortDirection: "desc",
    filters: [
      {
        name: "from",
        label: "Data Inicial",
        type: ReportFilterFieldType.DateTime,
        required: true,
        group: "Período",
        uiComponent: ReportFilterUiComponent.DateTimePicker,
        description: "Início do período (obrigatório)",
      },
      {
        name: "to",
        label: "Data Final",
        type: ReportFilterFieldType.DateTime,
        required: true,
        group: "Período",
        uiComponent: ReportFilterUiComponent.DateTimePicker,
        description: "Fim do período (obrigatório)",
      },
      {
        name: "clientId",
        label: "Cliente",
        type: ReportFilterFieldType.Guid,
        required: false,
        group: "Escopo",
        uiComponent: ReportFilterUiComponent.GuidInput,
      },
      {
        name: "siteId",
        label: "Site",
        type: ReportFilterFieldType.Guid,
        required: false,
        group: "Escopo",
        uiComponent: ReportFilterUiComponent.GuidInput,
        dependsOn: "clientId",
      },
      {
        name: "agentId",
        label: "Agente",
        type: ReportFilterFieldType.Guid,
        required: false,
        group: "Escopo",
        uiComponent: ReportFilterUiComponent.GuidInput,
        dependsOn: "siteId",
      },
      {
        name: "level",
        label: "Nível",
        type: ReportFilterFieldType.Enum,
        required: false,
        group: "Filtros",
        uiComponent: ReportFilterUiComponent.MultiSelect,
        allowedValues: ["Debug", "Info", "Warning", "Error", "Critical"],
      },
      {
        name: "source",
        label: "Origem",
        type: ReportFilterFieldType.Text,
        required: false,
        group: "Filtros",
        uiComponent: ReportFilterUiComponent.TextInput,
        maxLength: 100,
      },
      {
        name: "message",
        label: "Mensagem",
        type: ReportFilterFieldType.Text,
        required: false,
        group: "Filtros",
        uiComponent: ReportFilterUiComponent.TextSearch,
        maxLength: 500,
        isPartialMatch: true,
      },
      {
        name: "limit",
        label: "Limite de linhas",
        type: ReportFilterFieldType.Integer,
        required: false,
        group: "Saída",
        uiComponent: ReportFilterUiComponent.NumberInput,
        defaultValue: "1000",
        min: 1,
        max: 10000,
      },
    ],
    sampleFilterPresets: [
      {
        name: "Últimas 24 horas",
        description: "Todos os logs das últimas 24 horas",
        filtersJson: JSON.stringify({
          from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          to: new Date().toISOString(),
        }),
      },
      {
        name: "Erros (7 dias)",
        description: "Apenas erros dos últimos 7 dias",
        filtersJson: JSON.stringify({
          from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          to: new Date().toISOString(),
          level: ["Error", "Critical"],
        }),
      },
    ],
  },

  [ReportDatasetType.ConfigurationAudit]: {
    scopeType: ReportScopeType.Global,
    dateMode: ReportDateMode.RequiredRange,
    allowedOrientations: ["landscape", "portrait"],
    defaultOrientation: "portrait",
    allowedSortFields: ["timestamp", "entityType", "changedBy", "fieldName"],
    defaultSortField: "timestamp",
    allowedSortDirections: ["asc", "desc"],
    defaultSortDirection: "desc",
    filters: [
      {
        name: "from",
        label: "Data Inicial",
        type: ReportFilterFieldType.DateTime,
        required: true,
        group: "Período",
        uiComponent: ReportFilterUiComponent.DateTimePicker,
        description: "Início do período de auditoria",
      },
      {
        name: "to",
        label: "Data Final",
        type: ReportFilterFieldType.DateTime,
        required: true,
        group: "Período",
        uiComponent: ReportFilterUiComponent.DateTimePicker,
        description: "Fim do período de auditoria",
      },
      {
        name: "entityType",
        label: "Tipo de Entidade",
        type: ReportFilterFieldType.Enum,
        required: false,
        group: "Filtros",
        uiComponent: ReportFilterUiComponent.Select,
        allowedValues: ["Server", "Client", "Site", "Agent"],
      },
      {
        name: "entityId",
        label: "ID da Entidade",
        type: ReportFilterFieldType.Guid,
        required: false,
        group: "Filtros",
        uiComponent: ReportFilterUiComponent.GuidInput,
      },
      {
        name: "fieldName",
        label: "Campo Alterado",
        type: ReportFilterFieldType.Text,
        required: false,
        group: "Filtros",
        uiComponent: ReportFilterUiComponent.TextInput,
        maxLength: 200,
      },
      {
        name: "changedBy",
        label: "Alterado Por",
        type: ReportFilterFieldType.Text,
        required: false,
        group: "Filtros",
        uiComponent: ReportFilterUiComponent.TextInput,
        maxLength: 256,
      },
      {
        name: "limit",
        label: "Limite de linhas",
        type: ReportFilterFieldType.Integer,
        required: false,
        group: "Saída",
        uiComponent: ReportFilterUiComponent.NumberInput,
        defaultValue: "1000",
        min: 1,
        max: 10000,
      },
    ],
    sampleFilterPresets: [
      {
        name: "Mês Atual",
        description: "Auditoria do mês corrente",
        filtersJson: JSON.stringify({
          from: new Date(
            new Date().getFullYear(),
            new Date().getMonth(),
            1,
          ).toISOString(),
          to: new Date().toISOString(),
        }),
      },
      {
        name: "Alterações em Clientes",
        description: "Apenas alterações em clientes",
        filtersJson: JSON.stringify({
          from: new Date(
            new Date().getFullYear(),
            new Date().getMonth(),
            1,
          ).toISOString(),
          to: new Date().toISOString(),
          entityType: "Client",
        }),
      },
    ],
  },

  [ReportDatasetType.Tickets]: {
    scopeType: ReportScopeType.ClientSiteAgent,
    dateMode: ReportDateMode.OptionalRange,
    allowedOrientations: ["landscape", "portrait"],
    defaultOrientation: "landscape",
    allowedSortFields: ["timestamp", "priority", "slaBreached", "closedAt"],
    defaultSortField: "timestamp",
    allowedSortDirections: ["asc", "desc"],
    defaultSortDirection: "desc",
    filters: [
      {
        name: "from",
        label: "Data Inicial",
        type: ReportFilterFieldType.DateTime,
        required: false,
        group: "Período",
        uiComponent: ReportFilterUiComponent.DateTimePicker,
        description: "Tickets criados após esta data",
      },
      {
        name: "to",
        label: "Data Final",
        type: ReportFilterFieldType.DateTime,
        required: false,
        group: "Período",
        uiComponent: ReportFilterUiComponent.DateTimePicker,
        description: "Tickets criados antes desta data",
      },
      {
        name: "clientId",
        label: "Cliente",
        type: ReportFilterFieldType.Guid,
        required: false,
        group: "Escopo",
        uiComponent: ReportFilterUiComponent.GuidInput,
      },
      {
        name: "siteId",
        label: "Site",
        type: ReportFilterFieldType.Guid,
        required: false,
        group: "Escopo",
        uiComponent: ReportFilterUiComponent.GuidInput,
        dependsOn: "clientId",
      },
      {
        name: "agentId",
        label: "Agente",
        type: ReportFilterFieldType.Guid,
        required: false,
        group: "Escopo",
        uiComponent: ReportFilterUiComponent.GuidInput,
        dependsOn: "siteId",
      },
      {
        name: "priority",
        label: "Prioridade",
        type: ReportFilterFieldType.Enum,
        required: false,
        group: "Filtros",
        uiComponent: ReportFilterUiComponent.Select,
        allowedValues: ["Low", "Medium", "High", "Critical"],
      },
      {
        name: "workflowStateId",
        label: "Estado do Workflow",
        type: ReportFilterFieldType.Guid,
        required: false,
        group: "Filtros",
        uiComponent: ReportFilterUiComponent.GuidInput,
      },
      {
        name: "slaBreached",
        label: "SLA Violado",
        type: ReportFilterFieldType.Boolean,
        required: false,
        group: "Filtros",
        uiComponent: ReportFilterUiComponent.Toggle,
      },
      {
        name: "limit",
        label: "Limite de linhas",
        type: ReportFilterFieldType.Integer,
        required: false,
        group: "Saída",
        uiComponent: ReportFilterUiComponent.NumberInput,
        defaultValue: "1000",
        min: 1,
        max: 10000,
      },
    ],
    sampleFilterPresets: [
      {
        name: "Últimos 7 dias",
        description: "Tickets dos últimos 7 dias",
        filtersJson: JSON.stringify({
          from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          to: new Date().toISOString(),
        }),
      },
      {
        name: "Alta Prioridade",
        description: "Tickets de alta prioridade",
        filtersJson: JSON.stringify({
          priority: "High",
        }),
      },
      {
        name: "SLA Violado",
        description: "Tickets com SLA violado",
        filtersJson: JSON.stringify({
          slaBreached: true,
        }),
      },
    ],
  },

  [ReportDatasetType.AgentHardware]: {
    scopeType: ReportScopeType.ClientSiteAgent,
    dateMode: ReportDateMode.None,
    allowedOrientations: ["landscape", "portrait"],
    defaultOrientation: "landscape",
    allowedSortFields: ["siteName", "agentHostname", "collectedAt", "osName"],
    defaultSortField: "siteName",
    allowedSortDirections: ["asc", "desc"],
    defaultSortDirection: "asc",
    filters: [
      {
        name: "clientId",
        label: "Cliente",
        type: ReportFilterFieldType.Guid,
        required: false,
        group: "Escopo",
        uiComponent: ReportFilterUiComponent.GuidInput,
      },
      {
        name: "siteId",
        label: "Site",
        type: ReportFilterFieldType.Guid,
        required: false,
        group: "Escopo",
        uiComponent: ReportFilterUiComponent.GuidInput,
        dependsOn: "clientId",
      },
      {
        name: "agentId",
        label: "Agente",
        type: ReportFilterFieldType.Guid,
        required: false,
        group: "Escopo",
        uiComponent: ReportFilterUiComponent.GuidInput,
        dependsOn: "siteId",
      },
      {
        name: "osName",
        label: "Sistema Operacional",
        type: ReportFilterFieldType.Text,
        required: false,
        group: "Filtros",
        uiComponent: ReportFilterUiComponent.TextSearch,
        maxLength: 200,
        isPartialMatch: true,
      },
      {
        name: "processor",
        label: "Processador",
        type: ReportFilterFieldType.Text,
        required: false,
        group: "Filtros",
        uiComponent: ReportFilterUiComponent.TextSearch,
        maxLength: 200,
        isPartialMatch: true,
      },
      {
        name: "limit",
        label: "Limite de linhas",
        type: ReportFilterFieldType.Integer,
        required: false,
        group: "Saída",
        uiComponent: ReportFilterUiComponent.NumberInput,
        defaultValue: "1000",
        min: 1,
        max: 10000,
      },
    ],
    sampleFilterPresets: [
      {
        name: "Inventário Completo",
        description: "Todo o hardware monitorado",
        filtersJson: JSON.stringify({ limit: 5000 }),
      },
      {
        name: "Apenas Windows",
        description: "Equipamentos Windows",
        filtersJson: JSON.stringify({ osName: "Windows" }),
      },
    ],
  },
};

/**
 * Obtém o schema padrão para um tipo de dataset
 */
export function getDefaultSchemaForDataset(
  datasetType: ReportDatasetType,
): ReportExecutionSchema {
  return DEFAULT_EXECUTION_SCHEMAS[datasetType];
}

/**
 * Formata um schema para JSON legível (usado no formulário)
 */
export function formatSchemaToJson(schema: ReportExecutionSchema): string {
  return JSON.stringify(schema, null, 2);
}

/**
 * Valida se um schema customizado tem a estrutura mínima necessária
 */
export function validateCustomSchema(schema: any): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (schema.scopeType === undefined)
    errors.push("Campo 'scopeType' é obrigatório");
  if (schema.dateMode === undefined)
    errors.push("Campo 'dateMode' é obrigatório");
  if (!Array.isArray(schema.filters))
    errors.push("Campo 'filters' deve ser um array");
  if (!Array.isArray(schema.allowedOrientations))
    errors.push("Campo 'allowedOrientations' deve ser um array");
  if (!Array.isArray(schema.allowedSortFields))
    errors.push("Campo 'allowedSortFields' deve ser um array");
  if (!Array.isArray(schema.allowedSortDirections))
    errors.push("Campo 'allowedSortDirections' deve ser um array");
  if (!schema.defaultOrientation)
    errors.push("Campo 'defaultOrientation' é obrigatório");
  if (!schema.defaultSortField)
    errors.push("Campo 'defaultSortField' é obrigatório");
  if (!schema.defaultSortDirection)
    errors.push("Campo 'defaultSortDirection' é obrigatório");

  // Validar cada filtro
  if (Array.isArray(schema.filters)) {
    schema.filters.forEach((filter: any, idx: number) => {
      if (!filter.name)
        errors.push(`Filtro ${idx + 1}: campo 'name' é obrigatório`);
      if (!filter.label)
        errors.push(`Filtro ${idx + 1}: campo 'label' é obrigatório`);
      if (filter.type === undefined)
        errors.push(`Filtro ${idx + 1}: campo 'type' é obrigatório`);
      if (filter.required === undefined)
        errors.push(`Filtro ${idx + 1}: campo 'required' é obrigatório`);
      if (!filter.group)
        errors.push(`Filtro ${idx + 1}: campo 'group' é obrigatório`);
      if (filter.uiComponent === undefined)
        errors.push(`Filtro ${idx + 1}: campo 'uiComponent' é obrigatório`);
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Obtém descrição amigável de um tipo de dataset
 */
export function getDatasetTypeDescription(
  datasetType: ReportDatasetType,
): string {
  const descriptions: Record<ReportDatasetType, string> = {
    [ReportDatasetType.SoftwareInventory]:
      "Inventário de software instalado nos agentes monitorados",
    [ReportDatasetType.Logs]: "Histórico de logs e eventos do sistema",
    [ReportDatasetType.ConfigurationAudit]:
      "Auditoria de alterações em configurações",
    [ReportDatasetType.Tickets]: "Relatório de tickets de suporte",
    [ReportDatasetType.AgentHardware]: "Inventário de hardware dos agentes",
  };

  return descriptions[datasetType] || "Dataset desconhecido";
}

/**
 * Obtém valores permitidos para orderBy baseado no dataset type
 */
export function getAllowedOrderByValues(
  datasetType: ReportDatasetType,
): string[] {
  return DEFAULT_EXECUTION_SCHEMAS[datasetType].allowedSortFields;
}

/**
 * Obtém o valor padrão de orderBy para um dataset
 */
export function getDefaultOrderBy(datasetType: ReportDatasetType): string {
  return DEFAULT_EXECUTION_SCHEMAS[datasetType].defaultSortField;
}

/**
 * Obtém a direção padrão de ordenação para um dataset
 */
export function getDefaultSortDirection(
  datasetType: ReportDatasetType,
): string {
  return DEFAULT_EXECUTION_SCHEMAS[datasetType].defaultSortDirection;
}
