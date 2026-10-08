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

    fireEvent.click(screen.getByText("Configuracao Avancada (Parametros)"));

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

    fireEvent.click(screen.getByText("Configuracao Avancada (Parametros)"));
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
    fireEvent.click(screen.getByText("Configuracao Avancada (Parametros)"));

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

    fireEvent.click(screen.getByText("Configuracao Avancada (Parametros)"));
    expect(container.querySelector<HTMLInputElement>(ROUNDS_SELECTOR)!.value).toBe("10");
  });

  it("explica que o parâmetro é global e qual o mínimo", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<AiIntegrationCard aiSettings={settings} onSave={onSave} />);
    await waitFor(() => expect(listOpenRouterModels).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Configuracao Avancada (Parametros)"));
    expect(screen.getByText(/GLOBAL do servidor/)).toBeTruthy();
    expect(screen.getByText(/mínimo 3/)).toBeTruthy();
  });
});
