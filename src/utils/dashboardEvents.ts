import type { AgentHeartbeat } from "@/api";

export const CANONICAL_DASHBOARD_EVENT_TYPES = [
  "AgentHeartbeat",
  "AgentStatusChanged",
  "CommandCompleted",
  "AgentHardwareReported",
  "AgentConnected",
  "AgentDisconnected",
] as const;

export type CanonicalDashboardEventType =
  (typeof CANONICAL_DASHBOARD_EVENT_TYPES)[number];

export type DashboardEventSource = "signalr" | "nats";

type AgentRealtimeStatus = "Online" | "Offline";

const CANONICAL_EVENT_TYPE_SET = new Set<string>(
  CANONICAL_DASHBOARD_EVENT_TYPES,
);

const ISO_UTC_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$/;

const HEARTBEAT_ALIAS_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ["id", "agentId"],
  ["agentID", "agentId"],
  ["timestamp", "timestampUtc"],
  ["timeStamp", "timestampUtc"],
  ["cpu", "cpuPercent"],
  ["memory", "memoryPercent"],
  ["disk", "diskPercent"],
  ["hostName", "hostname"],
  ["machineName", "hostname"],
  ["version", "agentVersion"],
  ["agent_version", "agentVersion"],
  ["memoryTotal", "memoryTotalGb"],
  ["memoryUsed", "memoryUsedGb"],
  ["diskTotal", "diskTotalGb"],
  ["diskUsed", "diskUsedGb"],
  ["p2pPeersCount", "p2pPeers"],
  ["uptime", "uptimeSeconds"],
  ["processes", "processCount"],
  ["lastIpAddress", "ipAddress"],
  ["ip", "ipAddress"],
];

interface RecordValue {
  [key: string]: unknown;
}

export interface NormalizedDashboardEvent {
  eventType: CanonicalDashboardEventType;
  data: Record<string, unknown> | null;
  timestampUtc: string;
  clientId?: string;
  siteId?: string;
}

export interface AgentStatusChangedData {
  agentId: string;
  status: AgentRealtimeStatus;
}

export interface CommandCompletedData {
  commandId: string;
  exitCode: number;
  output?: string;
  errorMessage?: string;
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null;
}

function formatReceived(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return String(value);
}

export function warnContractViolation(
  field: string,
  expected: string,
  received: unknown,
  source: DashboardEventSource,
  details?: Record<string, unknown>,
): void {
  const message = `[CONTRACT_VIOLATION] component=Dashboard field=${field} expected='${expected}' received='${formatReceived(
    received,
  )}' source=${source}`;

  if (details && Object.keys(details).length > 0) {
    console.warn(message, details);
    return;
  }

  console.warn(message);
}

function readRequiredString(
  data: RecordValue,
  key: string,
  source: DashboardEventSource,
  field: string,
): string | null {
  const value = data[key];
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  warnContractViolation(field, "non-empty string", value, source);
  return null;
}

function readOptionalString(
  data: RecordValue,
  key: string,
  source: DashboardEventSource,
  field: string,
): string | undefined | null {
  const value = data[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" && value.trim().length > 0) return value;

  warnContractViolation(field, "string", value, source);
  return null;
}

function readOptionalNumber(
  data: RecordValue,
  key: string,
  source: DashboardEventSource,
  field: string,
): number | undefined | null {
  const value = data[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;

  warnContractViolation(field, "number", value, source);
  return null;
}

function isIsoUtc(value: string): boolean {
  if (!ISO_UTC_REGEX.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

function readOptionalIsoTimestamp(
  data: RecordValue,
  key: string,
  source: DashboardEventSource,
  field: string,
): string | undefined | null {
  const value = readOptionalString(data, key, source, field);
  if (value === undefined || value === null) return value;
  if (isIsoUtc(value)) return value;

  warnContractViolation(field, "ISO-8601 UTC", value, source);
  return null;
}

function parseEventType(
  rawEventType: unknown,
  source: DashboardEventSource,
): CanonicalDashboardEventType | null {
  if (typeof rawEventType !== "string" || rawEventType.trim().length === 0) {
    warnContractViolation("eventType", "string", rawEventType, source);
    return null;
  }

  const eventType = rawEventType.trim();
  if (!CANONICAL_EVENT_TYPE_SET.has(eventType)) {
    warnContractViolation(
      "eventType",
      `enum(${CANONICAL_DASHBOARD_EVENT_TYPES.join(",")})`,
      rawEventType,
      source,
    );
    return null;
  }

  return eventType as CanonicalDashboardEventType;
}

function parseEnvelopeTimestamp(
  rawTimestamp: unknown,
  source: DashboardEventSource,
): string | null {
  if (typeof rawTimestamp !== "string") {
    warnContractViolation("timestampUtc", "ISO-8601 UTC", rawTimestamp, source);
    return null;
  }

  if (!isIsoUtc(rawTimestamp)) {
    warnContractViolation("timestampUtc", "ISO-8601 UTC", rawTimestamp, source);
    return null;
  }

  return rawTimestamp;
}

function parseOptionalTenantField(
  envelope: RecordValue,
  key: "clientId" | "siteId",
  source: DashboardEventSource,
): string | undefined | null {
  const value = envelope[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" && value.trim().length > 0) return value;

  warnContractViolation(`envelope.${key}`, "string", value, source);
  return null;
}

function parseEnvelopeObject(
  envelope: RecordValue,
  source: DashboardEventSource,
): NormalizedDashboardEvent | null {
  if ("timestamp" in envelope && !("timestampUtc" in envelope)) {
    warnContractViolation("timestampUtc", "timestampUtc", "timestamp", source);
    return null;
  }

  if ("type" in envelope && !("eventType" in envelope)) {
    warnContractViolation("eventType", "eventType", "type", source);
    return null;
  }

  const eventType = parseEventType(envelope.eventType, source);
  if (!eventType) return null;

  const timestampUtc = parseEnvelopeTimestamp(envelope.timestampUtc, source);
  if (!timestampUtc) return null;

  const dataValue = "data" in envelope ? envelope.data : null;
  if (dataValue !== null && dataValue !== undefined && !isRecord(dataValue)) {
    warnContractViolation("data", "object|null", dataValue, source);
    return null;
  }

  const clientId = parseOptionalTenantField(envelope, "clientId", source);
  if (clientId === null) return null;

  const siteId = parseOptionalTenantField(envelope, "siteId", source);
  if (siteId === null) return null;

  return {
    eventType,
    data: (dataValue as Record<string, unknown> | null | undefined) ?? null,
    timestampUtc,
    clientId: clientId ?? undefined,
    siteId: siteId ?? undefined,
  };
}

function parseEnvelopeArray(
  args: unknown[],
  source: DashboardEventSource,
): NormalizedDashboardEvent | null {
  if (args.length === 1 && isRecord(args[0])) {
    return parseEnvelopeObject(args[0], source);
  }

  if (args.length < 3) {
    warnContractViolation(
      "envelope",
      "SignalR arguments[eventType,data,timestampUtc]",
      args,
      source,
    );
    return null;
  }

  const eventType = parseEventType(args[0], source);
  if (!eventType) return null;

  const timestampUtc = parseEnvelopeTimestamp(args[2], source);
  if (!timestampUtc) return null;

  const dataValue = args[1];
  if (dataValue !== null && dataValue !== undefined && !isRecord(dataValue)) {
    warnContractViolation("data", "object|null", dataValue, source);
    return null;
  }

  return {
    eventType,
    data: (dataValue as Record<string, unknown> | null | undefined) ?? null,
    timestampUtc,
  };
}

export function normalizeDashboardEvent(
  rawEvent: unknown,
  source: DashboardEventSource = "signalr",
): NormalizedDashboardEvent | null {
  if (Array.isArray(rawEvent)) {
    return parseEnvelopeArray(rawEvent, source);
  }

  if (isRecord(rawEvent)) {
    return parseEnvelopeObject(rawEvent, source);
  }

  warnContractViolation("envelope", "object|array", rawEvent, source);
  return null;
}

function rejectIfAliasPresent(
  data: RecordValue,
  aliasFields: ReadonlyArray<readonly [string, string]>,
  source: DashboardEventSource,
): boolean {
  for (const [alias, canonical] of aliasFields) {
    if (alias in data) {
      warnContractViolation(`data.${canonical}`, canonical, alias, source);
      return true;
    }
  }

  return false;
}

export function parseAgentHeartbeatData(
  rawData: unknown,
  envelopeTimestampUtc: string,
  source: DashboardEventSource = "signalr",
): AgentHeartbeat | null {
  if (!isRecord(rawData)) {
    warnContractViolation("data", "object", rawData, source, {
      eventType: "AgentHeartbeat",
    });
    return null;
  }

  if (rejectIfAliasPresent(rawData, HEARTBEAT_ALIAS_FIELDS, source)) {
    return null;
  }

  const agentId = readRequiredString(rawData, "agentId", source, "data.agentId");
  if (!agentId) return null;

  const status = rawData.status;
  if (status !== "Online") {
    warnContractViolation("data.status", "Online", status, source);
    return null;
  }

  const ipAddress = readOptionalString(rawData, "ipAddress", source, "data.ipAddress");
  if (ipAddress === null) return null;

  const hostname = readOptionalString(rawData, "hostname", source, "data.hostname");
  if (hostname === null) return null;

  const agentVersion = readOptionalString(
    rawData,
    "agentVersion",
    source,
    "data.agentVersion",
  );
  if (agentVersion === null) return null;

  const clientId = readOptionalString(rawData, "clientId", source, "data.clientId");
  if (clientId === null) return null;

  const siteId = readOptionalString(rawData, "siteId", source, "data.siteId");
  if (siteId === null) return null;

  const dataTimestamp = readOptionalIsoTimestamp(
    rawData,
    "timestampUtc",
    source,
    "data.timestampUtc",
  );
  if (dataTimestamp === null) return null;

  const cpuPercent = readOptionalNumber(rawData, "cpuPercent", source, "data.cpuPercent");
  if (cpuPercent === null) return null;

  const memoryPercent = readOptionalNumber(
    rawData,
    "memoryPercent",
    source,
    "data.memoryPercent",
  );
  if (memoryPercent === null) return null;

  const memoryTotalGb = readOptionalNumber(
    rawData,
    "memoryTotalGb",
    source,
    "data.memoryTotalGb",
  );
  if (memoryTotalGb === null) return null;

  const memoryUsedGb = readOptionalNumber(
    rawData,
    "memoryUsedGb",
    source,
    "data.memoryUsedGb",
  );
  if (memoryUsedGb === null) return null;

  const diskPercent = readOptionalNumber(rawData, "diskPercent", source, "data.diskPercent");
  if (diskPercent === null) return null;

  const diskTotalGb = readOptionalNumber(rawData, "diskTotalGb", source, "data.diskTotalGb");
  if (diskTotalGb === null) return null;

  const diskUsedGb = readOptionalNumber(rawData, "diskUsedGb", source, "data.diskUsedGb");
  if (diskUsedGb === null) return null;

  const p2pPeers = readOptionalNumber(rawData, "p2pPeers", source, "data.p2pPeers");
  if (p2pPeers === null) return null;

  const uptimeSeconds = readOptionalNumber(
    rawData,
    "uptimeSeconds",
    source,
    "data.uptimeSeconds",
  );
  if (uptimeSeconds === null) return null;

  const processCount = readOptionalNumber(
    rawData,
    "processCount",
    source,
    "data.processCount",
  );
  if (processCount === null) return null;

  return {
    agentId,
    status: "Online",
    clientId: clientId ?? undefined,
    siteId: siteId ?? undefined,
    ipAddress: ipAddress ?? undefined,
    hostname: hostname ?? undefined,
    agentVersion: agentVersion ?? undefined,
    timestampUtc: dataTimestamp ?? envelopeTimestampUtc,
    cpuPercent: cpuPercent ?? undefined,
    memoryPercent: memoryPercent ?? undefined,
    memoryTotalGb: memoryTotalGb ?? undefined,
    memoryUsedGb: memoryUsedGb ?? undefined,
    diskPercent: diskPercent ?? undefined,
    diskTotalGb: diskTotalGb ?? undefined,
    diskUsedGb: diskUsedGb ?? undefined,
    p2pPeers: p2pPeers ?? undefined,
    uptimeSeconds: uptimeSeconds ?? undefined,
    processCount: processCount ?? undefined,
  };
}

export function parseAgentStatusChangedData(
  rawData: unknown,
  source: DashboardEventSource = "signalr",
): AgentStatusChangedData | null {
  if (!isRecord(rawData)) {
    warnContractViolation("data", "object", rawData, source, {
      eventType: "AgentStatusChanged",
    });
    return null;
  }

  if ("id" in rawData || "agentID" in rawData) {
    warnContractViolation("data.agentId", "agentId", "id|agentID", source);
    return null;
  }

  const agentId = readRequiredString(rawData, "agentId", source, "data.agentId");
  if (!agentId) return null;

  const status = rawData.status;
  if (status !== "Online" && status !== "Offline") {
    warnContractViolation("data.status", "Online|Offline", status, source);
    return null;
  }

  return { agentId, status };
}

export function parseCommandCompletedData(
  rawData: unknown,
  source: DashboardEventSource = "signalr",
): CommandCompletedData | null {
  if (!isRecord(rawData)) {
    warnContractViolation("data", "object", rawData, source, {
      eventType: "CommandCompleted",
    });
    return null;
  }

  if ("cmdId" in rawData) {
    warnContractViolation("data.commandId", "commandId", "cmdId", source);
    return null;
  }

  if ("errText" in rawData) {
    warnContractViolation("data.errorMessage", "errorMessage", "errText", source);
    return null;
  }

  const commandId = readRequiredString(
    rawData,
    "commandId",
    source,
    "data.commandId",
  );
  if (!commandId) return null;

  const exitCodeValue = rawData.exitCode;
  if (typeof exitCodeValue !== "number" || !Number.isFinite(exitCodeValue)) {
    warnContractViolation("data.exitCode", "number", exitCodeValue, source);
    return null;
  }

  const output = readOptionalString(rawData, "output", source, "data.output");
  if (output === null) return null;

  const errorMessage = readOptionalString(
    rawData,
    "errorMessage",
    source,
    "data.errorMessage",
  );
  if (errorMessage === null) return null;

  return {
    commandId,
    exitCode: exitCodeValue,
    output: output ?? undefined,
    errorMessage: errorMessage ?? undefined,
  };
}
