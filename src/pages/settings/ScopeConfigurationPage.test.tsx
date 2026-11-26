import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => {
  const noop = () => {};
  const mutateAsync = async () => undefined;
  const noopMutationResult = { mutateAsync, isPending: false };

  return {
    clientsResult: {
      data: [{ id: "c1", name: "Acme Corp" }],
      isLoading: false,
      isError: false,
      refetch: noop,
    },
    sitesResultWithClient: {
      data: [{ id: "s1", clientId: "c1", name: "Matriz SP" }],
      isLoading: false,
      isError: false,
      refetch: noop,
    },
    sitesResultEmpty: {
      data: [],
      isLoading: false,
      isError: false,
      refetch: noop,
    },
    clientConfigActive: {
      data: { recoveryEnabled: null, tpmRecoveryEnabled: null },
      isLoading: false,
      isError: false,
      refetch: noop,
    },
    clientEffectiveActive: {
      data: {
        recoveryEnabled: true,
        inheritance: { RecoveryEnabled: 2 },
        blockedFields: [],
        resolvedAt: "2026-11-21T10:00:00Z",
      },
      isLoading: false,
      isError: false,
      refetch: noop,
    },
    siteConfigActive: {
      data: { recoveryEnabled: null, tpmRecoveryEnabled: null },
      isLoading: false,
      isError: false,
      refetch: noop,
    },
    siteEffectiveActive: {
      data: {
        recoveryEnabled: false,
        inheritance: { RecoveryEnabled: 4 },
        blockedFields: ["SupportEnabled"],
        resolvedAt: "2026-11-21T10:00:00Z",
      },
      isLoading: false,
      isError: false,
      refetch: noop,
    },
    emptyQuery: {
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: noop,
    },
    metadataResult: {
      data: { fields: [], agentHomeTabOptions: [] },
      isLoading: false,
      isError: false,
      refetch: noop,
    },
    noopMutation: () => noopMutationResult,
  };
});

vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/hooks/useClients", () => ({
  useClients: () => fixtures.clientsResult,
}));

vi.mock("@/hooks/useSites", () => ({
  useSites: (clientId?: string) =>
    clientId ? fixtures.sitesResultWithClient : fixtures.sitesResultEmpty,
}));

vi.mock("@/hooks/useConfigurationApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useConfigurationApi")>();
  return {
    ...actual,
    useClientConfig: (clientId: string) =>
      clientId ? fixtures.clientConfigActive : fixtures.emptyQuery,
    useClientEffectiveConfig: (clientId: string) =>
      clientId ? fixtures.clientEffectiveActive : fixtures.emptyQuery,
    useClientMetadata: () => fixtures.metadataResult,
    useSiteConfig: (siteId: string) =>
      siteId ? fixtures.siteConfigActive : fixtures.emptyQuery,
    useSiteEffectiveConfig: (siteId: string) =>
      siteId ? fixtures.siteEffectiveActive : fixtures.emptyQuery,
    useSiteMetadata: () => fixtures.metadataResult,
    useUpsertClientConfig: fixtures.noopMutation,
    usePatchClientConfig: fixtures.noopMutation,
    useDeleteClientConfig: fixtures.noopMutation,
    useResetClientProperty: fixtures.noopMutation,
    useUpsertSiteConfig: fixtures.noopMutation,
    usePatchSiteConfig: fixtures.noopMutation,
    useDeleteSiteConfig: fixtures.noopMutation,
    useResetSiteProperty: fixtures.noopMutation,
  };
});

vi.mock("@/components/configuration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/configuration")>();
  const Null = () => null;
  return {
    ...actual,
    ConfigurationFieldEditor: ({ fieldLabel }: { fieldLabel: string }) => <div>{fieldLabel}</div>,
    MaintenanceWindowCard: Null,
    BackgroundProcessingCard: Null,
    RemoteAccessConsentSection: Null,
  };
});

import ScopeConfigurationPage from "./ScopeConfigurationPage";

function renderPage(initialTab?: "client" | "site" | "effective") {
  return render(
    <MemoryRouter>
      <ScopeConfigurationPage initialTab={initialTab} />
    </MemoryRouter>,
  );
}

afterEach(() => cleanup());

describe("ScopeConfigurationPage (unificada)", () => {
  it("renderiza as 3 abas e mantém o cliente selecionado ao trocar de aba", () => {
    renderPage("client");

    const clientTab = screen.getByRole("tab", { name: "Cliente" });
    const siteTab = screen.getByRole("tab", { name: "Site" });
    const effectiveTab = screen.getByRole("tab", { name: "Simulador Efetivo" });

    expect(clientTab.getAttribute("aria-selected")).toBe("true");

    // Seleciona um cliente
    fireEvent.change(screen.getByRole("combobox", { name: "Cliente" }), {
      target: { value: "c1" },
    });
    expect(screen.getByText("Funcionalidades do Sistema")).toBeTruthy();

    // Troca para Site: cliente continua selecionado
    fireEvent.click(siteTab);
    expect(siteTab.getAttribute("aria-selected")).toBe("true");
    expect(
      (screen.getByRole("combobox", { name: "Cliente" }) as HTMLSelectElement).value,
    ).toBe("c1");
    expect(screen.getByRole("combobox", { name: "Site" })).toBeTruthy();

    // Seleciona um site e vai para Simulador Efetivo
    fireEvent.change(screen.getByRole("combobox", { name: "Site" }), {
      target: { value: "s1" },
    });
    fireEvent.click(effectiveTab);
    expect(effectiveTab.getAttribute("aria-selected")).toBe("true");
    expect(
      (screen.getByRole("combobox", { name: "Cliente" }) as HTMLSelectElement).value,
    ).toBe("c1");
    expect(
      (screen.getByRole("combobox", { name: "Site (opcional)" }) as HTMLSelectElement).value,
    ).toBe("s1");
    expect(screen.getByText("Origem dos valores")).toBeTruthy();
    expect(screen.getByText("SupportEnabled")).toBeTruthy();
  });

  it("mostra o Cofre TPM entre os campos de funcionalidades do cliente", () => {
    renderPage("client");

    fireEvent.change(screen.getByRole("combobox", { name: "Cliente" }), {
      target: { value: "c1" },
    });

    // WS7: o campo herdável novo precisa existir no catálogo renderizado do escopo.
    expect(screen.getByText("Cofre TPM (recuperação pós-formatação)")).toBeTruthy();
  });
});
