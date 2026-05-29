import { useMemo, useState, useCallback, useEffect } from "react";
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
  const [dataLimit, setDataLimit] = useState(10);

  const { data: clients = [] } = useClients();
  const { data: sites = [] } = useSites(clientId || undefined);
  const previewMutation = useReportPreview();

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
    const filters: Record<string, unknown> = { limit: dataLimit };
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

  const hasColumns = state.columns.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5">
          <button
            onClick={() => setMode("structure")}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              mode === "structure" ? "bg-primary text-white" : "text-slate-400 hover:text-white"
            }`}
          >📐 Estrutura</button>
          <button
            onClick={() => setMode("data")}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              mode === "data" ? "bg-primary text-white" : "text-slate-400 hover:text-white"
            }`}
            disabled={!hasColumns}
          >📊 Dados</button>
        </div>
      </div>

      {mode === "data" && (
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-2">
          <div className="grid grid-cols-2 gap-2">
            <select value={clientId} onChange={(e) => { setClientId(e.target.value); setSiteId(""); }}
              className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200">
              <option value="">Todos clientes</option>
              {clients.map((c) => <option key={c.id} value={c.id} className="bg-slate-900">{c.name}</option>)}
            </select>
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)} disabled={!clientId}
              className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200">
              <option value="">Todos sites</option>
              {sites.map((s) => <option key={s.id} value={s.id} className="bg-slate-900">{s.name}</option>)}
            </select>
            <select value={dataLimit} onChange={(e) => setDataLimit(Number(e.target.value))}
              className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200">
              <option value="5" className="bg-slate-900">5 linhas</option>
              <option value="10" className="bg-slate-900">10 linhas</option>
              <option value="25" className="bg-slate-900">25 linhas</option>
              <option value="50" className="bg-slate-900">50 linhas</option>
            </select>
            <button onClick={loadDataPreview} disabled={previewMutation.isPending}
              className="rounded bg-primary/80 px-2 py-1 text-xs font-medium text-white hover:bg-primary disabled:opacity-50">
              {previewMutation.isPending ? "⏳" : "🔄"} Atualizar
            </button>
          </div>
        </div>
      )}

      <div className="max-h-[600px] overflow-y-auto rounded-lg border border-white/10 bg-black/30 p-4">
        {mode === "structure" && (
          <div className="prose prose-sm prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
          </div>
        )}
        {mode === "data" && previewMutation.isPending && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Carregando dados...
          </div>
        )}
        {mode === "data" && !previewMutation.isPending && previewMutation.data?.html && (
          <div className="max-w-none text-xs" dangerouslySetInnerHTML={{ __html: sanitizePreviewHtml(previewMutation.data.html) }} />
        )}
        {mode === "data" && !previewMutation.isPending && !previewMutation.data?.html && hasColumns && (
          <div className="py-8 text-center">
            <p className="text-sm text-slate-400">Clique em 'Atualizar' para carregar dados reais.</p>
          </div>
        )}
        {mode === "data" && previewMutation.isError && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
            Erro ao carregar preview. Verifique os filtros.
          </div>
        )}
      </div>

      {mode === "data" && previewMutation.data?.headers.rowCount != null && (
        <p className="text-center text-[10px] text-slate-500">
          {previewMutation.data.headers.rowCount} linhas ·{" "}
          {previewMutation.data.headers.format ?? "html"}
        </p>
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
