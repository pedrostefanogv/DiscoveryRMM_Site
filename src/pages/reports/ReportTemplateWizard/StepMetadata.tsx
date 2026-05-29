import { Button } from "@/components/ui";
import { LiveMarkdownPreview } from "./components/LiveMarkdownPreview";

const REPORT_FONT_OPTIONS = [
  { label: "Segoe UI (padrão)", value: "Segoe UI, sans-serif" },
  { label: "Inter", value: "Inter, system-ui, sans-serif" },
  { label: "Roboto", value: "Roboto, Arial, sans-serif" },
  { label: "Helvetica Neue", value: "Helvetica Neue, Helvetica, Arial, sans-serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Trebuchet MS", value: "Trebuchet MS, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: "Times New Roman, Times, serif" },
  { label: "Courier New", value: "Courier New, monospace" },
];

function normalizeLogoPreviewUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/^(https?:\/\/|data:image\/|blob:|\/)/i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

interface Props {
  wizard: ReturnType<typeof import("./hooks/useWizardState").useWizardState>;
  onBack: () => void;
  onCreate: () => void;
  isCreating: boolean;
}

export function StepMetadata({ wizard, onBack, onCreate, isCreating }: Props) {
  const { state, setField } = wizard;
  const logoPreviewUrl = normalizeLogoPreviewUrl(state.logoUrl);
  const selectedFontFamily = state.style.fontFamily ?? "Segoe UI, sans-serif";
  const fontOptions = REPORT_FONT_OPTIONS.some(
    (option) => option.value === selectedFontFamily,
  )
    ? REPORT_FONT_OPTIONS
    : [
        { label: `Atual (${selectedFontFamily})`, value: selectedFontFamily },
        ...REPORT_FONT_OPTIONS,
      ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">
          Metadados e aparência
        </h2>
        <p className="text-sm text-slate-400">
          Dê um nome ao template, escolha o formato padrão e ajuste a identidade visual do relatório.
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
                <p className="mt-1 text-[11px] leading-4 text-slate-500">
                  Usada no título principal, linhas de destaque e separadores do relatório.
                </p>
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
                <p className="mt-1 text-[11px] leading-4 text-slate-500">
                  Cor de fundo das células de cabeçalho das tabelas.
                </p>
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
                <p className="mt-1 text-[11px] leading-4 text-slate-500">
                  Cor do texto nos cabeçalhos. Prefira alto contraste com o fundo do cabeçalho.
                </p>
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
                <p className="mt-1 text-[11px] leading-4 text-slate-500">
                  Aplicada nas linhas alternadas quando o modo zebrado estiver ativo.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Fonte
                </label>
                <select
                  value={selectedFontFamily}
                  onChange={(e) =>
                    setField("style", {
                      ...state.style,
                      fontFamily: e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                >
                  {fontOptions.map((option) => (
                    <option key={option.value} value={option.value} className="bg-slate-900">
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">
                  Selecione uma fonte validada para evitar erros de preenchimento e renderização.
                </p>
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
                <p className="mt-1 text-[11px] leading-4 text-slate-500">
                  Endereço da imagem exibida no cabeçalho do relatório.
                </p>
                {logoPreviewUrl ? (
                  <div className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2">
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                      Pré-visualização do logo
                    </p>
                    <img
                      src={logoPreviewUrl}
                      alt="Pré-visualização do logo"
                      className="max-h-12 w-auto rounded bg-white/80 p-1 object-contain"
                    />
                  </div>
                ) : null}
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
