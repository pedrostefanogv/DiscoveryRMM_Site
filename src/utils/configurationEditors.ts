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
  | "nats"
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

/**
 * Política da Loja de Aplicativos (AppStorePolicyType no backend).
 * Os valores são enviados como 0/1/2 e o backend serializa o enum como número.
 */
export const APP_STORE_POLICY_LABELS: Record<number, string> = {
  0: "Desativado",
  1: "Pré-aprovados",
  2: "Todos",
};

export const APP_STORE_POLICY_OPTIONS: { value: string; label: string }[] = [
  { value: "0", label: "0 - Desativado (nenhum aplicativo autorizado)" },
  { value: "1", label: "1 - Pré-aprovados (apenas aplicativos da lista)" },
  { value: "2", label: "2 - Todos (qualquer aplicativo autorizado)" },
];

const APP_STORE_POLICY_NAMES: Record<string, number> = {
  Disabled: 0,
  PreApproved: 1,
  All: 2,
};

/**
 * Normaliza o valor da política vindo da API (0/1/2 numérico ou o nome do enum
 * como string, ex.: "PreApproved") para um rótulo legível em pt-BR.
 */
export function formatAppStorePolicyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "number") {
    return APP_STORE_POLICY_LABELS[value] ?? String(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return "";
    }

    if (trimmed in APP_STORE_POLICY_NAMES) {
      return APP_STORE_POLICY_LABELS[APP_STORE_POLICY_NAMES[trimmed]];
    }

    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return APP_STORE_POLICY_LABELS[numeric] ?? trimmed;
    }

    return trimmed;
  }

  return String(value);
}

/**
 * Dependências entre funcionalidades. Chave = campo dependente; requiresAnyOf =
 * campos que precisam estar ativos (true) para a funcionalidade fazer sentido.
 * Espelha a regra aplicada no agent (resolveP2PFileTransferEnabled e o gate de
 * zero-touch), evitando que o painel permita uma combinação que o agent ignora.
 */
export const FEATURE_DEPENDENCIES: Record<
  string,
  { requiresAnyOf: string[]; reason: string }
> = {
  p2PFilesEnabled: {
    requiresAnyOf: ["discoveryEnabled", "cloudBootstrapEnabled"],
    reason:
      "A Transferência P2P de Arquivos requer Descoberta de Rede ou Bootstrap P2P via Nuvem ativos — sem um caminho de descoberta os agentes não se encontram.",
  },
  zeroTouchEnabled: {
    requiresAnyOf: ["discoveryEnabled"],
    reason:
      "O Zero-Touch requer Descoberta de Rede ativa para os agentes se encontrarem na rede.",
  },
};

function isFeatureValueTrue(
  values: Record<string, string | undefined>,
  key: string,
): boolean {
  return String(values[key] ?? "").trim() === "true";
}

/**
 * Retorna a razão pela qual a funcionalidade não pode ser ativada com os valores
 * atuais, ou null quando não há dependência pendente.
 */
export function getFeatureDependencyIssue(
  fieldKey: string,
  values: Record<string, string | undefined>,
): string | null {
  const dependency = FEATURE_DEPENDENCIES[fieldKey];
  if (!dependency) {
    return null;
  }

  const satisfied = dependency.requiresAnyOf.some((key) =>
    isFeatureValueTrue(values, key),
  );

  return satisfied ? null : dependency.reason;
}

/**
 * Ao desativar `changedKey`, devolve os campos dependentes que estão ativos e
 * perderiam o caminho de descoberta — devem ser desativados junto para o painel
 * não ficar num estado que o agent ignora.
 */
export function getDependentsToDisable(
  changedKey: string,
  values: Record<string, string | undefined>,
): string[] {
  const afterChange: Record<string, string | undefined> = {
    ...values,
    [changedKey]: "false",
  };

  return Object.keys(FEATURE_DEPENDENCIES).filter(
    (key) =>
      isFeatureValueTrue(values, key) &&
      getFeatureDependencyIssue(key, afterChange) !== null,
  );
}

function sanitizeAiIntegrationObject(
  value: unknown,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = { ...(value as Record<string, unknown>) };

  // ApiKey, apiKey, EmbeddingApiKey e embeddingApiKey sao write-only: nunca exibir valores existentes.
  if ("apiKey" in record) {
    delete record.apiKey;
  }
  if ("ApiKey" in record) {
    delete record.ApiKey;
  }
  if ("embeddingApiKey" in record) {
    delete record.embeddingApiKey;
  }
  if ("EmbeddingApiKey" in record) {
    delete record.EmbeddingApiKey;
  }

  return record;
}

const HOST_LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const IPV4_REGEX = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

function isValidHostOnly(value: string): boolean {
  if (!value) {
    return true;
  }

  if (value.includes("://") || value.includes("/") || value.includes(":")) {
    return false;
  }

  if (IPV4_REGEX.test(value)) {
    return true;
  }

  const parts = value.split(".");
  if (parts.some((part) => part.length === 0)) {
    return false;
  }

  return parts.every((part) => HOST_LABEL_REGEX.test(part));
}

export const serverEditableFields: EditableField[] = [
  {
    key: "recoveryEnabled",
    label: "Recuperação de Dispositivos",
    kind: "boolean",
    group: "features",
    description:
      "Reinstala e reconfigura dispositivos que perderam a configuração ou foram formatados, reaproveitando a identidade e o histórico do agente.",
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
    description:
      "Habilita o download e o compartilhamento de instaladores entre agentes via P2P. Requer Descoberta de Rede ou Bootstrap P2P via Nuvem ativos — sem um caminho de descoberta os agentes não se encontram e o P2P fica desativado no agent.",
  },
  {
    key: "cloudBootstrapEnabled",
    label: "Bootstrap P2P via Nuvem",
    kind: "boolean",
    group: "features",
    description: "Permite que agentes P2P se descubram entre VLANs e multi-redes diferentes usando o servidor como ponto de bootstrap na nuvem.",
  },
  {
    key: "chatAIEnabled",
    label: "Chat IA",
    kind: "boolean",
    group: "features",
    description: "Habilita o chat com IA para suporte no painel.",
  },
  {
    key: "supportEnabled",
    label: "Chamados e Suporte Remoto",
    kind: "boolean",
    group: "features",
    description:
      "Exibe o menu de Chamados/Suporte no agent e permite abrir, consultar, comentar e fechar chamados, além das sessões de suporte remoto.",
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
    key: "zeroTouchEnabled",
    label: "Zero-Touch",
    kind: "boolean",
    group: "features",
    description:
      "Permite que agentes sem credenciais se registrem sozinhos pela rede (P2P onboarding). Requer Descoberta de Rede ativa para os agentes se encontrarem.",
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
    key: "agentOnlineGraceSeconds",
    label: "Janela de Tolerância para Offline",
    kind: "number",
    group: "agent",
    description:
      "Tempo (em segundos) sem receber heartbeat antes de considerar o agente offline. Deve ser maior que o intervalo de heartbeat.",
    unit: "segundos",
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
    key: "backgroundProcessingSettingsJson",
    label: "Processamento em Segundo Plano",
    kind: "json",
    group: "advanced",
    description:
      "Ciclos agendados: métricas por atendente (intervalo mínimo de 10 min) e triagem por IA em lotes. Clientes herdam estes valores e podem sobrescrever campo a campo.",
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
  // ── NATS (Server-only) ───────────────────────────────
  {
    key: "natsEnabled",
    label: "NATS Habilitado",
    kind: "boolean",
    group: "nats",
    description: "Ativa o servidor NATS para realtime e comunicação dos agentes.",
  },
  {
    key: "natsAuthEnabled",
    label: "Autenticação NATS",
    kind: "boolean",
    group: "nats",
    description: "Exige autenticação JWT na conexão com o broker NATS.",
  },
  {
    key: "natsUseWssExternal",
    label: "WSS Externo",
    kind: "boolean",
    group: "nats",
    description: "Usa WebSocket seguro (WSS) para conexões externas ao NATS.",
  },
  {
    key: "natsServerHostExternal",
    label: "NATS Host Externo (Agents)",
    kind: "string",
    group: "nats",
    description: "Host/IP utilizado pelos agents para conectar ao servidor NATS. Geralmente um endereço público ou acessível na rede dos agents. Sem protocolo e sem porta.",
  },
  {
    key: "natsServerHostInternal",
    label: "NATS Host Interno (Servidor)",
    kind: "string",
    group: "nats",
    description: "Host/IP utilizado pelo próprio servidor para conectar ao NATS. Pode ser localhost ou um endereço interno. Sem protocolo e sem porta.",
  },
  {
    key: "natsAgentJwtTtlMinutes",
    label: "TTL JWT do Agent",
    kind: "number",
    group: "nats",
    description: "Tempo de vida do JWT emitido para agents. Mínimo 15 min, máximo 4320 min (72h). Padrão: 1440 min (24h).",
    unit: "min",
  },
  {
    key: "natsUserJwtTtlMinutes",
    label: "TTL JWT do Usuário",
    kind: "number",
    group: "nats",
    description: "Tempo de vida do JWT emitido para usuários. Mínimo 15 min, máximo 4320 min (72h). Padrão: 1440 min (24h).",
    unit: "min",
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
    description:
      "Requer Descoberta de Rede neste escopo ou herdada, ou Bootstrap P2P via Nuvem neste escopo ou herdado do servidor.",
  },
  {
    key: "cloudBootstrapEnabled",
    label: "Bootstrap P2P via Nuvem",
    kind: "boolean",
    group: "features",
    description:
      "Permite que agentes deste cliente se descubram entre VLANs usando o servidor. Serve como caminho de descoberta alternativo para o P2P.",
  },
  {
    key: "chatAIEnabled",
    label: "Chat IA",
    kind: "boolean",
    group: "features",
  },
  {
    key: "supportEnabled",
    label: "Chamados e Suporte Remoto",
    kind: "boolean",
    group: "features",
  },
  {
    key: "knowledgeBaseEnabled",
    label: "Base de Conhecimento",
    kind: "boolean",
    group: "features",
  },
  {
    key: "zeroTouchEnabled",
    label: "Zero-Touch",
    kind: "boolean",
    group: "features",
    description:
      "Requer Descoberta de Rede ativa neste escopo ou herdada para os agentes se encontrarem.",
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
    key: "backgroundProcessingSettingsJson",
    label: "Processamento em Segundo Plano (override)",
    kind: "json",
    group: "advanced",
    description:
      "Sobrescreve os ciclos herdados do global. Envie apenas os campos que quiser mudar (ausentes herdam); ex.: Metrics.IntervalMinutes=60 ou Triage.Enabled=false.",
  },
  {
    key: "lockedFieldsJson",
    label: "Campos Bloqueados para Herança",
    kind: "json",
    group: "advanced",
    description:
      "Lista de campos bloqueados neste cliente para impedir override no nível de site.",
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
    key: "agentHeartbeatIntervalSeconds",
    label: "Intervalo de Heartbeat",
    kind: "number",
    group: "agent",
    unit: "segundos",
    description:
      "Com qual frequência (em segundos) o agente envia um sinal de presença. Define se o agente está ativo e conectado ao servidor.",
  },
  {
    key: "agentOnlineGraceSeconds",
    label: "Janela de Tolerância para Offline",
    kind: "number",
    group: "agent",
    unit: "segundos",
    description:
      "Tempo (em segundos) sem receber heartbeat antes de considerar o agente offline. Deve ser maior que o intervalo de heartbeat.",
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
    description:
      "Requer Descoberta de Rede neste escopo ou herdada, ou Bootstrap P2P via Nuvem herdado do cliente/servidor.",
  },
  {
    key: "chatAIEnabled",
    label: "Chat IA",
    kind: "boolean",
    group: "features",
  },
  {
    key: "supportEnabled",
    label: "Chamados e Suporte Remoto",
    kind: "boolean",
    group: "features",
  },
  {
    key: "knowledgeBaseEnabled",
    label: "Base de Conhecimento",
    kind: "boolean",
    group: "features",
  },
  {
    key: "zeroTouchEnabled",
    label: "Zero-Touch",
    kind: "boolean",
    group: "features",
    description:
      "Requer Descoberta de Rede ativa neste escopo ou herdada para os agentes se encontrarem.",
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
    key: "lockedFieldsJson",
    label: "Campos Bloqueados para Herança",
    kind: "json",
    group: "advanced",
    description:
      "Lista de campos bloqueados neste site para impedir sobrescritas em níveis inferiores.",
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
    if (fieldKey === "appStorePolicy") {
      if (value === "Disabled") return "0";
      if (value === "PreApproved") return "1";
      if (value === "All") return "2";
    }
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    if (fieldKey === "appStorePolicy") {
      return String(value);
    }
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
    if (
      fieldKey === "natsServerHostInternal" ||
      fieldKey === "natsServerHostExternal"
    ) {
      if (trimmed.length === 0) {
        return true;
      }

      return isValidHostOnly(trimmed)
        ? true
        : "Informe apenas host ou IP, sem porta e sem protocolo";
    }
    return true;
  }

  if (kind === "boolean") {
    return trimmed === "true" || trimmed === "false"
      ? true
      : "Use true ou false";
  }

  if (kind === "number") {
    if (trimmed.length === 0 || Number.isNaN(Number(trimmed))) {
      return "Informe um número valido";
    }

    const numeric = Number(trimmed);
    const ranges: Record<string, [number, number]> = {
      inventoryIntervalHours: [1, 168],
      agentHeartbeatIntervalSeconds: [10, 3600],
      agentOnlineGraceSeconds: [60, 3600],
      objectStorageUrlTtlHours: [1, 168],
      natsAgentJwtTtlMinutes: [15, 4320],
      natsUserJwtTtlMinutes: [15, 4320],
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

      if (fieldKey === "reportingSettingsJson") {
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          return "reportingSettingsJson deve ser um objeto JSON";
        }

        const dbRetention = Number(
          (parsed as Record<string, unknown>).databaseRetentionDays,
        );
        const fileRetention = Number(
          (parsed as Record<string, unknown>).fileRetentionDays,
        );

        if (
          Number.isNaN(dbRetention) ||
          Number.isNaN(fileRetention) ||
          dbRetention < 1 ||
          fileRetention < 1
        ) {
          return "Reporting requer databaseRetentionDays e fileRetentionDays >= 1";
        }
      }

      if (fieldKey === "ticketAttachmentSettingsJson") {
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          return "ticketAttachmentSettingsJson deve ser um objeto JSON";
        }

        const payload = parsed as Record<string, unknown>;
        const maxFileSizeBytes = Number(payload.maxFileSizeBytes);
        const presignedTtl = Number(payload.presignedUploadUrlTtlMinutes);
        const allowedContentTypes = payload.allowedContentTypes;

        if (
          Number.isNaN(maxFileSizeBytes) ||
          maxFileSizeBytes <= 0 ||
          maxFileSizeBytes > 1024 * 1024 * 1024
        ) {
          return "MaxFileSizeBytes deve ser maior que 0 e menor ou igual a 1GB";
        }

        if (Number.isNaN(presignedTtl) || presignedTtl < 1 || presignedTtl > 120) {
          return "PresignedUploadUrlTtlMinutes deve estar entre 1 e 120";
        }

        if (
          !Array.isArray(allowedContentTypes) ||
          allowedContentTypes.length === 0 ||
          !allowedContentTypes.every((item) => typeof item === "string")
        ) {
          return "AllowedContentTypes deve ser um array de strings não vazio";
        }
      }

      return true;
    } catch {
      return "JSON inválido";
    }
  }

  if (kind === "policy") {
    if (["0", "1", "2"].includes(trimmed)) {
      return true;
    }

    return "Selecione uma política válida: 0 (Desativado), 1 (Pré-aprovados) ou 2 (Todos)";
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
    if (
      fieldKey === "natsServerHostInternal" ||
      fieldKey === "natsServerHostExternal"
    ) {
      return trimmed;
    }
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
    return Number(trimmed);
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
  // PreApproved: espelha o default de ServerConfiguration.AppStorePolicy no backend.
  if (kind === "policy") return "1";
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
  return (
    metadataFields?.[fieldKey] ??
    metadataFields?.[toCanonicalConfigurationFieldName(fieldKey)]
  );
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

function toCanonicalConfigurationFieldName(value: string): string {
  if (!value) {
    return value;
  }

  if (
    value === "aiIntegrationSettingsJson" ||
    value === "AiIntegrationSettingsJson"
  ) {
    return "AIIntegrationSettingsJson";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}
