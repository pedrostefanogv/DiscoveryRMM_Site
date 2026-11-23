import { Icon } from './Icon';
import { batteryPowerLabel, batteryTone, formatBatteryPercent, type BatteryTone } from '@/utils/agentPower';

interface BatteryGaugeProps {
  /** Percentual 0-100; null = não reportado. */
  percent: number | null;
  /** Na tomada? null = não reportado (cai para o texto cru do SO). */
  onAc?: boolean | null;
  charging?: boolean;
  /** Texto cru do SO/WMI ("On AC", "Discharging"): fallback do rótulo. */
  state?: string | null;
  /**
   * Mostra o rótulo textual ("Na tomada"/"Na bateria") ao lado do percentual.
   * Desligado onde o espaço é curto (badge do canto do card); o estado continua
   * visível pelo ícone e pelo title.
   */
  showLabel?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

const TONE_TEXT: Record<BatteryTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-muted',
};

/**
 * Recorte da família battery_android_*: no grid 960 o desenho ocupa x 40..920 e
 * y -720..-240 (880×480, aspecto 1,83). Recortando, o ícone fica do tamanho do
 * DESENHO — sem a área vazia do grid — e os dois estados saem iguais.
 */
const ANDROID_BATTERY_VIEWBOX = '40 -720 880 480';

/** Nível por barras: _0 vazio, _6 cheio (o desenho confirma a escala). */
const ANDROID_BATTERY_LEVELS = [
  'battery_android_0',
  'battery_android_1',
  'battery_android_2',
  'battery_android_3',
  'battery_android_4',
  'battery_android_5',
  'battery_android_6',
] as const;

type AndroidBatteryGlyph = (typeof ANDROID_BATTERY_LEVELS)[number] | 'battery_android_bolt';

/**
 * Glifo do estado "na bateria" pela faixa do percentual. Percentual desconhecido
 * usa o MEIO da escala: não afirma vazio nem cheio (o rótulo fica "—" e o
 * percentual também).
 */
function batteryLevelGlyph(percent: number | null | undefined): AndroidBatteryGlyph {
  if (percent == null || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    return 'battery_android_3';
  }
  if (percent < 10) return 'battery_android_0';
  if (percent < 25) return 'battery_android_1';
  if (percent < 42) return 'battery_android_2';
  if (percent < 58) return 'battery_android_3';
  if (percent < 75) return 'battery_android_4';
  if (percent < 90) return 'battery_android_5';
  return 'battery_android_6';
}

/** Mesma altura e larguras equivalentes nos dois estados (o indicador não "pula"). */
const SIZES = {
  sm: { height: 'h-3.5', width: 'w-[26px]', text: 'text-[10px]' },
  md: { height: 'h-5', width: 'w-[37px]', text: 'text-xs' },
} as const;

/**
 * Indicador de energia do agente, sempre com UM ícone da família
 * battery_android_* (Material Symbols Rounded, fill1) — bateria HORIZONTAL, a
 * mesma linguagem visual nos dois estados:
 *
 * - NA BATERIA: battery_android_0..6 conforme a faixa do percentual (barras =
 *   nível, como o preenchimento da versão desenhada);
 * - NA TOMADA: battery_android_bolt (bateria com raio), sem variantes de nível —
 *   o nível continua no percentual ao lado.
 *
 * A cor segue a faixa do percentual (verde > 30%, âmbar ≤ 30%, vermelho ≤ 15%),
 * preservando o alerta de bateria baixa. O estado vem de onAc/charging; quando o
 * agente não reportou o booleano (coleta antiga), o texto cru do SO ("On AC") é
 * usado como fallback — senão o painel mostrava "—" para um notebook que estava
 * na tomada.
 */
export function BatteryGauge({
  percent,
  onAc = null,
  charging = false,
  state = null,
  showLabel = true,
  size = 'sm',
  className = '',
}: BatteryGaugeProps) {
  const tone = batteryTone(percent);
  const s = SIZES[size];
  const resolvedLabel = batteryPowerLabel(onAc, charging, state);
  const showResolvedLabel = showLabel && resolvedLabel !== '—';
  const plugged =
    onAc === true || charging || resolvedLabel === 'Na tomada' || resolvedLabel === 'Carregando';
  const percentLabel = formatBatteryPercent(percent);
  const title = 'Bateria: ' + percentLabel + (resolvedLabel !== '—' ? ' · ' + resolvedLabel : '');
  const glyph: AndroidBatteryGlyph = plugged ? 'battery_android_bolt' : batteryLevelGlyph(percent);

  return (
    <span
      className={'inline-flex items-center gap-1.5 ' + className}
      data-state={plugged ? 'charging' : 'battery'}
      title={title}
      aria-label={title}
    >
      <Icon
        name={glyph}
        viewBox={ANDROID_BATTERY_VIEWBOX}
        className={s.height + ' ' + s.width + ' shrink-0 ' + TONE_TEXT[tone]}
      />
      {showResolvedLabel && <span className={s.text + ' text-muted'}>{resolvedLabel}</span>}
      <span className={s.text + ' font-semibold tabular-nums ' + TONE_TEXT[tone]}>{percentLabel}</span>
    </span>
  );
}
