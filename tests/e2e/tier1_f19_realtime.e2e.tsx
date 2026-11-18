import { act, render, screen } from "@testing-library/react";
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
  buildScreenFullFrame,
  buildScreenTileFrame,
} from "./helpers/screenFrameBuilder";

const SUBJ = "tenant.c1.site.s1.agent.a1.remote.screen.s1";
const NATS_URL = "wss://nats.e2e.local/nats";

function HeartbeatListObserver() {
  const map = useAllAgentHeartbeats();
  return (
    <div data-testid="hb-observer" data-size={map.size}>
      {Array.from(map.values()).map((hb) => (
        <span key={hb.agentId} data-testid={`hb-${hb.agentId}`}>
          {hb.agentId}:{hb.cpuPercent ?? "none"}
        </span>
      ))}
    </div>
  );
}

describe("Tier 1 — F19: RemoteScreenViewer, HeartbeatStore & reportPrint", () => {
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

  it("F19-T1-01: RemoteScreenViewer executes NATS WS handshake, subscribes to all 8 subjects, and requests initial keyframe", async () => {
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
      await vi.advanceTimersByTimeAsync(20);
    });

    const conn = natsMock.lastConnection;
    expect(conn).toBeDefined();
    expect(conn?.connectPayload?.auth_token).toBe(jwt);

    const subscribedSubjects = Array.from(conn?.subscriptions.values() ?? []);
    expect(subscribedSubjects).toEqual(
      expect.arrayContaining([
        `${SUBJ}.frame`,
        `${SUBJ}.frame.frag`,
        `${SUBJ}.cursor`,
        `${SUBJ}.cursor.img`,
        `${SUBJ}.monitors`,
        `${SUBJ}.event`,
        `${SUBJ}.clipboard`,
        `${SUBJ}.control`,
      ]),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });

    const keyframePub = natsMock.published.find(
      (p) => p.subject === `${SUBJ}.control` && p.json?.action === "keyframe",
    );
    expect(keyframePub).toBeDefined();
  });

  it("F19-T1-02: RemoteScreenViewer auto-reconnect resets auth state, re-subscribes all channels, and renders new frames", async () => {
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
    expect(natsMock.connections).toHaveLength(1);
    const firstConn = natsMock.connections[0];
    expect(firstConn.subscriptions.size).toBe(8);

    // Drop the initial WebSocket abnormally (1006)
    await act(async () => {
      firstConn.closeFromServer(1006, "network drop");
      await vi.advanceTimersByTimeAsync(1100);
    });

    expect(natsMock.connections).toHaveLength(2);
    const secondConn = natsMock.connections[1];
    expect(secondConn.connectPayload?.auth_token).toBe(jwt);
    expect(secondConn.subscriptions.size).toBe(8);

    const drawsBefore = canvasMock.drawCalls.length;
    await act(async () => {
      secondConn.serverPublish(
        `${SUBJ}.frame`,
        buildScreenFullFrame({ seq: 10, ts: Date.now() - 25, codec: "jpeg" }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(canvasMock.drawCalls.length).toBeGreaterThan(drawsBefore);
  });

  it("F19-T1-03: RemoteScreenViewer calculates and reports RTT in default local cursor mode", async () => {
    const onLatency = vi.fn();
    const jwt = makeTestJwt();
    render(
      <RemoteScreenViewer
        natsSubject={SUBJ}
        sessionId="s1"
        natsUrl={NATS_URL}
        jwt={jwt}
        quality="auto"
        codec="jpeg"
        onLatency={onLatency}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    const frameTs = Date.now() - 45;
    await act(async () => {
      natsMock.serverPublish(
        `${SUBJ}.frame`,
        buildScreenFullFrame({ seq: 2, ts: frameTs, codec: "jpeg" }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onLatency).toHaveBeenCalledWith(45);
    expect(screen.getByText(/45\s*ms/i)).toBeTruthy();
  });

  it("F19-T1-04: RemoteScreenViewer passes image/webp MIME to createImageBitmap for webp dirty-rect tiles", async () => {
    const jwt = makeTestJwt();
    render(
      <RemoteScreenViewer
        natsSubject={SUBJ}
        sessionId="s1"
        natsUrl={NATS_URL}
        jwt={jwt}
        quality="auto"
        codec="webp"
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    const webpTileBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00]);
    const tileFrame = buildScreenTileFrame({
      seq: 3,
      ts: Date.now() - 10,
      tiles: [{ x: 16, y: 32, data: webpTileBytes }],
    });

    await act(async () => {
      natsMock.serverPublish(`${SUBJ}.frame`, tileFrame);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(canvasMock.createdBitmaps.length).toBeGreaterThanOrEqual(1);
    expect(canvasMock.createdBitmaps[0].type).toBe("image/webp");
  });

  it("F19-T1-05: HeartbeatStore emits new Map snapshot references and triggers useAllAgentHeartbeats re-renders", () => {
    render(<HeartbeatListObserver />);
    const snap0 = heartbeatStore.getSnapshot();
    expect(screen.getByTestId("hb-observer").getAttribute("data-size")).toBe("0");

    act(() => {
      heartbeatStore.setHeartbeat("agent-1", {
        status: "Online",
        cpuPercent: 42,
      });
    });
    const snap1 = heartbeatStore.getSnapshot();
    expect(snap1).not.toBe(snap0);
    expect(screen.getByTestId("hb-agent-1").textContent).toBe("agent-1:42");

    act(() => {
      heartbeatStore.setHeartbeat("agent-1", {
        status: "Online",
        cpuPercent: 88,
      });
    });
    const snap2 = heartbeatStore.getSnapshot();
    expect(snap2).not.toBe(snap1);
    expect(screen.getByTestId("hb-agent-1").textContent).toBe("agent-1:88");

    act(() => {
      heartbeatStore.removeHeartbeat("agent-1");
    });
    const snap3 = heartbeatStore.getSnapshot();
    expect(snap3).not.toBe(snap2);
    expect(screen.queryByTestId("hb-agent-1")).toBeNull();
  });

  it("F19-T1-06: printHtmlAsPdf preserves safe report markup and triggers print", async () => {
    const winMock = installWindowOpenMock();
    const createObjectUrlSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:e2e-report-1");

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

    const safeHtml =
      "<h1>Relatorio Mensal</h1><table><tr><th>Host</th><td>SRV-01</td></tr></table>";
    printHtmlAsPdf(safeHtml, "Relatorio Mensal");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const iframe = document.querySelector("iframe");
    const printedHtml =
      winMock.opened[0]?.writtenHtml ||
      iframe?.getAttribute("srcdoc") ||
      capturedBlobHtml;

    expect(printedHtml).toContain("<h1>Relatorio Mensal</h1>");
    expect(printedHtml).toContain("<td>SRV-01</td>");
    expect(printedHtml).toContain("Relatorio Mensal");

    const printCalled =
      winMock.opened.some((w) => w.printMock.mock.calls.length > 0) ||
      Boolean(iframe);
    expect(printCalled).toBe(true);

    vi.stubGlobal("Blob", OriginalBlob);
    createObjectUrlSpy.mockRestore();
  });
});
