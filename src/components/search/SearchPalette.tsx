import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Layers,
  Loader2,
  Monitor,
  Package,
  Search,
  Ticket,
} from "lucide-react";
import type { UniversalSearchResult } from "@/api";

// ── Icon map ──────────────────────────────────────────

const ENTITY_ICONS: Record<string, typeof Monitor> = {
  agents: Monitor,
  clients: Building2,
  sites: Layers,
  tickets: Ticket,
  software: Package,
};

const ENTITY_COLORS: Record<string, string> = {
  agents: "text-cyan-400",
  clients: "text-violet-400",
  sites: "text-amber-400",
  tickets: "text-rose-400",
  software: "text-emerald-400",
};

function getEntityIcon(entityType: string) {
  return ENTITY_ICONS[entityType] ?? Search;
}

function getEntityColor(entityType: string) {
  return ENTITY_COLORS[entityType] ?? "text-slate-400";
}

// ── Props ──────────────────────────────────────────────

interface SearchPaletteProps {
  query: string;
  results: UniversalSearchResult | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

function normalizeResultUrl(url: string, entityType: string): string {
  const trimmed = url.trim();

  // O backend pode retornar rota legada de software (/software/:id),
  // mas o frontend atual expõe /software/store e /software/inventory.
  if (entityType === "software" && /^\/software\/[^/]+$/i.test(trimmed)) {
    return "/software/store";
  }

  // Normaliza rota legada de agent (/clients/{}/sites/{}/agents/{})
  // para a rota canônica /agents/:id.
  if (entityType === "agent") {
    const match = trimmed.match(/\/agents\/([a-f0-9-]+)$/i);
    if (match) {
      return `/agents/${match[1]}`;
    }
  }

  return trimmed;
}

// ── Component ──────────────────────────────────────────

export function SearchPalette({
  query,
  results,
  loading,
  error,
  onClose,
}: SearchPaletteProps) {
  const navigate = useNavigate();

  const handleItemClick = useCallback(
    (url: string, entityType: string) => {
      navigate(normalizeResultUrl(url, entityType));
      onClose();
    },
    [navigate, onClose],
  );

  const hasResults = results && results.groups.length > 0;

  return (
    <div className="absolute left-0 right-0 top-full z-50 mt-2 w-full">
      <div className="rounded-xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-xl">
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-slate-400">Buscando...</span>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="py-6 text-center">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {/* Empty state — query >= 3 chars, loaded, no results */}
        {!loading && !error && query.trim().length >= 3 && !hasResults && (
          <div className="flex flex-col items-center gap-2 py-6">
            <Search className="h-6 w-6 text-slate-500" strokeWidth={1.5} />
            <p className="text-sm text-slate-400">
              Nenhum resultado encontrado para &ldquo;{query.trim()}&rdquo;
            </p>
          </div>
        )}

        {/* Results */}
        {hasResults &&
          results.groups.map((group) => {
            const Icon = getEntityIcon(group.entityType);
            const color = getEntityColor(group.entityType);

            return (
              <div key={group.entityType} className="mb-2 last:mb-0">
                {/* Group header */}
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <Icon className={`h-4 w-4 ${color}`} strokeWidth={1.5} />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {group.label}
                  </span>
                </div>

                {/* Items */}
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item.url, item.entityType)}
                    className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/5"
                  >
                    <div
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 ${color}`}
                    >
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-200">
                        {item.title}
                      </p>
                      {item.subtitle && (
                        <p className="truncate text-xs text-slate-400">
                          {item.subtitle}
                        </p>
                      )}
                      {item.clientName && (
                        <p className="truncate text-xs text-slate-500">
                          {item.clientName}
                          {item.siteName ? ` · ${item.siteName}` : ""}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            );
          })}

        {/* Footer — total de resultados */}
        {hasResults && (
          <div className="border-t border-white/5 px-3 pt-2">
            <p className="text-xs text-slate-500">
              {results.totalResults}{" "}
              {results.totalResults === 1 ? "resultado" : "resultados"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
