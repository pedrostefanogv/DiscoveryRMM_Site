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

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif', '.svg'];

/**
 * O anexo é imagem?
 *
 * O `contentType` é a fonte primária, mas nem todo upload chega tipado (o agent
 * envia `application/octet-stream` quando o sistema não reconhece a extensão).
 * Nesse caso a extensão do nome decide — assim um `.png` sem MIME continua
 * abrindo no lightbox e um `.pdf` continua baixando.
 */
export function isImageAttachment(contentType?: string | null, fileName?: string | null): boolean {
  const type = String(contentType ?? '').trim().toLowerCase();
  if (type.startsWith('image/')) return true;
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
