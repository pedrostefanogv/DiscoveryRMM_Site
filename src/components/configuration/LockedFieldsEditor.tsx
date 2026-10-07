import { useMemo, useState } from "react";
import { Lock, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui";
import { useServerLocksImpact } from "@/hooks/useConfigurationApi";
import type { ConfigurationLockImpact } from "@/services/configurationApi";
import type { EditableField } from "@/utils/configurationEditors";
import { statusSurface, statusText } from "@/theme/statusStyles";

/**
 * Nome da propriedade na API (PascalCase) para um campo do editor (camelCase).
 * Locks são gravados com o nome da propriedade, como o backend compara.
 */
export function toApiFieldName(fieldKey: string): string {
  if (fieldKey === "aiIntegrationSettingsJson") return "AIIntegrationSettingsJson";
  if (fieldKey === "agentUpdatePolicyJson") return "AgentUpdatePolicyJson";
  if (fieldKey === "backgroundProcessingSettingsJson") return "BackgroundProcessingSettingsJson";
  return fieldKey.charAt(0).toUpperCase() + fieldKey.slice(1);
}

export function parseLockedFields(value: string): string[] {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
}

function hasField(names: string[], apiName: string): boolean {
  return names.some((name) => name.toLowerCase() === apiName.toLowerCase());
}

interface LockedFieldsEditorProps {
  value: string;
  fields: EditableField[];
  onChange: (nextJson: string) => void;
  disabled?: boolean;
}

/**
 * Editor de campos bloqueados (lockedFieldsJson): checkboxes com rótulo/descrição
 * em vez de um textarea de JSON, com prévia do impacto da cascata (overrides que
 * serão removidos em clientes/sites).
 */
export function LockedFieldsEditor({ value, fields, onChange, disabled }: LockedFieldsEditorProps) {
  const impactMutation = useServerLocksImpact();
  const [impact, setImpact] = useState<ConfigurationLockImpact | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lockedNames = useMemo(() => parseLockedFields(value), [value]);

  const selectedFields = fields.filter((field) => hasField(lockedNames, toApiFieldName(field.key)));
  const selectedNames = selectedFields.map((field) => toApiFieldName(field.key));

  const toggle = (field: EditableField) => {
    if (disabled) return;
    const apiName = toApiFieldName(field.key);
    const next = hasField(lockedNames, apiName)
      ? lockedNames.filter((name) => name.toLowerCase() !== apiName.toLowerCase())
      : [...lockedNames, apiName];

    const unique = Array.from(new Set(next));
    setImpact(null);
    setError(null);
    onChange(JSON.stringify(unique, null, 2));
  };

  const previewImpact = async () => {
    if (selectedNames.length === 0) {
      setImpact({ fields: [], affectedClients: 0, affectedSites: 0 });
      return;
    }
    setError(null);
    try {
      setImpact(await impactMutation.mutateAsync(selectedNames));
    } catch (mutationError) {
      setImpact(null);
      setError(mutationError instanceof Error ? mutationError.message : "Falha ao calcular o impacto.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Campos Bloqueados para Herança
          </p>
          <p className="text-xs text-muted">
            Campos marcados aqui não podem ser sobrescritos por clientes nem sites.
            Bloquear um campo remove os overrides existentes em cascata.
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={previewImpact}
          loading={impactMutation.isPending}
          disabled={disabled || selectedNames.length === 0}
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          Ver impacto ({selectedNames.length})
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {fields.map((field) => {
          const apiName = toApiFieldName(field.key);
          const selected = hasField(lockedNames, apiName);
          return (
            <button
              key={field.key}
              type="button"
              role="switch"
              aria-checked={selected}
              onClick={() => toggle(field)}
              disabled={disabled}
              className={`flex items-start gap-2 rounded-lg border p-3 text-left text-xs transition-colors ${
                selected
                  ? "border-red-500/40 bg-red-500/10 text-foreground"
                  : "border-border bg-surface-light text-muted hover:border-border-strong"
              }`}
            >
              <Lock className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${selected ? statusText.danger : "text-muted"}`} />
              <span className="min-w-0">
                <span className="block font-medium">{field.label}</span>
                <span className="block font-mono text-[11px] text-muted">{apiName}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div aria-live="polite">
        {error && <p className="text-xs text-danger">{error}</p>}

        {impact && (
          <div className={`rounded-lg border p-3 text-xs ${statusSurface.warning}`}>
            {impact.fields.length === 0 ? (
              <p>Nenhum override encontrado para os campos selecionados.</p>
            ) : (
              <>
                <p className="font-medium">
                  Este bloqueio removerá overrides em {impact.affectedClients} cliente(s) e {impact.affectedSites} site(s).
                </p>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  {impact.fields.map((item) => (
                    <li key={item.field}>
                      {item.field}: {item.clients} cliente(s), {item.sites} site(s)
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-muted">
        {selectedFields.length} campo(s) bloqueado(s) no servidor.
      </p>
    </div>
  );
}
