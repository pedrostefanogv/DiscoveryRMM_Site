import { useId, useState } from 'react';

import { Icon, Select } from '@/components/ui';
import { useClients } from '@/hooks/useClients';
import { useSites } from '@/hooks/useSites';
import { useAgentsBySite } from '@/hooks/useAgents';

interface AgentPickerProps {
  value: string;
  onChange: (agentId: string) => void;
  label?: string;
  /**
   * Cliente/site que o picker deve abrir já selecionados. Permite que o modal de
   * nova regra reencontre o agente escolhido no filtro (sem isso a lista vem
   * vazia e a confirmação só mostra o UUID).
   */
  initialClientId?: string;
  initialSiteId?: string;
  /** Notifica o dono do filtro sobre o contexto escolhido (cliente/site). */
  onContextChange?: (clientId: string, siteId: string) => void;
}

export function AgentPicker({
  value,
  onChange,
  label = 'Agente',
  initialClientId = '',
  initialSiteId = '',
  onContextChange,
}: AgentPickerProps) {
  const [clientId, setClientId] = useState(initialClientId);
  const [siteId, setSiteId] = useState(initialSiteId);
  const [search, setSearch] = useState('');
  // Id explícito por instância: `Select` deriva o id do rótulo ("cliente"/"site")
  // e duas instâncias montadas juntas (aba + modal) duplicariam o id no DOM,
  // fazendo o `<label>` focar o select errado.
  const pickerId = useId();

  const clients = useClients();
  const sites = useSites(clientId);
  const agentsQuery = useAgentsBySite(siteId);

  const filtered = (agentsQuery.data ?? []).filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.hostname.toLowerCase().includes(q) ||
      (a.displayName?.toLowerCase().includes(q) ?? false)
    );
  });

  const selectedAgent = (agentsQuery.data ?? []).find((a) => a.id === value);

  const clientOptions = [
    { value: '', label: 'Selecione o cliente...' },
    ...(clients.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];
  const siteOptions = [
    { value: '', label: clientId ? 'Selecione o site...' : 'Escolha um cliente primeiro' },
    ...(sites.data ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];

  // Nome do agente: o hostname costuma se repetir como displayName — repetir a
  // mesma linha duas vezes (e o UUID cru embaixo) deixava a seleção confusa.
  const agentPrimary = (agent: { hostname: string; displayName?: string | null }) =>
    agent.displayName?.trim() || agent.hostname;
  const agentSecondary = (agent: { hostname: string; displayName?: string | null }) => {
    const primary = agentPrimary(agent);
    return agent.hostname && agent.hostname !== primary ? agent.hostname : null;
  };
  const selectedPrimary = selectedAgent
    ? agentPrimary(selectedAgent)
    : value
      ? 'Agente selecionado'
      : '';
  const selectedSecondary = selectedAgent
    ? [
        selectedAgent.isOnline ? 'Online' : 'Offline',
        agentSecondary(selectedAgent),
      ].filter(Boolean).join(' · ')
    : null;

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-muted-foreground">{label}</span>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Select
          id={`${pickerId}-cliente`}
          label="Cliente"
          options={clientOptions}
          value={clientId}
          onChange={(e) => {
            const nextClientId = e.target.value;
            setClientId(nextClientId);
            setSiteId('');
            onChange('');
            onContextChange?.(nextClientId, '');
          }}
        />
        <Select
          id={`${pickerId}-site`}
          label="Site"
          options={siteOptions}
          value={siteId}
          disabled={!clientId}
          onChange={(e) => {
            const nextSiteId = e.target.value;
            setSiteId(nextSiteId);
            onChange('');
            onContextChange?.(clientId, nextSiteId);
          }}
        />
      </div>

      {!siteId && (
        <p className="text-xs text-muted">
          Selecione o cliente e o site para listar os agentes disponíveis.
        </p>
      )}

      {siteId && (
        <div className="space-y-1">
          <div className="relative">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              className="w-full rounded-lg border border-border bg-surface-light py-2 pl-8 pr-3 text-sm text-foreground placeholder-muted outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
              placeholder="Buscar agente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {agentsQuery.isLoading && (
            <p className="py-2 text-center text-xs text-muted">Carregando agentes...</p>
          )}

          {!agentsQuery.isLoading && filtered.length === 0 && (
            <p className="py-2 text-center text-xs text-muted">Nenhum agente encontrado.</p>
          )}

          {filtered.length > 0 && (
            <div className="max-h-60 overflow-y-auto rounded-lg border border-border bg-background">
              {filtered.map((agent) => {
                const active = agent.id === value;
                const secondary = agentSecondary(agent);
                return (
                  <button
                    key={agent.id}
                    type="button"
                    title={`ID: ${agent.id}`}
                    onClick={() => onChange(agent.id)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-light ${
                      active ? 'bg-primary/10' : ''
                    }`}
                  >
                    {agent.isOnline ? (
                      <Icon name="wifi" className="h-3.5 w-3.5 flex-shrink-0 text-success" />
                    ) : (
                      <Icon name="wifi_off" className="h-3.5 w-3.5 flex-shrink-0 text-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{agentPrimary(agent)}</div>
                      {secondary && <div className="truncate text-xs text-muted">{secondary}</div>}
                    </div>
                    {active && <span className="text-xs text-primary">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {value && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2">
          {selectedAgent?.isOnline ? (
            <Icon name="wifi" className="h-3.5 w-3.5 flex-shrink-0 text-success" />
          ) : (
            <Icon name="wifi_off" className="h-3.5 w-3.5 flex-shrink-0 text-muted" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground" title={selectedPrimary}>
              {selectedPrimary}
            </div>
            {selectedSecondary ? (
              <div className="truncate text-xs text-muted">{selectedSecondary}</div>
            ) : (
              <div className="truncate font-mono text-xs text-muted" title={value}>{value}</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              onChange('');
              setSiteId('');
              setClientId('');
              onContextChange?.('', '');
            }}
            className="rounded p-0.5 text-muted transition-colors hover:text-foreground"
            aria-label="Limpar agente"
          >
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
