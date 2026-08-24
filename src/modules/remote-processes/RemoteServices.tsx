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

const serviceStateColor = (state: string) => {
    switch (state) {
        case 'running': return 'text-emerald-400';
        case 'start_pending':
        case 'stop_pending':
        case 'continue_pending':
        case 'pause_pending': return 'text-amber-400';
        case 'paused': return 'text-sky-400';
        default: return 'text-slate-400';
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

    const loadServices = useCallback(async () => {
        if (!stream.send) return;
        setLoading(true);
        try {
            const res = await stream.send('listServices');
            if (res.success) setServices(res.services ?? []);
            else notify(`Erro ao listar serviços: ${res.error ?? 'desconhecido'}`);
        } catch (e) {
            notify(`Falha ao listar serviços: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setLoading(false);
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
        const timer = setTimeout(loadServices, 1500);
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
                await loadServices();
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
        if (!q) return services;
        return services.filter(s => s.name.toLowerCase().includes(q) || s.displayName.toLowerCase().includes(q));
    }, [services, search]);

    return (
        <div className="h-full flex flex-col min-h-0 bg-slate-950" onContextMenu={(e) => e.preventDefault()}>
            {/* Barra de ações: busca + atualizar */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-800">
                <span className="text-sm text-slate-400">⚙ Serviços ({services.length})</span>
                <div className="flex-1" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filtrar..."
                    className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 placeholder-slate-500 w-56"
                />
                <button
                    onClick={loadServices}
                    disabled={!connected || loading}
                    className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-xs disabled:opacity-50"
                >
                    ⟳ Atualizar
                </button>
            </div>

            {/* Corpo */}
            <div className="flex-1 overflow-auto min-h-0 relative">
                {!connected && (
                    <div className="p-6 text-center text-slate-500 text-sm">
                        Aguardando conexão com o agente...
                    </div>
                )}
                {connected && loading && (
                    <div className="sticky top-0 z-10 px-3 py-1 text-xs text-slate-400 bg-slate-900/90 border-b border-slate-800">
                        Carregando...
                    </div>
                )}
                {connected && (
                    <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-slate-900 text-slate-400">
                            <tr>
                                <th className="px-3 py-1.5">Nome</th>
                                <th className="px-3 py-1.5">Estado</th>
                                <th className="px-3 py-1.5">Inicialização</th>
                                <th className="px-3 py-1.5">PID</th>
                                <th className="px-3 py-1.5 text-right">CPU</th>
                                <th className="px-3 py-1.5 text-right">RAM</th>
                                <th className="px-3 py-1.5 text-right">Rede</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredServices.map((s) => (
                                <tr
                                    key={s.name}
                                    className="border-t border-slate-800/50 hover:bg-slate-800/50 cursor-context-menu"
                                    onContextMenu={(e) => openServiceMenu(e, s)}
                                >
                                    <td className="px-3 py-1 text-slate-200 font-mono max-w-[24rem] truncate" title={s.displayName}>{s.displayName}</td>
                                    <td className="px-3 py-1">
                                        <span className={`inline-flex items-center gap-1 ${serviceStateColor(s.state)}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${s.state === 'running' ? 'bg-emerald-400' : s.state === 'stopped' ? 'bg-slate-500' : 'bg-amber-400'}`} />
                                            {stateLabel(s.state)}
                                        </span>
                                    </td>
                                    <td className="px-3 py-1 text-slate-400">{startTypeLabel(s.startType)}</td>
                                    <td className="px-3 py-1 text-slate-400">{s.pid ?? '—'}</td>
                                    <td className="px-3 py-1 text-right text-amber-300">{formatCpuPercent(s.cpuPercent)}</td>
                                    <td className="px-3 py-1 text-right text-sky-300">{formatBytes(s.memoryBytes)}</td>
                                    <td className="px-3 py-1 text-right text-slate-400">{formatConnections(s.connections)}</td>
                                </tr>
                            ))}
                            {filteredServices.length === 0 && !loading && (
                                <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Nenhum serviço encontrado</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Menu de contexto */}
            {menu?.service && (
                <div
                    className="fixed z-50 bg-slate-800 border border-slate-600 rounded shadow-lg py-1 text-xs"
                    style={{ left: menu.x, top: menu.y, minWidth: 180 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-3 py-1 text-slate-400 border-b border-slate-700 truncate max-w-[16rem]" title={menu.service.name}>
                        {menu.service.displayName}
                    </div>
                    <button
                        className="w-full text-left px-3 py-1.5 text-emerald-300 hover:bg-slate-700 disabled:opacity-50"
                        disabled={busy || menu.service.state === 'running' || menu.service.state === 'start_pending'}
                        onClick={() => runAction('startService', { name: menu.service!.name }, 'Serviço iniciado')}
                    >
                        ▶ Iniciar
                    </button>
                    <button
                        className="w-full text-left px-3 py-1.5 text-amber-300 hover:bg-slate-700 disabled:opacity-50"
                        disabled={busy || menu.service.state !== 'running'}
                        onClick={() => runAction('stopService', { name: menu.service!.name }, 'Serviço parado')}
                    >
                        ⏸ Parar
                    </button>
                    <button
                        className="w-full text-left px-3 py-1.5 text-sky-300 hover:bg-slate-700 disabled:opacity-50"
                        disabled={busy || menu.service.state !== 'running'}
                        onClick={() => runAction('restartService', { name: menu.service!.name }, 'Serviço reiniciado')}
                    >
                        ⟳ Reiniciar
                    </button>
                </div>
            )}

            {/* Toast de feedback */}
            {toast && (
                <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-slate-600 rounded px-4 py-2 text-xs text-slate-100 shadow-lg">
                    {toast}
                </div>
            )}
        </div>
    );
}