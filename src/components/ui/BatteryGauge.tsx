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

/**
 * Desenho feito em CSS de propósito.
 *
 * Os glifos de bateria do Material Symbols têm parede de ~85 unidades no grid
 * 960 — cerca de 2 px no tamanho usado no badge, o que fazia o ícone parecer
 * "em negrito" ao lado dos outros ícones (linha fina). Não existe família mais
 * fina (a \'fill0\' não é publicada para esses glifos e a família \'_bar\' também é
 * maciça), então o desenho aqui usa CONTORNO DE 1 px, que é o que dá o peso
 * visual leve e permite ajustar cor/espessura sem trocar de conjunto de ícones.
 *
 * Nível = preenchimento proporcional (não depende de variantes de glifo) e o
 * estado na tomada usa o raio DENTRO da bateria — um ícone só.
 */
const SIZES = {
  sm: { height: 'h-3', width: 'w-[21px]', pole: 'h-[5px] w-[1px]', bolt: 'h-2.5 w-2.5', text: 'text-[10px]' },
  md: { height: 'h-4', width: 'w-[29px]', pole: 'h-[7px] w-[1px]', bolt: 'h-3 w-3', text: 'text-xs' },
} as const;

/**
 * Indicador de energia do agente.
 *
 * - NA BATERIA: bateria desenhada (contorno 1 px + preenchimento proporcional ao
 *   nível real, na cor da faixa);
 * - NA TOMADA: o mesmo desenho com o RAIO dentro da bateria — um ícone só;
 * - contorno de 1 px em `currentColor` — MESMA espessura e cor dos outros ícones
 *   (o wifi do selo "Online", por exemplo) e corpo transparente, para o fundo do
 *   badge aparecer. Foi a comparação com o wifi que mostrou o excesso de peso:
 *   qualquer glifo de bateria do Material tem parede de ~2 px neste tamanho, e o
 *   contorno preto/branco puro ainda destoava do traço do restante do card;
 * - os dois estados têm o MESMO tamanho, então o indicador não "pula" ao
 *   conectar/desconectar.
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
  // Com preenchimento suficiente o raio fica sobre a cor da faixa (branco); com
  // carga pequena ele cai na área vazia e precisa da cor do contorno.
  const boltColor = fillPercent >= 45 ? 'text-white' : 'text-foreground';

  return (
    <span
      className={'inline-flex items-center gap-1.5 ' + className}
      data-state={plugged ? 'charging' : 'battery'}
      title={title}
      aria-label={title}
    >
      <span className="inline-flex items-center gap-[1px]">
        <span
          className={
            'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[3px] border border-current ' +
            s.height +
            ' ' +
            s.width
          }
        >
          <span
            className={
              'absolute inset-y-[1px] left-[1px] rounded-[1px] transition-all duration-500 ' +
              TONE_FILL[tone]
            }
            // max(0px, ...) evita calc() negativo em 0% (largura negativa é
            // inválida em CSS e o valor seria descartado).
            style={{ width: 'max(0px, calc(' + fillPercent + '% - 2px))' }}
          />
          {plugged && (
            <Icon name="bolt" className={s.bolt + ' relative z-10 ' + boltColor} />
          )}
        </span>
        {/* Polo positivo: mesmo contorno, 1 px de largura. */}
        <span className={'shrink-0 rounded-r-[1px] bg-current ' + s.pole} />
      </span>
      {showResolvedLabel && <span className={s.text + ' text-muted'}>{resolvedLabel}</span>}
      <span className={s.text + ' font-semibold tabular-nums ' + TONE_TEXT[tone]}>{percentLabel}</span>
    </span>
  );
}
