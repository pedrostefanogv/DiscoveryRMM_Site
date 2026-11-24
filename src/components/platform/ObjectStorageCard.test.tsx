import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ObjectStorageCard } from "./ObjectStorageCard";
import type { ObjectStorageTelemetryDto } from "@/api/object-storage";

const mockRefetch = vi.fn();
const mockProbeMutate = vi.fn();
let mockOverviewState: {
  data?: ObjectStorageTelemetryDto;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: typeof mockRefetch;
};

vi.mock("@/hooks/useObjectStorageTelemetry", () => ({
  useObjectStorageTelemetry: () => mockOverviewState,
  useProbeObjectStorage: () => ({
    mutate: mockProbeMutate,
    isPending: false,
  }),
}));

vi.mock("@/hooks/useNowTick", () => ({
  useNowTick: () => Date.now(),
}));

const baseTelemetry: ObjectStorageTelemetryDto = {
  configured: true,
  mode: "external",
  provider: "S3Compatible",
  endpointHost: "s3.example.com",
  bucket: "discovery-rmm",
  region: "auto",
  usePathStyle: true,
  sslVerify: true,
  presignTtlHours: 24,
  reachable: true,
  bucketReachable: true,
  latencyMs: 18,
  configurationValid: true,
  checkedAtUtc: new Date().toISOString(),
  nextCheckAfterUtc: new Date(Date.now() + 300_000).toISOString(),
  throttled: false,
  consecutiveFailures: 0,
  errors: [],
  usageScanEnabled: false,
  traffic: {
    sinceUtc: new Date().toISOString(),
    uploads: 10,
    downloads: 25,
    presigns: 30,
    heads: 5,
    deletes: 2,
    bytesIn: 10240,
    bytesOut: 20480,
    operations: 72,
    failures: 0,
    errorRate: 0,
    p95LatencyMs: 22,
    maxLatencyMs: 65,
    inFlight: 0,
    lastSuccessAtUtc: new Date().toISOString(),
    lastFailureAtUtc: null,
    lastError: null,
  },
  generatedAtUtc: new Date().toISOString(),
};

describe("ObjectStorageCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders CTA to configure storage when not configured", () => {
    mockOverviewState = {
      data: { ...baseTelemetry, configured: false, mode: "not_configured" },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
    };

    render(
      <MemoryRouter>
        <ObjectStorageCard />
      </MemoryRouter>,
    );

    expect(screen.getByText("Object storage não configurado")).toBeTruthy();
    const link = screen.getByRole("link", { name: /Configurar Object Storage/i });
    expect(link.getAttribute("href")).toBe("/settings/server#server-config-storage");
  });

  it("renders manual probe button when throttled and operational traffic error when failures > 0", () => {
    mockOverviewState = {
      data: {
        ...baseTelemetry,
        reachable: false,
        throttled: true,
        consecutiveFailures: 2,
        errors: ["HEAD bucket timeout"],
        traffic: {
          ...baseTelemetry.traffic,
          failures: 3,
          errorRate: 4.2,
          lastFailureAtUtc: new Date().toISOString(),
          lastError: "SlowDown: reduce request rate",
        },
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
    };

    render(
      <MemoryRouter>
        <ObjectStorageCard />
      </MemoryRouter>,
    );

    expect(screen.getByText(/HEAD bucket timeout/)).toBeTruthy();
    expect(screen.getByText(/SlowDown: reduce request rate/)).toBeTruthy();

    const probeBtn = screen.getByRole("button", { name: /Verificar agora/i });
    fireEvent.click(probeBtn);
    expect(mockProbeMutate).toHaveBeenCalledTimes(1);
  });
});
