import type { Dispatch, SetStateAction } from "react";
import { X } from "lucide-react";
import { Button, Card, Input, TextArea } from "@/components/ui";
import { ReportTemplateHistoryPanel } from "@/components/reports/ReportTemplateHistoryPanel";
import type { ScopeTypeString } from "@/api/types";
import type { NormalizedDataset, SupportedFormat, TemplateDraft } from "./types";

type DraftSetter = Dispatch<SetStateAction<TemplateDraft>>;

type HeaderProps = {
  isEdit: boolean;
  onBack: () => void;
};

export function TemplateFormHeader({ isEdit, onBack }: HeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-white">{isEdit ? "Editar Template" : "Novo Template"}</h1>
        <p className="text-sm text-slate-400">
          Builder dinamico de relatorios com preview em HTML e documento.
        </p>
      </div>
      <Button variant="ghost" onClick={onBack}>
        <X className="h-4 w-4" /> Voltar
      </Button>
    </div>
  );
}

type HistoryProps = {
  templateId: string;
  version: number;
};

export function TemplateHistoryCard({ templateId, version }: HistoryProps) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Historico do Template</h2>
          <p className="text-xs text-slate-400">Versao atual v{version}</p>
        </div>
      </div>
      <ReportTemplateHistoryPanel templateId={templateId} limit={20} />
    </Card>
  );
}

type IdentificationProps = {
  draft: TemplateDraft;
  setDraft: DraftSetter;
};

export function IdentificationCard({ draft, setDraft }: IdentificationProps) {
  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-white">Identificacao</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          label="Nome do template"
          value={draft.name}
          onChange={(event) =>
            setDraft((prev) => ({
              ...prev,
              name: event.target.value,
            }))
          }
          placeholder="Ex: Inventario de software por agent"
          required
          hint="Nome exibido na listagem de templates e no cabeçalho do relatório gerado."
        />
        <Input
          label="Usuario de auditoria"
          value={draft.auditUser}
          onChange={(event) =>
            setDraft((prev) => ({
              ...prev,
              auditUser: event.target.value,
            }))
          }
          placeholder="usuario@empresa.local"
          hint="Registrado nos logs de criação e atualização. Não afeta permissões de acesso."
        />
      </div>
      <div className="mt-4">
        <TextArea
          label="Descricao"
          value={draft.description}
          onChange={(event) =>
            setDraft((prev) => ({
              ...prev,
              description: event.target.value,
            }))
          }
          rows={3}
          placeholder="Descricao opcional do template"
          hint="Texto livre para descrever o objetivo do template. Visível apenas no formulário de edição."
        />
      </div>
    </Card>
  );
}

type DataSourceScopeProps = {
  draft: TemplateDraft;
  setDraft: DraftSetter;
  normalizedDatasets: NormalizedDataset[];
  selectedDataset: NormalizedDataset | null;
  defaultFormatOptions: SupportedFormat[];
  scopeOptions: ScopeTypeString[];
  onDatasetChange: (datasetKey: string) => void;
};

export function DataSourceScopeCard({
  draft,
  setDraft,
  normalizedDatasets,
  selectedDataset,
  defaultFormatOptions,
  scopeOptions,
  onDatasetChange,
}: DataSourceScopeProps) {
  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-white">Fonte de Dados e Escopo</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">Dataset</label>
          <select
            aria-label="Dataset"
            title="Dataset"
            value={draft.datasetKey}
            onChange={(event) => onDatasetChange(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white"
          >
            {normalizedDatasets.map((dataset) => (
              <option key={dataset.key} value={dataset.key} className="bg-slate-900 text-slate-100">
                {dataset.name}
              </option>
            ))}
          </select>
          {selectedDataset?.description && (
            <p className="mt-1 text-xs text-slate-500">{selectedDataset.description}</p>
          )}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">Formato</label>
          <select
            aria-label="Formato do template"
            title="Formato do template"
            value={draft.format}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                format: event.target.value as SupportedFormat,
              }))
            }
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white"
          >
            {(selectedDataset?.supportedFormats ?? defaultFormatOptions).map((format) => (
              <option key={format} value={format} className="bg-slate-900 text-slate-100">
                {format.toUpperCase()}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">Formato padrão do arquivo gerado. Pode ser sobrescrito na execução.</p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">Escopo do template</label>
          <select
            aria-label="Escopo do template"
            title="Escopo do template"
            value={draft.scopeType}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                scopeType: event.target.value as ScopeTypeString,
              }))
            }
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white"
          >
            {scopeOptions.map((scope) => (
              <option key={scope} value={scope} className="bg-slate-900 text-slate-100">
                {scope}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">Define para qual nível o template pode ser executado: <strong className="text-slate-400">global</strong> (todos), <strong className="text-slate-400">client</strong>, <strong className="text-slate-400">site</strong> ou <strong className="text-slate-400">agent</strong>.</p>
        </div>
      </div>
    </Card>
  );
}
