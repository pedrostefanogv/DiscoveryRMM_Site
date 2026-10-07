import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAuthorization } from "./authorization";

const state = vi.hoisted(() => ({ token: null as string | null }));

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({ session: { accessToken: state.token } }),
}));

function makeToken(payload: Record<string, unknown>): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode(payload)}.signature`;
}

function renderAuthorization(token: string | null) {
  state.token = token;
  return renderHook(() => useAuthorization()).result.current;
}

describe("useAuthorization — fail-closed", () => {
  it("nega tudo quando o token não traz o claim de permissões", () => {
    const authz = renderAuthorization(makeToken({ sub: "u1", unique_name: "ana" }));

    expect(authz.permissionsLoaded).toBe(false);
    expect(authz.hasPermission("Users.View")).toBe(false);
    expect(authz.canManageIdentity).toBe(false);
    expect(authz.canViewSettings).toBe(false);
  });

  it("não usa mais heurística de nome de role para conceder admin", () => {
    const authz = renderAuthorization(
      makeToken({ sub: "u1", roles: "Administrador" }),
    );

    expect(authz.roles).toEqual(["Administrador"]);
    expect(authz.canManageIdentity).toBe(false);
  });

  it("respeita as permissões emitidas no token", () => {
    const authz = renderAuthorization(
      makeToken({ sub: "u1", permissions: "Users.View Tickets.Create" }),
    );

    expect(authz.permissionsLoaded).toBe(true);
    expect(authz.hasPermission("Users.View")).toBe(true);
    expect(authz.hasPermission("Users.Edit")).toBe(false);
    expect(authz.hasPermission("Tickets.Create")).toBe(true);
    expect(authz.canManageIdentity).toBe(true);
  });

  it("suporta wildcard e claim vazio (usuário sem permissões)", () => {
    const wildcard = renderAuthorization(makeToken({ permissions: "*" }));
    expect(wildcard.hasPermission("Anything.Here")).toBe(true);

    const empty = renderAuthorization(makeToken({ permissions: "" }));
    expect(empty.permissionsLoaded).toBe(true);
    expect(empty.hasPermission("Users.View")).toBe(false);
  });

  it("traduz o vocabulário dos gates para os recursos reais do backend", () => {
    // Gates usam famílias amigáveis; a API autoriza por recurso.
    const settings = renderAuthorization(
      makeToken({ permissions: "ServerConfig.View ClientConfig.Edit" }),
    );
    expect(settings.canViewSettings).toBe(true);
    expect(settings.hasPermission("settings.read")).toBe(true);
    expect(settings.hasPermission("settings.*")).toBe(true);

    const identity = renderAuthorization(makeToken({ permissions: "Users.View" }));
    expect(identity.canManageIdentity).toBe(true);
    expect(identity.hasPermission("groups.read")).toBe(true);

    const deploy = renderAuthorization(makeToken({ permissions: "Deployment.View" }));
    expect(deploy.canViewDeploy).toBe(true);
    expect(deploy.hasPermission("deploy.read")).toBe(true);
  });

  it("nega famílias para as quais o usuário não tem recurso correspondente", () => {
    const authz = renderAuthorization(makeToken({ permissions: "Tickets.View" }));

    expect(authz.canViewSettings).toBe(false);
    expect(authz.canManageIdentity).toBe(false);
    expect(authz.canViewReports).toBe(false);
  });

  it("trata token ausente como sem permissões", () => {
    const authz = renderAuthorization(null);
    expect(authz.permissionsLoaded).toBe(false);
    expect(authz.hasAllPermissions(["Users.View"])).toBe(false);
  });
});
