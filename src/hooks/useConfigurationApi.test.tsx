import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const { getClientConfigMock, getSiteConfigMock } = vi.hoisted(() => ({
  getClientConfigMock: vi.fn(),
  getSiteConfigMock: vi.fn(),
}));

vi.mock("@/services/configurationApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/configurationApi")>();
  return {
    ...actual,
    getClientConfig: getClientConfigMock,
    getSiteConfig: getSiteConfigMock,
  };
});

import { ApiError } from "@/api";
import { useClientConfig, useSiteConfig } from "./useConfigurationApi";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useConfigurationApi — 404 quando o escopo não tem sobrescritas", () => {
  beforeEach(() => {
    getClientConfigMock.mockReset();
    getSiteConfigMock.mockReset();
  });

  it("trata o 404 do cliente como configuração vazia (tudo herdado)", async () => {
    getClientConfigMock.mockRejectedValueOnce(
      new ApiError(404, "Client config for c1 not found"),
    );

    const { result } = renderHook(() => useClientConfig("c1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual({});
  });

  it("trata o 404 do site como configuração vazia (tudo herdado)", async () => {
    getSiteConfigMock.mockRejectedValueOnce(
      new ApiError(404, "Site config for s1 not found"),
    );

    const { result } = renderHook(() => useSiteConfig("s1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toEqual({});
  });

  it("continua propagando erros que não são 404", async () => {
    getClientConfigMock.mockRejectedValueOnce(new ApiError(500, "boom"));

    const { result } = renderHook(() => useClientConfig("c1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect((result.current.error as ApiError).status).toBe(500);
  });
});
