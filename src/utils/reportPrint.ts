/**
 * Impressao de relatorios para PDF.
 *
 * O produto nao gera mais PDF no servidor (o renderer Playwright foi removido).
 * O fluxo oficial passou a ser: gerar Markdown/HTML -> abrir a impressao do
 * navegador -> "Salvar como PDF". Este helper centraliza esse passo para que a
 * UI nao precise conhecer o detalhe de janela/impressao.
 */

/**
 * Remove conteudo ativo antes de imprimir. O HTML do relatorio e gerado pelo
 * backend (sem scripts) e usa dados de inventario reportados por agentes —
 * esta e a ultima barreira caso algo escape da composicao.
 */
function stripActiveContent(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "")
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object\b[\s\S]*?<\/object>/gi, "")
    .replace(/<embed\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return char;
    }
  });
}

/**
 * Abre o HTML do relatorio em uma janela isolada e dispara o dialogo de
 * impressao (onde o usuario escolhe "Salvar como PDF").
 *
 * Lanca erro quando o navegador bloqueia a janela, para a UI poder orientar
 * o usuario a liberar pop-ups.
 */
export function printHtmlAsPdf(html: string, title = "Relatorio"): void {
  if (typeof window === "undefined") {
    return;
  }

  // "noopener" faria window.open devolver null, por isso nao e usado aqui.
  const printWindow = window.open("", "_blank", "width=1024,height=768");
  if (!printWindow) {
    throw new Error(
      "Nao foi possivel abrir a janela de impressao. Libere pop-ups para este site e tente novamente.",
    );
  }

  const safeHtml = stripActiveContent(html);
  const documentHtml = /<html[\s>]/i.test(safeHtml)
    ? safeHtml
    : `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title></head><body>${safeHtml}</body></html>`;

  printWindow.document.open();
  printWindow.document.write(documentHtml);
  printWindow.document.close();

  const triggerPrint = () => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch {
      // O usuario pode ter fechado a janela antes da impressao.
    }
  };

  if (printWindow.document.readyState === "complete") {
    window.setTimeout(triggerPrint, 250);
  } else {
    printWindow.addEventListener("load", () => window.setTimeout(triggerPrint, 250), { once: true });
  }
}
