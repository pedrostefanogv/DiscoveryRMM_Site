import { describe, it, expect } from 'vitest';
import { parseUserRegistryPath } from './registryTypes';
import {
    base64ByteLength,
    base64ToHexPreview,
    describeErrorKind,
    describeMutation,
    displayValueName,
    formatValueForDisplay,
    hasNewlineInItem,
    hexToDecimal,
    isEditableType,
    hexWidthForType,
    joinMultiString,
    parseIntegerInput,
    splitMultiString,
    toHexDisplay,
    typeLabel,
    validateValueInput,
} from './registryFormat';
import type { RegistryValueEntry, RegistryValueType } from './registryTypes';

describe('registryFormat — tipos e editabilidade', () => {
    it('marca como editáveis apenas os tipos com representação textual segura', () => {
        const editable: RegistryValueType[] = [
            'REG_SZ', 'REG_EXPAND_SZ', 'REG_DWORD', 'REG_QWORD', 'REG_MULTI_SZ', 'REG_BINARY',
        ];
        for (const type of editable) {
            expect(isEditableType(type), type).toBe(true);
        }
    });

    it('bloqueia edição de estruturas binárias com formato interno próprio', () => {
        // Editar ResourceList/FullResourceDescriptor como texto corromperia a
        // estrutura que o SO espera ler.
        const notEditable: RegistryValueType[] = [
            'REG_RESOURCE_LIST', 'REG_FULL_RESOURCE_DESCRIPTOR',
            'REG_RESOURCE_REQUIREMENTS_LIST', 'REG_LINK', 'REG_NONE',
        ];
        for (const type of notEditable) {
            expect(isEditableType(type), type).toBe(false);
        }
    });

    it('rotula o valor de nome vazio como (Padrão)', () => {
        // O registro armazena o valor default com nome vazio; mostrar "" na
        // tabela pareceria um bug para o operador.
        expect(displayValueName('')).toBe('(Padrão)');
        expect(displayValueName('MeuValor')).toBe('MeuValor');
    });

    it('produz rótulo legível para cada tipo', () => {
        expect(typeLabel('REG_DWORD')).toBe('DWORD (32 bits)');
        expect(typeLabel('REG_QWORD')).toBe('QWORD (64 bits)');
        expect(typeLabel('REG_MULTI_SZ')).toBe('Lista de strings');
    });
});

describe('registryFormat — exibição de valor', () => {
    const entry = (over: Partial<RegistryValueEntry>): RegistryValueEntry => ({
        name: 'v', type: 'REG_SZ', data: '', ...over,
    });

    it('mostra string sem expandir variáveis de ambiente', () => {
        // Exibir %SystemRoot% expandido esconderia o que está REALMENTE gravado
        // — e é exatamente isso que o operador precisa conferir.
        expect(formatValueForDisplay(entry({ type: 'REG_EXPAND_SZ', data: '%SystemRoot%\\System32' })))
            .toBe('%SystemRoot%\\System32');
    });

    it('mostra DWORD e QWORD como decimal exato', () => {
        expect(formatValueForDisplay(entry({ type: 'REG_DWORD', data: '4294967295' }))).toBe('4294967295');
        // 2^64-1: só é exato porque o dado trafega como string.
        expect(formatValueForDisplay(entry({ type: 'REG_QWORD', data: '18446744073709551615' })))
            .toBe('18446744073709551615');
    });

    it('usa stringList para MULTI_SZ preservando item vazio', () => {
        const result = formatValueForDisplay(entry({
            type: 'REG_MULTI_SZ',
            data: 'a\n\nb',
            stringList: ['a', '', 'b'],
        }));
        expect(result).toBe('a · (vazio) · b');
    });

    it('trunca binário longo em vez de despejar megabytes na célula', () => {
        const long = 'A'.repeat(200);
        const result = formatValueForDisplay(entry({ type: 'REG_BINARY', data: long }), 32);
        expect(result.startsWith('A'.repeat(32))).toBe(true);
        expect(result).toContain('200 caracteres base64');
    });

    it('não lança para base64 inválido — a UI precisa renderizar mesmo corrompido', () => {
        expect(() => formatValueForDisplay(entry({ type: 'REG_BINARY', data: '!!!nao-base64!!!' }))).not.toThrow();
    });
});

describe('registryFormat — hexadecimal (precisão)', () => {
    it('converte DWORD para hex com 8 dígitos', () => {
        expect(toHexDisplay('255', 32)).toBe('0x000000FF');
        expect(toHexDisplay('4294967295', 32)).toBe('0xFFFFFFFF');
        expect(toHexDisplay('0', 32)).toBe('0x00000000');
    });

    it('converte QWORD para hex com 16 dígitos', () => {
        // QWORD tem largura própria: preencher com 8 dígitos daria um hex
        // inconsistente entre valores do mesmo tipo.
        expect(toHexDisplay('9007199254740993', 64)).toBe('0x0020000000000001');
        expect(toHexDisplay('18446744073709551615', 64)).toBe('0xFFFFFFFFFFFFFFFF');
        expect(toHexDisplay('1', 64)).toBe('0x0000000000000001');
    });

    it('converte QWORD acima de 2^53 SEM perder precisão', () => {
        // Este é o teste que justifica BigInt: com Number, 9007199254740993
        // viraria 9007199254740992 e o operador leria um valor errado.
        expect(toHexDisplay('9007199254740993', 64)).toBe('0x0020000000000001');
    });

    it('não trunca valor que excede a largura do tipo', () => {
        // Se o dado veio corrompido e é maior que o tipo, exibir inteiro é a
        // informação útil — truncar esconderia o problema.
        expect(toHexDisplay('18446744073709551615', 32)).toBe('0xFFFFFFFFFFFFFFFF');
    });

    it('escolhe a largura pela tipo do valor', () => {
        expect(hexWidthForType('REG_DWORD')).toBe(32);
        expect(hexWidthForType('REG_QWORD')).toBe(64);
        expect(hexWidthForType('REG_SZ')).toBe(32);
    });

    it('devolve vazio para entrada não numérica em vez de lançar', () => {
        expect(toHexDisplay('abc')).toBe('');
        expect(toHexDisplay('')).toBe('');
        expect(toHexDisplay('-1')).toBe('');
    });

    it('converte hex para decimal exato', () => {
        expect(hexToDecimal('0x1F')).toBe('31');
        expect(hexToDecimal('1F')).toBe('31');
        expect(hexToDecimal('1fh')).toBe('31');
        expect(hexToDecimal('0xFFFFFFFFFFFFFFFF')).toBe('18446744073709551615');
    });

    it('devolve vazio para hex inválido', () => {
        expect(hexToDecimal('0xZZ')).toBe('');
        expect(hexToDecimal('')).toBe('');
    });
});

describe('registryFormat — parse de inteiro', () => {
    it('aceita decimal e hexadecimal dentro do limite', () => {
        expect(parseIntegerInput('15', 32)).toBe('15');
        expect(parseIntegerInput('0x1F', 32)).toBe('31');
        expect(parseIntegerInput('1Fh', 32)).toBe('31');
        expect(parseIntegerInput(' 42 ', 32)).toBe('42');
    });

    it('aceita os limites exatos de 32 e 64 bits', () => {
        expect(parseIntegerInput('4294967295', 32)).toBe('4294967295');
        expect(parseIntegerInput('18446744073709551615', 64)).toBe('18446744073709551615');
    });

    it('recusa valor acima do limite do tipo', () => {
        // Gravar 4294967296 num DWORD truncaria silenciosamente.
        expect(parseIntegerInput('4294967296', 32)).toBeNull();
        expect(parseIntegerInput('18446744073709551616', 64)).toBeNull();
    });

    it('recusa negativo (DWORD/QWORD são sem sinal no registro)', () => {
        // Aceitar "-1" gravaria 0xFFFFFFFF, que pode não ser a intenção.
        expect(parseIntegerInput('-1', 32)).toBeNull();
        expect(parseIntegerInput('-100', 64)).toBeNull();
    });

    it('recusa lixo em vez de coagir para 0', () => {
        // Gravar 0 onde o operador digitou lixo é um bug silencioso.
        for (const bad of ['', '  ', 'abc', '12abc', '1.5', '0x', 'h']) {
            expect(parseIntegerInput(bad, 32), bad).toBeNull();
        }
    });
});

describe('registryFormat — validação antes do envio', () => {
    it('aceita DWORD válido e rejeita inválido com mensagem útil', () => {
        expect(validateValueInput('REG_DWORD', '255')).toBeNull();
        const err = validateValueInput('REG_DWORD', '99999999999');
        expect(err).not.toBeNull();
        expect(err).toContain('4294967295');
    });

    it('valida base64 de binário', () => {
        expect(validateValueInput('REG_BINARY', 'AAECAw==')).toBeNull();
        expect(validateValueInput('REG_BINARY', '')).toBeNull();
        expect(validateValueInput('REG_BINARY', 'não é base64!!')).not.toBeNull();
    });

    it('recusa edição de tipo não editável', () => {
        expect(validateValueInput('REG_RESOURCE_LIST', 'qualquer')).not.toBeNull();
    });

    it('aceita strings livres, inclusive vazia', () => {
        expect(validateValueInput('REG_SZ', '')).toBeNull();
        expect(validateValueInput('REG_SZ', 'qualquer texto com acento e emoji 🚀')).toBeNull();
    });
});

describe('registryFormat — MULTI_SZ', () => {
    it('junta e divide preservando item vazio', () => {
        const items = ['primeiro', '', 'terceiro'];
        const joined = joinMultiString(items);
        // Formato JSON, não "\n"-separado: ver o teste de newline abaixo.
        expect(joined).toBe('["primeiro","","terceiro"]');
        expect(splitMultiString(joined)).toEqual(items);
    });

    it('preserva item que CONTÉM newline literal', () => {
        // Este é o caso que motivou o formato JSON. Com o separador "\n" o item
        // "linha1\nlinha2" seria silenciosamente dividido em dois — perda de
        // dado sem erro visível.
        const items = ['linha1\nlinha2', 'segundo'];
        const joined = joinMultiString(items);
        const back = splitMultiString(joined);
        expect(back).toEqual(items);
        expect(back).toHaveLength(2);
    });

    it('lista vazia e string vazia produzem resultado coerente', () => {
        expect(splitMultiString('')).toEqual([]);
        expect(joinMultiString([])).toBe('[]');
    });

    it('aceita a forma legada separada por newline', () => {
        // Compatibilidade com uma resposta de agente ainda não atualizado.
        expect(splitMultiString('a\nb\nc')).toEqual(['a', 'b', 'c']);
    });

    it('não lança para JSON inválido — cai no formato legado', () => {
        // A UI precisa renderizar mesmo um valor corrompido.
        expect(() => splitMultiString('[nao-e-json')).not.toThrow();
        expect(splitMultiString('[nao-e-json')).toEqual(['[nao-e-json']);
    });

    it('detecta newline literal num item (não representável no canal)', () => {
        expect(hasNewlineInItem(['ok', 'com\nquebra'])).toBe(true);
        expect(hasNewlineInItem(['ok', 'sem quebra'])).toBe(false);
    });
});

describe('registryFormat — base64', () => {
    it('gera prévia hexadecimal', () => {
        // "AAECAw==" = bytes 00 01 02 03
        expect(base64ToHexPreview('AAECAw==')).toBe('00 01 02 03');
    });

    it('trunca a prévia e informa o total', () => {
        const many = btoa('\x00'.repeat(40));
        const preview = base64ToHexPreview(many, 4);
        expect(preview).toContain('40 bytes');
    });

    it('devolve vazio para base64 inválido em vez de lançar', () => {
        expect(base64ToHexPreview('!!!')).toBe('');
        expect(base64ByteLength('!!!')).toBe(0);
    });

    it('conta bytes corretamente', () => {
        expect(base64ByteLength('AAECAw==')).toBe(4);
    });
});

describe('registryFormat — descrição de erro por código', () => {
    it('distingue "sem permissão" de "bloqueado por política"', () => {
        // A distinção é o ponto: 'protected' é uma decisão de política que o
        // operador não contorna; 'access_denied' é falta de privilégio do SO.
        // Misturar os dois faz o operador procurar a denylist quando o problema
        // é elevação.
        const policy = describeErrorKind('protected');
        const acl = describeErrorKind('access_denied');
        expect(policy).not.toBe(acl);
        expect(policy).toContain('política');
        expect(acl).toContain('privilégio');
    });

    it('orienta a ação em cada código', () => {
        expect(describeErrorKind('not_found')).toContain('não existe');
        expect(describeErrorKind('invalid_hive')).toContain('HKLM');
        expect(describeErrorKind('limit_exceeded')).toContain('subárvore menor');
        expect(describeErrorKind('key_not_empty')).toContain('recursiva');
        expect(describeErrorKind('version_unsupported')).toContain('Atualize o agente');
    });

    it('cai no fallback para código desconhecido', () => {
        expect(describeErrorKind('codigo_novo_do_futuro', 'mensagem do agente')).toBe('mensagem do agente');
        expect(describeErrorKind(undefined, 'mensagem do agente')).toBe('mensagem do agente');
        expect(describeErrorKind(undefined)).toBe('Falha na operação.');
    });
});

describe('registryFormat — descrição de mutação para confirmação', () => {
    it('deixa explícito quando a operação APAGA', () => {
        // Um "Tem certeza?" genérico não comunica que a operação é destrutiva.
        expect(describeMutation('deleteValue', 'HKLM\\SOFTWARE\\X')).toContain('EXCLUIR');
        expect(describeMutation('deleteKey', 'HKLM\\SOFTWARE\\X')).toContain('EXCLUIR');
    });

    it('descreve criação e gravação sem alarme falso', () => {
        expect(describeMutation('createKey', 'HKLM\\SOFTWARE\\X')).toContain('Criar');
        expect(describeMutation('setValue', 'HKLM\\SOFTWARE\\X\\v')).toContain('Gravar');
    });

    it('anexa o detalhe quando informado', () => {
        const msg = describeMutation('setValue', 'alvo', 'Valor anterior: 1');
        expect(msg).toContain('Valor anterior: 1');
    });
});

describe('registryTypes — parseUserRegistryPath', () => {
    it('aceita abreviações e nomes longos de hive', () => {
        expect(parseUserRegistryPath('HKLM\\SOFTWARE\\Microsoft')).toEqual({ hive: 'HKLM', path: 'SOFTWARE\\Microsoft' });
        expect(parseUserRegistryPath('HKEY_LOCAL_MACHINE\\SOFTWARE')).toEqual({ hive: 'HKLM', path: 'SOFTWARE' });
        expect(parseUserRegistryPath('hkey_current_user\\Environment')).toEqual({ hive: 'HKCU', path: 'Environment' });
        expect(parseUserRegistryPath('HKEY_CLASSES_ROOT')).toEqual({ hive: 'HKCR', path: '' });
        expect(parseUserRegistryPath('HKEY_USERS\\.DEFAULT')).toEqual({ hive: 'HKU', path: '.DEFAULT' });
        expect(parseUserRegistryPath('HKEY_CURRENT_CONFIG\\System')).toEqual({ hive: 'HKCC', path: 'System' });
    });

    it('remove prefixo Computador/Computer, espaços e normaliza barras', () => {
        expect(parseUserRegistryPath('  Computador\\HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies  ')).toEqual({
            hive: 'HKLM',
            path: 'SOFTWARE\\Policies',
        });
        expect(parseUserRegistryPath('Computer/HKLM//SOFTWARE///Teste/')).toEqual({
            hive: 'HKLM',
            path: 'SOFTWARE\\Teste',
        });
    });

    it('retorna null para caminhos vazios ou hives inválidos', () => {
        expect(parseUserRegistryPath('')).toBeNull();
        expect(parseUserRegistryPath('   ')).toBeNull();
        expect(parseUserRegistryPath('Computador\\')).toBeNull();
        expect(parseUserRegistryPath('HKEY_INVALID\\SOFTWARE')).toBeNull();
    });
});
