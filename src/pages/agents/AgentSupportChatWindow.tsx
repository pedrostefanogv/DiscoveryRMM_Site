import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useAuthorization } from "@/auth/authorization";
import { ErrorDisplay, Loading } from "@/components/ui";
import { useAgent } from "@/hooks/useAgents";
import { useAllSites } from "@/hooks/useSites";
import { createAgentSupportChatClient } from "@/hooks/supportChatClient";
import SupportChatPanel from "@/pages/tickets/SupportChatPanel";

const SUPPORT_CHAT_PERMISSIONS = ['tickets.chat', 'tickets.*', 'tickets.edit', 'admin.*'];

/**
 * Janela DEDICADA do chat de suporte da MÁQUINA (sem chamado), aberta pela
 * lista/detalhe do agent — mesmo padrão do chat do chamado, do acesso remoto e
 * do remote debug: a conversa sobrevive à navegação do atendente.
 *
 * A janela é identificada pelo AGENT: quem abre/retoma a conversa é o próprio
 * painel (auto-start com ?start=1), o que permite "Iniciar nova conversa" sem
 * trocar a URL.
 */
export default function AgentSupportChatWindow() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const agent = useAgent(id!);
  const sites = useAllSites();
  const authz = useAuthorization();

  // O DTO do agent não traz o clientId: derivamos do site para o canal NATS do
  // sinal de atividade (sem isso o realtime cai para o escopo global).
  const siteClientId = useMemo(
    () => sites.data?.find((site) => site.id === agent.data?.siteId)?.clientId ?? null,
    [sites.data, agent.data?.siteId],
  );

  const agentClientId = agent.data?.clientId?.trim() || null;

  const client = useMemo(
    () => createAgentSupportChatClient({
      agentId: id!,
      clientId: agentClientId ?? siteClientId,
      siteId: agent.data?.siteId ?? null,
    }),
    [id, agentClientId, agent.data?.siteId, siteClientId],
  );

  if (agent.isLoading) return <Loading />;
  if (agent.isError || !agent.data) {
    return <ErrorDisplay onRetry={() => agent.refetch()} />;
  }

  const a = agent.data;
  const machineName = a.displayName || a.hostname;

  return (
    <div className="flex h-screen flex-col gap-3 overflow-hidden p-4">
      <header className="shrink-0 border-b border-border pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-foreground">Chat de suporte</h1>
            <p className="truncate text-xs text-muted">
              {machineName}
              {a.operatingSystem ? ' — ' + a.operatingSystem : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="truncate">
              <span className="text-muted">Máquina:</span>{' '}
              <span className="font-medium text-foreground">{machineName}</span>
            </span>
            <span className="truncate">
              <span className="text-muted">Usuário:</span>{' '}
              <span className="font-medium text-foreground">{a.loggedUser || '—'}</span>
            </span>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <SupportChatPanel
          client={client}
          canManage={authz.hasAnyPermission(SUPPORT_CHAT_PERMISSIONS)}
          autoStart={searchParams.get("start") === "1"}
        />
      </div>
    </div>
  );
}
