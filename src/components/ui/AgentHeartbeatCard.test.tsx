import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentHeartbeatCard } from './AgentHeartbeatCard';

/**
 * Card "Métricas Ao Vivo" do detalhe do agente.
 *
 * O indicador de BATERIA foi removido deste card a pedido: ele fica no painel
 * "Dispositivo e energia" do card Informações (mesmo visual da listagem), e
 * repetir aqui só duplicava a informação. Este teste trava a remoção — se
 * alguém reintroduzir a barra de bateria, ele quebra.
 */
afterEach(() => cleanup());

describe('AgentHeartbeatCard — sem indicador de bateria', () => {
  it('não mostra a bateria mesmo quando o agente reporta os dados', () => {
    render(
      <AgentHeartbeatCard
        metrics={{
          cpuPercent: 11,
          memoryPercent: 20,
          hasBattery: true,
          batteryPercent: 63,
          batteryOnAc: false,
          batteryCharging: false,
        }}
      />,
    );

    expect(screen.queryByText('Bateria')).toBeNull();
    expect(screen.queryByText('Na bateria')).toBeNull();
    expect(screen.queryByText('Na tomada')).toBeNull();
    expect(screen.queryByText('63%')).toBeNull();
  });

  it('continua mostrando as métricas que são do card (CPU/RAM)', () => {
    render(<AgentHeartbeatCard metrics={{ cpuPercent: 11, memoryPercent: 20 }} />);

    expect(screen.getByText('Métricas Ao Vivo')).toBeTruthy();
    expect(screen.getByText('CPU')).toBeTruthy();
    expect(screen.getByText('RAM')).toBeTruthy();
    // O valor sai junto com o sufixo no mesmo nó de texto ("11%" / "20%").
    expect(screen.getByText('11%')).toBeTruthy();
    expect(screen.getByText('20%')).toBeTruthy();
  });

  it('sem métricas e com showEmpty mostra o estado vazio', () => {
    render(<AgentHeartbeatCard metrics={undefined} showEmpty />);

    expect(screen.getByText('Nenhuma métrica de heartbeat recebida ainda.')).toBeTruthy();
  });
});
