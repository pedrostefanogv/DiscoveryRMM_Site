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
 * Os DOIS estados usam a MESMA altura e larguras equivalentes, para o indicador
 * não "pular de tamanho" ao conectar/desconectar:
 *
 * - height: altura do desenho (corpo da bateria e glifo recortado);
 * - bodyWidth: largura do corpo desenhado (bateria na horizontal + polo);
 * - glyphWidth: largura do glifo recortado (aspecto 1,94 ≈ o do corpo).
 */
const SIZES = {
  sm: { height: 'h-3.5', bodyWidth: 'w-7', glyphWidth: 'w-[27px]', nub: 'h-1.5 w-[2px]', text: 'text-[10px]' },
  md: { height: 'h-5', bodyWidth: 'w-10', glyphWidth: 'w-[39px]', nub: 'h-2 w-[3px]', text: 'text-xs' },
} as const;

/**
 * Recorte do glifo battery_charging_80_2 na CAIXA DESENHADA da bateria.
 *
 * O Material Symbols entrega o glifo dentro de um quadrado 960×960 com bastante
 * área vazia; sem o recorte, o ícone de "na tomada" saía visivelmente MENOR que
 * a bateria desenhada do estado "na bateria". A caixa abaixo foi medida do
 * próprio path (x 80..856,5 e y -680..-280 → aspecto ~1,94), então com a mesma
 * altura os dois desenhos ficam do mesmo tamanho.
 */
const CHARGING_GLYPH_VIEWBOX = '80 -680 776.5 400';

/**
 * Indicador de energia do agente, em duas formas do mesmo tamanho:
 *
 * - NA TOMADA: UM ícone só — a bateria CARREGANDO do Material Symbols
 *   (battery_charging_80_2, variante DEITADA com o raio em pé), recortada pela
 *   caixa desenhada. O glifo não comunica nível (é fixo), então o nível fica no
 *   percentual exibido ao lado; a cor segue a faixa do percentual (verde > 30%,
 *   âmbar ≤ 30%, vermelho ≤ 15%), preservando o alerta de bateria baixa.
 * - NA BATERIA: bateria desenhada em CSS, com o preenchimento proporcional ao
 *   nível real (o glifo fixo não daria essa informação). Contorno de 1,5px em
 *   `foreground` puro para aparecer nos temas claro e escuro — o token `border`
 *   (1px, quase sem contraste) deixava a bateria invisível no card e no badge.
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

  // Rótulo + percentual são iguais nos dois estados (mesma tipografia).
  const caption = (
    <>
      {showResolvedLabel && <span className={s.text + ' text-muted'}>{resolvedLabel}</span>}
      <span className={s.text + ' font-semibold tabular-nums ' + TONE_TEXT[tone]}>{percentLabel}</span>
    </>
  );

  if (plugged) {
    return (
      <span
        className={'inline-flex items-center gap-1.5 ' + className}
        data-state="charging"
        title={title}
        aria-label={title}
      >
        <Icon
          name="battery_charging_80_2"
          viewBox={CHARGING_GLYPH_VIEWBOX}
          className={s.height + ' ' + s.glyphWidth + ' shrink-0 ' + TONE_TEXT[tone]}
        />
        {caption}
      </span>
    );
  }

  return (
    <span
      className={'inline-flex items-center gap-1.5 ' + className}
      data-state="battery"
      title={title}
      aria-label={title}
    >
      <span className="inline-flex items-center gap-0.5">
        <span
          className={
            // Contorno em CONTRASTE MÁXIMO: 1,5px de `foreground` puro (o token
            // adapta-se aos dois temas) em vez do `border` sutil de antes — a
            // bateria aparecia quase invisível, principalmente dentro do badge
            // colorido da listagem. Corpo TRANSPARENTE: dentro do badge o fundo
            // dele já dá o contraste e o desenho fica parecendo um ícone.
            'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[3px] border-[1.5px] border-foreground ' +
            s.height +
            ' ' +
            s.bodyWidth
          }
        >
          <span
            className={
              'absolute inset-y-[1px] left-[1px] rounded-[1px] transition-all duration-500 ' +
              TONE_FILL[tone]
            }
            // max(0px, ...) evita calc() negativo em 0% (largura negativa é
            // inválida em CSS e o valor seria descartado). O -2px mantém o
            // preenchimento dentro do contorno de 1,5px.
            style={{ width: 'max(0px, calc(' + fillPercent + '% - 2px))' }}
          />
        </span>
        {/* Polo positivo da bateria. */}
        <span className={'shrink-0 rounded-r-[1px] ' + s.nub + ' ' + TONE_FILL[tone]} />
      </span>
      {caption}
    </span>
  );
}
