/**
 * Regressão do contrato de UNIDADES da completação.
 *
 * O agente (Go) conta o cursor e o replacement em RUNAS (code points); o front
 * usa UTF-16 (string.length/slice). Emoji/astral ocupam 2 unidades UTF-16 e 1
 * runa — antes da conversão o replacement era aplicado no meio do par
 * substituto e a linha saía corrompida.
 */
import { describe, expect, it } from 'vitest';
import {
    applyCompletion,
    completionKeystrokes,
    runeIndexToUtf16Index,
    utf16IndexToRuneIndex,
    type CompletionResponse,
} from './terminalInput';

const res = (patch: Partial<CompletionResponse> = {}): CompletionResponse => ({
    reqId: 'r1',
    ok: true,
    replacementIndex: 0,
    replacementLength: 0,
    matches: [{ text: 'abc' }],
    totalCount: 1,
    page: 0,
    pageSize: 50,
    hasMore: false,
    ...patch,
});

describe('utf16IndexToRuneIndex', () => {
    it('string vazia devolve 0', () => {
        expect(utf16IndexToRuneIndex('', 5)).toBe(0);
    });

    it('texto normal (BMP) mantém o índice', () => {
        expect(utf16IndexToRuneIndex('abc', 0)).toBe(0);
        expect(utf16IndexToRuneIndex('abc', 2)).toBe(2);
        expect(utf16IndexToRuneIndex('abc', 3)).toBe(3);
    });

    it('emoji conta 1 runa para 2 unidades UTF-16', () => {
        // 'a😀b' → runas: a, 😀, b ; UTF-16: 4 unidades
        expect(utf16IndexToRuneIndex('a😀b', 1)).toBe(1);
        expect(utf16IndexToRuneIndex('a😀b', 3)).toBe(2);
        expect(utf16IndexToRuneIndex('a😀b', 4)).toBe(3);
    });

    it('astral fora do BMP (U+1F4A9) também conta 1 runa', () => {
        expect(utf16IndexToRuneIndex('x💩y', 3)).toBe(2);
        expect(utf16IndexToRuneIndex('💩💩', 4)).toBe(2);
    });

    it('índice no MEIO de um par substituto arredonda para baixo (não parte o caractere)', () => {
        expect(utf16IndexToRuneIndex('a😀b', 2)).toBe(1);
        expect(utf16IndexToRuneIndex('😀', 1)).toBe(0);
    });

    it('índice negativo ou além do fim é limitado', () => {
        expect(utf16IndexToRuneIndex('abc', -1)).toBe(0);
        expect(utf16IndexToRuneIndex('abc', 99)).toBe(3);
        expect(utf16IndexToRuneIndex('😀', 99)).toBe(1);
    });
});

describe('runeIndexToUtf16Index', () => {
    it('string vazia devolve 0', () => {
        expect(runeIndexToUtf16Index('', 3)).toBe(0);
    });

    it('texto normal mantém o índice', () => {
        expect(runeIndexToUtf16Index('abc', 0)).toBe(0);
        expect(runeIndexToUtf16Index('abc', 2)).toBe(2);
    });

    it('emoji devolve 2 unidades UTF-16 por runa', () => {
        expect(runeIndexToUtf16Index('a😀b', 1)).toBe(1);
        expect(runeIndexToUtf16Index('a😀b', 2)).toBe(3);
        expect(runeIndexToUtf16Index('a😀b', 3)).toBe(4);
    });

    it('índice além do fim devolve o comprimento total', () => {
        expect(runeIndexToUtf16Index('a😀b', 99)).toBe(4);
        expect(runeIndexToUtf16Index('a😀b', -3)).toBe(0);
    });
});

describe('applyCompletion — replacement em RUNAS aplicado em UTF-16', () => {
    it('substitui no lugar certo depois de um emoji (regressão do par substituto)', () => {
        const line = 'echo 😀 ab';
        // runas: e c h o ' ' 😀 ' ' a b → 'ab' começa na runa 7
        const out = applyCompletion(line, line.length, res({ replacementIndex: 7, replacementLength: 2, matches: [{ text: 'abc' }] }), 0);
        expect(out.line).toBe('echo 😀 abc');
        expect(out.cursor).toBe('echo 😀 abc'.length);
        expect(out.match?.text).toBe('abc');
    });

    it('sem a conversão o índice de runa cairia no meio do par (caso antigo corrompido)', () => {
        const line = 'echo 😀 ab';
        // Prova que o índice em UTF-16 7 NÃO é o início de 'ab' (é o espaço
        // antes do par substituto): por isso a conversão é obrigatória.
        expect(line.slice(7)).toBe(' ab');
        const out = applyCompletion(line, line.length, res({ replacementIndex: 9, replacementLength: 0, matches: [{ text: '!' }] }), 0);
        expect(out.line).toBe('echo 😀 ab!');
        expect(out.cursor).toBe(line.length + 1);
    });

    it('texto ASCII continua igual (compatibilidade com o comportamento anterior)', () => {
        const out = applyCompletion('abXYZcd', 5, res({ replacementIndex: 2, replacementLength: 3 }), 0);
        expect(out.line).toBe('ababccd');
        expect(out.cursor).toBe(2 + 'abc'.length);
    });

    it('linha vazia: índice 0 aplica no começo', () => {
        const out = applyCompletion('', 0, res({ replacementIndex: 0, replacementLength: 0, matches: [{ text: 'ls' }] }), 0);
        expect(out.line).toBe('ls');
        expect(out.cursor).toBe(2);
    });

    it('sem replacementIndex usa o cursor convertido para runas', () => {
        const line = 'x😀';
        const out = applyCompletion(
            line,
            line.length,
            res({ replacementIndex: undefined as unknown as number, replacementLength: 0, matches: [{ text: '!' }] }),
            0,
        );
        expect(out.line).toBe('x😀!');
        expect(out.cursor).toBe(line.length + 1);
    });
});

describe('completionKeystrokes — replacementIndex em RUNAS vira deslocamento no cursor', () => {
    const ESC = String.fromCharCode(27);
    const LEFT = ESC + '[D';
    const DEL = ESC + '[3~';

    it('posiciona no início da substituição convertendo runas→UTF-16', () => {
        const line = 'echo 😀 ab';
        // cursor no fim da linha (UTF-16 10); início em runa 7 = UTF-16 8
        const keys = completionKeystrokes(line, line.length, res({ replacementIndex: 7, replacementLength: 2 }), 0);
        expect(keys).toBe(LEFT.repeat(2) + DEL.repeat(2) + 'abc');
    });

    it('cursor antes do início anda para a direita', () => {
        const line = 'a😀b';
        // runa 0 = UTF-16 0; cursor UTF-16 3 (depois do emoji)
        const keys = completionKeystrokes(line, 3, res({ replacementIndex: 0, replacementLength: 1 }), 0);
        expect(keys).toBe(LEFT.repeat(3) + DEL.repeat(1) + 'abc');
    });

    it('linha vazia e índice 0 só digita o texto', () => {
        expect(completionKeystrokes('', 0, res({ replacementIndex: 0, replacementLength: 0 }), 0)).toBe('abc');
    });
});
