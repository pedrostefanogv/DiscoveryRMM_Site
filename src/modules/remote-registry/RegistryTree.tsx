import { useCallback, useEffect, useRef, useState } from 'react';
import {
    REGISTRY_HIVES,
    joinPath,
    type RegistryHive,
    type RegistrySubkeyPageResult,
} from './registryTypes';

// ─────────────────────────────────────────────────────────────────────────────
// ÁRVORE DO REGISTRO — recursiva, paginada e lazy, como o regedit.
//
// Carregamento lazy por nó: HKCR tem milhares de subchaves na raiz e
// HKLM\SOFTWARE\Classes tem dezenas de milhares. Cada nó busca filhos sob
// demanda (500 por página) e suporta "Carregar mais" incremental.
// ─────────────────────────────────────────────────────────────────────────────

export interface RegistryTreeProps {
    /** Hive selecionado no momento. */
    activeHive: RegistryHive;
    /** Caminho selecionado dentro do hive (sem o hive). */
    activePath: string;
    /** Seleciona um nó (abre no painel da direita). */
    onSelect: (hive: RegistryHive, path: string) => void;
    /** Busca as subchaves de um nó (aceita lista simples ou página). */
    loadSubkeys: (
        hive: RegistryHive,
        path: string,
        token?: string,
    ) => Promise<string[] | RegistrySubkeyPageResult>;
    disabled?: boolean;
    /** Sinaliza invalidação de cache na árvore após mutações ou refresh. */
    nodeRefreshSignal?: { version: number; keys?: string[] };
    /** Sincroniza subchaves já obtidas pelo openPath do painel sem nova requisição. */
    knownSubkeys?: { key: string; page: RegistrySubkeyPageResult; seq: number } | null;
    /** Rótulo do usuário conectado exibido ao lado de HKEY_CURRENT_USER. */
    hkcuUserLabel?: string;
    /** Callback opcional para recarregar um nó específico. */
    onRefreshNode?: (hive: RegistryHive, path: string) => void;
}

/** Estado de cada nó da árvore. */
interface NodeState {
    children: string[] | null;
    hasMore: boolean;
    nextToken?: string;
    totalCount?: number;
    loading: boolean;
    loadingMore: boolean;
    error: string | null;
    expanded: boolean;
}

const EMPTY: NodeState = {
    children: null,
    hasMore: false,
    nextToken: undefined,
    totalCount: undefined,
    loading: false,
    loadingMore: false,
    error: null,
    expanded: false,
};

/** Chave única de um nó (hive + caminho). */
export function registryNodeKey(hive: string, path: string): string {
    return `${hive}|\u0000|${path}`;
}

function normalizePageResult(raw: string[] | RegistrySubkeyPageResult): RegistrySubkeyPageResult {
    if (Array.isArray(raw)) {
        return {
            subkeys: raw,
            hasMore: false,
            subkeyCount: raw.length,
        };
    }
    return raw;
}

function mergeUnique(existing: string[], incoming: string[]): string[] {
    if (existing.length === 0) return incoming;
    const seen = new Set(existing);
    const next = [...existing];
    for (const item of incoming) {
        if (!seen.has(item)) {
            seen.add(item);
            next.push(item);
        }
    }
    return next;
}

export function RegistryTree({
    activeHive,
    activePath,
    onSelect,
    loadSubkeys,
    disabled = false,
    nodeRefreshSignal,
    knownSubkeys,
    hkcuUserLabel,
}: RegistryTreeProps) {
    const [nodes, setNodes] = useState<Record<string, NodeState>>({});
    const nodesRef = useRef<Record<string, NodeState>>(nodes);
    nodesRef.current = nodes;

    const inFlightRef = useRef<Set<string>>(new Set());
    const mountedRef = useRef(true);
    const activeRef = useRef<HTMLButtonElement | null>(null);
    const lastRefreshVersionRef = useRef<number>(nodeRefreshSignal?.version ?? 0);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const updateNode = useCallback((key: string, updater: (prev: NodeState) => NodeState) => {
        setNodes((prev) => {
            const current = prev[key] ?? EMPTY;
            const nextState = updater(current);
            const nextMap = { ...prev, [key]: nextState };
            nodesRef.current = nextMap;
            return nextMap;
        });
    }, []);

    const fetchNode = useCallback(async (
        hive: RegistryHive,
        path: string,
        expandMode: 'immediate' | 'onComplete' = 'immediate',
    ) => {
        const key = registryNodeKey(hive, path);
        if (inFlightRef.current.has(key)) return;
        inFlightRef.current.add(key);

        updateNode(key, (prev) => ({
            ...prev,
            expanded: expandMode === 'immediate' ? true : prev.expanded,
            loading: true,
            error: null,
        }));

        try {
            const result = normalizePageResult(await loadSubkeys(hive, path));
            if (!mountedRef.current) return;
            updateNode(key, (prev) => ({
                ...prev,
                children: result.subkeys,
                hasMore: result.hasMore,
                nextToken: result.nextToken,
                totalCount: result.subkeyCount ?? result.subkeys.length,
                loading: false,
                loadingMore: false,
                error: null,
                expanded: true,
            }));
        } catch (e) {
            if (!mountedRef.current) return;
            updateNode(key, (prev) => ({
                ...prev,
                children: prev.children ?? null,
                loading: false,
                loadingMore: false,
                error: (e as Error).message || 'Falha ao carregar subchaves',
                expanded: expandMode === 'immediate' ? true : prev.expanded,
            }));
        } finally {
            inFlightRef.current.delete(key);
        }
    }, [loadSubkeys, updateNode]);

    const toggle = useCallback(async (hive: RegistryHive, path: string) => {
        if (disabled) return;
        const key = registryNodeKey(hive, path);
        const current = nodesRef.current[key] ?? EMPTY;

        if (current.loading) return;

        // Já carregado sem erro: alterna visibilidade.
        if (current.children !== null && !current.error) {
            updateNode(key, (prev) => ({ ...prev, expanded: !prev.expanded }));
            return;
        }

        await fetchNode(hive, path, 'immediate');
    }, [disabled, fetchNode, updateNode]);

    const retryNode = useCallback(async (hive: RegistryHive, path: string) => {
        if (disabled) return;
        await fetchNode(hive, path, 'immediate');
    }, [disabled, fetchNode]);

    const loadMore = useCallback(async (hive: RegistryHive, path: string) => {
        if (disabled) return;
        const key = registryNodeKey(hive, path);
        const current = nodesRef.current[key];
        if (!current || !current.hasMore || !current.nextToken || current.loadingMore) return;

        const flightKey = `${key}:more:${current.nextToken}`;
        if (inFlightRef.current.has(flightKey)) return;
        inFlightRef.current.add(flightKey);

        updateNode(key, (prev) => ({ ...prev, loadingMore: true, error: null }));
        try {
            const result = normalizePageResult(await loadSubkeys(hive, path, current.nextToken));
            if (!mountedRef.current) return;
            updateNode(key, (prev) => ({
                ...prev,
                children: mergeUnique(prev.children ?? [], result.subkeys),
                hasMore: result.hasMore,
                nextToken: result.nextToken,
                totalCount: result.subkeyCount ?? prev.totalCount,
                loadingMore: false,
            }));
        } catch (e) {
            if (!mountedRef.current) return;
            updateNode(key, (prev) => ({
                ...prev,
                loadingMore: false,
                error: (e as Error).message || 'Falha ao carregar mais subchaves',
            }));
        } finally {
            inFlightRef.current.delete(flightKey);
        }
    }, [disabled, loadSubkeys, updateNode]);

    // Sincroniza dados recém-carregados pelo openPath do painel sem refazer chamada.
    useEffect(() => {
        if (!knownSubkeys) return;
        const { key, page } = knownSubkeys;
        updateNode(key, (prev) => ({
            ...prev,
            children: page.subkeys,
            hasMore: page.hasMore,
            nextToken: page.nextToken,
            totalCount: page.subkeyCount ?? page.subkeys.length,
            loading: false,
            loadingMore: false,
            error: null,
        }));
    }, [knownSubkeys, updateNode]);

    // Invalida e recarrega nós expandidos quando o painel sinaliza mutação/refresh.
    useEffect(() => {
        if (!nodeRefreshSignal || nodeRefreshSignal.version === lastRefreshVersionRef.current) return;
        lastRefreshVersionRef.current = nodeRefreshSignal.version;

        const targetKeys = nodeRefreshSignal.keys;
        const snapshot = nodesRef.current;
        const keysToReset = targetKeys && targetKeys.length > 0
            ? targetKeys.filter((k) => Boolean(snapshot[k]))
            : Object.keys(snapshot);

        if (keysToReset.length === 0) return;

        const toReload: Array<{ hive: RegistryHive; path: string }> = [];
        setNodes((prev) => {
            const next = { ...prev };
            for (const k of keysToReset) {
                const st = next[k];
                if (!st) continue;
                next[k] = {
                    ...st,
                    children: null,
                    hasMore: false,
                    nextToken: undefined,
                    error: null,
                };
                if (st.expanded) {
                    const sepIdx = k.indexOf('|\u0000|');
                    if (sepIdx > 0) {
                        toReload.push({
                            hive: k.slice(0, sepIdx) as RegistryHive,
                            path: k.slice(sepIdx + 3),
                        });
                    }
                }
            }
            nodesRef.current = next;
            return next;
        });

        if (!disabled) {
            for (const item of toReload) {
                void fetchNode(item.hive, item.path, 'immediate');
            }
        }
    }, [nodeRefreshSignal, disabled, fetchNode]);

    /**
     * Expande automaticamente o caminho ativo (e o hive, mesmo na raiz).
     * Só dispara quando o stream estiver pronto (`!disabled`), evitando falhas
     * silenciosas durante o handshake inicial.
     */
    useEffect(() => {
        if (disabled) return;

        const parts = activePath ? activePath.split('\\') : [];
        const ancestors: string[] = [''];
        for (let i = 0; i < parts.length - 1; i += 1) {
            ancestors.push(parts.slice(0, i + 1).join('\\'));
        }

        let cancelled = false;
        void (async () => {
            for (const ancestor of ancestors) {
                if (cancelled || !mountedRef.current) return;
                const key = registryNodeKey(activeHive, ancestor);
                const state = nodesRef.current[key];

                if (!state || (state.children === null && !state.error)) {
                    await fetchNode(activeHive, ancestor, 'onComplete');
                    // Se falhou ao carregar o ancestral, interrompe a cadeia.
                    if (nodesRef.current[key]?.error) return;
                } else if (!state.expanded) {
                    updateNode(key, (prev) => ({ ...prev, expanded: true }));
                }
            }
        })();

        return () => { cancelled = true; };
    }, [activeHive, activePath, disabled, fetchNode, updateNode]);

    // Rola até o nó ativo quando ele muda.
    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: 'nearest' });
    }, [activeHive, activePath]);

    const renderNode = (hive: RegistryHive, path: string, label: string, depth: number) => {
        const key = registryNodeKey(hive, path);
        const state = nodes[key] ?? EMPTY;
        const isActive = hive === activeHive && path === activePath;
        const hasChildren = state.children === null || state.children.length > 0;
        const isHive = depth === 0;

        return (
            <div key={key}>
                <div
                    className={`group flex items-center gap-1 rounded px-1 py-0.5 transition-colors ${
                        isActive
                            ? 'bg-primary/15 text-primary font-medium'
                            : 'text-foreground hover:bg-surface-hover/60'
                    }`}
                    style={{ marginLeft: `${depth * 12}px` }}
                >
                    <button
                        type="button"
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted hover:text-foreground disabled:opacity-30"
                        onClick={(e) => { e.stopPropagation(); void toggle(hive, path); }}
                        disabled={disabled || (!state.error && state.children !== null && state.children.length === 0)}
                        aria-label={state.expanded ? `Recolher ${label}` : `Expandir ${label}`}
                        aria-expanded={state.expanded}
                    >
                        {state.loading ? (
                            <SpinnerIcon />
                        ) : !hasChildren && !state.error ? null : (
                            <ChevronIcon expanded={state.expanded} />
                        )}
                    </button>

                    <button
                        ref={isActive ? activeRef : undefined}
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-1.5 whitespace-nowrap text-left font-mono text-[11px]"
                        onClick={() => onSelect(hive, path)}
                        onDoubleClick={() => void toggle(hive, path)}
                        title={path ? `${hive}\\${path}` : hive}
                        disabled={disabled}
                    >
                        {isHive ? <HiveIcon active={isActive} /> : <FolderIcon open={state.expanded} active={isActive} />}
                        <span>{label}</span>
                        {isHive && hive === 'HKCU' && hkcuUserLabel && (
                            <span
                                className="ml-1 shrink-0 rounded bg-primary/10 px-1 py-0.5 font-sans text-[9px] font-medium text-primary"
                                title={`Mapeado para o usuário conectado: ${hkcuUserLabel}`}
                                data-testid="registry-tree-hkcu-user"
                            >
                                {hkcuUserLabel}
                            </span>
                        )}
                    </button>
                </div>

                {state.error && (
                    <div
                        className="flex items-center gap-2 py-0.5 pr-2 text-[10px] text-danger"
                        style={{ paddingLeft: `${(depth + 1) * 12 + 22}px` }}
                    >
                        <span className="whitespace-nowrap">{state.error}</span>
                        <button
                            type="button"
                            className="shrink-0 rounded border border-danger/40 px-1.5 py-0.5 text-[10px] hover:bg-danger/10"
                            onClick={() => void retryNode(hive, path)}
                            disabled={disabled}
                        >
                            Tentar novamente
                        </button>
                    </div>
                )}

                {state.expanded && state.children && state.children.length > 0 && (
                    <div
                        className="border-l border-border/50"
                        style={{ marginLeft: `${depth * 12 + 11}px`, paddingLeft: '1px' }}
                    >
                        {state.children.map((child) => {
                            const childPath = path === '' ? child : joinPath(path, child);
                            return renderNode(hive, childPath, child, depth + 1);
                        })}

                        {state.hasMore && (
                            <button
                                type="button"
                                className="my-0.5 ml-5 rounded border border-border/80 bg-background/60 px-2 py-0.5 text-[10px] text-muted hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
                                onClick={() => void loadMore(hive, path)}
                                disabled={disabled || state.loadingMore}
                            >
                                {state.loadingMore
                                    ? 'Carregando mais…'
                                    : `Carregar mais (${state.children.length}${state.totalCount ? ` de ${state.totalCount}` : ''})`}
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="h-full overflow-auto py-1.5" role="tree" aria-label="Árvore do registro">
            <div className="min-w-full w-max px-1">
                {REGISTRY_HIVES.map((h) => renderNode(h.hive, '', h.label, 0))}
            </div>
        </div>
    );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
    return (
        <svg
            className={`h-3 w-3 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
        >
            <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function SpinnerIcon() {
    return (
        <svg
            className="h-3 w-3 animate-spin text-primary"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
        >
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
            <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

function HiveIcon({ active }: { active: boolean }) {
    return (
        <svg
            className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-primary' : 'text-amber-500'}`}
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v2A1.5 1.5 0 0 1 12.5 7h-9A1.5 1.5 0 0 1 2 5.5v-2zm0 6A1.5 1.5 0 0 1 3.5 8h9A1.5 1.5 0 0 1 14 9.5v2a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-2z" />
        </svg>
    );
}

function FolderIcon({ open, active }: { open: boolean; active: boolean }) {
    const color = active ? 'text-primary' : 'text-amber-500/85';
    if (open) {
        return (
            <svg className={`h-3.5 w-3.5 shrink-0 ${color}`} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M1.5 3A1.5 1.5 0 0 1 3 1.5h3.172a1.5 1.5 0 0 1 1.06.44l.83.828A.5.5 0 0 0 8.414 3H13a1.5 1.5 0 0 1 1.5 1.5v1H2.8a1.5 1.5 0 0 0-1.456 1.136L1 8V3zm.302 4.379A1 1 0 0 1 2.773 6.5h11.454a1 1 0 0 1 .97 1.243l-1.1 4.4A1.5 1.5 0 0 1 12.642 13.5H2.5A1.5 1.5 0 0 1 1.045 11.636l.757-4.257z" />
            </svg>
        );
    }
    return (
        <svg className={`h-3.5 w-3.5 shrink-0 ${color}`} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M1.5 3A1.5 1.5 0 0 1 3 1.5h3.172a1.5 1.5 0 0 1 1.06.44l.83.828A.5.5 0 0 0 8.414 3H13a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5V3z" />
        </svg>
    );
}

export default RegistryTree;
