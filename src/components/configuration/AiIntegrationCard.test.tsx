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
    // min=0 porque 0 = AUTOMÁTICO é um valor válido e digitável neste campo.
    const tokens = container.querySelector<HTMLInputElement>(
      'input[type="number"][min="0"][max="450000"]',
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
    // Campo de tokens limpo (NaN) cai em AUTOMÁTICO (0), não mais no 2000 fixo
    // que truncava o card A2UI. 0 é um valor que o backend entende.
    expect(payload.maxTokensPerRequest).toBe(0);
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

/**
 * Orçamento de tokens de SAÍDA com "0 = AUTOMÁTICO".
 *
 * O card A2UI truncava porque o pedido ficava em 2000 enquanto o modelo suporta
 * centenas de milhares de tokens de saída. O modo automático deixa o backend
 * derivar o orçamento da capacidade real do modelo.
 *
 * Contrato do backend (AiTokenLimits.ResolveOutputCap):
 *   cap = max(200, min(pedido, teto do departamento, capacidade do MODELO, teto do produto))
 * 0 = automático; 1..99 = tratado como automático; 100..450000 = respeitado.
 */
describe("AiIntegrationCard - orçamento de tokens (0 = automático)", () => {
  beforeEach(() => {
    listOpenRouterModels.mockResolvedValue({ chatModels: [], embeddingModels: [] });
    validateApiKey.mockResolvedValue({ valid: true });
  });

  const settings: AIIntegrationSettings = {
    enabled: true,
    chatAIEnabled: true,
    knowledgeBaseEnabled: false,
  };

  const TOKENS_SELECTOR = 'input[type="number"][min="0"][max="450000"]';

  const openAdvanced = () =>
    fireEvent.click(screen.getByText("Configuração Avançada (Parâmetros)"));

  const saveAndRead = async (onSave: ReturnType<typeof vi.fn>) => {
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    return JSON.parse(String(onSave.mock.calls[0][0])) as AIIntegrationSettings;
  };

  it("usa o teto do produto novo (450000) no input, não o antigo 32768", async () => {
    const { container } = render(<AiIntegrationCard aiSettings={settings} onSave={vi.fn()} />);
    await waitFor(() => expect(listOpenRouterModels).toHaveBeenCalled());
    openAdvanced();

    const tokens = container.querySelector<HTMLInputElement>(TOKENS_SELECTOR);
    expect(tokens).not.toBeNull();
    expect(tokens!.getAttribute("max")).toBe("450000");
    // O teto antigo não pode sobrar em lugar nenhum do campo.
    expect(container.querySelector('input[type="number"][max="32768"]')).toBeNull();
  });

  it("explica que 0 é automático e que o valor efetivo é o MENOR entre os limites", async () => {
    render(<AiIntegrationCard aiSettings={settings} onSave={vi.fn()} />);
    await waitFor(() => expect(listOpenRouterModels).toHaveBeenCalled());
    openAdvanced();

    // O texto pode estar no <strong> e no parágrafo pai: getAllByText evita
    // ambiguidade (o placeholder do input não é text node).
    expect(screen.getAllByText(/0 = automático/).length).toBeGreaterThan(0);
    // Não promete 450000 efetivo: o backend aplica o menor entre pedido, depto,
    // capacidade do modelo e teto do produto.
    expect(screen.getByText(/capacidade real do modelo/)).toBeTruthy();
    expect(screen.getByText(/teto do produto/)).toBeTruthy();
  });

  it("o atalho 'Automático' preenche 0 e salva 0 (valor legítimo, não o padrão)", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <AiIntegrationCard aiSettings={{ ...settings, maxTokensPerRequest: 2000 }} onSave={onSave} />,
    );
    await waitFor(() => expect(listOpenRouterModels).toHaveBeenCalled());
    openAdvanced();

    const tokens = container.querySelector<HTMLInputElement>(TOKENS_SELECTOR)!;
    expect(tokens.value).toBe("2000");

    fireEvent.click(screen.getByRole("button", { name: "Automático" }));
    expect(tokens.value).toBe("0");

    const payload = await saveAndRead(onSave);
    expect(payload.maxTokensPerRequest).toBe(0);
  });

  it("preserva 0 gravado no servidor (não troca por um número arbitrário)", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <AiIntegrationCard aiSettings={{ ...settings, maxTokensPerRequest: 0 }} onSave={onSave} />,
    );
    await waitFor(() => expect(listOpenRouterModels).toHaveBeenCalled());
    openAdvanced();

    const payload = await saveAndRead(onSave);
    expect(payload.maxTokensPerRequest).toBe(0);
  });

  it("aceita a faixa 100..450000 e envia o valor escolhido", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<AiIntegrationCard aiSettings={settings} onSave={onSave} />);
    await waitFor(() => expect(listOpenRouterModels).toHaveBeenCalled());
    openAdvanced();

    const tokens = container.querySelector<HTMLInputElement>(TOKENS_SELECTOR)!;

    fireEvent.change(tokens, { target: { value: "100" } });
    expect(screen.queryByText(/Abaixo de 100/)).toBeNull();
    expect((await saveAndRead(onSave)).maxTokensPerRequest).toBe(100);

    onSave.mockClear();
    fireEvent.change(tokens, { target: { value: "450000" } });
    expect(screen.queryByText(/Acima do teto/)).toBeNull();
    expect((await saveAndRead(onSave)).maxTokensPerRequest).toBe(450000);
  });

  it("rejeita 1..99 com mensagem explicativa apontando o automático", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<AiIntegrationCard aiSettings={settings} onSave={onSave} />);
    await waitFor(() => expect(listOpenRouterModels).toHaveBeenCalled());
    openAdvanced();

    const tokens = container.querySelector<HTMLInputElement>(TOKENS_SELECTOR)!;
    fireEvent.change(tokens, { target: { value: "50" } });

    expect(screen.getByText(/Abaixo de 100 use 0 para automático/)).toBeTruthy();
    // Fora da faixa cai em automático, nunca grava o número rejeitado.
    expect((await saveAndRead(onSave)).maxTokensPerRequest).toBe(0);
  });

  it("rejeita valor negativo e acima do teto, caindo em automático", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<AiIntegrationCard aiSettings={settings} onSave={onSave} />);
    await waitFor(() => expect(listOpenRouterModels).toHaveBeenCalled());
    openAdvanced();

    const tokens = container.querySelector<HTMLInputElement>(TOKENS_SELECTOR)!;

    fireEvent.change(tokens, { target: { value: "-5" } });
    expect(screen.getByText(/Não use valor negativo/)).toBeTruthy();
    expect((await saveAndRead(onSave)).maxTokensPerRequest).toBe(0);

    onSave.mockClear();
    fireEvent.change(tokens, { target: { value: "450001" } });
    expect(screen.getByText(/Acima do teto do produto/)).toBeTruthy();
    expect((await saveAndRead(onSave)).maxTokensPerRequest).toBe(0);
  });

  it("avisa que o campo fora da faixa será salvo como o padrão", async () => {
    const { container } = render(<AiIntegrationCard aiSettings={settings} onSave={vi.fn()} />);
    await waitFor(() => expect(listOpenRouterModels).toHaveBeenCalled());
    openAdvanced();

    const tokens = container.querySelector<HTMLInputElement>(TOKENS_SELECTOR)!;
    // 0 (automático) é válido: NÃO pode disparar o aviso genérico.
    expect(screen.queryByText(/campo numérico vazio/)).toBeNull();

    fireEvent.change(tokens, { target: { value: "10" } });
    expect(screen.getByText(/campo numérico vazio/)).toBeTruthy();
  });
});
