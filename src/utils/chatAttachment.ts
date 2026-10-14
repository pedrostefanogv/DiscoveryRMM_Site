/**
 * Regras compartilhadas de anexo de conversa (chat do chamado e chat de suporte
 * da máquina).
 *
 * O mesmo anexo pode ser imagem (print) ou arquivo (PDF, log, certificado…).
 * A UI precisa decidir entre ABRIR NO LIGHTBOX (só imagem) e BAIXAR: um PDF
 * dentro de um `<img>` não renderiza e o navegador mostra apenas o texto do
 * `alt` no meio da tela — era exatamente o sintoma do "Certificado.pdf" no chat
 * do suporte.
 */

/**
 * Tipos de imagem que o NAVEGADOR do console renderiza em `<img>`.
 *
 * Não basta `image/*`: `image/tiff` e `image/heic` (e afins) estão na família
 * `image/` mas não renderizam no Chrome/Edge/Firefox — tratá-los como "tem
 * preview" reproduziria o mesmo vazio do PDF, agora com outro MIME. Os formatos
 * fora desta lista são baixados, que é o comportamento útil.
 */
const RENDERABLE_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/gif',
  'image/apng',
  'image/webp',
  'image/bmp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/x-png',
  'image/avif',
  'image/svg+xml',
]);

const IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.jfif',
  '.gif',
  '.apng',
  '.webp',
  '.bmp',
  '.ico',
  '.avif',
  '.svg',
];

/**
 * O anexo abre no lightbox (é uma imagem renderizável)?
 *
 * O `contentType` é a fonte primária, mas nem todo upload chega tipado (o agent
 * envia `application/octet-stream` quando o sistema não reconhece a extensão).
 * Nesse caso a extensão do nome decide — assim um `.png` sem MIME continua
 * abrindo no lightbox e um `.pdf` continua baixando.
 *
 * Tudo o que não é imagem RENDERIZÁVEL baixa com o nome original: PDF, log, zip,
 * csv, executável, anexo sem tipo e também os formatos de imagem que o navegador
 * não sabe exibir.
 */
export function isImageAttachment(contentType?: string | null, fileName?: string | null): boolean {
  // Parâmetros do header (`image/svg+xml; charset=utf-8`) não fazem parte do tipo.
  const type = String(contentType ?? '').trim().toLowerCase().split(';')[0].trim();
  if (RENDERABLE_IMAGE_TYPES.has(type)) return true;
  if (type && type !== 'application/octet-stream') return false;

  const name = String(fileName ?? '').trim().toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => name.endsWith(extension));
}

/**
 * Tempo que o object URL do download continua vivo depois do clique.
 *
 * A revogação é ADIADA de propósito: revogar no mesmo tick cancela o download em
 * parte dos navegadores (o Firefox interrompe a leitura do blob). O download já
 * está em curso nesse ponto e o teto evita segurar o blob para sempre.
 */
export const BLOB_DOWNLOAD_REVOKE_MS = 30_000;

/** Dispara o download de um blob já autenticado (same-origin). */
export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName || 'anexo';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), BLOB_DOWNLOAD_REVOKE_MS);
}
