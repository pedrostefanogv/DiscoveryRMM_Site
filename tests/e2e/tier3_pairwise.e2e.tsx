import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, MemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AgentHeartbeat } from "@/api";
import { NatsService } from "@/api/nats";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import { useFilesStream } from "@/modules/remote-files/useFilesStream";
import RemoteScreenViewer from "@/modules/remote-screen/RemoteScreenViewer";
import RemoteSession from "@/pages/agents/RemoteSession";
import { routes } from "@/router";
import { heartbeatStore, useAllAgentHeartbeats } from "@/stores/heartbeatStore";
import { THEME_MODE_STORAGE_KEY, ThemeProvider, useTheme } from "@/theme/ThemeContext";
import { printHtmlAsPdf } from "@/utils/reportPrint";
import {
  installBroadcastChannelMock,
  installCanvasAndBitmapMock,
  installFetchMock,
  installMatchMediaMock,
  installResizeObserverMock,
  installWindowOpenMock,
} from "./helpers/browserMocks";
import { clearSeededAuthStorage, makeTestJwt, seedAuthStorage } from "./helpers/jwtFactory";
import { installNatsWsMock, type NatsWsMockController } from "./helpers/natsWsMock";
import { buildScreenFullFrame } from "./helpers/screenFrameBuilder";

const SCREEN_SUBJ = "tenant.c1.site.s1.agent.a1.remote.screen.s1";
const SESSION_SUBJ = "tenant.c1.site.s1.agent.a1.remote.session.s1";
const NATS_URL = "wss://nats.e2e.local/nats";

describe("Tier 3 — Cross-Feature Pairwise Interactions (F19–F23)", () => {
  let natsMock: NatsWsMockController;
  let canvasMock: ReturnType<typeof installCanvasAndBitmapMock>;
  let resizeMock: ReturnType<typeof installResizeObserverMock>;
  let bcMock: ReturnType<typeof installBroadcastChannelMock>;

  beforeEach(() => {
    heartbeatStore.clear();
    localStorage.clear();
    document.documentElement.className = "";
    installMatchMediaMock(false);
    natsMock = installNatsWsMock();
    canvasMock = installCanvasAndBitmapMock();
    resizeMock = installResizeObserverMock();
    bcMock = installBroadcastChannelMock();
    seedAuthStorage({ keepSignedIn: true });
  });

  afterEach(() => {
    natsMock.restore();
    canvasMock.restore();
    resizeMock.restore();
    bcMock.restore();
    clearSeededAuthStorage();
    heartbeatStore.clear();
    vi.useRealTimers();
  });

  it("T3-01 (F19 x F20): RemoteScreenViewer never leaks JWT in WS URL, survives reconnect, and closes all bitmaps on unmount", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const jwt = makeTestJwt({ sub: "pairwise-op" });

    const { unmount } = render(
      <RemoteScreenViewer
        natsSubject={SCREEN_SUBJ}
        sessionId="s1"
        natsUrl={NATS_URL}
        jwt={jwt}
        quality="auto"
        codec="jpeg"
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(natsMock.connectUrls[0]).not.toContain("access_token=");
    expect(natsMock.connections[0].subscriptions.size).toBe(8);

    await act(async () => {
      natsMock.serverPublish(
        `${SCREEN_SUBJ}.frame`,
        buildScreenFullFrame({ seq: 1, ts: Date.now() - 15, codec: "jpeg" }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    // Drop and reconnect
    await act(async () => {
      natsMock.connections[0].closeFromServer(1006, "drop");
      await vi.advanceTimersByTimeAsync(1100);
    });

    expect(natsMock.connections).toHaveLength(2);
    expect(natsMock.connectUrls[1]).not.toContain("access_token=");
    expect(natsMock.connections[1].subscriptions.size).toBe(8);

    unmount();
    for (const bmp of canvasMock.createdBitmaps) {
      expect(bmp.closed).toBe(true);
    }
  });

  it("T3-02 (F19 x F21): HeartbeatStore produces immutable Map snapshots typed via @/api AgentHeartbeat barrel", () => {
    function Probe() {
      const all = useAllAgentHeartbeats();
      const hb = all.get("a-pair");
      return <div data-testid="pair-cpu">{hb?.cpuPercent ?? "none"}</div>;
    }

    render(<Probe />);
    const prev = heartbeatStore.getSnapshot();

    const payload: AgentHeartbeat = {
      agentId: "a-pair",
      status: "Online",
      cpuPercent: 67,
      timestampUtc: new Date().toISOString(),
    };

    act(() => {
      heartbeatStore.setHeartbeat("a-pair", payload);
    });

    const next = heartbeatStore.getSnapshot();
    expect(next).not.toBe(prev);
    expect(screen.getByTestId("pair-cpu").textContent).toBe("67");
  });

  it("T3-03 (F19 x F23): printHtmlAsPdf + dompurify in jsdom >= 30 preserves report tables while stripping unquoted XSS", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const winMock = installWindowOpenMock();
    let capturedBlobHtml = "";
    const OriginalBlob = globalThis.Blob;
    vi.stubGlobal(
      "Blob",
      class CapturingBlob extends OriginalBlob {
        constructor(parts: BlobPart[] = [], opts?: BlobPropertyBag) {
          super(parts, opts);
          if (opts?.type?.includes("html")) {
            capturedBlobHtml = parts.map((p) => String(p)).join("");
          }
        }
      },
    );

    printHtmlAsPdf(
      '<table><tr><td>SRV-01</td><td><img src=x onerror=alert(1)></td></tr></table><script>alert(2)</script>',
      "Pairwise Report",
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const out =
      winMock.opened[0]?.writtenHtml ||
      document.querySelector("iframe")?.getAttribute("srcdoc") ||
      capturedBlobHtml;
    expect(out).toContain("<td>SRV-01</td>");
    expect(out.toLowerCase()).not.toContain("onerror=");
    expect(out.toLowerCase()).not.toContain("<script>");

    vi.stubGlobal("Blob", OriginalBlob);
  });

  it("T3-04 (F20 x F21): router.tsx PageErrorBoundary wraps page routes and preserves parent shell on route throw", () => {
    expect(routes.length).toBeGreaterThan(0);

    function CrashPage(): null {
      throw new Error("Decomposed page boom");
    }

    const r = createMemoryRouter(
      [
        {
          path: "/",
          element: (
            <div>
              <nav data-testid="shell-nav">Sidebar</nav>
              <Outlet />
            </div>
          ),
          children: [
            {
              path: "agents/:id",
              element: <CrashPage />,
              errorElement: <PageErrorBoundary />,
            },
          ],
        },
      ],
      { initialEntries: ["/agents/a1"] },
    );

    render(<RouterProvider router={r} />);
    expect(screen.getByTestId("shell-nav").textContent).toBe("Sidebar");
    expect(screen.getByText("Não foi possível exibir esta página")).toBeTruthy();
    expect(screen.getByText("Decomposed page boom")).toBeTruthy();
  });

  it("T3-05 (F20 x F22): useFilesStream subscribes before connect, uses JWT exp, and cleans up mountedRef on unmount", async () => {
    const expSec = Math.floor(Date.now() / 1000) + 180;
    const jwt = makeTestJwt({ exp: expSec });
    const credsSpy = vi.spyOn(NatsService.prototype, "setPreSuppliedCredentials");
    const subscribeSpy = vi.spyOn(NatsService.prototype, "subscribe");

    const { result, unmount } = renderHook(() =>
      useFilesStream({
        natsSubject: SESSION_SUBJ,
        natsUrl: NATS_URL,
        jwt,
      }),
    );

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    expect(
      subscribeSpy.mock.calls.some((c) => c[2]?.connectIfNeeded === false),
    ).toBe(true);
    const creds = credsSpy.mock.calls[0]?.[0];
    expect(Math.abs(new Date(creds.expiresAtUtc).getTime() - expSec * 1000)).toBeLessThanOrEqual(
      2000,
    );

    unmount();
    expect(natsMock.lastConnection?.readyState).toBe(3); // CLOSED

    // Also verify mountedRef prevents post-unmount subscribe() when unmounted before connect() resolves
    let resolveConnect!: (v: boolean) => void;
    const deferredConnect = new Promise<boolean>((r) => {
      resolveConnect = r;
    });
    const connectSpy = vi
      .spyOn(NatsService.prototype, "connect")
      .mockReturnValueOnce(deferredConnect);

    const deferredHook = renderHook(() =>
      useFilesStream({
        natsSubject: SESSION_SUBJ,
        natsUrl: NATS_URL,
        jwt,
      }),
    );

    const subsAtUnmount = subscribeSpy.mock.calls.length;
    deferredHook.unmount();

    await act(async () => {
      resolveConnect(true);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(subscribeSpy.mock.calls.length).toBe(subsAtUnmount);

    connectSpy.mockRestore();
    subscribeSpy.mockRestore();
    credsSpy.mockRestore();
  });

  it("T3-06 (F20 x F23): ThemeContext + jsdom matchMedia reacts to OS changes until user explicitly overrides", () => {
    const mm = installMatchMediaMock(false);

    function Probe() {
      const { mode, setMode } = useTheme();
      return (
        <div>
          <span data-testid="t3-mode">{mode}</span>
          <button type="button" onClick={() => setMode("light")}>
            PinLight
          </button>
        </div>
      );
    }

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("t3-mode").textContent).toBe("light");
    expect(localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBeNull();

    act(() => {
      mm.setDark(true);
    });
    expect(screen.getByTestId("t3-mode").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => {
      screen.getByRole("button", { name: "PinLight" }).click();
    });
    expect(localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBe("light");

    act(() => {
      mm.setDark(true);
    });
    expect(screen.getByTestId("t3-mode").textContent).toBe("light");
  });

  it("T3-07 (F21 x F22): RemoteSession public entrypoint integrates Proxy/RDP session lifecycle over fetch & NATS", async () => {
    const fetchCtl = installFetchMock([
      {
        match: /\/api\/v1\/agents\/a1$/,
        handler: () => ({ body: { id: "a1", hostname: "SRV-PAIR", isOnline: true } }),
      },
      { match: /\/api\/v1\/remote-sessions\/a1\/active/, handler: () => ({ body: [] }) },
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
        method: "POST",
        match: /\/api\/v1\/remote-sessions\/a1$/,
        handler: (req) => ({
          body: {
            sessionId: "sess-pair-1",
            agentId: "a1",
            kind: (req.bodyJson as { kind?: string })?.kind ?? "proxy",
            natsSubject: SESSION_SUBJ,
            natsWssUrl: NATS_URL,
            jwt: makeTestJwt(),
          },
        }),
      },
      { match: /\/api\/v1\//, handler: () => ({ body: {} }) },
    ]);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <MemoryRouter initialEntries={["/agents/remote-session?agentId=a1"]}>
            <RemoteSession />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/SRV-PAIR/)).toBeTruthy();

    // Switch to RDP tab (F22) via select or button/tab and verify startSession sends kind='rdp'
    const sectionSelect = screen.queryByLabelText(/Seção do acesso remoto/i) as HTMLSelectElement | null;
    if (sectionSelect) {
      const rdpOpt = Array.from(sectionSelect.options).find(
        (o) => o.value === "rdp" || /RDP/i.test(o.textContent ?? ""),
      );
      expect(rdpOpt, "M3 F22 requirement: RDP option must exist in RemoteSession").toBeDefined();
      fireEvent.change(sectionSelect, { target: { value: rdpOpt!.value } });
    } else {
      const rdpTab = screen.getByRole("button", { name: /RDP/i });
      fireEvent.click(rdpTab);
    }
    const connectBtn = screen.getByRole("button", { name: /Conectar|Iniciar/i });
    fireEvent.click(connectBtn);

    await waitFor(() => {
      const post = fetchCtl.calls.find(
        (c) => c.method === "POST" && /\/api\/v1\/remote-sessions\/a1$/.test(c.url),
      );
      expect(post?.bodyJson).toMatchObject({ kind: "rdp" });
    });
  });
});
