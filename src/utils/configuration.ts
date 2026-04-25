import type {
  ClientConfiguration,
  ConfigurationMap,
  ConfigurationOrigin,
  ConfigurationValue,
  EffectiveConfiguration,
  SiteConfiguration,
} from "@/api";

export function getConfigKeys(
  localConfig: Record<string, ConfigurationValue | null> | null | undefined,
  effectiveConfig: EffectiveConfiguration | null | undefined,
): string[] {
  const localKeys = Object.keys(localConfig ?? {});
  const effectiveKeys = Object.keys(effectiveConfig?.values ?? {});
  return Array.from(new Set([...localKeys, ...effectiveKeys])).sort((a, b) =>
    a.localeCompare(b),
  );
}

export function formatConfigValue(
  value: ConfigurationValue | undefined,
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

export function parseConfigValue(
  raw: string,
  reference: ConfigurationValue | undefined,
): ConfigurationValue {
  const trimmed = raw.trim();

  if (reference === null || reference === undefined) {
    return parseSmartValue(trimmed);
  }

  if (typeof reference === "boolean") {
    if (trimmed !== "true" && trimmed !== "false") {
      throw new Error("Valor booleano deve ser true ou false");
    }
    return trimmed === "true";
  }

  if (typeof reference === "number") {
    if (trimmed.length === 0 || Number.isNaN(Number(trimmed))) {
      throw new Error("Valor numérico inválido");
    }
    return Number(trimmed);
  }

  if (typeof reference === "string") {
    return raw;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error("JSON inválido para o tipo esperado");
  }
}

function parseSmartValue(trimmed: string): ConfigurationValue {
  if (trimmed.length === 0) {
    return "";
  }

  if (trimmed === "true") {
    return true;
  }

  if (trimmed === "false") {
    return false;
  }

  if (!Number.isNaN(Number(trimmed)) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    return JSON.parse(trimmed) as ConfigurationValue;
  }

  return trimmed;
}

export function resolveClientOrigin(
  key: string,
  local: ClientConfiguration | null | undefined,
  effective: EffectiveConfiguration | null | undefined,
): ConfigurationOrigin {
  const fromApi = effective?.origins?.[key];
  if (fromApi) {
    return fromApi;
  }

  const localValue = local?.[key];
  return localValue !== null && localValue !== undefined ? "Client" : "Server";
}

export function resolveSiteOrigin(
  key: string,
  siteLocal: SiteConfiguration | null | undefined,
  clientLocal: ClientConfiguration | null | undefined,
  effective: EffectiveConfiguration | null | undefined,
): ConfigurationOrigin {
  const fromApi = effective?.origins?.[key];
  if (fromApi) {
    return fromApi;
  }

  const siteValue = siteLocal?.[key];
  if (siteValue !== null && siteValue !== undefined) {
    return "Site";
  }

  const clientValue = clientLocal?.[key];
  if (clientValue !== null && clientValue !== undefined) {
    return "Client";
  }

  return "Server";
}

export function toPatchBody(
  key: string,
  value: ConfigurationValue | null,
): Record<string, ConfigurationValue | null> {
  return { [key]: value };
}

export function asConfigMap(
  value: Record<string, unknown> | null | undefined,
): ConfigurationMap {
  return (value ?? {}) as ConfigurationMap;
}
