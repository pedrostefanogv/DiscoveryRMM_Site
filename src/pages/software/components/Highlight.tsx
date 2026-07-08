interface HighlightProps {
  text?: string | null;
  query: string;
}

export function Highlight({ text, query }: HighlightProps) {
  if (!text) return null;
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="rounded bg-amber-400/30 px-0.5 text-amber-200">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}
