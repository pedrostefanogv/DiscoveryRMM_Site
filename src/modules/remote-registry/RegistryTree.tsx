import { useCallback, useEffect, useRef, useState } from 'react';
import { REGISTRY_HIVES, joinPath, type RegistryHive } from './registryTypes';

// ─────────────────────────────────────────────────────────────────────────────
// ÁRVORE DO REGISTRO — recursiva e lazy, como o regedit.
//
// Por que recursiva e não uma lista de subchaves do nó atual: um editor de
// registro exige NAVEGAR E VOLTAR mantendo a hierarquia visível. A versão
// anterior mostrava só um nível e, ao clicar numa subchave, NAVEGAVA (perdendo
// o contexto) — o resultado era uma árvore que parecia morta.
//
// Carregamento lazy por nó: HKCR tem 5.673 subchaves na raiz e
// HKLM\SOFTWARE\Classes tem dezenas de milhares. Carregar o nível inteiro de
// uma vez travaria o console. Cada nó só busca os filhos quando é expandido.
//
// A busca de filhos é cacheada por caminho completo; um segundo expandir não
// refaz a chamada.
// ─────────────────────────────────────────────────────────────────────────────

export interface RegistryTreeProps {
    /** Hive selecionado no momento. */
    activeHive: RegistryHive;
    /** Caminho selecionado dentro do hive (sem o hive). */
    activePath: string;
    /** Seleciona um nó (abre no painel da direita). */
    onSelect: (hive: RegistryHive, path: string) => void;
    /** Busca as subchaves de um nó. */
    loadSubkeys: (hive: RegistryHive, path: string) => Promise<string[]>;
    disabled?: boolean;
}

/** Estado de cada nó da árvore. */
interface NodeState {
    children: string[] | null;
    loading: boolean;
    error: string | null;
    expanded: boolean;
}

const EMPTY: NodeState = { children: null, loading: false, error: null, expanded: false };

/** Chave única de um nó (hive + caminho). */
function nodeKey(hive: string, path: string): string {
    return `${hive}|\u0000|${path}`;
}

export function RegistryTree({
    activeHive,
    activePath,
    onSelect,
    loadSubkeys,
    disabled = false,
}: RegistryTreeProps) {
    const [nodes, setNodes] = useState<Record<string, NodeState>>({});
    const mountedRef = useRef(true);
    // Guarda a última seleção para rolar até o nó ativo.
    const activeRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const setNode = useCallback((key: string, patch: Partial<NodeState>) => {
        setNodes((prev) => ({ ...prev, [key]: { ...(prev[key] ?? EMPTY), ...patch } }));
    }, []);

    const toggle = useCallback(async (hive: RegistryHive, path: string) => {
        const key = nodeKey(hive, path);
        const current = nodes[key] ?? EMPTY;

        // Já carregado: só alterna a visibilidade.
        if (current.children !== null) {
            setNode(key, { expanded: !current.expanded });
            return;
        }
        // Já carregando: ignora o clique repetido.
        if (current.loading) return;

        setNode(key, { expanded: true, loading: true, error: null });
        try {
            const children = await loadSubkeys(hive, path);
            if (!mountedRef.current) return;
            setNode(key, { children, loading: false });
        } catch (e) {
            if (!mountedRef.current) return;
            // O erro fica NO NÓ, não no painel: uma chave sem permissão não pode
            // derrubar a árvore inteira — o operador continua navegando no resto.
            setNode(key, { children: [], loading: false, error: (e as Error).message });
        }
    }, [nodes, loadSubkeys, setNode]);

    /**
     * Expande automaticamente o caminho ativo (e o hive, mesmo na raiz).
     *
     * O `activePath` vazio NÃO pode ser motivo para não expandir: o estado
     * inicial do painel é a raiz do hive, e era exatamente aí que a árvore
     * aparecia com cinco hives fechados e nenhuma subchave —"a árvore não
     * funciona". Um editor de registro precisa mostrar o primeiro nível ao abrir.
     */
    useEffect(() => {
        // Ancestrais do caminho ativo; na raiz (path vazio) o próprio hive.
        const parts = activePath ? activePath.split('\\') : [];
        const ancestors: string[] = [''];
        for (let i = 0; i < parts.length - 1; i += 1) {
            ancestors.push(parts.slice(0, i + 1).join('\\'));
        }
        void (async () => {
            for (const ancestor of ancestors) {
                const key = nodeKey(activeHive, ancestor);
                const state = nodes[key];
                // Só expande quem ainda não carregou; não força recarga.
                if (!state || state.children === null) {
                    try {
                        const children = await loadSubkeys(activeHive, ancestor);
                        if (!mountedRef.current) return;
                        setNodes((prev) => ({
                            ...prev,
                            [key]: { ...(prev[key] ?? EMPTY), children, expanded: true, loading: false },
                        }));
                    } catch {
                        return; // ancestral inacessível: para de expandir
                    }
                } else if (!state.expanded) {
                    setNodes((prev) => ({ ...prev, [key]: { ...state, expanded: true } }));
                }
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeHive, activePath, loadSubkeys]);

    // Rola até o nó ativo quando ele muda. (Inclui o caso da raiz, em que o nó
    // ativo é o próprio hive.)
    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: 'nearest' });
    }, [activeHive, activePath]);

    const renderNode = (hive: RegistryHive, path: string, label: string, depth: number) => {
        const key = nodeKey(hive, path);
        const state = nodes[key] ?? EMPTY;
        const isActive = hive === activeHive && path === activePath;
        const hasChildren = state.children === null || state.children.length > 0;

        return (
            <div key={key}>
                <div
                    className={`group flex items-center gap-0.5 rounded-sm pr-1 ${isActive ? 'bg-primary/15 text-primary' : 'hover:bg-background'}`}
                    style={{ paddingLeft: `${depth * 12}px` }}
                >
                    <button
                        type="button"
                        className="flex h-5 w-5 shrink-0 items-center justify-center text-[10px] text-muted hover:text-foreground disabled:opacity-30"
                        onClick={(e) => { e.stopPropagation(); void toggle(hive, path); }}
                        disabled={disabled || (state.children !== null && state.children.length === 0)}
                        aria-label={state.expanded ? `Recolher ${label}` : `Expandir ${label}`}
                        aria-expanded={state.expanded}
                    >
                        {state.loading ? '·' : !hasChildren ? '' : state.expanded ? '▾' : '▸'}
                    </button>
                    <button
                        ref={isActive ? activeRef : undefined}
                        type="button"
                        className="min-w-0 flex-1 truncate py-0.5 text-left font-mono text-[11px]"
                        onClick={() => onSelect(hive, path)}
                        onDoubleClick={() => void toggle(hive, path)}
                        title={path ? `${hive}\\${path}` : hive}
                        disabled={disabled}
                    >
                        {label}
                    </button>
                </div>

                {state.error && (
                    <p
                        className="py-0.5 pr-1 text-[10px] text-red-400"
                        style={{ paddingLeft: `${(depth + 1) * 12 + 20}px` }}
                    >
                        {state.error}
                    </p>
                )}

                {state.expanded && state.children?.map((child) => {
                    const childPath = path === '' ? child : joinPath(path, child);
                    return renderNode(hive, childPath, child, depth + 1);
                })}
            </div>
        );
    };

    return (
        // h-full + overflow-auto: a árvore rola DENTRO do painel lateral, e o
        // fundo do painel acompanha a altura toda. Sem h-full ela crescia só
        // até o conteúdo e o painel parecia "cortado" no meio da tela.
        <div className="h-full overflow-auto py-1" role="tree" aria-label="Árvore do registro">
            {REGISTRY_HIVES.map((h) => renderNode(h.hive, '', h.label, 0))}
        </div>
    );
}

export default RegistryTree;
