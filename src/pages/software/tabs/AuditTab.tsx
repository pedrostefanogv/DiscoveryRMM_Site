import { useState } from 'react';
import { Search, ClipboardList, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge, Button, Card, ErrorDisplay, Input, Loading, Select } from '@/components/ui';
import { useAppStoreAudit } from '@/hooks/useAppStore';
import { useCursorPagination } from '@/hooks/useCursorPagination';
import { AppApprovalActionType, AppApprovalAuditChangeType, AppInstallationType } from '@/api/types';
import { installationTypeOptions, limitOptions, scopeLabel, formatDate } from '../softwareStoreUtils';

const changeTypeOptions = [
  { value: '', label: 'Todos' },
  { value: String(AppApprovalAuditChangeType.Created), label: 'Criado' },
  { value: String(AppApprovalAuditChangeType.Updated), label: 'Atualizado' },
  { value: String(AppApprovalAuditChangeType.Deleted), label: 'Removido' },
];

const changeTypeLabel: Record<number, string> = {
  [AppApprovalAuditChangeType.Created]: 'Criado',
  [AppApprovalAuditChangeType.Updated]: 'Atualizado',
  [AppApprovalAuditChangeType.Deleted]: 'Removido',
};

const changeTypeBadgeColor: Record<number, 'success' | 'warning' | 'danger'> = {
  [AppApprovalAuditChangeType.Created]: 'success',
  [AppApprovalAuditChangeType.Updated]: 'warning',
  [AppApprovalAuditChangeType.Deleted]: 'danger',
};

export function AuditTab() {
  const [installationType, setInstallationType] = useState(AppInstallationType.Winget);
  const [packageId, setPackageId] = useState('');
  const [changedBy, setChangedBy] = useState('');
  const [changedFrom, setChangedFrom] = useState('');
  const [changedTo, setChangedTo] = useState('');
  const [changeType, setChangeType] = useState('');
  const [limit, setLimit] = useState(50);
  const auditPag = useCursorPagination({ initialLimit: 50 });

  const [appliedFilters, setAppliedFilters] = useState({
    installationType, packageId: '', changedBy: '', changedFrom: '', changedTo: '', changeType: '', limit,
  });

  const query = useAppStoreAudit({
    installationType: appliedFilters.installationType,
    packageId: appliedFilters.packageId || undefined,
    changedBy: appliedFilters.changedBy || undefined,
    changedFrom: appliedFilters.changedFrom || undefined,
    changedTo: appliedFilters.changedTo || undefined,
    changeType: appliedFilters.changeType !== '' ? (Number(appliedFilters.changeType) as AppApprovalAuditChangeType) : undefined,
    limit: appliedFilters.limit,
    cursor: auditPag.cursor,
  });

  function applyFilters() {
    setAppliedFilters({ installationType, packageId, changedBy, changedFrom, changedTo, changeType, limit });
    auditPag.reset();
  }

  function resetFilters() {
    setPackageId(''); setChangedBy(''); setChangedFrom(''); setChangedTo(''); setChangeType('');
    const updated = { installationType, packageId: '', changedBy: '', changedFrom: '', changedTo: '', changeType: '', limit };
    setAppliedFilters(updated); auditPag.reset();
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40"><Select label="Tipo" options={installationTypeOptions} value={String(installationType)} onChange={(e) => setInstallationType(Number(e.target.value) as AppInstallationType)} /></div>
          <div className="flex-1 min-w-32"><Input label="ID do Pacote" placeholder="Microsoft.VSCode" value={packageId} onChange={(e) => setPackageId(e.target.value)} /></div>
          <div className="w-40"><Input label="Alterado por" placeholder="username" value={changedBy} onChange={(e) => setChangedBy(e.target.value)} /></div>
          <div className="w-44"><Input label="De" type="datetime-local" value={changedFrom} onChange={(e) => setChangedFrom(e.target.value)} /></div>
          <div className="w-44"><Input label="Até" type="datetime-local" value={changedTo} onChange={(e) => setChangedTo(e.target.value)} /></div>
          <div className="w-40"><Select label="Tipo de alteração" options={changeTypeOptions} value={changeType} onChange={(e) => setChangeType(e.target.value)} /></div>
          <div className="w-40"><Select label="Itens por página" options={limitOptions} value={String(limit)} onChange={(e) => setLimit(Number(e.target.value))} /></div>
          <Button onClick={applyFilters}><Search className="h-4 w-4" /> Filtrar</Button>
          <Button variant="ghost" onClick={resetFilters}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </Card>

      <Card padding={false}>
        <div className="border-b border-white/5 px-5 py-4 flex items-center justify-between">
          <span className="text-sm font-medium text-white">{query.data ? `${query.data.returnedItems} evento(s)` : 'Histórico de auditoria'}</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={auditPag.goToPrev} disabled={auditPag.page <= 1}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-xs text-slate-400">Pág. {auditPag.page}</span>
            <Button variant="ghost" size="sm" onClick={() => auditPag.goToNext(query.data?.nextCursor)} disabled={!query.data?.hasMore}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
        {query.isLoading && <Loading />}
        {query.isError && <ErrorDisplay message="Erro ao carregar auditoria." onRetry={() => query.refetch()} />}
        {query.data && query.data.items.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-500"><ClipboardList className="mb-3 h-10 w-10 opacity-30" /><p className="text-sm">Nenhum evento encontrado.</p></div>
        )}
        {query.data && query.data.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-white/5 text-xs text-slate-400">
                <th className="px-5 py-2 text-left font-medium">Data</th><th className="px-5 py-2 text-left font-medium">Pacote</th>
                <th className="px-5 py-2 text-left font-medium">Alteração</th><th className="px-5 py-2 text-left font-medium">Ação</th>
                <th className="px-5 py-2 text-left font-medium">Escopo</th><th className="px-5 py-2 text-left font-medium">Por</th>
                <th className="px-5 py-2 text-left font-medium">Motivo</th>
              </tr></thead>
              <tbody>
                {query.data.items.map((entry) => (
                  <tr key={entry.auditId} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="whitespace-nowrap px-5 py-2 text-xs text-slate-400">{formatDate(entry.changedAt)}</td>
                    <td className="px-5 py-2"><div className="font-mono text-xs text-slate-300">{entry.packageId}</div></td>
                    <td className="px-5 py-2"><Badge color={changeTypeBadgeColor[entry.changeType]}>{changeTypeLabel[entry.changeType] ?? String(entry.changeType)}</Badge></td>
                    <td className="px-5 py-2">{entry.action === AppApprovalActionType.Allow ? <Badge color="success">Permitido</Badge> : <Badge color="danger">Negado</Badge>}</td>
                    <td className="px-5 py-2 text-xs text-slate-400">{scopeLabel(entry.scopeType)}{entry.scopeId && <div className="font-mono text-slate-600 truncate max-w-[6rem]" title={entry.scopeId}>{entry.scopeId.slice(0, 8)}…</div>}</td>
                    <td className="px-5 py-2 text-xs text-slate-400">{entry.changedBy ?? '—'}</td>
                    <td className="max-w-[12rem] px-5 py-2 text-xs text-slate-500 truncate">{entry.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
