import { useId, useMemo, useState } from "react";

import { Icon } from "@/components/ui";
import { useAccessibleAgents, type AccessibleAgent } from "@/hooks/useAgents";

/** Quantidade mínima de caracteres para a busca filtrar a lista. */
export const AGENT_SEARCH_MIN_LENGTH = 3;

/** Teto de itens renderizados de uma vez (evita DOM gigante em frotas grandes). */
const MAX_RENDERED = 200;

interface AgentSearchSelectProps {
  value: string;
  onChange: (agentId: string) => void;
  label?: string;
  disabled?: boolean;
}

const agentPrimary = (agent: AccessibleAgent) =>
  agent.displayName?.trim() || agent.hostname || agent.id;

function agentHaystack(agent: AccessibleAgent): string {
  return [
    agent.hostname,
    agent.displayName ?? "",
    agent.loggedUser ?? "",
    agent.lastIpAddress ?? "",
    agent.operatingSystem ?? "",
    agent.clientName,
    agent.siteName,
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * Seletor de agente carregado dos agentes instalados que o usuário pode ver.
 *
 * A lista vem de `useAccessibleAgents`, que só consulta clientes/sites já
 * recortados pelo perfil (o backend devolve 403 fora do escopo). A busca só
 * filtra a partir de {@link AGENT_SEARCH_MIN_LENGTH} caracteres.
 */
export function AgentSearchSelect({
  value,
  onChange,
  label = "Agente",
  disabled = false,
}: AgentSearchSelectProps) {
  const [search, setSearch] = useState("");
  const inputId = useId();
  const listId = useId();

  const { agents, isLoading, isError } = useAccessibleAgents();

  const trimmedSearch = search.trim();
  const searchActive = trimmedSearch.length >= AGENT_SEARCH_MIN_LENGTH;
  const needsMoreChars =
    trimmedSearch.length > 0 && trimmedSearch.length < AGENT_SEARCH_MIN_LENGTH;

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === value),
    [agents, value],
  );

  const filtered = useMemo(() => {
    if (!searchActive) return agents;
    const terms = trimmedSearch.toLowerCase().split(/\s+/).filter(Boolean);
    return agents.filter((agent) => {
      const haystack = agentHaystack(agent);
      return terms.every((term) => haystack.includes(term));
    });
  }, [agents, searchActive, trimmedSearch]);

  const visible = filtered.slice(0, MAX_RENDERED);
  const truncated = filtered.length > visible.length;

  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        className="block text-xs font-medium text-muted-foreground"
      >
        {label}
      </label>

      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          id={inputId}
          type="search"
          role="combobox"
          aria-expanded={visible.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={disabled}
          autoComplete="off"
          className="w-full rounded-md border border-border bg-surface py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-muted outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
          placeholder={`Buscar agente (mín. ${AGENT_SEARCH_MIN_LENGTH} caracteres)...`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <p className="text-xs text-muted" aria-live="polite">
        {isLoading
          ? "Carregando agentes..."
          : isError
            ? "Não foi possível carregar os agentes."
            : needsMoreChars
              ? `Digite ao menos ${AGENT_SEARCH_MIN_LENGTH} caracteres para filtrar.`
              : searchActive
                ? `${filtered.length} agente(s) encontrado(s).`
                : `${agents.length} agente(s) no seu escopo.`}
      </p>

      {!isLoading && !isError && visible.length > 0 && (
        <div
          id={listId}
          role="listbox"
          aria-label="Agentes disponíveis"
          className="max-h-60 overflow-y-auto rounded-lg border border-border bg-background"
        >
          {visible.map((agent) => {
            const active = agent.id === value;
            const context = [agent.clientName, agent.siteName]
              .filter(Boolean)
              .join(" · ");
            return (
              <button
                key={agent.id}
                type="button"
                role="option"
                aria-selected={active}
                disabled={disabled}
                title={`ID: ${agent.id}`}
                onClick={() => onChange(agent.id)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-light disabled:cursor-not-allowed disabled:opacity-60 ${
                  active ? "bg-primary/10" : ""
                }`}
              >
                {agent.isOnline ? (
                  <Icon
                    name="wifi"
                    className="h-3.5 w-3.5 flex-shrink-0 text-success"
                    aria-hidden="true"
                  />
                ) : (
                  <Icon
                    name="wifi_off"
                    className="h-3.5 w-3.5 flex-shrink-0 text-muted"
                    aria-hidden="true"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {agentPrimary(agent)}
                  </div>
                  {context && (
                    <div className="truncate text-xs text-muted">{context}</div>
                  )}
                </div>
                {active && <span className="text-xs text-primary">✓</span>}
              </button>
            );
          })}
          {truncated && (
            <p className="border-t border-border px-3 py-2 text-xs text-muted">
              Mostrando os primeiros {visible.length} de {filtered.length}. Refine a
              busca para encontrar outro agente.
            </p>
          )}
        </div>
      )}

      {!isLoading && !isError && searchActive && filtered.length === 0 && (
        <p className="rounded-lg border border-border bg-surface-light px-3 py-2 text-xs text-muted">
          Nenhum agente encontrado para “{trimmedSearch}”.
        </p>
      )}

      {!isLoading && !isError && !searchActive && agents.length === 0 && (
        <p className="rounded-lg border border-border bg-surface-light px-3 py-2 text-xs text-muted">
          Nenhum agente instalado disponível no seu escopo.
        </p>
      )}

      {value && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2">
          {selectedAgent?.isOnline ? (
            <Icon
              name="wifi"
              className="h-3.5 w-3.5 flex-shrink-0 text-success"
              aria-hidden="true"
            />
          ) : (
            <Icon
              name="wifi_off"
              className="h-3.5 w-3.5 flex-shrink-0 text-muted"
              aria-hidden="true"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">
              {selectedAgent ? agentPrimary(selectedAgent) : value}
            </div>
            {selectedAgent ? (
              <div className="truncate text-xs text-muted">
                {[selectedAgent.clientName, selectedAgent.siteName]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            ) : (
              <div className="truncate font-mono text-xs text-muted" title={value}>
                {value}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onChange("")}
            className="rounded p-0.5 text-muted transition-colors hover:text-foreground"
            aria-label="Limpar agente"
          >
            <Icon name="close" className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
