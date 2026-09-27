import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/react";

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
