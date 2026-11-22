import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigurationAuditEntry } from "@/api";
import ConfigurationAudit from "./ConfigurationAudit";

const mockRecent = vi.fn();
const mockEntity = vi.fn();
const mockField = vi.fn();
const mockByUser = vi.fn();
const mockReport = vi.fn();

vi.mock("@/hooks/useClients", () => ({
  useClients: () => ({
    data: [
      { id: "11111111-1111-1111-1111-111111111111", name: "Cliente Alpha" },
    ],
  }),
}));

vi.mock("@/hooks/useSites", () => ({
  useAllSites: () => ({
    data: [
      { id: "22222222-2222-2222-2222-222222222222", name: "Matriz" },
    ],
  }),
}));

vi.mock("@/hooks/useConfigurationApi", () => ({
  useRecentConfigurationAudit: (...args: unknown[]) => mockRecent(...args),
  useEntityConfigurationAudit: (...args: unknown[]) => mockEntity(...args),
  useFieldConfigurationAudit: (...args: unknown[]) => mockField(...args),
  useConfigurationAuditByUser: (...args: unknown[]) => mockByUser(...args),
  useConfigurationAuditReport: (...args: unknown[]) => mockReport(...args),
}));

const sampleEntries: ConfigurationAuditEntry[] = [
  {
    id: "audit-1",
    entityType: "Server",
    entityId: "00000000-0000-0000-0000-000000000001",
    fieldName: "aiSettings",
    oldValue: '{"enabled":false}',
    newValue: '{"enabled":true}',
    reason: "Ativação de IA",
    changedBy: "admin",
    changedAt: "2026-01-15T10:00:00Z",
    ipAddress: "10.0.0.15",
    entityVersion: 2,
  },
  {
    id: "audit-2",
    entityType: "Client",
    entityId: "11111111-1111-1111-1111-111111111111",
    fieldName: "retentionDays",
    oldValue: "30",
    newValue: "90",
    reason: "Política contratual",
    changedBy: "pedro",
    changedAt: "2026-01-16T11:00:00Z",
    ipAddress: "10.0.0.20",
    entityVersion: 4,
  },
];

function makeQueryResult(data: ConfigurationAuditEntry[]) {
  return {
    data,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  };
}

function renderPage(initialEntry = "/settings/audit") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ConfigurationAudit />
    </MemoryRouter>,
  );
}

describe("ConfigurationAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecent.mockReturnValue(makeQueryResult(sampleEntries));
    mockEntity.mockReturnValue(makeQueryResult([]));
    mockField.mockReturnValue(makeQueryResult([]));
    mockByUser.mockReturnValue(makeQueryResult([]));
    mockReport.mockReturnValue(makeQueryResult([]));
  });

  it("habilita apenas useRecentConfigurationAudit por padrão", () => {
    renderPage();

    expect(mockRecent).toHaveBeenLastCalledWith(30, 200, true);
    expect(mockEntity).toHaveBeenLastCalledWith("Server", "", 200, false);
    expect(mockField).toHaveBeenLastCalledWith("Server", "", "", false);
    expect(mockByUser).toHaveBeenLastCalledWith("", 200, false);
    expect(mockReport).toHaveBeenLastCalledWith("", "", false);
  });

  it("habilita apenas useConfigurationAuditReport com intervalo UTC e desabilita queries em intervalo invertido", () => {
    renderPage();

    const startInput = screen.getByLabelText("Data início");
    const endInput = screen.getByLabelText("Data fim");

    fireEvent.change(startInput, { target: { value: "2026-01-01" } });
    fireEvent.change(endInput, { target: { value: "2026-01-10" } });

    expect(mockReport).toHaveBeenLastCalledWith(
      new Date("2026-01-01T00:00:00").toISOString(),
      new Date("2026-01-10T23:59:59.999").toISOString(),
      true,
    );
    expect(mockRecent).toHaveBeenLastCalledWith(30, 200, false);

    fireEvent.change(endInput, { target: { value: "2025-12-31" } });

    expect(
      screen.getByText("A data final não pode ser anterior à data inicial."),
    ).toBeTruthy();
    expect(mockReport).toHaveBeenLastCalledWith("", "", false);
    expect(mockRecent).toHaveBeenLastCalledWith(30, 200, false);
  });

  it("filtra por Entidade = Cliente localmente sem exigir Entity ID e exibe seletor de clientes", () => {
    renderPage();

    const entitySelect = screen.getByLabelText("Entidade");
    fireEvent.change(entitySelect, { target: { value: "Client" } });

    expect(screen.getByLabelText("Cliente")).toBeTruthy();
    expect(screen.getByText("Cliente: Cliente Alpha")).toBeTruthy();
    expect(screen.queryByText("aiSettings")).toBeNull();
    expect(mockEntity).toHaveBeenLastCalledWith("Client", "", 200, false);
  });

  it("formata JSON em valor antigo/novo e renderiza motivo e IP", () => {
    renderPage();

    expect(screen.getByText(/"enabled": false/)).toBeTruthy();
    expect(screen.getByText(/"enabled": true/)).toBeTruthy();
    expect(screen.getByText("Motivo: Ativação de IA")).toBeTruthy();
    expect(screen.getByText("IP: 10.0.0.15")).toBeTruthy();
  });
});
