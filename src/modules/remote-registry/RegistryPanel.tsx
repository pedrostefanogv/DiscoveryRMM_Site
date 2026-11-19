import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRegistryStream } from './useRegistryStream';
import { RegistryTree } from './RegistryTree';
import { RegistryValueGrid } from './RegistryValueGrid';
import { RegistryValueEditor } from './RegistryValueEditor';
import {
    REGISTRY_HIVES,
    fullRegistryPath,
    joinPath,
    parentPath,
    type RegistryHive,
    type RegistryListPage,
    type RegistryValueEntry,
} from './registryTypes';
import { describeErrorKind, displayValueName } from './registryFormat';

// ─────────────────────────────────────────────────────────────────────────────
// PAINEL DO REGISTRO — layout de duas colunas, como o editor do Windows.
//
// Mudanças em relação à versão anterior (após feedback de uso real):
//
//  1. ÁRVORE RECURSIVA (RegistryTree) no lugar de uma lista de um nível. Antes,
//     clicar numa subchave NAVEGAVA e perdia o contexto, então a árvore parecia
//     não funcionar.
//  2. PAINEL REDIMENSIONÁVEL: a árvore ocupava 288px fixos e a grade ficava
//     espremida, cortando o valor. Agora a divisória é arrastável (e persiste).
//  3. ALTURA TOTAL: o container usa h-full/min-h-0 em toda a cadeia, para a
//     grade ocupar a tela em vez de ficar com uma faixa mínima.
//  4. BARRA DE ENDEREÇO navegável (breadcrumb): mostra o caminho completo e
//     permite clicar em qualquer ancestral.
//  5. CARREGAMENTO NÃO-BLOQUEANTE: a árvore continua utilizável enquanto uma
//     chave lenta carrega (antes o conteúdo inteiro virava "Carregando…").
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

    const [hive, setHive] = useState<RegistryHive>('HKLM');
    const [currentPath, setCurrentPath] = useState('');
    const [page, setPage] = useState<RegistryListPage | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const [writable, setWritable] = useState(false);
    const [denyReason, setDenyReason] = useState('');
    const [history, setHistory] = useState<Array<{ hive: RegistryHive; path: string }>>([]);
    const [forward, setForward] = useState<Array<{ hive: RegistryHive; path: string }>>([]);

    const [editingValue, setEditingValue] = useState<RegistryValueEntry | null>(null);
    const [creatingValue, setCreatingValue] = useState(false);
    const [pendingKey, setPendingKey] = useState<{ path: string; recursive: boolean } | null>(null);
    const [mutationError, setMutationError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [treeWidth, setTreeWidth] = useState<number>(() => readStoredTreeWidth());
    const [filter, setFilter] = useState('');

    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // Guarda a resposta de uma navegação superada (ver navSeqRef abaixo).
    const navSeqRef = useRef(0);
    // Cache de subchaves por nó, para a árvore não refazer chamadas.
    const subkeyCacheRef = useRef<Map<string, string[]>>(new Map());
    const loadedOnceRef = useRef(false);
    const treePaneRef = useRef<HTMLDivElement | null>(null);

    // ── Abrir uma chave ─────────────────────────────────────────────────────
    const openPath = useCallback(async (
        nextHive: RegistryHive,
        nextPath: string,
        record = true,
    ) => {
        const seq = ++navSeqRef.current;
        setLoading(true);
        setLoadError(null);
        setFilter('');
        try {
            const [listResp, statResp] = await Promise.all([
                send('listKey', { hive: nextHive, path: nextPath }),
                send('statKey', { hive: nextHive, path: nextPath }),
            ]);
            // Resposta obsoleta: outra navegação começou depois desta. Descartar
            // é obrigatório para o painel não exibir a chave errada.
            if (!mountedRef.current || seq !== navSeqRef.current) return;

            if (!listResp.success) {
                setLoadError(describeErrorKind(listResp.errorKind, listResp.error));
                setPage(null);
                setWritable(false);
                setDenyReason('A chave não pôde ser carregada.');
                // Mesmo com falha, a barra de endereço segue o pedido para o
                // operador ver ONDE o erro aconteceu.
                setHive(nextHive);
                setCurrentPath(nextPath);
                return;
            }
            setPage(listResp.page ?? null);
            setNote(listResp.note ?? null);
            // Alimenta o cache da árvore com o que já veio nesta chamada.
            subkeyCacheRef.current.set(`${nextHive}|\u0000|${nextPath}`, listResp.page?.subkeys ?? []);

            if (statResp.success && statResp.key) {
                setWritable(statResp.key.writable);
                setDenyReason(statResp.key.denyReason ?? '');
            } else {
                // Fail-closed: sem stat não há como afirmar que é gravável.
                setWritable(false);
                setDenyReason('Não foi possível verificar a política desta chave.');
            }

            if (record) {
                setHistory((prev) => [...prev, { hive, path: currentPath }]);
                setForward([]);
            }
            setHive(nextHive);
            setCurrentPath(nextPath);
        } catch (e) {
            if (mountedRef.current && seq === navSeqRef.current) {
                setLoadError((e as Error).message);
            }
        } finally {
            if (mountedRef.current && seq === navSeqRef.current) setLoading(false);
        }
    }, [send, hive, currentPath]);

    // Carrega a raiz quando o agente anuncia que o subscribe está ativo.
    useEffect(() => {
        if (!isReady || loadedOnceRef.current) return;
        loadedOnceRef.current = true;
        void openPath('HKLM', '', false);
    }, [isReady, openPath]);

    const refresh = useCallback(async () => {
        subkeyCacheRef.current.delete(`${hive}|\u0000|${currentPath}`);
        await openPath(hive, currentPath, false);
    }, [openPath, hive, currentPath]);

    /** Busca de subchaves para a árvore (com cache). */
    const loadSubkeys = useCallback(async (nodeHive: RegistryHive, nodePath: string): Promise<string[]> => {
        const key = `${nodeHive}|\u0000|${nodePath}`;
        const cached = subkeyCacheRef.current.get(key);
        if (cached) return cached;

        const resp = await send('listKey', { hive: nodeHive, path: nodePath });
        if (!resp.success) {
            throw new Error(describeErrorKind(resp.errorKind, resp.error));
        }
        const subkeys = resp.page?.subkeys ?? [];
        subkeyCacheRef.current.set(key, subkeys);
        return subkeys;
    }, [send]);

    const showToast = useCallback((message: string) => {
        setToast(message);
        window.setTimeout(() => { if (mountedRef.current) setToast(null); }, 3000);
    }, []);

    // ── Mutações ────────────────────────────────────────────────────────────
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

    const removeValue = useCallback(async (name: string) => {
        setBusy(true);
        try {
            const resp = await send('deleteValue', { hive, path: currentPath, name, confirmed: true });
            if (!resp.success) {
                setMutationError(describeErrorKind(resp.errorKind, resp.error));
                return;
            }
            showToast('Valor excluído.');
            await refresh();
        } catch (e) {
            setMutationError((e as Error).message);
        } finally {
            if (mountedRef.current) setBusy(false);
        }
    }, [send, hive, currentPath, refresh, showToast]);

    const confirmDeleteKey = useCallback(async () => {
        if (!pendingKey) return;
        setBusy(true);
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
            // Invalida o cache do pai e do nó removido.
            subkeyCacheRef.current.delete(`${hive}|\u0000|${pendingKey.path}`);
            subkeyCacheRef.current.delete(`${hive}|\u0000|${parentPath(pendingKey.path)}`);
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
    }, [pendingKey, send, hive, refresh, currentPath, openPath, showToast]);

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

    const navigate = useCallback((nextHive: RegistryHive, nextPath: string, viaHistory: boolean) => {
        if (viaHistory) {
            setHistory((prev) => [...prev, { hive, path: currentPath }]);
            setForward([]);
        }
        void openPath(nextHive, nextPath, !viaHistory);
    }, [openPath, hive, currentPath]);

    // useMemo: sem isto a expressão cria um array NOVO a cada render, e os
    // useMemo de filtro abaixo recalculariam sempre (dependência instável).
    const values = useMemo(() => page?.values ?? [], [page]);
    const subkeys = useMemo(() => page?.subkeys ?? [], [page]);

    // Filtro de valores/subchaves: em chaves grandes (HKCR) é o que torna a
    // navegação utilizável sem rolar milhares de linhas.
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
            <div className="flex h-full items-center justify-center p-4 text-sm text-red-400">
                {streamError}
            </div>
        );
    }

    // Segmentos do caminho, para a barra de endereço navegável.
    const segments = currentPath ? currentPath.split('\\') : [];

    return (
        <div className="flex h-full min-h-0 flex-col" data-testid="registry-panel" data-visible={isVisible}>
            {/* ── Barra superior: hive + caminho + ações ── */}
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-2 py-1.5 text-xs">
                <select
                    className="rounded border border-border bg-background px-1.5 py-1 font-mono text-xs"
                    value={hive}
                    onChange={(e) => navigate(e.target.value as RegistryHive, '', true)}
                    aria-label="Hive"
                >
                    {REGISTRY_HIVES.map((h) => (
                        <option key={h.hive} value={h.hive}>{h.label}</option>
                    ))}
                </select>

                {/* Breadcrumb: clicar num segmento sobe até ele. */}
                <nav
                    className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden font-mono"
                    aria-label="Caminho"
                    data-testid="registry-current-path"
                    data-path={fullRegistryPath(hive, currentPath)}
                >
                    <button
                        type="button"
                        className="shrink-0 rounded px-1 hover:bg-background"
                        onClick={() => navigate(hive, '', true)}
                    >
                        {hive}
                    </button>
                    {segments.map((seg, i) => {
                        const target = segments.slice(0, i + 1).join('\\');
                        return (
                            <span key={target} className="flex min-w-0 items-center">
                                <span className="text-muted">\</span>
                                <button
                                    type="button"
                                    className={`truncate rounded px-1 hover:bg-background ${i === segments.length - 1 ? 'text-primary' : ''}`}
                                    onClick={() => navigate(hive, target, true)}
                                    title={seg}
                                >
                                    {seg}
                                </button>
                            </span>
                        );
                    })}
                </nav>

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
                        onClick={() => navigate(hive, parentPath(currentPath), true)}
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
            {note && (
                <p className="border-b border-border bg-yellow-500/10 px-2 py-1 text-[11px] text-yellow-500" data-testid="registry-note">
                    {note}
                </p>
            )}
            {!writable && !loadError && (
                <p className="border-b border-border bg-yellow-500/10 px-2 py-1 text-[11px] text-yellow-500" data-testid="registry-readonly">
                    Somente leitura nesta chave. {denyReason}
                </p>
            )}
            {loadError && (
                <p className="border-b border-border bg-red-500/10 px-2 py-1 text-[11px] text-red-400" data-testid="registry-error">
                    {loadError}
                </p>
            )}

            {/* ── Corpo: árvore + conteúdo ── */}
            {/* items-stretch: garante que a coluna da árvore ocupe a altura TODA
                da linha, e não só a altura do conteúdo dela (era o que deixava o
                painel lateral com o fundo cortado no meio da tela). */}
            <div className="flex min-h-0 flex-1 items-stretch">
                <div
                    ref={treePaneRef}
                    className="shrink-0 overflow-hidden border-r border-border bg-surface"
                    style={{ width: `${treeWidth}px` }}
                >
                    <RegistryTree
                        activeHive={hive}
                        activePath={currentPath}
                        onSelect={(h, p) => navigate(h, p, true)}
                        loadSubkeys={loadSubkeys}
                        disabled={!isReady}
                    />
                </div>

                {/* Divisória arrastável */}
                <div
                    className="w-1 shrink-0 cursor-col-resize bg-border/40 hover:bg-primary/40"
                    onMouseDown={startResize}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Redimensionar árvore"
                />

                <section className="flex min-h-0 min-w-0 flex-1 flex-col">
                    {/* Barra de ferramentas da chave */}
                    <div className="flex flex-wrap items-center gap-2 border-b border-border px-2 py-1.5">
                        <span className="text-xs font-medium" data-testid="registry-counts">
                            {page?.valueCount ?? 0} valor(es) · {page?.subkeyCount ?? 0} subchave(s)
                        </span>
                        {(values.length > 20 || subkeys.length > 20) && (
                            <input
                                className="w-48 rounded border border-border bg-background px-2 py-1 text-xs"
                                placeholder="Filtrar nome ou dado…"
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                                aria-label="Filtrar"
                            />
                        )}
                        <div className="ml-auto flex gap-1">
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
                                onClick={() => { setPendingKey({ path: currentPath, recursive: false }); setMutationError(null); }}
                                disabled={!writable || !currentPath || loading}
                                title={!writable ? denyReason : undefined}
                            >
                                Excluir chave
                            </button>
                            <button
                                type="button"
                                className="rounded border border-red-500/50 px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-40"
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
                        onDelete={(name) => void removeValue(name)}
                        busy={busy}
                    />

                    {/* Subchaves */}
                    {filteredSubkeys.length > 0 && (
                        <div className="shrink-0 border-t border-border bg-surface/60 px-2 py-2">
                            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
                                Subchaves ({filteredSubkeys.length}{filter ? ` de ${subkeys.length}` : ''})
                            </p>
                            <div className="flex flex-wrap gap-1">
                                {filteredSubkeys.map((sub) => (
                                    <button
                                        key={sub}
                                        type="button"
                                        data-testid={`registry-subkey-${sub}`}
                                        className="rounded border border-border px-2 py-0.5 font-mono text-[11px] hover:bg-background"
                                        onClick={() => navigate(hive, joinPath(currentPath, sub), true)}
                                        onDoubleClick={() => navigate(hive, joinPath(currentPath, sub), true)}
                                    >
                                        {sub}
                                    </button>
                                ))}
                            </div>
                            {page?.hasMore && (
                                <p className="mt-1 text-[11px] text-muted">
                                    Mostrando {subkeys.length} de {page.subkeyCount} subchaves.
                                </p>
                            )}
                        </div>
                    )}
                </section>
            </div>

            {/* ── Modais ── */}
            {(editingValue || creatingValue) && (
                <RegistryValueEditor
                    keyPath={fullRegistryPath(hive, currentPath)}
                    existing={editingValue}
                    initialName={creatingValue ? '' : undefined}
                    onConfirm={(payload) => void applyValue(payload)}
                    onCancel={() => { setEditingValue(null); setCreatingValue(false); setMutationError(null); }}
                    busy={busy}
                    error={mutationError}
                />
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
                            <p className="mt-2 rounded border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-400">
                                Exclusão recursiva: confirme que nenhum aplicativo depende desta chave.
                            </p>
                        )}
                        {mutationError && (
                            <p className="mt-2 rounded border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-400">
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
                <div className="pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2 rounded bg-surface px-3 py-1.5 text-xs shadow-lg" role="status">
                    {toast}
                </div>
            )}
        </div>
    );
}

export default RegistryPanel;
