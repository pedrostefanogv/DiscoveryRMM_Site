import type { ConfigurationValue } from "@/api";
import { formatAppStorePolicyValue } from "@/utils/configurationEditors";
import { EffectiveValueBadge } from "./EffectiveValueBadge";
import type { ConfigurationOrigin } from "@/api";

interface ConfigDiffViewerProps {
  localValue: ConfigurationValue | null | undefined;
  effectiveValue: ConfigurationValue | null | undefined;
  origin: ConfigurationOrigin;
  /** Chave do campo, usada para exibir valores legíveis (ex.: política da loja). */
  fieldKey?: string;
}

function formatValue(
  value: ConfigurationValue | null | undefined,
  fieldKey?: string,
): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (fieldKey === "appStorePolicy") {
    return formatAppStorePolicyValue(value);
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[valor não serializável]";
  }
}

export function ConfigDiffViewer({
  localValue,
  effectiveValue,
  origin,
  fieldKey,
}: ConfigDiffViewerProps) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-background/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Comparativo</p>
        <EffectiveValueBadge origin={origin} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <p className="mb-1 text-xs text-muted">Valor local</p>
          <pre className="min-h-16 rounded border border-border bg-background/50 p-2 text-xs text-foreground whitespace-pre-wrap">
            {formatValue(localValue, fieldKey)}
          </pre>
        </div>
        <div>
          <p className="mb-1 text-xs text-muted">Valor efetivo</p>
          <pre className="min-h-16 rounded border border-border bg-background/50 p-2 text-xs text-foreground whitespace-pre-wrap">
            {formatValue(effectiveValue, fieldKey)}
          </pre>
        </div>
      </div>
    </div>
  );
}
