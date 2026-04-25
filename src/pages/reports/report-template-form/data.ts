import type { ScopeTypeString } from "@/api/types";
import type { DatasetSectionSourcePreset, SupportedFormat } from "./types";

export const FORMAT_OPTIONS: SupportedFormat[] = ["pdf", "xlsx", "csv"];
export const SCOPE_OPTIONS: ScopeTypeString[] = [
  "global",
  "client",
  "site",
  "agent",
];
export const ALIGN_OPTIONS = ["left", "center", "right"];

export const DATASET_SECTION_SOURCES: Record<
  string,
  DatasetSectionSourcePreset[]
> = {
  "agent-hardware": [
    {
      source: "hardware",
      label: "Resumo de hardware",
      columns: [
        { field: "manufacturer", label: "Fabricante", format: "text" },
        { field: "model", label: "Modelo", format: "text" },
        { field: "processor", label: "Processador", format: "text" },
        { field: "totalMemoryBytes", label: "Memoria total", format: "number" },
        { field: "osName", label: "Sistema operacional", format: "text" },
      ],
    },
    {
      source: "disks",
      label: "Discos",
      columns: [
        { field: "diskCount", label: "Qtd discos", format: "number" },
        { field: "totalDiskBytes", label: "Disco total", format: "number" },
        { field: "freeDiskBytes", label: "Disco livre", format: "number" },
        { field: "diskUsagePct", label: "Uso disco (%)", format: "number" },
        { field: "driveLetter", label: "Drive", format: "text" },
        { field: "label", label: "Label", format: "text" },
        { field: "fileSystem", label: "Sistema de arquivos", format: "text" },
        { field: "totalSizeBytes", label: "Tamanho total", format: "number" },
        { field: "freeSpaceBytes", label: "Espaco livre", format: "number" },
        { field: "mediaType", label: "Tipo", format: "text" },
      ],
    },
    {
      source: "networkAdapters",
      label: "Adaptadores de rede",
      columns: [
        { field: "adapterCount", label: "Qtd adaptadores", format: "number" },
        { field: "name", label: "Nome", format: "text" },
        { field: "macAddress", label: "MAC", format: "text" },
        { field: "ipAddress", label: "IP", format: "text" },
        { field: "subnetMask", label: "Mascara", format: "text" },
        { field: "gateway", label: "Gateway", format: "text" },
        { field: "dnsServers", label: "DNS", format: "text" },
      ],
    },
    {
      source: "memoryModules",
      label: "Modulos de memoria",
      columns: [
        { field: "memoryModuleCount", label: "Qtd modulos", format: "number" },
        { field: "manufacturer", label: "Fabricante", format: "text" },
        { field: "partNumber", label: "Part number", format: "text" },
        { field: "capacityBytes", label: "Capacidade", format: "number" },
        { field: "speedMhz", label: "Velocidade", format: "number" },
        { field: "type", label: "Tipo", format: "text" },
      ],
    },
    {
      source: "softwareItems",
      label: "Softwares instalados",
      columns: [
        { field: "softwareName", label: "Nome", format: "text" },
        { field: "publisher", label: "Fabricante", format: "text" },
        { field: "version", label: "Versao", format: "text" },
        { field: "installedAt", label: "Instalado em", format: "date" },
      ],
    },
    {
      source: "components",
      label: "Componentes (raw)",
      columns: [
        {
          field: "inventoryCollectedAt",
          label: "Inventario coletado em",
          format: "date",
        },
        {
          field: "inventorySchemaVersion",
          label: "Schema inventario",
          format: "text",
        },
        { field: "type", label: "Tipo", format: "text" },
        { field: "name", label: "Nome", format: "text" },
        { field: "manufacturer", label: "Fabricante", format: "text" },
        { field: "value", label: "Valor", format: "text" },
      ],
    },
  ],
  "software-inventory": [
    {
      source: "items",
      label: "Itens de software",
      columns: [
        { field: "softwareName", label: "Software", format: "text" },
        { field: "publisher", label: "Fabricante", format: "text" },
        { field: "version", label: "Versao", format: "text" },
        { field: "installCount", label: "Instalacoes", format: "number" },
      ],
    },
    {
      source: "agents",
      label: "Agentes com o software",
      columns: [
        { field: "agentHostname", label: "Hostname", format: "text" },
        { field: "siteName", label: "Site", format: "text" },
        { field: "version", label: "Versao", format: "text" },
        { field: "lastSeenAt", label: "Ultima vez", format: "date" },
      ],
    },
    {
      source: "publishers",
      label: "Agrupado por fabricante",
      columns: [
        { field: "publisher", label: "Fabricante", format: "text" },
        { field: "softwareCount", label: "Qtd software", format: "number" },
        { field: "agentCount", label: "Qtd agentes", format: "number" },
      ],
    },
    {
      source: "sites",
      label: "Agrupado por site",
      columns: [
        { field: "siteName", label: "Site", format: "text" },
        { field: "softwareCount", label: "Qtd software", format: "number" },
        { field: "agentCount", label: "Qtd agentes", format: "number" },
      ],
    },
  ],
  "configuration-audit": [
    {
      source: "entries",
      label: "Entradas de auditoria",
      columns: [
        { field: "changedAt", label: "Data/Hora", format: "date" },
        { field: "entityType", label: "Tipo entidade", format: "text" },
        { field: "fieldName", label: "Campo", format: "text" },
        { field: "changedBy", label: "Alterado por", format: "text" },
      ],
    },
  ],
  tickets: [
    {
      source: "items",
      label: "Tickets",
      columns: [
        { field: "title", label: "Titulo", format: "text" },
        { field: "priority", label: "Prioridade", format: "text" },
        { field: "category", label: "Categoria", format: "text" },
        { field: "createdAt", label: "Criado em", format: "date" },
      ],
    },
    {
      source: "timeline",
      label: "Timeline dos tickets",
      columns: [
        { field: "activityType", label: "Atividade", format: "text" },
        { field: "description", label: "Descricao", format: "text" },
        { field: "createdAt", label: "Data/Hora", format: "date" },
      ],
    },
  ],
  logs: [
    {
      source: "entries",
      label: "Entradas de log",
      columns: [
        { field: "createdAt", label: "Data/Hora", format: "date" },
        { field: "level", label: "Nivel", format: "text" },
        { field: "source", label: "Fonte", format: "text" },
        { field: "message", label: "Mensagem", format: "text" },
      ],
    },
  ],
  "agent-labels": [
    {
      source: "labels",
      label: "Labels por agente",
      columns: [
        { field: "agentId", label: "Agent ID", format: "text" },
        { field: "hostname", label: "Hostname", format: "text" },
        { field: "displayName", label: "Display name", format: "text" },
        { field: "label", label: "Label", format: "text" },
        { field: "sourceType", label: "Origem", format: "text" },
        { field: "ruleId", label: "Regra", format: "text" },
        { field: "updatedAt", label: "Atualizado em", format: "date" },
      ],
    },
    {
      source: "rules",
      label: "Regras de labels",
      columns: [
        { field: "ruleId", label: "Rule ID", format: "text" },
        { field: "ruleName", label: "Nome da regra", format: "text" },
        { field: "label", label: "Label", format: "text" },
        { field: "isEnabled", label: "Ativa", format: "text" },
        { field: "applyMode", label: "Modo", format: "text" },
        { field: "totalAgents", label: "Qtd agentes", format: "number" },
      ],
    },
  ],
  "knowledge-base": [
    {
      source: "articles",
      label: "Artigos",
      columns: [
        { field: "title", label: "Titulo", format: "text" },
        { field: "category", label: "Categoria", format: "text" },
        { field: "author", label: "Autor", format: "text" },
        { field: "isPublished", label: "Publicado", format: "text" },
        { field: "updatedAt", label: "Atualizado em", format: "date" },
      ],
    },
    {
      source: "tags",
      label: "Tags",
      columns: [
        { field: "tag", label: "Tag", format: "text" },
        { field: "articleCount", label: "Qtd artigos", format: "number" },
      ],
    },
  ],
};

DATASET_SECTION_SOURCES["agenthardware"] =
  DATASET_SECTION_SOURCES["agent-hardware"];
DATASET_SECTION_SOURCES["agent_hardware"] =
  DATASET_SECTION_SOURCES["agent-hardware"];
DATASET_SECTION_SOURCES["softwareinventory"] =
  DATASET_SECTION_SOURCES["software-inventory"];
DATASET_SECTION_SOURCES["software_inventory"] =
  DATASET_SECTION_SOURCES["software-inventory"];
DATASET_SECTION_SOURCES["configurationaudit"] =
  DATASET_SECTION_SOURCES["configuration-audit"];
DATASET_SECTION_SOURCES["configuration_audit"] =
  DATASET_SECTION_SOURCES["configuration-audit"];
DATASET_SECTION_SOURCES["agentlabels"] =
  DATASET_SECTION_SOURCES["agent-labels"];
DATASET_SECTION_SOURCES["agent_labels"] =
  DATASET_SECTION_SOURCES["agent-labels"];
DATASET_SECTION_SOURCES["knowledgebase"] =
  DATASET_SECTION_SOURCES["knowledge-base"];
DATASET_SECTION_SOURCES["knowledge_base"] =
  DATASET_SECTION_SOURCES["knowledge-base"];
