import { useState } from 'react';
import { Search, Wifi, WifiOff, X } from 'lucide-react';
import { Select } from '@/components/ui';
import { useClients } from '@/hooks/useClients';
import { useSites } from '@/hooks/useSites';
import { useAgentsBySite } from '@/hooks/useAgents';

interface AgentPickerProps {
  value: string;
  onChange: (agentId: string) => void;
  label?: string;
}

export function AgentPicker({ value, onChange, label = 'Agente' }: AgentPickerProps) {
  const [clientId, setClientId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [search, setSearch] = useState('');

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

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-muted-foreground">{label}</span>

      <div className="grid grid-cols-2 gap-2">
        <Select
          options={clientOptions}
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            setSiteId('');
            onChange('');
          }}
        />
        <Select
          options={siteOptions}
          value={siteId}
          disabled={!clientId}
          onChange={(e) => {
            setSiteId(e.target.value);
            onChange('');
          }}
        />
      </div>

      {siteId && (
        <div className="space-y-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
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
            <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-background">
              {filtered.map((agent) => {
                const active = agent.id === value;
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => onChange(agent.id)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-light ${
                      active ? 'bg-primary/10' : ''
                    }`}
                  >
                    {agent.isOnline ? (
                      <Wifi className="h-3.5 w-3.5 flex-shrink-0 text-success" />
                    ) : (
                      <WifiOff className="h-3.5 w-3.5 flex-shrink-0 text-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {agent.displayName ?? agent.hostname}
                      </div>
                      <div className="truncate text-xs text-muted">{agent.hostname}</div>
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
          <Wifi className="h-3.5 w-3.5 flex-shrink-0 text-success" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">
              {selectedAgent ? (selectedAgent.displayName ?? selectedAgent.hostname) : value}
            </div>
            <div className="truncate font-mono text-xs text-muted">{value}</div>
          </div>
          <button
            type="button"
            onClick={() => { onChange(''); setSiteId(''); setClientId(''); }}
            className="rounded p-0.5 text-muted transition-colors hover:text-foreground"
            aria-label="Limpar agente"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
