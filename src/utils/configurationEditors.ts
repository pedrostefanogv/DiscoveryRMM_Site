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
  | "advanced"
  | "storage"
  | "siteProfile";

export interface EditableField {
  key: string;
  label: string;
  kind: EditableFieldKind;
  group?: EditableFieldGroup;
  description?: string;
  unit?: string;
}

const AI_INTEGRATION_FIELD_KEY = "aiIntegrationSettingsJson";

function sanitizeAiIntegrationObject(
  value: unknown,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = { ...(value as Record<string, unknown>) };

  // ApiKey e apiKey sao write-only: nunca exibir valores existentes.
  if ("apiKey" in record) {
    delete record.apiKey;
  }
  if ("ApiKey" in record) {
    delete record.ApiKey;
  }

  return record;
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
    key: "p2PFilesEnabled",
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
    description:
      "Controla quais aplicativos os agentes podem instalar: Desativado (nenhum), Pré-aprovados (lista whitelist) ou Todos.",
  },
  {
    key: "inventoryIntervalHours",
    label: "Intervalo de Inventário",
    kind: "number",
    group: "agent",
    description:
      "Com qual frequência (em horas) cada agente coleta e envia o inventário de software instalado. Valores menores = atualizações mais frequentes.",
    unit: "horas",
  },
  {
    key: "agentHeartbeatIntervalSeconds",
    label: "Intervalo de Heartbeat",
    kind: "number",
    group: "agent",
    description:
      "Com qual frequência (em segundos) o agente envia um sinal de presença. Define se o agente está ativo e conectado ao servidor.",
    unit: "segundos",
  },
  {
    key: "agentOfflineThresholdSeconds",
    label: "Limite para Considerar Offline",
    kind: "number",
    group: "agent",
    description:
      "Tempo máximo (em segundos) sem receber heartbeat antes que o agente seja marcado como offline. Deve ser > que o intervalo de heartbeat.",
    unit: "segundos",
  },
  {
    key: "tokenExpirationDays",
    label: "Expiração de Token",
    kind: "number",
    group: "tokens",
    description:
      "Tempo de vida (em dias) de cada token de deploy. Tokens expirados devem ser regenerados. Valores menores aumentam a segurança mas requerem regeneração frequente.",
    unit: "dias",
  },
  {
    key: "maxTokensPerAgent",
    label: "Máximo de Tokens por Agente",
    kind: "number",
    group: "tokens",
    description:
      "Quantidade máxima de tokens de deploy ativos simultaneamente por agente. Quando atingida, novos tokens exigem remoção de antigos.",
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
      "Chave de API, modelo e parâmetros do provedor de IA. A chave é write-only e só deve ser enviada quando informada novamente.",
  },
  {
    key: "meshCentralGroupPolicyProfile",
    label: "Perfil de Política de Grupo MeshCentral",
    kind: "string",
    group: "advanced",
    description:
      "Perfil de policy aplicado ao MeshCentral em nível global. Pode ser herdado por cliente e site.",
  },
  {
    key: "lockedFieldsJson",
    label: "Campos Bloqueados para Herança",
    kind: "json",
    group: "advanced",
    description:
      "Lista de campos que não podem ser sobrescritos por clientes ou sites.",
  },
  // ── Object Storage (S3-compatible / MinIO) ─────────────────
  {
    key: "objectStorageEndpoint",
    label: "Endpoint S3",
    kind: "string",
    group: "storage",
    description:
      "URL base do servidor S3-compatível (ex.: https://s3.us-east-1.amazonaws.com). Deixe em branco para desabilitar o armazenamento.",
  },
  {
    key: "objectStorageBucketName",
    label: "Bucket",
    kind: "string",
    group: "storage",
    description: "Nome do bucket onde os arquivos serão armazenados.",
  },
  {
    key: "objectStorageRegion",
    label: "Região",
    kind: "string",
    group: "storage",
    description: "Região do bucket (ex.: us-east-1, sa-east-1).",
  },
  {
    key: "objectStorageAccessKey",
    label: "Access Key",
    kind: "string",
    group: "storage",
    description: "Chave de acesso (Access Key ID) para autenticação no S3.",
  },
  {
    key: "objectStorageSecretKey",
    label: "Secret Key",
    kind: "string",
    group: "storage",
    description:
      "Chave secreta (Secret Access Key). Será mascarada na exibição.",
  },
  {
    key: "objectStorageUrlTtlHours",
    label: "TTL de URLs Assinadas",
    kind: "number",
    group: "storage",
    description:
      "Tempo de validade (em horas) das URLs pré-assinadas geradas pelo servidor.",
    unit: "horas",
  },
  {
    key: "objectStorageUsePathStyle",
    label: "Usar Path Style",
    kind: "boolean",
    group: "storage",
    description:
      "Ative para endpoints MinIO/compatíveis que exigem path-style (ex.: endpoint/bucket em vez de bucket.endpoint).",
  },
  {
    key: "objectStorageSslVerify",
    label: "Verificar SSL",
    kind: "boolean",
    group: "storage",
    description:
      "Valida o certificado TLS do endpoint. Desative apenas em ambientes de desenvolvimento com certificados autoassinados.",
  },
];

export const clientEditableFields: EditableField[] = [
  {
    key: "recoveryEnabled",
    label: "Recuperação de Dispositivos",
    kind: "boolean",
    group: "features",
  },
  {
    key: "discoveryEnabled",
    label: "Descoberta de Rede",
    kind: "boolean",
    group: "features",
  },
  {
    key: "p2PFilesEnabled",
    label: "Transferência P2P de Arquivos",
    kind: "boolean",
    group: "features",
  },
  {
    key: "supportEnabled",
    label: "Suporte Remoto",
    kind: "boolean",
    group: "features",
  },
  {
    key: "appStorePolicy",
    label: "Política da Loja de Aplicativos",
    kind: "policy",
    group: "policy",
  },
  {
    key: "aiIntegrationSettingsJson",
    label: "Integração com IA",
    kind: "json",
    group: "advanced",
    description:
      "ApiKey e write-only: mantenha ausente no JSON e inclua somente quando quiser trocar a chave.",
  },
  {
    key: "meshCentralGroupPolicyProfile",
    label: "Perfil de Política de Grupo MeshCentral",
    kind: "string",
    group: "advanced",
    description:
      "Override do perfil de policy MeshCentral no escopo do cliente. Deixe herdado para usar o global.",
  },
  {
    key: "inventoryIntervalHours",
    label: "Intervalo de Inventário",
    kind: "number",
    group: "agent",
    unit: "horas",
    description:
      "Com qual frequência (em horas) cada agente coleta e envia o inventário de software instalado. Valores menores = atualizações mais frequentes.",
  },
  {
    key: "autoUpdateSettingsJson",
    label: "Configurações de Atualização Automática",
    kind: "json",
    group: "advanced",
  },
  {
    key: "tokenExpirationDays",
    label: "Expiração de Token",
    kind: "number",
    group: "tokens",
    unit: "dias",
    description:
      "Tempo de vida (em dias) de cada token de deploy. Tokens expirados devem ser regenerados. Valores menores aumentam a segurança mas requerem regeneração frequente.",
  },
  {
    key: "maxTokensPerAgent",
    label: "Máximo de Tokens por Agente",
    kind: "number",
    group: "tokens",
    unit: "tokens",
    description:
      "Quantidade máxima de tokens de deploy ativos simultaneamente por agente. Quando atingida, novos tokens exigem remoção de antigos.",
  },
  {
    key: "agentHeartbeatIntervalSeconds",
    label: "Intervalo de Heartbeat",
    kind: "number",
    group: "agent",
    unit: "segundos",
    description:
      "Com qual frequência (em segundos) o agente envia um sinal de presença. Define se o agente está ativo e conectado ao servidor.",
  },
  {
    key: "agentOfflineThresholdSeconds",
    label: "Limite para Considerar Offline",
    kind: "number",
    group: "agent",
    unit: "segundos",
    description:
      "Tempo máximo (em segundos) sem receber heartbeat antes que o agente seja marcado como offline. Deve ser > que o intervalo de heartbeat.",
  },
];

export const siteEditableFields: EditableField[] = [
  {
    key: "recoveryEnabled",
    label: "Recuperação de Dispositivos",
    kind: "boolean",
    group: "features",
  },
  {
    key: "discoveryEnabled",
    label: "Descoberta de Rede",
    kind: "boolean",
    group: "features",
  },
  {
    key: "p2PFilesEnabled",
    label: "Transferência P2P de Arquivos",
    kind: "boolean",
    group: "features",
  },
  {
    key: "supportEnabled",
    label: "Suporte Remoto",
    kind: "boolean",
    group: "features",
  },
  {
    key: "appStorePolicy",
    label: "Política da Loja de Aplicativos",
    kind: "policy",
    group: "policy",
  },
  {
    key: "aiIntegrationSettingsJson",
    label: "Integração com IA",
    kind: "json",
    group: "advanced",
    description:
      "ApiKey e write-only: mantenha ausente no JSON e inclua somente quando quiser trocar a chave.",
  },
  {
    key: "meshCentralGroupPolicyProfile",
    label: "Perfil de Política de Grupo MeshCentral",
    kind: "string",
    group: "advanced",
    description:
      "Override do perfil de policy MeshCentral no escopo do site. Deixe herdado para usar cliente/global.",
  },
  {
    key: "inventoryIntervalHours",
    label: "Intervalo de Inventário",
    kind: "number",
    group: "agent",
    unit: "horas",
    description:
      "Com qual frequência (em horas) cada agente coleta e envia o inventário de software instalado. Valores menores = atualizações mais frequentes.",
  },
  {
    key: "autoUpdateSettingsJson",
    label: "Configurações de Atualização Automática",
    kind: "json",
    group: "advanced",
  },
  {
    key: "timezone",
    label: "Fuso Horário",
    kind: "string",
    group: "siteProfile",
  },
  {
    key: "location",
    label: "Localização",
    kind: "string",
    group: "siteProfile",
  },
  {
    key: "contactPerson",
    label: "Contato Responsável",
    kind: "string",
    group: "siteProfile",
  },
  {
    key: "contactEmail",
    label: "Email de Contato",
    kind: "string",
    group: "siteProfile",
  },
];

export function formatFieldValue(
  value: ConfigurationValue | undefined | null,
  fieldKey?: string,
): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (fieldKey === AI_INTEGRATION_FIELD_KEY) {
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        const sanitized = sanitizeAiIntegrationObject(parsed);
        if (sanitized) {
          return JSON.stringify(sanitized, null, 2);
        }
      } catch {
        return value;
      }
    }

    const sanitized = sanitizeAiIntegrationObject(value);
    if (sanitized) {
      return JSON.stringify(sanitized, null, 2);
    }
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
    if (["Disabled", "PreApproved", "All"].includes(trimmed)) {
      return true;
    }

    return "Use Disabled, PreApproved ou All";
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

    const parsed = JSON.parse(trimmed || "{}");

    if (
      fieldKey === AI_INTEGRATION_FIELD_KEY &&
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      const aiPayload = { ...(parsed as Record<string, unknown>) };
      const apiKeyValue = aiPayload.apiKey ?? aiPayload.ApiKey;

      if (typeof apiKeyValue !== "string" || apiKeyValue.trim().length === 0) {
        delete aiPayload.apiKey;
        delete aiPayload.ApiKey;
      }

      return aiPayload;
    }

    return parsed;
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
    return (
      sanitizeAiIntegrationObject(effective.aiIntegration) ??
      effective.aiIntegration
    );
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
      field.key,
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
