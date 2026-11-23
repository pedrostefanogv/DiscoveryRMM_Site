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
   * visível pelo ícone de plugue/raio e pelo title.
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
  // glyph = ícone de estado (raio/plugue), exibido FORA do corpo da bateria.
  sm: { body: 'h-3.5 w-7', nub: 'h-1.5 w-[2px]', glyph: 'h-3 w-3', text: 'text-[10px]' },
  md: { body: 'h-5 w-10', nub: 'h-2 w-[3px]', glyph: 'h-4 w-4', text: 'text-xs' },
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
 * estado.
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
  // "Plugado" também quando só o TEXTO CRU diz que está na tomada: o ícone
  // precisa aparecer mesmo sem o booleano onAc.
  const plugged =
    onAc === true || charging || resolvedLabel === 'Na tomada' || resolvedLabel === 'Carregando';
  const percentLabel = formatBatteryPercent(percent);
  const title = 'Bateria: ' + percentLabel + (resolvedLabel !== '—' ? ' · ' + resolvedLabel : '');

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
            // max(0px, ...) evita calc() negativo em 0% (largura negativa é
            // inválida em CSS e o valor seria descartado).
            style={{ width: 'max(0px, calc(' + fillPercent + '% - 3px))' }}
          />
        </span>
        {/* Polo positivo da bateria. */}
        <span className={'shrink-0 rounded-r-[1px] ' + s.nub + ' ' + TONE_FILL[tone]} />
      </span>
      {/* Estado FORA do corpo da bateria: dentro do preenchimento o glifo ficava
          pequeno e apagado, e o operador não percebia que a máquina estava
          carregando. Raio = carregando; plugue = na tomada sem carregar. */}
      {plugged && (
        <Icon
          name={resolvedLabel === 'Carregando' ? 'bolt' : 'power_settings_new'}
          className={
            s.glyph + ' shrink-0 ' + (resolvedLabel === 'Carregando' ? 'text-success' : 'text-muted')
          }
        />
      )}
      {showResolvedLabel && <span className={s.text + ' text-muted'}>{resolvedLabel}</span>}
      <span className={s.text + ' font-semibold tabular-nums ' + TONE_TEXT[tone]}>{percentLabel}</span>
    </span>
  );
}
