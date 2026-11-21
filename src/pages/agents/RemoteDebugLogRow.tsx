import { memo, type ReactNode } from "react";
import type { RemoteDebugLogEvent, RemoteDebugLogLevel } from "@/api";
import { Badge, Icon } from "@/components/ui";

export interface FormattedDebugLogEvent {
  entry: RemoteDebugLogEvent;
  normalizedLevel: RemoteDebugLogLevel;
  formattedTime: string;
  isSystem: boolean;
  rowKey: string;
}

function levelBadgeColor(level: RemoteDebugLogLevel): "slate" | "primary" | "warning" | "danger" {
  if (level === "info") return "primary";
  if (level === "warn") return "warning";
  if (level === "error") return "danger";
  return "slate";
}

function renderHighlightedMessage(message: string, query: string): ReactNode {
  if (!query) return message;
  const lowerMessage = message.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let matchIdx = lowerMessage.indexOf(query, cursor);

  while (matchIdx !== -1) {
    if (matchIdx > cursor) {
      parts.push(message.slice(cursor, matchIdx));
    }
    const matchEnd = matchIdx + query.length;
    parts.push(
      <mark key={matchIdx} className="rounded bg-warning/30 px-0.5 text-foreground">
        {message.slice(matchIdx, matchEnd)}
      </mark>,
    );
    cursor = matchEnd;
    matchIdx = lowerMessage.indexOf(query, cursor);
  }

  if (cursor < message.length) {
    parts.push(message.slice(cursor));
  }

  return parts.length > 0 ? parts : message;
}

interface RemoteDebugLogRowProps {
  item: FormattedDebugLogEvent;
  highlightQuery: string;
  wrapLines: boolean;
  onCopyLine: (entry: RemoteDebugLogEvent) => void;
}

export const RemoteDebugLogRow = memo(function RemoteDebugLogRow({
  item,
  highlightQuery,
  wrapLines,
  onCopyLine,
}: RemoteDebugLogRowProps) {
  const { entry, normalizedLevel, formattedTime, isSystem } = item;

  const rowTone = isSystem
    ? "border-l-2 border-border bg-surface-light/40 italic"
    : normalizedLevel === "error"
      ? "border-l-2 border-danger/60 bg-danger/5"
      : normalizedLevel === "warn"
        ? "border-l-2 border-warning/50 bg-warning/5"
        : "border-l-2 border-transparent";

  return (
    <div
      className={`group flex items-start gap-2 rounded px-1.5 py-0.5 hover:bg-surface-light ${rowTone}`}
    >
      <span className="shrink-0 text-muted tabular-nums">{formattedTime}</span>
      <span className="inline-block w-12 shrink-0">
        <Badge color={levelBadgeColor(normalizedLevel)}>{normalizedLevel.toUpperCase()}</Badge>
      </span>
      <span
        className={`min-w-0 flex-1 ${
          wrapLines ? "whitespace-pre-wrap break-words" : "whitespace-pre"
        } ${isSystem ? "text-muted" : "text-foreground"}`}
      >
        {renderHighlightedMessage(entry.message, highlightQuery)}
      </span>
      <button
        type="button"
        onClick={() => onCopyLine(entry)}
        aria-label="Copiar linha"
        title="Copiar linha"
        className="shrink-0 rounded p-0.5 text-muted opacity-0 transition-opacity hover:bg-surface-hover hover:text-foreground focus:opacity-100 group-hover:opacity-100"
      >
        <Icon name="content_copy" className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
});
