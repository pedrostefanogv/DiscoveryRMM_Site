import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Monitor, Wifi, WifiOff } from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { useAgentsByClient } from '@/hooks/useAgents';
import { Card, DataTable, Badge, Loading, ErrorDisplay, Select } from '@/components/ui';
import type { Agent } from '@/api';
import type { Column } from '@/components/ui';

export default function AgentList() {
  const clients = useClients();
  const [selectedClient, setSelectedClient] = useState('');
  const agents = useAgentsByClient(selectedClient);
  const navigate = useNavigate();

  const columns: Column<Agent>[] = [
    {
      key: 'name',
      header: 'Agente',
      render: a => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20">
            <Monitor className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-medium text-white">{a.displayName ?? a.hostname}</p>
            <p className="text-xs text-slate-500">{a.hostname}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'os',
      header: 'SO',
      render: a => (
        <span className="text-slate-300">{a.operatingSystem ?? '—'} {a.osVersion ?? ''}</span>
      ),
    },
    {
      key: 'version',
      header: 'Versão Agent',
      render: a => <span className="text-slate-400">{a.agentVersion ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: a => (
        <Badge color={a.isOnline ? 'success' : 'slate'}>
          <span className="flex items-center gap-1">
            {a.isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {a.isOnline ? 'Online' : 'Offline'}
          </span>
        </Badge>
      ),
    },
    {
      key: 'lastSeen',
      header: 'Último contato',
      render: a =>
        a.lastSeen ? (
          <span className="text-slate-400 text-xs">
            {new Date(a.lastSeen).toLocaleString('pt-BR')}
          </span>
        ) : (
          <span className="text-slate-600">—</span>
        ),
    },
  ];

  if (clients.isLoading) return <Loading />;
  if (clients.isError) return <ErrorDisplay onRetry={() => clients.refetch()} />;

  const clientOptions = [
    { value: '', label: 'Selecione um cliente...' },
    ...(clients.data ?? []).map(c => ({ value: c.id, label: c.name })),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Agentes</h1>
        <p className="text-sm text-slate-400">Gerenciamento de dispositivos monitorados</p>
      </div>

      <div className="max-w-sm">
        <Select
          label="Filtrar por cliente"
          options={clientOptions}
          value={selectedClient}
          onChange={e => setSelectedClient(e.target.value)}
        />
      </div>

      {selectedClient ? (
        agents.isLoading ? (
          <Loading />
        ) : agents.isError ? (
          <ErrorDisplay onRetry={() => agents.refetch()} />
        ) : (
          <Card padding={false}>
            <DataTable
              columns={columns}
              data={agents.data ?? []}
              keyExtractor={a => a.id}
              onRowClick={a => navigate(`/agents/${a.id}`)}
              emptyMessage="Nenhum agente encontrado para este cliente"
            />
          </Card>
        )
      ) : (
        <div className="flex h-40 items-center justify-center text-sm text-slate-500">
          Selecione um cliente para ver os agentes
        </div>
      )}
    </div>
  );
}
