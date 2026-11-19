import { useMemo } from 'react';
import type { RegistryValueEntry } from './registryTypes';
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
//
// Problema de layout da versão anterior: a coluna "Dado" ficava espremida e o
// valor longo era cortado, então o operador não conseguia LER o registro
// completo. Aqui a grade usa largura total com colunas de tamanho definido e
// altura fixa por linha, e o valor tem o espaço restante com quebra.
//
// Referência de apresentação (MeshCentral, win-registry-remote.js:81): o valor
// sem nome é exibido como "(Default)". O nome cru vazio continua sendo o que
// trafega no protocolo.
// ─────────────────────────────────────────────────────────────────────────────

export interface RegistryValueGridProps {
    values: RegistryValueEntry[];
    loading: boolean;
    writable: boolean;
    denyReason: string;
    onEdit: (entry: RegistryValueEntry) => void;
    onDelete: (name: string) => void;
    busy?: boolean;
}

/** Largura das colunas fixas. A coluna "Dado" ocupa o resto. */
const COL_NAME = 'min-w-[180px] w-[22%]';
const COL_TYPE = 'min-w-[150px] w-[13%]';

export function RegistryValueGrid({
    values,
    loading,
    writable,
    denyReason,
    onEdit,
    onDelete,
    busy = false,
}: RegistryValueGridProps) {
    const hasUnreadable = useMemo(() => values.some((v) => !!v.readError), [values]);

    if (loading && values.length === 0) {
        return <p className="px-3 py-3 text-xs text-muted">Carregando…</p>;
    }
    if (values.length === 0) {
        return (
            <p className="px-3 py-3 text-xs text-muted">
                Esta chave não tem valores. Use <strong>Novo valor</strong> para criar um.
            </p>
        );
    }

    return (
        <div className="min-h-0 flex-1 overflow-auto">
            {hasUnreadable && (
                <p className="border-b border-yellow-500/30 bg-yellow-500/10 px-3 py-1.5 text-[11px] text-yellow-500">
                    Alguns valores não puderam ser lidos. Eles aparecem marcados abaixo —
                    o conteúdo existe, mas o agente não tem permissão para lê-lo.
                </p>
            )}
            <table className="w-full table-fixed border-collapse text-xs leading-tight">
                <thead className="sticky top-0 z-10 bg-surface">
                    <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted">
                        <th className={`py-1 pl-2 pr-1 text-left font-medium ${COL_NAME}`}>Nome</th>
                        <th className={`px-1 py-1 text-left font-medium ${COL_TYPE}`}>Tipo</th>
                        <th className="px-1 py-1 text-left font-medium">Dado</th>
                        <th className="w-[130px] py-1 pl-1 pr-2 text-right font-medium">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    {values.map((v) => {
                        const rowKey = v.name === '' ? '__default__' : v.name;
                        const editable = isEditableType(v.type);
                        return (
                            <tr
                                key={rowKey}
                                className="border-b border-border/40 align-top hover:bg-background"
                                data-testid={`registry-value-${rowKey}`}
                            >
                                <td className="py-1 pl-2 pr-1 font-mono break-all align-top">
                                    {displayValueName(v.name)}
                                </td>
                                <td className="py-1 px-1 align-top text-muted" title={typeLabel(v.type)}>
                                    {v.type}
                                </td>
                                <td className="py-1 px-1 font-mono break-all align-top">
                                    {v.readError ? (
                                        // Nunca mostrar como vazio: o operador
                                        // concluiria que o valor está limpo.
                                        <span className="text-yellow-500">
                                            (não foi possível ler: {v.readError})
                                        </span>
                                    ) : (
                                        <ValueCell entry={v} />
                                    )}
                                </td>
                                <td className="whitespace-nowrap py-1 pl-1 pr-2 text-right align-top">
                                    <button
                                        type="button"
                                        className="rounded border border-border px-1.5 py-0.5 text-[11px] hover:bg-surface disabled:opacity-40"
                                        onClick={() => onEdit(v)}
                                        disabled={!writable || !editable || busy}
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
                                        className="ml-1 rounded border border-border px-1.5 py-0.5 text-[11px] hover:bg-surface disabled:opacity-40"
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
 *
 * O valor principal vem primeiro; a forma alternativa (hex de DWORD/QWORD,
 * prévia hex de binário, contagem de bytes) vem em seguida, discreta. Sem isto
 * o operador não consegue conferir o valor contra o regedit, que mostra as duas.
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
