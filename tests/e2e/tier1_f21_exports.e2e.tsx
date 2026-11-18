import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiBarrel from "@/api";
import * as apiTypesBarrel from "@/api/types";
import {
  LogLevel,
  LogSource,
  LogType,
  CommandType,
  AutomationTaskActionType,
  AutomationTaskChangeType,
  type Agent,
  type AgentHeartbeatMetrics,
  type AutomationTaskSummary,
  type Client,
  type RemoteSessionResponse,
  type Site,
  type Ticket,
} from "@/api/types";
import { ThemeProvider } from "@/theme/ThemeContext";
import { installBroadcastChannelMock, installFetchMock, installMatchMediaMock, installResizeObserverMock } from "./helpers/browserMocks";
import { clearSeededAuthStorage, seedAuthStorage } from "./helpers/jwtFactory";
import { installNatsWsMock, type NatsWsMockController } from "./helpers/natsWsMock";

// Note: Do NOT mock @/api or @/api/types — F21 verifies genuine public barrel exports.
// Only mock auth/answers/notes hooks where needed for isolated page rendering, keeping @/api intact.
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

import TicketDetail, { TicketOpeningSection } from "@/pages/tickets/TicketDetail";
import AgentDetail from "@/pages/agents/AgentDetail";
import AutomationTasksPage from "@/pages/automation/AutomationTasksPage";
import RemoteSession from "@/pages/agents/RemoteSession";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

describe("Tier 1 — F21: Public Module Exports & Barrel Conformance", () => {
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

  it("F21-T1-01: @/api/types barrel exports core domain enums and type contracts", () => {
    expect(LogType[0]).toBe("Hardware");
    expect(LogLevel).toBeDefined();
    expect(LogSource).toBeDefined();
    expect(CommandType).toBeDefined();
    expect(AutomationTaskActionType).toBeDefined();
    expect(AutomationTaskChangeType).toBeDefined();

    // Type-level conformance checks (verified at compile/transform time)
    const sampleClient: Pick<Client, "id" | "name"> = { id: "c1", name: "Acme" };
    const sampleSite: Pick<Site, "id" | "clientId" | "name"> = {
      id: "s1",
      clientId: "c1",
      name: "HQ",
    };
    const sampleMetrics: AgentHeartbeatMetrics = { cpuPercent: 12, memoryPercent: 34 };
    const sampleAgent: Pick<Agent, "id" | "hostname"> = { id: "a1", hostname: "SRV-01" };
    const sampleTicket: Pick<Ticket, "id" | "title"> = { id: "t1", title: "Help" };
    const sampleTask: Pick<AutomationTaskSummary, "id" | "name"> = {
      id: "task-1",
      name: "Patch Nightly",
    };
    const sampleSession: Pick<RemoteSessionResponse, "sessionId" | "agentId" | "kind"> = {
      sessionId: "sess-1",
      agentId: "a1",
      kind: "screen",
    };

    expect(sampleClient.id).toBe("c1");
    expect(sampleSite.clientId).toBe("c1");
    expect(sampleMetrics.cpuPercent).toBe(12);
    expect(sampleAgent.hostname).toBe("SRV-01");
    expect(sampleTicket.title).toBe("Help");
    expect(sampleTask.name).toBe("Patch Nightly");
    expect(sampleSession.kind).toBe("screen");
    expect(Object.keys(apiTypesBarrel).length).toBeGreaterThan(20);
  });

  it("F21-T1-02: @/api barrel re-exports all API clients, realtime helpers, and NATS entrypoints", () => {
    expect(typeof apiBarrel.api.get).toBe("function");
    expect(typeof apiBarrel.api.post).toBe("function");
    expect(typeof apiBarrel.ApiError).toBe("function");
    expect(typeof apiBarrel.configureApiClient).toBe("function");
    expect(typeof apiBarrel.clientsApi.list).toBe("function");
    expect(typeof apiBarrel.sitesApi.list).toBe("function");
    expect(typeof apiBarrel.agentsApi.get).toBe("function");
    expect(typeof apiBarrel.ticketsApi.get).toBe("function");
    expect(typeof apiBarrel.automationApi.listTasks).toBe("function");
    expect(typeof apiBarrel.remoteSessionsApi.startSession).toBe("function");
    expect(typeof apiBarrel.getNatsService).toBe("function");
    expect(typeof apiBarrel.resetNatsService).toBe("function");
    expect(typeof apiBarrel.sendAgentCommand).toBe("function");
  });

  it("F21-T1-03: TicketDetail public entrypoint exports default TicketDetail and named TicketOpeningSection", () => {
    expect(typeof TicketDetail).toBe("function");
    expect(typeof TicketOpeningSection).toBe("function");

    const sampleTicket = {
      id: "t1",
      clientId: "c1",
      siteId: null,
      agentId: null,
      departmentId: null,
      workflowProfileId: null,
      title: "Onboarding",
      description: "Create workstation account",
      priority: "Medium",
      category: null,
      assignedToUserId: null,
      workflowStateId: null,
      createdAt: "2026-11-18T00:00:00Z",
      updatedAt: "2026-11-18T00:00:00Z",
      closedAt: null,
      templateId: "tpl-1",
      templateName: "Novo Colaborador",
      submissionSnapshotMarkdown: "### Abertura\n- **Nome:** Maria",
    } as unknown as Ticket;

    render(
      <ThemeProvider>
        <TicketOpeningSection ticket={sampleTicket} />
      </ThemeProvider>,
    );

    expect(screen.getByText("Abertura do chamado")).toBeTruthy();
    expect(screen.getByText("Novo Colaborador")).toBeTruthy();
  });

  it("F21-T1-04: AgentDetail default export renders agent host view via public route", async () => {
    expect(typeof AgentDetail).toBe("function");

    installFetchMock([
      {
        match: /\/api\/v1\/agents\/a1$/,
        handler: () => ({
          body: {
            id: "a1",
            hostname: "WS-FINANCE-01",
            displayName: "WS-FINANCE-01",
            operatingSystem: "Windows 11 Pro",
            osVersion: "10.0.26100",
            agentVersion: "2.0.0",
            lastIpAddress: "10.20.30.40",
            isOnline: true,
          },
        }),
      },
      {
        match: /\/api\/v1\/agents\/a1\/hardware/,
        handler: () => ({ body: { disks: [], networkAdapters: [], memoryModules: [] } }),
      },
      {
        match: /\/api\/v1\//,
        handler: () => ({ body: { items: [], totalCount: 0 } }),
      },
    ]);

    const qc = makeQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <MemoryRouter initialEntries={["/agents/a1"]}>
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

    expect(await screen.findByRole("heading", { name: "WS-FINANCE-01" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^Info$/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("F21-T1-05: AutomationTasksPage default export renders automation tasks workspace", async () => {
    expect(typeof AutomationTasksPage).toBe("function");

    installFetchMock([
      {
        match: /\/api\/v1\/automation\/tasks/,
        handler: () => ({
          body: {
            items: [
              {
                id: "task-1",
                name: "Atualizar 7-Zip",
                actionType: "UpdatePackage",
                triggerType: "Scheduled",
                isActive: true,
                scopeType: "Global",
                executionOrder: 100,
              },
            ],
            totalCount: 1,
            page: 1,
            pageSize: 25,
          },
        }),
      },
      {
        match: /\/api\/v1\//,
        handler: () => ({ body: { items: [], totalCount: 0 } }),
      },
    ]);

    const qc = makeQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <MemoryRouter initialEntries={["/automation/tasks"]}>
            <AutomationTasksPage />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(await screen.findByText("Atualizar 7-Zip")).toBeTruthy();
  });

  it("F21-T1-06: RemoteSession default export mounts session tabs from search params", async () => {
    expect(typeof RemoteSession).toBe("function");

    installFetchMock([
      {
        match: /\/api\/v1\/agents\/a1$/,
        handler: () => ({
          body: { id: "a1", hostname: "SRV-APP-01", isOnline: true },
        }),
      },
      {
        match: /\/api\/v1\/remote-sessions\/a1\/active/,
        handler: () => ({ body: [] }),
      },
      {
        match: /\/api\/v1\/remote-sessions\/[^/]+\/[^/]+\/consent/,
        handler: () => ({ body: { consentRequired: false, status: "NotRequired" } }),
      },
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
      {
        match: /\/api\/v1\//,
        handler: () => ({ body: {} }),
      },
    ]);

    const qc = makeQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <MemoryRouter initialEntries={["/agents/remote-session?agentId=a1&transport=nats&codec=webp"]}>
            <RemoteSession />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(await screen.findByText(/SRV-APP-01/)).toBeTruthy();
  });
});
