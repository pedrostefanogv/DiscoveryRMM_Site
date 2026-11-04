import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SensorsSettingsEditor, {
  SENSORS_DEFAULT_INTERVAL_SECONDS,
  SENSORS_MAX_INTERVAL_SECONDS,
  SENSORS_MIN_INTERVAL_SECONDS,
  clampSensorsInterval,
  parseSensorsSettings,
  serializeSensorsSettings,
  type SensorsSettings,
} from "./SensorsSettingsEditor";

const DEFAULT_SETTINGS: SensorsSettings = {
  enabled: true,
  defaultIntervalSeconds: SENSORS_DEFAULT_INTERVAL_SECONDS,
  autoTicketEnabled: true,
  notifyEnabled: true,
};

const SAVED_JSON = JSON.stringify({
  enabled: true,
  defaultIntervalSeconds: 300,
  autoTicketEnabled: true,
  notifyEnabled: true,
});

afterEach(() => cleanup());

describe("parseSensorsSettings", () => {
  it("usa os defaults do servidor quando o JSON está ausente, vazio ou inválido", () => {
    for (const raw of [null, undefined, "", "   ", "não é json", "[]", '"texto"']) {
      expect(parseSensorsSettings(raw)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it("lê camelCase e PascalCase (blobs antigos do backend)", () => {
    expect(
      parseSensorsSettings(
        JSON.stringify({ enabled: false, defaultIntervalSeconds: 600, autoTicketEnabled: false }),
      ),
    ).toEqual({
      enabled: false,
      defaultIntervalSeconds: 600,
      autoTicketEnabled: false,
      notifyEnabled: true,
    });

    expect(
      parseSensorsSettings(
        JSON.stringify({ Enabled: false, DefaultIntervalSeconds: 120, NotifyEnabled: false }),
      ),
    ).toEqual({
      enabled: false,
      defaultIntervalSeconds: 120,
      autoTicketEnabled: true,
      notifyEnabled: false,
    });
  });

  it("completa chaves ausentes com os defaults do servidor (não com false)", () => {
    expect(parseSensorsSettings(JSON.stringify({ enabled: false }))).toEqual({
      enabled: false,
      defaultIntervalSeconds: SENSORS_DEFAULT_INTERVAL_SECONDS,
      autoTicketEnabled: true,
      notifyEnabled: true,
    });
  });

  it("clampa o intervalo salvo para a faixa aceita pelo domínio", () => {
    expect(
      parseSensorsSettings(JSON.stringify({ defaultIntervalSeconds: 5 })).defaultIntervalSeconds,
    ).toBe(SENSORS_MIN_INTERVAL_SECONDS);
    expect(
      parseSensorsSettings(JSON.stringify({ defaultIntervalSeconds: 999999 })).defaultIntervalSeconds,
    ).toBe(SENSORS_MAX_INTERVAL_SECONDS);
    // Intervalo não numérico cai no default do servidor.
    expect(
      parseSensorsSettings(JSON.stringify({ defaultIntervalSeconds: "abc" }))
        .defaultIntervalSeconds,
    ).toBe(SENSORS_DEFAULT_INTERVAL_SECONDS);
  });
});

describe("clampSensorsInterval / serializeSensorsSettings", () => {
  it("clampa nos limites 30..86400", () => {
    expect(clampSensorsInterval(0)).toBe(SENSORS_MIN_INTERVAL_SECONDS);
    expect(clampSensorsInterval(29)).toBe(SENSORS_MIN_INTERVAL_SECONDS);
    expect(clampSensorsInterval(30)).toBe(30);
    expect(clampSensorsInterval(86400)).toBe(86400);
    expect(clampSensorsInterval(86401)).toBe(SENSORS_MAX_INTERVAL_SECONDS);
    expect(clampSensorsInterval(Number.NaN)).toBe(SENSORS_DEFAULT_INTERVAL_SECONDS);
    expect(clampSensorsInterval(120.6)).toBe(121);
  });

  it("serializa em camelCase com o intervalo clampado", () => {
    const json = serializeSensorsSettings({
      enabled: false,
      defaultIntervalSeconds: 1,
      autoTicketEnabled: false,
      notifyEnabled: true,
    });

    expect(JSON.parse(json)).toEqual({
      enabled: false,
      defaultIntervalSeconds: SENSORS_MIN_INTERVAL_SECONDS,
      autoTicketEnabled: false,
      notifyEnabled: true,
    });
  });

  it("faz round-trip parse -> serialize -> parse", () => {
    const settings: SensorsSettings = {
      enabled: false,
      defaultIntervalSeconds: 600,
      autoTicketEnabled: false,
      notifyEnabled: true,
    };

    expect(parseSensorsSettings(serializeSensorsSettings(settings))).toEqual(settings);
  });
});

describe("SensorsSettingsEditor", () => {
  function renderEditor(value: string, onChange = vi.fn()) {
    return {
      onChange,
      ...render(<SensorsSettingsEditor value={value} onChange={onChange} />),
    };
  }

  it("não é um switch: o campo é um blob JSON com controles próprios", () => {
    const { container } = renderEditor(SAVED_JSON);

    // Regressão do bug de produção: o campo JSON nunca deve ser o switch do card
    // de funcionalidade — aqui os booleanos são checkboxes do próprio editor.
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(3);
  });

  it("desligar o kill switch emite o JSON serializado", () => {
    const { onChange } = renderEditor(SAVED_JSON);

    fireEvent.click(screen.getByLabelText(/Sensores habilitados/));

    expect(onChange).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(onChange.mock.calls[0][0] as string) as SensorsSettings;
    expect(payload).toEqual({
      enabled: false,
      defaultIntervalSeconds: 300,
      autoTicketEnabled: true,
      notifyEnabled: true,
    });
  });

  it("alternar auto-ticket e notificações mantém as demais chaves", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SensorsSettingsEditor value={SAVED_JSON} onChange={onChange} />,
    );

    fireEvent.click(screen.getByLabelText(/Auto-ticket pelos eventos de sensor/));
    // Componente controlado: o pai devolve o JSON emitido como novo valor antes
    // do próximo clique (é assim que a página funciona via react-hook-form).
    rerender(
      <SensorsSettingsEditor value={onChange.mock.calls[0][0] as string} onChange={onChange} />,
    );
    fireEvent.click(screen.getByLabelText(/Notificações dos alertas de sensor/));

    expect(onChange).toHaveBeenCalledTimes(2);
    const last = JSON.parse(onChange.mock.calls[1][0] as string) as SensorsSettings;
    expect(last.autoTicketEnabled).toBe(false);
    expect(last.notifyEnabled).toBe(false);
    expect(last.enabled).toBe(true);
    expect(last.defaultIntervalSeconds).toBe(300);
  });

  it("não emite intervalo fora da faixa e clampa no blur", () => {
    const { onChange } = renderEditor(SAVED_JSON);
    const input = screen.getByLabelText("Intervalo padrão (segundos)") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "5" } });
    // Fora de 30..86400: não envia PATCH inválido para o servidor.
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Intervalo deve estar entre 30 e 86400/)).toBeTruthy();

    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(onChange.mock.calls[0][0] as string) as SensorsSettings;
    expect(payload.defaultIntervalSeconds).toBe(SENSORS_MIN_INTERVAL_SECONDS);
  });

  it("emite o intervalo válido digitado", () => {
    const { onChange } = renderEditor(SAVED_JSON);
    const input = screen.getByLabelText("Intervalo padrão (segundos)") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "600" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(
      (JSON.parse(onChange.mock.calls[0][0] as string) as SensorsSettings).defaultIntervalSeconds,
    ).toBe(600);
  });

  it("sincroniza com alterações externas (descartar/refetch)", () => {
    const { rerender } = render(<SensorsSettingsEditor value={SAVED_JSON} onChange={vi.fn()} />);
    const input = screen.getByLabelText("Intervalo padrão (segundos)") as HTMLInputElement;
    expect(input.value).toBe("300");

    rerender(
      <SensorsSettingsEditor
        value={JSON.stringify({ ...DEFAULT_SETTINGS, defaultIntervalSeconds: 900 })}
        onChange={vi.fn()}
      />,
    );

    expect(input.value).toBe("900");
  });
});
