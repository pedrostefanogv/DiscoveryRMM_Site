import { useState } from "react";
import { Zap, Loader2, Wifi, WifiOff, Info } from "lucide-react";
import toast from "react-hot-toast";
import type { Agent, WakeOnLanResponse } from "@/api";

export interface WakeOnLanModalProps {
  agent: Agent & { clientName?: string; clientId?: string };
  onClose: () => void;
  onConfirm: (data: { broadcastAddress?: string }) => Promise<WakeOnLanResponse>;
  isLoading?: boolean;
}

export default function WakeOnLanModal({
  agent,
  onClose,
  onConfirm,
  isLoading = false,
}: WakeOnLanModalProps) {
  const [broadcastAddress, setBroadcastAddress] = useState("");

  const handleSubmit = async () => {
    try {
      const response = await onConfirm({
        broadcastAddress: broadcastAddress.trim() || undefined,
      });

      toast.success(
        `Wake-on-LAN enviado por ${response.onlineAgentsInSite} agente(s) online para ${response.targetHostname}. MAC: ${response.targetMacAddress} · Broadcast: ${response.broadcastAddress}`,
      );
      onClose();
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : "Falha ao enviar pacote Wake-on-LAN.";
      toast.error(msg);
    }
  };

  const displayName = agent.displayName ?? agent.hostname;
  const isOnline = agent.isOnline;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Wake-on-LAN</h3>
            <p className="truncate text-sm text-muted">{displayName}</p>
          </div>
        </div>

        {/* Status */}
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface-light p-3">
          {isOnline ? (
            <Wifi className="h-4 w-4 text-success" />
          ) : (
            <WifiOff className="h-4 w-4 text-muted" />
          )}
          <span className="text-sm text-muted-foreground">
            O agente está{" "}
            <strong className={isOnline ? "text-success" : "text-warning"}>
              {isOnline ? "Online" : "Offline"}
            </strong>
          </span>
        </div>

        {/* Info */}
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-violet-500/20 bg-violet-500/10 p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
          <div className="text-xs text-violet-300 space-y-1">
            <p>
              O comando será enviado para <strong>todos os agentes online</strong> no
              mesmo site, que enviarão o Magic Packet via broadcast UDP.
            </p>
            <p>
              Múltiplos agentes enviam o pacote para garantir redundância e
              alcançar o dispositivo mesmo em subnets diferentes.
            </p>
          </div>
        </div>

        {/* Broadcast address */}
        <div className="mb-6">
          <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
            Endereço de broadcast (opcional)
          </label>
          <input
            type="text"
            value={broadcastAddress}
            onChange={(e) => setBroadcastAddress(e.target.value)}
            placeholder="255.255.255.255"
            className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground placeholder-muted font-mono transition-colors focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          <p className="mt-1 text-xs text-muted">
            Deixe em branco para usar o broadcast padrão (255.255.255.255).
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isLoading ? "Enviando..." : "Enviar Magic Packet"}
          </button>
        </div>
      </div>
    </div>
  );
}
