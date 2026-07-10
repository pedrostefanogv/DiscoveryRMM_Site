import type { ConfigurationValue } from "@/api";
import { EffectiveValueBadge } from "./EffectiveValueBadge";
import type { ConfigurationOrigin } from "@/api";

interface ConfigDiffViewerProps {
  localValue: ConfigurationValue | null | undefined;
  effectiveValue: ConfigurationValue | null | undefined;
  origin: ConfigurationOrigin;
}

function formatValue(value: ConfigurationValue | null | undefined): string {
  if (value === null || value === undefined) {
    return "null";
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
            {formatValue(localValue)}
          </pre>
        </div>
        <div>
          <p className="mb-1 text-xs text-muted">Valor efetivo</p>
          <pre className="min-h-16 rounded border border-border bg-background/50 p-2 text-xs text-foreground whitespace-pre-wrap">
            {formatValue(effectiveValue)}
          </pre>
        </div>
      </div>
    </div>
  );
}
