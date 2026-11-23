import { useMemo, useState } from "react";
import { Icon, Input } from "@/components/ui";

interface TagColumnProps {
  title: string;
  placeholder: string;
  tone: "include" | "exclude";
  selectedTags: string[];
  oppositeTags: string[];
  knownTags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
}

function TagColumn({
  title,
  placeholder,
  tone,
  selectedTags,
  oppositeTags,
  knownTags,
  onAdd,
  onRemove,
}: TagColumnProps) {
  const [query, setQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return knownTags
      .filter((tag) => !selectedTags.some((s) => s.toLowerCase() === tag.toLowerCase()))
      .filter((tag) => (!q ? true : tag.toLowerCase().includes(q)))
      .slice(0, 12);
  }, [knownTags, selectedTags, query]);

  const trimmedQuery = query.trim();
  const canCreateCustom =
    Boolean(trimmedQuery) &&
    !selectedTags.some((s) => s.toLowerCase() === trimmedQuery.toLowerCase()) &&
    !knownTags.some((k) => k.toLowerCase() === trimmedQuery.toLowerCase());

  const handleSelect = (tag: string) => {
    onAdd(tag);
    setQuery("");
  };

  const chipClasses =
    tone === "include"
      ? "border-success/40 bg-success/10 text-foreground"
      : "border-danger/40 bg-danger/10 text-foreground";

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Input
          label={title}
          value={query}
          placeholder={placeholder}
          onFocus={() => setDropdownOpen(true)}
          onBlur={() => {
            setTimeout(() => setDropdownOpen(false), 150);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setDropdownOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && trimmedQuery) {
              e.preventDefault();
              handleSelect(trimmedQuery);
            }
          }}
        />
        {dropdownOpen && (suggestions.length > 0 || canCreateCustom) && (
          <div className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-xl">
            {canCreateCustom && (
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs text-primary hover:bg-surface-hover"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(trimmedQuery);
                }}
              >
                <span>Adicionar "{trimmedQuery}"</span>
                <Icon name="add" className="h-3.5 w-3.5" />
              </button>
            )}
            {suggestions.map((tag) => {
              const inOpposite = oppositeTags.some((t) => t.toLowerCase() === tag.toLowerCase());
              return (
                <button
                  key={tag}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-foreground hover:bg-surface-hover"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(tag);
                  }}
                >
                  <span className="truncate">{tag}</span>
                  {inOpposite && (
                    <span className="shrink-0 text-[10px] text-warning">
                      {tone === "include" ? "mover de excluir" : "mover de incluir"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 rounded-lg border border-border bg-surface/40 p-2">
          {selectedTags.map((tag) => (
            <span
              key={tag}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${chipClasses}`}
            >
              {tag}
              <button
                type="button"
                className="text-muted hover:text-foreground"
                onClick={() => onRemove(tag)}
                aria-label={`Remover tag ${tone === "exclude" ? "excluída " : ""}${tag}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface TaskTagSelectorProps {
  includeTags: string[];
  excludeTags: string[];
  knownTags: string[];
  onChangeInclude: (next: string[]) => void;
  onChangeExclude: (next: string[]) => void;
}

export function TaskTagSelector({
  includeTags,
  excludeTags,
  knownTags,
  onChangeInclude,
  onChangeExclude,
}: TaskTagSelectorProps) {
  const addInclude = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    if (!includeTags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      onChangeInclude([...includeTags, tag]);
    }
    if (excludeTags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      onChangeExclude(excludeTags.filter((t) => t.toLowerCase() !== tag.toLowerCase()));
    }
  };

  const addExclude = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    if (!excludeTags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      onChangeExclude([...excludeTags, tag]);
    }
    if (includeTags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      onChangeInclude(includeTags.filter((t) => t.toLowerCase() !== tag.toLowerCase()));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          Filtragem por tags / labels (opcional)
        </p>
        <p className="text-xs text-muted">Digite para buscar ou pressione Enter</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TagColumn
          title="Incluir agentes com as tags"
          placeholder="Buscar ou digitar tag..."
          tone="include"
          selectedTags={includeTags}
          oppositeTags={excludeTags}
          knownTags={knownTags}
          onAdd={addInclude}
          onRemove={(tag) => onChangeInclude(includeTags.filter((t) => t !== tag))}
        />
        <TagColumn
          title="Excluir agentes com as tags"
          placeholder="Buscar ou digitar tag..."
          tone="exclude"
          selectedTags={excludeTags}
          oppositeTags={includeTags}
          knownTags={knownTags}
          onAdd={addExclude}
          onRemove={(tag) => onChangeExclude(excludeTags.filter((t) => t !== tag))}
        />
      </div>
    </div>
  );
}
