import { describe, expect, it, vi } from "vitest";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock("@/api/client", () => ({
  api: { get: getMock },
}));

import { getServerMetadata } from "./configurationApi";

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
