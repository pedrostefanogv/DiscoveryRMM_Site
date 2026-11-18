import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, MemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import RemoteScreenViewer from "@/modules/remote-screen/RemoteScreenViewer";
import RemoteSession from "@/pages/agents/RemoteSession";
import { heartbeatStore, useAgentHeartbeat } from "@/stores/heartbeatStore";
import { ThemeProvider, useTheme } from "@/theme/ThemeContext";
import { printHtmlAsPdf } from "@/utils/reportPrint";
import {
  installBroadcastChannelMock,
  installCanvasAndBitmapMock,
  installFetchMock,
  installMatchMediaMock,
  installObjectUrlMock,
  installResizeObserverMock,
  installWindowOpenMock,
} from "./helpers/browserMocks";
import { clearSeededAuthStorage, makeTestJwt, seedAuthStorage } from "./helpers/jwtFactory";
import { installNatsWsMock, type NatsWsMockController } from "./helpers/natsWsMock";
import { buildScreenFullFrame, buildScreenTileFrame } from "./helpers/screenFrameBuilder";

const SCREEN_SUBJ = "tenant.c1.site.s1.agent.a1.remote.screen.s1";
const SESSION_SUBJ = "tenant.c1.site.s1.agent.a1.remote.session.s1";
const NATS_URL = "wss://nats.e2e.local/nats";

describe("Tier 4 — Real-World End-to-End Scenarios (F19–F23)", () => {
  let natsMock: NatsWsMockController;
  let canvasMock: ReturnType<typeof installCanvasAndBitmapMock>;
  let resizeMock: ReturnType<typeof installResizeObserverMock>;
  let bcMock: ReturnType<typeof installBroadcastChannelMock>;
  let urlMock: ReturnType<typeof installObjectUrlMock>;

  beforeEach(() => {
    heartbeatStore.clear();
    localStorage.clear();
    document.documentElement.className = "";
    installMatchMediaMock(false);
    natsMock = installNatsWsMock();
    canvasMock = installCanvasAndBitmapMock();
    resizeMock = installResizeObserverMock();
    bcMock = installBroadcastChannelMock();
    urlMock = installObjectUrlMock();
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

  it("T4-01 (F19, F20, F21): Operator Remote Desktop reconnect recovery, local cursor RTT, live HeartbeatStore telemetry, and zero leaks", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const jwt = makeTestJwt({ sub: "op-t4-01" });
    const onLatency = vi.fn();

    function OperatorWorkspace() {
      const hb = useAgentHeartbeat("a1");
      return (
        <div>
          <span data-testid="live-cpu">{hb?.cpuPercent ?? "offline"}</span>
          <RemoteScreenViewer
            natsSubject={SCREEN_SUBJ}
            sessionId="s1"
            natsUrl={NATS_URL}
            jwt={jwt}
            quality="auto"
            codec="webp"
            onLatency={onLatency}
          />
        </div>
      );
    }

    const { unmount } = render(<OperatorWorkspace />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    // 1. No JWT leaked in WS URL
    expect(natsMock.connectUrls[0]).not.toContain("access_token=");

    // 2. Receive keyframe + webp tile in default 'local' cursor mode -> RTT computed
    await act(async () => {
      natsMock.serverPublish(
        `${SCREEN_SUBJ}.frame`,
        buildScreenFullFrame({ seq: 1, ts: Date.now() - 32, codec: "webp" }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onLatency).toHaveBeenCalledWith(32);

    await act(async () => {
      natsMock.serverPublish(
        `${SCREEN_SUBJ}.frame`,
        buildScreenTileFrame({
          seq: 2,
          ts: Date.now() - 18,
          tiles: [{ x: 0, y: 0, data: new Uint8Array([0x52, 0x49, 0x46, 0x46]) }],
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(canvasMock.createdBitmaps[1]?.type).toBe("image/webp");

    // 3. Drop WS and auto-recover on attempt #1
    await act(async () => {
      natsMock.connections[0].closeFromServer(1006, "wifi hiccup");
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(natsMock.connections).toHaveLength(2);
    expect(natsMock.connections[1].subscriptions.size).toBe(8);

    // 4. Live HeartbeatStore update propagates to UI
    act(() => {
      heartbeatStore.setHeartbeat("a1", { status: "Online", cpuPercent: 74 });
    });
    expect(screen.getByTestId("live-cpu").textContent).toBe("74");

    // 5. Unmount closes all bitmaps
    unmount();
    for (const bmp of canvasMock.createdBitmaps) {
      expect(bmp.closed).toBe(true);
    }
  });

  it("T4-02 (F20, F21, F22, F23): Operator multi-tab RemoteSession journey (Files 'DF' download -> Proxy LAN -> RDP tab -> cleanup)", async () => {
    const jwt = makeTestJwt({ sub: "op-t4-02" });
    const filePayload = new Uint8Array([10, 20, 30, 40, 50, 60]);

    const fetchCtl = installFetchMock([
      {
        match: /\/api\/v1\/agents\/a1$/,
        handler: () => ({ body: { id: "a1", hostname: "WS-T4-02", isOnline: true } }),
      },
      { match: /\/api\/v1\/remote-sessions\/a1\/active/, handler: () => ({ body: [] }) },
      {
        match: /\/api\/v1\/remote-sessions\/[^/]+\/[^/]+\/consent/,
        handler: () => ({ body: { consentRequired: false, status: "NotRequired" } }),
      },
      {
        method: "GET",
        match: /\/rdp-file/,
        handler: () =>
          new Response("full address:s:127.0.0.1:33890\r\nprompt for credentials:i:1\r\n", {
            status: 200,
            headers: { "content-type": "application/x-rdp" },
          }),
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
            sessionId: `sess-${(req.bodyJson as { kind?: string })?.kind ?? "x"}`,
            agentId: "a1",
            kind: (req.bodyJson as { kind?: string })?.kind ?? "files",
            natsSubject: SESSION_SUBJ,
            natsWssUrl: NATS_URL,
            jwt,
          },
        }),
      },
      { match: /\/api\/v1\//, handler: () => ({ body: {} }) },
    ]);

    natsMock.onPublish((pub, conn) => {
      if (pub.subject === `${SESSION_SUBJ}.files.req` && pub.json) {
        if (pub.json.action === "list") {
          conn.serverPublish(`${SESSION_SUBJ}.files.resp`, {
            requestId: pub.json.requestId,
            success: true,
            entries: [
              {
                name: "audit.bin",
                path: "C:\\audit.bin",
                isDir: false,
                size: filePayload.length,
                modTime: "2026-11-18T00:00:00Z",
              },
            ],
          });
        } else if (pub.json.action === "get") {
          natsMock.publishBinaryFileFrame(
            `${SESSION_SUBJ}.files.data`,
            {
              requestId: pub.json.requestId,
              success: true,
              size: filePayload.length,
              totalChunks: 1,
              chunkIndex: 0,
            },
            filePayload,
          );
          natsMock.publishBinaryFileFrame(
            `${SESSION_SUBJ}.files.resp`,
            {
              requestId: pub.json.requestId,
              success: true,
              size: filePayload.length,
              totalChunks: 1,
              chunkIndex: 0,
            },
            filePayload,
          );
        }
      } else if (pub.subject === `${SESSION_SUBJ}.proxy.req` && pub.json) {
        conn.serverPublish(`${SESSION_SUBJ}.proxy.resp`, {
          requestId: pub.json.requestId,
          success: true,
          statusCode: 200,
          headers: { "content-type": "text/html" },
          bodyBase64: btoa("<h1>Switch UI</h1>"),
        });
      }
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <MemoryRouter initialEntries={["/agents/remote-session?agentId=a1"]}>
            <RemoteSession />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/WS-T4-02/)).toBeTruthy();

    // 1. Files tab -> binary 'DF' download
    const selectTab = (value: string, labelPattern: RegExp) => {
      const selectEl = screen.queryByLabelText(/Seção do acesso remoto/i) as HTMLSelectElement | null;
      if (selectEl) {
        const opt = Array.from(selectEl.options).find(
          (o) => o.value === value || labelPattern.test(o.textContent ?? ""),
        );
        expect(opt, `Tab option ${value} must exist`).toBeDefined();
        fireEvent.change(selectEl, { target: { value: opt!.value } });
      } else {
        fireEvent.click(screen.getByRole("button", { name: labelPattern }));
      }
    };

    selectTab("files", /Arquivos/i);
    fireEvent.click(screen.getByRole("button", { name: /Conectar|Iniciar/i }));
    const fileRow = await screen.findByText("audit.bin");
    fireEvent.contextMenu(fileRow);
    fireEvent.click(await screen.findByRole("button", { name: /Baixar|Download/i }));

    await waitFor(() => {
      const blobs = Array.from(urlMock.createdObjects.values()).filter(
        (v): v is Blob => v instanceof Blob,
      );
      expect(blobs.length).toBeGreaterThanOrEqual(1);
    });

    // 2. Proxy tab -> handle ConnectPlaceholder if present, then NATS LAN request
    selectTab("proxy", /Proxy/i);
    const proxyConnectBtn = screen.queryByRole("button", { name: /Conectar|Iniciar/i });
    if (proxyConnectBtn) {
      fireEvent.click(proxyConnectBtn);
    }
    const proxyInput = await screen.findByPlaceholderText(/192\.168\.1\.1/i);
    fireEvent.change(proxyInput, { target: { value: "http://192.168.1.254/" } });
    fireEvent.click(screen.getByRole("button", { name: /Navegar/i }));
    await waitFor(() => {
      expect(natsMock.published.some((p) => p.subject === `${SESSION_SUBJ}.proxy.req`)).toBe(
        true,
      );
    });

    // 3. RDP tab -> start kind='rdp' session and verify .rdp download or WebRDP connection before teardown
    selectTab("rdp", /RDP/i);
    const rdpConnectBtn = screen.queryByRole("button", { name: /Conectar|Iniciar/i });
    if (rdpConnectBtn) {
      fireEvent.click(rdpConnectBtn);
    }
    await waitFor(() => {
      const rdpStart = fetchCtl.calls.find(
        (c) =>
          c.method === "POST" &&
          /\/api\/v1\/remote-sessions\/a1$/.test(c.url) &&
          (c.bodyJson as { kind?: string })?.kind === "rdp",
      );
      expect(rdpStart).toBeDefined();
    });

    const rdpDownloadBtn = screen.queryByRole("button", {
      name: /\.rdp|Baixar.*RDP|Download.*RDP|Cliente Local|mstsc/i,
    });
    if (rdpDownloadBtn) {
      fireEvent.click(rdpDownloadBtn);
      await waitFor(() => {
        expect(fetchCtl.calls.some((c) => c.method === "GET" && /\/rdp-file/.test(c.url))).toBe(
          true,
        );
      });
    } else {
      await waitFor(() => {
        expect(natsMock.connections.length).toBeGreaterThanOrEqual(2);
      });
    }

    unmount();
    for (const conn of natsMock.connections) {
      expect(conn.readyState).toBe(3); // CLOSED
    }
  });

  it("T4-03 (F19, F21, F23): Unattended Agent Report generation & XSS-hardened PDF print workflow", async () => {
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

    const maliciousHostname = 'SRV-CORP<img src=x onerror=alert("xss")>';
    const reportHtml = `<h1>Inventario</h1><table><tr><td>${maliciousHostname}</td><td>Online</td></tr></table>`;
    printHtmlAsPdf(reportHtml, "Inventario Diario");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const rendered =
      winMock.opened[0]?.writtenHtml ||
      document.querySelector("iframe")?.getAttribute("srcdoc") ||
      capturedBlobHtml;
    expect(rendered).toContain("SRV-CORP");
    expect(rendered.toLowerCase()).not.toContain("onerror=");
    expect(rendered).toContain("Online");

    vi.stubGlobal("Blob", OriginalBlob);
  });

  it("T4-04 (F20, F21, F23): Authenticated route navigation, theme switch, and isolated PageErrorBoundary recovery", () => {
    const mm = installMatchMediaMock(false);

    function NavShell() {
      const { mode, toggleMode } = useTheme();
      return (
        <div>
          <button type="button" data-testid="toggle-theme" onClick={toggleMode}>
            Theme:{mode}
          </button>
          <Outlet />
        </div>
      );
    }

    function HealthyDashboard() {
      return <div data-testid="healthy-dash">Dashboard OK</div>;
    }

    function BrokenAgentView(): null {
      throw new Error("Agent telemetry crashed");
    }

    const r = createMemoryRouter(
      [
        {
          path: "/",
          element: <NavShell />,
          children: [
            { index: true, element: <HealthyDashboard />, errorElement: <PageErrorBoundary /> },
            {
              path: "agents/:id",
              element: <BrokenAgentView />,
              errorElement: <PageErrorBoundary />,
            },
          ],
        },
      ],
      { initialEntries: ["/"] },
    );

    render(
      <ThemeProvider>
        <RouterProvider router={r} />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("healthy-dash").textContent).toBe("Dashboard OK");
    fireEvent.click(screen.getByTestId("toggle-theme"));
    expect(screen.getByTestId("toggle-theme").textContent).toBe("Theme:dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => {
      void r.navigate("/agents/a1");
    });
    expect(screen.getByText("Não foi possível exibir esta página")).toBeTruthy();
    expect(screen.getByTestId("toggle-theme").textContent).toBe("Theme:dark");
    mm.setDark(false);
  });

  it("T4-05 (F20, F21, F22): Cross-tab BroadcastChannel token sync in RemoteSession popup & NATS -ERR authorization handling", async () => {
    clearSeededAuthStorage(); // Popup opens without token in storage or URL

    const refreshedJwt = makeTestJwt({ sub: "refreshed-op" });
    const mainTabChannel = new BroadcastChannel("discovery:auth:v1");
    mainTabChannel.onmessage = (ev: MessageEvent) => {
      if (ev.data?.type === "TOKEN_REQUEST") {
        mainTabChannel.postMessage({
          type: "TOKEN_REFRESHED",
          accessToken: refreshedJwt,
          refreshToken: "rt-new",
          expiresAt: Date.now() + 3600_000,
          to: ev.data?.from,
        });
      }
    };

    const fetchCtl = installFetchMock([
      {
        match: /\/api\/v1\/agents\/a1$/,
        handler: (req) => {
          if (!req.headers.authorization?.includes(refreshedJwt)) {
            return { status: 401, body: { message: "Unauthorized" } };
          }
          return { body: { id: "a1", hostname: "WS-SYNC-01", isOnline: true } };
        },
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
      { match: /\/api\/v1\//, handler: () => ({ body: [] }) },
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

    await waitFor(() => {
      expect(
        fetchCtl.calls.some((c) => c.headers.authorization?.includes(refreshedJwt)),
      ).toBe(true);
    });

    // Also verify NATS -ERR Authorization Violation transitions RemoteScreenViewer cleanly to error
    natsMock.restore();
    natsMock = installNatsWsMock({
      rejectAuthOnConnect: () => "Authorization Violation",
    });
    const onError = vi.fn();
    render(
      <RemoteScreenViewer
        natsSubject={SCREEN_SUBJ}
        sessionId="s1"
        natsUrl={NATS_URL}
        jwt={refreshedJwt}
        quality="auto"
        codec="jpeg"
        onError={onError}
      />,
    );

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.stringContaining("Authorization Violation"));
    });

    mainTabChannel.close();
  });
});
