import { isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  createMemoryRouter,
  Outlet,
  RouterProvider,
  type RouteObject,
} from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";

const guardControl = { throwInRequireAuth: false };
const pageControl = {
  throwDashboard: false,
  throwRemoteSession: false,
  throwLogin: false,
};

vi.mock("@/auth/AuthGuards", () => ({
  RequireAuth: () => {
    if (guardControl.throwInRequireAuth) {
      throw new Error("Auth guard failure");
    }
    return <Outlet />;
  },
  PublicOnlyAuth: () => <Outlet />,
  PermissionGate: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/components/layout/MainLayout", () => ({
  MainLayout: () => (
    <div data-testid="main-layout">
      <nav data-testid="sidebar">Sidebar</nav>
      <main>
        <Outlet />
      </main>
    </div>
  ),
}));

vi.mock("@/components/auth/AuthLayout", () => ({
  AuthLayout: () => (
    <div data-testid="auth-layout">
      <Outlet />
    </div>
  ),
}));

vi.mock("@/pages/Dashboard", () => ({
  default: () => {
    if (pageControl.throwDashboard) {
      throw new Error("Dashboard exploded");
    }
    return <div>Dashboard OK</div>;
  },
}));

vi.mock("@/pages/agents/RemoteSession", () => ({
  default: () => {
    if (pageControl.throwRemoteSession) {
      throw new Error("RemoteSession exploded");
    }
    return <div>RemoteSession OK</div>;
  },
}));

vi.mock("@/pages/auth/LoginPage", () => ({
  default: () => {
    if (pageControl.throwLogin) {
      throw new Error("Login exploded");
    }
    return <div>Login OK</div>;
  },
}));

import { routes } from "./router";
import { ErrorPage } from "./components/ErrorPage";
import { PageErrorBoundary } from "./components/PageErrorBoundary";

function collectLeafRoutes(
  routeList: RouteObject[],
  prefix = "",
): Array<{ fullPath: string; route: RouteObject }> {
  const leaves: Array<{ fullPath: string; route: RouteObject }> = [];
  for (const route of routeList) {
    const segment = route.index ? "(index)" : (route.path ?? "(layout)");
    const fullPath =
      prefix === ""
        ? segment
        : `${prefix === "/" ? "" : prefix}/${segment}`;
    if (route.children && route.children.length > 0) {
      leaves.push(...collectLeafRoutes(route.children, fullPath));
    } else {
      leaves.push({ fullPath, route });
    }
  }
  return leaves;
}

describe("router PageErrorBoundary coverage and isolation", () => {
  it("wraps every leaf route with PageErrorBoundary while preserving root ErrorPage and layout shells", () => {
    const authRoot = routes.find((r) => r.path === "/auth");
    const appRoot = routes.find((r) => r.path === "/");

    expect(authRoot).toBeDefined();
    expect(appRoot).toBeDefined();
    expect(isValidElement(authRoot?.errorElement)).toBe(true);
    expect((authRoot?.errorElement as React.ReactElement).type).toBe(ErrorPage);
    expect(isValidElement(appRoot?.errorElement)).toBe(true);
    expect((appRoot?.errorElement as React.ReactElement).type).toBe(ErrorPage);

    // Layout wrapper routes must NOT define errorElement so shells remain mounted
    const authLayoutRoute = authRoot?.children?.find((r) => !r.path);
    const mainLayoutRoute = appRoot?.children?.find((r) => !r.path);
    expect(authLayoutRoute?.errorElement).toBeUndefined();
    expect(mainLayoutRoute?.errorElement).toBeUndefined();

    const leaves = collectLeafRoutes(routes);
    expect(leaves.length).toBeGreaterThanOrEqual(84);

    const missingBoundary = leaves.filter(
      ({ route }) =>
        !isValidElement(route.errorElement) ||
        (route.errorElement as React.ReactElement).type !== PageErrorBoundary,
    );
    expect(missingBoundary).toEqual([]);
  });

  it("isolates a crash inside MainLayout within PageErrorBoundary while keeping Sidebar mounted", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    guardControl.throwInRequireAuth = false;
    pageControl.throwDashboard = true;

    const memoryRouter = createMemoryRouter(routes, {
      initialEntries: ["/"],
    });
    render(<RouterProvider router={memoryRouter} />);

    await waitFor(() => {
      expect(
        screen.getByText("Não foi possível exibir esta página"),
      ).toBeTruthy();
    });
    expect(screen.getByTestId("main-layout")).toBeTruthy();
    expect(screen.getByTestId("sidebar")).toBeTruthy();
    expect(screen.queryByText("Erro ao carregar página")).toBeNull();

    pageControl.throwDashboard = false;
  });

  it("isolates a standalone / page crash within PageErrorBoundary instead of root ErrorPage", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    guardControl.throwInRequireAuth = false;
    pageControl.throwRemoteSession = true;

    const memoryRouter = createMemoryRouter(routes, {
      initialEntries: ["/agents/remote-session"],
    });
    render(<RouterProvider router={memoryRouter} />);

    await waitFor(() => {
      expect(
        screen.getByText("Não foi possível exibir esta página"),
      ).toBeTruthy();
    });
    expect(screen.queryByText("Erro ao carregar página")).toBeNull();

    pageControl.throwRemoteSession = false;
  });

  it("isolates an auth page crash inside AuthLayout within PageErrorBoundary", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    pageControl.throwLogin = true;

    const memoryRouter = createMemoryRouter(routes, {
      initialEntries: ["/auth/login"],
    });
    render(<RouterProvider router={memoryRouter} />);

    await waitFor(() => {
      expect(
        screen.getByText("Não foi possível exibir esta página"),
      ).toBeTruthy();
    });
    expect(screen.getByTestId("auth-layout")).toBeTruthy();
    expect(screen.queryByText("Erro ao carregar página")).toBeNull();

    pageControl.throwLogin = false;
  });

  it("falls back to root ErrorPage when RequireAuth itself throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    guardControl.throwInRequireAuth = true;

    const memoryRouter = createMemoryRouter(routes, {
      initialEntries: ["/"],
    });
    render(<RouterProvider router={memoryRouter} />);

    await waitFor(() => {
      expect(screen.getByText("Erro ao carregar página")).toBeTruthy();
    });

    guardControl.throwInRequireAuth = false;
  });
});
