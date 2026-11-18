import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RemoteFiles from "@/modules/remote-files/RemoteFiles";
import RemoteProxy from "@/modules/remote-proxy/RemoteProxy";
import { chunkUtf8, useTerminalStream } from "@/modules/remote-terminal/useTerminalStream";
import {
  installCanvasAndBitmapMock,
  installFetchMock,
  installMatchMediaMock,
  installObjectUrlMock,
  installResizeObserverMock,
} from "./helpers/browserMocks";
import { makeTestJwt } from "./helpers/jwtFactory";
import {
  extractReactComponentExport,
  loadDiscoveredModule,
  remoteProxyGlob,
  remoteRdpGlob,
} from "./helpers/moduleProbe";
import {
  buildTunnelFrame,
  installNatsWsMock,
  type NatsWsMockController,
} from "./helpers/natsWsMock";

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

const SUBJ = "tenant.c1.site.s1.agent.a1.remote.session.sess2";
const NATS_URL = "wss://nats.e2e.local/nats";

describe("Tier 2 — F22: Boundary & Corner Cases (Proxy, Tunnel, RDP, Binary Files, Terminal UTF-8)", () => {
  let natsMock: NatsWsMockController;
  let canvasMock: ReturnType<typeof installCanvasAndBitmapMock>;
  let resizeMock: ReturnType<typeof installResizeObserverMock>;
  let urlMock: ReturnType<typeof installObjectUrlMock>;

  beforeEach(() => {
    installMatchMediaMock(false);
    natsMock = installNatsWsMock();
    canvasMock = installCanvasAndBitmapMock();
    resizeMock = installResizeObserverMock();
    urlMock = installObjectUrlMock();
  });

  afterEach(() => {
    natsMock.restore();
    canvasMock.restore();
    resizeMock.restore();
    urlMock.createSpy.mockRestore();
    urlMock.revokeSpy.mockRestore();
    vi.useRealTimers();
  });

  it("F22-T2-01: RemoteProxy ignores empty/whitespace URLs and ignores stale mismatched requestId responses", async () => {
    const jwt = makeTestJwt();
    render(
      <RemoteProxy
        sessionId="sess2"
        agentId="a1"
        natsSubject={SUBJ}
        // @ts-expect-error natsUrl added by M3 F22
        natsUrl={NATS_URL}
        jwt={jwt}
      />,
    );

    const input = screen.getByPlaceholderText(/192\.168\.1\.1/i);
    const goBtn = screen.getByRole("button", { name: /Navegar/i });

    // Empty and whitespace submissions must not publish
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(goBtn);
    await act(async () => {
      await Promise.resolve();
    });
    expect(natsMock.published.filter((p) => p.subject === `${SUBJ}.proxy.req`)).toHaveLength(0);

    // Valid submission -> inject stale requestId first, then real requestId
    let activeReqId = "";
    natsMock.onPublish((pub, conn) => {
      if (pub.subject === `${SUBJ}.proxy.req` && pub.json) {
        activeReqId = String(pub.json.requestId ?? "");
        conn.serverPublish(`${SUBJ}.proxy.resp`, {
          requestId: "stale-req-999",
          success: true,
          statusCode: 200,
          bodyBase64: btoa("<h1>STALE</h1>"),
        });
        conn.serverPublish(`${SUBJ}.proxy.resp`, {
          requestId: activeReqId,
          success: true,
          statusCode: 200,
          headers: { "content-type": "text/html" },
          bodyBase64: btoa("<h1>FRESH</h1>"),
        });
      }
    });

    fireEvent.change(input, { target: { value: "http://192.168.1.1/" } });
    fireEvent.click(goBtn);

    await waitFor(async () => {
      expect(natsMock.published.some((p) => p.subject === `${SUBJ}.proxy.req`)).toBe(true);
      expect(activeReqId.length).toBeGreaterThan(0);

      const rendered = await extractProxyRenderedOutput(urlMock);
      expect(rendered.content).toContain("FRESH");
      expect(rendered.content).not.toContain("STALE");
      expect(document.body.innerHTML).not.toContain("STALE");
    });
  });

  it("F22-T2-02: RemoteProxy transitions cleanly to error state on HTTP 502 or invalid proxy response", async () => {
    const jwt = makeTestJwt();
    natsMock.onPublish((pub, conn) => {
      if (pub.subject === `${SUBJ}.proxy.req` && pub.json) {
        conn.serverPublish(`${SUBJ}.proxy.resp`, {
          requestId: pub.json.requestId,
          success: false,
          statusCode: 502,
          error: "Bad Gateway: connection refused",
        });
      }
    });

    render(
      <RemoteProxy
        sessionId="sess2"
        agentId="a1"
        natsSubject={SUBJ}
        // @ts-expect-error natsUrl added by M3 F22
        natsUrl={NATS_URL}
        jwt={jwt}
      />,
    );

    const input = screen.getByPlaceholderText(/192\.168\.1\.1/i);
    fireEvent.change(input, { target: { value: "http://192.168.1.99:8080/" } });
    fireEvent.click(screen.getByRole("button", { name: /Navegar/i }));

    await waitFor(() => {
      expect(natsMock.published.some((p) => p.subject === `${SUBJ}.proxy.req`)).toBe(true);
    });
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/502|Bad Gateway|Erro/i);
    });
  });

  it("F22-T2-03: Proxy/Tunnel module handles concurrent streamId multiplexing, zero-length DATA, and truncated binary frames", async () => {
    const proxyMod = await loadDiscoveredModule<Record<string, unknown>>(
      remoteProxyGlob,
      ["useProxyStream.ts", "useProxyStream.tsx", "proxyTunnel.ts", "tunnelProtocol.ts"],
      true,
    );
    expect(
      proxyMod,
      "M3 F22 requirement: remote-proxy tunnel module (useProxyStream) must exist",
    ).not.toBeNull();

    const hookFn = (proxyMod!.mod.useProxyStream ?? proxyMod!.mod.default) as
      | ((opts: { natsSubject: string; natsUrl: string; jwt: string }) => Record<string, unknown>)
      | undefined;
    expect(typeof hookFn).toBe("function");

    const jwt = makeTestJwt();
    const { result } = renderHook(() =>
      hookFn!({ natsSubject: SUBJ, natsUrl: NATS_URL, jwt }),
    );
    expect(result.current).toBeTruthy();
    expect(typeof result.current).toBe("object");

    const stream1Payloads: Uint8Array[] = [];
    const stream2Payloads: Uint8Array[] = [];

    const hookObj = result.current as Record<string, unknown>;
    const subscribeDataFn =
      (hookObj.onTunnelData as ((cb: (streamId: number, data: Uint8Array) => void) => () => void) | undefined) ??
      (hookObj.onStreamData as ((cb: (streamId: number, data: Uint8Array) => void) => () => void) | undefined) ??
      (hookObj.onTunnelFrame as ((cb: (frame: { streamId: number; payload?: Uint8Array; data?: Uint8Array }) => void) => () => void) | undefined);

    if (typeof subscribeDataFn === "function") {
      subscribeDataFn((a: unknown, b?: unknown) => {
        if (typeof a === "number" && b instanceof Uint8Array) {
          if (a === 1) stream1Payloads.push(b);
          if (a === 2) stream2Payloads.push(b);
        } else if (a && typeof a === "object") {
          const rec = a as { streamId?: number; payload?: Uint8Array; data?: Uint8Array };
          const bytes = rec.payload ?? rec.data;
          if (bytes instanceof Uint8Array) {
            if (rec.streamId === 1) stream1Payloads.push(bytes);
            if (rec.streamId === 2) stream2Payloads.push(bytes);
          }
        }
      });
    }

    const openFn =
      (hookObj.openTunnel as ((...args: unknown[]) => unknown) | undefined) ??
      (hookObj.connectTunnel as ((...args: unknown[]) => unknown) | undefined) ??
      (hookObj.startTunnel as ((...args: unknown[]) => unknown) | undefined) ??
      (hookObj.openStream as ((...args: unknown[]) => unknown) | undefined);

    if (typeof openFn === "function") {
      await act(async () => {
        await openFn({ host: "192.168.1.10", port: 22, targetHost: "192.168.1.10", targetPort: 22, streamId: 1 });
        await openFn({ host: "192.168.1.11", port: 22, targetHost: "192.168.1.11", targetPort: 22, streamId: 2 });
      });
    }

    await waitFor(() => {
      expect(natsMock.connections.length).toBeGreaterThanOrEqual(1);
      const conn = natsMock.lastConnection!;
      const subs = Array.from(conn.subscriptions.values());
      expect(subs.some((s) => s.includes(".tunnel.out"))).toBe(true);
    });

    const frameS1Alpha = buildTunnelFrame(0x02, 1, new TextEncoder().encode("stream-1-alpha"));
    const frameS2Beta = buildTunnelFrame(0x02, 2, new TextEncoder().encode("stream-2-beta"));
    const emptyData = buildTunnelFrame(0x02, 1, new Uint8Array(0));
    const truncated = new Uint8Array([0x01, 0x02, 0x00]); // < 6 bytes
    const frameS1Omega = buildTunnelFrame(0x02, 1, new TextEncoder().encode("stream-1-omega"));

    // Also test exported binary tunnel frame parser directly if exposed
    const parserFn =
      (proxyMod!.mod.decodeTunnelFrame as ((raw: Uint8Array) => { streamId: number; payload: Uint8Array } | null) | undefined) ??
      (proxyMod!.mod.parseTunnelFrame as ((raw: Uint8Array) => { streamId: number; payload: Uint8Array } | null) | undefined);
    if (typeof parserFn === "function") {
      expect(parserFn(frameS1Alpha)?.streamId).toBe(1);
      expect(parserFn(frameS2Beta)?.streamId).toBe(2);
      expect(parserFn(emptyData)?.payload.length).toBe(0);
      expect(() => parserFn(truncated)).not.toThrow();
      expect(parserFn(truncated)).toBeNull();
    }

    // Deliver concurrent frames + zero-length DATA + truncated <6B frame + follow-up frame over NATS
    await act(async () => {
      natsMock.serverPublish(`${SUBJ}.tunnel.out`, frameS1Alpha);
      natsMock.serverPublish(`${SUBJ}.tunnel.out`, frameS2Beta);
      natsMock.serverPublish(`${SUBJ}.tunnel.out`, emptyData);
      natsMock.serverPublish(`${SUBJ}.tunnel.out`, truncated);
      natsMock.serverPublish(`${SUBJ}.tunnel.out`, frameS1Omega);
      await Promise.resolve();
      await Promise.resolve();
    });

    if (typeof subscribeDataFn === "function") {
      const dec = new TextDecoder();
      const s1Text = stream1Payloads.map((b) => dec.decode(b)).join("");
      const s2Text = stream2Payloads.map((b) => dec.decode(b)).join("");
      expect(s1Text).toContain("stream-1-alpha");
      expect(s1Text).toContain("stream-1-omega");
      expect(s1Text).not.toContain("stream-2-beta");
      expect(s2Text).toContain("stream-2-beta");
      expect(s2Text).not.toContain("stream-1-alpha");
    }
  });

  it("F22-T2-04: RemoteRdp handles TermService disabled preflight failure and missing sessionId guard", async () => {
    const rdpEntry = await loadDiscoveredModule<{
      default?: React.ComponentType<Record<string, unknown>>;
      RemoteRdp?: React.ComponentType<Record<string, unknown>>;
      RemoteRdpViewer?: React.ComponentType<Record<string, unknown>>;
    }>(remoteRdpGlob, ["RemoteRdp.tsx", "RemoteRdpViewer.tsx", "RdpViewer.tsx", "WebRdp.tsx", "index.ts", "index.tsx"], true);

    expect(
      rdpEntry,
      "M3 F22 requirement: src/modules/remote-rdp component must exist",
    ).not.toBeNull();

    const Comp = extractReactComponentExport(rdpEntry!.mod as Record<string, unknown>, [
      "default",
      "RemoteRdp",
      "RemoteRdpViewer",
      "RdpViewer",
      "WebRdp",
    ])! as React.ComponentType<Record<string, unknown>>;
    expect(typeof Comp).toBe("function");

    // 1. Missing sessionId/jwt guard must not open WebSocket
    const emptyView = render(
      <Comp sessionId="" agentId="a1" natsSubject={SUBJ} natsUrl={NATS_URL} jwt="" />,
    );
    expect(natsMock.connections).toHaveLength(0);
    emptyView.unmount();

    // 2. Valid sessionId/jwt receives TermService disabled preflight failure -> surfaces actionable error
    installFetchMock([
      {
        match: /\/preflight/,
        handler: () => ({
          status: 200,
          body: { rdpStatus: "disabled", error: "TermService disabled" },
        }),
      },
      { match: /\/api\/v1\//, handler: () => ({ body: {} }) },
    ]);

    render(
      <Comp
        sessionId="rdp-sess-1"
        agentId="a1"
        natsSubject={SUBJ}
        natsUrl={NATS_URL}
        jwt={makeTestJwt()}
      />,
    );

    const connectBtn = screen.queryByRole("button", { name: /Conectar|Iniciar|WebRDP/i });
    if (connectBtn) {
      fireEvent.click(connectBtn);
    }

    await waitFor(() => {
      expect(natsMock.connections.length).toBeGreaterThanOrEqual(1);
    });

    const conn = natsMock.lastConnection!;
    const preflightErr = {
      streamId: 1,
      op: "preflight",
      rdpStatus: "disabled",
      error: "TermService disabled: Área de Trabalho Remota desativada no agente",
    };

    await act(async () => {
      natsMock.serverPublish(`${SUBJ}.tunnel.out`, preflightErr);
      if (conn.subscriptions.size === 0) {
        conn.serverPublishRawText(JSON.stringify(preflightErr));
      }
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(document.body.textContent).toMatch(
        /TermService|desativad|disabled|preflight|indisponível/i,
      );
    });
  });

  it("F22-T2-05: RemoteFiles handles 0-byte binary 'DF' download and mid-upload cancel cleanup", async () => {
    const jwt = makeTestJwt();
    const pendingChunk1Resolvers: Array<() => void> = [];

    natsMock.onPublish((pub, conn) => {
      if (pub.subject !== `${SUBJ}.files.req` || !pub.json) return;
      if (pub.json.action === "list") {
        conn.serverPublish(`${SUBJ}.files.resp`, {
          requestId: pub.json.requestId,
          success: true,
          entries: [
            {
              name: "empty.txt",
              path: "C:\\empty.txt",
              isDir: false,
              size: 0,
              modTime: "2026-11-18T00:00:00Z",
            },
          ],
        });
      } else if (pub.json.action === "get") {
        natsMock.publishBinaryFileFrame(
          `${SUBJ}.files.data`,
          {
            requestId: pub.json.requestId,
            success: true,
            size: 0,
            totalChunks: 1,
            chunkIndex: 0,
          },
          new Uint8Array(0),
        );
        natsMock.publishBinaryFileFrame(
          `${SUBJ}.files.resp`,
          {
            requestId: pub.json.requestId,
            success: true,
            size: 0,
            totalChunks: 1,
            chunkIndex: 0,
          },
          new Uint8Array(0),
        );
      } else if (pub.json.action === "put") {
        const reqId = pub.json.requestId;
        if (pub.json.chunkIndex === 0) {
          conn.serverPublish(`${SUBJ}.files.resp`, {
            requestId: reqId,
            success: true,
          });
        } else {
          // Hold chunk 1 until test clicks Cancel so mid-flight cancellation is deterministic
          pendingChunk1Resolvers.push(() => {
            conn.serverPublish(`${SUBJ}.files.resp`, {
              requestId: reqId,
              success: true,
            });
          });
        }
      } else if (pub.json.action === "delete") {
        conn.serverPublish(`${SUBJ}.files.resp`, {
          requestId: pub.json.requestId,
          success: true,
        });
      }
    });

    render(
      <RemoteFiles
        sessionId="sess2"
        agentId="a1"
        natsSubject={SUBJ}
        natsUrl={NATS_URL}
        jwt={jwt}
      />,
    );

    // 1. 0-byte binary 'DF' download
    const row = await screen.findByText("empty.txt");
    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByRole("button", { name: /Baixar|Download/i }));

    await waitFor(() => {
      const blobs = Array.from(urlMock.createdObjects.values()).filter(
        (v): v is Blob => v instanceof Blob,
      );
      expect(blobs.length).toBeGreaterThanOrEqual(1);
    });

    const blobs = Array.from(urlMock.createdObjects.values()).filter(
      (v): v is Blob => v instanceof Blob,
    );
    expect(blobs[0].size).toBe(0);

    // 2. Multi-chunk upload (3 chunks) canceled mid-flight after chunk 0 -> stops remaining chunks and publishes delete cleanup
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();
    const multiChunkFile = new File(
      [new Uint8Array(3 * 256 * 1024)],
      "multi-chunk.bin",
      { type: "application/octet-stream" },
    );
    fireEvent.change(fileInput, { target: { files: [multiChunkFile] } });

    const cancelUploadBtn = await screen.findByTitle(/Cancelar upload/i);
    await waitFor(() => {
      expect(pendingChunk1Resolvers.length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(cancelUploadBtn);

    // Unblock chunk 1 response so loop advances to chunk 2 check and triggers delete cleanup
    await act(async () => {
      for (const resolve of pendingChunk1Resolvers) resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      const deleteCleanup = natsMock.published.find(
        (p) =>
          p.subject === `${SUBJ}.files.req` &&
          p.json?.action === "delete" &&
          p.json?.path === "C:\\multi-chunk.bin",
      );
      expect(deleteCleanup).toBeDefined();
    });

    const putChunks = natsMock.published
      .filter((p) => p.subject === `${SUBJ}.files.req` && p.json?.action === "put")
      .map((p) => p.json?.chunkIndex);
    expect(putChunks).not.toContain(2);
  });

  it("F22-T2-06: RemoteTerminal stream decodes split multi-byte UTF-8 runes without U+FFFD and chunks >16KB pastes cleanly", async () => {
    const jwt = makeTestJwt();
    const { result } = renderHook(() =>
      useTerminalStream({
        natsSubject: SUBJ,
        natsUrl: NATS_URL,
        jwt,
      }),
    );

    const chunks: string[] = [];
    result.current.onOutput((text) => chunks.push(text));

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // Split 4-byte rocket emoji across two .term.out frames
    const emojiBytes = new TextEncoder().encode("🚀OK");
    const part1 = emojiBytes.subarray(0, 2);
    const part2 = emojiBytes.subarray(2);
    const toB64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));

    const subj = SUBJ.replace(/-/g, "");
    await act(async () => {
      natsMock.serverPublish(`${subj}.term.out`, { data: toB64(part1), seq: 1 });
      natsMock.serverPublish(`${subj}.term.out`, { data: toB64(part2), seq: 2 });
      await Promise.resolve();
      await Promise.resolve();
    });

    const joined = chunks.join("");
    expect(joined).toBe("🚀OK");
    expect(joined).not.toContain("\uFFFD");

    // > 16 KB paste boundary with multi-byte characters
    const big = "é".repeat(12_000); // 24 KB UTF-8
    const splitParts = chunkUtf8(big, 16 * 1024);
    expect(splitParts.length).toBeGreaterThan(1);
    for (const p of splitParts) {
      expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(16 * 1024);
      expect(p).not.toContain("\uFFFD");
    }
    expect(splitParts.join("")).toBe(big);
  });
});
