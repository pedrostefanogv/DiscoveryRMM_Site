import { afterEach, describe, expect, it } from "vitest";
import DOMPurify from "dompurify";
import { wsconnect, tokenAuthenticator } from "@nats-io/nats-core";
import { pathExistsInSite, readSiteText } from "./helpers/moduleProbe";
import { installNatsWsMock, type NatsWsMockController } from "./helpers/natsWsMock";

describe("Tier 1 — F23: npm Dependency Updates, Lockfile & Build Integrity", () => {
  let natsMock: NatsWsMockController | null = null;

  afterEach(() => {
    natsMock?.restore();
    natsMock = null;
  });

  it("F23-T1-01: package.json places @testing-library/dom in devDependencies and declares updated runtime/test versions", () => {
    const pkg = JSON.parse(readSiteText("package.json")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };

    expect(pkg.dependencies["@testing-library/dom"]).toBeUndefined();
    expect(pkg.devDependencies["@testing-library/dom"]).toBeDefined();
    expect(pkg.dependencies.dompurify).toBeDefined();

    const parseMajor = (spec: string) => {
      const m = spec.match(/(\d+)/);
      return m ? Number.parseInt(m[1], 10) : 0;
    };

    expect(parseMajor(pkg.devDependencies.jsdom)).toBeGreaterThanOrEqual(30);
    expect(parseMajor(pkg.devDependencies.vitest)).toBeGreaterThanOrEqual(5);
    expect(parseMajor(pkg.devDependencies.vite)).toBeGreaterThanOrEqual(8);
    expect(parseMajor(pkg.devDependencies.typescript)).toBeGreaterThanOrEqual(7);
    expect(pkg.scripts.typecheck).toContain("tsc");
    expect(pkg.scripts.test).toContain("vitest");
    expect(pkg.scripts.build).toBeDefined();
  });

  it("F23-T1-02: Single lockfile hygiene (package-lock.json present, pnpm-workspace.yaml & pnpm-lock.yaml absent)", () => {
    expect(pathExistsInSite("package-lock.json")).toBe(true);
    expect(pathExistsInSite("pnpm-workspace.yaml")).toBe(false);
    expect(pathExistsInSite("pnpm-lock.yaml")).toBe(false);

    const lock = JSON.parse(readSiteText("package-lock.json")) as {
      lockfileVersion?: number;
      packages?: Record<string, unknown>;
    };
    expect(lock.lockfileVersion).toBeGreaterThanOrEqual(3);
    expect(Object.keys(lock.packages ?? {}).length).toBeGreaterThan(50);
  });

  it("F23-T1-03: dompurify sanitizes active XSS payloads while preserving safe HTML tables in jsdom >= 30", () => {
    const dirty =
      '<h1>Relatorio</h1><table><tr><td>OK</td></tr></table><img src=x onerror=alert(1)><svg onload=alert(2)><a href="javascript:alert(3)">x</a>';
    const clean = DOMPurify.sanitize(dirty);

    expect(clean).toContain("<h1>Relatorio</h1>");
    expect(clean).toContain("<td>OK</td>");
    expect(clean.toLowerCase()).not.toContain("onerror");
    expect(clean.toLowerCase()).not.toContain("onload");
    expect(clean.toLowerCase()).not.toContain("javascript:");
  });

  it("F23-T1-04: @nats-io/nats-core wsconnect publishes and receives JSON and binary Uint8Array over MockNatsWebSocket", async () => {
    natsMock = installNatsWsMock();

    const nc = await wsconnect({
      servers: ["wss://nats.e2e.local/nats"],
      authenticator: tokenAuthenticator("e2e-jwt-token"),
    });

    const sub = nc.subscribe("tenant.c1.e2e.test");
    await nc.flush();
    const received: Uint8Array[] = [];
    const reader = (async () => {
      for await (const msg of sub) {
        received.push(msg.data);
        if (received.length >= 2) break;
      }
    })();

    natsMock.serverPublish("tenant.c1.e2e.test", { hello: "world" });
    natsMock.serverPublish("tenant.c1.e2e.test", new Uint8Array([0x44, 0x46, 0x01, 0x02]));
    await reader;

    expect(received).toHaveLength(2);
    expect(JSON.parse(new TextDecoder().decode(received[0]))).toEqual({ hello: "world" });
    expect(Array.from(received[1])).toEqual([0x44, 0x46, 0x01, 0x02]);

    await nc.close();
  });

  it("F23-T1-05: CI workflow and verify-build.mjs enforce typecheck, test, build, and SW self-containment", () => {
    expect(pathExistsInSite(".github/workflows/ci.yml")).toBe(true);
    expect(pathExistsInSite("scripts/verify-build.mjs")).toBe(true);

    const ci = readSiteText(".github/workflows/ci.yml");
    expect(ci).toContain("pull_request");
    expect(ci).toContain("npm ci");
    expect(ci).toContain("npm run typecheck");
    expect(ci).toContain("npm test");
    expect(ci).toContain("npm run build");

    const verifyBuild = readSiteText("scripts/verify-build.mjs");
    expect(verifyBuild).toContain("sw.js");
    expect(verifyBuild).toContain("manifest.webmanifest");
  });
});
