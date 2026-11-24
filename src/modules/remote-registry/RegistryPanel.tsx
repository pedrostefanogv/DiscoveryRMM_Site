import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRegistryStream } from './useRegistryStream';
import { RegistryTree, registryNodeKey } from './RegistryTree';
import { RegistryValueGrid } from './RegistryValueGrid';
import { RegistryValueEditor } from './RegistryValueEditor';
import {
    REGISTRY_HIVES,
    fullRegistryPath,
    joinPath,
    lastPathComponent,
    parentPath,
    parseUserRegistryPath,
    type RegistryHive,
    type RegistryListPage,
    type RegistrySubkeyPageResult,
    type RegistryValueEntry,
} from './registryTypes';
import { describeErrorKind, describeMutation, displayValueName, formatValueForDisplay } from './registryFormat';

// ─────────────────────────────────────────────────────────────────────────────
// PAINEL DO REGISTRO — layout de duas colunas, como o editor do Windows.
// ─────────────────────────────────────────────────────────────────────────────

export interface RegistryPanelProps {
    natsSubject: string;
    natsUrl?: string;
    jwt?: string;
    nkeySeed?: string;
    getFreshCredentials?: () => Promise<string>;
    isVisible?: boolean;
}

const TREE_WIDTH_KEY = 'discovery.registry.treeWidth';
const TREE_MIN = 180;
const TREE_MAX = 640;
const TREE_DEFAULT = 300;
const READY_FALLBACK_MS = 400;

function readStoredTreeWidth(): number {
    try {
        const raw = window.localStorage.getItem(TREE_WIDTH_KEY);
        if (!raw) return TREE_DEFAULT;
        const parsed = Number.parseInt(raw, 10);
        if (Number.isNaN(parsed)) return TREE_DEFAULT;
        return Math.min(TREE_MAX, Math.max(TREE_MIN, parsed));
    } catch {
        return TREE_DEFAULT;
    }
}

function mergeUniqueStrings(existing: string[], incoming: string[]): string[] {
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

function triggerRegDownload(filename: string, content: string): void {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export function RegistryPanel({
    natsSubject,
    natsUrl = '',
    jwt = '',
    nkeySeed = '',
    getFreshCredentials,
    isVisible = true,
}: RegistryPanelProps) {
    const { isConnected, isReady, error: streamError, send } = useRegistryStream({
        natsSubject, natsUrl, jwt, nkeySeed, getFreshCredentials,
    });

    const [fallbackReady, setFallbackReady] = useState(false);
    useEffect(() => {
        if (!isConnected) {
            setFallbackReady(false);
            return;
        }
        if (isReady) {
            setFallbackReady(true);
            return;
        }
        const timer = window.setTimeout(() => {
            setFallbackReady(true);
        }, READY_FALLBACK_MS);
        return () => window.clearTimeout(timer);
    }, [isConnected, isReady]);

    const streamReady = isReady || fallbackReady;

    const [hive, setHive] = useState<RegistryHive>('HKLM');
    const [currentPath, setCurrentPath] = useState('');
    const hiveRef = useRef<RegistryHive>(hive);
    const currentPathRef = useRef<string>(currentPath);
    hiveRef.current = hive;
    currentPathRef.current = currentPath;

    const [page, setPage] = useState<RegistryListPage | null>(null);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingMoreSubkeys, setLoadingMoreSubkeys] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const [writable, setWritable] = useState(false);
    const [denyReason, setDenyReason] = useState('');
    const [history, setHistory] = useState<Array<{ hive: RegistryHive; path: string }>>([]);
    const [forward, setForward] = useState<Array<{ hive: RegistryHive; path: string }>>([]);

    const [editingValue, setEditingValue] = useState<RegistryValueEntry | null>(null);
    const [creatingValue, setCreatingValue] = useState(false);
    const [pendingDeleteValue, setPendingDeleteValue] = useState<string | null>(null);
    const [pendingKey, setPendingKey] = useState<{ path: string; recursive: boolean } | null>(null);
    const [creatingKeyOpen, setCreatingKeyOpen] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [renamingKeyOpen, setRenamingKeyOpen] = useState(false);
    const [renameKeyInput, setRenameKeyInput] = useState('');
    const [exportModalOpen, setExportModalOpen] = useState(false);
    const [exportRecursive, setExportRecursive] = useState(false);

    const [editingAddress, setEditingAddress] = useState(false);
    const [addressInput, setAddressInput] = useState('');
    const [addressError, setAddressError] = useState<string | null>(null);
    const [subkeysExpanded, setSubkeysExpanded] = useState(true);

    const [mutationError, setMutationError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [treeWidth, setTreeWidth] = useState<number>(() => readStoredTreeWidth());
    const [filter, setFilter] = useState('');

    const [nodeRefreshSignal, setNodeRefreshSignal] = useState<{ version: number; keys?: string[] }>({ version: 0 });
    const [knownSubkeys, setKnownSubkeys] = useState<{
        key: string;
        page: RegistrySubkeyPageResult;
        seq: number;
    } | null>(null);

    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const navSeqRef = useRef(0);
    const knownSeqRef = useRef(0);
    const subkeyCacheRef = useRef<Map<string, RegistrySubkeyPageResult>>(new Map());
    const loadedOnceRef = useRef(false);
    const treePaneRef = useRef<HTMLDivElement | null>(null);
    const toastTimerRef = useRef<number | null>(null);

    const showToast = useCallback((message: string) => {
        setToast(message);
        if (toastTimerRef.current !== null) {
            window.clearTimeout(toastTimerRef.current);
        }
        toastTimerRef.current = window.setTimeout(() => {
            if (mountedRef.current) setToast(null);
        }, 3000);
    }, []);

    const signalTreeRefresh = useCallback((keys?: string[]) => {
        setNodeRefreshSignal((prev) => ({ version: prev.version + 1, keys }));
    }, []);

    const syncKnownSubkeys = useCallback((targetHive: RegistryHive, targetPath: string, pageData: RegistrySubkeyPageResult) => {
        const key = registryNodeKey(targetHive, targetPath);
        subkeyCacheRef.current.set(key, pageData);
        knownSeqRef.current += 1;
        setKnownSubkeys({ key, page: pageData, seq: knownSeqRef.current });
    }, []);

    // ── Abrir uma chave ─────────────────────────────────────────────────────
    const openPath = useCallback(async (
        nextHive: RegistryHive,
        nextPath: string,
        record = true,
    ) => {
        const prevHive = hiveRef.current;
        const prevPath = currentPathRef.current;
        const seq = ++navSeqRef.current;
        setLoading(true);
        setLoadError(null);
        setFilter('');
        setAddressError(null);
        try {
            const [listResp, statResp] = await Promise.all([
                send('listKey', { hive: nextHive, path: nextPath }),
                send('statKey', { hive: nextHive, path: nextPath }),
            ]);
            if (!mountedRef.current || seq !== navSeqRef.current) return;

            setHasLoaded(true);

            if (!listResp.success) {
                setLoadError(describeErrorKind(listResp.errorKind, listResp.error));
                setPage(null);
                setWritable(false);
                setDenyReason('A chave não pôde ser carregada.');
                setHive(nextHive);
                setCurrentPath(nextPath);
                return;
            }
            const nextPage = listResp.page ?? null;
            setPage(nextPage);
            setNote(listResp.note ?? null);

            if (nextPage) {
                syncKnownSubkeys(nextHive, nextPath, {
                    subkeys: nextPage.subkeys,
                    hasMore: nextPage.hasMore,
                    nextToken: nextPage.nextToken,
                    subkeyCount: nextPage.subkeyCount,
                });
            }

            if (statResp.success && statResp.key) {
                setWritable(statResp.key.writable);
                setDenyReason(statResp.key.denyReason ?? '');
            } else {
                setWritable(false);
                setDenyReason('Não foi possível verificar a política desta chave.');
            }

            if (record && (prevHive !== nextHive || prevPath !== nextPath)) {
                setHistory((prev) => [...prev, { hive: prevHive, path: prevPath }]);
                setForward([]);
            }
            setHive(nextHive);
            setCurrentPath(nextPath);
        } catch (e) {
            if (mountedRef.current && seq === navSeqRef.current) {
                setHasLoaded(true);
                setLoadError((e as Error).message);
            }
        } finally {
            if (mountedRef.current && seq === navSeqRef.current) setLoading(false);
        }
    }, [send, syncKnownSubkeys]);

    // Carrega a raiz quando o stream estiver pronto (ou após fallback).
    useEffect(() => {
        if (!streamReady || loadedOnceRef.current) return;
        loadedOnceRef.current = true;
        void openPath('HKLM', '', false);
    }, [streamReady, openPath]);

    const refresh = useCallback(async () => {
        const key = registryNodeKey(hive, currentPath);
        subkeyCacheRef.current.delete(key);
        signalTreeRefresh([key]);
        await openPath(hive, currentPath, false);
    }, [openPath, hive, currentPath, signalTreeRefresh]);

    /** Busca de subchaves para a árvore (com cache e paginação). */
    const loadSubkeys = useCallback(async (
        nodeHive: RegistryHive,
        nodePath: string,
        token?: string,
    ): Promise<RegistrySubkeyPageResult> => {
        const key = registryNodeKey(nodeHive, nodePath);
        if (!token) {
            const cached = subkeyCacheRef.current.get(key);
            if (cached) return cached;
        }

        const payload: Record<string, unknown> = { hive: nodeHive, path: nodePath };
        if (token) payload.token = token;

        const resp = await send('listKey', payload);
        if (!resp.success) {
            throw new Error(describeErrorKind(resp.errorKind, resp.error));
        }

        const incoming = resp.page?.subkeys ?? [];
        const hasMore = Boolean(resp.page?.hasMore);
        const nextToken = resp.page?.nextToken;
        const subkeyCount = resp.page?.subkeyCount ?? incoming.length;

        const prevCached = token ? subkeyCacheRef.current.get(key) : undefined;
        const mergedPage: RegistrySubkeyPageResult = {
            subkeys: prevCached ? mergeUniqueStrings(prevCached.subkeys, incoming) : incoming,
            hasMore,
            nextToken,
            subkeyCount,
        };
        subkeyCacheRef.current.set(key, mergedPage);

        return token
            ? { subkeys: incoming, hasMore, nextToken, subkeyCount }
            : mergedPage;
    }, [send]);

    const loadMoreCurrentSubkeys = useCallback(async () => {
        if (!page?.hasMore || !page.nextToken || loadingMoreSubkeys) return;
        setLoadingMoreSubkeys(true);
        try {
            const resp = await send('listKey', {
                hive,
                path: currentPath,
                token: page.nextToken,
            });
            if (!mountedRef.current) return;
            if (!resp.success) {
                showToast(describeErrorKind(resp.errorKind, resp.error));
                return;
            }
            const nextBatch = resp.page?.subkeys ?? [];
            const mergedSubkeys = mergeUniqueStrings(page.subkeys, nextBatch);
            const updatedPage: RegistryListPage = {
                ...page,
                subkeys: mergedSubkeys,
                hasMore: Boolean(resp.page?.hasMore),
                nextToken: resp.page?.nextToken,
                subkeyCount: resp.page?.subkeyCount ?? page.subkeyCount,
            };
            setPage(updatedPage);
            syncKnownSubkeys(hive, currentPath, {
                subkeys: updatedPage.subkeys,
                hasMore: updatedPage.hasMore,
                nextToken: updatedPage.nextToken,
                subkeyCount: updatedPage.subkeyCount,
            });
        } catch (e) {
            if (mountedRef.current) showToast((e as Error).message);
        } finally {
            if (mountedRef.current) setLoadingMoreSubkeys(false);
        }
    }, [page, loadingMoreSubkeys, send, hive, currentPath, showToast, syncKnownSubkeys]);

    // Fecha modais com Escape quando não estiver ocupado.
    useEffect(() => {
        const hasModal = Boolean(
            editingValue || creatingValue || pendingDeleteValue !== null || pendingKey ||
            creatingKeyOpen || renamingKeyOpen || exportModalOpen,
        );
        if (!hasModal) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || busy) return;
            setEditingValue(null);
            setCreatingValue(false);
            setPendingDeleteValue(null);
            setPendingKey(null);
            setCreatingKeyOpen(false);
            setRenamingKeyOpen(false);
            setExportModalOpen(false);
            setMutationError(null);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [editingValue, creatingValue, pendingDeleteValue, pendingKey, creatingKeyOpen, renamingKeyOpen, exportModalOpen, busy]);

    // ── Mutações e Ações ────────────────────────────────────────────────────
    const applyValue = useCallback(async (payload: {
        name: string; type: string; data: string; confirmed: true;
    }) => {
        setBusy(true);
        setMutationError(null);
        try {
            const resp = await send('setValue', {
                hive, path: currentPath, name: payload.name,
                type: payload.type, data: payload.data, confirmed: true,
            });
            if (!resp.success) {
                setMutationError(describeErrorKind(resp.errorKind, resp.error));
                return;
            }
            setEditingValue(null);
            setCreatingValue(false);
            showToast('Valor gravado.');
            await refresh();
        } catch (e) {
            setMutationError((e as Error).message);
        } finally {
            if (mountedRef.current) setBusy(false);
        }
    }, [send, hive, currentPath, refresh, showToast]);

    const confirmDeleteValue = useCallback(async () => {
        if (pendingDeleteValue === null) return;
        setBusy(true);
        setMutationError(null);
        try {
            const resp = await send('deleteValue', {
                hive, path: currentPath, name: pendingDeleteValue, confirmed: true,
            });
            if (!resp.success) {
                setMutationError(describeErrorKind(resp.errorKind, resp.error));
                return;
            }
            setPendingDeleteValue(null);
            showToast('Valor excluído.');
            await refresh();
        } catch (e) {
            setMutationError((e as Error).message);
        } finally {
            if (mountedRef.current) setBusy(false);
        }
    }, [pendingDeleteValue, send, hive, currentPath, refresh, showToast]);

    const confirmCreateKey = useCallback(async () => {
        const trimmed = newKeyName.trim();
        if (!trimmed) {
            setMutationError('Informe o nome da nova subchave.');
            return;
        }
        if (/[\\/]/.test(trimmed)) {
            setMutationError('Use apenas o nome da subchave (sem "\\" ou "/").');
            return;
        }
        const targetPath = joinPath(currentPath, trimmed);
        setBusy(true);
        setMutationError(null);
        try {
            const resp = await send('createKey', {
                hive, path: targetPath, confirmed: true,
            });
            if (!resp.success) {
                setMutationError(describeErrorKind(resp.errorKind, resp.error));
                return;
            }
            setCreatingKeyOpen(false);
            setNewKeyName('');
            showToast('Subchave criada.');
            const currentNode = registryNodeKey(hive, currentPath);
            subkeyCacheRef.current.delete(currentNode);
            signalTreeRefresh([currentNode]);
            await openPath(hive, currentPath, false);
        } catch (e) {
            setMutationError((e as Error).message);
        } finally {
            if (mountedRef.current) setBusy(false);
        }
    }, [newKeyName, currentPath, hive, send, showToast, signalTreeRefresh, openPath]);

    const confirmRenameKey = useCallback(async () => {
        const trimmed = renameKeyInput.trim();
        if (!trimmed) {
            setMutationError('Informe o novo nome da chave.');
            return;
        }
        if (/[\\/]/.test(trimmed)) {
            setMutationError('Use apenas o nome da chave (sem "\\" ou "/").');
            return;
        }
        const parent = parentPath(currentPath);
        const nextPath = joinPath(parent, trimmed);
        setBusy(true);
        setMutationError(null);
        try {
            const resp = await send('renameKey', {
                hive, path: currentPath, newName: trimmed, confirmed: true,
            });
            if (!resp.success) {
                setMutationError(describeErrorKind(resp.errorKind, resp.error));
                return;
            }
            setRenamingKeyOpen(false);
            showToast('Chave renomeada.');
            const oldKey = registryNodeKey(hive, currentPath);
            const parentKey = registryNodeKey(hive, parent);
            subkeyCacheRef.current.delete(oldKey);
            subkeyCacheRef.current.delete(parentKey);
            signalTreeRefresh([oldKey, parentKey]);
            await openPath(hive, nextPath, false);
        } catch (e) {
            setMutationError((e as Error).message);
        } finally {
            if (mountedRef.current) setBusy(false);
        }
    }, [renameKeyInput, currentPath, hive, send, showToast, signalTreeRefresh, openPath]);

    const confirmDeleteKey = useCallback(async () => {
        if (!pendingKey) return;
        setBusy(true);
        setMutationError(null);
        try {
            const resp = await send('deleteKey', {
                hive, path: pendingKey.path, recursive: pendingKey.recursive, confirmed: true,
            });
            if (!resp.success) {
                setMutationError(describeErrorKind(resp.errorKind, resp.error));
                return;
            }
            setPendingKey(null);
            showToast('Chave excluída.');
            const removedKey = registryNodeKey(hive, pendingKey.path);
            const parentKey = registryNodeKey(hive, parentPath(pendingKey.path));
            subkeyCacheRef.current.delete(removedKey);
            subkeyCacheRef.current.delete(parentKey);
            signalTreeRefresh([removedKey, parentKey]);
            if (pendingKey.path === currentPath) {
                await openPath(hive, parentPath(currentPath), false);
            } else {
                await refresh();
            }
        } catch (e) {
            setMutationError((e as Error).message);
        } finally {
            if (mountedRef.current) setBusy(false);
        }
    }, [pendingKey, send, hive, refresh, currentPath, openPath, showToast, signalTreeRefresh]);

    const confirmExportKey = useCallback(async () => {
        setBusy(true);
        setMutationError(null);
        try {
            const resp = await send('export', {
                hive, path: currentPath, recursive: exportRecursive,
            });
            if (!resp.success) {
                setMutationError(describeErrorKind(resp.errorKind, resp.error));
                return;
            }
            const baseName = lastPathComponent(currentPath) || hive;
            const safeName = baseName.replace(/[^a-zA-Z0-9._-]+/g, '_');
            triggerRegDownload(`${safeName}.reg`, resp.export ?? '');
            setExportModalOpen(false);
            showToast('Arquivo .reg exportado.');
        } catch (e) {
            setMutationError((e as Error).message);
        } finally {
            if (mountedRef.current) setBusy(false);
        }
    }, [send, hive, currentPath, exportRecursive, showToast]);

    const copyToClipboard = useCallback(async (text: string, msg: string) => {
        try {
            await navigator.clipboard.writeText(text);
            showToast(msg);
        } catch {
            showToast('Não foi possível copiar para a área de transferência.');
        }
    }, [showToast]);

    // ── Redimensionar a árvore ──────────────────────────────────────────────
    const startResize = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = treeWidth;
        const onMove = (ev: MouseEvent) => {
            const next = Math.min(TREE_MAX, Math.max(TREE_MIN, startWidth + (ev.clientX - startX)));
            setTreeWidth(next);
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            setTreeWidth((w) => {
                try { window.localStorage.setItem(TREE_WIDTH_KEY, String(w)); } catch { /* storage indisponível */ }
                return w;
            });
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [treeWidth]);

    const navigate = useCallback((nextHive: RegistryHive, nextPath: string) => {
        void openPath(nextHive, nextPath, true);
    }, [openPath]);

    const submitAddress = useCallback(() => {
        const parsed = parseUserRegistryPath(addressInput);
        if (!parsed) {
            setAddressError('Caminho inválido. Use um hive válido (ex.: HKLM\\SOFTWARE\\Microsoft).');
            return;
        }
        setAddressError(null);
        setEditingAddress(false);
        navigate(parsed.hive, parsed.path);
    }, [addressInput, navigate]);

    const values = useMemo(() => page?.values ?? [], [page]);
    const subkeys = useMemo(() => page?.subkeys ?? [], [page]);

    const filteredValues = useMemo(() => {
        if (!filter) return values;
        const needle = filter.toLowerCase();
        return values.filter((v) =>
            displayValueName(v.name).toLowerCase().includes(needle) || v.data.toLowerCase().includes(needle));
    }, [values, filter]);

    const filteredSubkeys = useMemo(() => {
        if (!filter) return subkeys;
        const needle = filter.toLowerCase();
        return subkeys.filter((s) => s.toLowerCase().includes(needle));
    }, [subkeys, filter]);

    if (!isConnected && streamError) {
        return (
            <div className="flex h-full items-center justify-center p-4 text-sm text-danger">
                {streamError}
            </div>
        );
    }

    const segments = currentPath ? currentPath.split('\\') : [];
    const currentFull = fullRegistryPath(hive, currentPath);

    return (
        <div className="flex h-full min-h-0 flex-col bg-background text-foreground" data-testid="registry-panel" data-visible={isVisible}>
            {/* ── Barra superior: hive + caminho + ações ── */}
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-2.5 py-1.5 text-xs">
                <select
                    className="rounded border border-border bg-background px-2 py-1 font-mono text-xs focus:border-primary focus:outline-none"
                    value={hive}
                    onChange={(e) => navigate(e.target.value as RegistryHive, '')}
                    aria-label="Hive"
                >
                    {REGISTRY_HIVES.map((h) => (
                        <option key={h.hive} value={h.hive}>{h.label}</option>
                    ))}
                </select>

                {/* Breadcrumb / barra de endereço editável */}
                {editingAddress ? (
                    <form
                        className="flex min-w-0 flex-1 items-center gap-1"
                        onSubmit={(e) => { e.preventDefault(); submitAddress(); }}
                    >
                        <input
                            autoFocus
                            className="min-w-0 flex-1 rounded border border-primary bg-background px-2 py-1 font-mono text-xs focus:outline-none"
                            value={addressInput}
                            onChange={(e) => { setAddressInput(e.target.value); setAddressError(null); }}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                    setEditingAddress(false);
                                    setAddressError(null);
                                }
                            }}
                            aria-label="Endereço do registro"
                            placeholder="Ex.: HKLM\SOFTWARE\Microsoft"
                        />
                        <button
                            type="submit"
                            className="shrink-0 rounded bg-primary px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                        >
                            Ir
                        </button>
                        <button
                            type="button"
                            className="shrink-0 rounded border border-border px-2 py-1 text-xs hover:bg-background"
                            onClick={() => { setEditingAddress(false); setAddressError(null); }}
                        >
                            Cancelar
                        </button>
                    </form>
                ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-1 rounded border border-border/70 bg-background/60 px-1.5 py-0.5">
                        <nav
                            className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto font-mono"
                            aria-label="Caminho"
                            data-testid="registry-current-path"
                            data-path={currentFull}
                        >
                            <button
                                type="button"
                                className="shrink-0 rounded px-1 py-0.5 hover:bg-surface-hover"
                                onClick={() => navigate(hive, '')}
                            >
                                {hive}
                            </button>
                            {segments.map((seg, i) => {
                                const target = segments.slice(0, i + 1).join('\\');
                                return (
                                    <span key={target} className="flex shrink-0 items-center">
                                        <span className="text-muted">\</span>
                                        <button
                                            type="button"
                                            className={`rounded px-1 py-0.5 hover:bg-surface-hover ${i === segments.length - 1 ? 'font-medium text-primary' : ''}`}
                                            onClick={() => navigate(hive, target)}
                                            title={seg}
                                        >
                                            {seg}
                                        </button>
                                    </span>
                                );
                            })}
                        </nav>
                        <button
                            type="button"
                            className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-muted hover:bg-surface-hover hover:text-foreground"
                            onClick={() => {
                                setAddressInput(currentFull);
                                setAddressError(null);
                                setEditingAddress(true);
                            }}
                            title="Editar caminho"
                            aria-label="Editar caminho"
                        >
                            Editar caminho
                        </button>
                        <button
                            type="button"
                            className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-muted hover:bg-surface-hover hover:text-foreground"
                            onClick={() => void copyToClipboard(currentFull, 'Caminho copiado.')}
                            title="Copiar caminho"
                            aria-label="Copiar caminho"
                        >
                            Copiar
                        </button>
                    </div>
                )}

                <div className="flex shrink-0 items-center gap-1">
                    <button
                        type="button"
                        className="rounded border border-border px-2 py-1 hover:bg-background disabled:opacity-40"
                        onClick={() => {
                            const prev = history[history.length - 1];
                            if (!prev) return;
                            setForward((f) => [...f, { hive, path: currentPath }]);
                            setHistory((h) => h.slice(0, -1));
                            void openPath(prev.hive, prev.path, false);
                        }}
                        disabled={history.length === 0 || loading}
                        aria-label="Voltar"
                        title="Voltar"
                    >
                        ←
                    </button>
                    <button
                        type="button"
                        className="rounded border border-border px-2 py-1 hover:bg-background disabled:opacity-40"
                        onClick={() => {
                            const next = forward[forward.length - 1];
                            if (!next) return;
                            setHistory((h) => [...h, { hive, path: currentPath }]);
                            setForward((f) => f.slice(0, -1));
                            void openPath(next.hive, next.path, false);
                        }}
                        disabled={forward.length === 0 || loading}
                        aria-label="Avançar"
                        title="Avançar"
                    >
                        →
                    </button>
                    <button
                        type="button"
                        className="rounded border border-border px-2 py-1 hover:bg-background disabled:opacity-40"
                        onClick={() => navigate(hive, parentPath(currentPath))}
                        disabled={!currentPath || loading}
                        aria-label="Subir um nível"
                        title="Subir um nível"
                    >
                        ↑
                    </button>
                    <button
                        type="button"
                        className="rounded border border-border px-2 py-1 hover:bg-background disabled:opacity-40"
                        onClick={() => void refresh()}
                        disabled={loading}
                        aria-label="Atualizar"
                        title="Atualizar"
                    >
                        ⟳
                    </button>
                </div>
            </div>

            {/* ── Faixas de estado ── */}
            {!streamReady && !streamError && (
                <p className="border-b border-border bg-primary/10 px-3 py-1 text-[11px] text-primary" data-testid="registry-connecting">
                    Conectando à sessão de Registro…
                </p>
            )}
            {addressError && (
                <p className="border-b border-border bg-danger/10 px-3 py-1 text-[11px] text-danger">
                    {addressError}
                </p>
            )}
            {note && (
                <p className="border-b border-border bg-yellow-500/10 px-3 py-1 text-[11px] text-yellow-500" data-testid="registry-note">
                    {note}
                </p>
            )}
            {hasLoaded && !writable && !loadError && (
                <p className="border-b border-border bg-yellow-500/10 px-3 py-1 text-[11px] text-yellow-500" data-testid="registry-readonly">
                    Somente leitura nesta chave. {denyReason}
                </p>
            )}
            {loadError && (
                <p className="border-b border-border bg-danger/10 px-3 py-1 text-[11px] text-danger" data-testid="registry-error">
                    {loadError}
                </p>
            )}

            {/* ── Corpo: árvore + conteúdo ── */}
            <div className="flex min-h-0 flex-1 items-stretch">
                <div
                    ref={treePaneRef}
                    className="shrink-0 overflow-hidden border-r border-border bg-surface"
                    style={{ width: `${treeWidth}px` }}
                >
                    <RegistryTree
                        activeHive={hive}
                        activePath={currentPath}
                        onSelect={(h, p) => navigate(h, p)}
                        loadSubkeys={loadSubkeys}
                        disabled={!streamReady}
                        nodeRefreshSignal={nodeRefreshSignal}
                        knownSubkeys={knownSubkeys}
                    />
                </div>

                {/* Divisória arrastável */}
                <div
                    className="w-1 shrink-0 cursor-col-resize bg-border/40 transition-colors hover:bg-primary/50"
                    onMouseDown={startResize}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Redimensionar árvore"
                />

                <section className="flex min-h-0 min-w-0 flex-1 flex-col">
                    {/* Barra de ferramentas da chave */}
                    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface/50 px-2.5 py-1.5">
                        <span className="text-xs font-medium" data-testid="registry-counts">
                            {page?.valueCount ?? 0} valor(es) · {page?.subkeyCount ?? 0} subchave(s)
                        </span>

                        <div className="relative flex items-center">
                            <input
                                className="w-52 rounded border border-border bg-background px-2 py-1 pr-6 text-xs focus:border-primary focus:outline-none"
                                placeholder="Filtrar valores ou subchaves…"
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                                aria-label="Filtrar"
                            />
                            {filter && (
                                <button
                                    type="button"
                                    className="absolute right-1.5 text-xs text-muted hover:text-foreground"
                                    onClick={() => setFilter('')}
                                    aria-label="Limpar filtro"
                                >
                                    ×
                                </button>
                            )}
                        </div>

                        <div className="ml-auto flex flex-wrap gap-1">
                            <button
                                type="button"
                                className="rounded border border-border px-2 py-1 text-xs hover:bg-background disabled:opacity-40"
                                onClick={() => { setCreatingValue(true); setMutationError(null); }}
                                disabled={!writable || !currentPath || loading}
                                title={!writable ? denyReason : (!currentPath ? 'Abra uma chave para criar um valor.' : undefined)}
                            >
                                Novo valor
                            </button>
                            <button
                                type="button"
                                className="rounded border border-border px-2 py-1 text-xs hover:bg-background disabled:opacity-40"
                                onClick={() => { setNewKeyName(''); setCreatingKeyOpen(true); setMutationError(null); }}
                                disabled={!writable || loading}
                                title={!writable ? denyReason : undefined}
                            >
                                Nova subchave
                            </button>
                            <button
                                type="button"
                                className="rounded border border-border px-2 py-1 text-xs hover:bg-background disabled:opacity-40"
                                onClick={() => {
                                    setRenameKeyInput(lastPathComponent(currentPath));
                                    setRenamingKeyOpen(true);
                                    setMutationError(null);
                                }}
                                disabled={!writable || !currentPath || loading}
                                title={!writable ? denyReason : undefined}
                            >
                                Renomear
                            </button>
                            <button
                                type="button"
                                className="rounded border border-border px-2 py-1 text-xs hover:bg-background disabled:opacity-40"
                                onClick={() => { setExportRecursive(false); setExportModalOpen(true); setMutationError(null); }}
                                disabled={!currentPath || loading}
                                title={!currentPath ? 'Abra uma chave para exportar.' : undefined}
                            >
                                Exportar .reg
                            </button>
                            <button
                                type="button"
                                className="rounded border border-border px-2 py-1 text-xs hover:bg-background disabled:opacity-40"
                                onClick={() => { setPendingKey({ path: currentPath, recursive: false }); setMutationError(null); }}
                                disabled={!writable || !currentPath || loading}
                                title={!writable ? denyReason : undefined}
                            >
                                Excluir chave
                            </button>
                            <button
                                type="button"
                                className="rounded border border-danger/50 px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-40"
                                onClick={() => { setPendingKey({ path: currentPath, recursive: true }); setMutationError(null); }}
                                disabled={!writable || !currentPath || loading}
                                title={!writable ? denyReason : undefined}
                            >
                                Excluir com subchaves
                            </button>
                        </div>
                    </div>

                    {/* Valores */}
                    <RegistryValueGrid
                        values={filteredValues}
                        loading={loading}
                        writable={writable}
                        denyReason={denyReason}
                        onEdit={(v) => { setEditingValue(v); setMutationError(null); }}
                        onDelete={(name) => { setPendingDeleteValue(name); setMutationError(null); }}
                        onCopy={(v) => void copyToClipboard(formatValueForDisplay(v), 'Valor copiado.')}
                        busy={busy}
                    />

                    {/* Subchaves */}
                    {filteredSubkeys.length > 0 && (
                        <div className="shrink-0 border-t border-border bg-surface/60">
                            <div className="flex items-center justify-between px-3 py-1.5">
                                <button
                                    type="button"
                                    className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted hover:text-foreground"
                                    onClick={() => setSubkeysExpanded((v) => !v)}
                                    aria-expanded={subkeysExpanded}
                                >
                                    <span>{subkeysExpanded ? '▾' : '▸'}</span>
                                    <span>
                                        Subchaves ({filteredSubkeys.length}{filter ? ` de ${subkeys.length}` : ''}
                                        {page?.hasMore ? ` · total ${page.subkeyCount}` : ''})
                                    </span>
                                </button>
                                {page?.hasMore && subkeysExpanded && (
                                    <button
                                        type="button"
                                        className="rounded border border-border px-2 py-0.5 text-[11px] hover:bg-background disabled:opacity-50"
                                        onClick={() => void loadMoreCurrentSubkeys()}
                                        disabled={loadingMoreSubkeys}
                                    >
                                        {loadingMoreSubkeys ? 'Carregando…' : 'Carregar mais'}
                                    </button>
                                )}
                            </div>
                            {subkeysExpanded && (
                                <div className="max-h-40 overflow-y-auto px-3 pb-2">
                                    <div className="flex flex-wrap gap-1">
                                        {filteredSubkeys.map((sub) => (
                                            <button
                                                key={sub}
                                                type="button"
                                                data-testid={`registry-subkey-${sub}`}
                                                className="rounded border border-border bg-background/60 px-2 py-0.5 font-mono text-[11px] hover:border-primary/40 hover:bg-surface-hover"
                                                onClick={() => navigate(hive, joinPath(currentPath, sub))}
                                            >
                                                {sub}
                                            </button>
                                        ))}
                                    </div>
                                    {page?.hasMore && (
                                        <p className="mt-1.5 text-[11px] text-muted">
                                            Mostrando {subkeys.length} de {page.subkeyCount} subchaves.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </section>
            </div>

            {/* ── Modais ── */}
            {(editingValue || creatingValue) && (
                <RegistryValueEditor
                    keyPath={currentFull}
                    existing={editingValue}
                    initialName={creatingValue ? '' : undefined}
                    onConfirm={(payload) => void applyValue(payload)}
                    onCancel={() => { setEditingValue(null); setCreatingValue(false); setMutationError(null); }}
                    busy={busy}
                    error={mutationError}
                />
            )}

            {pendingDeleteValue !== null && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-md rounded-lg border border-border bg-surface p-4 shadow-xl">
                        <h3 className="text-sm font-semibold">Excluir valor</h3>
                        <p className="mt-2 break-all font-mono text-xs text-muted">{currentFull}</p>
                        <p className="mt-2 text-xs">
                            {describeMutation('deleteValue', displayValueName(pendingDeleteValue), 'Esta operação não pode ser desfeita.')}
                        </p>
                        {mutationError && (
                            <p className="mt-2 rounded border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-danger">
                                {mutationError}
                            </p>
                        )}
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                type="button"
                                className="rounded border border-border px-3 py-1.5 text-xs hover:bg-background"
                                onClick={() => { setPendingDeleteValue(null); setMutationError(null); }}
                                disabled={busy}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                                onClick={() => void confirmDeleteValue()}
                                disabled={busy}
                            >
                                {busy ? 'Excluindo…' : 'Confirmar exclusão'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {creatingKeyOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-md rounded-lg border border-border bg-surface p-4 shadow-xl">
                        <h3 className="text-sm font-semibold">Nova subchave</h3>
                        <p className="mt-1 break-all font-mono text-xs text-muted">{currentFull}</p>
                        <div className="mt-3">
                            <label className="mb-1 block text-xs font-medium" htmlFor="reg-new-key-name">
                                Nome da subchave
                            </label>
                            <input
                                id="reg-new-key-name"
                                autoFocus
                                className="w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs"
                                value={newKeyName}
                                onChange={(e) => { setNewKeyName(e.target.value); setMutationError(null); }}
                                placeholder="MinhaSubchave"
                                disabled={busy}
                            />
                        </div>
                        {newKeyName.trim() && (
                            <p className="mt-2 break-all font-mono text-[11px] text-muted">
                                Será criada: {fullRegistryPath(hive, joinPath(currentPath, newKeyName.trim()))}
                            </p>
                        )}
                        {mutationError && (
                            <p className="mt-2 rounded border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-danger">
                                {mutationError}
                            </p>
                        )}
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                type="button"
                                className="rounded border border-border px-3 py-1.5 text-xs hover:bg-background"
                                onClick={() => { setCreatingKeyOpen(false); setMutationError(null); }}
                                disabled={busy}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                                onClick={() => void confirmCreateKey()}
                                disabled={busy || !newKeyName.trim()}
                            >
                                {busy ? 'Criando…' : 'Criar subchave'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {renamingKeyOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-md rounded-lg border border-border bg-surface p-4 shadow-xl">
                        <h3 className="text-sm font-semibold">Renomear chave</h3>
                        <p className="mt-1 break-all font-mono text-xs text-muted">{currentFull}</p>
                        <div className="mt-3">
                            <label className="mb-1 block text-xs font-medium" htmlFor="reg-rename-key-name">
                                Novo nome
                            </label>
                            <input
                                id="reg-rename-key-name"
                                autoFocus
                                className="w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs"
                                value={renameKeyInput}
                                onChange={(e) => { setRenameKeyInput(e.target.value); setMutationError(null); }}
                                disabled={busy}
                            />
                        </div>
                        <p className="mt-2 rounded border border-yellow-500/40 bg-yellow-500/10 px-2 py-1.5 text-[11px] text-yellow-500">
                            O Windows não possui renomeação nativa de chave: a subárvore é copiada para o novo nome e a original é removida (ACLs customizadas não são preservadas).
                        </p>
                        {mutationError && (
                            <p className="mt-2 rounded border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-danger">
                                {mutationError}
                            </p>
                        )}
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                type="button"
                                className="rounded border border-border px-3 py-1.5 text-xs hover:bg-background"
                                onClick={() => { setRenamingKeyOpen(false); setMutationError(null); }}
                                disabled={busy}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                                onClick={() => void confirmRenameKey()}
                                disabled={busy || !renameKeyInput.trim()}
                            >
                                {busy ? 'Renomeando…' : 'Confirmar renomeação'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {exportModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-md rounded-lg border border-border bg-surface p-4 shadow-xl">
                        <h3 className="text-sm font-semibold">Exportar chave (.reg)</h3>
                        <p className="mt-1 break-all font-mono text-xs text-muted">{currentFull}</p>
                        <div className="mt-3 space-y-2 text-xs">
                            <label className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="export-scope"
                                    checked={!exportRecursive}
                                    onChange={() => setExportRecursive(false)}
                                    disabled={busy}
                                />
                                <span>Apenas esta chave</span>
                            </label>
                            <label className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="export-scope"
                                    checked={exportRecursive}
                                    onChange={() => setExportRecursive(true)}
                                    disabled={busy}
                                />
                                <span>Incluir subchaves (recursivo)</span>
                            </label>
                        </div>
                        {mutationError && (
                            <p className="mt-2 rounded border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-danger">
                                {mutationError}
                            </p>
                        )}
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                type="button"
                                className="rounded border border-border px-3 py-1.5 text-xs hover:bg-background"
                                onClick={() => { setExportModalOpen(false); setMutationError(null); }}
                                disabled={busy}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                                onClick={() => void confirmExportKey()}
                                disabled={busy}
                            >
                                {busy ? 'Exportando…' : 'Baixar .reg'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {pendingKey && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-md rounded-lg border border-border bg-surface p-4 shadow-xl">
                        <h3 className="text-sm font-semibold">
                            {pendingKey.recursive ? 'Excluir chave e TODAS as subchaves' : 'Excluir chave'}
                        </h3>
                        <p className="mt-2 break-all font-mono text-xs text-muted">
                            {fullRegistryPath(hive, pendingKey.path)}
                        </p>
                        <p className="mt-2 text-xs">
                            {pendingKey.recursive
                                ? 'A subárvore inteira (subchaves e valores) será removida. Esta operação não pode ser desfeita.'
                                : 'A chave só pode ser removida se estiver vazia. Esta operação não pode ser desfeita.'}
                        </p>
                        {pendingKey.recursive && (
                            <p className="mt-2 rounded border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-danger">
                                Exclusão recursiva: confirme que nenhum aplicativo depende desta chave.
                            </p>
                        )}
                        {mutationError && (
                            <p className="mt-2 rounded border border-danger/40 bg-danger/10 px-2 py-1.5 text-xs text-danger">
                                {mutationError}
                            </p>
                        )}
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                type="button"
                                className="rounded border border-border px-3 py-1.5 text-xs hover:bg-background"
                                onClick={() => { setPendingKey(null); setMutationError(null); }}
                                disabled={busy}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                                onClick={() => void confirmDeleteKey()}
                                disabled={busy}
                            >
                                {busy ? 'Excluindo…' : 'Excluir definitivamente'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {toast && (
                <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded border border-border bg-surface px-3 py-1.5 text-xs shadow-lg" role="status">
                    {toast}
                </div>
            )}
        </div>
    );
}

export default RegistryPanel;
