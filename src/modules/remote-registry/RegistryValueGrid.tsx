import { useMemo, useState } from 'react';
import type { RegistryValueEntry, RegistryValueType } from './registryTypes';
import {
    base64ByteLength,
    base64ToHexPreview,
    displayValueName,
    formatValueForDisplay,
    hexWidthForType,
    isEditableType,
    toHexDisplay,
    typeLabel,
} from './registryFormat';

// ─────────────────────────────────────────────────────────────────────────────
// GRADE DE VALORES — a coluna da direita do editor, como no regedit.
// ─────────────────────────────────────────────────────────────────────────────

export interface RegistryValueGridProps {
    values: RegistryValueEntry[];
    loading: boolean;
    writable: boolean;
    denyReason: string;
    onEdit: (entry: RegistryValueEntry) => void;
    onDelete: (name: string) => void;
    onCopy?: (entry: RegistryValueEntry) => void;
    busy?: boolean;
    isFiltered?: boolean;
    onClearFilter?: () => void;
}

/** Largura das colunas fixas. A coluna "Dado" ocupa o resto. */
const COL_NAME = 'min-w-[180px] w-[22%]';
const COL_TYPE = 'min-w-[140px] w-[14%]';

function typeBadgeClass(type: RegistryValueType): string {
    switch (type) {
        case 'REG_SZ':
        case 'REG_EXPAND_SZ':
        case 'REG_LINK':
            return 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400';
        case 'REG_DWORD':
        case 'REG_QWORD':
        case 'REG_DWORD_BIG_ENDIAN':
            return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
        case 'REG_BINARY':
            return 'border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400';
        case 'REG_MULTI_SZ':
            return 'border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400';
        default:
            return 'border-border bg-surface-light text-muted';
    }
}

export function RegistryValueGrid({
    values,
    loading,
    writable,
    denyReason,
    onEdit,
    onDelete,
    onCopy,
    busy = false,
    isFiltered = false,
    onClearFilter,
}: RegistryValueGridProps) {
    const [sortBy, setSortBy] = useState<'name' | 'type'>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const hasUnreadable = useMemo(() => values.some((v) => !!v.readError), [values]);

    const sortedValues = useMemo(() => {
        const list = [...values];
        list.sort((a, b) => {
            const cmp = sortBy === 'name'
                ? displayValueName(a.name).localeCompare(displayValueName(b.name), undefined, { sensitivity: 'base' })
                : a.type.localeCompare(b.type);
            return sortDir === 'asc' ? cmp : -cmp;
        });
        return list;
    }, [values, sortBy, sortDir]);

    const toggleSort = (col: 'name' | 'type') => {
        if (sortBy === col) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortBy(col);
            setSortDir('asc');
        }
    };

    if (loading && values.length === 0) {
        return (
            <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 py-4">
                <div className="text-xs text-muted">Carregando…</div>
                {[0, 1, 2, 3].map((row) => (
                    <div key={row} className="grid grid-cols-12 gap-3 py-1">
                        <div className="col-span-3 h-4 animate-pulse rounded bg-surface-hover/70" />
                        <div className="col-span-2 h-4 animate-pulse rounded bg-surface-hover/50" />
                        <div className="col-span-7 h-4 animate-pulse rounded bg-surface-hover/40" />
                    </div>
                ))}
            </div>
        );
    }
    if (values.length === 0) {
        return (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 py-6 text-center text-xs text-muted">
                {isFiltered ? (
                    <>
                        <p>Nenhum valor corresponde ao filtro.</p>
                        {onClearFilter && (
                            <button
                                type="button"
                                className="rounded border border-border px-2.5 py-1 text-xs text-foreground hover:bg-surface"
                                onClick={onClearFilter}
                            >
                                Limpar filtro
                            </button>
                        )}
                    </>
                ) : (
                    <p>
                        Esta chave não tem valores. Use <strong>Novo valor</strong> para criar um.
                    </p>
                )}
            </div>
        );
    }

    return (
        <div className="relative min-h-0 flex-1 overflow-auto">
            {loading && (
                <div className="sticky top-0 z-20 h-0.5 w-full overflow-hidden bg-primary/20">
                    <div className="h-full w-1/3 animate-pulse bg-primary" />
                </div>
            )}
            {hasUnreadable && (
                <p className="border-b border-yellow-500/30 bg-yellow-500/10 px-3 py-1.5 text-[11px] text-yellow-500">
                    Alguns valores não puderam ser lidos. Eles aparecem marcados abaixo —
                    o conteúdo existe, mas o agente não tem permissão para lê-lo.
                </p>
            )}
            <table className={`w-full table-fixed border-collapse text-xs leading-tight transition-opacity ${loading ? 'opacity-60' : ''}`}>
                <thead className="sticky top-0 z-10 bg-surface">
                    <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted">
                        <th className={`py-1.5 pl-3 pr-1 text-left font-medium ${COL_NAME}`}>
                            <button
                                type="button"
                                className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground"
                                onClick={() => toggleSort('name')}
                            >
                                <span>Nome</span>
                                {sortBy === 'name' && <span aria-hidden="true">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                            </button>
                        </th>
                        <th className={`px-1.5 py-1.5 text-left font-medium ${COL_TYPE}`}>
                            <button
                                type="button"
                                className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground"
                                onClick={() => toggleSort('type')}
                            >
                                <span>Tipo</span>
                                {sortBy === 'type' && <span aria-hidden="true">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                            </button>
                        </th>
                        <th className="px-1.5 py-1.5 text-left font-medium">Dado</th>
                        <th className="w-[165px] py-1.5 pl-1 pr-3 text-right font-medium">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedValues.map((v) => {
                        const rowKey = v.name === '' ? '__default__' : v.name;
                        const editable = isEditableType(v.type);
                        const canEdit = writable && editable && !busy;
                        return (
                            <tr
                                key={rowKey}
                                className={`border-b border-border/40 align-top transition-colors hover:bg-surface-hover/50 ${canEdit ? 'cursor-pointer' : ''}`}
                                data-testid={`registry-value-${rowKey}`}
                                onDoubleClick={() => { if (canEdit) onEdit(v); }}
                            >
                                <td className="py-1.5 pl-3 pr-1 font-mono break-all align-top">
                                    {displayValueName(v.name)}
                                </td>
                                <td className="py-1.5 px-1.5 align-top" title={typeLabel(v.type)}>
                                    <span className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] ${typeBadgeClass(v.type)}`}>
                                        {v.type}
                                    </span>
                                </td>
                                <td className="py-1.5 px-1.5 font-mono break-all align-top">
                                    {v.readError ? (
                                        <span className="text-yellow-500">
                                            (não foi possível ler: {v.readError})
                                        </span>
                                    ) : (
                                        <ValueCell entry={v} />
                                    )}
                                </td>
                                <td className="whitespace-nowrap py-1.5 pl-1 pr-3 text-right align-top">
                                    {onCopy && !v.readError && (
                                        <button
                                            type="button"
                                            className="mr-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted hover:bg-surface hover:text-foreground disabled:opacity-40"
                                            onClick={() => onCopy(v)}
                                            disabled={busy}
                                            title="Copiar dado"
                                            aria-label={`Copiar ${displayValueName(v.name)}`}
                                        >
                                            Copiar
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="rounded border border-border px-1.5 py-0.5 text-[11px] hover:bg-surface disabled:opacity-40"
                                        onClick={() => onEdit(v)}
                                        disabled={!canEdit}
                                        title={
                                            !editable
                                                ? 'Este tipo não pode ser editado como texto.'
                                                : !writable
                                                    ? denyReason
                                                    : undefined
                                        }
                                    >
                                        Editar
                                    </button>
                                    <button
                                        type="button"
                                        className="ml-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-danger hover:bg-danger/10 disabled:opacity-40"
                                        onClick={() => onDelete(v.name)}
                                        disabled={!writable || busy}
                                        title={!writable ? denyReason : undefined}
                                    >
                                        Excluir
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

/**
 * Célula do dado, com a representação auxiliar por tipo.
 */
function ValueCell({ entry }: { entry: RegistryValueEntry }) {
    const isNumeric = entry.type === 'REG_DWORD' || entry.type === 'REG_QWORD';
    const isBinary = entry.type === 'REG_BINARY' || entry.type === 'REG_NONE';

    return (
        <>
            <span>{formatValueForDisplay(entry)}</span>
            {isNumeric && (
                <span className="ml-2 text-[11px] text-muted">
                    {toHexDisplay(entry.data, hexWidthForType(entry.type))}
                </span>
            )}
            {isBinary && (
                <>
                    {base64ToHexPreview(entry.data) && (
                        <div className="mt-0.5 text-[11px] text-muted">
                            hex: {base64ToHexPreview(entry.data)}
                        </div>
                    )}
                    <div className="mt-0.5 text-[11px] text-muted">
                        {base64ByteLength(entry.data)} bytes
                    </div>
                </>
            )}
            {entry.type === 'REG_MULTI_SZ' && (entry.stringList?.length ?? 0) > 0 && (
                <div className="mt-0.5 text-[11px] text-muted">
                    {entry.stringList!.length} item(ns)
                </div>
            )}
        </>
    );
}

export default RegistryValueGrid;
