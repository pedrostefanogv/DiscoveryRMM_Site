import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/react";

// Necessário para act() funcionar com React 19 + vitest
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
