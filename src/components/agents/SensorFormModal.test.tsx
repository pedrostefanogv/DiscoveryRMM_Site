import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import SensorFormModal from "./SensorFormModal";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** As consultas auxiliares do modal rodam sem backend: uma QueryClient nova por teste. */
function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/** Abre o modal em modo criação (sensor = null). */
function renderModal() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter>
      <SensorFormModal
        open
        onClose={() => {}}
        agentId="agent-1"
        clientId={null}
        siteId={null}
        sensor={null}
        isSaving={false}
        onSave={async () => {}}
      />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** O select de Tipo é o que carrega SENSOR_TYPE_OPTIONS. */
function selectTipo(): HTMLSelectElement {
  return screen.getByLabelText("Tipo") as HTMLSelectElement;
}

/** O campo Alvo, alvo dos cliques de exemplo. */
function inputAlvo(): HTMLInputElement {
  return screen.getByLabelText("Alvo") as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => cleanup());

describe("guia por tipo no formulário de sensor", () => {
  it("mostra alvo esperado, campos relacionados e exemplos do tipo", () => {
    renderModal();
    const guia = screen.getByTestId("sensor-type-guide");
    expect(guia).toBeTruthy();
    // Tipo padrão do formulário é DiskSpace.
    expect(guia.textContent).toContain("Alvo esperado");
    expect(guia.textContent).toContain("Campos relacionados");
    expect(guia.textContent).toContain("clique para preencher o alvo");
    expect(screen.getByRole("button", { name: "Usar exemplo de alvo C:" })).toBeTruthy();
  });

  it("clicar num exemplo preenche o Alvo", () => {
    renderModal();
    expect(inputAlvo().value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Usar exemplo de alvo C:" }));
    expect(inputAlvo().value).toBe("C:");
  });

  it("trocar o tipo troca os exemplos e o campo relacionados", () => {
    renderModal();
    fireEvent.change(selectTipo(), { target: { value: "TcpPort" } });
    const guia = screen.getByTestId("sensor-type-guide");
    expect(guia.textContent).toContain("host:porta");
    expect(guia.textContent).toContain("Timeout em segundos");
    fireEvent.click(screen.getByRole("button", { name: "Usar exemplo de alvo 10.0.0.1:443" }));
    expect(inputAlvo().value).toBe("10.0.0.1:443");
  });

  it("avisa quando o tipo não usa limiar numérico", () => {
    renderModal();
    fireEvent.change(selectTipo(), { target: { value: "Service" } });
    expect(screen.getByTestId("sensor-type-guide").textContent).toContain(
      "não usa limiar",
    );
  });

  it("mostra o exemplo de optionsJson do tipo", () => {
    renderModal();
    fireEvent.change(selectTipo(), { target: { value: "Bandwidth" } });
    const guia = screen.getByTestId("sensor-type-guide");
    expect(guia.textContent).toContain("optionsJson");
    expect(guia.textContent).toContain("sampleMs");
  });
});
