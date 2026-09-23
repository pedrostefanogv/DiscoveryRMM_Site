import { useState } from 'react';
import { Card, CardHeader, Badge, Loading, ErrorDisplay, Input, Select } from '@/components/ui';
import { useTicketCsat } from '@/hooks/useSupportProductivity';
import { useClients } from '@/hooks/useClients';
import { useDepartments } from '@/hooks/useDepartments';

export default function TicketCsatPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [clientId, setClientId] = useState('');
  const [departmentId, setDepartmentId] = useState('');

  const clients = useClients();
  const departments = useDepartments({ clientId: clientId || undefined, includeGlobal: true });
  const csat = useTicketCsat({
    from: from || undefined,
    to: to || undefined,
    clientId: clientId || undefined,
    departmentId: departmentId || undefined,
  });

  const clientOpts = [{ value: '', label: 'Todos' }, ...(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))];
  const deptOpts = [{ value: '', label: 'Todos' }, ...(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))];

  const d = csat.data;
  const maxDist = Math.max(1, ...Object.values(d?.distribution ?? {}));
  const responseRate = d && d.total > 0 ? Math.round((d.rated / d.total) * 100) : 0;

  const tiles = [
    ['Encerrados', String(d?.total ?? 0)],
    ['Avaliados', String(d?.rated ?? 0)],
    ['Taxa de resposta', `${responseRate}%`],
    ['Média', (d?.average ?? 0).toFixed(2)],
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Satisfação (CSAT)</h1>
        <p className="text-sm text-muted">Avaliação dos chamados encerrados no período.</p>
      </div>

      <Card>
        <div className="grid gap-3 sm:grid-cols-4">
          <Input label="De" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="Até" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Select label="Cliente" options={clientOpts} value={clientId}
            onChange={(e) => { setClientId(e.target.value); setDepartmentId(''); }} />
          <Select label="Departamento" options={deptOpts} value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)} />
        </div>
      </Card>

      {csat.isLoading && <Loading />}
      {csat.isError && <ErrorDisplay onRetry={() => csat.refetch()} />}

      {d && (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            {tiles.map(([label, value]) => (
              <Card key={label}>
                <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader title="Distribuição das notas" />
            <div className="space-y-2">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = d.distribution[String(star)] ?? 0;
                const pct = maxDist > 0 ? (count / maxDist) * 100 : 0;
                return (
                  <div key={star} className="flex items-center gap-3">
                    <span className="w-20 text-sm text-muted">{star} estrela{star > 1 ? 's' : ''}</span>
                    <div className="h-2 flex-1 rounded-full bg-surface-hover">
                      <div className="h-2 rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-10 text-right text-sm text-foreground">{count}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <CsatTable title="Por departamento" groups={d.byDepartment} />
            <CsatTable title="Por técnico" groups={d.byTechnician} />
          </div>
        </>
      )}
    </div>
  );
}

function CsatTable({ title, groups }: { title: string; groups: { label: string; count: number; average: number }[] }) {
  return (
    <Card>
      <CardHeader title={title} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1">Grupo</th><th className="py-1">Notas</th><th className="py-1">Média</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr><td colSpan={3} className="py-3 text-center text-muted">Sem dados no período</td></tr>
            )}
            {groups.map((g, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-2 text-foreground">{g.label}</td>
                <td className="text-muted">{g.count}</td>
                <td>
                  <Badge color={g.average >= 4 ? 'success' : g.average >= 3 ? 'warning' : 'danger'}>
                    {g.average.toFixed(2)}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
