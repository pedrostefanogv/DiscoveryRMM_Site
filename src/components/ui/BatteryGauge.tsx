import { Icon } from './Icon';
import { batteryPowerLabel, batteryTone, formatBatteryPercent, type BatteryTone } from '@/utils/agentPower';

interface BatteryGaugeProps {
  /** Percentual 0-100; null = não reportado. */
  percent: number | null;
  /** Na tomada? null = não reportado. */
  onAc?: boolean | null;
  charging?: boolean;
  /** Rótulo textual opcional ao lado do percentual (ex.: "Na tomada"). */
  label?: string | null;
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
  sm: { body: 'h-3.5 w-7', nub: 'h-1.5 w-[2px]', glyph: 'h-2.5 w-2.5', text: 'text-[10px]' },
  md: { body: 'h-5 w-10', nub: 'h-2 w-[3px]', glyph: 'h-3.5 w-3.5', text: 'text-xs' },
} as const;

/**
 * Indicador de bateria desenhado em CSS.
 *
 * Escolha deliberada: o pacote de ícones do site (registry + chunks de Material
 * Symbols) NÃO tem glifos de bateria, e o preenchimento precisa acompanhar o
 * percentual — um glifo fixo não comunicaria nível. Aqui o corpo é um retângulo
 * com polo, o preenchimento é a carga real e a COR muda por faixa (verde acima
 * de 30%, âmbar até 30%, vermelho até 15%). Quando a máquina está na
 * tomada/carregando, o raio (bolt) ou o plugue (power_settings_new) indicam o
 * estado sem depender do nível.
 */
export function BatteryGauge({
  percent,
  onAc = null,
  charging = false,
  label = null,
  size = 'sm',
  className = '',
}: BatteryGaugeProps) {
  const tone = batteryTone(percent);
  const fillPercent =
    percent == null || !Number.isFinite(percent) ? 0 : Math.min(100, Math.max(0, percent));
  const s = SIZES[size];
  const plugged = onAc === true || charging;
  const powerLabel = batteryPowerLabel(onAc, charging);
  const percentLabel = formatBatteryPercent(percent);
  const title = 'Bateria: ' + percentLabel + (powerLabel !== '—' ? ' · ' + powerLabel : '');

  return (
    <span className={'inline-flex items-center gap-1.5 ' + className} title={title} aria-label={title}>
      <span className="inline-flex items-center gap-0.5">
        <span
          className={
            'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[3px] border ' +
            s.body +
            ' ' +
            (plugged ? 'border-success/60' : 'border-border')
          }
        >
          <span
            className={
              'absolute inset-y-[1.5px] left-[1.5px] rounded-[1px] transition-all duration-500 ' +
              TONE_FILL[tone]
            }
            style={{ width: 'calc(' + fillPercent + '% - 3px)' }}
          />
          {plugged && (
            <Icon
              name={charging ? 'bolt' : 'power_settings_new'}
              className={'relative z-10 ' + s.glyph + ' ' + TONE_TEXT[tone]}
            />
          )}
        </span>
        {/* Polo positivo da bateria. */}
        <span className={'shrink-0 rounded-r-[1px] ' + s.nub + ' ' + TONE_FILL[tone]} />
      </span>
      {label ? <span className={s.text + ' text-muted'}>{label}</span> : null}
      <span className={s.text + ' font-semibold tabular-nums ' + TONE_TEXT[tone]}>{percentLabel}</span>
    </span>
  );
}
