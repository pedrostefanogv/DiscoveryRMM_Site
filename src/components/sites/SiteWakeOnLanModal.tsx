import { Zap, Info } from "lucide-react";
import toast from "react-hot-toast";
import { Modal, Button } from "@/components/ui";
import type { SiteWakeOnLanResponse } from "@/api";

interface SiteWakeOnLanModalProps {
  open: boolean;
  onClose: () => void;
  siteName: string;
  onConfirm: () => Promise<SiteWakeOnLanResponse>;
  isLoading?: boolean;
}

export default function SiteWakeOnLanModal({
  open,
  onClose,
  siteName,
  onConfirm,
  isLoading = false,
}: SiteWakeOnLanModalProps) {
  const handleSubmit = async () => {
    try {
      const response = await onConfirm();
      toast.success(
        `Wake-on-LAN enviado para ${response.targetCount} agente(s) offline (${response.macAddresses.length} MAC(s)), via ${response.onlineRelayCount} agente(s) online.`,
      );
      onClose();
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Falha ao enviar pacote Wake-on-LAN.";
      toast.error(msg);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Wake-on-LAN do site" maxWidth="max-w-lg">
      <div className="space-y-4">
        {/* Header icon + info */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-foreground">{siteName}</p>
            <p className="text-sm text-muted">
              Acordar todos os agentes offline do site
            </p>
          </div>
        </div>

        {/* Info */}
        <div className="flex items-start gap-2 rounded-lg border border-violet-500/20 bg-violet-500/10 p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              O Magic Packet será enviado para <strong className="text-foreground">
              todos os agentes offline que possuam MAC</strong> do site.
            </p>
            <p>
              Se um agente tiver vários adaptadores de rede, o pacote será
              enviado para todos os MACs.
            </p>
            <p>
              Os agentes <strong className="text-foreground">online</strong> do site
              atuarão como relays para retransmitir o pacote na rede local.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => { void handleSubmit(); }} disabled={isLoading} loading={isLoading}>
            {isLoading ? "Enviando..." : "Enviar Magic Packet"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}