import { useState, useEffect, useMemo } from "react";
import { ArrowRight, Building2, AlertTriangle, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Modal, Button, Select, Input } from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import { useTransferAgent, useValidateTransfer } from "@/hooks/useAgentTransfer";
import { ApiError } from "@/api/client";
import type { Agent } from "@/api";

interface TransferAgentModalProps {
  open: boolean;
  onClose: () => void;
  agent: Agent | null;
}

export function TransferAgentModal({ open, onClose, agent }: TransferAgentModalProps) {
  const { data: clients } = useClients();
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [reason, setReason] = useState("");

  const transferAgent = useTransferAgent();
  const validateQuery = useValidateTransfer(agent?.id ?? "", selectedSiteId);

  const clientOptions = useMemo(() => {
    const opts = [
      { value: "", label: "Selecione um cliente" },
      ...(clients ?? []).map((c) => ({ value: c.id, label: c.name })),
    ];
    return opts;
  }, [clients]);

  // Reset state when modal opens/closes or agent changes
  useEffect(() => {
    if (open) {
      setSelectedClientId("");
      setSelectedSiteId("");
      setReason("");
    }
  }, [open, agent?.id]);

  // Auto-select client when a site is chosen (to keep sync)
  const { data: sitesForClient } = useSites(selectedClientId, false);

  const siteOptions = useMemo(() => {
    if (!sitesForClient) return [{ value: "", label: "Selecione um cliente primeiro" }];
    const filtered = sitesForClient.filter((s) => s.id !== agent?.siteId && s.isActive);
    if (filtered.length === 0) {
      return [{ value: "", label: "Nenhum site disponível" }];
    }
    return [
      { value: "", label: "Selecione o site de destino" },
      ...filtered.map((s) => ({ value: s.id, label: s.name })),
    ];
  }, [sitesForClient, agent?.siteId]);

  const selectedSite = useMemo(() => {
    if (!sitesForClient) return null;
    return sitesForClient.find((s) => s.id === selectedSiteId) ?? null;
  }, [sitesForClient, selectedSiteId]);

  const validation = validateQuery.data;

  const handleSubmit = async () => {
    if (!agent || !selectedSiteId) return;

    try {
      await transferAgent.mutateAsync({
        agentId: agent.id,
        data: {
          targetSiteId: selectedSiteId,
          reason: reason.trim() || undefined,
        },
      });

      const targetSiteName = validation?.targetSiteName ?? selectedSite?.name ?? "site de destino";
      toast.success(`Agente ${agent.displayName ?? agent.hostname} transferido para ${targetSiteName}.`);

      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("Falha ao transferir o agente.");
      }
    }
  };

  const canSubmit = !!selectedSiteId && selectedSiteId !== agent?.siteId && !transferAgent.isPending;

  return (
    <Modal open={open} onClose={onClose} title={`Transferir agente`} maxWidth="max-w-xl">
      <div className="space-y-4">
        {/* Agent info */}
        {agent && (
          <div className="rounded-lg border border-border bg-surface-light p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Building2 className="h-4 w-4 text-muted" />
              {agent.displayName ?? agent.hostname}
            </p>
            <p className="mt-1 text-xs text-muted">
              Cliente atual: <span className="text-muted-foreground">{/* Shown in validation */}</span>
            </p>
          </div>
        )}

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

        {/* Validation preview */}
        {validation && (
          <div className={`rounded-lg border p-3 text-sm ${
            validation.isValid
              ? "border-primary/30 bg-primary/10"
              : "border-danger/30 bg-danger/10"
          }`}>
            {validation.isValid ? (
              <div className="space-y-2">
                <p className="font-medium text-primary">Transferência viável</p>
                <div className="flex items-center gap-2 text-foreground">
                  <span className="text-muted">{validation.previousSiteName}</span>
                  <ArrowRight className="h-4 w-4 text-primary" />
                  <span className="text-primary">{validation.targetSiteName}</span>
                </div>
                <div className="text-xs text-muted">
                  Cliente: {validation.previousClientName}
                  {validation.isCrossClient && (
                    <span className="ml-1">
                      → {validation.targetClientName}
                    </span>
                  )}
                </div>
                {validation.isCrossClient && (
                  <div className="flex items-center gap-1.5 rounded bg-warning/15 px-2 py-1 text-xs text-warning mt-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Transferência entre clientes diferentes. ACL do MeshCentral será reconciliada em segundo plano.
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <p className="font-medium text-danger">Transferência não pode ser realizada</p>
                {validation.messages.map((msg, i) => (
                  <p key={i} className="text-xs text-muted-foreground">• {msg}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Loading validation */}
        {validateQuery.isFetching && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Validando transferência...
          </div>
        )}

        {/* Reason */}
        <Input
          label="Motivo (opcional)"
          placeholder="Ex.: Cliente solicitou realocação do equipamento"
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 500))}
          hint={reason.length > 0 ? `${reason.length}/500` : undefined}
        />

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={transferAgent.isPending}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={() => { void handleSubmit(); }}
            disabled={!canSubmit}
            loading={transferAgent.isPending}
          >
            {transferAgent.isPending ? "Transferindo..." : "Transferir agente"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
