import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearAuthSession,
  emptyAuthSession,
  isKeepSignedInEnabled,
  loadAuthSession,
  saveAuthSession,
  setKeepSignedInEnabled,
} from "./storage";
import type { AuthSessionState } from "./types";

function sessionWithTokens(): AuthSessionState {
  return {
    ...emptyAuthSession,
    stage: "authenticated",
    accessToken: "at-123",
    refreshToken: "rt-456",
    expiresAt: Date.now() + 3600_000,
    temporaryMfaToken: null,
    loginResponse: null,
  };
}

describe("Manter-me conectado (storage)", () => {
  beforeEach(() => {
    clearAuthSession();
    setKeepSignedInEnabled(false);
  });

  afterEach(() => {
    clearAuthSession();
    setKeepSignedInEnabled(false);
  });

  it("padrão é desativado e usa sessionStorage", () => {
    expect(isKeepSignedInEnabled()).toBe(false);

    saveAuthSession(sessionWithTokens());
    expect(window.sessionStorage.getItem("discovery.auth.session.v1")).not.toBeNull();
    expect(window.localStorage.getItem("discovery.auth.session.v1")).toBeNull();
  });

  it("ativar persiste a sessão em localStorage", () => {
    setKeepSignedInEnabled(true);
    expect(isKeepSignedInEnabled()).toBe(true);

    saveAuthSession(sessionWithTokens());
    expect(window.localStorage.getItem("discovery.auth.session.v1")).not.toBeNull();
    expect(window.sessionStorage.getItem("discovery.auth.session.v1")).toBeNull();
  });

  it("ativar migra uma sessão existente do sessionStorage", () => {
    saveAuthSession(sessionWithTokens());
    setKeepSignedInEnabled(true);

    const loaded = loadAuthSession();
    expect(loaded.accessToken).toBe("at-123");
    expect(window.sessionStorage.getItem("discovery.auth.session.v1")).toBeNull();
  });

  it("desativar remove os tokens de localStorage", () => {
    setKeepSignedInEnabled(true);
    saveAuthSession(sessionWithTokens());

    setKeepSignedInEnabled(false);
    expect(window.localStorage.getItem("discovery.auth.session.v1")).toBeNull();

    // Sessão migrada de volta para sessionStorage — o usuário continua logado.
    const loaded = loadAuthSession();
    expect(loaded.accessToken).toBe("at-123");
  });

  it("clearAuthSession limpa os DOIS storages mesmo com a opção ativa", () => {
    setKeepSignedInEnabled(true);
    saveAuthSession(sessionWithTokens());

    clearAuthSession();
    expect(loadAuthSession().stage).toBe("anonymous");
    expect(window.localStorage.getItem("discovery.auth.session.v1")).toBeNull();
    expect(window.sessionStorage.getItem("discovery.auth.session.v1")).toBeNull();
    // A preferência é preservada — não exige remarcar no próximo login.
    expect(isKeepSignedInEnabled()).toBe(true);
  });

  it("loadAuthSession recupera sessão gravada em localStorage quando a opção está ativa", () => {
    setKeepSignedInEnabled(true);
    saveAuthSession(sessionWithTokens());

    // Simula um novo carregamento da página (novo acesso ao storage).
    const loaded = loadAuthSession();
    expect(loaded.stage).toBe("authenticated");
    expect(loaded.refreshToken).toBe("rt-456");
  });
});
