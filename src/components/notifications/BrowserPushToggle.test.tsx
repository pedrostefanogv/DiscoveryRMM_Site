import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { useWebPushStateMock } = vi.hoisted(() => ({ useWebPushStateMock: vi.fn() }));

vi.mock("@/hooks/useWebPush", () => ({
  useWebPushState: useWebPushStateMock,
}));

import { BrowserPushToggle } from "./BrowserPushToggle";

function state(patch: Record<string, unknown>) {
  return {
    status: "loading",
    subscriptionCount: 0,
    busy: false,
    error: null,
    lastTest: null,
    ...patch,
  };
}

describe("BrowserPushToggle", () => {
  it("nao depende do AuthProvider (le apenas o estado compartilhado)", () => {
    useWebPushStateMock.mockReturnValue(state({ status: "unsupported" }));

    render(<BrowserPushToggle />);

    expect(screen.getByText(/nao suporta notificacoes do sistema/i)).toBeTruthy();
  });

  it("oferece ativar quando ha suporte e a permissao esta pendente", () => {
    useWebPushStateMock.mockReturnValue(state({ status: "prompt" }));

    render(<BrowserPushToggle />);

    expect(screen.getByRole("button", { name: "Ativar" })).toBeTruthy();
  });

  it("mostra ativo e acoes de teste/desativar quando inscrito", () => {
    useWebPushStateMock.mockReturnValue(state({ status: "subscribed", subscriptionCount: 2 }));

    render(<BrowserPushToggle />);

    expect(screen.getByText("Ativo")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar notificacao de teste" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Desativar notificacoes do navegador" })).toBeTruthy();
  });

  it("explica o bloqueio quando a permissao foi negada", () => {
    useWebPushStateMock.mockReturnValue(state({ status: "denied" }));

    render(<BrowserPushToggle />);

    expect(screen.getByText(/Permissao bloqueada/i)).toBeTruthy();
  });
});
