export interface InventoryPrinter {
  name: string;
  driverName: string | null;
  portName: string | null;
  printerStatus: string | null;
  isDefault: boolean;
  isNetworkPrinter: boolean;
  shared: boolean;
  shareName: string | null;
  location: string | null;
}

export function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${mb.toFixed(0)} MB`;
}

export function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("pt-BR");
}

export function formatSocketFamily(family: string | null): string {
  if (!family) return "—";
  if (family === "2") return "IPv4";
  if (family === "23") return "IPv6";
  return family;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function asBoolean(value: unknown): boolean {
  return value === true;
}

export function normalizePrinterEntries(value: unknown): InventoryPrinter[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).map((printer) => ({
    name: asNullableString(printer.name) ?? "Impressora sem nome",
    driverName: asNullableString(printer.driverName),
    portName: asNullableString(printer.portName),
    printerStatus: asNullableString(printer.printerStatus),
    isDefault: asBoolean(printer.isDefault),
    isNetworkPrinter: asBoolean(printer.isNetworkPrinter),
    shared: asBoolean(printer.shared),
    shareName: asNullableString(printer.shareName),
    location: asNullableString(printer.location),
  }));
}

export function parseInventoryPrinters(
  inventoryRaw: string | null,
  topLevelPrinters?: unknown,
  topLevelInventoryRaw?: unknown,
): InventoryPrinter[] {
  const fromTopLevel = normalizePrinterEntries(topLevelPrinters);
  if (fromTopLevel.length > 0) return fromTopLevel;

  const rawCandidate = topLevelInventoryRaw ?? inventoryRaw;
  if (!rawCandidate) return [];

  let parsed: unknown = rawCandidate;
  if (typeof rawCandidate === "string") {
    try {
      parsed = JSON.parse(rawCandidate);
    } catch {
      return [];
    }
  }

  if (!isRecord(parsed)) return [];
  const components = parsed.components;
  if (!isRecord(components)) return [];

  return normalizePrinterEntries(components.printers);
}

export function printerStatusColor(
  status: string | null,
): "success" | "warning" | "danger" | "slate" {
  if (!status) return "slate";
  const normalized = status.toLowerCase();
  if (normalized.includes("ready") || normalized.includes("pronta"))
    return "success";
  if (
    normalized.includes("error") ||
    normalized.includes("erro") ||
    normalized.includes("offline")
  )
    return "danger";
  if (
    normalized.includes("warn") ||
    normalized.includes("warning") ||
    normalized.includes("paus")
  )
    return "warning";
  return "slate";
}

export function nodeLinkStatusColor(
  status: string,
): "success" | "warning" | "danger" | "accent" | "slate" {
  const normalized = status.toLowerCase();
  if (normalized === "verified") return "success";
  if (normalized === "linked") return "accent";
  if (normalized === "suggested") return "warning";
  if (normalized === "ambiguous" || normalized === "error") return "danger";
  return "slate";
}
