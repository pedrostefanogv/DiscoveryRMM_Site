import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Loading } from "@/components/ui";
import { useReportDatasets } from "@/hooks/useReportDatasets";

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
  const { data: datasets = [], isLoading } = useReportDatasets();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "builtin" | "custom">("all");

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

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            📊 Templates de Relatório
          </h1>
          <p className="text-sm text-slate-400">
            Use um template pronto ou crie um personalizado.
          </p>
        </div>
        <Button onClick={() => navigate("/reports/templates/new")} variant="primary">
          + Novo Template
        </Button>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="🔍 Buscar templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus-visible:border-primary/60"
        />
        <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5">
          {[
            ["all", "Todos"],
            ["builtin", "Built-in"],
            ["custom", "Meus"],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value as any)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === value
                  ? "bg-primary text-white"
                  : "text-slate-400 hover:text-white"
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
          <h2 className="mb-3 text-sm font-semibold text-slate-400">
            🏗 Templates Prontos
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredBuiltIn.map((t) => (
              <button
                key={t.id}
                onClick={() =>
                  navigate(
                    `/reports/templates/new?template=${t.id}`,
                  )
                }
                className="rounded-xl border border-white/10 bg-white/5 p-4 text-left transition-all hover:border-primary/30 hover:bg-white/10"
              >
                <div className="mb-2 text-2xl">{t.icon}</div>
                <div className="text-sm font-semibold text-white">{t.name}</div>
                <div className="mt-1 text-xs text-slate-400">{t.description}</div>
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
                  <span className="text-[10px] text-slate-500">{t.category}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Dataset quick-start cards */}
      {(filter === "all" || filter === "custom") && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-400">
            📦 Começar com um Dataset
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {datasets.map((ds) => {
              const key = ds.key ?? ds.type ?? "";
              return (
                <button
                  key={key}
                  onClick={() =>
                    navigate(
                      `/reports/templates/new?dataset=${key}`,
                    )
                  }
                  className="rounded-xl border border-white/10 bg-white/5 p-4 text-left transition-all hover:border-primary/30 hover:bg-white/10"
                >
                  <div className="mb-2 text-2xl">
                    {DATASET_ICONS[key] ?? "📄"}
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {ds.name ?? key}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {ds.description ?? `${(ds.fields ?? []).length} campos`}
                  </div>
                  <div className="mt-2 text-[10px] text-slate-500">
                    {(ds.fields ?? []).length} campos · Escopo:{" "}
                    {ds.executionSchema?.scopeType !== undefined
                      ? ["Global", "Cliente", "Site", "Agente"][
                          ds.executionSchema.scopeType
                        ]
                      : "global"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default ReportTemplateCatalog;
