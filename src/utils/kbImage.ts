// ── Imagens privadas da Base de Conhecimento ──────────────────
// Token persistido no Markdown: !\[<alt>](kbimage:<attachmentId>).
// O attachmentId é um GUID; o binário nunca tem URL pública — a leitura usa
// URL pré-assinada obtida por endpoint autenticado.

/** Esquema do token de imagem privada no Markdown. */
export const KBIMAGE_SCHEME = "kbimage:";

/**
 * MIME types aceitos pelo contrato da API (5 MB por arquivo).
 * Alterar aqui exige alinhar com o backend.
 */
export const KB_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

/** Valor do atributo `accept` do `<input type="file">`. */
export const KB_IMAGE_ACCEPT = KB_IMAGE_MIME_TYPES.join(",");

/** Limite de tamanho por imagem (5 MB), igual ao backend. */
export const KB_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * GUID no formato "D" (8-4-4-4-12), caixa mista. Antes era um padrão frouxo de
 * 36 caracteres ([0-9a-fA-F-]{36}) que aceitava sequências inválidas (ex.: 36
 * hífens) e gerava request 404 + "Imagem indisponível" em vez de tratar o src
 * como texto comum.
 */
const KBIMAGE_GUID =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

/** Casa exatamente o src do token kbimage:<guid> (esquema case-insensitive). */
const KBIMAGE_SRC_PATTERN = new RegExp(`^kbimage:(${KBIMAGE_GUID})$`, "i");

/**
 * Extrai o attachmentId de um src `kbimage:<guid>`.
 * Devolve `null` quando o src não é um token de imagem privada válido.
 */
export function parseKbImageSrc(src: string | null | undefined): string | null {
  if (!src) return null;
  const match = KBIMAGE_SRC_PATTERN.exec(src.trim());
  return match ? match[1] : null;
}

// ── Tamanho da imagem ─────────────────────────────────────────
// O Markdown não tem atributo de largura, então o tamanho vai no TÍTULO do
// token: ![alt](kbimage:<id> "w=50%"). HTML cru não serve: o react-markdown do
// viewer só renderiza HTML com rehype-raw (o preview do editor renderizaria e a
// leitura não — pior que não ter tamanho).

/** Presets do seletor (valor null = largura natural). */
export const KB_IMAGE_SIZE_PRESETS: ReadonlyArray<{
  label: string;
  value: string | null;
}> = [
  { label: "Natural", value: null },
  { label: "25%", value: "25%" },
  { label: "50%", value: "50%" },
  { label: "75%", value: "75%" },
  { label: "100%", value: "100%" },
];

/** Limites aceitos (espelham KnowledgeImageMarkdown.NormalizeSize no backend). */
export const KB_IMAGE_SIZE_MAX_PERCENT = 100;
export const KB_IMAGE_SIZE_MAX_PX = 4000;

/**
 * Normaliza "w=50%" / "50%" / " 420 " para o valor canônico do token.
 * Fora do padrão devolve null (o renderizador usa a largura natural).
 */
export function normalizeKbImageSize(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;

  let value = raw.trim();
  if (/^w=/i.test(value)) value = value.slice(2).trim();

  const isPercent = value.endsWith("%");
  const digits = isPercent ? value.slice(0, -1) : value;

  if (!/^\d{1,4}$/.test(digits)) return null;

  const amount = Number(digits);
  if (isPercent) {
    return amount >= 1 && amount <= KB_IMAGE_SIZE_MAX_PERCENT
      ? `${amount}%`
      : null;
  }

  return amount >= 1 && amount <= KB_IMAGE_SIZE_MAX_PX ? String(amount) : null;
}

/** Título do token para um tamanho (vazio quando natural/inválido). */
export function buildKbImageTitle(size: string | null | undefined): string {
  const normalized = normalizeKbImageSize(size);
  return normalized ? ` "w=${normalized}"` : "";
}

/** Estilo CSS do tamanho (undefined = largura natural limitada a 100%). */
export function kbImageSizeStyle(
  raw: string | null | undefined,
): { width: string } | undefined {
  const normalized = normalizeKbImageSize(raw);
  if (!normalized) return undefined;

  return {
    width: normalized.endsWith("%") ? normalized : `${normalized}px`,
  };
}

/** Monta o token Markdown de uma imagem privada (tamanho opcional). */
export function buildKbImageToken(
  attachmentId: string,
  alt = "imagem",
  size?: string | null,
): string {
  const label = alt.replace(/[\[\]()]/g, "").trim() || "imagem";
  // GUID canônico em minúsculas (igual ao Guid:D do backend): mantém o token
  // idêntico ao gravado pela API e evita duas entradas de cache por caixa.
  return `![${label}](${KBIMAGE_SCHEME}${attachmentId.toLowerCase()}${buildKbImageTitle(size)})`;
}

/** Escapa o id para uso em RegExp (evita injeção de padrão). */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Regex de TODAS as ocorrências do token daquele anexo (com ou sem tamanho). */
function kbImageTokenPattern(attachmentId: string): RegExp {
  const id = escapeRegExp(attachmentId.toLowerCase());
  // Grupo 1 = alt; grupo 2/3 = título opcional (tamanho) em aspas duplas/simples.
  // O `[^)\r\n]*` final tolera qualquer sufixo antes do ")" (título malformado
  // escrito à mão) — sem ele a imagem sumia da contagem e da limpeza de tamanho.
  //
  // TODAS as classes evitam \r e \n: um "![" órfão antes do token (sem fechar)
  // fazia o match atravessar linhas e engolir texto alheio — o replace posterior
  // apagava prosa do artigo.
  return new RegExp(
    `!\\[([^\\]\\r\\n]*)\\]\\(\\s*kbimage:\\s*${id}(?:\\s+(?:"([^"\\r\\n]*)"|'([^'\\r\\n]*)'))?[^)\\r\\n]*\\)`,
    "gi",
  );
}

/**
 * Tamanho atual da PRIMEIRA ocorrência do anexo no markdown (null = natural).
 * Usado pelo painel para mostrar/editar o tamanho de cada imagem.
 */
export function kbImageSizeInMarkdown(
  markdown: string,
  attachmentId: string,
): string | null {
  if (!markdown) return null;

  const match = kbImageTokenPattern(attachmentId).exec(markdown);
  if (!match) return null;

  const title = String(match[2] ?? match[3] ?? "").trim();
  return normalizeKbImageSize(title);
}

/**
 * Reescreve TODAS as ocorrências do token daquele anexo aplicando o novo
 * tamanho (null = natural, remove o título). Preserva alt e o resto do texto.
 */
export function updateKbImageSizeInMarkdown(
  markdown: string,
  attachmentId: string,
  size: string | null | undefined,
): string {
  if (!markdown) return markdown;

  const title = buildKbImageTitle(size);
  const id = attachmentId.toLowerCase();

  return markdown.replace(
    kbImageTokenPattern(attachmentId),
    (_match, alt: string) => `![${alt}](${KBIMAGE_SCHEME}${id}${title})`,
  );
}

/** Remove TODAS as ocorrências do token (espelha o RemoveToken do backend). */
export function removeKbImageFromMarkdown(
  markdown: string,
  attachmentId: string,
): string {
  if (!markdown) return markdown;

  return markdown
    .replace(
      new RegExp(
        `^[ \\t]*(?:[-*+]|\\d+\\.)\\s+!\\[[^\\]\\r\\n]*\\]\\(\\s*kbimage:\\s*${escapeRegExp(
          attachmentId.toLowerCase(),
        )}(?:\\s+(?:"[^"\\r\\n]*"|'[^'\\r\\n]*'))?[^)\\r\\n]*\\)[ \\t]*(?:\\r?\\n|$)`,
        "gim",
      ),
      "",
    )
    .replace(kbImageTokenPattern(attachmentId), "");
}

/** Quantas vezes o anexo aparece no markdown (para o painel de imagens). */
export function countKbImageOccurrences(
  markdown: string,
  attachmentId: string,
): number {
  if (!markdown) return 0;
  return markdown.match(kbImageTokenPattern(attachmentId))?.length ?? 0;
}

/**
 * Valida tipo e tamanho do arquivo no cliente.
 * Devolve a mensagem de erro, ou `null` quando o arquivo é aceito.
 */
export function validateKbImageFile(file: File): string | null {
  const type = (file.type || "").toLowerCase();
  if (!(KB_IMAGE_MIME_TYPES as readonly string[]).includes(type)) {
    return `Tipo não permitido: ${file.name}. Use JPEG, PNG, WebP ou GIF.`;
  }

  if (file.size > KB_IMAGE_MAX_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return `Imagem muito grande: ${file.name} (${sizeMb} MB). O limite é 5 MB.`;
  }

  return null;
}

/** Margem de segurança para considerar uma URL pré-assinada ainda válida. */
const PRESIGNED_URL_SAFETY_MS = 30_000;

/**
 * Verifica se a URL pré-assinada ainda pode ser usada (com folga de segurança).
 * URLs de leitura têm TTL de 4h; nunca devem ser cacheadas como definitivas.
 */
export function isPresignedUrlValid(
  expiresAtUtc: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!expiresAtUtc) return false;
  const expires = Date.parse(expiresAtUtc);
  return Number.isFinite(expires) && expires - now > PRESIGNED_URL_SAFETY_MS;
}

// Mesma lógica do defaultUrlTransform do react-markdown, porém SEM importar o
// pacote: ele é carregado sob demanda (LazyMarkdown) e o import estático
// arrastaria o chunk "markdown" para o bundle do viewer. Preserva o esquema
// kbimage: e bloqueia protocolos perigosos (ex.: javascript:) como o default.
const SAFE_PROTOCOL = /^(https?|ircs?|mailto|xmpp)$/i;

/** Transformação de URL do react-markdown que preserva tokens kbimage:. */
export function kbUrlTransform(value: string): string {
  if (parseKbImageSrc(value)) {
    return value;
  }

  const colon = value.indexOf(":");
  const questionMark = value.indexOf("?");
  const numberSign = value.indexOf("#");
  const slash = value.indexOf("/");

  if (
    // Sem protocolo: URL relativa.
    colon === -1 ||
    // O primeiro ":" depois de ?/#// não é protocolo.
    (slash !== -1 && colon > slash) ||
    (questionMark !== -1 && colon > questionMark) ||
    (numberSign !== -1 && colon > numberSign) ||
    SAFE_PROTOCOL.test(value.slice(0, colon))
  ) {
    return value;
  }

  return "";
}
