import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegistryStream } from './useRegistryStream';
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
import {
    base64ToHexPreview,
    displayValueName,
    describeErrorKind,
    formatValueForDisplay,
    hexWidthForType,
    isEditableType,
    toHexDisplay,
    typeLabel,
} from './registryFormat';

// ─────────────────────────────────────────────────────────────────────────────
// PAINEL DO REGISTRO — árvore de navegação + grade de valores + edição.
//
// Recebe as credenciais NATS já emitidas pelo console (mesmo contrato dos outros
// módulos remotos) e não conhece a API REST: toda a operação vai pelo canal
// .registry.req/.registry.resp da sessão.
// ─────────────────────────────────────────────────────────────────────────────

export interface RegistryPanelProps {
    natsSubject: string;
    /**
     * URL WSS do NATS e JWT escopado.
     *
     * Opcionais para casar com o contrato dos módulos irmãos (RemoteProcesses,
     * RemoteFiles): o TabSession do console declara os dois como opcionais, e o
     * painel só é renderizado quando a sessão existe. Um valor ausente aqui
     * vira string vazia e o hook reporta a falha de conexão — em vez de o
     * componente quebrar na montagem.
     */
    natsUrl?: string;
    jwt?: string;
    nkeySeed?: string;
    getFreshCredentials?: () => Promise<string>;
    isVisible?: boolean;
}

/** Nó carregado da árvore: guarda os filhos já buscados (lazy). */
interface TreeNode {
    hive: RegistryHive;
    path: string;
    subkeys: string[];
    loaded: boolean;
    loading: boolean;
    error: string | null;
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
    const [writable, setWritable] = useState(true);
    const [denyReason, setDenyReason] = useState('');
    const [expanded, setExpanded] = useState<Record<string, TreeNode>>({});
    const [history, setHistory] = useState<Array<{ hive: RegistryHive; path: string }>>([]);
    const [forward, setForward] = useState<Array<{ hive: RegistryHive; path: string }>>([]);

    const [editingValue, setEditingValue] = useState<RegistryValueEntry | null>(null);
    const [creatingValue, setCreatingValue] = useState(false);
    const [pendingKey, setPendingKey] = useState<{ action: 'deleteKey'; path: string; recursive: boolean } | null>(null);
    const [mutationError, setMutationError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // Sequência de navegação: descarta a resposta de um pedido ANTIGO que chegue
    // depois de um mais recente.
    //
    // Sem isto há uma corrida real: clicar em duas subchaves em sequência dispara
    // duas chamadas; se a primeira responder DEPOIS da segunda, o painel acaba
    // mostrando o conteúdo da chave errada (a que o operador já abandonou) — e o
    // botão de escrita passa a apontar para outra chave que não a exibida.
    const navSeqRef = useRef(0);

    // Abre uma chave: lista subchaves/valores e consulta o stat (para saber se
    // a mutação é permitida aqui — a UI desabilita os botões ANTES de o operador
    // tentar, em vez de deixá-lo clicar e receber erro).
    const openPath = useCallback(async (
        nextHive: RegistryHive,
        nextPath: string,
        record = true,
    ) => {
        const seq = ++navSeqRef.current;
        setLoading(true);
        setLoadError(null);
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
                // Fail-closed: sem página carregada, a permissão de escrita do
                // estado anterior não vale para esta chave. Deixá-la intacta
                // manteria os botões habilitados apontando para uma chave que
                // nem foi carregada.
                setWritable(false);
                setDenyReason('A chave não pôde ser carregada.');
                return;
            }
            setPage(listResp.page ?? null);
            setNote(listResp.note ?? null);

            if (statResp.success && statResp.key) {
                setWritable(statResp.key.writable);
                setDenyReason(statResp.key.denyReason ?? '');
            } else {
                // Sem stat não há como afirmar que a chave é gravável: assume
                // NÃO gravável (fail-closed). É preferível o operador recarregar
                // do que habilitar uma escrita que o agente vai recusar.
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
            if (mountedRef.current && seq === navSeqRef.current) setLoadError((e as Error).message);
        } finally {
            if (mountedRef.current && seq === navSeqRef.current) setLoading(false);
        }
    }, [send, hive, currentPath]);

    // Primeiro carregamento quando o agente anuncia que o subscribe está ativo.
    const loadedOnceRef = useRef(false);
    useEffect(() => {
        if (!isReady || loadedOnceRef.current) return;
        loadedOnceRef.current = true;
        void openPath('HKLM', '', false);
    }, [isReady, openPath]);

    // Recarrega a chave atual (após uma mutação).
    const refresh = useCallback(async () => {
        await openPath(hive, currentPath, false);
    }, [openPath, hive, currentPath]);

    const toggleExpand = useCallback(async (nodeHive: RegistryHive, nodePath: string) => {
        const key = `${nodeHive}\\${nodePath}`;
        const existing = expanded[key];
        if (existing?.loaded) {
            setExpanded((prev) => {
                const next = { ...prev };
                if (next[key]) delete next[key];
                return next;
            });
            return;
        }
        setExpanded((prev) => ({
            ...prev,
            [key]: { hive: nodeHive, path: nodePath, subkeys: [], loaded: false, loading: true, error: null },
        }));
        try {
            const resp = await send('listKey', { hive: nodeHive, path: nodePath });
            if (!mountedRef.current) return;
            setExpanded((prev) => ({
                ...prev,
                [key]: {
                    hive: nodeHive,
                    path: nodePath,
                    subkeys: resp.success ? (resp.page?.subkeys ?? []) : [],
                    loaded: true,
                    loading: false,
                    error: resp.success ? null : (resp.error ?? 'Falha ao expandir.'),
                },
            }));
        } catch (e) {
            if (mountedRef.current) {
                setExpanded((prev) => ({
                    ...prev,
                    [key]: { hive: nodeHive, path: nodePath, subkeys: [], loaded: true, loading: false, error: (e as Error).message },
                }));
            }
        }
    }, [expanded, send]);

    const showToast = useCallback((message: string) => {
        setToast(message);
        window.setTimeout(() => { if (mountedRef.current) setToast(null); }, 3000);
    }, []);

    // ── Mutações ────────────────────────────────────────────────────────────
    // Todas passam confirmed: true. O agente REVALIDA (ErrConfirmationRequired)
    // — a barreira não é a UI.

    const applyValue = useCallback(async (payload: {
        name: string; type: string; data: string; confirmed: true;
    }) => {
        setBusy(true);
        setMutationError(null);
        try {
            const resp = await send('setValue', {
                hive, path: currentPath, name: payload.name, type: payload.type, data: payload.data, confirmed: true,
            });
            if (!resp.success) {
                setMutationError(resp.error ?? 'Falha ao gravar.');
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
                setMutationError(resp.error ?? 'Falha ao excluir.');
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
                setMutationError(resp.error ?? 'Falha ao excluir a chave.');
                return;
            }
            setPendingKey(null);
            showToast('Chave excluída.');
            // Se apagamos a chave aberta, sobe para o pai.
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

    // ── Render ──────────────────────────────────────────────────────────────

    const values = page?.values ?? [];

    // Mensagem de erro exibida. O código do erro (errorKind) já vem traduzido
    // pelo agente; aqui só repassamos. Mantido como variável simples em vez de
    // useMemo: era uma abstração sem conteúdo (um useMemo que devolvia o próprio
    // valor), e memoizar uma string não traz ganho.
    const friendlyError = loadError;

    if (!isConnected && streamError) {
        return (
            <div className="flex h-full items-center justify-center p-4 text-sm text-red-400">
                {streamError}
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col" data-testid="registry-panel" data-visible={isVisible}>
            {/* Barra de endereço + ações */}
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-2 py-1.5 text-xs">
                <select
                    className="rounded border border-border bg-background px-1.5 py-1 font-mono"
                    value={hive}
                    onChange={(e) => void openPath(e.target.value as RegistryHive, currentPath, false)}
                    aria-label="Hive"
                >
                    {REGISTRY_HIVES.map((h) => (
                        <option key={h.hive} value={h.hive}>{h.label}</option>
                    ))}
                </select>
                <span className="break-all font-mono text-muted" data-testid="registry-current-path">
                    {fullRegistryPath(hive, currentPath)}
                </span>
                <div className="ml-auto flex items-center gap-1">
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
                    >
                        →
                    </button>
                    <button
                        type="button"
                        className="rounded border border-border px-2 py-1 hover:bg-background disabled:opacity-40"
                        onClick={() => void openPath(hive, parentPath(currentPath), true)}
                        disabled={!currentPath || loading}
                        aria-label="Subir um nível"
                    >
                        ↑
                    </button>
                    <button
                        type="button"
                        className="rounded border border-border px-2 py-1 hover:bg-background disabled:opacity-40"
                        onClick={() => void refresh()}
                        disabled={loading}
                        aria-label="Atualizar"
                    >
                        ⟳
                    </button>
                </div>
            </div>

            <div className="flex min-h-0 flex-1">
                {/* Árvore */}
                <aside className="w-72 shrink-0 overflow-auto border-r border-border bg-surface" aria-label="Árvore do registro">
                    {REGISTRY_HIVES.map((h) => {
                        const key = `${h.hive}\\`;
                        const node = expanded[key];
                        return (
                            <div key={h.hive}>
                                <div className="flex items-center gap-1 px-2 py-1 text-xs">
                                    <button
                                        type="button"
                                        className="w-4 text-muted hover:text-foreground"
                                        onClick={() => void toggleExpand(h.hive, '')}
                                        aria-label={`Expandir ${h.label}`}
                                    >
                                        {node?.loaded && !node.loading ? '▾' : '▸'}
                                    </button>
                                    <button
                                        type="button"
                                        className={`flex-1 truncate text-left font-mono ${hive === h.hive && currentPath === '' ? 'text-primary' : ''}`}
                                        onClick={() => void openPath(h.hive, '', true)}
                                        title={h.description}
                                    >
                                        {h.label}
                                    </button>
                                </div>
                                {node?.loaded && (
                                    <div className="pl-4">
                                        {node.error && <p className="px-2 py-1 text-[11px] text-red-400">{node.error}</p>}
                                        {node.subkeys.map((sub) => (
                                            <button
                                                key={sub}
                                                type="button"
                                                className="block w-full truncate px-2 py-0.5 text-left font-mono text-[11px] hover:bg-background"
                                                onClick={() => void openPath(h.hive, sub, true)}
                                            >
                                                {sub}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </aside>

                {/* Conteúdo */}
                <section className="flex min-h-0 flex-1 flex-col">
                    {note && (
                        <p className="border-b border-border bg-yellow-500/10 px-2 py-1 text-[11px] text-yellow-500" data-testid="registry-note">
                            {note}
                        </p>
                    )}
                    {!writable && (
                        <p className="border-b border-border bg-yellow-500/10 px-2 py-1 text-[11px] text-yellow-500" data-testid="registry-readonly">
                            Somente leitura nesta chave. {denyReason}
                        </p>
                    )}
                    {friendlyError && (
                        <p className="border-b border-border bg-red-500/10 px-2 py-1 text-[11px] text-red-400">
                            {friendlyError}
                        </p>
                    )}

                    <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
                        <span className="text-xs font-medium">
                            {values.length} valor(es) · {page?.subkeyCount ?? 0} subchave(s)
                        </span>
                        <div className="ml-auto flex gap-1">
                            <button
                                type="button"
                                className="rounded border border-border px-2 py-1 text-xs hover:bg-background disabled:opacity-40"
                                onClick={() => { setCreatingValue(true); setMutationError(null); }}
                                disabled={!writable || loading}
                                title={!writable ? denyReason : undefined}
                            >
                                Novo valor
                            </button>
                            <button
                                type="button"
                                className="rounded border border-border px-2 py-1 text-xs hover:bg-background disabled:opacity-40"
                                onClick={() => { setPendingKey({ action: 'deleteKey', path: currentPath, recursive: false }); setMutationError(null); }}
                                disabled={!writable || !currentPath || loading}
                                title={!writable ? denyReason : undefined}
                            >
                                Excluir chave
                            </button>
                            {/* A exclusão recursiva é uma ação de risco MUITO maior que a
                                simples: remove a subárvore inteira. Por isso é um botão
                                separado, com o próprio modal — e nunca um "sim, pode
                                apagar tudo" implícito no fluxo anterior. */}
                            <button
                                type="button"
                                className="rounded border border-red-500/50 px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-40"
                                onClick={() => { setPendingKey({ action: 'deleteKey', path: currentPath, recursive: true }); setMutationError(null); }}
                                disabled={!writable || !currentPath || loading}
                                title={!writable ? denyReason : undefined}
                            >
                                Excluir com subchaves
                            </button>
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-auto" aria-busy={loading}>
                        {/* O aviso de carregamento é NÃO-BLOQUEANTE: substituir o
                            conteúdo inteiro por "Carregando…" apagava a árvore e os
                            atalhos de subchave, deixando o operador sem como navegar
                            para outro lugar enquanto uma chave lenta carregava. */}
                        {loading && (
                            <p className="border-b border-border px-2 py-1 text-xs text-muted" data-testid="registry-loading">
                                Carregando…
                            </p>
                        )}
                        {!loading && values.length === 0 && (
                            <p className="px-2 py-2 text-xs text-muted">Esta chave não tem valores.</p>
                        )}
                        {values.length > 0 && (
                            <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-surface">
                                    <tr className="border-b border-border text-left">
                                        <th className="px-2 py-1 font-medium">Nome</th>
                                        <th className="px-2 py-1 font-medium">Tipo</th>
                                        <th className="px-2 py-1 font-medium">Dado</th>
                                        <th className="px-2 py-1 font-medium" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {values.map((v) => (
                                        <tr key={v.name || '(default)'} className="border-b border-border/50 hover:bg-background">
                                            <td className="px-2 py-1 font-mono">{displayValueName(v.name)}</td>
                                            <td className="px-2 py-1 text-muted" title={typeLabel(v.type)}>{v.type}</td>
                                            <td className="px-2 py-1 font-mono break-all">
                                                {v.readError ? (
                                                    // Sem esta marca, um valor que o agente NÃO conseguiu
                                                    // ler aparecia como "REG_NONE / vazio" — o operador
                                                    // concluiria que o valor está limpo.
                                                    <span className="text-yellow-500">
                                                        (não foi possível ler: {v.readError})
                                                    </span>
                                                ) : (
                                                    <>
                                                        {formatValueForDisplay(v)}
                                                        {v.type === 'REG_DWORD' || v.type === 'REG_QWORD' ? (
                                                            <span className="ml-2 text-muted">{toHexDisplay(v.data, hexWidthForType(v.type))}</span>
                                                        ) : null}
                                                        {v.type === 'REG_BINARY' && base64ToHexPreview(v.data) ? (
                                                            <span className="ml-2 text-muted">{base64ToHexPreview(v.data)}</span>
                                                        ) : null}
                                                    </>
                                                )}
                                            </td>
                                            <td className="whitespace-nowrap px-2 py-1 text-right">
                                                <button
                                                    type="button"
                                                    className="rounded border border-border px-2 py-0.5 hover:bg-surface disabled:opacity-40"
                                                    onClick={() => { setEditingValue(v); setMutationError(null); }}
                                                    // Tipos de estrutura binária não são editáveis: editar
                                                    // como texto corromperia o formato interno.
                                                    disabled={!writable || !isEditableType(v.type)}
                                                    title={!isEditableType(v.type) ? 'Este tipo não pode ser editado como texto.' : (!writable ? denyReason : undefined)}
                                                >
                                                    Editar
                                                </button>
                                                <button
                                                    type="button"
                                                    className="ml-1 rounded border border-border px-2 py-0.5 hover:bg-surface disabled:opacity-40"
                                                    onClick={() => void removeValue(v.name)}
                                                    disabled={!writable}
                                                    title={!writable ? denyReason : undefined}
                                                >
                                                    Excluir
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        {/* Subchaves da chave atual */}
                        {(page?.subkeys.length ?? 0) > 0 && (
                            <div className="border-t border-border px-2 py-2">
                                <p className="mb-1 text-[11px] font-medium text-muted">Subchaves</p>
                                <div className="flex flex-wrap gap-1">
                                    {page!.subkeys.map((sub) => (
                                        <button
                                            key={sub}
                                            type="button"
                                            className="rounded border border-border px-2 py-0.5 font-mono text-[11px] hover:bg-background"
                                            onClick={() => void openPath(hive, joinPath(currentPath, sub), true)}
                                        >
                                            {sub}
                                        </button>
                                    ))}
                                </div>
                                {page!.hasMore && (
                                    <p className="mt-1 text-[11px] text-muted">
                                        Mostrando {page!.subkeys.length} de {page!.subkeyCount} subchaves.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </section>
            </div>

            {/* Modais de mutação */}
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
