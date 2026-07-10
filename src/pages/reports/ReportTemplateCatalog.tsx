import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui";
import { buildRunReportPath, resolveBuiltInTemplateId } from "./builtInTemplates";

const DATASET_ICONS: Record<string, string> = {
  softwareInventory: "💿",
  agentHardware: "💻",
  agentLabels: "🏷️",
  automaticLabelRules: "⚙️",
  logs: "📋",
  tickets: "🎫",
  configurationAudit: "🔍",
  automationExecutions: "⚡",
  agentInventoryComposite: "📊",
};

const BUILT_IN_TEMPLATES = [
  {
    id: "device-software-labels",
    name: "Dispositivos + Software + Labels",
    description: "Lista dispositivos com hardware, softwares instalados e labels aplicadas.",
    icon: "💻",
    datasets: ["agentHardware", "softwareInventory", "agentLabels"],
    category: "Inventário",
  },
  {
    id: "labels-to-agents",
    name: "Labels → Agents",
    description: "Lista regras de labels automáticas e quais agents cada uma afeta.",
    icon: "🏷️",
    datasets: ["automaticLabelRules", "agentLabels"],
    category: "Labels",
  },
  {
    id: "software-by-machine",
    name: "Software por Máquina",
    description: "Softwares instalados agrupados por dispositivo.",
    icon: "💿",
    datasets: ["softwareInventory"],
    category: "Inventário",
  },
  {
    id: "hardware-inventory",
    name: "Inventário de Hardware",
    description: "Inventário completo de hardware de todos os agentes.",
    icon: "💻",
    datasets: ["agentHardware"],
    category: "Inventário",
  },
  {
    id: "os-distribution",
    name: "Distribuição de SO",
    description: "Distribuição de sistemas operacionais com contagem.",
    icon: "🖥️",
    datasets: ["agentHardware"],
    category: "Análise",
  },
  {
    id: "site-overview",
    name: "Visão Geral do Site",
    description: "Resumo de hardware e software agrupado por site.",
    icon: "🏢",
    datasets: ["agentHardware", "softwareInventory"],
    category: "Gerencial",
  },
  {
    id: "automation-by-device",
    name: "Automação por Dispositivo",
    description: "Execuções de scripts de automação por dispositivo.",
    icon: "⚡",
    datasets: ["automationExecutions"],
    category: "Automação",
  },
  {
    id: "tickets-by-device",
    name: "Chamados por Dispositivo",
    description: "Chamados agrupados por dispositivo com dados de hardware.",
    icon: "🎫",
    datasets: ["tickets", "agentHardware"],
    category: "Suporte",
  },
];

export function ReportTemplateCatalog() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("clientId") || undefined;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "builtin">("all");

  const filteredBuiltIn = BUILT_IN_TEMPLATES.filter((t) => {
    if (search) {
      const q = search.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            📚 Catálogo de Templates Prontos
          </h1>
          <p className="text-sm text-muted">
            Execute templates built-in imediatamente ou crie novos no fluxo guiado.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate("/reports/templates")} variant="secondary">
            Ver Lista de Geração
          </Button>
          <Button onClick={() => navigate(`/reports/templates/new${clientId ? `?clientId=${clientId}` : ""}`)} variant="primary">
            + Novo Template
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3 text-xs text-cyan-200">
        A seleção de dataset inicial foi movida para o fluxo de criação. Clique em
        "Novo Template" para escolher datasets e montar um relatório do zero.
      </div>

      {/* Search & Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="🔍 Buscar templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] rounded-xl border border-border bg-surface-light px-3 py-2 text-sm text-foreground placeholder-muted outline-none focus-visible:border-primary/60"
        />
        <div className="flex rounded-lg border border-border bg-surface-light p-0.5">
          {[
            ["all", "Todos"],
            ["builtin", "Built-in"],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value as "all" | "builtin")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === value
                  ? "bg-primary text-white"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Built-in templates */}
      {(filter === "all" || filter === "builtin") && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted">
            🏗 Templates Prontos
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredBuiltIn.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  const builtInTemplateId = resolveBuiltInTemplateId(t.id);
                  if (builtInTemplateId) {
                    navigate(buildRunReportPath(builtInTemplateId, clientId));
                    return;
                  }

                  // Fallback de compatibilidade para slugs sem mapeamento.
                  navigate(`/reports/templates/new?template=${t.id}`);
                }}
                className="rounded-xl border border-border bg-surface-light p-4 text-left transition-all hover:border-primary/30 hover:bg-surface-hover"
              >
                <div className="mb-2 text-2xl">{t.icon}</div>
                <div className="text-sm font-semibold text-foreground">{t.name}</div>
                <div className="mt-1 text-xs text-muted">{t.description}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {t.datasets.map((ds) => (
                    <span
                      key={ds}
                      className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
                    >
                      {DATASET_ICONS[ds] ?? ""} {ds}
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
                    Built-in
                  </span>
                  <span className="text-[10px] text-muted">{t.category}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ReportTemplateCatalog;
