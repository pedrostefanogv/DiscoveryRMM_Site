import type { RegistryValueEntry, RegistryValueType } from './registryTypes';

// ─────────────────────────────────────────────────────────────────────────────
// FORMATAÇÃO E PARSE DE VALORES DO REGISTRO
//
// Funções PURAS (sem React, sem NATS): é aqui que mora a corretude de exibição,
// e é o que os testes cobrem diretamente.
//
// Regra que guia o arquivo: o protocolo carrega TODO dado como string, inclusive
// numérico. Isso é deliberado — um REG_QWORD pode chegar a 2^64-1, e o número do
// JavaScript perde precisão acima de 2^53. Converter para number em qualquer
// ponto do caminho transformaria silenciosamente 9007199254740993 em
// 9007199254740992. Por isso os valores numéricos são tratados como STRING, e
// a única conversão é para EXIBIÇÃO (hex, separadores), nunca para cálculo.
// ─────────────────────────────────────────────────────────────────────────────

/** Tipos que a UI pode editar. Espelha ValueType.IsEditable() no agente. */
const EDITABLE_TYPES: ReadonlySet<RegistryValueType> = new Set<RegistryValueType>([
    'REG_SZ',
    'REG_EXPAND_SZ',
    'REG_DWORD',
    'REG_QWORD',
    'REG_MULTI_SZ',
    'REG_BINARY',
]);

/**
 * Tipos somente-leitura na UI: estruturas binárias com formato interno próprio.
 * Editar como texto as corromperia — o dado continua visível.
 */
export function isEditableType(type: RegistryValueType): boolean {
    return EDITABLE_TYPES.has(type);
}

/** Rótulo curto para a coluna "Tipo". */
export function typeLabel(type: RegistryValueType): string {
    switch (type) {
        case 'REG_SZ': return 'String';
        case 'REG_EXPAND_SZ': return 'String expansível';
        case 'REG_DWORD': return 'DWORD (32 bits)';
        case 'REG_QWORD': return 'QWORD (64 bits)';
        case 'REG_MULTI_SZ': return 'Lista de strings';
        case 'REG_BINARY': return 'Binário';
        case 'REG_NONE': return 'Sem tipo';
        case 'REG_DWORD_BIG_ENDIAN': return 'DWORD (big-endian)';
        case 'REG_LINK': return 'Link simbólico';
        case 'REG_RESOURCE_LIST': return 'Lista de recursos';
        case 'REG_FULL_RESOURCE_DESCRIPTOR': return 'Descritor de recurso';
        case 'REG_RESOURCE_REQUIREMENTS_LIST': return 'Requisitos de recurso';
        default: return type;
    }
}

/** O valor "(Default)" é armazenado com nome vazio no registro. */
export function displayValueName(name: string): string {
    return name === '' ? '(Padrão)' : name;
}

/**
 * Converte um DWORD/QWORD decimal em hexadecimal para exibição.
 *
 * Não usa Number: um QWORD acima de 2^53 perderia precisão. A conversão é feita
 * por BigInt, que é exato — e o resultado volta como string.
 *
 * `bits` controla o preenchimento: DWORD tem 8 dígitos (0x000000FF), QWORD tem
 * 16 (0x0020000000000001). Preencher QWORD com 8 dígitos daria um hex de largura
 * inconsistente entre valores do mesmo tipo — o operador compara colunas.
 */
export function toHexDisplay(decimal: string, bits: 32 | 64 = 32): string {
    const trimmed = decimal.trim();
    if (!/^\d+$/.test(trimmed)) return '';
    try {
        const value = BigInt(trimmed);
        const width = bits === 32 ? 8 : 16;
        let hex = value.toString(16).toUpperCase();
        // Um valor que não cabe na largura do tipo é exibido inteiro (sem
        // truncar): truncar esconderia que o dado é maior que o esperado, o que
        // é justamente a informação útil em caso de valor corrompido.
        if (hex.length < width) hex = hex.padStart(width, '0');
        return '0x' + hex;
    } catch {
        return '';
    }
}

/** Largura em bits de um tipo numérico, para o preenchimento do hex. */
export function hexWidthForType(type: RegistryValueType): 32 | 64 {
    return type === 'REG_QWORD' ? 64 : 32;
}

/** Converte hexadecimal ('0x1F' ou '1F') em decimal, exato (BigInt). */
export function hexToDecimal(hex: string): string {
    const cleaned = hex.trim().replace(/^0[xX]/, '').replace(/h$/i, '');
    if (!/^[0-9a-fA-F]+$/.test(cleaned)) return '';
    try {
        return BigInt('0x' + cleaned).toString(10);
    } catch {
        return '';
    }
}

/**
 * Texto de exibição do valor, por tipo.
 *
 * Regras:
 *  - REG_SZ / REG_EXPAND_SZ: o texto como está (a UI mostra o valor real; um
 *    REG_EXPAND_SZ é exibido SEM expandir as variáveis, porque expandir
 *    esconderia o que está gravado).
 *  - REG_DWORD / REG_QWORD: decimal (a coluna auxiliar mostra hex).
 *  - REG_MULTI_SZ: usa stringList quando presente — preserva string vazia no meio.
 *  - REG_BINARY e desconhecidos: base64 truncado para exibição.
 */
export function formatValueForDisplay(entry: RegistryValueEntry, maxBinaryChars = 64): string {
    switch (entry.type) {
        case 'REG_SZ':
        case 'REG_EXPAND_SZ':
        case 'REG_LINK':
            return entry.data;
        case 'REG_DWORD':
        case 'REG_QWORD':
        case 'REG_DWORD_BIG_ENDIAN':
            return entry.data;
        case 'REG_MULTI_SZ': {
            const list = entry.stringList ?? (entry.data === '' ? [] : entry.data.split('\n'));
            return list.map((s) => (s === '' ? '(vazio)' : s)).join(' · ');
        }
        case 'REG_BINARY':
        case 'REG_NONE':
        default: {
            const data = entry.data ?? '';
            if (data.length <= maxBinaryChars) return data;
            return `${data.slice(0, maxBinaryChars)}… (${data.length} caracteres base64)`;
        }
    }
}

/**
 * Prévia em hexadecimal de um dado base64 (para REG_BINARY).
 *
 * Devolve string vazia se o base64 for inválido, em vez de lançar — a UI precisa
 * renderizar mesmo um valor corrompido, mostrando o base64 cru.
 */
export function base64ToHexPreview(base64: string, maxBytes = 32): string {
    try {
        const binary = atob(base64);
        const bytes: string[] = [];
        const limit = Math.min(binary.length, maxBytes);
        for (let i = 0; i < limit; i += 1) {
            bytes.push(binary.charCodeAt(i).toString(16).padStart(2, '0'));
        }
        const suffix = binary.length > maxBytes ? ` … (${binary.length} bytes)` : '';
        return bytes.join(' ') + suffix;
    } catch {
        return '';
    }
}

/** Contagem de bytes de um base64 (0 quando inválido). */
export function base64ByteLength(base64: string): number {
    try {
        return atob(base64).length;
    } catch {
        return 0;
    }
}

/**
 * Valida o dado digitado ANTES de enviar ao agente.
 *
 * Devolve mensagem de erro em português, ou null quando válido. Validar no
 * cliente evita a ida-e-volta e dá feedback imediato — mas o agente REVALIDA
 * (DecodeValue), porque validação de cliente nunca é barreira de segurança.
 */
export function validateValueInput(type: RegistryValueType, data: string): string | null {
    switch (type) {
        case 'REG_DWORD': {
            const parsed = parseIntegerInput(data, 32);
            if (parsed === null) return 'Informe um inteiro entre 0 e 4294967295 (decimal ou hexadecimal com 0x).';
            return null;
        }
        case 'REG_QWORD': {
            const parsed = parseIntegerInput(data, 64);
            if (parsed === null) return 'Informe um inteiro entre 0 e 18446744073709551615 (decimal ou hexadecimal com 0x).';
            return null;
        }
        case 'REG_BINARY': {
            if (data.trim() === '') return null;
            const cleaned = data.replace(/\s+/g, '');
            if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned) || cleaned.length % 4 !== 0) {
                return 'Binário deve estar em base64 válido.';
            }
            return null;
        }
        case 'REG_MULTI_SZ':
        case 'REG_SZ':
        case 'REG_EXPAND_SZ':
            return null;
        default:
            return 'Este tipo não pode ser editado.';
    }
}

/**
 * Interpreta um inteiro digitado, aceitando decimal OU hexadecimal (0x/h).
 *
 * Usa BigInt para não perder precisão em QWORD. Recusa negativo: o registro
 * trata DWORD/QWORD como SEM SINAL, e aceitar "-1" gravaria 0xFFFFFFFF — que
 * pode não ser o que o operador quis.
 */
export function parseIntegerInput(raw: string, bits: 32 | 64): string | null {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    if (trimmed.startsWith('-')) return null;

    let value: bigint;
    try {
        if (/^0[xX]/.test(trimmed)) {
            if (!/^0[xX][0-9a-fA-F]+$/.test(trimmed)) return null;
            value = BigInt(trimmed);
        } else if (/h$/i.test(trimmed)) {
            const body = trimmed.slice(0, -1);
            if (!/^[0-9a-fA-F]+$/.test(body)) return null;
            value = BigInt('0x' + body);
        } else {
            if (!/^\d+$/.test(trimmed)) return null;
            value = BigInt(trimmed);
        }
    } catch {
        return null;
    }

    if (value < 0n) return null;
    const max = bits === 32 ? 0xFFFFFFFFn : 0xFFFFFFFFFFFFFFFFn;
    if (value > max) return null;
    return value.toString(10);
}

/**
 * Junta a lista de um REG_MULTI_SZ no formato que o agente espera.
 *
 * Usa **JSON** (["a","b"]) e não "\n"-separado. A razão é correção de dados: um
 * item de MULTI_SZ PODE conter newline literal (o registro permite), e com o
 * separador simples esse item seria dividido em dois na volta — perda silenciosa
 * que só apareceria quando o programa que lê o valor quebrasse.
 *
 * O agente aceita as duas formas (JSON tem precedência), então um viewer
 * antigo que ainda mande "\n" continua funcionando.
 */
export function joinMultiString(items: string[]): string {
    return JSON.stringify(items);
}

/**
 * Divide o Data de um REG_MULTI_SZ em itens.
 *
 * Aceita a forma JSON (canônica) e a forma legada "\n"-separada, para
 * compatibilidade com respostas de um agente ainda não atualizado.
 */
export function splitMultiString(data: string): string[] {
    if (data === '') return [];
    const trimmed = data.trim();
    if (trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                return parsed.map((item) => (typeof item === 'string' ? item : String(item)));
            }
        } catch {
            // JSON inválido: cai no formato legado em vez de lançar — a UI
            // precisa renderizar mesmo um valor corrompido.
        }
    }
    return data.split('\n');
}

/**
 * Detecta newline literal num item.
 *
 * Com o formato JSON isto é apenas informativo (o dado é preservado); existe
 * para a UI poder avisar o operador de que o item tem quebra de linha, o que
 * costuma indicar valor montado por script.
 */
export function hasNewlineInItem(items: string[]): boolean {
    return items.some((item) => item.includes('\n') || item.includes('\r'));
}

/**
 * Traduz o código de erro do agente em orientação acionável para o operador.
 *
 * Por que pelo CÓDIGO e não pela mensagem: a mensagem vem em português e pode
 * mudar; o código é parte do contrato. Além disso, cada código pede uma AÇÃO
 * diferente — "sem permissão" sugere elevação, "não encontrada" sugere criar a
 * chave, "protegida" é uma decisão de política que o operador não contorna pela
 * UI. Um texto genérico ("falha ao abrir") não ajuda em nenhum dos casos.
 */
export function describeErrorKind(kind: string | undefined, fallback?: string): string {
    switch (kind) {
        case 'protected':
            return 'Esta chave é protegida por política e não pode ser acessada nem para leitura.';
        case 'access_denied':
            return 'O agente não tem privilégio nesta chave (ACL do registro). Não é bloqueio de política — é permissão do sistema.';
        case 'key_not_empty':
            return 'A chave contém subchaves ou valores. Use a exclusão recursiva para removê-la.';
        case 'not_found':
            return 'A chave não existe (ou foi removida por outro processo).';
        case 'value_not_found':
            return 'O valor não existe (ou foi removido por outro processo).';
        case 'invalid_hive':
            return 'Hive inválido. Use HKLM, HKCU, HKCR, HKU ou HKCC.';
        case 'invalid_path':
            return 'Caminho inválido: não são aceitos "..", caracteres de controle nem caminhos absolutos.';
        case 'invalid_type':
            return 'Tipo de valor não suportado.';
        case 'invalid_data':
            return 'O dado informado não é válido para o tipo escolhido.';
        case 'confirmation_required':
            return 'A operação exige confirmação explícita (falha de fluxo — reporte este caso).';
        case 'limit_exceeded':
            return 'O resultado excede o limite de tamanho. Exporte uma subárvore menor.';
        case 'version_unsupported':
            return 'O agente não suporta esta versão do protocolo. Atualize o agente.';
        case 'unknown_action':
            return 'Operação desconhecida pelo agente. Atualize o agente ou o console.';
        default:
            return fallback ?? 'Falha na operação.';
    }
}

/**
 * Descreve o impacto de uma mutação, para o modal de confirmação.
 *
 * O operador precisa saber O QUE vai acontecer antes de confirmar — a diferença
 * entre criar uma chave, apagar um valor e apagar uma subárvore inteira é
 * enorme, e um "Tem certeza?" genérico não comunica nada disso.
 */
export function describeMutation(action: string, target: string, detail?: string): string {
    const base = (() => {
        switch (action) {
            case 'setValue':
                return `Gravar o valor em ${target}`;
            case 'deleteValue':
                return `EXCLUIR o valor ${target}`;
            case 'createKey':
                return `Criar a chave ${target}`;
            case 'deleteKey':
                return `EXCLUIR a chave ${target}`;
            case 'renameKey':
                return `Renomear a chave ${target}`;
            default:
                return `Alterar ${target}`;
        }
    })();
    return detail ? `${base}. ${detail}` : base;
}
