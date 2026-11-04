/**
 * Validação de autoria do sensor Script (ExtractorsJson / ExitCodeMapJson).
 *
 * Os formatos aqui reproduzem EXATAMENTE o contrato já aceito pela API:
 * - extratores: array de { type, channel, regex, jsonPath, scale, aggregate },
 *   com type ∈ regex|json|mdz (o agente também aceita o apelido “path” para jsonPath);
 * - mapa de exit codes: array de { codes, status, severity, message } mais a entrada
 *   opcional { unlistedNonZero: { status, severity } }.
 *
 * O validador NÃO inventa contrato novo: ele só antecipa, em PT-BR, o que o
 * servidor/agente descartaria em silêncio (item inválido é ignorado, não rejeitado).
 */

export type ScriptExtractorKind = "regex" | "json" | "mdz";

export const SCRIPT_EXTRACTOR_KINDS: readonly ScriptExtractorKind[] = [
  "regex",
  "json",
  "mdz",
];

/** Agregação quando o coletor devolve várias amostras — o padrão do agente é last. */
export const SCRIPT_AGGREGATES = ["last", "first", "min", "max", "avg", "sum"] as const;

export type ScriptAggregate = (typeof SCRIPT_AGGREGATES)[number];

/** Status aceitos no mapa de exit codes (mesmos de SensorStatus). */
export const SCRIPT_EXIT_STATUSES = ["Passing", "Warning", "Failing", "Pending", "Unknown"] as const;

/** Severidades aceitas no mapa de exit codes (mesmas de SensorSeverity). */
export const SCRIPT_EXIT_SEVERITIES = ["Info", "Warning", "Critical"] as const;

/** Prefixos do protocolo MDZ lidos do stdout pelo agente. */
export const MDZ_PROTOCOL_PREFIXES = [
  "MDZ_STATUS:",
  "MDZ_MESSAGE:",
  "MDZ_METRIC:",
  "MDZ_METRIC_JSON:",
] as const;

/** Modelo de extrator usado pelo gerador de exemplos e pela validação. */
export interface ScriptExtractor {
  type: ScriptExtractorKind;
  channel: string;
  regex?: string;
  jsonPath?: string;
  scale?: number;
  aggregate?: ScriptAggregate;
}

/** Resultado padrão: lista de erros bloqueantes e avisos não bloqueantes. */
export interface ScriptValidationResult {
  errors: string[];
  warnings: string[];
}

/** Texto do erro (ou null quando não há nada bloqueante). */
export function firstScriptError(result: ScriptValidationResult): string | null {
  return result.errors.length > 0 ? result.errors[0] : null;
}
/**
 * Lê os extratores do texto JSON, sem lançar.
 *
 * Espelha parseSensorExtractors: o agente só considera o JSON quando o texto
 * (aparado) começa com [ e desserializa; caso contrário devolve lista vazia.
 */
export function parseExtractorsJson(raw: string): {
  extractors: ScriptExtractor[];
  error: string | null;
} {
  const text = raw.trim();
  if (!text) return { extractors: [], error: null };
  if (!text.startsWith("[")) {
    return { extractors: [], error: "Os extratores precisam ser uma lista JSON (comece com [)." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { extractors: [], error: "JSON de extratores inválido." };
  }
  if (!Array.isArray(parsed)) {
    return { extractors: [], error: "Os extratores precisam ser uma lista JSON (array)." };
  }
  const extractors: ScriptExtractor[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const kind = normalizeKind(record.type, record);
    const jsonPath = firstString(record.jsonPath) || firstString(record.path);
    const scale = typeof record.scale === "number" ? record.scale : undefined;
    const aggregate = normalizeAggregate(record.aggregate);
    extractors.push({
      type: kind,
      channel: firstString(record.channel),
      ...(firstString(record.regex) ? { regex: firstString(record.regex) } : {}),
      ...(jsonPath ? { jsonPath } : {}),
      ...(scale === undefined ? {} : { scale }),
      ...(aggregate ? { aggregate } : {}),
    });
  }
  return { extractors, error: null };
}

/** Tipo declarado; quando ausente o agente infere pela presença de regex/jsonPath. */
function normalizeKind(value: unknown, record: Record<string, unknown>): ScriptExtractorKind {
  const raw = firstString(value).toLowerCase();
  if (raw === "regex" || raw === "json" || raw === "mdz") return raw;
  if (firstString(record.regex)) return "regex";
  if (firstString(record.jsonPath) || firstString(record.path)) return "json";
  return "mdz";
}

function normalizeAggregate(value: unknown): ScriptAggregate | undefined {
  const raw = firstString(value).toLowerCase();
  return (SCRIPT_AGGREGATES as readonly string[]).includes(raw)
    ? (raw as ScriptAggregate)
    : undefined;
}

function firstString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
/**
 * Valida o extrator individual conforme o tipo.
 *
 * Espelha o descarte silencioso do agente: regex não compilável e json sem
 * jsonPath são jogados fora sem aviso — por isso viram erro aqui.
 */
export function validateExtractor(extractor: ScriptExtractor, index: number): string[] {
  const errors: string[] = [];
  const label = `Extrator ${index + 1}`;
  if (!extractor.channel) {
    errors.push(`${label}: informe a chave do canal.`);
  }
  if (extractor.type === "regex") {
    if (!extractor.regex) {
      errors.push(`${label}: extrator regex exige o campo regex.`);
    } else {
      try {
        new RegExp(extractor.regex);
      } catch {
        errors.push(`${label}: a expressão regular não compila.`);
      }
    }
  }
  if (extractor.type === "json" && !extractor.jsonPath) {
    errors.push(`${label}: extrator json exige jsonPath (ex.: download.bandwidth).`);
  }
  if (extractor.type === "mdz") {
    // O canal do MDZ vem do próprio stdout (MDZ_METRIC: chave=valor), então
    // não há regex/jsonPath a exigir — só a chave declarada.
  }
  return errors;
}

/**
 * Valida o conjunto de extratores contra os canais declarados.
 *
 * Checagens: forma por tipo, chave de canal única entre extratores e coerência
 * com os canais do sensor (a API exige ao menos um canal declarado).
 */
export function validateExtractors(raw: string, declaredChannels: string[]): ScriptValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const text = raw.trim();
  if (!text) {
    for (const channel of declaredChannels) {
      warnings.push("O canal " + channel + " não tem extrator: ele só terá valor se o script emitir MDZ_METRIC: " + channel + "=...");
    }
    return { errors, warnings };
  }
  const { extractors, error } = parseExtractorsJson(raw);
  if (error) {
    errors.push(error);
    return { errors, warnings };
  }
  const seen = new Set<string>();
  for (let i = 0; i < extractors.length; i += 1) {
    const extractor = extractors[i];
    errors.push(...validateExtractor(extractor, i));
    if (!extractor.channel) continue;
    if (seen.has(extractor.channel)) {
      errors.push(`Extrator ${i + 1}: a chave ${extractor.channel} já foi usada por outro extrator.`);
    }
    seen.add(extractor.channel);
    if (declaredChannels.length > 0 && !declaredChannels.includes(extractor.channel)) {
      errors.push(`Extrator ${i + 1}: a chave ${extractor.channel} não está entre os canais declarados.`);
    }
  }
  for (const channel of declaredChannels) {
    if (!seen.has(channel)) {
      warnings.push(`O canal ${channel} não tem extrator: ele só terá valor se o script emitir MDZ_METRIC: ${channel}=...`);
    }
  }
  return { errors, warnings };
}
/** Regra do mapa de exit codes já normalizada. */
export interface ScriptExitRule {
  codes: number[];
  status: string;
  severity: string | null;
  message: string | null;
}

/** Comportamento para códigos fora das regras (Padrão: falha crítica). */
export interface ScriptExitFallback {
  status: string;
  severity: string | null;
}

export interface ScriptExitMap {
  rules: ScriptExitRule[];
  unlistedNonZero: ScriptExitFallback | null;
}

/**
 * Lê o mapa de exit codes, sem lançar.
 *
 * Espelha SensorExitRules.Parse: raiz precisa ser array; entrada não-objeto é
 * ignorada; { unlistedNonZero: {...} } define o fallback; o resto vira regra.
 */
export function parseExitCodeMapJson(raw: string): {
  map: ScriptExitMap;
  error: string | null;
} {
  const empty: ScriptExitMap = { rules: [], unlistedNonZero: null };
  const text = raw.trim();
  if (!text) return { map: empty, error: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { map: empty, error: "JSON do mapa de exit codes inválido." };
  }
  if (!Array.isArray(parsed)) {
    return { map: empty, error: "O mapa de exit codes precisa ser uma lista JSON (array)." };
  }
  const map: ScriptExitMap = { rules: [], unlistedNonZero: null };
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    if (record.unlistedNonZero && typeof record.unlistedNonZero === "object") {
      const fallback = record.unlistedNonZero as Record<string, unknown>;
      map.unlistedNonZero = {
        status: firstString(fallback.status) || "Failing",
        severity: firstString(fallback.severity) || null,
      };
      continue;
    }
    const codes = Array.isArray(record.codes)
      ? record.codes.filter((v): v is number => typeof v === "number" && Number.isInteger(v))
      : [];
    map.rules.push({
      codes,
      status: firstString(record.status) || "Failing",
      severity: firstString(record.severity) || null,
      message: typeof record.message === "string" ? record.message : null,
    });
  }
  return { map, error: null };
}
/** Status aceitos, unidos para a mensagem de erro. */
const STATUS_LISTA = SCRIPT_EXIT_STATUSES.join(" | ");
/** Severidades aceitas, unidas para a mensagem de erro. */
const SEVERIDADE_LISTA = SCRIPT_EXIT_SEVERITIES.join(" | ");

/**
 * Valida o mapa de exit codes semanticamente.
 *
 * A API nunca rejeita este JSON: um valor inválido vira silenciosamente
 * Failing/Critical. Aqui esses casos viram erro para o operador não descobrir
 * o problema só quando o alerta chega errado.
 */
export function validateExitCodeMap(raw: string): ScriptValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = parseExitCodeMapJson(raw);
  if (parsed.error) {
    errors.push(parsed.error);
    return { errors, warnings };
  }
  const { rules, unlistedNonZero } = parsed.map;
  const seenCodes = new Set<number>();
  let temPassing = false;
  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i];
    const label = `Regra ${i + 1}`;
    if (rule.codes.length === 0) {
      errors.push(label + ": informe ao menos um código de saída em codes.");
    }
    for (const code of rule.codes) {
      if (seenCodes.has(code)) {
        errors.push(label + `: o código ${code} já está em outra regra (a primeira da lista vence).`);
      }
      seenCodes.add(code);
    }
    if (!SCRIPT_EXIT_STATUSES.includes(rule.status as (typeof SCRIPT_EXIT_STATUSES)[number])) {
      errors.push(label + `: status ${rule.status} não existe. Use ${STATUS_LISTA}.`);
    }
    if (rule.status === "Passing") temPassing = true;
    if (
      rule.severity !== null &&
      !SCRIPT_EXIT_SEVERITIES.includes(rule.severity as (typeof SCRIPT_EXIT_SEVERITIES)[number])
    ) {
      errors.push(label + `: severidade ${rule.severity} não existe. Use ${SEVERIDADE_LISTA}.`);
    }
    if (rule.status === "Failing" && rule.severity === null) {
      warnings.push(label + ": sem severity a falha assume Critical por padrão.");
    }
    if (rule.severity !== null && rule.status !== "Failing" && rule.status !== "Warning") {
      warnings.push(label + ": severity só é usada em Failing/Warning.");
    }
  }
  if (unlistedNonZero) {
    if (!SCRIPT_EXIT_STATUSES.includes(unlistedNonZero.status as (typeof SCRIPT_EXIT_STATUSES)[number])) {
      errors.push(`unlistedNonZero: status ${unlistedNonZero.status} não existe.`);
    }
    if (
      unlistedNonZero.severity !== null &&
      !SCRIPT_EXIT_SEVERITIES.includes(unlistedNonZero.severity as (typeof SCRIPT_EXIT_SEVERITIES)[number])
    ) {
      errors.push(`unlistedNonZero: severidade ${unlistedNonZero.severity} não existe.`);
    }
  }
  if (rules.length > 0 && !temPassing) {
    warnings.push("Nenhuma regra mapeia sucesso (Passing): todo código listado vai alertar.");
  }
  if (rules.length === 0 && !unlistedNonZero) {
    warnings.push("Sem regras o padrão da API vale: código 0 = Passing e qualquer outro = Failing crítico.");
  }
  return { errors, warnings };
}
/** Presets de mapa de exit codes prontos para o catálogo de scripts. */
export interface ScriptExitPreset {
  id: string;
  label: string;
  description: string;
  json: string;
}

/** Convenção mais comum: 0 = ok, 1 = atenção, 2 = falha. */
export function exitPresetNerdy(): string {
  return JSON.stringify(
    [
      { codes: [0], status: "Passing", message: "Script concluiu sem problemas." },
      { codes: [1], status: "Warning", severity: "Warning", message: "Atenção: o script reportou um aviso." },
      {
        codes: [2],
        status: "Failing",
        severity: "Critical",
        message: "Falha: o script reportou erro crítico.",
      },
      { unlistedNonZero: { status: "Failing", severity: "Critical" } },
    ],
    null,
    2,
  );
}

/** Convenção "qualquer código diferente de zero falha" (scripts simples de verificação). */
export function exitPresetSimples(): string {
  return JSON.stringify(
    [
      { codes: [0], status: "Passing", message: "Verificação OK." },
      { unlistedNonZero: { status: "Failing", severity: "Critical" } },
    ],
    null,
    2,
  );
}

/** Convenção Tactical RMM: 0 = ok, 1 = falha; demais códigos são tratados como falha. */
export function exitPresetTactical(): string {
  return JSON.stringify(
    [
      { codes: [0], status: "Passing", message: "Tactical: sucesso." },
      {
        codes: [1],
        status: "Failing",
        severity: "Critical",
        message: "Tactical: falha reportada pelo script.",
      },
      { unlistedNonZero: { status: "Failing", severity: "Critical" } },
    ],
    null,
    2,
  );
}

/** Lista de presets exibida no editor. */
export const SCRIPT_EXIT_PRESETS: readonly ScriptExitPreset[] = [
  {
    id: "tactical",
    label: "Tactical RMM (1 = falha)",
    description: "0 passa; 1 falha crítica; qualquer outro código falha.",
    json: exitPresetTactical(),
  },
  {
    id: "nerdy",
    label: "Comunidade (1 = atenção, 2 = crítico)",
    description: "0 passa; 1 vira Warning; 2 vira Failing crítico.",
    json: exitPresetNerdy(),
  },
  {
    id: "simples",
    label: "Simples (0 = ok, resto = falha)",
    description: "Só o código 0 passa; qualquer outro código falha.",
    json: exitPresetSimples(),
  },
];
/** Exemplo de extrator exibido no editor. */
export interface ScriptExtractorExample {
  id: string;
  label: string;
  description: string;
  json: string;
}

/** Exemplos por tipo de extrator (os mesmos campos do contrato do agente). */
export const SCRIPT_EXTRACTOR_EXAMPLES: readonly ScriptExtractorExample[] = [
  {
    id: "regex",
    label: "regex — captura com grupo",
    description: "Pega o primeiro grupo de captura da saída; use scale para converter unidade.",
    json: JSON.stringify(
      [{ type: "regex", channel: "livre_gb", regex: "Livre: ([0-9.]+) GB", scale: 1, aggregate: "last" }],
      null,
      2,
    ),
  },
  {
    id: "json",
    label: "json — caminho no JSON",
    description: "Lê um valor por caminho com pontos; scale multiplica (bytes → Mbps usa 8e-6).",
    json: JSON.stringify(
      [{ type: "json", channel: "download_mbps", jsonPath: "download.bandwidth", scale: 8e-6, aggregate: "avg" }],
      null,
      2,
    ),
  },
  {
    id: "mdz",
    label: "mdz — protocolo no stdout",
    description: "O próprio script emite MDZ_METRIC: chave=valor; dispensa regex e jsonPath.",
    json: JSON.stringify(
      [{ type: "mdz", channel: "livre_gb" }],
      null,
      2,
    ),
  },
];
/**
 * Modelo de stdout com o protocolo MDZ documentado para o operador.
 *
 * As quatro linhas de prefixo são consumidas pelo agente e não aparecem no
 * extrato de log; o restante da saída é preservado.
 */
export const SCRIPT_MDZ_EXAMPLE = [
  "# Saída livre do script (vai para o extrato de log)",
  "echo 'Verificando servico...'",
  "# Status e mensagem (a linha inteira é consumida)",
  "echo 'MDZ_STATUS: Warning'",
  "echo 'MDZ_MESSAGE: Fila com atraso acima do normal'",
  "# Métricas simples: várias por linha, separadas por vírgula",
  "echo 'MDZ_METRIC: fila=12,livre_gb=48.5'",
  "# Métricas em JSON numa única linha",
  "echo 'MDZ_METRIC_JSON: {" + String.fromCharCode(34) + "livre_gb" + String.fromCharCode(34) + ": 48.5}'",
  "exit 0",
].join(String.fromCharCode(10));

/**
 * Validação completa de um sensor Script (extratores + exit codes).
 *
 * É o ponto de entrada usado pelo formulário e pelo editor dedicado, para os
 * dois caminhos nunca divergirem. declaredChannels vazio = canais ainda não
 * declarados (o agente aceita qualquer chave que o script emitir).
 */
export function validateScriptSensor(
  extractorsJson: string,
  exitCodeMapJson: string,
  declaredChannels: string[] = [],
): ScriptValidationResult {
  const extractors = validateExtractors(extractorsJson, declaredChannels);
  const exits = validateExitCodeMap(exitCodeMapJson);
  return {
    errors: [...extractors.errors, ...exits.errors],
    warnings: [...extractors.warnings, ...exits.warnings],
  };
}

/**
 * Gera um esqueleto de extratores a partir dos canais declarados.
 *
 * Cada canal vira um extrator mdz, que é o caminho mais simples: o script só
 * precisa emitir MDZ_METRIC: chave=valor e nada mais precisa ser configurado.
 */
export function extractorsSkeletonFromChannels(channels: string[]): string {
  const unique = Array.from(new Set(channels.map((c) => c.trim()).filter(Boolean)));
  if (unique.length === 0) return "";
  return JSON.stringify(
    unique.map((channel) => ({ type: "mdz", channel })),
    null,
    2,
  );
}
