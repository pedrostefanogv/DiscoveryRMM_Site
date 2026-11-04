import { describe, expect, it } from "vitest";
import {
  SCRIPT_AGGREGATES,
  SCRIPT_EXIT_PRESETS,
  SCRIPT_EXTRACTOR_EXAMPLES,
  SCRIPT_EXIT_SEVERITIES,
  SCRIPT_EXIT_STATUSES,
  SCRIPT_MDZ_EXAMPLE,
  extractorsSkeletonFromChannels,
  firstScriptError,
  parseExitCodeMapJson,
  parseExtractorsJson,
  validateExitCodeMap,
  validateExtractor,
  validateExtractors,
  validateScriptSensor,
} from "./sensorScriptValidation";

/** Texto JSON de um valor qualquer, no formato aceito pela API. */
function jsonOf(value: unknown): string {
  return JSON.stringify(value);
}

describe("validação de extratores do sensor Script", () => {
  it("aceita o formato real do agente (regex, json e mdz)", () => {
    const raw = jsonOf([
      { type: "regex", channel: "livre_gb", regex: "Livre: ([0-9.]+) GB" },
      { type: "json", channel: "down_mbps", jsonPath: "download.bandwidth", scale: 8e-6 },
      { type: "mdz", channel: "fila" },
    ]);
    const result = validateExtractors(raw, []);
    expect(result.errors).toEqual([]);
  });

  it("recusa raiz que não é lista JSON", () => {
    const result = validateExtractors(jsonOf({ channel: "x" }), []);
    expect(firstScriptError(result)).toContain("lista JSON");
  });

  it("recusa JSON malformado", () => {
    const result = validateExtractors("[{", []);
    expect(firstScriptError(result)).toContain("inválido");
  });

  it("exige regex quando o tipo é regex", () => {
    const errors = validateExtractor({ type: "regex", channel: "a" }, 0);
    expect(errors.join(" ")).toContain("exige o campo regex");
  });

  it("recusa regex que não compila", () => {
    const errors = validateExtractor(
      { type: "regex", channel: "a", regex: "([0-9" },
      0,
    );
    expect(errors.join(" ")).toContain("não compila");
  });

  it("exige jsonPath quando o tipo é json", () => {
    const errors = validateExtractor({ type: "json", channel: "a" }, 0);
    expect(errors.join(" ")).toContain("exige jsonPath");
  });

  it("não exige regex nem jsonPath para mdz", () => {
    expect(validateExtractor({ type: "mdz", channel: "a" }, 0)).toEqual([]);
  });

  it("exige a chave do canal em qualquer tipo", () => {
    const errors = validateExtractor({ type: "mdz", channel: "" }, 0);
    expect(errors.join(" ")).toContain("chave do canal");
  });

  it("recusa chave de canal repetida entre extratores", () => {
    const raw = jsonOf([
      { type: "mdz", channel: "a" },
      { type: "mdz", channel: "a" },
    ]);
    expect(validateExtractors(raw, []).errors.join(" ")).toContain("já foi usada");
  });

  it("recusa chave que não está entre os canais declarados", () => {
    const raw = jsonOf([{ type: "mdz", channel: "livre_gb" }]);
    const result = validateExtractors(raw, ["outro"]);
    expect(result.errors.join(" ")).toContain("não está entre os canais declarados");
  });

  it("avisa quando um canal declarado ficou sem extrator", () => {
    const result = validateExtractors("", ["livre_gb"]);
    expect(result.errors).toEqual([]);
    expect(result.warnings.join(" ")).toContain("livre_gb");
  });
});
describe("mapa de exit codes do sensor Script", () => {
  it("lê a regra e o fallback unlistedNonZero", () => {
    const raw = jsonOf([
      { codes: [0], status: "Passing" },
      { codes: [1, 2], status: "Failing", severity: "Critical", message: "erro" },
      { unlistedNonZero: { status: "Warning", severity: "Warning" } },
    ]);
    const { map, error } = parseExitCodeMapJson(raw);
    expect(error).toBeNull();
    expect(map.rules).toHaveLength(2);
    expect(map.rules[0].status).toBe("Passing");
    expect(map.rules[1].codes).toEqual([1, 2]);
    expect(map.rules[1].severity).toBe("Critical");
    expect(map.rules[1].message).toBe("erro");
    expect(map.unlistedNonZero).toEqual({ status: "Warning", severity: "Warning" });
  });

  it("nunca trata unlistedNonZero como regra de códigos", () => {
    const raw = jsonOf([{ unlistedNonZero: { status: "Passing" } }]);
    const { map } = parseExitCodeMapJson(raw);
    expect(map.rules).toEqual([]);
    expect(map.unlistedNonZero?.status).toBe("Passing");
  });

  it("recusa raiz que não é array (a API cairia no padrão em silêncio)", () => {
    const result = validateExitCodeMap(jsonOf({ codes: [0] }));
    expect(firstScriptError(result)).toContain("lista JSON");
  });

  it("recusa JSON malformado", () => {
    expect(firstScriptError(validateExitCodeMap("[{"))).toContain("inválido");
  });

  it("recusa status que não existe (viraria Failing no servidor)", () => {
    const raw = jsonOf([{ codes: [1], status: "Ok" }]);
    expect(validateExitCodeMap(raw).errors.join(" ")).toContain("Ok");
  });

  it("recusa severidade que não existe", () => {
    const raw = jsonOf([{ codes: [1], status: "Failing", severity: "Grave" }]);
    expect(validateExitCodeMap(raw).errors.join(" ")).toContain("Grave");
  });

  it("recusa código repetido entre regras", () => {
    const raw = jsonOf([
      { codes: [0], status: "Passing" },
      { codes: [0], status: "Failing" },
    ]);
    expect(validateExitCodeMap(raw).errors.join(" ")).toContain("já está em outra regra");
  });

  it("recusa regra sem códigos", () => {
    const raw = jsonOf([{ codes: [], status: "Failing" }]);
    expect(validateExitCodeMap(raw).errors.join(" ")).toContain("ao menos um código");
  });

  it("avisa que a falha sem severity assume Critical", () => {
    const raw = jsonOf([{ codes: [0], status: "Passing" }, { codes: [2], status: "Failing" }]);
    expect(validateExitCodeMap(raw).warnings.join(" ")).toContain("Critical");
  });

  it("avisa quando nada mapeia sucesso", () => {
    const raw = jsonOf([{ codes: [2], status: "Failing", severity: "Critical" }]);
    expect(validateExitCodeMap(raw).warnings.join(" ")).toContain("sucesso");
  });

  it("documenta o padrão da API quando o mapa está vazio", () => {
    const result = validateExitCodeMap("");
    expect(result.errors).toEqual([]);
    expect(result.warnings.join(" ")).toContain("código 0");
  });
});
describe("presets e exemplos do editor de script", () => {
  it("todo preset gera um JSON válido para os nossos próprios validadores", () => {
    expect(SCRIPT_EXIT_PRESETS.length).toBeGreaterThan(0);
    for (const preset of SCRIPT_EXIT_PRESETS) {
      const result = validateExitCodeMap(preset.json);
      expect(result.errors, preset.id).toEqual([]);
      expect(parseExitCodeMapJson(preset.json).error, preset.id).toBeNull();
    }
  });

  it("os presets cobrem sucesso, atenção e falha como a API espera", () => {
    const nerdy = SCRIPT_EXIT_PRESETS.find((preset) => preset.id === "nerdy");
    expect(nerdy).toBeDefined();
    const { map } = parseExitCodeMapJson(nerdy!.json);
    expect(map.rules.map((rule) => rule.status)).toEqual([
      "Passing",
      "Warning",
      "Failing",
    ]);
    expect(map.rules[1].codes).toEqual([1]);
    expect(map.rules[2].codes).toEqual([2]);
    expect(map.unlistedNonZero?.status).toBe("Failing");
  });

  it("o preset Tactical trata apenas 1 como falha explícita", () => {
    const tactical = SCRIPT_EXIT_PRESETS.find((preset) => preset.id === "tactical");
    expect(tactical).toBeDefined();
    const { map } = parseExitCodeMapJson(tactical!.json);
    expect(map.rules).toHaveLength(2);
    expect(map.rules[0].status).toBe("Passing");
    expect(map.rules[1].codes).toEqual([1]);
    expect(map.rules[1].severity).toBe("Critical");
  });

  it("todo exemplo de extrator passa na validação", () => {
    expect(SCRIPT_EXTRACTOR_EXAMPLES.length).toBe(3);
    const kinds = SCRIPT_EXTRACTOR_EXAMPLES.map((example) => example.id).sort();
    expect(kinds).toEqual(["json", "mdz", "regex"]);
    for (const example of SCRIPT_EXTRACTOR_EXAMPLES) {
      const parsed = parseExtractorsJson(example.json);
      expect(parsed.error, example.id).toBeNull();
      expect(parsed.extractors, example.id).toHaveLength(1);
      expect(parsed.extractors[0].type, example.id).toBe(example.id);
      expect(validateExtractor(parsed.extractors[0], 0), example.id).toEqual([]);
    }
  });

  it("o exemplo de regex usa grupo de captura e agregação válida", () => {
    const exemplo = SCRIPT_EXTRACTOR_EXAMPLES.find((item) => item.id === "regex")!;
    const extrator = parseExtractorsJson(exemplo.json).extractors[0];
    expect(extrator.regex).toContain("(");
    expect(SCRIPT_AGGREGATES).toContain(extrator.aggregate);
  });

  it("o esqueleto de extratores usa mdz para cada canal declarado", () => {
    const raw = extractorsSkeletonFromChannels(["livre_gb", "fila", "livre_gb"]);
    const { extractors, error } = parseExtractorsJson(raw);
    expect(error).toBeNull();
    expect(extractors.map((item) => item.channel)).toEqual(["livre_gb", "fila"]);
    expect(extractors.every((item) => item.type === "mdz")).toBe(true);
    expect(extractorsSkeletonFromChannels([])).toBe("");
  });

  it("o exemplo MDZ documenta os quatro prefixos do protocolo", () => {
    const text = SCRIPT_MDZ_EXAMPLE;
    expect(text).toContain("MDZ_STATUS:");
    expect(text).toContain("MDZ_MESSAGE:");
    expect(text).toContain("MDZ_METRIC:");
    expect(text).toContain("MDZ_METRIC_JSON:");
  });

  it("a validação composta junta erros de extratores e de exit codes", () => {
    const result = validateScriptSensor("[{", "[{", []);
    expect(result.errors.length).toBe(2);
  });

  it("a validação composta fica limpa com os exemplos do editor", () => {
    const extractors = SCRIPT_EXTRACTOR_EXAMPLES.find((item) => item.id === "mdz")!.json;
    const exits = SCRIPT_EXIT_PRESETS[0].json;
    const result = validateScriptSensor(extractors, exits, ["livre_gb"]);
    expect(result.errors).toEqual([]);
  });

  it("os enums de status e severidade espelham o contrato da API", () => {
    expect([...SCRIPT_EXIT_STATUSES]).toEqual([
      "Passing",
      "Warning",
      "Failing",
      "Pending",
      "Unknown",
    ]);
    expect([...SCRIPT_EXIT_SEVERITIES]).toEqual(["Info", "Warning", "Critical"]);
    expect([...SCRIPT_AGGREGATES]).toEqual([
      "last",
      "first",
      "min",
      "max",
      "avg",
      "sum",
    ]);
  });
});
