import { useMemo, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useReportPreview } from "@/hooks/useReportPreview";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import type { ReportDatasetTypeValue } from "@/api/types";

interface Props {
  wizard: ReturnType<
    typeof import("../hooks/useWizardState").useWizardState
  >;
}

export function LiveMarkdownPreview({ wizard }: Props) {
  const { state } = wizard;
  const [mode, setMode] = useState<"structure" | "data">("structure");
  const [clientId, setClientId] = useState<string>("");
  const [siteId, setSiteId] = useState<string>("");
  const [dataLimit, setDataLimit] = useState<string>("10");
  const [isExpandedPreviewOpen, setIsExpandedPreviewOpen] = useState(false);

  const { data: clients = [] } = useClients();
  const { data: sites = [] } = useSites(clientId || undefined);
  const previewMutation = useReportPreview();

  const previewErrorMessage = useMemo(() => {
    if (!previewMutation.isError || !previewMutation.error)
      return null;

    if (previewMutation.error instanceof Error && previewMutation.error.message?.trim())
      return previewMutation.error.message;

    return "Erro ao carregar preview. Verifique os filtros.";
  }, [previewMutation.error, previewMutation.isError]);

  const previewSrcDoc = useMemo(() => {
    const html = previewMutation.data?.html;
    if (!html)
      return null;

    return toPreviewSrcDoc(html);
  }, [previewMutation.data?.html]);

  const markdown = useMemo(() => {
    if (!state.name && state.columns.length === 0) {
      return "_Adicione colunas para ver o preview..._";
    }
    const lines: string[] = [];
    lines.push(`# ${state.name || "Novo Relatório"}`);
    if (state.subtitle) { lines.push(""); lines.push(`*${state.subtitle}*`); }
    lines.push("");

    if (state.summaries.length > 0) {
      lines.push("## 📊 Resumo"); lines.push("");
      lines.push("| Métrica | Agregação |");
      lines.push("|---------|-----------|");
      state.summaries.forEach((s) => lines.push(`| ${s.label} | ${s.aggregate} |`));
      lines.push("");
    }

    if (state.groupBy) {
      lines.push(`**Agrupado por:** \`${state.groupBy}\`  `);
      if (state.hideGroupColumn) lines.push("*(coluna oculta)*");
      lines.push("");
      lines.push(`## ${state.groupTitleTemplate || `Grupo: {{${state.groupBy}}}`}`);
      lines.push("");
      if (state.groupDetails.length > 0) {
        lines.push("| Campo | Valor |"); lines.push("|-------|-------|");
        state.groupDetails.forEach((d) => lines.push(`| ${d.label} | — |`));
        lines.push("");
      }
    }

    if (state.columns.length > 0) {
      const headers = state.columns.map((c) => `${c.header} (${c.format})`);
      lines.push(`| ${headers.join(" | ")} |`);
      lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
      const samples = state.columns.map((c) => {
        const field = c.field.split(".").pop() ?? c.field;
        switch (c.format) {
          case "number": return "128";
          case "date": case "datetime": return "2024-01-15";
          default: return field;
        }
      });
      lines.push(`| ${samples.join(" | ")} |`); lines.push("");
    }

    state.subTables.forEach((st) => {
      if (st.columns.length === 0) return;
      lines.push(`### ${st.title}`); lines.push("");
      const headers = st.columns.map((c) => c.header);
      lines.push(`| ${headers.join(" | ")} |`);
      lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
      const samples = st.columns.map((c) => c.field.split(".").pop() ?? c.field);
      lines.push(`| ${samples.join(" | ")} |`); lines.push("");
    });

    if (state.groupSummaries.length > 0) {
      lines.push("| Resumo | Agregação |"); lines.push("|--------|-----------|");
      state.groupSummaries.forEach((s) => lines.push(`| ${s.label} | ${s.aggregate ?? "count"} |`));
      lines.push("");
    }

    lines.push("---"); lines.push(""); lines.push("*Gerado por Discovery RMM*");
    return lines.join("\n");
  }, [state]);

  const loadDataPreview = useCallback(() => {
    if (!state.name && state.columns.length === 0) return;
    const primaryDs = state.selectedDatasets[0];
    const dsType = primaryDs?.catalogItem.datasetType ?? primaryDs?.catalogItem.type;
    const filters: Record<string, unknown> = {};
    if (dataLimit === "all") {
      filters.allRows = true;
    } else {
      filters.limit = Number(dataLimit);
    }
    if (clientId) filters.clientId = clientId;
    if (siteId) filters.siteId = siteId;
    previewMutation.mutate({
      previewMode: "html",
      template: {
        name: state.name || "Preview",
        datasetType: (dsType ?? "") as ReportDatasetTypeValue,
        layoutJson: wizard.buildLayoutJson(),
      },
      filtersJson: JSON.stringify(filters),
    });
  }, [state, clientId, siteId, dataLimit, wizard, previewMutation]);

  useEffect(() => {
    if (mode === "data") {
      const timer = setTimeout(loadDataPreview, 800);
      return () => clearTimeout(timer);
    }
  }, [mode, clientId, siteId, dataLimit]);

  useEffect(() => {
    if (!isExpandedPreviewOpen)
      return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape")
        setIsExpandedPreviewOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isExpandedPreviewOpen]);

  const hasColumns = state.columns.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex rounded-lg border border-border bg-surface-light p-0.5">
          <button
            onClick={() => setMode("structure")}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              mode === "structure" ? "bg-primary text-foreground" : "text-muted hover:text-foreground"
            }`}
          >📐 Estrutura</button>
          <button
            onClick={() => setMode("data")}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              mode === "data" ? "bg-primary text-foreground" : "text-muted hover:text-foreground"
            }`}
            disabled={!hasColumns}
          >📊 Dados</button>
        </div>

        {mode === "data" && (
          <button
            type="button"
            onClick={() => setIsExpandedPreviewOpen(true)}
            disabled={!previewSrcDoc}
            title="Abrir preview ampliado"
            className="rounded-md border border-border bg-surface-light px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            ⤢ Ampliar
          </button>
        )}
      </div>

      {mode === "data" && (
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-2">
          <div className="grid grid-cols-2 gap-2">
            <select value={clientId} onChange={(e) => { setClientId(e.target.value); setSiteId(""); }}
              className="rounded border border-border bg-surface-light px-2 py-1 text-xs text-foreground">
              <option value="">Todos clientes</option>
              {clients.map((c) => <option key={c.id} value={c.id} className="bg-surface">{c.name}</option>)}
            </select>
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)} disabled={!clientId}
              className="rounded border border-border bg-surface-light px-2 py-1 text-xs text-foreground">
              <option value="">Todos sites</option>
              {sites.map((s) => <option key={s.id} value={s.id} className="bg-surface">{s.name}</option>)}
            </select>
            <select value={dataLimit} onChange={(e) => setDataLimit(e.target.value)}
              className="rounded border border-border bg-surface-light px-2 py-1 text-xs text-foreground">
              <option value="5" className="bg-surface">5 linhas</option>
              <option value="10" className="bg-surface">10 linhas</option>
              <option value="25" className="bg-surface">25 linhas</option>
              <option value="50" className="bg-surface">50 linhas</option>
              <option value="100" className="bg-surface">100 linhas</option>
              <option value="all" className="bg-surface">Todos os registros</option>
            </select>
            <button onClick={loadDataPreview} disabled={previewMutation.isPending}
              className="rounded bg-primary/80 px-2 py-1 text-xs font-medium text-foreground hover:bg-primary disabled:opacity-50">
              {previewMutation.isPending ? "⏳" : "🔄"} Atualizar
            </button>
          </div>
        </div>
      )}

      <div
        className={`rounded-lg border border-border bg-black/30 ${
          mode === "data" ? "p-0" : "max-h-[600px] overflow-y-auto p-4"
        }`}
      >
        {mode === "structure" && (
          <div className="prose prose-sm prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
          </div>
        )}
        {mode === "data" && previewMutation.isPending && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted p-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Carregando dados...
          </div>
        )}
        {mode === "data" && !previewMutation.isPending && previewSrcDoc && (
          <iframe
            title="Preview de dados do relatorio"
            className="h-[520px] w-full rounded-lg bg-white"
            sandbox=""
            srcDoc={previewSrcDoc}
          />
        )}
        {mode === "data" && !previewMutation.isPending && !previewMutation.data?.html && hasColumns && (
          <div className="py-8 text-center p-4">
            <p className="text-sm text-muted">Clique em 'Atualizar' para carregar dados reais.</p>
          </div>
        )}
        {mode === "data" && previewMutation.isError && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300 m-4">
            {previewErrorMessage ?? "Erro ao carregar preview. Verifique os filtros."}
          </div>
        )}
      </div>

      {mode === "data" && previewMutation.data?.headers.rowCount != null && (
        <p className="text-center text-[10px] text-muted">
          {previewMutation.data.headers.rowCount} linhas ·{" "}
          {previewMutation.data.headers.format ?? "html"}
        </p>
      )}

      {isExpandedPreviewOpen && previewSrcDoc && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[2147483640] flex items-center justify-center bg-black/75 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget)
              setIsExpandedPreviewOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Preview ampliado"
        >
          <div className="h-[90vh] w-[min(1200px,96vw)] rounded-xl border border-border bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <h4 className="text-sm font-semibold text-foreground">Preview ampliado</h4>
              <button
                type="button"
                onClick={() => setIsExpandedPreviewOpen(false)}
                className="rounded-md border border-border bg-surface-light px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                ✕ Fechar
              </button>
            </div>
            <div className="h-[calc(90vh-49px)] p-3">
              <iframe
                title="Preview de dados do relatorio ampliado"
                className="h-full w-full rounded-lg bg-white"
                sandbox=""
                srcDoc={previewSrcDoc}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function sanitizePreviewHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "");
}

function toPreviewSrcDoc(html: string): string {
  const sanitized = sanitizePreviewHtml(html).trim();
  if (!sanitized)
    return "<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>";

  if (/<!doctype|<html[\s>]/i.test(sanitized))
    return sanitized;

  return `<!doctype html><html><head><meta charset="utf-8"></head><body>${sanitized}</body></html>`;
}
