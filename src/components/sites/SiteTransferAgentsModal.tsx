import { useState, useEffect, useMemo } from "react";
import { AlertTriangle, Monitor, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Modal, Button, Select, Input } from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import { useTransferBulkAgents } from "@/hooks/useAgentTransfer";
import { ApiError } from "@/api/client";

interface SiteTransferAgentsModalProps {
  open: boolean;
  onClose: () => void;
  /** Site de origem (nome) */
  sourceSiteName: string;
  /** IDs dos agentes a serem transferidos (todos do site) */
  agentIds: string[];
  /** Callback chamado após transferência bem-sucedida */
  onSuccess: () => void;
}

export default function SiteTransferAgentsModal({
  open,
  onClose,
  sourceSiteName,
  agentIds,
  onSuccess,
}: SiteTransferAgentsModalProps) {
  const { data: clients } = useClients();
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [reason, setReason] = useState("");

  const transferBulk = useTransferBulkAgents();

  useEffect(() => {
    if (open) {
      setSelectedClientId("");
      setSelectedSiteId("");
      setReason("");
    }
  }, [open]);

  const clientOptions = useMemo(() => {
    const allClients = clients ?? [];
    const opts = [
      { value: "", label: "Selecione um cliente" },
      ...allClients
        .filter((c) => c.isActive)
        .map((c) => ({ value: c.id, label: c.name })),
    ];
    if (opts.length === 1) {
      return [{ value: "", label: "Nenhum cliente disponível" }];
    }
    return opts;
  }, [clients]);

  const { data: sitesForClient } = useSites(selectedClientId, false);

  const siteOptions = useMemo(() => {
    if (!sitesForClient || !selectedClientId) {
      return [{ value: "", label: "Selecione um cliente primeiro" }];
    }
    const filtered = sitesForClient.filter((s) => s.isActive);
    const available = filtered.filter(
      (s) => s.id !== undefined && s.name !== sourceSiteName,
    );
    if (available.length === 0) {
      return [{ value: "", label: "Nenhum site disponível" }];
    }
    return [
      { value: "", label: "Selecione o site de destino" },
      ...available.map((s) => ({ value: s.id, label: s.name })),
    ];
  }, [sitesForClient, selectedClientId, sourceSiteName]);

  const handleConfirm = async () => {
    if (!selectedSiteId || agentIds.length === 0) return;

    try {
      const result = await transferBulk.mutateAsync({
        agentIds,
        targetSiteId: selectedSiteId,
        reason: reason.trim() || undefined,
      });

      const targetName =
        sitesForClient?.find((s) => s.id === selectedSiteId)?.name ??
        "site de destino";

      toast.success(
        `${result.successCount} agente(s) transferido(s) para ${targetName}. ${result.errorCount > 0 ? `${result.errorCount} falha(s).` : ""}`,
      );

      onSuccess();
      onClose();
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Transferir agentes do site"
      maxWidth="max-w-xl"
    >
      <div className="space-y-4">
        {/* Aviso */}
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="font-medium text-warning">
                Isso irá transferir TODOS os {agentIds.length} agente(s) do site“
                {sourceSiteName}”.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                O site em si não será excluído — apenas os agentes vão para o
                site de destino. Dados históricos (tickets, configuração) do
                site permanecem no site de origem.
              </p>
            </div>
          </div>
        </div>

        {/* Resumo dos agentes */}
        <div className="rounded-lg border border-border bg-surface-light p-3">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Monitor className="h-4 w-4 text-muted" />
            <span className="font-medium">{agentIds.length} agente(s)</span>
            <span className="text-muted">serão transferidos do site de origem</span>
          </div>
        </div>

        {/* Client selector */}
        <Select
          label="Cliente de destino"
          options={clientOptions}
          value={selectedClientId}
          onChange={(e) => {
            setSelectedClientId(e.target.value);
            setSelectedSiteId("");
          }}
        />

        {/* Site selector */}
        <Select
          label="Site de destino"
          options={siteOptions}
          value={selectedSiteId}
          onChange={(e) => setSelectedSiteId(e.target.value)}
          disabled={!selectedClientId}
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
          <Button variant="secondary" onClick={onClose} disabled={transferBulk.isPending}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={() => { void handleConfirm(); }}
            disabled={!canSubmit}
            loading={transferBulk.isPending}
          >
            {transferBulk.isPending
              ? "Transferindo..."
              : `Transferir ${agentIds.length} agente(s)`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}