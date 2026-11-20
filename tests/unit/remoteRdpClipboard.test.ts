import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CLIENT_SRC = readFileSync(
  resolve(__dirname, '../../src/modules/remote-rdp/ironRdpClient.ts'),
  'utf8',
);
const RDP_SRC = readFileSync(
  resolve(__dirname, '../../src/modules/remote-rdp/RemoteRdp.tsx'),
  'utf8',
);
const SESSION_SRC = readFileSync(
  resolve(__dirname, '../../src/pages/agents/RemoteSession.tsx'),
  'utf8',
);

/**
 * Área de transferência BIDIRECIONAL entre o Windows remoto e o navegador.
 *
 * O CLIPRDR do RDP é o canal: o IronRDP expõe os dois sentidos por callbacks
 * distintos e a implementação de referência cobre só um deles.
 *
 *   remoto -> navegador: remoteClipboardChangedCallback -> clipboard.writeText
 *   navegador -> remoto: forceClipboardUpdateCallback -> readText -> onClipboardPaste
 *
 * O navegador pode BLOQUEAR as duas operações (permissão / aba sem foco), então
 * nenhuma falha pode derrubar a sessão.
 */
describe('clipboard bidirecional', () => {
  it('registra os dois callbacks do CLIPRDR', () => {
    expect(CLIENT_SRC).toContain('remoteClipboardChangedCallback(');
    expect(CLIENT_SRC).toContain('forceClipboardUpdateCallback(');
  });

  it('direção remoto -> navegador escreve no clipboard local', () => {
    expect(CLIENT_SRC).toContain('navigator.clipboard.writeText(text)');
  });

  it('direção navegador -> remoto lê o clipboard local e envia', () => {
    expect(CLIENT_SRC).toContain('navigator.clipboard.readText()');
    expect(CLIENT_SRC).toContain('session.onClipboardPaste(data)');
    expect(CLIENT_SRC).toContain('data.addText(');
  });

  it('filtra apenas conteúdo de texto (CLIPRDR manda text/plain)', () => {
    expect(CLIENT_SRC).toContain(".startsWith('text/')");
  });

  it('não deixa falha de clipboard derrubar a sessão', () => {
    // Sem Clipboard API (contexto não seguro) o código reporta e segue.
    expect(CLIENT_SRC).toContain("notify?.('toLocal', false");
    expect(CLIENT_SRC).toContain("notify?.('toRemote', false");
    // Na falha de leitura envia clipboard VAZIO: destrava o canal em vez de
    // deixar o remoto esperando (comportamento da referência).
    expect(CLIENT_SRC).toContain("await send('')");
  });

  it('a sessão fica disponível aos callbacks registrados antes do connect', () => {
    // Os callbacks são setados no builder ANTES de existir sessão.
    expect(CLIENT_SRC).toContain('sessionRef.current = session');
    expect(CLIENT_SRC).toContain('sessionRef.current = null');
  });

  it('a UI informa quando o navegador bloqueia o clipboard', () => {
    // O aviso é RENDERIZADO no rodapé unificado do pai; o viewer só notifica.
    expect(RDP_SRC).toContain('onClipboardState');
    expect(RDP_SRC).toContain('onClipboard');
    expect(RDP_SRC).toContain('bloqueou a LEITURA');
    expect(SESSION_SRC).toContain('rdpClipboardNote');
    expect(SESSION_SRC).toContain('Área de transferência sincronizada');
  });
});
