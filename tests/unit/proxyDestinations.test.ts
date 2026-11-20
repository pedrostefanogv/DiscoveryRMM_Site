import { describe, expect, it } from 'vitest';
import {
  browsableDestinations,
  buildDestinationUrl,
  hostFromEntry,
} from '@/modules/remote-proxy/proxyDestinations';

/**
 * Testes da derivação de destinos navegáveis a partir da allowlist.
 *
 * Motivação: a barra de navegação do proxy tinha atalhos CHUMBADOS no código
 * ("Roteador" 192.168.1.1, "Router Alt" 192.168.0.1, "Impressora"
 * 192.168.1.100). Apareciam para TODO cliente, mesmo sem esses equipamentos, e
 * clicar neles era bloqueado pela allowlist. Agora as sugestões vêm do cadastro.
 */

describe('hostFromEntry', () => {
  it('usa o próprio endereço para IP avulso', () => {
    const r = hostFromEntry('192.168.10.250');
    expect(r.host).toBe('192.168.10.250');
    expect(r.fromCidr).toBe(false);
  });

  it('sugere o primeiro host utilizável de um CIDR', () => {
    // O .0 de uma /24 é o endereço de rede e não responde; a convenção é .1.
    expect(hostFromEntry('192.168.10.0/24').host).toBe('192.168.10.1');
    expect(hostFromEntry('10.0.0.0/8').host).toBe('10.0.0.1');
    expect(hostFromEntry('172.16.0.0/12').host).toBe('172.16.0.1');
  });

  it('marca sugestões de rede como fromCidr', () => {
    // A UI usa isto para avisar que o endereço é SUGERIDO, não descoberto.
    expect(hostFromEntry('192.168.10.0/24').fromCidr).toBe(true);
    expect(hostFromEntry('192.168.10.250').fromCidr).toBe(false);
  });

  it('/32 e /31 devolvem o próprio endereço', () => {
    expect(hostFromEntry('10.0.0.5/32').host).toBe('10.0.0.5');
    expect(hostFromEntry('10.0.0.4/31').host).toBe('10.0.0.4');
  });

  it('não sugere host para IPv6 em CIDR', () => {
    // Não há convenção de "primeiro host" equivalente que valha sugerir.
    const r = hostFromEntry('fd00::/8');
    expect(r.host).toBeNull();
    expect(r.fromCidr).toBe(true);
  });

  it('rejeita entradas inválidas', () => {
    expect(hostFromEntry('').host).toBeNull();
    expect(hostFromEntry('nao-e-ip').host).toBeNull();
    expect(hostFromEntry('999.1.1.1/24').host).toBeNull();
  });
});

describe('buildDestinationUrl', () => {
  it('omite a porta padrão', () => {
    expect(buildDestinationUrl('10.0.0.1', 80)).toBe('http://10.0.0.1/');
    expect(buildDestinationUrl('10.0.0.1', 443)).toBe('https://10.0.0.1/');
  });

  it('usa http para portas web comuns', () => {
    expect(buildDestinationUrl('10.0.0.1', 8006)).toBe('http://10.0.0.1:8006/');
    expect(buildDestinationUrl('10.0.0.1', 8080)).toBe('http://10.0.0.1:8080/');
  });

  it('usa https para portas tipicamente TLS', () => {
    expect(buildDestinationUrl('10.0.0.1', 8443)).toBe('https://10.0.0.1:8443/');
  });

  it('sem porta usa http', () => {
    expect(buildDestinationUrl('10.0.0.1')).toBe('http://10.0.0.1/');
  });
});

describe('browsableDestinations', () => {
  it('deriva um destino por entrada', () => {
    const out = browsableDestinations({
      mode: 'allowlist',
      entries: [
        { cidr: '192.168.10.0/24', ports: [8006], note: 'Proxmox' },
        { cidr: '10.0.0.5' },
      ],
    });

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ label: 'Proxmox', url: 'http://192.168.10.1:8006/' });
    expect(out[1]).toMatchObject({ label: '10.0.0.5', url: 'http://10.0.0.5/' });
  });

  it('prefere uma porta claramente web', () => {
    // A allowlist pode liberar 22 e 8006 para o mesmo host; abrir em 22 não
    // levaria a lugar nenhum num navegador.
    const out = browsableDestinations({
      mode: 'allowlist',
      entries: [{ cidr: '10.0.0.5', ports: [22, 8006, 443] }],
    });

    expect(out[0].port).toBe(443);
  });

  it('cai para a menor porta quando nenhuma é web', () => {
    const out = browsableDestinations({
      mode: 'allowlist',
      entries: [{ cidr: '10.0.0.5', ports: [3389, 22] }],
    });

    expect(out[0].port).toBe(22);
  });

  it('usa as portas globais quando a entrada não declara nenhuma', () => {
    const out = browsableDestinations({
      mode: 'allowlist',
      entries: [{ cidr: '10.0.0.5' }],
      allowedPorts: [8080],
    });

    expect(out[0].url).toBe('http://10.0.0.5:8080/');
  });

  it('deduplica URLs iguais', () => {
    const out = browsableDestinations({
      mode: 'allowlist',
      entries: [{ cidr: '10.0.0.5' }, { cidr: '10.0.0.5' }],
    });

    expect(out).toHaveLength(1);
  });

  it('devolve vazio no modo open (não há lista cadastrada)', () => {
    // Inventar destinos no modo aberto seria enganoso: nada foi aprovado.
    expect(browsableDestinations({ mode: 'open' })).toEqual([]);
  });

  it('devolve vazio para política ausente ou vazia', () => {
    expect(browsableDestinations(null)).toEqual([]);
    expect(browsableDestinations(undefined)).toEqual([]);
    expect(browsableDestinations({})).toEqual([]);
    expect(browsableDestinations({ mode: 'allowlist', entries: [] })).toEqual([]);
  });

  it('ignora entradas inválidas sem quebrar as demais', () => {
    const out = browsableDestinations({
      mode: 'allowlist',
      entries: [{ cidr: 'invalido' }, { cidr: '10.0.0.5' }],
    });

    expect(out).toHaveLength(1);
    expect(out[0].host).toBe('10.0.0.5');
  });

  it('rotula CIDR como rede quando não há observação', () => {
    const out = browsableDestinations({
      mode: 'allowlist',
      entries: [{ cidr: '192.168.10.0/24' }],
    });

    expect(out[0].label).toContain('rede');
  });
});
