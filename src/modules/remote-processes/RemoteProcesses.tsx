import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProcessesStream, type ProcessInfo, type SystemInfo } from './useProcessStream';
import { formatBytes, formatBytesPerSec, formatConnections, formatCpuPercent } from './format';

interface RemoteProcessesProps {
    sessionId: string;
    agentId: string;
    natsSubject?: string;
    natsUrl?: string;
    jwt?: string;
    nkeySeed?: string;
}

type SortKey = 'pid' | 'name' | 'threads' | 'priorityBase' | 'cpuPercent' | 'memoryBytes' | 'ioReadBps' | 'ioWriteBps' | 'connections';

export function RemoteProcesses({ natsSubject, natsUrl, jwt }: RemoteProcessesProps) {
    const [processes, setProcesses] = useState<ProcessInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [search, setSearch] = useState('');
    const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
    const [sortKey, setSortKey] = useState<SortKey>('cpuPercent');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [menu, setMenu] = useState<{ x: number; y: number; process?: ProcessInfo } | null>(null);
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

    const loadProcesses = useCallback(async () => {
        if (!stream.send) return;
        setLoading(true);
        try {
            const res = await stream.send('listProcesses');
            if (res.success) setProcesses(res.processes ?? []);
            else notify(`Erro ao listar processos: ${res.error ?? 'desconhecido'}`);
        } catch (e) {
            notify(`Falha ao listar processos: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setLoading(false);
        }
    }, [stream.send, notify]);

    const loadSystemInfo = useCallback(async () => {
        if (!stream.send) return;
        try {
            const res = await stream.send('getSystemInfo');
            if (res.success && res.system) setSysInfo(res.system);
            // Falha silenciosa: o resumo é informativo, não bloqueia a listagem.
        } catch {
            /* informativo */
        }
    }, [stream.send]);

    // Carrega a lista ao conectar (aguarda proc.ready para evitar race)
    useEffect(() => {
        if (!connected) return;
        let fired = false;
        const load = () => {
            if (fired) return;
            fired = true;
            loadProcesses();
            loadSystemInfo();
        };
        const off = stream.onReady(() => load());
        // Fallback: se proc.ready não chegar, tenta mesmo assim (retry único).
        // O guard `fired` evita duplo fetch quando proc.ready chega antes do timeout.
        const fallback = setTimeout(load, 1200);
        return () => { off(); clearTimeout(fallback); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connected]);

    // Auto-refresh: atualiza métricas (a CPU% usa janela deslizante no agente;
    // o refresh regular é necessário para popular valores reais e acompanhar).
    useEffect(() => {
        if (!connected) return;
        const timer = setTimeout(() => {
            loadProcesses();
            loadSystemInfo();
        }, 1500);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connected, processes]);

    const runAction = useCallback(async (action: string, body: Record<string, unknown>, successMsg: string) => {
        if (!stream.send) return;
        setBusy(true);
        try {
            const res = await stream.send(action, body);
            if (res.success) {
                notify(successMsg);
                await loadProcesses();
            } else {
                notify(`Erro: ${res.error ?? 'desconhecido'}`);
            }
        } catch (e) {
            notify(`Falha na operação: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setBusy(false);
            setMenu(null);
        }
    }, [stream.send, notify, loadProcesses]);

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

    const openProcessMenu = useCallback((e: React.MouseEvent, p: ProcessInfo) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, process: p });
    }, []);

    const filteredProcesses = useMemo(() => {
        const q = search.toLowerCase();
        const base = q ? processes.filter(p => p.name.toLowerCase().includes(q)) : processes;
        const sorted = [...base].sort((a, b) => {
            const av = a[sortKey];
            const bv = b[sortKey];
            if (typeof av === 'string' && typeof bv === 'string') {
                return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
            }
            const an = Number(av) || 0;
            const bn = Number(bv) || 0;
            return sortDir === 'asc' ? an - bn : bn - an;
        });
        return sorted;
    }, [processes, search, sortKey, sortDir]);

    const toggleSort = useCallback((key: SortKey) => {
        if (key === sortKey) {
            setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    }, [sortKey]);

    const sortHeader = (key: SortKey, label: string, align: 'left' | 'right' = 'right') => (
        <th className={`px-3 py-1.5 ${align === 'right' ? 'text-right' : 'text-left'} cursor-pointer select-none hover:text-foreground`} onClick={() => toggleSort(key)}>
            <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
                {label}
                {sortKey === key && <span>{sortDir === 'asc' ? '▲' : '▼'}</span>}
            </span>
        </th>
    );

    return (
        <div className="h-full flex flex-col min-h-0 bg-background" onContextMenu={(e) => e.preventDefault()}>
            {/* Barra de ações */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">🗔 Processos ({processes.length})</span>
                <div className="flex-1" />
                {sysInfo && (
                    <span className="hidden md:inline-flex items-center gap-3 text-[11px] text-muted">
                        <span>CPU {formatCpuPercent(sysInfo.cpuPercent)}</span>
                        <span>RAM {formatBytes(sysInfo.usedMemoryBytes)} / {formatBytes(sysInfo.totalMemoryBytes)}</span>
                    </span>
                )}
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filtrar..."
                    className="bg-surface border border-border rounded px-2 py-1 text-xs text-foreground placeholder-muted w-56"
                />
                <button
                    onClick={() => { loadProcesses(); loadSystemInfo(); }}
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
                    <div className="sticky top-0 z-10 px-3 py-1 text-xs text-muted-foreground bg-surface/90 border-b border-border">
                        Carregando...
                    </div>
                )}
                {connected && (
                    <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-surface text-muted-foreground">
                            <tr>
                                {sortHeader('pid', 'PID', 'left')}
                                {sortHeader('name', 'Nome', 'left')}
                                {sortHeader('cpuPercent', 'CPU')}
                                {sortHeader('memoryBytes', 'RAM')}
                                {sortHeader('ioReadBps', 'Leitura/s')}
                                {sortHeader('ioWriteBps', 'Escrita/s')}
                                {sortHeader('connections', 'Rede')}
                                {sortHeader('threads', 'Threads')}
                                {sortHeader('priorityBase', 'Prio')}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredProcesses.map((p) => (
                                <tr
                                    key={p.pid}
                                    className="border-t border-border hover:bg-surface-hover cursor-context-menu"
                                    onContextMenu={(e) => openProcessMenu(e, p)}
                                >
                                    <td className="px-3 py-1 text-muted-foreground">{p.pid}</td>
                                    <td className="px-3 py-1 text-foreground font-mono max-w-[16rem] truncate" title={p.name}>{p.name}</td>
                                    <td className="px-3 py-1 text-right text-warning">{formatCpuPercent(p.cpuPercent)}</td>
                                    <td className="px-3 py-1 text-right text-accent">{formatBytes(p.memoryBytes)}</td>
                                    <td className="px-3 py-1 text-right text-muted-foreground">{formatBytesPerSec(p.ioReadBps)}</td>
                                    <td className="px-3 py-1 text-right text-muted-foreground">{formatBytesPerSec(p.ioWriteBps)}</td>
                                    <td className="px-3 py-1 text-right text-muted-foreground">{formatConnections(p.connections)}</td>
                                    <td className="px-3 py-1 text-right text-muted-foreground">{p.threads}</td>
                                    <td className="px-3 py-1 text-right text-muted-foreground">{p.priorityBase}</td>
                                </tr>
                            ))}
                            {filteredProcesses.length === 0 && !loading && (
                                <tr><td colSpan={9} className="px-3 py-6 text-center text-muted">Nenhum processo encontrado</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Menu de contexto */}
            {menu && (
                <div
                    className="fixed z-50 bg-surface border border-border-strong rounded shadow-lg py-1 text-xs"
                    style={{ left: menu.x, top: menu.y, minWidth: 180 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {menu.process && (
                        <>
                            <div className="px-3 py-1 text-muted-foreground border-b border-border truncate max-w-[16rem]" title={menu.process.name}>
                                {menu.process.name} ({menu.process.pid})
                            </div>
                            <button
                                className="w-full text-left px-3 py-1.5 text-danger hover:bg-surface-hover disabled:opacity-50"
                                disabled={busy}
                                onClick={() => runAction('killProcess', { pid: menu.process!.pid }, `Processo ${menu.process!.pid} encerrado`)}
                            >
                                ⏹ Encerrar processo
                            </button>
                        </>
                    )}
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