import { describe, expect, it } from "vitest";
import {
  DEFAULT_REMOTE_CONSENT_BANNER_TEXT,
  DEFAULT_REMOTE_CONSENT_MESSAGE,
  REMOTE_CONSENT_TEXT_MAX_LENGTH,
  REMOTE_CONSENT_TIMEOUT_MAX_SECONDS,
  REMOTE_CONSENT_TIMEOUT_MIN_SECONDS,
  appendRemoteConsentPlaceholder,
  applyRemoteConsentPlaceholders,
  clampRemoteConsentTimeout,
  applyRemoteConsentBannerOperatorSuffix,
  describeConsentDefaultAction,
  describeRemoteConsentFlow,
  describeTimeoutAction,
  normalizeRemoteConsentTextPayload,
  formatRemoteConsentCountdown,
  isRemoteConsentTimeoutValid,
  normalizeRemoteConsentMode,
  normalizeRemoteConsentTimeoutAction,
  remoteConsentTextCounter,
  resolveRemoteConsentBannerText,
  resolveRemoteConsentMessage,
} from "./remoteConsentPreview";

describe("placeholders do consentimento", () => {
  it("troca todos os placeholders conhecidos pelas amostras informadas", () => {
    const text = applyRemoteConsentPlaceholders(
      "{operator} abriu sessão em {agent} do {client} ({site}).",
      { operator: "Ana", client: "ACME", site: "Matriz", agent: "PC-01" },
    );

    expect(text).toBe("Ana abriu sessão em PC-01 do ACME (Matriz).");
  });

  it("cai nas amostras padrão quando o contexto não é informado", () => {
    const text = applyRemoteConsentPlaceholders("{operator} / {agent}");
    expect(text).toContain("Maria Souza");
    expect(text).toContain("PC-RECEPCAO-01");
  });

  it("não deixa placeholder desconhecido quebrado em textarea vazia", () => {
    expect(applyRemoteConsentPlaceholders("{cliente}")).toBe("{cliente}");
  });
});

describe("textos padrão do prompt e do banner", () => {
  it("usa o default do backend quando o campo está vazio", () => {
    expect(resolveRemoteConsentMessage("   ")).toBe(
      applyRemoteConsentPlaceholders(DEFAULT_REMOTE_CONSENT_MESSAGE),
    );
    expect(resolveRemoteConsentBannerText(null)).toBe(
      applyRemoteConsentPlaceholders(DEFAULT_REMOTE_CONSENT_BANNER_TEXT),
    );
  });

  it("respeita o texto customizado", () => {
    expect(resolveRemoteConsentMessage("Acesso de {operator}", { operator: "Bia" })).toBe(
      "Acesso de Bia",
    );
  });
});

describe("normalização dos enums", () => {
  it("aceita nome, número e vazio para o modo", () => {
    expect(normalizeRemoteConsentMode("Off")).toBe("Off");
    expect(normalizeRemoteConsentMode(1)).toBe("NotifyOnly");
    expect(normalizeRemoteConsentMode("2")).toBe("Prompt");
    expect(normalizeRemoteConsentMode("")).toBe("Prompt");
  });

  it("aceita nome e número para a ação no timeout", () => {
    expect(normalizeRemoteConsentTimeoutAction("Approve")).toBe("Approve");
    expect(normalizeRemoteConsentTimeoutAction(1)).toBe("Approve");
    expect(normalizeRemoteConsentTimeoutAction("0")).toBe("Deny");
    expect(normalizeRemoteConsentTimeoutAction(undefined)).toBe("Deny");
  });
});

describe("contagem regressiva", () => {
  it("mantém a faixa validada pelo backend (10..600)", () => {
    expect(clampRemoteConsentTimeout("5")).toBe(REMOTE_CONSENT_TIMEOUT_MIN_SECONDS);
    expect(clampRemoteConsentTimeout("900")).toBe(REMOTE_CONSENT_TIMEOUT_MAX_SECONDS);
    expect(clampRemoteConsentTimeout("45")).toBe(45);
    expect(clampRemoteConsentTimeout("")).toBe(60);
  });

  it("valida os limites aceitos", () => {
    expect(isRemoteConsentTimeoutValid("10")).toBe(true);
    expect(isRemoteConsentTimeoutValid("600")).toBe(true);
    expect(isRemoteConsentTimeoutValid("9")).toBe(false);
    expect(isRemoteConsentTimeoutValid("601")).toBe(false);
    expect(isRemoteConsentTimeoutValid("abc")).toBe(false);
  });

  it("recusa segundos fracionados (a API desserializa como int)", () => {
    expect(isRemoteConsentTimeoutValid("15.5")).toBe(false);
    expect(isRemoteConsentTimeoutValid(15.5)).toBe(false);
    expect(isRemoteConsentTimeoutValid("15")).toBe(true);
  });

  it("formata mm:ss para o banner", () => {
    expect(formatRemoteConsentCountdown(75)).toBe("01:15");
    expect(formatRemoteConsentCountdown(9)).toBe("00:09");
  });
});

describe("resumo do efeito da política", () => {
  it("explica cada modo sem duplicar palavras", () => {
    expect(
      describeRemoteConsentFlow({
        mode: "Prompt",
        timeoutSeconds: 15,
        timeoutAction: "Deny",
        showBanner: true,
      }),
    ).toBe("O usuário precisa autorizar. Sem resposta em 15s, a sessão é negada automaticamente.");

    expect(
      describeRemoteConsentFlow({
        mode: "Off",
        timeoutSeconds: 15,
        timeoutAction: "Deny",
        showBanner: false,
      }),
    ).toContain("não vê aviso");

    expect(
      describeRemoteConsentFlow({
        mode: "NotifyOnly",
        timeoutSeconds: 15,
        timeoutAction: "Approve",
        showBanner: true,
      }),
    ).toContain("sem precisar aprovar");

    expect(
      describeRemoteConsentFlow({
        mode: "NotifyOnly",
        timeoutSeconds: 15,
        timeoutAction: "Approve",
        showBanner: false,
      }),
    ).toContain("Nenhum aviso é exibido");
  });

  it("rotula a ação automática e usa o texto real do prompt nativo", () => {
    expect(describeTimeoutAction("Deny")).toBe("Nega sozinho");
    expect(describeTimeoutAction("Approve")).toBe("Aprova sozinho");
    expect(describeConsentDefaultAction("Approve")).toBe(
      "Se você não responder, o acesso será PERMITIDO automaticamente.",
    );
    expect(describeConsentDefaultAction("Deny")).toBe(
      "Se você não responder, o acesso será NEGADO automaticamente.",
    );
  });
});

describe("banner local (mesmas regras do agent)", () => {
  it("acrescenta o operador quando o texto não o cita", () => {
    expect(applyRemoteConsentBannerOperatorSuffix("Sessão em andamento", "Ana")).toBe(
      "Sessão em andamento — Ana",
    );
  });

  it("não duplica o operador já presente (case-insensitive)", () => {
    expect(
      applyRemoteConsentBannerOperatorSuffix("Acesso de ana em andamento", "Ana"),
    ).toBe("Acesso de ana em andamento");
  });

  it("usa o texto base do agent quando o banner está vazio", () => {
    expect(applyRemoteConsentBannerOperatorSuffix("", "Ana")).toBe(
      "Sessão remota em andamento — Ana",
    );
    expect(applyRemoteConsentBannerOperatorSuffix("   ", null)).toBe(
      "Sessão remota em andamento",
    );
  });

  it("não mostra botão de desconectar no banner (a ação mora na bandeja)", () => {
    // Guarda de copy: o banner real é só informativo.
    expect(applyRemoteConsentBannerOperatorSuffix("texto", "Ana")).not.toContain("Desconectar");
  });
});

describe("texto vazio no site significa herdar", () => {
  it("normaliza vazio/branco para null (herança)", () => {
    expect(normalizeRemoteConsentTextPayload("")).toBeNull();
    expect(normalizeRemoteConsentTextPayload("   ")).toBeNull();
  });

  it("mantém textos preenchidos", () => {
    expect(normalizeRemoteConsentTextPayload("Acesso de {operator}")).toBe(
      "Acesso de {operator}",
    );
  });
});

describe("inserção de placeholders e contador", () => {
  it("separa o placeholder do texto existente com espaço", () => {
    expect(appendRemoteConsentPlaceholder("Acesso de", "{operator}")).toBe("Acesso de {operator}");
    expect(appendRemoteConsentPlaceholder("Acesso de ", "{operator}")).toBe("Acesso de {operator}");
    expect(appendRemoteConsentPlaceholder("", "{operator}")).toBe("{operator}");
  });

  it("nunca passa do limite de caracteres do backend", () => {
    const base = "x".repeat(REMOTE_CONSENT_TEXT_MAX_LENGTH - 2);
    const next = appendRemoteConsentPlaceholder(base, "{operator}");
    expect(next.length).toBe(REMOTE_CONSENT_TEXT_MAX_LENGTH);
  });

  it("sinaliza o tom do contador perto do limite", () => {
    expect(remoteConsentTextCounter("abc").tone).toBe("neutral");
    expect(remoteConsentTextCounter("x".repeat(450)).tone).toBe("warning");
    expect(remoteConsentTextCounter("x".repeat(501)).tone).toBe("danger");
  });
});