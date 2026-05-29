import { Button } from "@/components/ui";
import { LiveMarkdownPreview } from "./components/LiveMarkdownPreview";

interface Props {
  wizard: ReturnType<typeof import("./hooks/useWizardState").useWizardState>;
  onBack: () => void;
  onCreate: () => void;
  isCreating: boolean;
}

export function StepMetadata({ wizard, onBack, onCreate, isCreating }: Props) {
  const { state, setField } = wizard;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">
          Metadados e aparência
        </h2>
        <p className="text-sm text-slate-400">
          Dê um nome ao template, escolha o formato padrão e ajuste as cores.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* Left: Form */}
        <div className="space-y-6">
          {/* Identification */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-200">
              Identificação
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Nome do template *
                </label>
                <input
                  type="text"
                  value={state.name}
                  onChange={(e) => setField("name", e.target.value)}
                  placeholder="Ex: Inventário de Dispositivos"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder-slate-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Usuário de auditoria
                </label>
                <input
                  type="text"
                  value={state.createdBy}
                  onChange={(e) => setField("createdBy", e.target.value)}
                  placeholder="usuario@empresa.local"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder-slate-500"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Descrição
              </label>
              <textarea
                value={state.description}
                onChange={(e) => setField("description", e.target.value)}
                rows={2}
                placeholder="Descrição opcional do template"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder-slate-500"
              />
            </div>
          </div>

          {/* Format & Scope */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-200">
              Formato e Escopo
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Formato padrão
                </label>
                <select
                  value={state.defaultFormat}
                  onChange={(e) => setField("defaultFormat", e.target.value as any)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                >
                  <option value="xlsx" className="bg-slate-900">XLSX</option>
                  <option value="csv" className="bg-slate-900">CSV</option>
                  <option value="pdf" className="bg-slate-900">PDF</option>
                  <option value="markdown" className="bg-slate-900">Markdown</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Escopo
                </label>
                <select
                  value={state.scopeType}
                  onChange={(e) => setField("scopeType", e.target.value as any)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                >
                  <option value="global" className="bg-slate-900">Global</option>
                  <option value="client" className="bg-slate-900">Cliente</option>
                  <option value="site" className="bg-slate-900">Site</option>
                  <option value="agent" className="bg-slate-900">Agente</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Orientação
                </label>
                <select
                  value={state.orientation}
                  onChange={(e) => setField("orientation", e.target.value as any)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                >
                  <option value="portrait" className="bg-slate-900">Retrato</option>
                  <option value="landscape" className="bg-slate-900">Paisagem</option>
                </select>
              </div>
            </div>
          </div>

          {/* Style */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-200">
              🎨 Aparência
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Cor primária
                </label>
                <input
                  type="color"
                  value={state.style.primaryColor ?? "#16324F"}
                  onChange={(e) =>
                    setField("style", {
                      ...state.style,
                      primaryColor: e.target.value,
                    })
                  }
                  className="h-10 w-full rounded-lg border border-white/10"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Fundo cabeçalho
                </label>
                <input
                  type="color"
                  value={state.style.headerBackgroundColor ?? "#16324F"}
                  onChange={(e) =>
                    setField("style", {
                      ...state.style,
                      headerBackgroundColor: e.target.value,
                    })
                  }
                  className="h-10 w-full rounded-lg border border-white/10"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Texto cabeçalho
                </label>
                <input
                  type="color"
                  value={state.style.headerTextColor ?? "#FFFFFF"}
                  onChange={(e) =>
                    setField("style", {
                      ...state.style,
                      headerTextColor: e.target.value,
                    })
                  }
                  className="h-10 w-full rounded-lg border border-white/10"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Cor alternada
                </label>
                <input
                  type="color"
                  value={state.style.alternateRowColor ?? "#EEF4F7"}
                  onChange={(e) =>
                    setField("style", {
                      ...state.style,
                      alternateRowColor: e.target.value,
                    })
                  }
                  className="h-10 w-full rounded-lg border border-white/10"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Fonte
                </label>
                <input
                  type="text"
                  value={state.style.fontFamily ?? "Segoe UI, sans-serif"}
                  onChange={(e) =>
                    setField("style", {
                      ...state.style,
                      fontFamily: e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Logo URL
                </label>
                <input
                  type="text"
                  value={state.logoUrl}
                  onChange={(e) => setField("logoUrl", e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder-slate-500"
                />
              </div>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-400">
              <input
                type="checkbox"
                checked={state.style.showRowStripes ?? true}
                onChange={(e) =>
                  setField("style", {
                    ...state.style,
                    showRowStripes: e.target.checked,
                  })
                }
              />
              Listras zebradas nas linhas
            </label>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <h3 className="mb-3 text-sm font-semibold text-emerald-200">
            👁 Preview Final
          </h3>
          <LiveMarkdownPreview wizard={wizard} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between">
        <Button onClick={onBack} variant="secondary">
          ← Voltar
        </Button>
        <Button onClick={onCreate} disabled={!state.name || isCreating} variant="primary">
          {isCreating ? "Criando..." : "💾 Criar Template"}
        </Button>
      </div>
    </div>
  );
}
