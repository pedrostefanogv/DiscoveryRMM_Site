import { useState } from "react";
import { GitCompare } from "lucide-react";
import type { ConfigurationValue } from "@/api";
import { Button, Input, Modal, Select, TextArea } from "@/components/ui";
import { ConfigDiffViewer } from "./ConfigDiffViewer";
import { InheritableFieldToggle } from "./InheritableFieldToggle";
import type { ConfigurationOrigin } from "@/api";

type FieldKind = "boolean" | "number" | "string" | "json" | "policy";

interface ConfigurationFieldEditorProps {
  fieldLabel: string;
  fieldKey: string;
  fieldKind?: FieldKind;
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
  locked?: boolean;
  lockOwner?: string | null;
}

export function ConfigurationFieldEditor({
  fieldLabel,
  fieldKey,
  fieldKind = "string",
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
  locked,
  lockOwner,
}: ConfigurationFieldEditorProps) {  const [showDiff, setShowDiff] = useState(false);  const isReadOnly = !!locked;
  const inputDisabled = isReadOnly || (!!disableInheritance ? false : inherited);

  const numberRanges: Record<string, { min: number; max: number }> = {
    inventoryIntervalHours: { min: 1, max: 168 },
    agentHeartbeatIntervalSeconds: { min: 10, max: 3600 },
    agentOfflineThresholdSeconds: { min: 30, max: 86400 },
    tokenExpirationDays: { min: 1, max: 3650 },
    maxTokensPerAgent: { min: 1, max: 100 },
  };

  const fieldRange = numberRanges[fieldKey];

  const renderInput = () => {
    if (fieldKind === "boolean") {
      return (
        <Select
          label="Valor local"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          disabled={inputDisabled}
          options={[
            { value: "true", label: "Ativado (true)" },
            { value: "false", label: "Desativado (false)" },
          ]}
        />
      );
    }

    if (fieldKind === "policy") {
      return (
        <Select
          label="Politica"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          disabled={inputDisabled}
          options={[
            { value: "Disabled", label: "Disabled" },
            { value: "PreApproved", label: "PreApproved" },
            { value: "All", label: "All" },
            { value: "0", label: "0 (Disabled)" },
            { value: "1", label: "1 (PreApproved)" },
            { value: "2", label: "2 (All)" },
          ]}
        />
      );
    }

    if (fieldKind === "number") {
      return (
        <Input
          type="number"
          label="Valor local"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          disabled={inputDisabled}
          min={fieldRange?.min}
          max={fieldRange?.max}
          step={1}
          error={error}
          placeholder={
            fieldRange
              ? `Faixa ${fieldRange.min}..${fieldRange.max}`
              : "Digite um numero"
          }
        />
      );
    }

    if (fieldKind === "json") {
      return (
        <TextArea
          label="Valor local (JSON)"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          rows={6}
          disabled={inputDisabled}
          error={error}
          placeholder={
            inherited
              ? "Herdando do nivel acima"
              : fieldKey === "lockedFieldsJson"
                ? '["supportEnabled", "tokenExpirationDays"]'
                : "{\n  \"key\": \"value\"\n}"
          }
        />
      );
    }

    return (
      <Input
        label="Valor local"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        disabled={inputDisabled}
        error={error}
        placeholder={inherited ? "Herdando do nivel acima" : "Digite o valor local"}
      />
    );
  };

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
            disabled={saving || resetLoading || isReadOnly}
          />
        )}
      </div>

      {isReadOnly && (
        <p className="text-xs text-warning">
          Campo bloqueado{lockOwner ? ` por ${lockOwner}` : ""}.
        </p>
      )}

      <div className="grid gap-3">
        {renderInput()}

        {fieldKind === "number" && fieldRange && !error && (
          <p className="text-xs text-slate-400">
            Faixa recomendada: {fieldRange.min}..{fieldRange.max}
          </p>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowDiff(true)}
          title="Comparar valor local com efetivo"
        >
          <GitCompare className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Comparar</span>
        </Button>
        <Button size="sm" onClick={onSavePatch} loading={saving} disabled={isReadOnly}>
          Salvar
        </Button>
        {onResetProperty && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onResetProperty}
            loading={resetLoading}
            disabled={isReadOnly}
          >
            Reset
          </Button>
        )}
      </div>

      <Modal
        open={showDiff}
        onClose={() => setShowDiff(false)}
        title={`Comparar: ${fieldLabel}`}
        maxWidth="max-w-2xl"
      >
        <ConfigDiffViewer
          localValue={inherited ? null : value}
          effectiveValue={effectiveValue}
          origin={origin}
        />
      </Modal>
    </div>
  );
}
