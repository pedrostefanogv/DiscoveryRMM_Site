// Compatibilidade legada: os paths agora vivem divididos em `./icons/core` e
// `./icons/chunks/*` para code-splitting no bundle inicial (`ui-*.js`).
import { CORE_SYMBOL_PATHS } from "./icons/core";
import { FILES_MEDIA_SYMBOL_PATHS } from "./icons/chunks/filesMedia";
import { AGENTS_HARDWARE_SYMBOL_PATHS } from "./icons/chunks/agentsHardware";
import { TICKETS_WORKFLOW_SYMBOL_PATHS } from "./icons/chunks/ticketsWorkflow";
import { ADMIN_ANALYTICS_SYMBOL_PATHS } from "./icons/chunks/adminAnalytics";
import {
  MATERIAL_SYMBOL_VIEWBOX,
  type MaterialSymbolName,
} from "./icons/types";

export { MATERIAL_SYMBOL_VIEWBOX };
export type { MaterialSymbolName };

export const MATERIAL_SYMBOL_PATHS = {
  ...CORE_SYMBOL_PATHS,
  ...FILES_MEDIA_SYMBOL_PATHS,
  ...AGENTS_HARDWARE_SYMBOL_PATHS,
  ...TICKETS_WORKFLOW_SYMBOL_PATHS,
  ...ADMIN_ANALYTICS_SYMBOL_PATHS,
} as const;
