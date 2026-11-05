import { PageHeader } from '@/components/ui';
import { AutoTicketScopeSelector } from '@/components/settings/AutoTicketPolicyEditor';

/**
 * Página de Política de Auto-Ticket.
 *
 * Separada da página de Regras porque são coisas distintas: a REGRA diz "este
 * alerta abre chamado"; a POLÍTICA diz "o auto-ticket opera neste escopo?".
 * A política é hierárquica (Global -> Cliente -> Site) e pode ser desligada em
 * qualquer nível.
 */
export default function AutoTicketPolicyPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Política de Auto-Ticket"
        description="Define se o auto-ticket opera em cada escopo. Herdada de Global para Cliente e Site; pode ser desligada em qualquer nível sem afetar os demais."
      />
      <AutoTicketScopeSelector />
    </div>
  );
}
