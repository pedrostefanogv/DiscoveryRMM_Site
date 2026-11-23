import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Icon, type MaterialSymbolName } from "./Icon";
import { MATERIAL_SYMBOL_PATHS } from "./materialSymbols";
import { CORE_SYMBOL_PATHS } from "./icons/core";
import { FILES_MEDIA_SYMBOL_PATHS } from "./icons/chunks/filesMedia";
import { AGENTS_HARDWARE_SYMBOL_PATHS } from "./icons/chunks/agentsHardware";
import { TICKETS_WORKFLOW_SYMBOL_PATHS } from "./icons/chunks/ticketsWorkflow";
import { ADMIN_ANALYTICS_SYMBOL_PATHS } from "./icons/chunks/adminAnalytics";
import {
  ICON_CHUNK_MAP,
  ensureMaterialSymbolLoaded,
  registerMaterialSymbols,
  resetIconRegistryToCore,
} from "./icons/registry";

function restoreAllChunks() {
  registerMaterialSymbols({
    ...FILES_MEDIA_SYMBOL_PATHS,
    ...AGENTS_HARDWARE_SYMBOL_PATHS,
    ...TICKETS_WORKFLOW_SYMBOL_PATHS,
    ...ADMIN_ANALYTICS_SYMBOL_PATHS,
  });
}

describe("Icon & split materialSymbols registry", () => {
  afterEach(() => {
    restoreAllChunks();
  });

  it("partitions all 198 glyphs across core and 4 lazy chunks with zero duplicates or gaps", () => {
    const groups = [
      Object.keys(CORE_SYMBOL_PATHS),
      Object.keys(FILES_MEDIA_SYMBOL_PATHS),
      Object.keys(AGENTS_HARDWARE_SYMBOL_PATHS),
      Object.keys(TICKETS_WORKFLOW_SYMBOL_PATHS),
      Object.keys(ADMIN_ANALYTICS_SYMBOL_PATHS),
    ];

    const seen = new Set<string>();
    for (const keys of groups) {
      for (const key of keys) {
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }

    const allLegacyKeys = Object.keys(MATERIAL_SYMBOL_PATHS);
    expect(allLegacyKeys.length).toBe(198);
    expect(seen.size).toBe(allLegacyKeys.length);

    for (const key of allLegacyKeys) {
      expect(seen.has(key)).toBe(true);
    }

    const lazyKeys = Object.keys(ICON_CHUNK_MAP);
    expect(lazyKeys.length).toBe(198 - Object.keys(CORE_SYMBOL_PATHS).length);
  });

  it("renders core icons synchronously even when registry only holds core", () => {
    resetIconRegistryToCore();

    const { container } = render(<Icon name="dashboard" size={20} />);
    const svg = container.querySelector("svg");
    const paths = container.querySelectorAll("svg path");

    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("width")).toBe("20");
    expect(svg?.getAttribute("height")).toBe("20");
    expect(paths.length).toBe(CORE_SYMBOL_PATHS.dashboard.length);
    expect(paths[0]?.getAttribute("d")).toBe(CORE_SYMBOL_PATHS.dashboard[0]);
  });

  it("renders dimension-preserving svg placeholder for lazy icon and populates path after chunk loads", async () => {
    resetIconRegistryToCore();

    const { container } = render(<Icon name="account_tree" size={18} />);
    const initialSvg = container.querySelector("svg");
    expect(initialSvg).not.toBeNull();
    expect(initialSvg?.getAttribute("width")).toBe("18");
    expect(initialSvg?.getAttribute("height")).toBe("18");
    expect(container.querySelectorAll("svg path").length).toBe(0);

    await waitFor(() => {
      const loadedPaths = container.querySelectorAll("svg path");
      expect(loadedPaths.length).toBe(
        TICKETS_WORKFLOW_SYMBOL_PATHS.account_tree.length,
      );
      expect(loadedPaths[0]?.getAttribute("d")).toBe(
        TICKETS_WORKFLOW_SYMBOL_PATHS.account_tree[0],
      );
    });
  });

  it("dedupes concurrent chunk loading for symbols in the same lazy chunk", async () => {
    resetIconRegistryToCore();
    const p1 = ensureMaterialSymbolLoaded("dns");
    const p2 = ensureMaterialSymbolLoaded("storage");
    expect(p1).toBe(p2);
    await p1;
  });

  it("returns null and warns in DEV for unknown glyph names", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { container } = render(
      <Icon name={"nonexistent_glyph_xyz" as MaterialSymbolName} />,
    );

    expect(container.firstChild).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
