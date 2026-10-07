import { BellOff, BellRing, Loader2, Send } from "lucide-react";
import toast from "react-hot-toast";
import { Badge, Button } from "@/components/ui";
import { useWebPushState } from "@/hooks/useWebPush";
import {
  disableWebPush,
  enableWebPush,
  getWebPushSnapshot,
  sendTestPush,
} from "@/services/webPush";

/**
 * Controle de notificacoes do navegador (Web Push) por dispositivo.
 * Sem Service Worker + permissao + inscricao no servidor, o console so avisa
 * o usuario enquanto a pagina esta aberta.
 */
export function BrowserPushToggle() {
  const { status, busy, error, subscriptionCount } = useWebPushState();

  const handleEnable = async () => {
    await enableWebPush();
    const snapshot = getWebPushSnapshot();

    if (snapshot.status === "subscribed") {
      toast.success("Notificacoes do navegador ativadas.");
      return;
    }
    if (snapshot.status === "denied") {
      toast.error("Permissao de notificacao bloqueada no navegador.");
      return;
    }
    if (snapshot.status === "server-disabled") {
      toast.error("Web Push nao esta habilitado no servidor.");
      return;
    }
    if (snapshot.status === "unsupported") {
      toast.error("Este navegador nao suporta notificacoes do sistema.");
      return;
    }

    toast.error(snapshot.error ?? "Nao foi possivel ativar as notificacoes.");
  };

  const handleDisable = async () => {
    await disableWebPush();
    toast.success("Notificacoes do navegador desativadas.");
  };

  const handleTest = async () => {
    try {
      const result = await sendTestPush();

      if (result.attempted === 0) {
        toast.error("Nenhum dispositivo inscrito para receber o teste.");
        return;
      }
      if (result.delivered === 0) {
        toast.error("O provedor de push recusou o envio do teste.");
        return;
      }

      toast.success("Teste enviado para " + result.delivered + " dispositivo(s).");
    } catch {
      toast.error("Falha ao enviar a notificacao de teste.");
    }
  };

  if (status === "unsupported") {
    return (
      <p className="text-xs text-muted">
        Este navegador nao suporta notificacoes do sistema.
      </p>
    );
  }

  if (status === "server-disabled") {
    return (
      <p className="text-xs text-muted">
        Notificacoes do navegador indisponiveis: Web Push nao configurado no servidor.
      </p>
    );
  }

  if (status === "denied") {
    return (
      <p className="text-xs text-muted">
        Permissao bloqueada. Libere as notificacoes deste site nas configuracoes do navegador.
      </p>
    );
  }

  if (status === "loading") {
    return <p className="text-xs text-muted">Verificando notificacoes do navegador...</p>;
  }

  if (status === "error") {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-xs text-danger">{error}</p>
        <Button size="sm" variant="ghost" onClick={() => void handleEnable()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (status === "subscribed") {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <BellRing className="h-4 w-4 text-primary" />
            Notificacoes do navegador
            <Badge color="primary">Ativo</Badge>
          </p>
          <p className="mt-1 text-xs text-muted">
            {subscriptionCount} dispositivo(s) inscrito(s). Voce recebe avisos mesmo com o console fechado.
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void handleTest()}
            aria-label="Enviar notificacao de teste"
            title="Enviar notificacao de teste"
          >
            <Send className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void handleDisable()}
            aria-label="Desativar notificacoes do navegador"
            title="Desativar notificacoes do navegador"
          >
            <BellOff className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <BellOff className="h-4 w-4 text-muted" />
          Notificacoes do navegador
        </p>
        <p className="mt-1 text-xs text-muted">
          Ative para receber avisos do console mesmo com a aba ou o navegador fechados.
        </p>
      </div>
      <Button size="sm" disabled={busy} onClick={() => void handleEnable()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Ativar
      </Button>
    </div>
  );
}
