import type { ConfigurationValue } from "@/api";
import { Button, TextArea } from "@/components/ui";
import { ConfigDiffViewer } from "./ConfigDiffViewer";
import { InheritableFieldToggle } from "./InheritableFieldToggle";
import type { ConfigurationOrigin } from "@/api";

interface ConfigurationFieldEditorProps {
  fieldLabel: string;
  fieldKey: string;
  value: string;
  error?: string;
  inherited: boolean;
  effectiveValue: ConfigurationValue | null | undefined;
  origin: ConfigurationOrigin;
  onValueChange: (value: string) => void;
  onToggleInherit: (next: boolean) => void;
  onSavePatch: () => void;
  onResetProperty?: () => void;
  saving?: boolean;
  resetLoading?: boolean;
  disableInheritance?: boolean;
}

export function ConfigurationFieldEditor({
  fieldLabel,
  fieldKey,
  value,
  error,
  inherited,
  effectiveValue,
  origin,
  onValueChange,
  onToggleInherit,
  onSavePatch,
  onResetProperty,
  saving,
  resetLoading,
  disableInheritance,
}: ConfigurationFieldEditorProps) {
  return (
    <div className="space-y-3 rounded-lg border border-white/5 bg-white/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">{fieldLabel}</p>
          <p className="font-mono text-xs text-slate-400">{fieldKey}</p>
        </div>

        {!disableInheritance && (
          <InheritableFieldToggle
            checked={inherited}
            onChange={onToggleInherit}
            disabled={saving || resetLoading}
          />
        )}
      </div>

      <div className="grid gap-3">
        <TextArea
          label="Valor local"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          rows={3}
          disabled={!!disableInheritance ? false : inherited}
          error={error}
          placeholder={inherited ? "Herdando do nivel acima" : "Digite o valor local"}
        />

        <ConfigDiffViewer
          localValue={inherited ? null : value}
          effectiveValue={effectiveValue}
          origin={origin}
        />
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" onClick={onSavePatch} loading={saving}>
          Salvar parcial (PATCH)
        </Button>
        {onResetProperty && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onResetProperty}
            loading={resetLoading}
          >
            Reset propriedade
          </Button>
        )}
      </div>
    </div>
  );
}
