// ─────────────────────────────────────────────────────────────────────────────
// Tipos do contrato do editor de Registro.
//
// Espelham os DTOs do agente (Discovery/src/app/core/winregistry/types.go) e a
// resposta de SessionRegistry. Manter os nomes idênticos evita uma camada de
// tradução que só criaria oportunidade de divergência.
// ─────────────────────────────────────────────────────────────────────────────

/** Tipos canônicos do Windows (a grafia que o agente envia). */
export type RegistryValueType =
    | 'REG_SZ'
    | 'REG_EXPAND_SZ'
    | 'REG_DWORD'
    | 'REG_QWORD'
    | 'REG_MULTI_SZ'
    | 'REG_BINARY'
    | 'REG_NONE'
    | 'REG_DWORD_BIG_ENDIAN'
    | 'REG_LINK'
    | 'REG_RESOURCE_LIST'
    | 'REG_FULL_RESOURCE_DESCRIPTOR'
    | 'REG_RESOURCE_REQUIREMENTS_LIST';

export type RegistryHive = 'HKLM' | 'HKCU' | 'HKCR' | 'HKU' | 'HKCC';

/** Ordem de exibição da árvore. Espelha CanonicalHives() no agente. */
export const REGISTRY_HIVES: ReadonlyArray<{ hive: RegistryHive; label: string; description: string }> = [
    { hive: 'HKLM', label: 'HKEY_LOCAL_MACHINE', description: 'Configuração da máquina (todos os usuários)' },
    { hive: 'HKCU', label: 'HKEY_CURRENT_USER', description: 'Configuração do usuário do agente (SYSTEM no serviço)' },
    { hive: 'HKCR', label: 'HKEY_CLASSES_ROOT', description: 'Associações de arquivos e registro COM' },
    { hive: 'HKU', label: 'HKEY_USERS', description: 'Perfis de usuários carregados' },
    { hive: 'HKCC', label: 'HKEY_CURRENT_CONFIG', description: 'Perfil de hardware atual' },
] as const;

export interface RegistryValueEntry {
    name: string;
    type: RegistryValueType;
    /** Sempre string — inclusive binário (base64). Ver registryFormat.ts. */
    data: string;
    /**
     * Só para REG_MULTI_SZ. Formato canônico: JSON array (sem perda).
     * A UI aceita também a forma legada separada por newline.
     */
    stringList?: string[];
    /**
     * Preenchido quando o valor EXISTE mas não pôde ser lido (ACL por valor,
     * tipo ilegível, dado corrompido).
     *
     * Sem este campo o valor apareceria como "REG_NONE / vazio" e o operador
     * concluiria que está limpo — quando na verdade a leitura falhou.
     */
    readError?: string;
}

export interface RegistryListPage {
    hive: string;
    path: string;
    subkeys: string[];
    values: RegistryValueEntry[];
    hasMore: boolean;
    nextToken?: string;
    subkeyCount: number;
    valueCount: number;
}

export interface RegistrySubkeyPageResult {
    subkeys: string[];
    hasMore: boolean;
    nextToken?: string;
    subkeyCount?: number;
}

export interface RegistryKeyInfo {
    hive: string;
    path: string;
    subkeyCount: number;
    valueCount: number;
    /** false quando o guard do agente proíbe mutação aqui. */
    writable: boolean;
    /** Motivo da recusa, para exibir ao operador. */
    denyReason?: string;
}

/**
 * Códigos de erro estáveis do agente.
 *
 * A UI decide o que fazer pelo CÓDIGO — nunca casando o texto da mensagem, que
 * é em português e pode mudar. 'protected' mostra aviso de política;
 * 'not_found' oferece criar; 'confirmation_required' é bug de fluxo.
 */
export type RegistryErrorKind =
    | 'bad_request'
    | 'version_unsupported'
    | 'unknown_action'
    | 'invalid_hive'
    | 'invalid_path'
    | 'invalid_type'
    | 'invalid_data'
    | 'protected'
    | 'access_denied'
    | 'key_not_empty'
    | 'not_found'
    | 'value_not_found'
    | 'confirmation_required'
    | 'limit_exceeded'
    | 'internal';

export interface RegistryResponse {
    success: boolean;
    error?: string;
    errorKind?: RegistryErrorKind;
    requestId?: string;
    hive?: string;
    path?: string;
    key?: RegistryKeyInfo;
    page?: RegistryListPage;
    value?: RegistryValueEntry;
    export?: string;
    /** Aviso do agente (ex.: HKCU é a chave do SYSTEM). */
    note?: string;
}

/** Ações aceitas pelo agente. Lista fechada — espelha session_registry.go. */
export type RegistryAction =
    | 'listKey'
    | 'statKey'
    | 'getValue'
    | 'setValue'
    | 'deleteValue'
    | 'createKey'
    | 'deleteKey'
    | 'renameKey'
    | 'export';

/** Versão do protocolo. Precisa bater com registryProtocolVersion no agente. */
export const REGISTRY_PROTOCOL_VERSION = 1;

/** Monta o caminho completo como o operador o lê: "HKLM\\SOFTWARE\\Foo". */
export function fullRegistryPath(hive: string, path: string): string {
    if (!path) return hive;
    return `${hive}\\${path}`;
}

/** Separa um caminho completo em hive + caminho. */
export function splitRegistryPath(full: string): { hive: string; path: string } {
    const trimmed = full.replace(/^\\+/, '').replace(/\\+$/, '');
    const idx = trimmed.indexOf('\\');
    if (idx < 0) return { hive: trimmed.toUpperCase(), path: '' };
    return { hive: trimmed.slice(0, idx).toUpperCase(), path: trimmed.slice(idx + 1) };
}

/** Último componente de um caminho (o "nome" da chave). */
export function lastPathComponent(path: string): string {
    if (!path) return '';
    const idx = path.lastIndexOf('\\');
    return idx < 0 ? path : path.slice(idx + 1);
}

/** Caminho do pai, ou string vazia se já é a raiz do hive. */
export function parentPath(path: string): string {
    if (!path) return '';
    const idx = path.lastIndexOf('\\');
    return idx < 0 ? '' : path.slice(0, idx);
}

/** Junta pai e filho respeitando a raiz do hive. */
export function joinPath(parent: string, child: string): string {
    if (!parent) return child;
    if (!child) return parent;
    return `${parent}\\${child}`;
}

const HIVE_ALIASES: Record<string, RegistryHive> = {
    HKLM: 'HKLM',
    HKEY_LOCAL_MACHINE: 'HKLM',
    HKCU: 'HKCU',
    HKEY_CURRENT_USER: 'HKCU',
    HKCR: 'HKCR',
    HKEY_CLASSES_ROOT: 'HKCR',
    HKU: 'HKU',
    HKEY_USERS: 'HKU',
    HKCC: 'HKCC',
    HKEY_CURRENT_CONFIG: 'HKCC',
};

/**
 * Faz o parse de um caminho digitado ou colado pelo operador
 * (ex.: "Computador\\HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft" ou "HKLM/SOFTWARE").
 */
export function parseUserRegistryPath(raw: string): { hive: RegistryHive; path: string } | null {
    let cleaned = raw.trim().replace(/\//g, '\\').replace(/\\+/g, '\\');
    cleaned = cleaned.replace(/^\\+/, '').replace(/\\+$/, '');
    if (!cleaned) return null;

    // Remove prefixos opcionais do regedit ("Computer\" ou "Computador\").
    cleaned = cleaned.replace(/^(?:Computer|Computador)\\/i, '');
    cleaned = cleaned.replace(/^\\+/, '').replace(/\\+$/, '');
    if (!cleaned) return null;

    const idx = cleaned.indexOf('\\');
    const rawHive = (idx < 0 ? cleaned : cleaned.slice(0, idx)).toUpperCase();
    const hive = HIVE_ALIASES[rawHive];
    if (!hive) return null;

    const rest = idx < 0 ? '' : cleaned.slice(idx + 1).replace(/^\\+/, '').replace(/\\+$/, '');
    return { hive, path: rest };
}
