import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  REMOTE_CONSENT_FIELD_KEYS,
  RemoteAccessConsentSection,
  type RemoteConsentFieldState,
} from "./RemoteAccessConsentSection";

function buildState(
  overrides: Partial<Record<string, Partial<RemoteConsentFieldState>>> = {},
): Record<string, RemoteConsentFieldState> {
  const base: Record<string, string> = {
    [REMOTE_CONSENT_FIELD_KEYS.mode]: "Prompt",
    [REMOTE_CONSENT_FIELD_KEYS.timeout]: "15",
    [REMOTE_CONSENT_FIELD_KEYS.action]: "Deny",
    [REMOTE_CONSENT_FIELD_KEYS.banner]: "true",
    [REMOTE_CONSENT_FIELD_KEYS.message]: "{operator} solicita acesso remoto.",
    [REMOTE_CONSENT_FIELD_KEYS.bannerText]: "Sessão remota em andamento: {operator}",
  };

  const state: Record<string, RemoteConsentFieldState> = {};
  for (const [key, value] of Object.entries(base)) {
    state[key] = {
      value,
      inherited: false,
      origin: "Site",
      ...overrides[key],
    };
  }
  return state;
}

function renderSection(
  state = buildState(),
  handlers: Partial<Parameters<typeof RemoteAccessConsentSection>[0]> = {},
) {
  return render(
    <RemoteAccessConsentSection
      state={state}
      previewContext={{ client: "ACME", site: "Matriz" }}
      onChange={vi.fn()}
      onToggleInherit={vi.fn()}
      onResetField={vi.fn()}
      onSave={vi.fn()}
      onDiscard={vi.fn()}
      {...handlers}
    />,
  );
}

describe("RemoteAccessConsentSection", () => {
  it("mostra o modo atual selecionado e as três opções", () => {
    renderSection();

    const group = screen.getByRole("radiogroup", { name: "Modo de autorização" });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(3);
    const selected = radios.filter((radio) => radio.getAttribute("aria-checked") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain("Solicitar autorização");
  });

  it("continua editável mesmo em um modo que ignora o campo (preparar para depois)", () => {
    const onChange = vi.fn();
    const state = buildState({ [REMOTE_CONSENT_FIELD_KEYS.mode]: { value: "NotifyOnly" } });
    const { container } = renderSection(state, { onChange });

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    expect(textarea?.disabled).toBe(false);

    fireEvent.change(textarea as HTMLTextAreaElement, { target: { value: "Acesso de {operator}" } });
    expect(onChange).toHaveBeenCalledWith(
      REMOTE_CONSENT_FIELD_KEYS.message,
      "Acesso de {operator}",
    );
  });

  it("oferece o atalho para definir no site em campo herdado", () => {
    const onToggleInherit = vi.fn();
    const state = buildState({
      [REMOTE_CONSENT_FIELD_KEYS.timeout]: { inherited: true, origin: "Client" },
    });
    renderSection(state, { onToggleInherit });

    fireEvent.click(screen.getAllByText("Definir neste site")[0]);
    expect(onToggleInherit).toHaveBeenCalledWith(
      REMOTE_CONSENT_FIELD_KEYS.timeout,
      false,
    );
  });

  it("no escopo do servidor não mostra controles de herança", () => {
    renderSection(buildState(), { scope: "server", showInheritance: false, showReset: false });

    expect(screen.queryByText("Herdar do nível superior")).toBeNull();
    expect(screen.queryByText("Definir neste site")).toBeNull();
    expect(screen.queryByText("definido neste site")).toBeNull();
    expect(screen.getAllByText("definido no servidor").length).toBeGreaterThan(0);
  });

  it("esconde o rodapé de ações quando a página tem barra global de salvar", () => {
    renderSection(buildState(), { hideActions: true });

    expect(screen.queryByRole("button", { name: /Salvar alterações/ })).toBeNull();
    expect(screen.queryByText(/alteração pendente/i)).toBeNull();
  });

  it("explica o efeito combinado da política no resumo", () => {
    renderSection();

    expect(
      screen.getByText(
        "O usuário precisa autorizar. Sem resposta em 15s, a sessão é negada automaticamente.",
      ),
    ).toBeTruthy();
  });

  it("renderiza a prévia com os placeholders já substituídos", () => {
    renderSection();

    expect(screen.getByText("Prévia no computador acessado")).toBeTruthy();
    expect(screen.getAllByText(/Maria Souza \(Suporte\) solicita acesso remoto\./).length).toBeGreaterThan(0);
  });

  it("propaga a troca de modo e desliga a herança ao escolher uma opção", () => {
    const onChange = vi.fn();
    const onToggleInherit = vi.fn();
    const state = buildState({
      [REMOTE_CONSENT_FIELD_KEYS.mode]: { inherited: true, origin: "Client" },
    });

    renderSection(state, { onChange, onToggleInherit });

    fireEvent.click(screen.getByText("Desligado"));

    expect(onToggleInherit).toHaveBeenCalledWith(REMOTE_CONSENT_FIELD_KEYS.mode, false);
    expect(onChange).toHaveBeenCalledWith(REMOTE_CONSENT_FIELD_KEYS.mode, "Off");
  });

  it("avisa quando o prompt fica sem efeito por causa do modo", () => {
    renderSection(buildState({ [REMOTE_CONSENT_FIELD_KEYS.mode]: { value: "NotifyOnly" } }));

    expect(
      screen.getByText(/O tempo e a ação automática só valem no modo/),
    ).toBeTruthy();
  });

  it("mantém o salvar desabilitado sem alterações e habilita quando há campo sujo", () => {
    const { rerender } = renderSection();
    const saveButton = screen.getByRole("button", { name: /Salvar alterações/ }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    rerender(
      <RemoteAccessConsentSection
        state={buildState({ [REMOTE_CONSENT_FIELD_KEYS.timeout]: { dirty: true } })}
        onChange={vi.fn()}
        onToggleInherit={vi.fn()}
        onResetField={vi.fn()}
        onSave={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    expect(screen.getByText("1 alteração não salva.")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /Salvar alterações/ }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("mostra o contador de caracteres e insere placeholder", () => {
    const onChange = vi.fn();
    const state = buildState({ [REMOTE_CONSENT_FIELD_KEYS.message]: { value: "" } });
    renderSection(state, { onChange });

    expect(screen.getAllByText("0/500 caracteres").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByText("{site}")[0]);
    expect(onChange).toHaveBeenCalledWith(REMOTE_CONSENT_FIELD_KEYS.message, "{site}");
  });

  it("ao trocar o modo para desligado, explica que nada será exibido", () => {
    renderSection(buildState({ [REMOTE_CONSENT_FIELD_KEYS.mode]: { value: "Off" } }));

    expect(screen.getByText(/Modo desligado: nenhum aviso, prompt, banner/)).toBeTruthy();
  });
});