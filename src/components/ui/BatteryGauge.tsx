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

const TONE_FILL: Record<BatteryTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  neutral: 'bg-muted',
};

const TONE_TEXT: Record<BatteryTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-muted',
};

const SIZES = {
  // box = tamanho do glifo Material (bateria carregando) usado quando plugado.
  sm: { body: 'h-3.5 w-7', nub: 'h-1.5 w-[2px]', box: 'h-4 w-4', text: 'text-[10px]' },
  md: { body: 'h-5 w-10', nub: 'h-2 w-[3px]', box: 'h-5 w-5', text: 'text-xs' },
} as const;

/**
 * Indicador de energia do agente, em duas formas:
 *
 * - NA TOMADA: UM ícone só — a bateria CARREGANDO do Material Symbols
 *   (battery_charging_80_2 — variante DEITADA, com o raio em pé), que já traz o
 *   símbolo embutido. O glifo não comunica
 *   nível (é fixo), então o nível fica no PERCENTUAL exibido ao lado; a cor
 *   segue a faixa do percentual (verde > 30%, âmbar ≤ 30%, vermelho ≤ 15%),
 *   preservando o alerta de bateria baixa.
 * - NA BATERIA: bateria desenhada em CSS, com o preenchimento proporcional ao
 *   nível real (o glifo fixo não daria essa informação).
 *
 * O estado vem de onAc/charging; quando o agente não reportou o booleano (coleta
 * antiga), o texto cru do SO ("On AC") é usado como fallback — senão o painel
 * mostrava "—" para um notebook que estava na tomada.
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
  const fillPercent =
    percent == null || !Number.isFinite(percent) ? 0 : Math.min(100, Math.max(0, percent));
  const s = SIZES[size];
  const resolvedLabel = batteryPowerLabel(onAc, charging, state);
  const showResolvedLabel = showLabel && resolvedLabel !== '—';
  const plugged =
    onAc === true || charging || resolvedLabel === 'Na tomada' || resolvedLabel === 'Carregando';
  const percentLabel = formatBatteryPercent(percent);
  const title = 'Bateria: ' + percentLabel + (resolvedLabel !== '—' ? ' · ' + resolvedLabel : '');

  if (plugged) {
    return (
      <span className={'inline-flex items-center gap-1.5 ' + className} title={title} aria-label={title}>
        <Icon name="battery_charging_80_2" className={s.box + ' shrink-0 ' + TONE_TEXT[tone]} />
        {showResolvedLabel && <span className={s.text + ' text-muted'}>{resolvedLabel}</span>}
        <span className={s.text + ' font-semibold tabular-nums ' + TONE_TEXT[tone]}>{percentLabel}</span>
      </span>
    );
  }

  return (
    <span className={'inline-flex items-center gap-1.5 ' + className} title={title} aria-label={title}>
      <span className="inline-flex items-center gap-0.5">
        <span
          className={
            'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[3px] border border-border ' +
            s.body
          }
        >
          <span
            className={
              'absolute inset-y-[1.5px] left-[1.5px] rounded-[1px] transition-all duration-500 ' +
              TONE_FILL[tone]
            }
            // max(0px, ...) evita calc() negativo em 0% (largura negativa é
            // inválida em CSS e o valor seria descartado).
            style={{ width: 'max(0px, calc(' + fillPercent + '% - 3px))' }}
          />
        </span>
        {/* Polo positivo da bateria. */}
        <span className={'shrink-0 rounded-r-[1px] ' + s.nub + ' ' + TONE_FILL[tone]} />
      </span>
      {showResolvedLabel && <span className={s.text + ' text-muted'}>{resolvedLabel}</span>}
      <span className={s.text + ' font-semibold tabular-nums ' + TONE_TEXT[tone]}>{percentLabel}</span>
    </span>
  );
}
