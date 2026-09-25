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
  natsPublishMock,
  natsOnAuthErrorMock,
  natsForceReconnectMock,
  renewRemoteDebugMock,
  setRemoteDebugLevelMock,
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
  natsPublishMock: vi.fn(),
  natsOnAuthErrorMock: vi.fn(),
  natsForceReconnectMock: vi.fn(),
  renewRemoteDebugMock: vi.fn(),
  setRemoteDebugLevelMock: vi.fn(),
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
    renewRemoteDebugSession: renewRemoteDebugMock,
    setRemoteDebugLogLevel: setRemoteDebugLevelMock,
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
const CONTROL_SUBJECT_1 = SUBJECT_1.replace(
  ".remote-debug.log",
  ".remote-debug.control",
);

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
      publish: natsPublishMock,
      onAuthError: natsOnAuthErrorMock,
      forceReconnect: natsForceReconnectMock,
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
    natsPublishMock.mockReset().mockResolvedValue(undefined);
    natsOnAuthErrorMock.mockReset().mockReturnValue(() => {});
    natsForceReconnectMock.mockReset().mockResolvedValue(true);
    renewRemoteDebugMock.mockReset().mockResolvedValue({
      sessionId: "sess-1",
      expiresAtUtc: new Date(Date.now() + 20 * 60_000).toISOString(),
      maxExpiresAtUtc: new Date(Date.now() + 60 * 60_000).toISOString(),
      sessionActive: true,
    });
    setRemoteDebugLevelMock.mockReset().mockResolvedValue({
      sessionId: "sess-1",
      logLevel: "warn",
      appliedAtUtc: new Date().toISOString(),
    });
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
          // O canal de controle é assinado junto com os logs (pong/closed/
          // levelChanged) no MESMO subject de controle.
          subscribeSubjects: [SUBJECT_1, CONTROL_SUBJECT_1],
        }),
      );
    });

    const config = getNatsServiceMock.mock.calls[0][0];
    expect(config.authMode).toBe("jwt_credentials");
  });

  // A troca de nível passou a ser IN-PLACE: o servidor atualiza o estado e
  // entrega setLevel ao agente pelo canal de controle. A sessão, o subject e as
  // linhas já recebidas permanecem — nada de matar/recriar a sessão.
  it("troca o nível em tempo real sem reiniciar a sessão", async () => {
    renderConsole();

    await waitFor(() => expect(natsSubscribeMock).toHaveBeenCalled());

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "warn" } });

    await waitFor(() => {
      expect(setRemoteDebugLevelMock).toHaveBeenCalledWith(
        AGENT_ID,
        "sess-1",
        "warn",
      );
    });

    expect(startRemoteDebugMock).not.toHaveBeenCalled();
    expect(stopRemoteDebugMock).not.toHaveBeenCalled();

    const search = screen.getByTestId("location").textContent ?? "";
    expect(new URLSearchParams(search).get("sessionId")).toBe("sess-1");
  });

  // O canal de controle é assinado junto com os logs e alimenta a liveness.
  it("assina o subject único de controle além dos logs", async () => {
    renderConsole();

    await waitFor(() => {
      expect(natsSubscribeMock).toHaveBeenCalledWith(
        CONTROL_SUBJECT_1,
        expect.any(Function),
        expect.objectContaining({ connectIfNeeded: false }),
      );
    });
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
