// Tipos + parsers das configurações de janela de manutenção e política de
// tools MCP do agent (M243). Os campos chegam como JSON strings
// (maintenance_window_json / mcp_tool_policy_json) nas configurações
// servidor/cliente/site; null/vazio = herda.
//
// Janela de manutenção — contrato com a API e o agent:
//   startTime  "HH:mm"  início em hora LOCAL na timeZone (campo novo)
//   timeZone   IANA     fuso da janela; "" / "UTC" = UTC (legado)
//   startUtc   "HH:mm"  espelho em UTC, gravado para agentes antigos que só
//                       conhecem startUtc; o agent novo prioriza startTime+timeZone
// Quando timeZone/startTime estão ausentes (dados legados), a janela é lida como
// UTC a partir de startUtc — nada muda para quem já estava configurado.
//
// Os dias da semana e o horário são wall-clock no fuso escolhido: em fusos com
// horário de verão a janela acompanha a mudança de offset.

export interface MaintenanceWindowConfig {
  enabled: boolean;
  daysOfWeek: number[]; // 1=dom .. 7=sáb; vazio = todos os dias
  /** Início em hora local na `timeZone` ("HH:mm"). */
  startTime: string;
  /** Fuso IANA (ex.: "America/Sao_Paulo"); "" = UTC. */
  timeZone: string;
  /** Equivalente UTC do início ("HH:mm"), espelho para agents legados. */
  startUtc: string;
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

/** Fuso padrão quando a config não informa nenhum (comportamento legado). */
export const DEFAULT_TIME_ZONE = "UTC";

/** Fallback quando o navegador não expõe Intl.supportedValuesOf("timeZone"). */
const FALLBACK_TIME_ZONES = [
  "America/Sao_Paulo",
  "America/Bahia",
  "America/Belem",
  "America/Cuiaba",
  "America/Manaus",
  "America/Campo_Grande",
  "America/Recife",
  "America/Rio_Branco",
  "America/Fortaleza",
  "America/Argentina/Buenos_Aires",
  "America/Santiago",
  "America/Montevideo",
  "America/Bogota",
  "America/Lima",
  "America/Mexico_City",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Berlin",
  "Africa/Luanda",
  "Asia/Tokyo",
  "Australia/Sydney",
];

/** "HH:mm" válido (00:00–23:59). */
export function isClockTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return false;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

/** ID IANA aceito pelo runtime (Intl). "" é aceito como UTC. */
export function isValidTimeZone(timeZone: string | null | undefined): boolean {
  const tz = (timeZone ?? "").trim();
  if (timeZone === undefined || timeZone === null) return false;
  if (tz === "" || tz.toUpperCase() === "UTC") return true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset do fuso em minutos a leste de UTC no instante informado (com DST). */
export function timeZoneOffsetMinutes(timeZone: string, at: Date = new Date()): number {
  const tz = timeZone.trim() === "" ? DEFAULT_TIME_ZONE : timeZone.trim();
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(at);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    pick("year"),
    pick("month") - 1,
    pick("day"),
    pick("hour"),
    pick("minute"),
    pick("second"),
  );
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** "UTC-03:00" / "UTC+05:30" para rótulos. */
export function formatUtcOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${hh}:${mm}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Converte um horário local ("HH:mm") do fuso informado no equivalente UTC
 * ("HH:mm"), usando a data de referência (dia corrente) para resolver o offset
 * — inclusive em fusos com horário de verão.
 */
export function localTimeToUtc(
  startTime: string,
  timeZone: string,
  reference: Date = new Date(),
): string {
  if (!isClockTime(startTime)) return "02:00";
  const tz = isValidTimeZone(timeZone) ? timeZone.trim() || DEFAULT_TIME_ZONE : DEFAULT_TIME_ZONE;
  const [hh, mm] = startTime.split(":").map(Number);

  // Data de referência no fuso escolhido (para pegar o offset do dia certo).
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(reference);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const wallAsUtc = Date.UTC(pick("year"), pick("month") - 1, pick("day"), hh, mm, 0);

  // Duas iterações bastam para estabilizar o offset na virada de DST.
  let guess = wallAsUtc;
  for (let i = 0; i < 2; i += 1) {
    guess = wallAsUtc - timeZoneOffsetMinutes(tz, new Date(guess)) * 60000;
  }
  if (Number.isNaN(guess)) return "02:00";
  const utc = new Date(guess);
  return `${pad2(utc.getUTCHours())}:${pad2(utc.getUTCMinutes())}`;
}

/**
 * Opções de fuso para os selects: "UTC" primeiro, o fuso do navegador em
 * seguida, depois a lista do runtime (ou o fallback curado), sempre com o
 * offset atual no rótulo.
 */
export function listTimeZoneOptions(reference: Date = new Date()): { value: string; label: string }[] {
  const browserTimeZone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    } catch {
      return "";
    }
  })();

  let zones: string[] = [];
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf?.("timeZone");
    if (Array.isArray(supported) && supported.length > 0) zones = supported;
  } catch {
    zones = [];
  }
  if (zones.length === 0) zones = FALLBACK_TIME_ZONES;

  const seen = new Set<string>();
  const ordered: string[] = [];
  const push = (zone: string) => {
    if (!zone || seen.has(zone)) return;
    seen.add(zone);
    ordered.push(zone);
  };
  push(DEFAULT_TIME_ZONE);
  push(browserTimeZone);
  [...zones].sort((a, b) => a.localeCompare(b)).forEach(push);

  return ordered.map((zone) => {
    const offset = timeZoneOffsetMinutes(zone, reference);
    const label = zone === DEFAULT_TIME_ZONE ? `UTC (${formatUtcOffset(0)})` : `${zone.replace(/_/g, " ")} (${formatUtcOffset(offset)})`;
    return { value: zone, label };
  });
}


/**
 * Garante que o fuso salvo apareça no select. Um valor fora da lista do runtime
 * (ex.: fuso removido da base IANA do navegador, config antiga ou lista de
 * fallback) ficaria sem opção correspondente e o select exibiria outro valor.
 */
export function withCurrentTimeZoneOption(
  options: { value: string; label: string }[],
  current: string | null | undefined,
): { value: string; label: string }[] {
  const zone = (current ?? "").trim();
  if (!zone || options.some((option) => option.value === zone)) return options;
  return [...options, { value: zone, label: `${zone.replace(/_/g, " ")} (fuso salvo)` }];
}

export function parseMaintenanceWindow(
  json: string | null | undefined,
  reference: Date = new Date(),
): MaintenanceWindowConfig {
  const fallback: MaintenanceWindowConfig = {
    enabled: false,
    daysOfWeek: [],
    startTime: "02:00",
    timeZone: DEFAULT_TIME_ZONE,
    startUtc: "02:00",
    durationMinutes: 60,
    rebootGraceSeconds: 60,
  };
  if (!json || json === "{}") return fallback;
  try {
    const raw = JSON.parse(json) as Partial<MaintenanceWindowConfig>;
    const timeZone = isValidTimeZone(raw.timeZone) ? (raw.timeZone ?? "").trim() || DEFAULT_TIME_ZONE : DEFAULT_TIME_ZONE;
    // startTime (novo) tem precedência; dados legados trazem só startUtc, que
    // passa a valer como hora local em UTC (mesmo instante de antes).
    const startTime = isClockTime(raw.startTime)
      ? raw.startTime.trim()
      : isClockTime(raw.startUtc)
        ? raw.startUtc.trim()
        : fallback.startTime;
    return {
      enabled: raw.enabled === true,
      daysOfWeek: Array.isArray(raw.daysOfWeek)
        ? raw.daysOfWeek.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
        : [],
      startTime,
      timeZone,
      // Derivado: mantém o espelho UTC coerente com startTime+timeZone.
      startUtc: localTimeToUtc(startTime, timeZone, reference),
      durationMinutes:
        typeof raw.durationMinutes === "number" && raw.durationMinutes > 0 ? raw.durationMinutes : 60,
      rebootGraceSeconds:
        typeof raw.rebootGraceSeconds === "number" && raw.rebootGraceSeconds >= 0 ? raw.rebootGraceSeconds : 60,
    };
  } catch {
    return fallback;
  }
}

export function serializeMaintenanceWindow(
  cfg: MaintenanceWindowConfig,
  reference: Date = new Date(),
): string {
  const timeZone = isValidTimeZone(cfg.timeZone) ? cfg.timeZone.trim() || DEFAULT_TIME_ZONE : DEFAULT_TIME_ZONE;
  const startTime = isClockTime(cfg.startTime) ? cfg.startTime.trim() : "02:00";
  return JSON.stringify({
    enabled: cfg.enabled,
    daysOfWeek: cfg.daysOfWeek,
    startTime,
    timeZone,
    // Espelho UTC para agents antigos (que só entendem startUtc).
    startUtc: localTimeToUtc(startTime, timeZone, reference),
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

/** Resumo de uma linha da janela (usado por vigência herdada e por telas de leitura). */
export function describeMaintenanceWindow(
  cfg: MaintenanceWindowConfig,
  reference: Date = new Date(),
): string {
  if (!cfg.enabled) {
    return "Desligada — patches e reboots executam imediatamente";
  }
  const days =
    cfg.daysOfWeek.length > 0
      ? [...cfg.daysOfWeek].sort((a, b) => a - b).map((day) => DAY_LABELS[day]).join(", ")
      : "todos os dias";
  const timeZone = isValidTimeZone(cfg.timeZone) ? cfg.timeZone.trim() || DEFAULT_TIME_ZONE : DEFAULT_TIME_ZONE;
  const startTime = isClockTime(cfg.startTime) ? cfg.startTime.trim() : "02:00";
  const utcMirror = localTimeToUtc(startTime, timeZone, reference);
  const offset = formatUtcOffset(timeZoneOffsetMinutes(timeZone, reference));
  const zoneLabel = timeZone === DEFAULT_TIME_ZONE ? "UTC" : `${timeZone.replace(/_/g, " ")} (${offset})`;
  const timeText =
    timeZone === DEFAULT_TIME_ZONE ? `${startTime} UTC` : `${startTime} ${zoneLabel} = ${utcMirror} UTC`;
  return `Ativa — ${days}, ${timeText}, ${cfg.durationMinutes} min, aviso de reboot ${cfg.rebootGraceSeconds}s`;
}

/** Resumo de uma linha da política MCP (usado na vigência herdada). */
export function describeMcpToolPolicy(cfg: McpToolPolicyConfig): string {
  if (cfg.mode !== "allowlist") {
    return "Todas as tools (mode all)";
  }
  if (cfg.allow.length === 0) {
    return "Allowlist vazia — bloqueia todas as tools do chat";
  }
  return `Allowlist — ${cfg.allow.length} tool(s): ${cfg.allow.join(", ")}`;
}