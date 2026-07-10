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
  const watermarkLogoPreviewUrl = normalizeLogoPreviewUrl(state.watermarkLogoUrl);
  const watermarkSourcePreviewUrl = watermarkLogoPreviewUrl || logoPreviewUrl;
  const canEnableWatermark = Boolean(watermarkSourcePreviewUrl);
  const watermarkPreviewEnabled = state.watermarkEnabled && canEnableWatermark;
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
        <h2 className="text-lg font-semibold text-foreground">
          Metadados e aparência
        </h2>
        <p className="text-sm text-muted">
          Dê um nome ao template, escolha o formato padrão e ajuste a identidade visual do relatório.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* Left: Form */}
        <div className="space-y-6">
          {/* Identification */}
          <div className="rounded-xl border border-border bg-surface-light p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Identificação
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  Nome do template *
                </label>
                <input
                  type="text"
                  value={state.name}
                  onChange={(e) => setField("name", e.target.value)}
                  placeholder="Ex: Inventário de Dispositivos"
                  className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground placeholder-muted"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  Usuário de auditoria
                </label>
                <input
                  type="text"
                  value={state.createdBy}
                  onChange={(e) => setField("createdBy", e.target.value)}
                  placeholder="usuario@empresa.local"
                  className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground placeholder-muted"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-muted">
                Descrição
              </label>
              <textarea
                value={state.description}
                onChange={(e) => setField("description", e.target.value)}
                rows={2}
                placeholder="Descrição opcional do template"
                className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground placeholder-muted"
              />
            </div>
          </div>

          {/* Format & Scope */}
          <div className="rounded-xl border border-border bg-surface-light p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Formato e Escopo
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  Formato padrão
                </label>
                <select
                  value={state.defaultFormat}
                  onChange={(e) => setField("defaultFormat", e.target.value as any)}
                  className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground"
                >
                  <option value="xlsx" className="bg-surface">XLSX</option>
                  <option value="csv" className="bg-surface">CSV</option>
                  <option value="pdf" className="bg-surface">PDF</option>
                  <option value="markdown" className="bg-surface">Markdown</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  Escopo
                </label>
                <select
                  value={state.scopeType}
                  onChange={(e) => setField("scopeType", e.target.value as any)}
                  className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground"
                >
                  <option value="global" className="bg-surface">Global</option>
                  <option value="client" className="bg-surface">Cliente</option>
                  <option value="site" className="bg-surface">Site</option>
                  <option value="agent" className="bg-surface">Agente</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  Orientação
                </label>
                <select
                  value={state.orientation}
                  onChange={(e) => setField("orientation", e.target.value as any)}
                  className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground"
                >
                  <option value="portrait" className="bg-surface">Retrato</option>
                  <option value="landscape" className="bg-surface">Paisagem</option>
                </select>
              </div>
            </div>
          </div>

          {/* Style */}
          <div className="rounded-xl border border-border bg-surface-light p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              🎨 Aparência
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
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
                  className="h-10 w-full rounded-lg border border-border"
                />
                <p className="mt-1 text-[11px] leading-4 text-muted">
                  Usada no título principal, linhas de destaque e separadores do relatório.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
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
                  className="h-10 w-full rounded-lg border border-border"
                />
                <p className="mt-1 text-[11px] leading-4 text-muted">
                  Cor de fundo das células de cabeçalho das tabelas.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
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
                  className="h-10 w-full rounded-lg border border-border"
                />
                <p className="mt-1 text-[11px] leading-4 text-muted">
                  Cor do texto nos cabeçalhos. Prefira alto contraste com o fundo do cabeçalho.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
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
                  className="h-10 w-full rounded-lg border border-border"
                />
                <p className="mt-1 text-[11px] leading-4 text-muted">
                  Aplicada nas linhas alternadas quando o modo zebrado estiver ativo.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
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
                  className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground"
                >
                  {fontOptions.map((option) => (
                    <option key={option.value} value={option.value} className="bg-surface">
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] leading-4 text-muted">
                  Selecione uma fonte validada para evitar erros de preenchimento e renderização.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  Logo URL
                </label>
                <input
                  type="text"
                  value={state.logoUrl}
                  onChange={(e) => {
                    const nextLogo = e.target.value;
                    setField("logoUrl", nextLogo);
                    if (!nextLogo.trim() && !state.watermarkLogoUrl.trim() && state.watermarkEnabled) {
                      setField("watermarkEnabled", false);
                    }
                  }}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground placeholder-muted"
                />
                <p className="mt-1 text-[11px] leading-4 text-muted">
                  Endereço da imagem exibida no cabeçalho do relatório.
                </p>
                {logoPreviewUrl ? (
                  <div className="mt-2 rounded-lg border border-border bg-black/20 p-2">
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-muted">
                      Pré-visualização do logo
                    </p>
                    <img
                      src={logoPreviewUrl}
                      alt="Pré-visualização do logo"
                      className="max-h-12 w-auto rounded bg-white/80 p-1 object-contain"
                    />
                  </div>
                ) : null}

                <label className="mt-3 mb-1 block text-xs font-medium text-muted">
                  URL da marca d'água (opcional)
                </label>
                <input
                  type="text"
                  value={state.watermarkLogoUrl}
                  onChange={(e) => {
                    const nextWatermarkLogo = e.target.value;
                    setField("watermarkLogoUrl", nextWatermarkLogo);
                    if (!nextWatermarkLogo.trim() && !state.logoUrl.trim() && state.watermarkEnabled) {
                      setField("watermarkEnabled", false);
                    }
                  }}
                  placeholder="https://cdn.exemplo.com/watermark.png"
                  className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground placeholder-muted"
                />
                <p className="mt-1 text-[11px] leading-4 text-muted">
                  Se informado, esta URL será usada na marca d'água sem alterar o logo do cabeçalho.
                </p>

                {watermarkLogoPreviewUrl ? (
                  <div className="mt-2 rounded-lg border border-border bg-black/20 p-2">
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-muted">
                      Pré-visualização da marca d'água
                    </p>
                    <img
                      src={watermarkLogoPreviewUrl}
                      alt="Pré-visualização da marca d'água"
                      className="max-h-12 w-auto rounded bg-white/80 p-1 object-contain"
                    />
                  </div>
                ) : null}

                <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={state.watermarkEnabled}
                    disabled={!canEnableWatermark}
                    onChange={(e) => setField("watermarkEnabled", e.target.checked)}
                  />
                  Usar imagem como marca d'água de fundo
                </label>

                {!canEnableWatermark ? (
                  <p className="mt-1 text-[11px] leading-4 text-muted">
                    Informe uma Logo URL ou URL da marca d'água para habilitar esta opção.
                  </p>
                ) : null}

                {watermarkPreviewEnabled ? (
                  <div className="mt-2 grid gap-3 rounded-lg border border-border bg-black/20 p-2 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted">
                        Ajuste da marca d'água
                      </label>
                      <select
                        value={state.watermarkFit}
                        onChange={(e) => setField("watermarkFit", e.target.value as "contain" | "cover")}
                        className="w-full rounded border border-border bg-surface-light px-2 py-1 text-xs text-foreground"
                      >
                        <option value="contain" className="bg-surface">Centralizado</option>
                        <option value="cover" className="bg-surface">Ajustar para toda a página</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted">
                        Opacidade (%)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={40}
                        value={state.watermarkOpacityPercent}
                        onChange={(e) => setField("watermarkOpacityPercent", e.target.value)}
                        className="w-full rounded border border-border bg-surface-light px-2 py-1 text-xs text-foreground"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-muted">
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
