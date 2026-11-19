import { useEffect, useMemo, useState } from 'react';
import type { RegistryValueEntry, RegistryValueType } from './registryTypes';
import {
    displayValueName,
    hexWidthForType,
    joinMultiString,
    splitMultiString,
    toHexDisplay,
    typeLabel,
    validateValueInput,
} from './registryFormat';

// ─────────────────────────────────────────────────────────────────────────────
// MODAL DE EDIÇÃO/CRIAÇÃO DE VALOR
//
// Toda mutação passa por aqui. O componente NÃO envia nada sozinho: ele monta o
// valor e chama onConfirm, que é quem dispara o NATS. Isso mantém a confirmação
// como um passo explícito e testável — e permite testar o comportamento de
// "não confirma → não envia" sem mockar o NATS.
//
// Contexto HKCU: o hive é o do agente (SYSTEM). O aviso fica visível no modal
// porque é o último ponto antes de gravar.
// ─────────────────────────────────────────────────────────────────────────────

export interface RegistryValueEditorProps {
    /** Caminho completo para exibição e descrição do impacto. */
    keyPath: string;
    /** Valor existente (edição) ou null (criação). */
    existing: RegistryValueEntry | null;
    /** Nome sugerido na criação. */
    initialName?: string;
    /** Chamado só quando o operador confirma explicitamente. */
    onConfirm: (payload: {
        name: string;
        type: RegistryValueType;
        data: string;
        confirmed: true;
    }) => void;
    onCancel: () => void;
    busy?: boolean;
    /** Erro vindo do agente (ex.: chave protegida). */
    error?: string | null;
}

const CREATABLE_TYPES: RegistryValueType[] = [
    'REG_SZ', 'REG_EXPAND_SZ', 'REG_DWORD', 'REG_QWORD', 'REG_MULTI_SZ', 'REG_BINARY',
];

export function RegistryValueEditor({
    keyPath,
    existing,
    initialName = '',
    onConfirm,
    onCancel,
    busy = false,
    error = null,
}: RegistryValueEditorProps) {
    const [name, setName] = useState(existing?.name ?? initialName);
    const [type, setType] = useState<RegistryValueType>(existing?.type ?? 'REG_SZ');
    // StringList é o canal canônico do MULTI_SZ; o resto usa um único campo.
    const [text, setText] = useState(existing?.data ?? '');
    const [items, setItems] = useState<string[]>(
        existing?.type === 'REG_MULTI_SZ'
            ? (existing.stringList ?? splitMultiString(existing.data))
            : [],
    );

    useEffect(() => {
        setName(existing?.name ?? initialName);
        setType(existing?.type ?? 'REG_SZ');
        setText(existing?.data ?? '');
        setItems(existing?.type === 'REG_MULTI_SZ'
            ? (existing.stringList ?? splitMultiString(existing.data))
            : []);
    }, [existing, initialName]);

    const isMulti = type === 'REG_MULTI_SZ';
    const rawData = isMulti ? joinMultiString(items) : text;

    const validationError = useMemo(
        () => validateValueInput(type, rawData),
        [type, rawData],
    );

    const hexPreview = useMemo(() => {
        if (type !== 'REG_DWORD' && type !== 'REG_QWORD') return '';
        if (validationError) return '';
        return toHexDisplay(rawData, hexWidthForType(type));
    }, [type, rawData, validationError]);

    // Deep link: o operador vê o valor real que será gravado, não o que ele
    // digitou no formato de entrada.
    const preview = useMemo(() => {
        if (isMulti) return items.map((s) => (s === '' ? '(vazio)' : s)).join(' · ');
        return text;
    }, [isMulti, items, text]);

    const canConfirm = !busy && !validationError;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-2xl rounded-lg border border-border bg-surface shadow-xl">
                <div className="border-b border-border px-4 py-3">
                    <h3 className="text-sm font-semibold">
                        {existing ? 'Editar valor' : 'Novo valor'}
                    </h3>
                    <p className="mt-0.5 break-all font-mono text-xs text-muted">
                        {keyPath}
                    </p>
                </div>

                <div className="space-y-3 px-4 py-4">
                    <div>
                        <label className="mb-1 block text-xs font-medium" htmlFor="reg-value-name">
                            Nome do valor
                        </label>
                        <input
                            id="reg-value-name"
                            className="w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="(vazio = valor Padrão da chave)"
                            disabled={busy}
                        />
                        <p className="mt-1 text-[11px] text-muted">
                            Deixe vazio para gravar no valor (Padrão) da chave.
                        </p>
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium" htmlFor="reg-value-type">
                            Tipo
                        </label>
                        <select
                            id="reg-value-type"
                            className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
                            value={type}
                            onChange={(e) => setType(e.target.value as RegistryValueType)}
                            disabled={busy}
                        >
                            {CREATABLE_TYPES.map((t) => (
                                <option key={t} value={t}>{t} — {typeLabel(t)}</option>
                            ))}
                        </select>
                    </div>

                    {isMulti ? (
                        <div>
                            <span className="mb-1 block text-xs font-medium">Itens</span>
                            <div className="space-y-1">
                                {items.map((item, index) => (
                                    <div key={index} className="flex gap-1">
                                        <input
                                            className="flex-1 rounded border border-border bg-background px-2 py-1 font-mono text-xs"
                                            value={item}
                                            onChange={(e) => {
                                                const next = [...items];
                                                next[index] = e.target.value;
                                                setItems(next);
                                            }}
                                            disabled={busy}
                                            aria-label={`Item ${index + 1}`}
                                        />
                                        <button
                                            type="button"
                                            className="rounded border border-border px-2 text-xs hover:bg-background"
                                            onClick={() => setItems(items.filter((_, i) => i !== index))}
                                            disabled={busy}
                                            aria-label={`Remover item ${index + 1}`}
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <button
                                type="button"
                                className="mt-1 rounded border border-border px-2 py-1 text-xs hover:bg-background"
                                onClick={() => setItems([...items, ''])}
                                disabled={busy}
                            >
                                Adicionar item
                            </button>
                        </div>
                    ) : (
                        <div>
                            <label className="mb-1 block text-xs font-medium" htmlFor="reg-value-data">
                                Dado
                            </label>
                            <textarea
                                id="reg-value-data"
                                className="w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs"
                                rows={type === 'REG_BINARY' ? 5 : 3}
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                disabled={busy}
                            />
                            {type === 'REG_BINARY' && (
                                <p className="mt-1 text-[11px] text-muted">Informe o conteúdo em base64.</p>
                            )}
                            {(type === 'REG_DWORD' || type === 'REG_QWORD') && (
                                <p className="mt-1 text-[11px] text-muted">
                                    Aceita decimal ou hexadecimal (0x1F ou 1Fh).
                                </p>
                            )}
                        </div>
                    )}

                    {hexPreview && (
                        <p className="font-mono text-[11px] text-muted">Equivalente: {hexPreview}</p>
                    )}

                    {validationError && (
                        <p className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-400">
                            {validationError}
                        </p>
                    )}

                    {error && (
                        <p className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-400">
                            {error}
                        </p>
                    )}

                    <div className="rounded border border-border bg-background px-2 py-2">
                        <p className="text-[11px] font-medium text-muted">Será gravado</p>
                        <p className="mt-0.5 break-all font-mono text-xs">
                            {displayValueName(name)} = {preview || '(vazio)'}
                        </p>
                    </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
                    <button
                        type="button"
                        className="rounded border border-border px-3 py-1.5 text-xs hover:bg-background"
                        onClick={onCancel}
                        disabled={busy}
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        onClick={() => onConfirm({ name, type, data: rawData, confirmed: true })}
                        // O botão só habilita com dado válido. A validação real é
                        // do agente; esta é conveniência para não gastar um
                        // round-trip com dado que já sabemos inválido.
                        disabled={!canConfirm}
                    >
                        {busy ? 'Gravando…' : 'Gravar valor'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default RegistryValueEditor;
