import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────
const {
  getNatsServiceMock,
  resetNatsServiceMock,
  natsConnectMock,
  natsSubscribeMock,
  natsUnsubscribeMock,
  natsStateMock,
  natsDiagnosticsMock,
  setPreSuppliedCredentialsMock,
  agentGetMock,
  clientGetMock,
  siteGetMock,
  startRemoteDebugMock,
  stopRemoteDebugMock,
  getCredentialsMock,
  useAuthMock,
} = vi.hoisted(() => ({
  getNatsServiceMock: vi.fn(),
  resetNatsServiceMock: vi.fn(),
  natsConnectMock: vi.fn(),
  natsSubscribeMock: vi.fn(),
  natsUnsubscribeMock: vi.fn(),
  natsStateMock: vi.fn(),
  natsDiagnosticsMock: vi.fn(),
  setPreSuppliedCredentialsMock: vi.fn(),
  agentGetMock: vi.fn(),
  clientGetMock: vi.fn(),
  siteGetMock: vi.fn(),
  startRemoteDebugMock: vi.fn(),
  stopRemoteDebugMock: vi.fn(),
  getCredentialsMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock("@/api/nats", () => ({
  getNatsService: getNatsServiceMock,
  resetNatsService: resetNatsServiceMock,
}));

vi.mock("@/api", () => ({
  agentsApi: {
    get: agentGetMock,
    startRemoteDebugSession: startRemoteDebugMock,
    stopRemoteDebugSession: stopRemoteDebugMock,
    getRemoteDebugNatsCredentials: getCredentialsMock,
  },
  clientsApi: { get: clientGetMock },
  sitesApi: { get: siteGetMock },
}));

vi.mock("@/auth/AuthContext", () => ({
  useAuth: useAuthMock,
}));

vi.mock("@/components/auth/ThemeToggle", () => ({
  ThemeToggle: () => <span data-testid="theme-toggle" />,
}));

import RemoteDebugConsole from "./RemoteDebugConsole";

// ── Fixtures ─────────────────────────────────────────────────────────────
const AGENT_ID = "019faa6f-8eaa-7c38-9878-36cc96f9be3e";
const CLIENT_ID = "019dead3-70ee-7c66-8662-7558e0b23ad5";
const SITE_ID = "01a06390-3a0b-75a2-bb8c-cd87da00b0de";

const SUBJECT_1 = `tenant.${CLIENT_ID}.site.${SITE_ID}.agent.${AGENT_ID}.remote-debug.log`;

function consoleUrl(params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  return `/agents/remote-debug-console?${query}`;
}

const BASE_PARAMS = {
  sessionId: "sess-1",
  agentId: AGENT_ID,
  subject: SUBJECT_1,
  expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
  natsUrl: "wss://tngplacas.com.br/nats/",
  jwt: "jwt-token",
  nkeySeed: "SUANDKJUZCC3KC5KRUNDKWXDKXTTCP7Y3TSHD52IKH4RF4HTXJJ7WU3IX4",
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

function renderConsole(params: Record<string, string> = BASE_PARAMS) {
  return render(
    <MemoryRouter initialEntries={[consoleUrl(params)]}>
      <RemoteDebugConsole />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("RemoteDebugConsole", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({ session: { accessToken: "api-token" } });

    natsConnectMock.mockReset().mockResolvedValue(true);
    natsSubscribeMock.mockReset().mockResolvedValue(true);
    natsUnsubscribeMock.mockReset();
    natsDiagnosticsMock.mockReset().mockReturnValue({
      lastErrorType: null,
      lastErrorMessage: null,
      lastErrorAtUtc: null,
    });
    natsStateMock.mockReset().mockImplementation((listener: (state: string) => void) => {
      listener("connected");
      return () => {};
    });
    setPreSuppliedCredentialsMock.mockReset();

    getNatsServiceMock.mockReset().mockReturnValue({
      connect: natsConnectMock,
      subscribe: natsSubscribeMock,
      unsubscribe: natsUnsubscribeMock,
      onConnectionStateChange: natsStateMock,
      getConnectionDiagnostics: natsDiagnosticsMock,
      setPreSuppliedCredentials: setPreSuppliedCredentialsMock,
    });

    agentGetMock.mockReset().mockResolvedValue({
      id: AGENT_ID,
      clientId: CLIENT_ID,
      siteId: SITE_ID,
      hostname: "AORUSAXV2",
      displayName: null,
    });
    clientGetMock.mockReset().mockResolvedValue({ id: CLIENT_ID, name: "TNG Placas" });
    siteGetMock.mockReset().mockResolvedValue({ id: SITE_ID, name: "Matriz", clientId: CLIENT_ID });

    startRemoteDebugMock.mockReset();
    stopRemoteDebugMock.mockReset().mockResolvedValue(undefined);
    getCredentialsMock.mockReset().mockResolvedValue({ jwt: "jwt-2", nkeySeed: "seed-2" });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("mostra cliente › site › agente (nomes resolvidos pela API)", async () => {
    renderConsole();

    expect(await screen.findByText("TNG Placas")).toBeTruthy();
    expect(screen.getByText("Matriz")).toBeTruthy();
    expect(screen.getByText("AORUSAXV2")).toBeTruthy();

    // Hierarquia pedida: cliente → site → agente na barra superior.
    const header = document.querySelector("header");
    const text = header?.textContent ?? "";
    expect(text.indexOf("TNG Placas")).toBeLessThan(text.indexOf("Matriz"));
    expect(text.indexOf("Matriz")).toBeLessThan(text.indexOf("AORUSAXV2"));
  });

  it("cai para os ids curtos quando a API falha (sem quebrar a barra)", async () => {
    agentGetMock.mockRejectedValue(new Error("403"));
    renderConsole();

    expect(await screen.findByText(AGENT_ID.slice(0, 8))).toBeTruthy();
    expect(screen.getByText(CLIENT_ID.slice(0, 8))).toBeTruthy();
    expect(screen.getByText(SITE_ID.slice(0, 8))).toBeTruthy();
  });

  it("assina o subject da sessão assim que a popup abre (sem esperar clique)", async () => {
    renderConsole();

    await waitFor(() => {
      expect(natsSubscribeMock).toHaveBeenCalledWith(
        SUBJECT_1,
        expect.any(Function),
        expect.objectContaining({ connectIfNeeded: false }),
      );
    });
  });

  it("usa credenciais JWT no NATS quando o backend as fornece", async () => {
    renderConsole();

    await waitFor(() => {
      expect(setPreSuppliedCredentialsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          jwt: "jwt-token",
          nkeySeed: BASE_PARAMS.nkeySeed,
          subscribeSubjects: [SUBJECT_1],
        }),
      );
    });

    const config = getNatsServiceMock.mock.calls[0][0];
    expect(config.authMode).toBe("jwt_credentials");
  });

  // Regressão: updateQueryParams partia sempre do searchParams do render atual,
  // então gravar jwt/nkeySeed SOBRESCREVIA o sessionId novo — a popup seguia
  // apontando para a sessão antiga e, como o handler já tinha desinscrito do
  // subject antes de reiniciar, o efeito não rodava de novo (dependências
  // inalteradas) e o console ficava mudo para sempre.
  it("reiniciar com outro nível grava o novo sessionId e volta a assinar", async () => {
    const newSubject = SUBJECT_1;
    startRemoteDebugMock.mockResolvedValue({
      sessionId: "sess-2",
      agentId: AGENT_ID,
      natsTenantSubject: newSubject,
      expiresAtUtc: new Date(Date.now() + 20 * 60_000).toISOString(),
      natsWssUrl: "wss://tngplacas.com.br/nats/",
      logLevel: "warn",
    });

    renderConsole();

    await waitFor(() => expect(natsSubscribeMock).toHaveBeenCalledTimes(1));

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "warn" } });

    await waitFor(() => {
      expect(startRemoteDebugMock).toHaveBeenCalledWith(
        AGENT_ID,
        expect.objectContaining({ logLevel: "warn" }),
      );
    });

    await waitFor(() => {
      const search = screen.getByTestId("location").textContent ?? "";
      const params = new URLSearchParams(search);
      expect(params.get("sessionId")).toBe("sess-2");
      expect(params.get("subject")).toBe(newSubject);
      expect(params.get("jwt")).toBe("jwt-2");
      expect(params.get("nkeySeed")).toBe("seed-2");
    });

    // O handler desinscreveu antes de reiniciar: se o efeito não voltar a
    // rodar, o console fica DESINSCRITO para sempre — exibindo "Aguardando
    // entradas de log..." enquanto o agente publica normalmente.
    await waitFor(() => expect(natsSubscribeMock).toHaveBeenCalledTimes(2));
  });

  // Regressão: o cleanup era registrado apenas DEPOIS do subscribe resolver.
  // Se a popup fechasse (ou a sessão trocasse, ou o StrictMode remontasse) com
  // o connect ainda em voo, a assinatura ficava órfã — no dev isso duplicava as
  // linhas do console.
  it("descarta a assinatura quando a popup fecha durante o connect", async () => {
    let resolveSubscribe!: (value: boolean) => void;
    natsSubscribeMock.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveSubscribe = resolve;
      }),
    );

    const { unmount } = renderConsole();

    await waitFor(() => expect(natsSubscribeMock).toHaveBeenCalledTimes(1));

    unmount();
    resolveSubscribe(true);

    await waitFor(() => {
      expect(natsUnsubscribeMock).toHaveBeenCalledWith(SUBJECT_1, expect.any(Function));
    });
  });
});
