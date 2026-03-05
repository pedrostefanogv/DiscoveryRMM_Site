import type {
  ClientConfiguration,
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

export interface EditableField {
  key: string;
  label: string;
  kind: EditableFieldKind;
}

export const serverEditableFields: EditableField[] = [
  { key: "recoveryEnabled", label: "Recovery Enabled", kind: "boolean" },
  { key: "discoveryEnabled", label: "Discovery Enabled", kind: "boolean" },
  { key: "p2pFilesEnabled", label: "P2P Files Enabled", kind: "boolean" },
  { key: "supportEnabled", label: "Support Enabled", kind: "boolean" },
  {
    key: "knowledgeBaseEnabled",
    label: "Knowledge Base Enabled",
    kind: "boolean",
  },
  { key: "appStorePolicy", label: "App Store Policy", kind: "policy" },
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
  {
    key: "brandingSettingsJson",
    label: "Branding Settings JSON",
    kind: "json",
  },
  {
    key: "aiIntegrationSettingsJson",
    label: "AI Integration Settings JSON",
    kind: "json",
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
    return trimmed.length > 0 && !Number.isNaN(Number(trimmed))
      ? true
      : "Informe um numero valido";
  }

  if (kind === "json") {
    try {
      JSON.parse(trimmed || "{}");
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
  siteLocal: SiteConfiguration | undefined,
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

export function buildServerDraft(
  source: ServerConfiguration | undefined,
  fields: EditableField[],
): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const field of fields) {
    draft[field.key] = formatFieldValue(
      source?.[field.key] as ConfigurationValue | undefined,
    );
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
