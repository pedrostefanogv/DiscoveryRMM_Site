import { describe, expect, it, vi } from "vitest";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock("@/api/client", () => ({
  api: { get: getMock },
}));

import {
  getServerMetadata,
  parseTicketAttachmentSettings,
} from "./configurationApi";

describe("configurationApi - metadata de configuração", () => {
  it("publica agentHomeTabOptions vindos do servidor (fonte de verdade)", async () => {
    getMock.mockResolvedValueOnce({
      fields: {
        agentHomeTab: { sourceType: 2, canEditAtClient: true, canEditAtSite: true },
      },
      blockedFields: ["SupportEnabled"],
      agentHomeTabOptions: ["status", "chat", ""],
    });

    const metadata = await getServerMetadata();

    expect(getMock).toHaveBeenCalledWith(
      "/api/v1/configurations/server/metadata",
    );
    // Entradas vazias são descartadas na normalização.
    expect(metadata.agentHomeTabOptions).toEqual(["status", "chat"]);
    expect(metadata.blockedFields).toEqual(["SupportEnabled"]);
    expect(Object.keys(metadata.fields)).toContain("agentHomeTab");
  });

  it("omite agentHomeTabOptions quando o servidor não publica a lista", async () => {
    getMock.mockResolvedValueOnce({ fields: {} });

    const metadata = await getServerMetadata();

    expect(metadata.agentHomeTabOptions).toBeUndefined();
  });
});

describe("parseTicketAttachmentSettings", () => {
  it("usa maxLargeFileSizeBytes padrão de 2 GB quando o valor está ausente", () => {
    const parsed = parseTicketAttachmentSettings(undefined);
    expect(parsed.maxLargeFileSizeBytes).toBe(2147483648);
    expect(parsed.maxFileSizeBytes).toBe(10485760);
    expect(parsed.allowedContentTypes).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ]);
  });

  it("mantém o default de 2 GB para JSON legado sem o campo", () => {
    const parsed = parseTicketAttachmentSettings(
      JSON.stringify({
        enabled: true,
        maxFileSizeBytes: 5242880,
        allowedContentTypes: ["image/png"],
        presignedUploadUrlTtlMinutes: 30,
      }),
    );

    expect(parsed.maxFileSizeBytes).toBe(5242880);
    expect(parsed.maxLargeFileSizeBytes).toBe(2147483648);
    expect(parsed.allowedContentTypes).toEqual(["image/png"]);
  });

  it("respeita maxLargeFileSizeBytes quando vier no JSON", () => {
    const parsed = parseTicketAttachmentSettings({
      enabled: false,
      maxFileSizeBytes: 10485760,
      maxLargeFileSizeBytes: 5368709120,
      allowedContentTypes: ["application/pdf"],
      presignedUploadUrlTtlMinutes: 15,
    });

    expect(parsed.enabled).toBe(false);
    expect(parsed.maxLargeFileSizeBytes).toBe(5368709120);
  });

  it("cai nos defaults quando o JSON é inválido", () => {
    const parsed = parseTicketAttachmentSettings("{not-json");
    expect(parsed.maxLargeFileSizeBytes).toBe(2147483648);
  });
});
