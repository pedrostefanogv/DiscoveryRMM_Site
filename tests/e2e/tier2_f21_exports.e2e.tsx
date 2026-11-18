import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, type RouteObject } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiBarrel from "@/api";
import { remoteSessionsApi as directRemoteSessionsApi } from "@/api/remote-sessions";
import * as apiTypesBarrel from "@/api/types";
import type { Ticket } from "@/api/types";
import { routes } from "@/router";
import { ThemeProvider } from "@/theme/ThemeContext";
import {
  installBroadcastChannelMock,
  installFetchMock,
  installMatchMediaMock,
  installResizeObserverMock,
} from "./helpers/browserMocks";
import { clearSeededAuthStorage, seedAuthStorage } from "./helpers/jwtFactory";
import { installNatsWsMock, type NatsWsMockController } from "./helpers/natsWsMock";

vi.mock("@/auth/authorization", () => ({
  useAuthorization: () => ({
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    isAdmin: true,
    permissions: ["admin.*"],
  }),
}));

vi.mock("@/hooks/useTicketAnswers", () => ({
  useTicketAnswers: () => ({ data: [], isLoading: false, isError: false }),
}));

import AgentDetail from "@/pages/agents/AgentDetail";
import RemoteSession from "@/pages/agents/RemoteSession";
import { TicketOpeningSection } from "@/pages/tickets/TicketDetail";

function flattenPaths(routeList: RouteObject[], prefix = ""): string[] {
  const out: string[] = [];
  for (const r of routeList) {
    const seg = r.path ? `${prefix}/${r.path}`.replace(/\/+/g, "/") : prefix;
    if (seg) out.push(seg);
    if (r.children) out.push(...flattenPaths(r.children, seg));
  }
  return out;
}

describe("Tier 2 — F21: Barrel Equivalence & Page Entrypoint Boundaries", () => {
  let natsMock: NatsWsMockController;
  let bcMock: ReturnType<typeof installBroadcastChannelMock>;
  let resizeMock: ReturnType<typeof installResizeObserverMock>;

  beforeEach(() => {
    installMatchMediaMock(false);
    natsMock = installNatsWsMock();
    bcMock = installBroadcastChannelMock();
    resizeMock = installResizeObserverMock();
    seedAuthStorage({ keepSignedIn: true });
  });

  afterEach(() => {
    natsMock.restore();
    bcMock.restore();
    resizeMock.restore();
    clearSeededAuthStorage();
  });

  it("F21-T2-01: @/api and @/api/types re-exports preserve referential identity without duplicate modules", () => {
    expect(Object.is(apiBarrel.LogType, apiTypesBarrel.LogType)).toBe(true);
    expect(Object.is(apiBarrel.CommandType, apiTypesBarrel.CommandType)).toBe(true);
    expect(Object.is(apiBarrel.remoteSessionsApi, directRemoteSessionsApi)).toBe(true);
  });

  it("F21-T2-02: router.tsx declares decomposed page routes for agents, tickets, automation, and remote-session", () => {
    const paths = flattenPaths(routes);
    expect(paths.some((p) => p.includes("agents/remote-session"))).toBe(true);
    expect(paths.some((p) => p.includes("agents/:id"))).toBe(true);
    expect(paths.some((p) => p.includes("tickets/:id"))).toBe(true);
    expect(paths.some((p) => p.includes("automation/tasks"))).toBe(true);
  });

  it("F21-T2-03: TicketOpeningSection renders empty when templateId and templateName are null despite legacy markdown", () => {
    const legacyTicket = {
      id: "t-legacy",
      clientId: "c1",
      siteId: null,
      agentId: null,
      departmentId: null,
      workflowProfileId: null,
      title: "Legacy Ticket",
      description: "Desc",
      priority: "Low",
      category: null,
      assignedToUserId: null,
      workflowStateId: null,
      createdAt: "2026-11-18T00:00:00Z",
      updatedAt: "2026-11-18T00:00:00Z",
      closedAt: null,
      templateId: null,
      templateName: null,
      submissionSnapshotMarkdown: "### Legacy\n| A | B |",
    } as unknown as Ticket;

    const { container } = render(
      <ThemeProvider>
        <TicketOpeningSection ticket={legacyTicket} />
      </ThemeProvider>,
    );
    expect(container.textContent).toBe("");
  });

  it("F21-T2-04: AgentDetail falls back to Info tab when ?tab= query param is unknown", async () => {
    installFetchMock([
      {
        match: /\/api\/v1\/agents\/a1$/,
        handler: () => ({
          body: {
            id: "a1",
            hostname: "SRV-FALLBACK",
            displayName: "SRV-FALLBACK",
            operatingSystem: "Windows Server 2022",
            isOnline: true,
          },
        }),
      },
      { match: /\/api\/v1\//, handler: () => ({ body: { items: [], totalCount: 0 } }) },
    ]);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <MemoryRouter initialEntries={["/agents/a1?tab=unknown-tab-xyz"]}>
            <Routes>
              <Route path="/agents/:id" element={<AgentDetail />} />
            </Routes>
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const infoTab = await screen.findByRole("tab", { name: /^Info$/ });
    expect(infoTab.getAttribute("aria-selected")).toBe("true");
  });

  it("F21-T2-05: RemoteSession handles missing agentId search param gracefully without throwing", async () => {
    installFetchMock([
      {
        match: /\/api\/v1\/remote-sessions\/bandwidth-policy/,
        handler: () => ({
          body: {
            defaultMode: "manual",
            manualDefaultKbps: 0,
            manualPresets: [{ id: "unlimited", label: "Ilimitado", kbps: 0 }],
            autoMinKbps: 500,
            autoMaxKbps: 10000,
            autoStepKbps: 500,
            serverMaxKbps: 20000,
          },
        }),
      },
      { match: /\/api\/v1\//, handler: () => ({ body: {} }) },
    ]);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <MemoryRouter initialEntries={["/agents/remote-session"]}>
            <RemoteSession />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.firstChild).toBeTruthy();
  });
});
