import { act, render, renderHook, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NatsService } from "@/api/nats";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import { Icon } from "@/components/ui/Icon";
import { useFilesStream } from "@/modules/remote-files/useFilesStream";
import { useProcessesStream } from "@/modules/remote-processes/useProcessStream";
import RemoteScreenViewer from "@/modules/remote-screen/RemoteScreenViewer";
import {
  THEME_MODE_STORAGE_KEY,
  ThemeProvider,
  useTheme,
} from "@/theme/ThemeContext";
import {
  installCanvasAndBitmapMock,
  installMatchMediaMock,
  installResizeObserverMock,
} from "./helpers/browserMocks";
import { makeTestJwt } from "./helpers/jwtFactory";
import { pathExistsInSite, readSiteText } from "./helpers/moduleProbe";
import { installNatsWsMock, type NatsWsMockController } from "./helpers/natsWsMock";
import { buildCursorImgFrame } from "./helpers/screenFrameBuilder";

const SCREEN_SUBJ = "tenant.c1.site.s1.agent.a1.remote.screen.s1";
const SESSION_SUBJ = "tenant.c1.site.s1.agent.a1.remote.session.s1";
const NATS_URL = "wss://nats.e2e.local/nats";

function ThemeControlProbe() {
  const { mode, setMode } = useTheme();
  return (
    <div>
      <span data-testid="theme-val">{mode}</span>
      <button type="button" onClick={() => setMode("light")}>
        ForceLight
      </button>
    </div>
  );
}

describe("Tier 2 — F20: Boundary & Corner Cases (Leaks, JWT Edge Cases, Theme, ErrorBoundary, Icons)", () => {
  let natsMock: NatsWsMockController;
  let canvasMock: ReturnType<typeof installCanvasAndBitmapMock>;
  let resizeMock: ReturnType<typeof installResizeObserverMock>;

  beforeEach(() => {
    vi.useFakeTimers({ now: 1_000_000 });
    localStorage.clear();
    document.documentElement.className = "";
    natsMock = installNatsWsMock();
    canvasMock = installCanvasAndBitmapMock();
    resizeMock = installResizeObserverMock();
  });

  afterEach(() => {
    natsMock.restore();
    canvasMock.restore();
    resizeMock.restore();
    vi.useRealTimers();
  });

  it("F20-T2-01: useFilesStream and useProcessesStream set mountedRef=false on unmount before async connect resolves and dispose cleanly", async () => {
    let resolveConnect!: (v: boolean) => void;
    const deferredConnect = new Promise<boolean>((r) => {
      resolveConnect = r;
    });
    const connectSpy = vi
      .spyOn(NatsService.prototype, "connect")
      .mockReturnValue(deferredConnect);
    const subscribeSpy = vi.spyOn(NatsService.prototype, "subscribe");
    const disposeSpy = vi.spyOn(NatsService.prototype, "dispose");

    const jwt = makeTestJwt();
    const filesHook = renderHook(() =>
      useFilesStream({ natsSubject: SESSION_SUBJ, natsUrl: NATS_URL, jwt }),
    );
    const procHook = renderHook(() =>
      useProcessesStream({ natsSubject: SESSION_SUBJ, natsUrl: NATS_URL, jwt }),
    );

    const subsCountBeforeUnmount = subscribeSpy.mock.calls.length;
    filesHook.unmount();
    procHook.unmount();

    await act(async () => {
      resolveConnect(true);
      await Promise.resolve();
      await Promise.resolve();
    });

    // No post-unmount subscribe() calls after connect() resolves
    expect(subscribeSpy.mock.calls.length).toBe(subsCountBeforeUnmount);
    expect(disposeSpy).toHaveBeenCalledTimes(2);
    expect(filesHook.result.current.isConnected).toBe(false);
    expect(procHook.result.current.isConnected).toBe(false);

    connectSpy.mockRestore();
  });

  it("F20-T2-02: useFilesStream and useProcessesStream handle malformed and missing-exp JWTs gracefully without throwing", async () => {
    const credsSpy = vi.spyOn(NatsService.prototype, "setPreSuppliedCredentials");

    const malformed = "not-a-jwt";
    const missingExp = `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ sub: "u1" })).replace(/=/g, "")}.sig`;

    const h1 = renderHook(() =>
      useFilesStream({ natsSubject: SESSION_SUBJ, natsUrl: NATS_URL, jwt: malformed }),
    );
    const h2 = renderHook(() =>
      useProcessesStream({ natsSubject: SESSION_SUBJ, natsUrl: NATS_URL, jwt: missingExp }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(credsSpy).toHaveBeenCalledTimes(2);
    for (const call of credsSpy.mock.calls) {
      const expMs = new Date(call[0].expiresAtUtc).getTime();
      expect(Number.isFinite(expMs)).toBe(true);
      expect(expMs).toBeGreaterThan(Date.now());
    }

    h1.unmount();
    h2.unmount();
  });

  it("F20-T2-03: ThemeContext explicit setMode persists and ignores subsequent OS matchMedia changes, aligned with index.html script", () => {
    const mm = installMatchMediaMock(true);

    render(
      <ThemeProvider>
        <ThemeControlProbe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme-val").textContent).toBe("dark");
    act(() => {
      screen.getByRole("button", { name: "ForceLight" }).click();
    });
    expect(localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    // OS toggles dark again — explicit user preference must win
    act(() => {
      mm.setDark(true);
    });
    expect(screen.getByTestId("theme-val").textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    // Verify index.html anti-FOUC inline script references the exact storage key & matchMedia
    const indexHtml = readSiteText("index.html");
    expect(indexHtml).toContain(THEME_MODE_STORAGE_KEY);
    expect(indexHtml).toContain("prefers-color-scheme: dark");
  });

  it("F20-T2-04: PageErrorBoundary formats isRouteErrorResponse HTTP status and exposes recovery buttons", async () => {
    vi.useRealTimers();
    const router = createMemoryRouter(
      [
        {
          path: "/err-503",
          loader: () => {
            throw new Response("Upstream down", {
              status: 503,
              statusText: "Service Unavailable",
            });
          },
          element: <div>Never</div>,
          errorElement: <PageErrorBoundary />,
        },
      ],
      { initialEntries: ["/err-503"] },
    );

    render(<RouterProvider router={router} />);
    expect(await screen.findByText("Não foi possível exibir esta página")).toBeTruthy();
    expect(screen.getByText("Erro 503: Service Unavailable")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Recarregar página" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Voltar ao início" })).toBeTruthy();
  });

  it("F20-T2-05: Icon handles valid and unknown glyphs gracefully and modular icon chunks exist", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const known = render(<Icon name="dashboard" size={16} />);
    const svg = known.container.querySelector("svg");
    expect(svg?.getAttribute("viewBox")).toBe("0 -960 960 960");
    expect(svg?.getAttribute("width")).toBe("16");

    const unknown = render(<Icon name={"nonexistent_glyph_e2e" as never} />);
    expect(unknown.container.querySelector("svg")).toBeNull();

    expect(pathExistsInSite("src/components/ui/icons/core.ts")).toBe(true);
    expect(pathExistsInSite("src/components/ui/icons/registry.ts")).toBe(true);

    warnSpy.mockRestore();
  });

  it("F20-T2-06: RemoteScreenViewer closes superseded cursorImage.bitmap and cancels 150ms keyframe timer on unmount", async () => {
    const jwt = makeTestJwt();
    const { unmount } = render(
      <RemoteScreenViewer
        natsSubject={SCREEN_SUBJ}
        sessionId="s1"
        natsUrl={NATS_URL}
        jwt={jwt}
        quality="auto"
        codec="jpeg"
        cursorMode="remote"
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    // Deliver two consecutive cursor images
    await act(async () => {
      natsMock.serverPublish(
        `${SCREEN_SUBJ}.cursor.img`,
        buildCursorImgFrame({ hotX: 1, hotY: 1 }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      natsMock.serverPublish(
        `${SCREEN_SUBJ}.cursor.img`,
        buildCursorImgFrame({ hotX: 3, hotY: 3 }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(canvasMock.createdBitmaps).toHaveLength(2);
    // First bitmap closed when replaced
    expect(canvasMock.createdBitmaps[0].closed).toBe(true);

    // Unmount BEFORE 150ms keyframe timer fires — all component timers must be cancelled
    const pubsBeforeUnmount = natsMock.published.length;
    unmount();
    expect(vi.getTimerCount()).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    // Keyframe timer did NOT publish after unmount, and second cursor bitmap was closed on unmount
    expect(natsMock.published.length).toBe(pubsBeforeUnmount);
    expect(canvasMock.createdBitmaps[1].closed).toBe(true);
  });
});
