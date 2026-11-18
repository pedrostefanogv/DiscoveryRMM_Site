import type { CORE_SYMBOL_PATHS } from "./core";
import type { FILES_MEDIA_SYMBOL_PATHS } from "./chunks/filesMedia";
import type { AGENTS_HARDWARE_SYMBOL_PATHS } from "./chunks/agentsHardware";
import type { TICKETS_WORKFLOW_SYMBOL_PATHS } from "./chunks/ticketsWorkflow";
import type { ADMIN_ANALYTICS_SYMBOL_PATHS } from "./chunks/adminAnalytics";

export const MATERIAL_SYMBOL_VIEWBOX = "0 -960 960 960";

export type IconPathMap = Readonly<Record<string, readonly string[]>>;

export type CoreMaterialSymbolName = keyof typeof CORE_SYMBOL_PATHS;

export type MaterialSymbolName =
  | keyof typeof CORE_SYMBOL_PATHS
  | keyof typeof FILES_MEDIA_SYMBOL_PATHS
  | keyof typeof AGENTS_HARDWARE_SYMBOL_PATHS
  | keyof typeof TICKETS_WORKFLOW_SYMBOL_PATHS
  | keyof typeof ADMIN_ANALYTICS_SYMBOL_PATHS;

export type IconChunkId =
  | "filesMedia"
  | "agentsHardware"
  | "ticketsWorkflow"
  | "adminAnalytics";
