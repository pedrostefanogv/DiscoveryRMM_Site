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

/** Monta o token Markdown de uma imagem privada. */
export function buildKbImageToken(attachmentId: string, alt = "imagem"): string {
  const label = alt.replace(/[\[\]()]/g, "").trim() || "imagem";
  // GUID canônico em minúsculas (igual ao Guid:D do backend): mantém o token
  // idêntico ao gravado pela API e evita duas entradas de cache por caixa.
  return `![${label}](${KBIMAGE_SCHEME}${attachmentId.toLowerCase()})`;
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
