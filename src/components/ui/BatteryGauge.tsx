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

/**
 * Nível por barras na versão VAZADA: _1 (menos carga) a _6 (cheio). Não existe
 * `battery_android_frame_0` no Material Symbols, então a faixa mais baixa usa _1.
 */
const ANDROID_BATTERY_LEVELS = [
  'battery_android_frame_1',
  'battery_android_frame_2',
  'battery_android_frame_3',
  'battery_android_frame_4',
  'battery_android_frame_5',
  'battery_android_frame_6',
] as const;

type AndroidBatteryGlyph =
  | (typeof ANDROID_BATTERY_LEVELS)[number]
  | 'battery_android_frame_bolt';

/**
 * Glifo do estado "na bateria" pela faixa do percentual. Percentual desconhecido
 * usa o MEIO da escala: não afirma vazio nem cheio (o rótulo fica "—" e o
 * percentual também).
 */
function batteryLevelGlyph(percent: number | null | undefined): AndroidBatteryGlyph {
  if (percent == null || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    return 'battery_android_frame_3';
  }
  // Faixas naturais da escala: _N corresponde a N/6 da carga.
  if (percent < 17) return 'battery_android_frame_1';
  if (percent < 33) return 'battery_android_frame_2';
  if (percent < 50) return 'battery_android_frame_3';
  if (percent < 67) return 'battery_android_frame_4';
  if (percent < 83) return 'battery_android_frame_5';
  return 'battery_android_frame_6';
}

/**
 * Mesma altura e larguras equivalentes nos dois estados (o indicador não
 * "pula"), agora em escala mais discreta: a família battery_android_* é de
 * traço cheio (a API do Material só publica a variante fill1 destes glifos), e
 * no tamanho anterior ela ficava pesada dentro do badge colorido — o ícone
 * brigava com o texto "41%". Alinhado ao tamanho dos outros ícones do badge
 * (o wifi do selo de status é h-2.5).
 */
const SIZES = {
  sm: { height: 'h-3', width: 'w-[21px]', text: 'text-[10px]' },
  md: { height: 'h-4', width: 'w-[29px]', text: 'text-xs' },
} as const;

/**
 * Indicador de energia do agente, sempre com UM ícone da família
 * battery_android_* (Material Symbols Rounded, fill1) — bateria HORIZONTAL, a
 * mesma linguagem visual nos dois estados:
 *
 * - NA BATERIA: battery_android_frame_1..6 conforme a faixa do percentual
 *   (barrinhas = nível, como o preenchimento da versão desenhada);
 * - NA TOMADA: battery_android_frame_bolt (moldura + raio), sem variantes de
 *   nível — o nível continua no percentual ao lado.
 *
 * A família `_frame_` é a VAZADA: moldura fina, que acompanha o traço dos outros
 * ícones (o wifi do selo, por exemplo) — a família maciça ficava pesada e
 * destoante dentro do badge.
 *
 * Os glifos são de traço cheio (fill1); por isso o tamanho é contido — no badge
 * eles ficavam "gordos" demais no tamanho anterior.
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
  const glyph: AndroidBatteryGlyph = plugged
    ? 'battery_android_frame_bolt'
    : batteryLevelGlyph(percent);

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
