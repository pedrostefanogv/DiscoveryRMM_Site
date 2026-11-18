import DOMPurify from "dompurify";

/**
 * Impressao de relatorios para PDF.
 *
 * O produto nao gera mais PDF no servidor (o renderer Playwright foi removido).
 * O fluxo oficial passou a ser: gerar Markdown/HTML -> abrir a impressao do
 * navegador -> "Salvar como PDF". Este helper centraliza esse passo para que a
 * UI nao precise conhecer o detalhe de janela/impressao.
 */

const FORBID_TAGS = [
  "script",
  "iframe",
  "object",
  "embed",
  "applet",
  "base",
  "meta",
  "link",
  "form",
];

const FORBID_ATTR = ["srcdoc", "formaction"];

const PRINT_IFRAME_CLEANUP_MS = 60_000;

/**
 * Sanitiza HTML do relatorio com DOMPurify antes de imprimir.
 */
function sanitizeReportHtml(html: string, isFullDocument: boolean): string {
  return DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: isFullDocument,
    ADD_TAGS: ["style"],
    FORBID_TAGS,
    FORBID_ATTR,
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function openSanitizedBlobFallback(documentHtml: string): void {
  const blob = new Blob([documentHtml], { type: "text/html;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, "_blank", "noopener,noreferrer");
  window.setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, PRINT_IFRAME_CLEANUP_MS);
}

/**
 * Abre o HTML do relatorio em um iframe oculto com sandbox sem same-origin
 * (ou fallback via Blob URL isolado com noopener,noreferrer) e dispara o
 * dialogo de impressao.
 */
export function printHtmlAsPdf(html: string, title = "Relatorio"): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const isFullDocument = /<html[\s>]/i.test(html);
  const safeHtml = sanitizeReportHtml(html, isFullDocument);
  const documentHtml = isFullDocument && /<html[\s>]/i.test(safeHtml)
    ? (/^<!doctype\s+html/i.test(safeHtml.trimStart()) ? safeHtml : `<!doctype html>${safeHtml}`)
    : `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title></head><body>${safeHtml}</body></html>`;

  const staleIframes = document.querySelectorAll('iframe[data-report-print="true"]');
  for (const stale of staleIframes) {
    stale.remove();
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("data-report-print", "true");
  iframe.setAttribute("sandbox", "allow-modals");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.srcdoc = documentHtml;

  let printed = false;
  let fallbackTimer: number | undefined;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    if (fallbackTimer !== undefined) {
      window.clearTimeout(fallbackTimer);
      fallbackTimer = undefined;
    }
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      openSanitizedBlobFallback(documentHtml);
    }
  };

  iframe.addEventListener(
    "load",
    () => {
      window.setTimeout(triggerPrint, 250);
    },
    { once: true },
  );

  (document.body ?? document.documentElement).appendChild(iframe);
  fallbackTimer = window.setTimeout(triggerPrint, 250);

  window.setTimeout(() => {
    iframe.remove();
  }, PRINT_IFRAME_CLEANUP_MS);
}
