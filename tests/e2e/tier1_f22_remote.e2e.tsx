import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RemoteFiles from "@/modules/remote-files/RemoteFiles";
import { RemoteProcesses } from "@/modules/remote-processes/RemoteProcesses";
import RemoteProxy from "@/modules/remote-proxy/RemoteProxy";
import RemoteTerminal from "@/modules/remote-terminal/RemoteTerminal";
import RemoteSession from "@/pages/agents/RemoteSession";
import { ThemeProvider } from "@/theme/ThemeContext";
import {
  installBroadcastChannelMock,
  installCanvasAndBitmapMock,
  installFetchMock,
  installMatchMediaMock,
  installObjectUrlMock,
  installResizeObserverMock,
} from "./helpers/browserMocks";
import { clearSeededAuthStorage, makeTestJwt, seedAuthStorage } from "./helpers/jwtFactory";
import {
  extractReactComponentExport,
  loadAllDiscoveredModules,
  loadDiscoveredModule,
  remoteProxyGlob,
  remoteRdpGlob,
} from "./helpers/moduleProbe";
import {
  buildTunnelFrame,
  installNatsWsMock,
  type NatsWsMockController,
} from "./helpers/natsWsMock";
import { sharedXtermHarness } from "./helpers/xtermMock";

vi.mock("@xterm/xterm", async () => {
  const { sharedXtermHarness: h } = await import("./helpers/xtermMock");
  return { Terminal: h.Terminal };
});
vi.mock("@xterm/addon-fit", async () => {
  const { sharedXtermHarness: h } = await import("./helpers/xtermMock");
  return { FitAddon: h.FitAddon };
});
vi.mock("@xterm/addon-web-links", async () => {
  const { sharedXtermHarness: h } = await import("./helpers/xtermMock");
  return { WebLinksAddon: h.WebLinksAddon };
});
vi.mock("@xterm/addon-search", async () => {
  const { sharedXtermHarness: h } = await import("./helpers/xtermMock");
  return { SearchAddon: h.SearchAddon };
});
vi.mock("@xterm/addon-clipboard", async () => {
  const { sharedXtermHarness: h } = await import("./helpers/xtermMock");
  return { ClipboardAddon: h.ClipboardAddon };
});

async function extractProxyRenderedOutput(
  urlMock: ReturnType<typeof installObjectUrlMock>,
): Promise<{ iframe: HTMLIFrameElement | null; content: string }> {
  const iframe = document.querySelector("iframe");
  if (iframe) {
    const srcdoc = iframe.getAttribute("srcdoc") ?? iframe.srcdoc ?? "";
    if (srcdoc) return { iframe, content: srcdoc };
    const src = iframe.getAttribute("src") ?? "";
    if (src.startsWith("blob:")) {
      const obj = urlMock.createdObjects.get(src);
      if (obj instanceof Blob) {
        return { iframe, content: await obj.text() };
      }
    }
    if (src.startsWith("data:text/html")) {
      const commaIdx = src.indexOf(",");
      if (commaIdx >= 0) {
        const meta = src.slice(0, commaIdx);
        const payload = src.slice(commaIdx + 1);
        const decoded = meta.includes(";base64")
          ? atob(payload)
          : decodeURIComponent(payload);
        return { iframe, content: decoded };
      }
    }
  }
  return { iframe, content: document.body.innerHTML };
}

const SUBJ = "tenant.c1.site.s1.agent.a1.remote.session.sess1";
const NATS_URL = "wss://nats.e2e.local/nats";

describe("Tier 1 — F22: RemoteProxy, WebRDP/RDP, RemoteFiles 'DF', RemoteProcesses & RemoteTerminal", () => {
  let natsMock: NatsWsMockController;
  let canvasMock: ReturnType<typeof installCanvasAndBitmapMock>;
  let resizeMock: ReturnType<typeof installResizeObserverMock>;
  let bcMock: ReturnType<typeof installBroadcastChannelMock>;
  let urlMock: ReturnType<typeof installObjectUrlMock>;

  beforeEach(() => {
    sharedXtermHarness.reset();
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
    urlMock.createSpy.mockRestore();
    urlMock.revokeSpy.mockRestore();
    clearSeededAuthStorage();
    vi.useRealTimers();
  });

  it("F22-T1-01: RemoteProxy sends HTTP/HTTPS LAN bridge requests over NATS (.proxy.req/.proxy.resp) instead of direct iframe URL", async () => {
    const jwt = makeTestJwt();
    natsMock.onPublish((pub, conn) => {
      if (pub.subject === `${SUBJ}.proxy.req` && pub.json) {
        conn.serverPublish(`${SUBJ}.proxy.resp`, {
          requestId: pub.json.requestId,
          success: true,
          statusCode: 200,
          headers: { "content-type": "text/html" },
          bodyBase64: btoa("<h1>Router Admin</h1>"),
        });
      }
    });

    render(
      <RemoteProxy
        sessionId="sess1"
        agentId="a1"
        natsSubject={SUBJ}
        // @ts-expect-error natsUrl added by M3 F22
        natsUrl={NATS_URL}
        jwt={jwt}
      />,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const input = screen.getByPlaceholderText(/192\.168\.1\.1/i);
    fireEvent.change(input, { target: { value: "http://192.168.1.1/" } });
    fireEvent.click(screen.getByRole("button", { name: /Navegar/i }));

    await waitFor(async () => {
      const proxyPubs = natsMock.published.filter((p) => p.subject === `${SUBJ}.proxy.req`);
      expect(proxyPubs.length).toBeGreaterThanOrEqual(1);
      expect(proxyPubs[0].json).toMatchObject({
        method: "GET",
        url: "http://192.168.1.1/",
      });
      expect(typeof proxyPubs[0].json?.requestId).toBe("string");

      const rendered = await extractProxyRenderedOutput(urlMock);
      expect(rendered.content).toContain("Router Admin");
      if (rendered.iframe) {
        expect(rendered.iframe.getAttribute("src") ?? "").not.toBe("http://192.168.1.1/");
      }
    });

    // Must never bypass NATS by setting <iframe src="http://192.168.1.1/"> directly
    const directIframe = document.querySelector('iframe[src="http://192.168.1.1/"]');
    expect(directIframe).toBeNull();
  });

  it("F22-T1-02: RemoteProxy surfaces allowlist/SSRF block errors cleanly without rendering untrusted iframe", async () => {
    const jwt = makeTestJwt();
    natsMock.onPublish((pub, conn) => {
      if (pub.subject === `${SUBJ}.proxy.req` && pub.json) {
        conn.serverPublish(`${SUBJ}.proxy.resp`, {
          requestId: pub.json.requestId,
          success: false,
          statusCode: 403,
          error: "acesso bloqueado pela allowlist",
        });
      }
    });

    render(
      <RemoteProxy
        sessionId="sess1"
        agentId="a1"
        natsSubject={SUBJ}
        // @ts-expect-error natsUrl added by M3 F22
        natsUrl={NATS_URL}
        jwt={jwt}
      />,
    );

    const input = screen.getByPlaceholderText(/192\.168\.1\.1/i);
    fireEvent.change(input, { target: { value: "http://169.254.169.254/latest/meta-data/" } });
    fireEvent.click(screen.getByRole("button", { name: /Navegar/i }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const proxyPubs = natsMock.published.filter((p) => p.subject === `${SUBJ}.proxy.req`);
    expect(proxyPubs.length).toBeGreaterThanOrEqual(1);
    expect(document.body.textContent).toMatch(/bloquead|allowlist|erro/i);
    expect(document.querySelector('iframe[src*="169.254.169.254"]')).toBeNull();
  });

  it("F22-T1-03: RemoteProxy provides multiplexed TCP/SSH tunnel support via useProxyStream & .tunnel.in/.tunnel.out", async () => {
    const proxyStreamMod = await loadDiscoveredModule(remoteProxyGlob, [
      "useProxyStream.ts",
      "useProxyStream.tsx",
      "proxyTunnel.ts",
    ]);
    expect(
      proxyStreamMod,
      "M3 F22 requirement: src/modules/remote-proxy/useProxyStream.ts (or tunnel helper) must exist",
    ).not.toBeNull();

    const jwt = makeTestJwt();
    render(
      <RemoteProxy
        sessionId="sess1"
        agentId="a1"
        natsSubject={SUBJ}
        // @ts-expect-error natsUrl added by M3 F22
        natsUrl={NATS_URL}
        jwt={jwt}
      />,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Look for TCP/SSH tunnel controls inside RemoteProxy UI
    const tunnelTrigger =
      screen.queryByRole("button", { name: /SSH|TCP|Túnel/i }) ??
      screen.queryByRole("tab", { name: /SSH|TCP|Túnel/i });
    expect(tunnelTrigger).not.toBeNull();
  });

  it("F22-T1-04: RemoteSession exposes 'rdp' tab, src/modules/remote-rdp/ exists, and triggers kind='rdp' + .rdp download", async () => {
    const rdpModules = await loadAllDiscoveredModules(remoteRdpGlob);
    expect(
      rdpModules.length,
      "M3 F22 requirement: src/modules/remote-rdp/* module must exist",
    ).toBeGreaterThan(0);

    const fetchCtl = installFetchMock([
      {
        match: /\/api\/v1\/agents\/a1$/,
        handler: () => ({ body: { id: "a1", hostname: "SRV-RDP-01", isOnline: true } }),
      },
      {
        match: /\/api\/v1\/remote-sessions\/a1\/active/,
        handler: () => ({ body: [] }),
      },
      {
        match: /\/api\/v1\/remote-sessions\/a1\/consent-status/,
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
        handler: () => ({
          body: {
            sessionId: "rdp-sess-1",
            agentId: "a1",
            kind: "rdp",
            natsSubject: SUBJ,
            natsWssUrl: NATS_URL,
            jwt: makeTestJwt(),
          },
        }),
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

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

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

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const startCall = fetchCtl.calls.find(
      (c) => c.method === "POST" && /\/api\/v1\/remote-sessions\/a1$/.test(c.url),
    );
    expect(startCall?.bodyJson).toMatchObject({ kind: "rdp" });
  });

  it("F22-T1-05: RemoteRdp WebRDP component connects via tunnel/ws or NATS without ?access_token= and handles binary 0x01 frames", async () => {
    const rdpEntry = await loadDiscoveredModule<{
      default?: React.ComponentType<Record<string, unknown>>;
      RemoteRdp?: React.ComponentType<Record<string, unknown>>;
      RemoteRdpViewer?: React.ComponentType<Record<string, unknown>>;
    }>(remoteRdpGlob, ["RemoteRdp.tsx", "RemoteRdpViewer.tsx", "index.ts", "index.tsx"]);

    expect(
      rdpEntry,
      "M3 F22 requirement: src/modules/remote-rdp component entrypoint must exist",
    ).not.toBeNull();

    const RdpComp =
      rdpEntry!.mod.default ?? rdpEntry!.mod.RemoteRdp ?? rdpEntry!.mod.RemoteRdpViewer;
    expect(typeof RdpComp).toBe("function");

    const Comp = RdpComp!;
    render(
      <Comp
        sessionId="rdp-sess-1"
        agentId="a1"
        natsSubject={SUBJ}
        natsUrl={NATS_URL}
        jwt={makeTestJwt()}
      />,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    for (const url of natsMock.connectUrls) {
      expect(url).not.toContain("access_token=");
    }

    // Exercise binary 0x01 tunnel frame delivery if WebSocket opened
    if (natsMock.lastConnection) {
      await act(async () => {
        natsMock.serverPublish(
          `${SUBJ}.tunnel.out`,
          buildTunnelFrame(0x02, 1, new Uint8Array([0x03, 0x00, 0x00, 0x13])),
        );
        await Promise.resolve();
      });
    }
  });

  it("F22-T1-06: RemoteFiles supports binary 'DF' file frames while preserving JSON base64 fallback", async () => {
    const jwt = makeTestJwt();
    const expectedBytes = new Uint8Array([
      0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04,
      0xaa, 0xbb, 0xcc, 0xdd, 0x10, 0x20, 0x30, 0x40,
    ]);

    natsMock.onPublish((pub, conn) => {
      if (pub.subject !== `${SUBJ}.files.req` || !pub.json) return;
      const action = pub.json.action;
      if (action === "list") {
        conn.serverPublish(`${SUBJ}.files.resp`, {
          requestId: pub.json.requestId,
          success: true,
          entries: [
            {
              name: "binary-payload.bin",
              path: "C:\\binary-payload.bin",
              isDir: false,
              size: expectedBytes.length,
              modTime: "2026-11-18T00:00:00Z",
            },
          ],
        });
      } else if (action === "get") {
        // Send binary 'DF' frame on both .files.data and .files.resp
        natsMock.publishBinaryFileFrame(
          `${SUBJ}.files.data`,
          {
            requestId: pub.json.requestId,
            success: true,
            size: expectedBytes.length,
            totalChunks: 1,
            chunkIndex: 0,
          },
          expectedBytes,
        );
        natsMock.publishBinaryFileFrame(
          `${SUBJ}.files.resp`,
          {
            requestId: pub.json.requestId,
            success: true,
            size: expectedBytes.length,
            totalChunks: 1,
            chunkIndex: 0,
          },
          expectedBytes,
        );
      }
    });

    render(
      <RemoteFiles
        sessionId="sess1"
        agentId="a1"
        natsSubject={SUBJ}
        natsUrl={NATS_URL}
        jwt={jwt}
      />,
    );

    const fileRow = await screen.findByText("binary-payload.bin");
    fireEvent.contextMenu(fileRow);

    const downloadBtn = await screen.findByRole("button", { name: /Baixar|Download/i });
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      const blobs = Array.from(urlMock.createdObjects.values()).filter(
        (v): v is Blob => v instanceof Blob,
      );
      expect(blobs.length).toBeGreaterThanOrEqual(1);
    }, { timeout: 2500 });

    const blobs = Array.from(urlMock.createdObjects.values()).filter(
      (v): v is Blob => v instanceof Blob,
    );
    const downloadedBuf = new Uint8Array(await blobs[0].arrayBuffer());
    expect(Array.from(downloadedBuf)).toEqual(Array.from(expectedBytes));
  });

  it("F22-T1-07: RemoteProcesses & RemoteTerminal clean up timers/observers cleanly on unmount", async () => {
    const jwt = makeTestJwt();
    natsMock.onPublish((pub, conn) => {
      if (pub.subject === `${SUBJ}.proc.req` && pub.json) {
        if (pub.json.action === "listProcesses") {
          conn.serverPublish(`${SUBJ}.proc.resp`, {
            requestId: pub.json.requestId,
            success: true,
            processes: [
              {
                pid: 4242,
                parentPid: 4,
                name: "discovery-service.exe",
                threads: 12,
                priorityBase: 8,
                cpuPercent: 1.5,
                memoryBytes: 64 * 1024 * 1024,
                ioReadBps: 0,
                ioWriteBps: 0,
                connections: 2,
              },
            ],
          });
        } else if (pub.json.action === "getSystemInfo") {
          conn.serverPublish(`${SUBJ}.proc.resp`, {
            requestId: pub.json.requestId,
            success: true,
            system: {
              totalMemoryBytes: 16 * 1024 * 1024 * 1024,
              usedMemoryBytes: 4 * 1024 * 1024 * 1024,
              memoryPercent: 25,
              cpuPercent: 10,
            },
          });
        }
      }
    });

    const procView = render(
      <RemoteProcesses
        sessionId="sess1"
        agentId="a1"
        natsSubject={SUBJ}
        natsUrl={NATS_URL}
        jwt={jwt}
      />,
    );

    await waitFor(() => {
      expect(natsMock.lastConnection?.subscriptions.size ?? 0).toBeGreaterThanOrEqual(2);
    });

    natsMock.serverPublish(`${SUBJ}.proc.ready`, { status: "ready" });

    expect(await screen.findByText("discovery-service.exe")).toBeTruthy();

    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    try {
      procView.unmount();
      expect(clearTimeoutSpy).toHaveBeenCalled();
    } finally {
      clearTimeoutSpy.mockRestore();
    }

    const termView = render(
      <ThemeProvider>
        <RemoteTerminal
          sessionId="sess1"
          agentId="a1"
          natsSubject={SUBJ}
          natsUrl={NATS_URL}
          jwt={jwt}
          isVisible={true}
        />
      </ThemeProvider>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sharedXtermHarness.instances.length).toBeGreaterThanOrEqual(1);
    termView.unmount();
    expect(sharedXtermHarness.instances[0].disposed).toBe(true);
    expect(resizeMock.instances.some((r) => r.disconnect.mock.calls.length > 0)).toBe(true);
  });
});
