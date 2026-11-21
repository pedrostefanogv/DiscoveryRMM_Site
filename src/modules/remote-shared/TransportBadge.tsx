import { Badge, Icon } from "@/components/ui";
import type { MaterialSymbolName } from "@/components/ui/Icon";
import { describeTransport, type TransportInfo } from "./transportIndicator";

interface TransportIndicatorProps {
  /** Estado do transporte publicado pelo agente; ausente = NATS. */
  info?: TransportInfo | null;
  className?: string;
}

/**
 * Selo do transporte em uso na sessão remota.
 *
 * Responde a uma pergunta que o operador não tem como responder de outro jeito:
 * "esta sessão está em WebRTC ou em NATS?". Sem ele, a única forma de descobrir
 * seria inspecionar o tráfego de rede.
 *
 * O estado de FALLBACK é o mais importante de exibir: a sessão está funcionando
 * por um caminho DIFERENTE do que o operador configurou, e ele precisa saber
 * disso — por isso tem cor de atenção e o motivo no tooltip, em vez de aparecer
 * como sucesso.
 */
export function TransportBadge({ info, className = "" }: TransportIndicatorProps) {
  const presentation = describeTransport(info);

  return (
    <span
      className={`inline-flex items-center ${className}`}
      title={presentation.title}
      role="status"
      aria-label={`Transporte: ${presentation.label}. ${presentation.title}`}
      data-transport-state={info?.state ?? "nats"}
    >
      <Badge color={presentation.tone}>
        <span className="inline-flex items-center gap-1">
          <Icon name={presentation.icon as MaterialSymbolName} className="h-3.5 w-3.5" />
          {presentation.label}
        </span>
      </Badge>
    </span>
  );
}

export default TransportBadge;
