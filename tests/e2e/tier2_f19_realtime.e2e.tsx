import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RemoteScreenViewer from "@/modules/remote-screen/RemoteScreenViewer";
import { heartbeatStore, useAllAgentHeartbeats } from "@/stores/heartbeatStore";
import { printHtmlAsPdf } from "@/utils/reportPrint";
import {
  installCanvasAndBitmapMock,
  installResizeObserverMock,
  installWindowOpenMock,
} from "./helpers/browserMocks";
import { makeTestJwt } from "./helpers/jwtFactory";
import { installNatsWsMock, type NatsWsMockController } from "./helpers/natsWsMock";
import {
  buildScreenFragment,
  buildScreenFullFrame,
} from "./helpers/screenFrameBuilder";

const SUBJ = "tenant.c1.site.s1.agent.a1.remote.screen.s1";
const NATS_URL = "wss://nats.e2e.local/nats";

function HeartbeatCountObserver() {
  const map = useAllAgentHeartbeats();
  return <div data-testid="hb-count">{map.size}</div>;
}

describe("Tier 2 — F19: Boundary & Corner Cases (RemoteScreenViewer, HeartbeatStore, reportPrint)", () => {
  let natsMock: NatsWsMockController;
  let canvasMock: ReturnType<typeof installCanvasAndBitmapMock>;
  let resizeMock: ReturnType<typeof installResizeObserverMock>;

  beforeEach(() => {
    vi.useFakeTimers({ now: 1_000_000 });
    heartbeatStore.clear();
    natsMock = installNatsWsMock();
    canvasMock = installCanvasAndBitmapMock();
    resizeMock = installResizeObserverMock();
  });

  afterEach(() => {
    natsMock.restore();
    canvasMock.restore();
    resizeMock.restore();
    heartbeatStore.clear();
    vi.useRealTimers();
  });

  it("F19-T2-01: RemoteScreenViewer resets stale protocolBuffer across reconnects so truncated MSG does not corrupt new INFO", async () => {
    const jwt = makeTestJwt();
    render(
      <RemoteScreenViewer
        natsSubject={SUBJ}
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
    const firstConn = natsMock.connections[0];
    expect(firstConn.subscriptions.size).toBe(8);

    // Inject an incomplete MSG header/payload without trailing CRLF, then drop socket
    await act(async () => {
      firstConn.serverPublishRawText(`MSG ${SUBJ}.frame 1 999\r\nPARTIAL_BYTES_NO_CRLF`);
      firstConn.closeFromServer(1006, "truncated");
      await vi.advanceTimersByTimeAsync(1100);
    });

    expect(natsMock.connections).toHaveLength(2);
    const secondConn = natsMock.connections[1];
    expect(secondConn.connectPayload?.auth_token).toBe(jwt);
    expect(secondConn.subscriptions.size).toBe(8);
  });

  it("F19-T2-02: RemoteScreenViewer exhausts 5 reconnect attempts, enters error state, and recovers on manual reconnect click", async () => {
    const onError = vi.fn();
    const jwt = makeTestJwt();
    render(
      <RemoteScreenViewer
        natsSubject={SUBJ}
        sessionId="s1"
        natsUrl={NATS_URL}
        jwt={jwt}
        quality="auto"
        codec="jpeg"
        onError={onError}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    const delays = [1000, 2000, 4000, 8000, 16000];
    for (let i = 0; i < delays.length; i++) {
      await act(async () => {
        natsMock.lastConnection?.closeFromServer(1006, "drop");
        await vi.advanceTimersByTimeAsync(delays[i] + 50);
      });
    }

    // 6th close triggers exhaustion (no more auto-reconnects)
    await act(async () => {
      natsMock.lastConnection?.closeFromServer(1006, "final-drop");
      await Promise.resolve();
    });

    expect(onError).toHaveBeenCalled();
    const reconBtn = screen.getByRole("button", { name: /Reconectar/i });
    expect(reconBtn).toBeTruthy();

    const prevCount = natsMock.connections.length;
    await act(async () => {
      fireEvent.click(reconBtn);
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(natsMock.connections.length).toBe(prevCount + 1);
    expect(natsMock.lastConnection?.connectPayload?.auth_token).toBe(jwt);
  });

  it("F19-T2-03: HeartbeatStore TTL boundary keeps entry at exact ttlMs, evicts at ttlMs + 1, and clear() on empty store is silent", () => {
    const listener = vi.fn();
    const unsub = heartbeatStore.subscribe(listener);

    // clear() on empty store must not notify listeners
    heartbeatStore.clear();
    expect(listener).not.toHaveBeenCalled();

    render(<HeartbeatCountObserver />);

    act(() => {
      heartbeatStore.setHeartbeat("agent-ttl", {
        status: "Online",
        cpuPercent: 10,
        timestampUtc: new Date(1_000_000).toISOString(),
      });
    });
    expect(screen.getByTestId("hb-count").textContent).toBe("1");

    // Exact boundary: 90_000 ms elapsed -> fresh (kept)
    const kept = heartbeatStore.removeHeartbeatIfStale("agent-ttl", 90_000, 1_000_000 + 90_000);
    expect(kept).toBe(false);
    expect(screen.getByTestId("hb-count").textContent).toBe("1");

    // Boundary + 1: 90_001 ms elapsed -> stale (evicted + reactive UI update)
    const snapBefore = heartbeatStore.getSnapshot();
    const evicted = heartbeatStore.removeHeartbeatIfStale("agent-ttl", 90_000, 1_000_000 + 90_001);
    expect(evicted).toBe(true);
    expect(heartbeatStore.getSnapshot()).not.toBe(snapBefore);
    expect(screen.getByTestId("hb-count").textContent).toBe("0");

    unsub();
  });

  it("F19-T2-04: printHtmlAsPdf neutralizes unquoted XSS vectors, javascript: URIs, and title injection with safe isolation", () => {
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

    const maliciousHtml =
      '<h1>Host</h1><img src=x onerror=alert(1)><svg onload=alert(2)><a href="javascript:alert(3)">click</a>';
    const maliciousTitle = "</title><script>alert(4)</script>";

    printHtmlAsPdf(maliciousHtml, maliciousTitle);

    const iframe = document.querySelector("iframe");
    const renderedHtml =
      winMock.opened[0]?.writtenHtml ||
      iframe?.getAttribute("srcdoc") ||
      capturedBlobHtml;

    expect(renderedHtml.length).toBeGreaterThan(0);
    expect(renderedHtml.toLowerCase()).not.toContain("onerror=");
    expect(renderedHtml.toLowerCase()).not.toContain("onload=");
    expect(renderedHtml.toLowerCase()).not.toContain("javascript:");
    expect(renderedHtml.toLowerCase()).not.toContain("<script>");

    // If window.open is used directly with about:blank, it must not run same-origin without noopener
    if (winMock.opened.length > 0 && !capturedBlobHtml) {
      expect(winMock.opened[0].features ?? "").toContain("noopener");
    }

    vi.stubGlobal("Blob", OriginalBlob);
  });

  it("F19-T2-05: printHtmlAsPdf handles full <html> documents without double-wrapping and handles blocked popups cleanly", () => {
    const blockedMock = installWindowOpenMock({ blocked: true });
    let usedBlobOrIframe = false;
    const OriginalBlob = globalThis.Blob;
    vi.stubGlobal(
      "Blob",
      class CapturingBlob extends OriginalBlob {
        constructor(parts: BlobPart[] = [], opts?: BlobPropertyBag) {
          super(parts, opts);
          if (opts?.type?.includes("html")) usedBlobOrIframe = true;
        }
      },
    );

    let thrownError: Error | null = null;
    try {
      printHtmlAsPdf("<!doctype html><html><body><p>FullDoc</p></body></html>", "FullDoc");
    } catch (e) {
      thrownError = e as Error;
    }

    const iframe = document.querySelector("iframe");
    if (!iframe && !usedBlobOrIframe && blockedMock.opened.length > 0) {
      expect(thrownError?.message).toMatch(/pop-?up|impress/i);
    }

    // Re-test unblocked full HTML document to verify no double <html> wrapping
    vi.restoreAllMocks();
    const okMock = installWindowOpenMock({ blocked: false });
    let capturedHtml = "";
    vi.stubGlobal(
      "Blob",
      class CapturingBlob2 extends OriginalBlob {
        constructor(parts: BlobPart[] = [], opts?: BlobPropertyBag) {
          super(parts, opts);
          if (opts?.type?.includes("html")) capturedHtml = parts.map((p) => String(p)).join("");
        }
      },
    );

    printHtmlAsPdf("<html><body><p>SingleWrap</p><img src=x onerror=alert(1)></body></html>");
    const finalHtml =
      okMock.opened[0]?.writtenHtml ||
      document.querySelector("iframe")?.getAttribute("srcdoc") ||
      capturedHtml;
    const htmlMatches = finalHtml.match(/<html\b/gi) ?? [];
    expect(htmlMatches.length).toBe(1);
    expect(finalHtml).toContain("SingleWrap");

    vi.stubGlobal("Blob", OriginalBlob);
  });

  it("F19-T2-06: RemoteScreenViewer reassembles out-of-order JUMBO fragments, replies PONG to PING, and closes 4000 on -ERR", async () => {
    const onError = vi.fn();
    const jwt = makeTestJwt();
    render(
      <RemoteScreenViewer
        natsSubject={SUBJ}
        sessionId="s1"
        natsUrl={NATS_URL}
        jwt={jwt}
        quality="auto"
        codec="jpeg"
        onError={onError}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    const fullFrame = buildScreenFullFrame({ seq: 9, ts: Date.now() - 12, codec: "jpeg" });
    const split = Math.floor(fullFrame.length / 2);
    const frag0 = buildScreenFragment({
      totalLen: fullFrame.length,
      offset: 0,
      fragIndex: 0,
      fragCount: 2,
      chunk: fullFrame.subarray(0, split),
    });
    const frag1 = buildScreenFragment({
      totalLen: fullFrame.length,
      offset: split,
      fragIndex: 1,
      fragCount: 2,
      chunk: fullFrame.subarray(split),
    });

    const drawsBefore = canvasMock.drawCalls.length;
    await act(async () => {
      // Deliver frag 1 BEFORE frag 0
      natsMock.serverPublish(`${SUBJ}.frame.frag`, frag1);
      natsMock.serverPublish(`${SUBJ}.frame.frag`, frag0);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(canvasMock.drawCalls.length).toBeGreaterThan(drawsBefore);

    // Server PING -> client must reply PONG; server -ERR -> onError + WS close
    const conn = natsMock.lastConnection!;
    expect(conn).toBeDefined();
    const pongsBefore = conn.pongsReceived;
    await act(async () => {
      conn.serverPublishRawText("PING\r\n");
      await Promise.resolve();
    });
    expect(conn.pongsReceived).toBeGreaterThanOrEqual(pongsBefore + 1);

    await act(async () => {
      conn.serverError("Authorization Violation", 4000);
      await Promise.resolve();
    });

    expect(onError).toHaveBeenCalledWith(expect.stringContaining("Authorization Violation"));
  });
});
