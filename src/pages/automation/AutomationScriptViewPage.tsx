import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { History, Pencil } from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  ErrorDisplay,
  Input,
  Loading,
  PageHeader,
} from "@/components/ui";
import { type AutomationScriptConsume } from "@/api";
import { CustomFieldsUsedByPanel } from "@/components/custom-fields/CustomFieldsUsedByPanel";
import { ScriptContentEditor } from "@/components/script/ScriptContentEditor";
import { AutomationScriptAuditTrail } from "./AutomationScriptAuditTrail";
import { scriptTypeLabel } from "./automationScriptUtils";
import { useClients } from "@/hooks/useClients";
import { useAutomationScript, useConsumeAutomationScript } from "@/hooks/useAutomation";

/**
 * Página de detalhes/consulta de um script (/automation/scripts/:id).
 *
 * Antes a consulta era um modal na listagem; com a página dedicada o link é
 * profundo (refresh/deep link preservam o script) e a trilha de auditoria cabe
 * ao lado do conteúdo. Nada é executado nem alterado nesta tela — "Registrar
 * consumo" é a única ação que grava (evento Consumido na auditoria).
 */
export default function AutomationScriptViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const clients = useClients();
  const script = useAutomationScript(id ?? "");
  const consumeMutation = useConsumeAutomationScript();
  const [consumedPayload, setConsumedPayload] = useState<AutomationScriptConsume | null>(null);

  const backToList = () => navigate("/automation/scripts");

  const clientLabel = (clientId: string | null | undefined) =>
    clientId ? clients.data?.find((c) => c.id === clientId)?.name ?? clientId : "Global";

  const handleConsume = async () => {
    if (!id) return;
    try {
      const data = await consumeMutation.mutateAsync(id);
      setConsumedPayload(data);
      // O hash vem da API; se faltar, não transformamos um consumo bem-sucedido
      // em "falha ao consumir" (o antigo slice direto lançava TypeError).
      const hash = (data.contentHashSha256 ?? "").slice(0, 10);
      toast.success(
        hash
          ? `Consumo registrado na auditoria (hash ${hash}...)`
          : "Consumo registrado na auditoria",
      );
    } catch {
      toast.error("Falha ao registrar o consumo do script");
    }
  };

  if (script.isLoading) {
    return <Loading message="Carregando script..." />;
  }

  if (script.isError) {
    return <ErrorDisplay onRetry={() => script.refetch()} />;
  }

  if (!script.data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Script não encontrado"
          description="Ele pode ter sido excluído ou estar fora do seu escopo."
          onBack={backToList}
        />
        <Card>
          <p className="text-sm text-muted">
            Não encontramos este script no catálogo.{" "}
            <button
              type="button"
              onClick={backToList}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Voltar para a lista
            </button>
          </p>
        </Card>
      </div>
    );
  }

  const detail = script.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={detail.name}
        description={detail.summary}
        onBack={backToList}
        backLabel="Voltar para a lista de scripts"
      >
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            document.getElementById("script-audit")?.scrollIntoView({ behavior: "smooth" })
          }
        >
          <History className="h-4 w-4" /> Auditoria
        </Button>
        <Button size="sm" onClick={() => navigate(`/automation/scripts/${detail.id}/edit`)}>
          <Pencil className="h-4 w-4" /> Editar
        </Button>
      </PageHeader>

      <Card>
        <CardHeader
          title="Identificação"
          subtitle="Escopo, tipo e status do script. Modo consulta: nada é executado nem alterado aqui."
        />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Input label="Cliente" value={clientLabel(detail.clientId)} readOnly />
          <Input label="Nome" value={detail.name} readOnly />
          <Input label="ScriptType" value={scriptTypeLabel(detail.scriptType)} readOnly />
          <Input label="Versão" value={detail.version} readOnly />
          <Input label="Status" value={detail.isActive ? "Ativo" : "Inativo"} readOnly />
          <Input
            label="Atualizado em"
            value={new Date(detail.lastUpdatedAt).toLocaleString("pt-BR")}
            readOnly
          />
        </div>
        <div className="mt-3 grid gap-1 text-xs text-muted md:grid-cols-2">
          <p>Criado em: {new Date(detail.createdAt).toLocaleString("pt-BR")}</p>
          <p className="break-all font-mono">SHA-256: {detail.contentHashSha256}</p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Conteúdo"
          subtitle="Exatamente como está salvo no catálogo; use 'Editar' para alterar."
        />
        <ScriptContentEditor
          readOnly
          label="Conteúdo do script"
          scriptType={detail.scriptType}
          value={detail.content}
          onChange={() => {}}
          hint="Somente leitura — use 'Editar' para abrir a tela dedicada de edição."
        />
      </Card>

      <Card>
        <CardHeader
          title="Payload de consumo"
          subtitle="O que o agente recebe quando consome este script."
        />
        <div className="space-y-2 rounded-lg border border-border bg-surface-light p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">Conteúdo + hash SHA-256</p>
            <Button
              size="sm"
              variant="secondary"
              loading={consumeMutation.isPending}
              disabled={!detail.isActive}
              title={
                detail.isActive
                  ? undefined
                  : 'Script inativo: reative para poder gerar o payload de consumo'
              }
              onClick={handleConsume}
            >
              Registrar consumo
            </Button>
          </div>
          <p className="text-xs text-muted">
            "Consumir" monta o payload que o agente recebe (conteúdo + hash SHA-256) e grava um
            evento <strong>Consumido</strong> na auditoria. Abrir esta consulta não gera auditoria;
            somente o botão ao lado gera.
          </p>
          {!detail.isActive && (
            <p className="text-xs text-warning">
              Script inativo: a API só gera payload de consumo para scripts ativos. Reative na
              edição para consumir.
            </p>
          )}
          {consumedPayload && (
            <pre className="max-h-48 overflow-auto rounded border border-border bg-background/40 p-2 text-xs text-foreground">
              {JSON.stringify(
                {
                  scriptId: consumedPayload.scriptId,
                  name: consumedPayload.name,
                  version: consumedPayload.version,
                  contentHashSha256: consumedPayload.contentHashSha256,
                },
                null,
                2,
              )}
            </pre>
          )}
        </div>
      </Card>

      <div id="script-audit">
        <Card>
          <CardHeader
            title="Auditoria"
            subtitle="Cada evento mostra o tipo de mudança, quem alterou e os snapshots antes/depois."
          />
          <AutomationScriptAuditTrail scriptId={detail.id} />
        </Card>
      </div>

      <CustomFieldsUsedByPanel scriptId={detail.id} />
    </div>
  );
}
