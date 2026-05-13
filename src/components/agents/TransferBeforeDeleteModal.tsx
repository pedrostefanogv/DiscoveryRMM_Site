import { useState, useEffect, useMemo } from "react";
import { Building2, AlertTriangle, Monitor, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Modal, Button, Select, Input } from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import { useTransferBulkAgents } from "@/hooks/useAgentTransfer";
import { ApiError } from "@/api/client";

interface TransferBeforeDeleteModalProps {
  open: boolean;
  onClose: () => void;
  /** 'site' | 'client' */
  entityType: "site" | "client";
  /** Nome para exibição */
  entityName: string;
  /** IDs dos agentes a serem transferidos */
  agentIds: string[];
  /** Para site: clientId do pai. Para client: o próprio clientId. */
  sourceClientId: string;
  /** Callback chamado APÓS transferência bem-sucedida */
  onSuccess: () => void;
}

export function TransferBeforeDeleteModal({
  open,
  onClose,
  entityType,
  entityName,
  agentIds,
  sourceClientId,
  onSuccess,
}: TransferBeforeDeleteModalProps) {
  const { data: clients } = useClients();
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [reason, setReason] = useState("");

  const transferBulk = useTransferBulkAgents();

  // Auto-select the source client when opening for a site
  useEffect(() => {
    if (open) {
      setSelectedClientId(entityType === "client" ? "" : sourceClientId);
      setSelectedSiteId("");
      setReason("");
    }
  }, [open, entityType, sourceClientId]);

  // Client options - se for exclusão de cliente, não pode transferir para ele mesmo
  const clientOptions = useMemo(() => {
    const allClients = clients ?? [];
    const filtered =
      entityType === "client"
        ? allClients.filter((c) => c.id !== sourceClientId && c.isActive)
        : allClients;

    const opts = [
      { value: "", label: "Selecione um cliente" },
      ...filtered.map((c) => ({ value: c.id, label: c.name })),
    ];
    if (opts.length === 1) {
      return [{ value: "", label: "Nenhum cliente disponível" }];
    }
    return opts;
  }, [clients, entityType, sourceClientId]);

  const { data: sitesForClient } = useSites(selectedClientId, false);

  const siteOptions = useMemo(() => {
    if (!sitesForClient || !selectedClientId) {
      return [{ value: "", label: "Selecione um cliente primeiro" }];
    }
    const filtered = sitesForClient.filter((s) => s.isActive);

    // Se for exclusão de site, também filtra o próprio site
    const available =
      entityType === "site"
        ? filtered.filter((s) => s.id !== sourceClientId)
        : filtered;

    if (available.length === 0) {
      return [{ value: "", label: "Nenhum site disponível" }];
    }
    return [
      { value: "", label: "Selecione o site de destino" },
      ...available.map((s) => ({ value: s.id, label: s.name })),
    ];
  }, [sitesForClient, selectedClientId, entityType, sourceClientId]);

  const handleConfirm = async () => {
    if (!selectedSiteId || agentIds.length === 0) return;

    try {
      const result = await transferBulk.mutateAsync({
        agentIds,
        targetSiteId: selectedSiteId,
        reason: reason.trim() || undefined,
      });

      const targetName =
        sitesForClient?.find((s) => s.id === selectedSiteId)?.name ?? "site de destino";

      toast.success(
        `${result.successCount} agente(s) transferido(s) para ${targetName}. ${result.errorCount > 0 ? `${result.errorCount} falha(s).` : ""}`,
      );

      onSuccess();
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("Falha ao transferir agentes.");
      }
    }
  };

  const canSubmit =
    !!selectedSiteId && agentIds.length > 0 && !transferBulk.isPending;

  const selectedClient = selectedClientId
    ? clients?.find((c) => c.id === selectedClientId)
    : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Transferir agentes antes de excluir`}
      maxWidth="max-w-xl"
    >
      <div className="space-y-4">
        {/* Aviso */}
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="font-medium text-warning">
                {entityType === "site"
                  ? `Este site possui ${agentIds.length} agente(s)`
                  : `Este cliente possui ${agentIds.length} agente(s)`}
              </p>
              <p className="mt-1 text-sm text-slate-300">
                {entityType === "site"
                  ? `O site "${entityName}" será excluído após a transferência dos agentes.`
                  : `O cliente "${entityName}" será excluído após a transferência dos agentes.`}
              </p>
            </div>
          </div>
        </div>

        {/* Resumo dos agentes */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-2 text-sm text-slate-200">
            <Monitor className="h-4 w-4 text-slate-400" />
            <span className="font-medium">{agentIds.length} agente(s)</span>
            <span className="text-slate-500">serão transferidos</span>
          </div>
        </div>

        {/* Client selector - escondido se for site com cliente já selecionado */}
        {entityType === "client" && (
          <Select
            label="Cliente de destino"
            options={clientOptions}
            value={selectedClientId}
            onChange={(e) => {
              setSelectedClientId(e.target.value);
              setSelectedSiteId("");
            }}
          />
        )}

        {entityType === "client" && selectedClient && (
          <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-300">
            <Building2 className="h-4 w-4 text-slate-400" />
            Cliente de destino: <span className="font-medium text-white">{selectedClient.name}</span>
          </div>
        )}

        {/* Site selector */}
        <Select
          label="Site de destino"
          options={siteOptions}
          value={selectedSiteId}
          onChange={(e) => setSelectedSiteId(e.target.value)}
          disabled={!selectedClientId && entityType === "client"}
        />

        {/* Reason */}
        <Input
          label="Motivo (opcional)"
          placeholder="Ex.: Migração para nova estrutura organizacional"
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 500))}
          hint={reason.length > 0 ? `${reason.length}/500` : undefined}
        />

        {/* Loading state */}
        {transferBulk.isPending && (
          <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Transferindo {agentIds.length} agente(s)...
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={transferBulk.isPending}
          >
            Cancelar exclusão
          </Button>
          <Button
            variant="danger"
            onClick={() => { void handleConfirm(); }}
            disabled={!canSubmit}
            loading={transferBulk.isPending}
          >
            {transferBulk.isPending
              ? "Transferindo..."
              : `Transferir ${agentIds.length} agente(s) e excluir`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
