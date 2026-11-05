import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { DatasetCatalogItem } from "@/api/types";
import { StepDataSources } from "./StepDataSources";
import { useWizardState } from "./hooks/useWizardState";

function catalogItem(
  key: string,
  datasetType: string,
  alias: string,
  joinKeys: string[],
): DatasetCatalogItem {
  return {
    key,
    type: key,
    datasetType,
    name: key,
    fields: joinKeys,
    fieldMetadata: joinKeys.map((field) => ({
      field,
      reference: field,
      isJoinKey: true,
      defaultAlias: `${alias}.${field}`,
    })),
  };
}

const hardware = catalogItem("agentHardware", "4", "hw", ["agentId", "clientId", "siteId"]);
const sensors = catalogItem("agentSensors", "29", "sns", ["agentId", "clientId", "siteId"]);

/** Harness que exercita o par Hardware + Sensores, exatamente o caso do bug. */
function Harness() {
  const wizard = useWizardState();
  return (
    <div>
      <button onClick={() => wizard.addDataset(hardware)}>add-hw</button>
      <button onClick={() => wizard.addDataset(sensors)}>add-sns</button>
      <StepDataSources wizard={wizard} datasets={[hardware, sensors]} onNext={() => {}} />
    </div>
  );
}

function addBoth() {
  fireEvent.click(screen.getByText("add-hw"));
  fireEvent.click(screen.getByText("add-sns"));
}

describe("StepDataSources - seletores de join", () => {
  it("renderiza os 4 controles de join para a fonte secundaria", () => {
    render(<Harness />);
    addBoth();

    expect(screen.getByLabelText("Join com (fonte 2)")).toBeTruthy();
    expect(screen.getByLabelText("Source key (fonte 2)")).toBeTruthy();
    expect(screen.getByLabelText("Target key (fonte 2)")).toBeTruthy();
    expect(screen.getByLabelText("Tipo de join (fonte 2)")).toBeTruthy();
  });

  it("nao mostra mais o chip 'ON' vazio: mostra o par origem->destino", () => {
    render(<Harness />);
    addBoth();
    // Antes o chip era "ON " (joinSourceKey undefined).
    expect(screen.queryByText("sem join")).toBeNull();
    expect(screen.getByText("ON agentId → agentId")).toBeTruthy();
  });

  it("pre-seleciona agentId nos dois lados ao adicionar Sensores", () => {
    render(<Harness />);
    addBoth();
    expect((screen.getByLabelText("Source key (fonte 2)") as HTMLSelectElement).value).toBe("sns.agentId");
    expect((screen.getByLabelText("Target key (fonte 2)") as HTMLSelectElement).value).toBe("hw.agentId");
  });

  it("NAO acusa problema com Hardware + Sensores (regressao do bug)", () => {
    render(<Harness />);
    addBoth();
    expect(screen.queryByText("⚠️ Problemas detectados")).toBeNull();
  });

  it("mostra o aviso e bloqueia Proximo quando falta o join", () => {
    render(<Harness />);
    // Adiciona as duas fontes e limpa o join pelo proprio seletor.
    addBoth();
    fireEvent.change(screen.getByLabelText("Join com (fonte 2)"), {
      target: { value: "" },
    });

    expect(screen.getByText("⚠️ Problemas detectados")).toBeTruthy();
    const next = screen.getByRole("button", { name: /Próximo: Organização/ }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
  });

  it("Sensores aparece nas sugestoes de combinacao via agentId", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("add-hw"));
    expect(screen.getByText("💡 Sugestões de combinação")).toBeTruthy();
    expect(screen.getByText("via agentId")).toBeTruthy();
  });
});
