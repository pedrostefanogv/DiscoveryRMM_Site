import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentHeartbeatCard } from './AgentHeartbeatCard';

/**
 * Bateria nas métricas ao vivo do detalhe.
 *
 * Regra: o bloco só aparece com hasBattery === true (o agente confirmou que
 * existe bateria). Ausência de dado não pode virar "0%" nem "sem bateria" —
 * notebook real ficaria sem indicador e desktop ganharia um bloco inútil.
 */
afterEach(() => cleanup());

describe('AgentHeartbeatCard — bateria', () => {
  it('mostra a bateria com percentual e estado da tomada', () => {
    render(
      <AgentHeartbeatCard
        metrics={{
          hasBattery: true,
          batteryPercent: 63,
          batteryOnAc: false,
          batteryCharging: false,
        }}
      />,
    );

    expect(screen.getByText('Bateria')).toBeTruthy();
    // O valor sai junto com o sufixo no mesmo nó de texto ("63%").
    expect(screen.getByText('63%')).toBeTruthy();
    expect(screen.getByText('Na bateria')).toBeTruthy();
  });

  it('mostra "Carregando" quando plugado carregando', () => {
    render(
      <AgentHeartbeatCard
        metrics={{ hasBattery: true, batteryPercent: 41, batteryOnAc: true, batteryCharging: true }}
      />,
    );

    expect(screen.getByText('Carregando')).toBeTruthy();
  });

  it('não mostra bateria em desktop (hasBattery=false)', () => {
    render(<AgentHeartbeatCard metrics={{ hasBattery: false, batteryOnAc: true }} />);

    expect(screen.queryByText('Bateria')).toBeNull();
  });

  it('não mostra bateria quando o agente não reporta o campo', () => {
    render(<AgentHeartbeatCard metrics={{ cpuPercent: 10 }} />);

    expect(screen.queryByText('Bateria')).toBeNull();
  });
});
