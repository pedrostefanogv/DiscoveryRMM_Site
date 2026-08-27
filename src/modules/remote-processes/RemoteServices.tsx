import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProcessesStream, type ServiceInfo } from './useProcessStream';
import { formatBytes, formatConnections, formatCpuPercent } from './format';

interface RemoteServicesProps {
    sessionId: string;
    agentId: string;
    natsSubject?: string;
    natsUrl?: string;
    jwt?: string;
    nkeySeed?: string;
}

type ServiceSortKey = 'name' | 'state' | 'startType' | 'pid' | 'cpuPercent' | 'memoryBytes' | 'connections';

// Ordem semântica de estados para agrupar "em execução" primeiro, etc.
const stateOrder: Record<string, number> = {
    running: 0,
    start_pending: 1,
    continue_pending: 1,
    pause_pending: 2,
    paused: 3,
    stop_pending: 4,
    stopped: 5,
};

// Ordem semântica de tipo de inicialização.
const startTypeOrder: Record<string, number> = {
    auto: 0,
    demand: 1,
    disabled: 2,
};

const serviceStateColor = (state: string) => {
    switch (state) {
        case 'running': return 'text-success';
        case 'start_pending':
        case 'stop_pending':
        case 'continue_pending':
        case 'pause_pending': return 'text-warning';
        case 'paused': return 'text-accent';
        default: return 'text-muted-foreground';
    }
};

const startTypeLabel = (t?: string) => {
    switch (t) {
        case 'auto': return 'Automática';
        case 'demand': return 'Manual';
        case 'disabled': return 'Desabilitado';
        default: return t ?? '—';
    }
};

const stateLabel = (s: string) => {
    const map: Record<string, string> = {
        running: 'Em execução', stopped: 'Parado', paused: 'Pausado',
        start_pending: 'Iniciando', stop_pending: 'Parando',
        continue_pending: 'Continuando', pause_pending: 'Pausando',
    };
    return map[s] ?? s;
};

export function RemoteServices({ natsSubject, natsUrl, jwt }: RemoteServicesProps) {
    const [services, setServices] = useState<ServiceInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState<ServiceSortKey>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [menu, setMenu] = useState<{ x: number; y: number; service?: ServiceInfo } | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const stream = useProcessesStream({
        natsSubject: natsSubject ?? '',
        natsUrl: natsUrl ?? '',
        jwt: jwt ?? '',
    });

    const connected = stream.isConnected;

    const notify = useCallback((msg: string) => {
        setToast(msg);
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
        errorTimerRef.current = setTimeout(() => setToast(null), 4000);
    }, []);

    // `silent=true` é usado no auto-refresh: não toca em `loading` para
    // evitar a barra "Carregando..." (que desloca o cabeçalho) a cada ciclo.
    const loadServices = useCallback(async (silent = false) => {
        if (!stream.send) return;
        if (!silent) setLoading(true);
        try {
            const res = await stream.send('listServices');
            if (res.success) setServices(res.services ?? []);
            else notify(`Erro ao listar serviços: ${res.error ?? 'desconhecido'}`);
        } catch (e) {
            notify(`Falha ao listar serviços: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [stream.send, notify]);

    // Carrega a lista ao conectar (aguarda proc.ready para evitar race)
    useEffect(() => {
        if (!connected) return;
        let fired = false;
        const load = () => {
            if (fired) return;
            fired = true;
            loadServices();
        };
        const off = stream.onReady(() => load());
        // Fallback: se proc.ready não chegar, tenta mesmo assim (retry único).
        const fallback = setTimeout(load, 1200);
        return () => { off(); clearTimeout(fallback); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connected]);

    // Auto-refresh: mantém CPU/RAM dos serviços em execução atualizados.
    useEffect(() => {
        if (!connected) return;
        const timer = setTimeout(() => loadServices(true), 1500);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connected, services]);

    const runAction = useCallback(async (action: string, body: Record<string, unknown>, successMsg: string) => {
        if (!stream.send) return;
        setBusy(true);
        try {
            const res = await stream.send(action, body);
            if (res.success) {
                notify(successMsg);
                await loadServices(true);
            } else {
                notify(`Erro: ${res.error ?? 'desconhecido'}`);
            }
        } catch (e) {
            notify(`Falha na operação: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setBusy(false);
            setMenu(null);
        }
    }, [stream.send, notify, loadServices]);

    useEffect(() => {
        if (!menu) return;
        const onDocClick = () => setMenu(null);
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
        document.addEventListener('click', onDocClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('click', onDocClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [menu]);

    const openServiceMenu = useCallback((e: React.MouseEvent, s: ServiceInfo) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, service: s });
    }, []);

    const filteredServices = useMemo(() => {
        const q = search.toLowerCase();
        const base = q
            ? services.filter(s => s.name.toLowerCase().includes(q) || s.displayName.toLowerCase().includes(q))
            : services;
        const sorted = [...base].sort((a, b) => {
            let cmp = 0;
            if (sortKey === 'name') {
                // Ordena pelo que é exibido na coluna (displayName).
                cmp = (a.displayName || a.name).localeCompare(b.displayName || b.name, 'pt-BR', { sensitivity: 'base' });
            } else if (sortKey === 'state') {
                const ao = stateOrder[a.state] ?? 99;
                const bo = stateOrder[b.state] ?? 99;
                if (ao !== bo) {
                    cmp = ao - bo;
                } else {
                    // Dentro do mesmo grupo semântico, ordena por rótulo (lexical estável).
                    cmp = a.state.localeCompare(b.state);
                }
            } else if (sortKey === 'startType') {
                const ao = startTypeOrder[(a.startType ?? '').toLowerCase()] ?? 99;
                const bo = startTypeOrder[(b.startType ?? '').toLowerCase()] ?? 99;
                if (ao !== bo) {
                    cmp = ao - bo;
                } else {
                    cmp = (a.startType ?? '').localeCompare(b.startType ?? '');
                }
            } else {
                // Campos numéricos: name/state/startType já tratados acima.
                const an = Number(a[sortKey]) || 0;
                const bn = Number(b[sortKey]) || 0;
                cmp = an - bn;
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });
        return sorted;
    }, [services, search, sortKey, sortDir]);

    const toggleSort = useCallback((key: ServiceSortKey) => {
        if (key === sortKey) {
            setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    }, [sortKey]);

    // `widthClass` fixa a coluna (table-fixed); `tabular` evita micro-oscilação dos dígitos.
    const sortHeader = (key: ServiceSortKey, label: string, align: 'left' | 'right' = 'right', widthClass = '', tabular = false) => (
        <th className={`px-3 py-1.5 ${align === 'right' ? 'text-right' : 'text-left'} cursor-pointer select-none hover:text-foreground whitespace-nowrap ${widthClass} ${tabular ? 'tabular-nums' : ''}`} onClick={() => toggleSort(key)}>
            <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
                {label}
                {sortKey === key && <span>{sortDir === 'asc' ? '▲' : '▼'}</span>}
            </span>
        </th>
    );

    return (
        <div className="h-full flex flex-col min-h-0 bg-background" onContextMenu={(e) => e.preventDefault()}>
            {/* Barra de ações: busca + atualizar */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">⚙ Serviços ({services.length})</span>
                <div className="flex-1" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filtrar..."
                    className="bg-surface border border-border rounded px-2 py-1 text-xs text-foreground placeholder-muted w-56"
                />
                <button
                    onClick={() => loadServices()}
                    disabled={!connected || loading}
                    className="px-2 py-1 bg-surface-hover hover:bg-border text-foreground rounded text-xs disabled:opacity-50"
                >
                    ⟳ Atualizar
                </button>
            </div>

            {/* Corpo */}
            <div className="flex-1 overflow-auto min-h-0 relative">
                {!connected && (
                    <div className="p-6 text-center text-muted text-sm">
                        Aguardando conexão com o agente...
                    </div>
                )}
                {connected && loading && (
                    <div className="absolute top-0 left-0 right-0 z-10 px-3 py-1 text-xs text-muted-foreground bg-surface/90 border-b border-border pointer-events-none">
                        Carregando...
                    </div>
                )}
                {connected && (
                    <table className="w-full text-left text-xs table-fixed">
                        <thead className="sticky top-0 bg-surface text-muted-foreground">
                            <tr>
                                {sortHeader('name', 'Nome', 'left')}
                                {sortHeader('state', 'Estado', 'left', 'w-32')}
                                {sortHeader('startType', 'Inicialização', 'left', 'w-32')}
                                {sortHeader('pid', 'PID', 'left', 'w-16', true)}
                                {sortHeader('cpuPercent', 'CPU', 'right', 'w-16', true)}
                                {sortHeader('memoryBytes', 'RAM', 'right', 'w-24', true)}
                                {sortHeader('connections', 'Rede', 'right', 'w-20', true)}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredServices.map((s) => (
                                <tr
                                    key={s.name}
                                    className="border-t border-border hover:bg-surface-hover cursor-context-menu"
                                    onContextMenu={(e) => openServiceMenu(e, s)}
                                >
                                    <td className="px-3 py-1 text-foreground font-mono min-w-0 truncate" title={s.displayName}>{s.displayName}</td>
                                    <td className="px-3 py-1">
                                        <span className={`inline-flex items-center gap-1 ${serviceStateColor(s.state)}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${s.state === 'running' ? 'bg-success' : s.state === 'stopped' ? 'bg-muted' : 'bg-warning'}`} />
                                            {stateLabel(s.state)}
                                        </span>
                                    </td>
                                    <td className="px-3 py-1 text-muted-foreground">{startTypeLabel(s.startType)}</td>
                                    <td className="px-3 py-1 text-muted-foreground tabular-nums">{s.pid ?? '—'}</td>
                                    <td className="px-3 py-1 text-right text-warning tabular-nums">{formatCpuPercent(s.cpuPercent)}</td>
                                    <td className="px-3 py-1 text-right text-accent tabular-nums">{formatBytes(s.memoryBytes)}</td>
                                    <td className="px-3 py-1 text-right text-muted-foreground tabular-nums">{formatConnections(s.connections)}</td>
                                </tr>
                            ))}
                            {filteredServices.length === 0 && !loading && (
                                <tr><td colSpan={7} className="px-3 py-6 text-center text-muted">Nenhum serviço encontrado</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Menu de contexto */}
            {menu?.service && (
                <div
                    className="fixed z-50 bg-surface border border-border-strong rounded shadow-lg py-1 text-xs"
                    style={{ left: menu.x, top: menu.y, minWidth: 180 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-3 py-1 text-muted-foreground border-b border-border truncate max-w-[16rem]" title={menu.service.name}>
                        {menu.service.displayName}
                    </div>
                    <button
                        className="w-full text-left px-3 py-1.5 text-success hover:bg-surface-hover disabled:opacity-50"
                        disabled={busy || menu.service.state === 'running' || menu.service.state === 'start_pending'}
                        onClick={() => runAction('startService', { name: menu.service!.name }, 'Serviço iniciado')}
                    >
                        ▶ Iniciar
                    </button>
                    <button
                        className="w-full text-left px-3 py-1.5 text-warning hover:bg-surface-hover disabled:opacity-50"
                        disabled={busy || menu.service.state !== 'running'}
                        onClick={() => runAction('stopService', { name: menu.service!.name }, 'Serviço parado')}
                    >
                        ⏸ Parar
                    </button>
                    <button
                        className="w-full text-left px-3 py-1.5 text-accent hover:bg-surface-hover disabled:opacity-50"
                        disabled={busy || menu.service.state !== 'running'}
                        onClick={() => runAction('restartService', { name: menu.service!.name }, 'Serviço reiniciado')}
                    >
                        ⟳ Reiniciar
                    </button>
                </div>
            )}

            {/* Toast de feedback */}
            {toast && (
                <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 bg-surface border border-border-strong rounded px-4 py-2 text-xs text-foreground shadow-lg">
                    {toast}
                </div>
            )}
        </div>
    );
}