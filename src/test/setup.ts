import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/react";
import { registerMaterialSymbols } from "@/components/ui/icons/registry";
import { FILES_MEDIA_SYMBOL_PATHS } from "@/components/ui/icons/chunks/filesMedia";
import { AGENTS_HARDWARE_SYMBOL_PATHS } from "@/components/ui/icons/chunks/agentsHardware";
import { TICKETS_WORKFLOW_SYMBOL_PATHS } from "@/components/ui/icons/chunks/ticketsWorkflow";
import { ADMIN_ANALYTICS_SYMBOL_PATHS } from "@/components/ui/icons/chunks/adminAnalytics";

// Registra os chunks lazy de ícones de forma síncrona nos testes para que
// componentes com <Icon name="..." /> renderizem os <path> no primeiro tick.
registerMaterialSymbols({
  ...FILES_MEDIA_SYMBOL_PATHS,
  ...AGENTS_HARDWARE_SYMBOL_PATHS,
  ...TICKETS_WORKFLOW_SYMBOL_PATHS,
  ...ADMIN_ANALYTICS_SYMBOL_PATHS,
});

// Necessário para act() funcionar com React 19 + vitest
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom não implementa scrollIntoView; a navegação por âncoras (StatCards ->
// painel de abas) chama esse método ao selecionar uma seção.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
