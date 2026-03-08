import { ReportDatasetType, type ReportExecutionSchema } from "@/api/types";

/**
 * Schemas padrão de execução por tipo de dataset
 * Baseado na estrutura da API C# BuildDatasetCatalog
 */
export const DEFAULT_EXECUTION_SCHEMAS: Record<
  ReportDatasetType,
  ReportExecutionSchema
> = {
  [ReportDatasetType.SoftwareInventory]: {
    scope: "CurrentSnapshot",
    dateMode: "None",
    filters: [
      {
        name: "clientId",
        label: "Cliente",
        type: "Long",
        required: false,
        description: "Filtrar por cliente específico",
      },
      {
        name: "siteId",
        label: "Site",
        type: "Long",
        required: false,
        description: "Filtrar por site específico",
      },
      {
        name: "agentId",
        label: "Agente",
        type: "Long",
        required: false,
        description: "Filtrar por agente específico",
      },
      {
        name: "softwareName",
        label: "Nome do Software",
        type: "String",
        required: false,
        description: "Busca parcial por nome",
      },
      {
        name: "publisher",
        label: "Fabricante",
        type: "String",
        required: false,
        description: "Filtro por fabricante",
      },
      {
        name: "version",
        label: "Versão",
        type: "String",
        required: false,
        description: "Filtra por versão exata ou parcial",
      },
    ],
    allowedOrientations: ["Portrait", "Landscape"],
    allowedSortFields: [
      "softwareName",
      "publisher",
      "version",
      "lastSeenAt",
      "agentHostname",
      "siteName",
    ],
    allowedSortDirections: ["ASC", "DESC"],
    sampleFilterPresets: [
      {
        name: "Inventário Completo",
        softwareName: "",
      },
      {
        name: "Por Fabricante (Microsoft)",
        publisher: "Microsoft",
      },
    ],
  },

  [ReportDatasetType.Logs]: {
    scope: "HistoricalTimeSeries",
    dateMode: "Range",
    filters: [
      {
        name: "from",
        label: "Data Inicial",
        type: "DateTime",
        required: true,
        description: "Início do período (obrigatório)",
      },
      {
        name: "to",
        label: "Data Final",
        type: "DateTime",
        required: true,
        description: "Fim do período (obrigatório)",
      },
      {
        name: "clientId",
        label: "Cliente",
        type: "Long",
        required: false,
        description: "Filtrar por cliente específico",
      },
      {
        name: "siteId",
        label: "Site",
        type: "Long",
        required: false,
      },
      {
        name: "agentId",
        label: "Agente",
        type: "Long",
        required: false,
      },
      {
        name: "level",
        label: "Nível",
        type: "String",
        required: false,
        description: "Trace, Info, Warning, Error",
      },
      {
        name: "source",
        label: "Origem",
        type: "String",
        required: false,
        description: "Origem do evento",
      },
      {
        name: "message",
        label: "Mensagem",
        type: "String",
        required: false,
        description: "Busca parcial no texto",
      },
    ],
    allowedOrientations: ["Portrait", "Landscape"],
    allowedSortFields: ["createdAt", "level", "source", "type"],
    allowedSortDirections: ["ASC", "DESC"],
    sampleFilterPresets: [
      {
        name: "Últimas 24 horas",
        from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        to: new Date().toISOString(),
      },
      {
        name: "Últimos 7 dias - Erros",
        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        to: new Date().toISOString(),
        level: "Error",
      },
    ],
  },

  [ReportDatasetType.ConfigurationAudit]: {
    scope: "GlobalAudit",
    dateMode: "Range",
    filters: [
      {
        name: "from",
        label: "Data Inicial",
        type: "DateTime",
        required: true,
        description: "Início do período de auditoria (obrigatório)",
      },
      {
        name: "to",
        label: "Data Final",
        type: "DateTime",
        required: true,
        description: "Fim do período de auditoria (obrigatório)",
      },
      {
        name: "entityType",
        label: "Tipo de Entidade",
        type: "String",
        required: false,
        description: "Ex.: Client, Site, ServerConfiguration, Agent",
      },
      {
        name: "entityId",
        label: "ID da Entidade",
        type: "Long",
        required: false,
        description: "Filtrar por entidade específica",
      },
      {
        name: "fieldName",
        label: "Campo Alterado",
        type: "String",
        required: false,
        description: "Nome do campo que foi modificado",
      },
      {
        name: "changedBy",
        label: "Alterado Por",
        type: "String",
        required: false,
        description: "Usuário responsável",
      },
    ],
    allowedOrientations: ["Portrait", "Landscape"],
    allowedSortFields: ["changedAt", "entityType", "changedBy", "fieldName"],
    allowedSortDirections: ["ASC", "DESC"],
    sampleFilterPresets: [
      {
        name: "Auditoria do Mês Atual",
        from: new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          1,
        ).toISOString(),
        to: new Date(
          new Date().getFullYear(),
          new Date().getMonth() + 1,
          0,
          23,
          59,
          59,
        ).toISOString(),
      },
      {
        name: "Alterações em Clientes",
        from: new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          1,
        ).toISOString(),
        to: new Date(
          new Date().getFullYear(),
          new Date().getMonth() + 1,
          0,
          23,
          59,
          59,
        ).toISOString(),
        entityType: "Client",
      },
    ],
  },

  [ReportDatasetType.Tickets]: {
    scope: "CurrentSnapshot",
    dateMode: "Range",
    filters: [
      {
        name: "from",
        label: "Data Inicial (Criados Após)",
        type: "DateTime",
        required: false,
        description: "Mostrar tickets criados após esta data",
      },
      {
        name: "to",
        label: "Data Final (Criados Antes)",
        type: "DateTime",
        required: false,
        description: "Mostrar tickets criados antes desta data",
      },
      {
        name: "clientId",
        label: "Cliente",
        type: "Long",
        required: false,
        description: "Filtrar por cliente específico",
      },
      {
        name: "siteId",
        label: "Site",
        type: "Long",
        required: false,
      },
      {
        name: "priority",
        label: "Prioridade",
        type: "String",
        required: false,
        description: "Low, Medium, High, Critical",
      },
      {
        name: "workflowStateId",
        label: "Status",
        type: "Long",
        required: false,
        description: "Estado atual do ticket",
      },
      {
        name: "slaBreached",
        label: "SLA Violado",
        type: "Boolean",
        required: false,
        description: "true para tickets com SLA violado",
      },
    ],
    allowedOrientations: ["Portrait", "Landscape"],
    allowedSortFields: ["createdAt", "priority", "slaBreached", "closedAt"],
    allowedSortDirections: ["ASC", "DESC"],
    sampleFilterPresets: [
      {
        name: "Últimos 7 dias",
        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        to: new Date().toISOString(),
      },
      {
        name: "Este mês",
        from: new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          1,
        ).toISOString(),
        to: new Date(
          new Date().getFullYear(),
          new Date().getMonth() + 1,
          0,
          23,
          59,
          59,
        ).toISOString(),
      },
      {
        name: "Alta prioridade - Últimos 30 dias",
        from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        to: new Date().toISOString(),
        priority: "High",
      },
      {
        name: "SLA Violado",
        slaBreached: true,
      },
    ],
  },

  [ReportDatasetType.AgentHardware]: {
    scope: "CurrentSnapshot",
    dateMode: "None",
    filters: [
      {
        name: "clientId",
        label: "Cliente",
        type: "Long",
        required: false,
        description: "Filtrar por cliente específico",
      },
      {
        name: "siteId",
        label: "Site",
        type: "Long",
        required: false,
        description: "Filtrar por site específico",
      },
      {
        name: "agentId",
        label: "Agente",
        type: "Long",
        required: false,
        description: "Filtrar por agente específico",
      },
      {
        name: "osName",
        label: "Sistema Operacional",
        type: "String",
        required: false,
        description: "Ex.: Windows 10, Windows Server 2019, Ubuntu",
      },
      {
        name: "processor",
        label: "Processador",
        type: "String",
        required: false,
        description: "Filtro por tipo de processador",
      },
    ],
    allowedOrientations: ["Portrait", "Landscape"],
    allowedSortFields: [
      "siteName",
      "agentHostname",
      "collectedAt",
      "osName",
      "processor",
    ],
    allowedSortDirections: ["ASC", "DESC"],
    sampleFilterPresets: [
      {
        name: "Inventário Geral",
      },
      {
        name: "Windows - Ordenado por Host",
        osName: "Windows",
      },
      {
        name: "Coleta Recente",
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

  if (!schema.scope) errors.push("Campo 'scope' é obrigatório");
  if (!schema.dateMode) errors.push("Campo 'dateMode' é obrigatório");
  if (!Array.isArray(schema.filters))
    errors.push("Campo 'filters' deve ser um array");
  if (!Array.isArray(schema.allowedOrientations))
    errors.push("Campo 'allowedOrientations' deve ser um array");
  if (!Array.isArray(schema.allowedSortFields))
    errors.push("Campo 'allowedSortFields' deve ser um array");
  if (!Array.isArray(schema.allowedSortDirections))
    errors.push("Campo 'allowedSortDirections' deve ser um array");

  // Validar cada filtro
  if (Array.isArray(schema.filters)) {
    schema.filters.forEach((filter: any, idx: number) => {
      if (!filter.name)
        errors.push(`Filtro ${idx + 1}: campo 'name' é obrigatório`);
      if (!filter.label)
        errors.push(`Filtro ${idx + 1}: campo 'label' é obrigatório`);
      if (!filter.type)
        errors.push(`Filtro ${idx + 1}: campo 'type' é obrigatório`);
      if (filter.required === undefined)
        errors.push(`Filtro ${idx + 1}: campo 'required' é obrigatório`);
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
