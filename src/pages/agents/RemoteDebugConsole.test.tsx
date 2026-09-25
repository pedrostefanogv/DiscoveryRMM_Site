import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    getCredentialsMock.mockReset().mockResolvedValue({
      jwt: "jwt-2",
      nkeySeed: "seed-2",
      expiresAtUtc: new Date(Date.now() + 60 * 60_000).toISOString(),
    });
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
  // Regressão (revisão): ao atingir o teto o servidor responde 200 com
  // sessionActive=false. Antes esse caminho era inalcançável (o handler
  // devolvia erro HTTP e o hook engolia), então o console nunca marcava
  // EXPIRADO nem parava de renovar.
  it("marca EXPIRADO quando o servidor encerra a sessão no teto", async () => {
    renewRemoteDebugMock.mockResolvedValue({
      sessionId: "sess-1",
      expiresAtUtc: new Date().toISOString(),
      maxExpiresAtUtc: new Date().toISOString(),
      sessionActive: false,
      endReason: "max-duration",
    });

    renderConsole();

    await waitFor(() => {
      expect(screen.getByText("EXPIRADO")).toBeTruthy();
    });

    // Aparece no log do sistema E na faixa de erro (mensagem acionável).
    expect(
      screen.getAllByText(/Sessão encerrada pelo servidor \(max-duration\)/).length,
    ).toBeGreaterThan(0);
  });

  // Regressão do HAR: com a API reiniciada (estado de sessão em memória), o
  // renew passa a responder 404 "Remote debug session not found". Antes o hook
  // engolia esse erro no `catch` vazio e o console ficava preso em
  // "AGUARDANDO AGENTE" sem nenhuma mensagem.
  it("marca EXPIRADO e orienta reabrir quando o servidor perde a sessão (404)", async () => {
    renewRemoteDebugMock.mockRejectedValue(
      Object.assign(new Error("Remote debug session not found."), { status: 404 }),
    );

    renderConsole();

    await waitFor(() => {
      expect(screen.getByText("EXPIRADO")).toBeTruthy();
    });

    expect(
      screen.getAllByText(/não existe mais no servidor/).length,
    ).toBeGreaterThan(0);
  });
  // Regressão do 404: o console NÃO pode depender da rota global de credenciais
  // (/api/v1/nats-auth/user/credentials), que não autoriza o subject do agente.
  // Ele precisa configurar o NATS com o provedor escopado da sessão.
  it("configura o NATS com provedor de credencial escopada (sem rota global)", async () => {
    renderConsole();

    await waitFor(() => {
      expect(getNatsServiceMock).toHaveBeenCalledWith(
        expect.objectContaining({
          authMode: "jwt_credentials",
          credentialsProvider: expect.any(Function),
        }),
      );
    });
  });

  // Regressão (revisão): auth_error persistente não pode gerar loop infinito de
  // fetch de credencial + reconexão (martelando API e NATS).
  it("limita a recuperação de auth_error e mostra erro acionável", async () => {
    const stateListeners: Array<(state: string) => void> = [];
    natsStateMock.mockImplementation((listener: (state: string) => void) => {
      stateListeners.push(listener);
      listener("connected");
      return () => {};
    });
    natsForceReconnectMock.mockResolvedValue(false);

    renderConsole();
    await waitFor(() => expect(natsSubscribeMock).toHaveBeenCalled());

    // auth_error persistente: 5 eventos seguidos.
    for (let i = 0; i < 5; i++) {
      stateListeners.forEach((listener) => listener("auth_error"));
    }

    await waitFor(() => {
      expect(screen.getByText(/Confirme nos logs da API/)).toBeTruthy();
    });
    expect(natsForceReconnectMock.mock.calls.length).toBeLessThanOrEqual(2);
  });

  // Regressão do caso real (HAR): se o refresh da credencial escopada falha
  // (ex.: 404 porque a API reiniciou e perdeu a sessão em memória), o auth_error
  // do NATS NÃO é culpa do callout. A mensagem final precisa apontar a sessão.
  it("não culpa o auth callout quando a renovação de credencial da sessão falha", async () => {
    const stateListeners: Array<(state: string) => void> = [];
    natsStateMock.mockImplementation((listener: (state: string) => void) => {
      stateListeners.push(listener);
      listener("connected");
      return () => {};
    });
    natsForceReconnectMock.mockResolvedValue(false);
    getCredentialsMock.mockRejectedValue(
      Object.assign(new Error("Remote debug session not found."), { status: 404 }),
    );

    renderConsole();
    await waitFor(() => expect(natsSubscribeMock).toHaveBeenCalled());

    for (let i = 0; i < 3; i++) {
      stateListeners.forEach((listener) => listener("auth_error"));
    }

    await waitFor(() => {
      expect(
        screen.getByText(/não foi possível renovar as credenciais da sessão/),
      ).toBeTruthy();
    });
    expect(screen.queryByText(/auth callout do discovery-api/)).toBeNull();
  });

  // O auto-scroll não funcionava porque o root do console usava min-h-screen:
  // a coluna crescia com o conteúdo, a área de logs ficava com
  // clientHeight == scrollHeight (não rolável) e o documento é que rolava —
  // então o scrollTop do container era um no-op e o onScroll nunca disparava.
  // Os testes abaixo fixam o layout (h-screen) e o comportamento de seguir o fim.
  describe("auto-scroll", () => {
    function getScroller(): HTMLDivElement {
      return screen.getByTestId("log-scroll") as HTMLDivElement;
    }

    // O jsdom não calcula layout: define a geometria do scroller à mão para
    // observar o assignment de scrollTop.
    function setGeometry(
      element: HTMLElement,
      geometry: { scrollHeight: number; clientHeight: number; scrollTop?: number },
    ) {
      let current = geometry.scrollTop ?? 0;
      Object.defineProperty(element, "scrollHeight", {
        value: geometry.scrollHeight,
        configurable: true,
      });
      Object.defineProperty(element, "clientHeight", {
        value: geometry.clientHeight,
        configurable: true,
      });
      Object.defineProperty(element, "scrollTop", {
        get: () => current,
        set: (value: number) => {
          current = value;
        },
        configurable: true,
      });
    }

    function logListener(): (message: unknown) => void {
      const call = natsSubscribeMock.mock.calls.find((args) => args[0] === SUBJECT_1);
      expect(call, "listener do subject de log").toBeTruthy();
      return call![1] as (message: unknown) => void;
    }

    function emitLog(message: string) {
      act(() => {
        logListener()({
          data: {
            sessionId: "sess-1",
            agentId: AGENT_ID,
            level: "info",
            message,
            timestampUtc: new Date().toISOString(),
          },
        });
      });
    }

    it("mantém a área de logs como o scroller (root com h-screen)", async () => {
      const { container } = renderConsole();
      await waitFor(() => expect(natsSubscribeMock).toHaveBeenCalled());

      const root = container.firstElementChild as HTMLElement;
      expect(root.className).toContain("h-screen");
      expect(root.className).not.toContain("min-h-screen");
      expect(screen.getByTestId("log-scroll")).toBeTruthy();
    });

    it("com auto ligado, cada linha nova rola para o fim", async () => {
      renderConsole();
      await waitFor(() => expect(natsSubscribeMock).toHaveBeenCalled());

      const scroller = getScroller();
      setGeometry(scroller, { scrollHeight: 1000, clientHeight: 100, scrollTop: 900 });

      emitLog("linha nova");

      await waitFor(() => {
        expect(scroller.scrollTop).toBe(1000);
      });
    });

    it("em modo manual não rola e mostra o atalho para o fim", async () => {
      renderConsole();
      await waitFor(() => expect(natsSubscribeMock).toHaveBeenCalled());

      const scroller = getScroller();
      setGeometry(scroller, { scrollHeight: 1000, clientHeight: 100, scrollTop: 0 });

      // Rolar para longe do fim desliga o auto.
      fireEvent.scroll(scroller);
      await waitFor(() => expect(screen.getByText("scroll: manual")).toBeTruthy());

      emitLog("linha enquanto manual");
      expect(scroller.scrollTop).toBe(0);

      const jump = await screen.findByRole("button", { name: /ir para o fim/ });
      fireEvent.click(jump);

      await waitFor(() => expect(scroller.scrollTop).toBe(1000));
      expect(screen.queryByRole("button", { name: /ir para o fim/ })).toBeNull();
    });

    it("voltar perto do fim religa o modo auto", async () => {
      renderConsole();
      await waitFor(() => expect(natsSubscribeMock).toHaveBeenCalled());

      const scroller = getScroller();
      setGeometry(scroller, { scrollHeight: 1000, clientHeight: 100, scrollTop: 0 });
      fireEvent.scroll(scroller);
      await waitFor(() => expect(screen.getByText("scroll: manual")).toBeTruthy());

      scroller.scrollTop = 950; // dentro da tolerância de 20px do fim
      fireEvent.scroll(scroller);

      await waitFor(() => expect(screen.getByText("scroll: auto")).toBeTruthy());
    });
  });

});
