import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describeProtocolError } from '@/modules/remote-rdp/ironRdpClient';

const RDP_SRC = readFileSync(
  resolve(__dirname, '../../src/modules/remote-rdp/RemoteRdp.tsx'),
  'utf8',
);

/**
 * Ao encerrar a sessão, o canvas continuava exibindo o ÚLTIMO FRAME — dando a
 * impressão de que a conexão seguia viva. Agora um overlay OPACO cobre o
 * canvas sempre que o estado não é 'connected'.
 *
 * O canvas NÃO é desmontado: o IronRDP escreve nele, então ele precisa seguir
 * no DOM. Por isso a limpeza é visual (camada por cima), não estrutural.
 */
describe('limpeza da tela ao encerrar a sessão', () => {
  it('cobre o canvas quando não está conectado', () => {
    expect(RDP_SRC).toContain("ironStatus !== 'connected' &&");
    // Camada absoluta e opaca sobre o canvas.
    expect(RDP_SRC).toContain('absolute inset-0');
    expect(RDP_SRC).toContain('bg-black');
  });

  it('mantém o canvas montado (o IronRDP escreve nele)', () => {
    expect(RDP_SRC).toContain('ref={canvasRef}');
    // Wrapper relativo para posicionar o overlay.
    expect(RDP_SRC).toContain('relative flex-1 min-h-0 w-full');
  });

  it('explica o estado em vez de deixar um retângulo preto mudo', () => {
    expect(RDP_SRC).toContain('overlayState');
    expect(RDP_SRC).toContain('Sessão remota encerrada');
    expect(RDP_SRC).toContain('Falha na sessão RDP');
    expect(RDP_SRC).toContain('Aguardando conexão');
  });

  it('o texto do overlay não duplica o do formulário', () => {
    // Duplicar quebrava getByText nos testes E era redundante na tela.
    const overlayBlock = RDP_SRC.slice(
      RDP_SRC.indexOf('const overlayState'),
      RDP_SRC.indexOf('const tone ='),
    );
    expect(overlayBlock).not.toMatch(/Informe as credenciais/i);
  });
});

/**
 * Sessão derrubada por outra conexão com a MESMA conta (o Windows permite uma
 * sessão remota por usuário). A mensagem crua é longa e em inglês.
 */
describe('erro de sessão derrubada por outra conexão', () => {
  const real =
    '[Protocol independent error] Another user connected to the server, forcing the disconnection of the current connection';

  it('traduz para texto acionável em português', () => {
    const msg = describeProtocolError(real);
    expect(msg).toBeTruthy();
    expect(msg).toContain('Outra conexão');
    expect(msg).toContain('UMA sessão remota por usuário');
    expect(msg).not.toContain('Protocol independent');
  });

  it('não interfere em erros de outra natureza', () => {
    expect(describeProtocolError('Connection refused')).toBeNull();
    expect(describeProtocolError('STATUS_LOGON_FAILURE')).toBeNull();
    expect(describeProtocolError('')).toBeNull();
  });
});
