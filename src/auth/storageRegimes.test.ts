/**
 * REGIMES DE REPRODUÇÃO DO 401 (por que o bug só aparece às vezes?).
 *
 * A popup /agents/remote-session NÃO herda o token pelo AuthContext: cada janela
 * hidrata de loadAuthSession() (AuthContext.tsx:99) -> storage.ts:101-139.
 *
 *  storage.ts:94-99  getAuthStorage() = localStorage se keepSignedIn, senão sessionStorage
 *  storage.ts:41-52  isKeepSignedInEnabled() lê localStorage (COMPARTILHADO entre abas)
 *
 * Dois regimes:
 *  - keepSignedIn=true  -> tokens em localStorage -> compartilhado -> a popup se
 *    hidrata sozinha, NÃO depende do handshake. LATENTE.
 *  - keepSignedIn=false -> tokens em sessionStorage -> ISOLADO POR ABA -> a popup
 *    nasce anônima e depende 100% de TOKEN_REQUEST. Regime do incidente.
 *
 * Nota de harness: não usamos vi.stubGlobal("window") porque o jsdom define
 * window como não-configurável. Substituímos apenas os objetos de storage.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const STORAGE_KEY = "discovery.auth.session.v1";
const KEEP_KEY = "discovery.auth.keep-signed-in.v1";

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; },
  } as unknown as Storage;
}

const AUTHENTICATED = {
  stage: "authenticated",
  accessToken: "jwt-principal",
  refreshToken: "r1",
  expiresAt: Date.now() + 3600_000,
};

function installStorages(local: Storage, session: Storage) {
  Object.defineProperty(window, "localStorage", { value: local, configurable: true, writable: true });
  Object.defineProperty(window, "sessionStorage", { value: session, configurable: true, writable: true });
}

describe("regimes de storage da sessão (isolamento por aba)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("keepSignedIn=false: popup NÃO vê o token da aba principal (sessionStorage é por aba)", async () => {
    const local = makeStorage();
    const mainSession = makeStorage();          // storage da ABA PRINCIPAL
    local.setItem(KEEP_KEY, "0");               // preferência compartilhada: desligado
    mainSession.setItem(STORAGE_KEY, JSON.stringify(AUTHENTICATED));

    // 1) Aba principal: enxerga o próprio token.
    installStorages(local, mainSession);
    const main = await import("./storage");
    expect(main.isKeepSignedInEnabled()).toBe(false);
    expect(main.loadAuthSession().accessToken).toBe("jwt-principal");

    // 2) A POPUP: mesma origem e mesmo localStorage, mas sessionStorage PRÓPRIO e VAZIO.
    vi.resetModules();
    installStorages(local, makeStorage());

    const popup = await import("./storage");
    const inPopup = popup.loadAuthSession();
    // Sem o handshake cross-tab, a popup fica anônima -> getAccessToken() null
    // -> client.ts:378-385 não anexa Authorization -> 401 do RequirePermissionFilter.
    expect(inPopup.accessToken).toBeNull();
    expect(inPopup.stage).toBe("anonymous");
  });

  it("keepSignedIn=true: popup vê o token via localStorage compartilhado (regime latente)", async () => {
    const local = makeStorage();
    local.setItem(KEEP_KEY, "1");
    local.setItem(STORAGE_KEY, JSON.stringify(AUTHENTICATED));

    // A popup compartilha o localStorage; seu sessionStorage é irrelevante.
    installStorages(local, makeStorage());

    const popup = await import("./storage");
    expect(popup.isKeepSignedInEnabled()).toBe(true);
    expect(popup.loadAuthSession().accessToken).toBe("jwt-principal");
  });

  it("a migração de storage NÃO vaza a sessão da aba principal para a popup", async () => {
    // Com keepSignedIn=false, o fallback de storage.ts:112-121 procura no *outro*
    // storage (localStorage). Se a aba principal tivesse resíduo lá, a popup o
    // adotaria. Garante que a limpeza de setKeepSignedInEnabled (storage.ts:80)
    // não deixa token em localStorage.
    const local = makeStorage();
    const mainSession = makeStorage();
    local.setItem(KEEP_KEY, "0");
    mainSession.setItem(STORAGE_KEY, JSON.stringify(AUTHENTICATED));
    installStorages(local, mainSession);

    const main = await import("./storage");
    main.setKeepSignedInEnabled(false); // reafirma desligado

    expect(local.getItem(STORAGE_KEY)).toBeNull();

    vi.resetModules();
    installStorages(local, makeStorage());
    const popup = await import("./storage");
    expect(popup.loadAuthSession().accessToken).toBeNull();
  });
});
