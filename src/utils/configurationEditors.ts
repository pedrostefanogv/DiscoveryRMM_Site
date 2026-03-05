import type {
  ClientConfiguration,
  ConfigurationFieldMetadata,
  ConfigurationOrigin,
  ConfigurationValue,
  ResolvedConfiguration,
  ServerConfiguration,
  SiteConfiguration,
} from "@/api";

export type EditableFieldKind =
  | "boolean"
  | "number"
  | "string"
  | "json"
  | "policy";

export type EditableFieldGroup =
  | "features"
  | "policy"
  | "agent"
  | "tokens"
  | "advanced";

export interface EditableField {
  key: string;
  label: string;
  kind: EditableFieldKind;
  group?: EditableFieldGroup;
  description?: string;
  unit?: string;
}

export const serverEditableFields: EditableField[] = [
  {
    key: "recoveryEnabled",
    label: "Recuperação de Dispositivos",
    kind: "boolean",
    group: "features",
    description:
      "Habilita o módulo de recuperação de dispositivos perdidos ou furtados.",
  },
  {
    key: "discoveryEnabled",
    label: "Descoberta de Rede",
    kind: "boolean",
    group: "features",
    description: "Permite que agentes descubram dispositivos na rede local.",
  },
  {
    key: "p2pFilesEnabled",
    label: "Transferência P2P de Arquivos",
    kind: "boolean",
    group: "features",
    description: "Habilita transferência de arquivos entre agentes via P2P.",
  },
  {
    key: "supportEnabled",
    label: "Suporte Remoto",
    kind: "boolean",
    group: "features",
    description:
      "Permite sessões de suporte remoto aos dispositivos gerenciados.",
  },
  {
    key: "knowledgeBaseEnabled",
    label: "Base de Conhecimento",
    kind: "boolean",
    group: "features",
    description:
      "Habilita o módulo de base de conhecimento e artigos de suporte.",
  },
  {
    key: "appStorePolicy",
    label: "Política da Loja de Aplicativos",
    kind: "policy",
    group: "policy",
    description: "Define quais aplicativos agentes podem instalar via loja.",
  },
  {
    key: "inventoryIntervalHours",
    label: "Intervalo de Inventário",
    kind: "number",
    group: "agent",
    description: "Com que frequência o agente coleta o inventário de software.",
    unit: "horas",
  },
  {
    key: "agentHeartbeatIntervalSeconds",
    label: "Intervalo de Heartbeat",
    kind: "number",
    group: "agent",
    description:
      "Frequência com que o agente envia sinal de presença ao servidor.",
    unit: "segundos",
  },
  {
    key: "agentOfflineThresholdSeconds",
    label: "Limite para Considerar Offline",
    kind: "number",
    group: "agent",
    description:
      "Tempo sem heartbeat após o qual o agente é considerado offline.",
    unit: "segundos",
  },
  {
    key: "tokenExpirationDays",
    label: "Expiração de Token",
    kind: "number",
    group: "tokens",
    description: "Tempo de vida de cada token de deploy gerado.",
    unit: "dias",
  },
  {
    key: "maxTokensPerAgent",
    label: "Máximo de Tokens por Agente",
    kind: "number",
    group: "tokens",
    description: "Quantidade máxima de tokens de deploy ativos por agente.",
    unit: "tokens",
  },
  {
    key: "autoUpdateSettingsJson",
    label: "Configurações de Atualização Automática",
    kind: "json",
    group: "advanced",
    description:
      "Janela de manutenção, canal de atualização e outras opções de auto-update.",
  },
  {
    key: "brandingSettingsJson",
    label: "Personalização Visual (Branding)",
    kind: "json",
    group: "advanced",
    description: "Logotipo, cores e identidade visual exibidos pelos agentes.",
  },
  {
    key: "aiIntegrationSettingsJson",
    label: "Integração com IA",
    kind: "json",
    group: "advanced",
    description:
      "Chave de API, modelo e parâmetros do provedor de inteligência artificial.",
  },
  {
    key: "lockedFieldsJson",
    label: "Campos Bloqueados para Herança",
    kind: "json",
    group: "advanced",
    description:
      "Lista de campos que não podem ser sobrescritos por clientes ou sites.",
  },
];

export const clientEditableFields: EditableField[] = [
  { key: "recoveryEnabled", label: "Recovery Enabled", kind: "boolean" },
  { key: "discoveryEnabled", label: "Discovery Enabled", kind: "boolean" },
  { key: "p2pFilesEnabled", label: "P2P Files Enabled", kind: "boolean" },
  { key: "supportEnabled", label: "Support Enabled", kind: "boolean" },
  { key: "appStorePolicy", label: "App Store Policy", kind: "policy" },
  {
    key: "aiIntegrationSettingsJson",
    label: "AI Integration Settings JSON",
    kind: "json",
  },
  {
    key: "inventoryIntervalHours",
    label: "Inventory Interval Hours",
    kind: "number",
  },
  {
    key: "autoUpdateSettingsJson",
    label: "Auto Update Settings JSON",
    kind: "json",
  },
  {
    key: "tokenExpirationDays",
    label: "Token Expiration Days",
    kind: "number",
  },
  { key: "maxTokensPerAgent", label: "Max Tokens Per Agent", kind: "number" },
  {
    key: "agentHeartbeatIntervalSeconds",
    label: "Agent Heartbeat Interval Seconds",
    kind: "number",
  },
  {
    key: "agentOfflineThresholdSeconds",
    label: "Agent Offline Threshold Seconds",
    kind: "number",
  },
];

export const siteEditableFields: EditableField[] = [
  { key: "recoveryEnabled", label: "Recovery Enabled", kind: "boolean" },
  { key: "discoveryEnabled", label: "Discovery Enabled", kind: "boolean" },
  { key: "p2pFilesEnabled", label: "P2P Files Enabled", kind: "boolean" },
  { key: "supportEnabled", label: "Support Enabled", kind: "boolean" },
  { key: "appStorePolicy", label: "App Store Policy", kind: "policy" },
  {
    key: "aiIntegrationSettingsJson",
    label: "AI Integration Settings JSON",
    kind: "json",
  },
  {
    key: "inventoryIntervalHours",
    label: "Inventory Interval Hours",
    kind: "number",
  },
  {
    key: "autoUpdateSettingsJson",
    label: "Auto Update Settings JSON",
    kind: "json",
  },
  { key: "timezone", label: "Timezone", kind: "string" },
  { key: "location", label: "Location", kind: "string" },
  { key: "contactPerson", label: "Contact Person", kind: "string" },
  { key: "contactEmail", label: "Contact Email", kind: "string" },
];

export function formatFieldValue(
  value: ConfigurationValue | undefined | null,
): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value, null, 2);
}

export function validateFieldValue(
  kind: EditableFieldKind,
  value: string,
  fieldKey?: string,
): string | true {
  const trimmed = value.trim();

  if (kind === "string") {
    return true;
  }

  if (kind === "boolean") {
    return trimmed === "true" || trimmed === "false"
      ? true
      : "Use true ou false";
  }

  if (kind === "number") {
    if (trimmed.length === 0 || Number.isNaN(Number(trimmed))) {
      return "Informe um numero valido";
    }

    const numeric = Number(trimmed);
    const ranges: Record<string, [number, number]> = {
      inventoryIntervalHours: [1, 168],
      agentHeartbeatIntervalSeconds: [10, 3600],
      agentOfflineThresholdSeconds: [30, 86400],
      tokenExpirationDays: [1, 3650],
      maxTokensPerAgent: [1, 100],
    };

    const fieldRange = fieldKey ? ranges[fieldKey] : undefined;
    if (fieldRange && (numeric < fieldRange[0] || numeric > fieldRange[1])) {
      return `Valor fora da faixa permitida (${fieldRange[0]}..${fieldRange[1]})`;
    }

    return true;
  }

  if (kind === "json") {
    try {
      const parsed = JSON.parse(trimmed || "{}");
      if (fieldKey === "lockedFieldsJson") {
        if (
          !Array.isArray(parsed) ||
          !parsed.every((item) => typeof item === "string")
        ) {
          return "lockedFieldsJson deve ser um JSON array de strings";
        }
      }
      return true;
    } catch {
      return "JSON invalido";
    }
  }

  if (kind === "policy") {
    if (["Disabled", "PreApproved", "All", "0", "1", "2"].includes(trimmed)) {
      return true;
    }

    return "Use Disabled, PreApproved, All, 0, 1 ou 2";
  }

  return true;
}

export function parseFieldValue(
  kind: EditableFieldKind,
  value: string,
  fieldKey?: string,
): ConfigurationValue {
  const trimmed = value.trim();

  if (kind === "string") {
    return value;
  }

  if (kind === "boolean") {
    return trimmed === "true";
  }

  if (kind === "number") {
    return Number(trimmed);
  }

  if (kind === "json") {
    if (fieldKey === "lockedFieldsJson") {
      return trimmed || "[]";
    }

    return JSON.parse(trimmed || "{}");
  }

  if (kind === "policy") {
    if (trimmed === "0" || trimmed === "1" || trimmed === "2") {
      return Number(trimmed);
    }

    return trimmed;
  }

  return value;
}

export function getEffectiveValue(
  effective: ResolvedConfiguration | undefined,
  fieldKey: string,
): ConfigurationValue | null | undefined {
  if (!effective) {
    return undefined;
  }

  if (fieldKey === "autoUpdateSettingsJson") {
    return effective.autoUpdate;
  }

  if (fieldKey === "aiIntegrationSettingsJson") {
    return effective.aiIntegration;
  }

  return effective[fieldKey] as ConfigurationValue | null | undefined;
}

export function resolveClientOrigin(
  local: ClientConfiguration | undefined,
  fieldKey: string,
): ConfigurationOrigin {
  const value = local?.[fieldKey] as ConfigurationValue | null | undefined;
  return value === null || value === undefined ? "Server" : "Client";
}

export function resolveSiteOrigin(
  siteLocal: SiteConfiguration | ResolvedConfiguration | undefined,
  clientLocal: ClientConfiguration | undefined,
  fieldKey: string,
): ConfigurationOrigin {
  const siteValue = siteLocal?.[fieldKey] as
    | ConfigurationValue
    | null
    | undefined;
  if (siteValue !== null && siteValue !== undefined) {
    return "Site";
  }

  const clientValue = clientLocal?.[fieldKey] as
    | ConfigurationValue
    | null
    | undefined;
  if (clientValue !== null && clientValue !== undefined) {
    return "Client";
  }

  return "Server";
}

function fieldDefault(kind: EditableFieldKind): string {
  if (kind === "boolean") return "false";
  if (kind === "number") return "0";
  if (kind === "json") return "{}";
  return "";
}

export function buildServerDraft(
  source: ServerConfiguration | undefined,
  fields: EditableField[],
): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const field of fields) {
    const raw = formatFieldValue(
      source?.[field.key] as ConfigurationValue | undefined,
    );
    draft[field.key] = raw !== "" ? raw : fieldDefault(field.kind);
  }
  return draft;
}

export function buildInheritedState(
  source: Record<string, ConfigurationValue | null | undefined> | undefined,
  fields: EditableField[],
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const field of fields) {
    const value = source?.[field.key];
    result[field.key] = value === null || value === undefined;
  }
  return result;
}

export type LockScope = "server" | "client" | "site";

export function getFieldMetadata(
  metadataFields: Record<string, ConfigurationFieldMetadata> | undefined,
  fieldKey: string,
): ConfigurationFieldMetadata | undefined {
  return metadataFields?.[fieldKey] ?? metadataFields?.[toPascalCase(fieldKey)];
}

export function canEditFieldAtScope(
  fieldMeta: ConfigurationFieldMetadata | undefined,
  scope: LockScope,
): boolean {
  if (!fieldMeta) {
    return true;
  }

  if (scope === "server") {
    return true;
  }

  if (scope === "client") {
    return fieldMeta.canEditAtClient !== false;
  }

  return fieldMeta.canEditAtSite !== false;
}

export function getLockOwnerForScope(
  fieldMeta: ConfigurationFieldMetadata | undefined,
  scope: LockScope,
): string | null {
  if (!fieldMeta) {
    return null;
  }

  if (scope === "client") {
    return fieldMeta.lockOwnerForClient ?? null;
  }

  if (scope === "site") {
    return fieldMeta.lockOwnerForSite ?? null;
  }

  return null;
}

export function isInheritedBySourceType(
  fieldMeta: ConfigurationFieldMetadata | undefined,
  scope: Exclude<LockScope, "server">,
): boolean {
  const sourceType = fieldMeta?.sourceType;

  if (sourceType === undefined || sourceType === null) {
    return true;
  }

  if (scope === "client") {
    return sourceType !== 3;
  }

  return sourceType !== 4;
}

function toPascalCase(value: string): string {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}
