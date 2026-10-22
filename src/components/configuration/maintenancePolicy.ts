// Tipos + parsers das configurações de janela de manutenção e política de
// tools MCP do agent (M243). Os campos chegam como JSON strings
// (maintenance_window_json / mcp_tool_policy_json) nas configurações
// servidor/cliente/site; null/vazio = herda.

export interface MaintenanceWindowConfig {
  enabled: boolean;
  daysOfWeek: number[]; // 1=dom .. 7=sáb; vazio = todos os dias
  startUtc: string; // "HH:mm"
  durationMinutes: number; // default 60
  rebootGraceSeconds: number; // default 60; 0 = reboot imediato (sem aviso)
}

export interface McpToolPolicyConfig {
  mode: "all" | "allowlist";
  allow: string[];
}

export const DAY_LABELS: Record<number, string> = {
  1: "Dom",
  2: "Seg",
  3: "Ter",
  4: "Qua",
  5: "Qui",
  6: "Sex",
  7: "Sáb",
};

export function parseMaintenanceWindow(json: string | null | undefined): MaintenanceWindowConfig {
  const fallback: MaintenanceWindowConfig = {
    enabled: false,
    daysOfWeek: [],
    startUtc: "02:00",
    durationMinutes: 60,
    rebootGraceSeconds: 60,
  };
  if (!json || json === "{}") return fallback;
  try {
    const raw = JSON.parse(json) as Partial<MaintenanceWindowConfig>;
    return {
      enabled: raw.enabled === true,
      daysOfWeek: Array.isArray(raw.daysOfWeek)
        ? raw.daysOfWeek.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
        : [],
      startUtc: typeof raw.startUtc === "string" && /^\d{2}:\d{2}$/.test(raw.startUtc) ? raw.startUtc : fallback.startUtc,
      durationMinutes:
        typeof raw.durationMinutes === "number" && raw.durationMinutes > 0 ? raw.durationMinutes : 60,
      rebootGraceSeconds:
        typeof raw.rebootGraceSeconds === "number" && raw.rebootGraceSeconds >= 0 ? raw.rebootGraceSeconds : 60,
    };
  } catch {
    return fallback;
  }
}

export function serializeMaintenanceWindow(cfg: MaintenanceWindowConfig): string {
  return JSON.stringify({
    enabled: cfg.enabled,
    daysOfWeek: cfg.daysOfWeek,
    startUtc: cfg.startUtc,
    durationMinutes: cfg.durationMinutes,
    rebootGraceSeconds: cfg.rebootGraceSeconds,
  });
}

export function parseMcpToolPolicy(json: string | null | undefined): McpToolPolicyConfig {
  const fallback: McpToolPolicyConfig = { mode: "all", allow: [] };
  if (!json || json === "{}") return fallback;
  try {
    const raw = JSON.parse(json) as Partial<McpToolPolicyConfig>;
    return {
      mode: raw.mode === "allowlist" ? "allowlist" : "all",
      allow: Array.isArray(raw.allow) ? raw.allow.filter((t) => typeof t === "string" && t.trim() !== "") : [],
    };
  } catch {
    return fallback;
  }
}

export function serializeMcpToolPolicy(cfg: McpToolPolicyConfig): string {
  return JSON.stringify({ mode: cfg.mode, allow: cfg.allow });
}
