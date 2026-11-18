import { describe, expect, it } from "vitest";
import DOMPurify from "dompurify";
import { createMemoryRouter } from "react-router-dom";
import { z } from "zod";
import { readSiteText } from "./helpers/moduleProbe";

describe("Tier 2 — F23: Boundary & Corner Cases (Upgraded Dependencies & Configs)", () => {
  it("F23-T2-01: jsdom runtime >= 30.0.0 and IS_REACT_ACT_ENVIRONMENT is enabled", () => {
    const jsdomPkg = JSON.parse(readSiteText("node_modules/jsdom/package.json")) as {
      version: string;
    };
    const major = Number.parseInt(jsdomPkg.version.split(".")[0] ?? "0", 10);
    expect(major).toBeGreaterThanOrEqual(30);
    expect((globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT).toBe(true);
  });

  it("F23-T2-02: tsconfig.json enforces strict TypeScript flags and isolates tests/e2e from production typecheck", () => {
    // Strip single-line JSONC comments in tsconfig.json before parsing
    const raw = readSiteText("tsconfig.json").replace(/^\s*\/\/.*$/gm, "");
    const tsconfig = JSON.parse(raw) as {
      compilerOptions: Record<string, unknown>;
      include: string[];
    };

    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.noUnusedLocals).toBe(true);
    expect(tsconfig.compilerOptions.noUnusedParameters).toBe(true);
    expect(tsconfig.compilerOptions.paths).toEqual({ "@/*": ["./src/*"] });
    expect(tsconfig.include).toEqual(["src"]);
  });

  it("F23-T2-03: vite.config.ts and vitest.min.config.mts maintain consistent @ alias and PWA SW invariants", () => {
    const viteCfg = readSiteText("vite.config.ts");
    const minCfg = readSiteText("vitest.min.config.mts");

    expect(viteCfg).toContain('"@": resolve(import.meta.dirname, "src")');
    expect(viteCfg).toContain("injectManifest");
    expect(viteCfg).toContain("sw.ts");
    expect(minCfg).toContain('"@": resolve("src")');
    expect(minCfg).toContain('environment: "jsdom"');
  });

  it("F23-T2-04: DOMPurify neutralizes nested script tags, mXSS math/mtext, and data:text/html URIs", () => {
    const nested = "<scr<script>ipt>alert(1)</script>";
    const mxss = '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=1 onerror=alert(1)>">';
    const dataUri = '<a href="data:text/html,<script>alert(1)</script>">open</a>';

    for (const payload of [nested, mxss, dataUri]) {
      const cleaned = DOMPurify.sanitize(payload);
      expect(cleaned.toLowerCase()).not.toContain("<script");
      expect(cleaned.toLowerCase()).not.toContain("onerror=");
      expect(cleaned.toLowerCase()).not.toContain("data:text/html");
    }
  });

  it("F23-T2-05: zod v4 schema validation and react-router-dom v7 memory router work under jsdom >= 30", () => {
    const PolicySchema = z.object({
      maxResponseBytes: z.number().int().positive(),
      allowLoopback: z.boolean(),
    });

    expect(PolicySchema.safeParse({ maxResponseBytes: 1024, allowLoopback: false }).success).toBe(true);
    expect(PolicySchema.safeParse({ maxResponseBytes: -1, allowLoopback: "nope" }).success).toBe(false);

    const router = createMemoryRouter(
      [
        { path: "/", element: null },
        { path: "/agents/:id", element: null },
      ],
      { initialEntries: ["/agents/agent-42"] },
    );
    expect(router.state.location.pathname).toBe("/agents/agent-42");
    expect(router.state.matches[0]?.params.id).toBe("agent-42");
  });
});
