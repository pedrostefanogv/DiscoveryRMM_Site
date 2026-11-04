/**
 * Testes do editor dedicado de sensor Script (/sensors/script).
 *
 * Cobre o que o modal não consegue: presets de exit code que a API aceita,
 * exemplos de extrator por tipo e a preservação dos valores ao abrir um
 * sensor já salvo (o modal manda os JSONs atuais pela query string).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ScriptSensorEditorPage from "./ScriptSensorEditorPage";
import { SCRIPT_EXIT_PRESETS, SCRIPT_EXTRACTOR_EXAMPLES, parseExitCodeMapJson, validateScriptSensor } from "@/utils/sensorScriptValidation";

const listScripts = vi.fn();

vi.mock("@/hooks/useAutomation", () => ({
  useAutomationScripts: () => listScripts(),
}));

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/** Renderiza a página numa rota com query string, como o modal a abre. */
function renderPage(initialEntry = "/sensors/script") {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <ScriptSensorEditorPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  listScripts.mockReset();
  listScripts.mockReturnValue({
    data: {
      items: [
        { id: "s1", clientId: null, name: "Backup diário", summary: "", scriptType: 0, version: "1", isActive: true, lastUpdatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
      ],
    },
    isLoading: false,
  });
});
describe("editor de sensor de script", () => {
  it("mostra o seletor de script do catálogo", () => {
    renderPage();
    expect(screen.getByText("Backup diário")).toBeTruthy();
    expect(screen.getByText(/Protocolo MDZ no stdout/)).toBeTruthy();
  });

  it("aplica um preset de exit code e o resultado é aceito pelo backend", () => {
    renderPage();
    const preset = SCRIPT_EXIT_PRESETS.find((item) => item.id === "tactical")!;
    fireEvent.click(screen.getByLabelText("Usar preset tactical"));
    const campo = screen.getByLabelText("Mapa de exit codes (JSON)") as HTMLTextAreaElement;
    expect(campo.value).toBe(preset.json);
    const parsed = parseExitCodeMapJson(campo.value);
    expect(parsed.error, "preset precisa ser JSON válido").toBeNull();
    expect(parsed.map.rules.length).toBeGreaterThan(0);
  });

  it("aplica um exemplo de extrator e ele passa na validação", () => {
    renderPage();
    fireEvent.click(screen.getByLabelText("Usar exemplo regex"));
    const campo = screen.getByLabelText("Extratores (JSON)") as HTMLTextAreaElement;
    expect(campo.value).toBe(SCRIPT_EXTRACTOR_EXAMPLES.find((item) => item.id === "regex")!.json);
    expect(validateScriptSensor(campo.value, "", []).errors).toEqual([]);
  });

  it("abrir um sensor já salvo não perde nenhum valor", () => {
    const extractors = SCRIPT_EXTRACTOR_EXAMPLES.find((item) => item.id === "mdz")!.json;
    const exitMap = SCRIPT_EXIT_PRESETS.find((item) => item.id === "nerdy")!.json;
    const entrada =
      "/sensors/script?scriptId=s1&channels=livre_gb,fila&extractorsJson=" +
      encodeURIComponent(extractors) +
      "&exitCodeMapJson=" +
      encodeURIComponent(exitMap);
    renderPage(entrada);
    expect((screen.getByLabelText("Extratores (JSON)") as HTMLTextAreaElement).value).toBe(extractors);
    expect((screen.getByLabelText("Mapa de exit codes (JSON)") as HTMLTextAreaElement).value).toBe(exitMap);
    expect((screen.getByLabelText("Canais de métrica (chaves)") as HTMLTextAreaElement).value).toBe("livre_gb,fila");
  });

  it("avisa em português quando o extrator está inválido", () => {
    renderPage();
    const campo = screen.getByLabelText("Extratores (JSON)") as HTMLTextAreaElement;
    fireEvent.change(campo, { target: { value: "[{\"channel\":\"a\",\"type\":\"regex\"}]" } });
    expect(screen.getByText(/Corrija antes de salvar/)).toBeTruthy();
    expect(screen.getByText(/extrator regex exige o campo regex/)).toBeTruthy();
  });

  it("gera o esqueleto de extratores a partir dos canais declarados", () => {
    renderPage();
    const canais = screen.getByLabelText("Canais de métrica (chaves)") as HTMLTextAreaElement;
    fireEvent.change(canais, { target: { value: "livre_gb, fila" } });
    fireEvent.click(screen.getByText("Gerar extratores mdz para os canais"));
    const extratores = screen.getByLabelText("Extratores (JSON)") as HTMLTextAreaElement;
    const parsed = JSON.parse(extratores.value) as { channel: string; type: string }[];
    expect(parsed.map((item) => item.channel)).toEqual(["livre_gb", "fila"]);
    expect(parsed.every((item) => item.type === "mdz")).toBe(true);
  });
});
