import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listOpenRouterModels = vi.fn();
const validateApiKey = vi.fn();

vi.mock("@/services/configurationApi", () => ({
  listOpenRouterModels: (...args: unknown[]) => listOpenRouterModels(...args),
  validateApiKey: (...args: unknown[]) => validateApiKey(...args),
}));

import { AiIntegrationCard } from "./AiIntegrationCard";
import type { AIIntegrationSettings } from "@/api";

const ROUNDS_SELECTOR = 'input[type="number"][min="3"][max="20"]';

// maxToolCallIterations: o valor só existia no JSON do servidor (homolog ficou
// com 3 e o clique em "Atualizar" no chat era abortado com "orçamento esgotado
// (4/3)"). Depois, sem faixa no formulário, o campo aceitava 0/1/NaN — valores
// que o servidor ignora (cai no default 10) sem o admin perceber.
describe("AiIntegrationCard - rounds de ferramentas (MCP)", () => {
  beforeEach(() => {
    listOpenRouterModels.mockResolvedValue({ chatModels: [], embeddingModels: [] });
    validateApiKey.mockResolvedValue({ valid: true });
  });

  const settings: AIIntegrationSettings = {
    enabled: true,
    chatAIEnabled: true,
    knowledgeBaseEnabled: false,
    maxToolCallIterations: 10,
  };

  it("mostra o valor configurado e envia maxToolCallIterations no save", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<AiIntegrationCard aiSettings={settings} onSave={onSave} />);
    await waitFor(() => expect(listOpenRouterModels).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Configuração Avançada (Parâmetros)"));

    const rounds = container.querySelector<HTMLInputElement>(ROUNDS_SELECTOR);
    expect(rounds).not.toBeNull();
    expect(rounds!.value).toBe("10");

    fireEvent.change(rounds!, { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(String(onSave.mock.calls[0][0])) as AIIntegrationSettings;
    expect(payload.maxToolCallIterations).toBe(15);
  });

  it("normaliza valor fora da faixa ao salvar e avisa o usuário", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<AiIntegrationCard aiSettings={settings} onSave={onSave} />);
    await waitFor(() => expect(listOpenRouterModels).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Configuração Avançada (Parâmetros)"));
    const rounds = container.querySelector<HTMLInputElement>(ROUNDS_SELECTOR)!;

    // 0 (ou campo vazio) é inválido: o servidor cairia no default 10.
    fireEvent.change(rounds, { target: { value: "0" } });
    expect(screen.getByText(/fora da faixa/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(
      (JSON.parse(String(onSave.mock.calls[0][0])) as AIIntegrationSettings).maxToolCallIterations,
    ).toBe(3);

    // 99 acima do teto do servidor (20).
    onSave.mockClear();
    fireEvent.change(rounds, { target: { value: "99" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(
      (JSON.parse(String(onSave.mock.calls[0][0])) as AIIntegrationSettings).maxToolCallIterations,
    ).toBe(20);
  });

  it("trata valor abaixo do mínimo gravado à mão (1) como fora da faixa", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <AiIntegrationCard aiSettings={{ ...settings, maxToolCallIterations: 1 }} onSave={onSave} />,
    );
    await waitFor(() => expect(listOpenRouterModels).toHaveBeenCalled());
    fireEvent.click(screen.getByText("Configuração Avançada (Parâmetros)"));

    expect(screen.getByText(/fora da faixa/)).toBeTruthy();
    expect(container.querySelector<HTMLInputElement>(ROUNDS_SELECTOR)!.value).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(
      (JSON.parse(String(onSave.mock.calls[0][0])) as AIIntegrationSettings).maxToolCallIterations,
    ).toBe(3);
  });

  it("usa 10 como padrão quando o servidor não tem o campo (JSON antigo)", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <AiIntegrationCard
        aiSettings={{ enabled: true, chatAIEnabled: true, knowledgeBaseEnabled: false }}
        onSave={onSave}
      />,
    );
    await waitFor(() => expect(listOpenRouterModels).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Configuração Avançada (Parâmetros)"));
    expect(container.querySelector<HTMLInputElement>(ROUNDS_SELECTOR)!.value).toBe("10");
  });

  it("mostra as dimensões do vetor como informação (sem campo editável)", async () => {
    const { container } = render(
      <AiIntegrationCard
        aiSettings={{
          ...settings,
          embeddingModel: "openai/text-embedding-3-small",
          embeddingDimensions: 1536,
        }}
        onSave={vi.fn()}
      />,
    );
    await waitFor(() => expect(listOpenRouterModels).toHaveBeenCalled());

    expect(screen.getByText("Dimensões do vetor")).toBeTruthy();
    expect(screen.getByText("1536")).toBeTruthy();
    // O antigo input livre de dimensões (min=1, step=1) não existe mais:
    // dimensões são propriedade do modelo de embedding.
    expect(container.querySelector('input[type="number"][min="1"][step="1"]')).toBeNull();
  });

  it("normaliza campos numéricos vazios ao salvar (nunca envia null)", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<AiIntegrationCard aiSettings={settings} onSave={onSave} />);
    await waitFor(() => expect(listOpenRouterModels).toHaveBeenCalled());
    fireEvent.click(screen.getByText("Configuração Avançada (Parâmetros)"));

    const topP = container.querySelector<HTMLInputElement>(
      'input[type="number"][min="0.01"][max="1"]',
    )!;
    const tokens = container.querySelector<HTMLInputElement>(
      'input[type="number"][min="100"][max="32768"]',
    )!;

    // Campo limpo vira 0 no input numérico. top-p 0 e 0 tokens são inválidos:
    // o provedor rejeita top_p=0 e JSON.stringify(NaN/0) já causou reset das
    // configurações de IA no servidor (null não desserializa para double/int).
    fireEvent.change(topP, { target: { value: "" } });
    fireEvent.change(tokens, { target: { value: "" } });
    expect(screen.getByText(/campo numérico vazio/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    const payload = JSON.parse(String(onSave.mock.calls[0][0])) as AIIntegrationSettings;
    expect(payload.topP).toBe(1);
    expect(payload.maxTokensPerRequest).toBe(2000);
    expect(typeof payload.temperature).toBe("number");
    expect(JSON.stringify(payload)).not.toContain("null");
  });

  it("libera as dimensões quando o modelo de embedding não está no catálogo", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <AiIntegrationCard
        aiSettings={{
          ...settings,
          embeddingModel: "meu/embed-custom",
          embeddingDimensions: 768,
        }}
        onSave={onSave}
      />,
    );
    await waitFor(() => expect(listOpenRouterModels).toHaveBeenCalled());

    // Modelo self-hosted: sem catálogo não há como derivar as dimensões, então o
    // campo volta a ser editável (única situação em que isso é necessário).
    const dims = container.querySelector<HTMLInputElement>(
      'input[type="number"][min="1"][max="8192"]',
    );
    expect(dims).not.toBeNull();
    expect(dims!.value).toBe("768");

    fireEvent.change(dims!, { target: { value: "1024" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(
      (JSON.parse(String(onSave.mock.calls[0][0])) as AIIntegrationSettings).embeddingDimensions,
    ).toBe(1024);
  });

  it("explica temperatura, top-p e penalidades", async () => {
    render(<AiIntegrationCard aiSettings={settings} onSave={vi.fn()} />);
    await waitFor(() => expect(listOpenRouterModels).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Configuração Avançada (Parâmetros)"));

    expect(screen.getByText(/Quão variada é a resposta/)).toBeTruthy();
    expect(screen.getByText(/Recorte do vocabulário considerado/)).toBeTruthy();
    expect(screen.getByText(/Pune a repetição de palavras/)).toBeTruthy();
    expect(screen.getByText(/Incentiva trazer assuntos novos/)).toBeTruthy();
  });

  it("explica que o parâmetro é global e qual o mínimo", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<AiIntegrationCard aiSettings={settings} onSave={onSave} />);
    await waitFor(() => expect(listOpenRouterModels).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Configuração Avançada (Parâmetros)"));
    // "GLOBAL do servidor" aparece no subtítulo do card e na ajuda de rounds.
    expect(screen.getAllByText(/GLOBAL do servidor/).length).toBeGreaterThan(0);
    expect(screen.getByText(/mínimo 3/)).toBeTruthy();
  });
});
