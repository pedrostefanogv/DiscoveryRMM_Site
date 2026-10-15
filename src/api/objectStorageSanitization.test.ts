import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("./client", () => ({
  api: { get: mocks.get, post: mocks.post },
}));

import { objectStorageSanitizationApi } from "./object-storage-sanitization";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("objectStorageSanitizationApi", () => {
  it("normaliza o relatório da varredura (tamanhos e inventário)", async () => {
    mocks.post.mockResolvedValue({
      startedAtUtc: "2026-10-15T10:00:00Z",
      finishedAtUtc: "2026-10-15T10:00:03Z",
      dryRun: true,
      minAgeHours: 24,
      totalObjects: 12,
      totalBytes: 5_000_000_000,
      truncated: false,
      inventory: [
        { prefix: "app-store/", objects: 7, bytes: 4_900_000_000 },
        { prefix: "clients/", objects: 5, bytes: 100_000_000 },
      ],
      totalExamined: 7,
      totalFound: 2,
      totalFixed: 0,
      totalFoundBytes: 4_800_000_000,
      totalFixedBytes: 0,
      checks: [
        {
          key: "object-storage-orphan-custom-assets",
          title: "Assets da loja sem vínculo",
          examined: 7,
          found: 2,
          fixed: 0,
          skipped: 1,
          hasMore: false,
          error: null,
          foundBytes: 4_800_000_000,
          fixedBytes: 0,
          samples: ["app-store/custom/installers/a/Setup.zip (4.47 GB)"],
        },
      ],
    });

    const report = await objectStorageSanitizationApi.run({ dryRun: true, minAgeHours: 24 });

    expect(mocks.post).toHaveBeenCalledWith("/api/v1/admin/object-storage-sanitization/run", {
      dryRun: true,
      checks: undefined,
      minAgeHours: 24,
    });
    expect(report.totalObjects).toBe(12);
    expect(report.totalBytes).toBe(5_000_000_000);
    expect(report.inventory).toHaveLength(2);
    expect(report.inventory[0]).toEqual({ prefix: "app-store/", objects: 7, bytes: 4_900_000_000 });
    expect(report.checks[0]).toMatchObject({
      found: 2,
      fixed: 0,
      foundBytes: 4_800_000_000,
      skipped: 1,
      error: null,
    });
  });

  it("aceita o formato PascalCase e não quebra com campo faltando", async () => {
    mocks.post.mockResolvedValue({
      DryRun: false,
      MinAgeHours: 6,
      TotalObjects: 3,
      TotalFound: 1,
      TotalFixed: 1,
      Checks: [
        { Key: "orphan", Title: "x", Found: 1, Fixed: 1, FoundBytes: 10, FixedBytes: 10, Samples: ["k"] },
      ],
    });

    const report = await objectStorageSanitizationApi.run({ dryRun: false });

    expect(report.dryRun).toBe(false);
    expect(report.minAgeHours).toBe(6);
    expect(report.totalObjects).toBe(3);
    expect(report.inventory).toEqual([]);
    expect(report.checks[0]).toMatchObject({ key: "orphan", found: 1, fixedBytes: 10 });
    expect(report.checks[0].error).toBeNull();
  });

  it("checks() devolve lista vazia quando a API responde algo inesperado", async () => {
    mocks.get.mockResolvedValue({ nope: true });
    expect(await objectStorageSanitizationApi.checks()).toEqual([]);
  });
});
