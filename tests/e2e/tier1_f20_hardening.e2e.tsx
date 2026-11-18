import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NatsService } from "@/api/nats";
import { Icon } from "@/components/ui/Icon";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import { useFilesStream } from "@/modules/remote-files/useFilesStream";
import { useProcessesStream } from "@/modules/remote-processes/useProcessStream";
import RemoteScreenViewer from "@/modules/remote-screen/RemoteScreenViewer";
import { routes } from "@/router";
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
import {
  buildCursorImgFrame,
  buildScreenFullFrame,
} from "./helpers/screenFrameBuilder";

const SCREEN_SUBJ = "tenant.c1.site.s1.agent.a1.remote.screen.s1";
const SESSION_SUBJ = "tenant.c1.site.s1.agent.a1.remote.session.s1";
const NATS_URL = "wss://nats.e2e.local/nats";

function ThemeProbe() {
  const { mode, toggleMode } = useTheme();
  return (
    <button type="button" data-testid="theme-mode" onClick={toggleMode}>
      {mode}
    </button>
  );
}

function collectLeafRoutes(routeList: RouteObject[], parentPath = ""): Array<{ path: string; route: RouteObject }> {
  const leaves: Array<{ path: string; route: RouteObject }> = [];
  for (const route of routeList) {
    const fullPath = [parentPath, route.path ?? (route.index ? "(index)" : "")]
      .filter(Boolean)
      .join("/");
    if (route.children && route.children.length > 0) {
      leaves.push(...collectLeafRoutes(route.children, fullPath));
    } else {
      leaves.push({ path: fullPath, route });
    }
  }
  return leaves;
}

describe("Tier 1 — F20: Security, Resource Leaks, Stream Hooks, Theme, ErrorBoundary & CI", () => {
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

  it("F20-T1-01: RemoteScreenViewer never places JWT in WebSocket URL query string", async () => {
    const secretJwt = makeTestJwt({ sub: "secret-operator" });
    render(
      <RemoteScreenViewer
        natsSubject={SCREEN_SUBJ}
        sessionId="s1"
        natsUrl={NATS_URL}
        jwt={secretJwt}
        quality="auto"
        codec="jpeg"
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(natsMock.connectUrls.length).toBeGreaterThanOrEqual(1);
    for (const url of natsMock.connectUrls) {
      expect(url).not.toContain("access_token=");
      expect(url).not.toContain(secretJwt);
    }
    expect(natsMock.lastConnection?.connectPayload?.auth_token).toBe(secretJwt);
  });

  it("F20-T1-02: RemoteScreenViewer closes in-flight ImageBitmaps and cursorImage.bitmap on unmount and removes dead frameDecoder.ts", async () => {
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

    // Deliver cursor bitmap
    await act(async () => {
      natsMock.serverPublish(
        `${SCREEN_SUBJ}.cursor.img`,
        buildCursorImgFrame({ width: 16, height: 16, hotX: 1, hotY: 1 }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    // Defer the next frame decode so it resolves AFTER unmount
    canvasMock.deferNextBitmap();
    await act(async () => {
      natsMock.serverPublish(
        `${SCREEN_SUBJ}.frame`,
        buildScreenFullFrame({ seq: 5, ts: Date.now() - 5, codec: "jpeg" }),
      );
      await Promise.resolve();
    });

    unmount();

    await act(async () => {
      canvasMock.resolveDeferredBitmap();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(canvasMock.createdBitmaps.length).toBeGreaterThanOrEqual(2);
    for (const bmp of canvasMock.createdBitmaps) {
      expect(bmp.closed).toBe(true);
    }

    expect(pathExistsInSite("src/modules/remote-screen/frameDecoder.ts")).toBe(false);
  });

  it("F20-T1-03: useFilesStream and useProcessesStream subscribe before connect completes and parse JWT exp", async () => {
    vi.useRealTimers();
    const nowSec = Math.floor(Date.now() / 1000);
    const shortExpSec = nowSec + 300; // 5 minutes (not 60 minutes)
    const jwt = makeTestJwt({ exp: shortExpSec });

    const credsSpy = vi.spyOn(NatsService.prototype, "setPreSuppliedCredentials");

    // Verify subscription order + expiresAtUtc for useFilesStream
    let filesReadyCaptured: unknown = null;
    const filesHook = renderHook(() =>
      useFilesStream({
        natsSubject: SESSION_SUBJ,
        natsUrl: NATS_URL,
        jwt,
      }),
    );
    filesHook.result.current.onReady((info) => {
      filesReadyCaptured = info;
    });

    await waitFor(() => {
      expect(filesHook.result.current.isConnected).toBe(true);
    });

    const filesConn = natsMock.connections[0];
    expect(filesConn).toBeDefined();
    const filesSubj = SESSION_SUBJ.replace(/-/g, "");
    await waitFor(() => {
      const filesSubs = Array.from(filesConn.subscriptions.values());
      expect(filesSubs).toContain(`${filesSubj}.files.ready`);
      expect(filesSubs).toContain(`${filesSubj}.files.resp`);
    });

    // Assert credentials expiry came from JWT exp (5 min), not hardcoded 60m
    expect(credsSpy).toHaveBeenCalled();
    const filesCreds = credsSpy.mock.calls[0][0];
    const filesExpMs = new Date(filesCreds.expiresAtUtc).getTime();
    expect(Math.abs(filesExpMs - shortExpSec * 1000)).toBeLessThanOrEqual(2000);

    // Assert subscribe-before-connect by checking subscribe was invoked with connectIfNeeded: false or ready event arrived immediately
    await act(async () => {
      filesConn.serverPublish(`${filesSubj}.files.ready`, { rootPath: "C:\\" });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(filesReadyCaptured).toEqual({ rootPath: "C:\\" });
    filesHook.unmount();

    // Verify useProcessesStream too
    credsSpy.mockClear();
    const procHook = renderHook(() =>
      useProcessesStream({
        natsSubject: SESSION_SUBJ,
        natsUrl: NATS_URL,
        jwt,
      }),
    );

    await waitFor(() => {
      expect(procHook.result.current.isConnected).toBe(true);
    });

    expect(credsSpy).toHaveBeenCalled();
    const procCreds = credsSpy.mock.calls[0][0];
    const procExpMs = new Date(procCreds.expiresAtUtc).getTime();
    expect(Math.abs(procExpMs - shortExpSec * 1000)).toBeLessThanOrEqual(2000);
    procHook.unmount();

    // Also verify subscribe-before-connect in NatsService ordering
    const subscribeSpy = vi.spyOn(NatsService.prototype, "subscribe");
    const filesHook2 = renderHook(() =>
      useFilesStream({
        natsSubject: SESSION_SUBJ,
        natsUrl: NATS_URL,
        jwt,
      }),
    );
    await waitFor(() => {
      expect(filesHook2.result.current.isConnected).toBe(true);
    });
    const firstSubOpts = subscribeSpy.mock.calls.map((c) => c[2]);
    expect(firstSubOpts.some((o) => o?.connectIfNeeded === false)).toBe(true);
    filesHook2.unmount();
  });

  it("F20-T1-04: ThemeContext respects OS prefers-color-scheme light mode without auto-persisting and tracks OS changes", () => {
    const mm = installMatchMediaMock(false);

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme-mode").textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBeNull();

    act(() => {
      mm.setDark(true);
    });

    expect(screen.getByTestId("theme-mode").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("F20-T1-05: router.tsx assigns PageErrorBoundary to all child routes and isolates page crashes", () => {
    const leaves = collectLeafRoutes(routes);
    expect(leaves.length).toBeGreaterThan(20);
    for (const leaf of leaves) {
      expect(leaf.route.errorElement, `Missing errorElement on ${leaf.path}`).toBeDefined();
    }

    function BrokenPage(): null {
      throw new Error("Simulated route crash");
    }

    const memRouter = createMemoryRouter(
      [
        {
          path: "/",
          element: (
            <div>
              <span data-testid="app-shell">Shell Active</span>
            </div>
          ),
          children: [],
        },
        {
          path: "/broken",
          element: <BrokenPage />,
          errorElement: <PageErrorBoundary />,
        },
      ],
      { initialEntries: ["/broken"] },
    );

    render(<RouterProvider router={memRouter} />);
    expect(screen.getByText("Não foi possível exibir esta página")).toBeTruthy();
    expect(screen.getByText("Simulated route crash")).toBeTruthy();
  });

  it("F20-T1-06: Icon splits materialSymbols into modular chunks, package.json keeps @testing-library/dom in devDependencies, and CI workflow exists", () => {
    const pkg = JSON.parse(readSiteText("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.["@testing-library/dom"]).toBeUndefined();
    expect(pkg.devDependencies?.["@testing-library/dom"]).toBeDefined();
    expect(pathExistsInSite("pnpm-workspace.yaml")).toBe(false);
    expect(pathExistsInSite(".github/workflows/ci.yml")).toBe(true);
    expect(pathExistsInSite("eslint.config.mjs")).toBe(true);

    const ciYaml = readSiteText(".github/workflows/ci.yml");
    expect(ciYaml).toContain("pull_request");
    expect(ciYaml).toContain("npm run typecheck");
    expect(ciYaml).toContain("npm test");
    expect(ciYaml).toContain("npm run build");

    const { container } = render(<Icon name="dashboard" size={20} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("width")).toBe("20");
    expect(svg?.querySelectorAll("path").length).toBeGreaterThan(0);

    // Ensure monolithic materialSymbols.ts was decomposed
    const materialSymbolsText = readSiteText("src/components/ui/materialSymbols.ts");
    expect(materialSymbolsText.length).toBeLessThan(2000);
  });
});
