import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentCard, getAgentOsIcon, isAgentWindowsServer, isWindowsServerOs } from './AgentCard';

/**
 * O card do agente exibe o usuário logado no Windows reportado pelo agent,
 * ao lado do Cliente/Site, e lida com o caso sem usuário.
 *
 * Os overrides aceitam qualquer campo do Agent (o helper espalha `...overrides`
 * sobre o objeto base), o que permite sobrescrever `operatingSystem` nos testes
 * do ícone de Windows Server.
 */
function buildAgent(
  overrides: Partial<Parameters<typeof AgentCard>[0]['agent']> = {},
) {
  return {
    id: 'a1',
    clientId: 'c1',
    siteId: 's1',
    hostname: 'PC-01',
    displayName: 'PC-01',
    operatingSystem: 'Windows 11 Pro',
    osVersion: '10.0 (25H2)',
    agentVersion: '1.2.1',
    commitHash: null,
    isOnline: true,
    lastSeen: '2026-01-01T00:00:00Z',
    lastSeenAt: '2026-01-01T00:00:00Z',
    lastIpAddress: '10.0.0.1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    clientName: 'Acme',
    siteName: 'Matriz',
    ...overrides,
  } as Parameters<typeof AgentCard>[0]['agent'];
}

afterEach(() => cleanup());

describe('AgentCard — usuário logado', () => {
  it('exibe o usuário logado reportado', () => {
    render(<AgentCard agent={buildAgent({ loggedUser: String.raw`CORP\pedro` })} now={Date.now()} />);
    expect(screen.getByText(String.raw`CORP\pedro`)).toBeTruthy();
  });

  it('exibe travessão quando não há usuário logado', () => {
    render(<AgentCard agent={buildAgent({ loggedUser: null })} now={Date.now()} />);
    expect(screen.getByText('\u2014')).toBeTruthy();
  });

  it('mostra há quanto tempo a sessão está aberta', () => {
    render(
      <AgentCard
        agent={buildAgent({
          loggedUser: String.raw`CORP\pedro`,
          loggedUserSince: new Date().toISOString(),
        })}
        now={Date.now()}
      />,
    );

    expect(screen.getByText('agora mesmo')).toBeTruthy();
  });

  it('não mostra tempo de sessão quando o agent não reporta o início', () => {
    render(
      <AgentCard
        agent={buildAgent({ loggedUser: String.raw`CORP\pedro`, loggedUserSince: null })}
        now={Date.now()}
      />,
    );

    expect(screen.queryByText('agora mesmo')).toBeNull();
  });
});

/**
 * Detecção e ícone de Windows Server.
 *
 * O card precisa distinguir um servidor Windows de um Windows cliente: os dois
 * caem em "windows" na checagem genérica e acabariam com o mesmo ícone. A
 * detecção hoje é por texto (o backend não expõe campo de edição/tipo de SO),
 * então o risco real a cobrir é o FALSO POSITIVO: "Windows 11 Pro" não pode
 * ser classificado como servidor.
 *
 * O componente Icon não expõe o nome do glifo no DOM, mas cada glifo renderiza
 * um <path d="..."> distinto — por isso a asserção compara o atributo "d".
 */

/**
 * Assinatura do glifo: concatena o "d" de TODOS os <path> do SVG.
 * Alguns glifos (ex.: "storage") têm mais de um path, então comparar só o
 * primeiro path não identifica o ícone de forma confiável.
 */
function iconSignature(container: HTMLElement): string {
  return Array.from(container.querySelectorAll('svg path'))
    .map((p) => p.getAttribute('d') ?? '')
    .join('|');
}

/** Assinatura do glifo renderizado por getAgentOsIcon(os). */
function renderOsIconSignature(os: string | null | undefined): string {
  const { container, unmount } = render(<>{getAgentOsIcon(os)}</>);
  const sig = iconSignature(container);
  unmount();
  return sig;
}

/** O SVG do glifo renderizado por getAgentOsIcon(os), ou null se nada foi renderizado. */
function renderOsIconPath(os: string | null | undefined): string | null {
  const { container, unmount } = render(<>{getAgentOsIcon(os)}</>);
  const path = container.querySelector('svg path');
  const d = path?.getAttribute('d') ?? null;
  unmount();
  return d;
}

describe('isWindowsServerOs', () => {
  it('reconhece edições com ano e edição nomeada', () => {
    const servidores = [
      'Windows Server 2025 Standard',
      'Windows Server 2022 Datacenter',
      'Windows Server 2019 Standard',
      'Windows Server 2016 Datacenter',
      'Windows Server Standard',
      'Windows Server Datacenter',
    ];

    for (const os of servidores) {
      expect(isWindowsServerOs(os), os).toBe(true);
    }
  });

  it('reconhece variações de caixa', () => {
    expect(isWindowsServerOs('windows server 2022 standard')).toBe(true);
    expect(isWindowsServerOs('WINDOWS SERVER 2019 DATACENTER')).toBe(true);
  });

  // O teste mais importante: Windows cliente NÃO pode virar servidor.
  it('não classifica Windows cliente (10/11) como servidor', () => {
    const clientes = [
      'Windows 11 Pro',
      'Windows 10 Enterprise',
      'Windows 11 Pro for Workstations',
    ];

    for (const os of clientes) {
      expect(isWindowsServerOs(os), os).toBe(false);
    }
  });

  it('não classifica outros sistemas como servidor', () => {
    expect(isWindowsServerOs('Ubuntu 24.04')).toBe(false);
    expect(isWindowsServerOs('macOS 15')).toBe(false);
  });

  it('trata valores ausentes como não servidor', () => {
    expect(isWindowsServerOs(null)).toBe(false);
    expect(isWindowsServerOs(undefined)).toBe(false);
    expect(isWindowsServerOs('')).toBe(false);
  });

  it('reconhece separadores e a forma colada', () => {
    expect(isWindowsServerOs('windows-server-2019')).toBe(true);
    expect(isWindowsServerOs('WindowsServer 2019')).toBe(true);
  });

  it('não confunde "Windows Server" com um nome de cliente que apenas o contenha', () => {
    expect(isWindowsServerOs('Windows Server Core')).toBe(true);
    expect(isWindowsServerOs('Windows Serverless')).toBe(false);
  });
});

describe('getAgentOsIcon — servidor vs. cliente Windows', () => {
  it('usa um glifo diferente para servidor e para cliente Windows', () => {
    const servidor = renderOsIconPath('Windows Server 2022 Standard');
    const cliente = renderOsIconPath('Windows 11 Pro');

    expect(servidor).toBeTruthy();
    expect(cliente).toBeTruthy();
    expect(servidor).not.toBe(cliente);
  });

  it('não reutiliza o glifo do Linux para o servidor Windows', () => {
    const servidor = renderOsIconPath('Windows Server 2022 Standard');
    const linux = renderOsIconPath('Ubuntu 24.04');

    expect(servidor).not.toBe(linux);
  });

  it('mantém o mesmo glifo para todas as versões de servidor', () => {
    const esperado = renderOsIconPath('Windows Server 2025 Standard');

    for (const os of ['Windows Server 2022 Datacenter', 'Windows Server 2019 Standard', 'Windows Server Standard']) {
      expect(renderOsIconPath(os), os).toBe(esperado);
    }
  });

  it('mantém o mesmo glifo para Windows cliente', () => {
    expect(renderOsIconPath('Windows 11 Pro')).toBe(renderOsIconPath('Windows 10 Enterprise'));
  });
});

describe('isAgentWindowsServer — campo dedicado com fallback para texto', () => {
  it('(a) usa o campo productType quando presente: 3 = servidor', () => {
    expect(isAgentWindowsServer({ operatingSystem: 'Windows 11 Pro', productType: '3', isServer: null })).toBe(true);
  });

  it('(a2) productType "2" (controlador de domínio) também é servidor', () => {
    expect(isAgentWindowsServer({ operatingSystem: 'Windows 11 Pro', productType: '2' })).toBe(true);
  });

  it('(b) productType "1" = workstation, mesmo com isServer ausente', () => {
    expect(isAgentWindowsServer({ operatingSystem: 'Windows 11 Pro', productType: '1' })).toBe(false);
  });

  it('(b2) o campo tem precedência sobre o texto nos dois sentidos', () => {
    // Texto diz servidor, campo diz que não é: o campo vence.
    expect(isAgentWindowsServer({ operatingSystem: 'Windows Server 2022 Standard', productType: '1' })).toBe(false);
    // isServer=false também vence sobre o texto.
    expect(isAgentWindowsServer({ operatingSystem: 'Windows Server 2022 Standard', isServer: false })).toBe(false);
  });

  it('(b3) isServer=true sozinho (sem productType) já indica servidor', () => {
    expect(isAgentWindowsServer({ operatingSystem: 'Windows 11 Pro', isServer: true })).toBe(true);
  });

  it('(c) sem os campos (agente antigo) cai no fallback por texto e acerta o servidor', () => {
    expect(isAgentWindowsServer({ operatingSystem: 'Windows Server 2022 Datacenter' })).toBe(true);
    expect(isAgentWindowsServer({ operatingSystem: 'Windows Server 2022 Datacenter', isServer: null, productType: null })).toBe(true);
    // E não dá falso positivo em cliente.
    expect(isAgentWindowsServer({ operatingSystem: 'Windows 11 Pro', isServer: null, productType: null })).toBe(false);
  });

  it('trata productType vazio/desconhecido como ausente e usa o fallback', () => {
    expect(isAgentWindowsServer({ operatingSystem: 'Windows Server 2019 Standard', productType: '  ' })).toBe(true);
    expect(isAgentWindowsServer({ operatingSystem: 'Windows 11 Pro', productType: '9' })).toBe(false);
  });
});

describe('AgentCard — ícone de Windows Server', () => {
  it('renderiza o ícone de servidor quando o SO é de servidor', () => {
    const servidorPath = renderOsIconPath('Windows Server 2022 Standard');
    const { container } = render(
      <AgentCard agent={buildAgent({ operatingSystem: 'Windows Server 2022 Standard' })} now={Date.now()} />,
    );

    // O card renderiza outros ícones (status, métricas); o do SO é o que fica
    // no quadrado de destaque ao lado do nome do agente.
    const iconeDoSo = container.querySelector('.h-11.w-11 svg path');
    expect(iconeDoSo?.getAttribute('d')).toBe(servidorPath);
  });

  it('o CAMPO manda no card: isServer=true com texto de cliente rende ícone de servidor', () => {
    const servidorSig = renderOsIconSignature('Windows Server 2022 Standard');
    const clienteSig = renderOsIconSignature('Windows 11 Pro');
    const { container } = render(
      <AgentCard
        agent={buildAgent({ operatingSystem: 'Windows 11 Pro', isServer: true, productType: '3' })}
        now={Date.now()}
      />,
    );

    const sig = iconSignature(container.querySelector('.h-11.w-11') as HTMLElement);
    expect(sig).toBe(servidorSig);
    expect(sig).not.toBe(clienteSig);
  });

  it('o CAMPO manda no card: isServer=false derruba o ícone de servidor', () => {
    const servidorSig = renderOsIconSignature('Windows Server 2022 Standard');
    const { container } = render(
      <AgentCard
        agent={buildAgent({ operatingSystem: 'Windows Server 2022 Standard', isServer: false })}
        now={Date.now()}
      />,
    );

    // Com o campo dizendo "não é servidor", o card NÃO pode usar o glifo de servidor.
    // (Como o texto ainda diz "windows", cai no ícone genérico de desktop.)
    const quadrado = container.querySelector('.h-11.w-11') as HTMLElement;
    expect(iconSignature(quadrado)).not.toBe(servidorSig);
  });

  it('agente antigo (campos null) mantém o ícone de servidor pelo texto', () => {
    const servidorSig = renderOsIconSignature('Windows Server 2022 Standard');
    const { container } = render(
      <AgentCard
        agent={buildAgent({ operatingSystem: 'Windows Server 2022 Standard', isServer: null, productType: null })}
        now={Date.now()}
      />,
    );

    expect(iconSignature(container.querySelector('.h-11.w-11') as HTMLElement)).toBe(servidorSig);
  });

  it('getAgentOsIcon(..., isServer=false) não usa o glifo de servidor nem com texto de servidor', () => {
    const servidorSig = renderOsIconSignature('Windows Server 2022 Standard');
    const sig = (() => {
      const { container, unmount } = render(<>{getAgentOsIcon('Windows Server 2022 Standard', false)}</>);
      const s = iconSignature(container);
      unmount();
      return s;
    })();

    expect(sig).not.toBe(servidorSig);
  });

  it('renderiza o ícone de cliente para Windows 11 (sem falso positivo)', () => {
    const clientePath = renderOsIconPath('Windows 11 Pro');
    const { container } = render(
      <AgentCard agent={buildAgent({ operatingSystem: 'Windows 11 Pro' })} now={Date.now()} />,
    );

    const iconeDoSo = container.querySelector('.h-11.w-11 svg path');
    const d = iconeDoSo?.getAttribute('d');
    expect(d).toBe(clientePath);
    expect(d).not.toBe(renderOsIconPath('Windows Server 2022 Standard'));
  });
});