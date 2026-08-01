import {
  type StartRemoteSessionRequest,
} from "@/api/remote-sessions";
import { getApiAccessToken } from "@/api/client";

export interface OpenRemoteSessionParams {
  agentId: string;
  kind?: StartRemoteSessionRequest["kind"];
  transport?: StartRemoteSessionRequest["transport"];
  quality?: StartRemoteSessionRequest["quality"];
  codec?: StartRemoteSessionRequest["codec"];
  durationMinutes?: number;
  monitorIndex?: number;
}

export class PopupBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PopupBlockedError";
  }
}

const DEFAULT_PARAMS: Partial<StartRemoteSessionRequest> = {
  transport: "nats",
  quality: "unlimited",
  codec: "webp",
  durationMinutes: 30,
};

/**
 * Abre a janela de acesso remoto SEM iniciar nenhuma sessão automaticamente.
 * Cada aba (Tela, Terminal, Arquivos) tem seu próprio botão "Conectar" que
 * inicia a sessão sob demanda — evita consumir recursos do agent sem necessidade.
 */
export async function openRemoteSessionPopup({
  agentId,
  transport,
  quality,
  codec,
}: OpenRemoteSessionParams) {
  const query = new URLSearchParams({
    agentId,
    transport: transport ?? DEFAULT_PARAMS.transport ?? "nats",
    quality: quality ?? DEFAULT_PARAMS.quality ?? "unlimited",
    codec: codec ?? DEFAULT_PARAMS.codec ?? "webp",
  });

  const accessToken = getApiAccessToken();
  if (accessToken) {
    query.set("accessToken", accessToken);
  }

  const popup = window.open(
    `/agents/remote-session?${query.toString()}`,
    `remote-${agentId}`,
    "width=1024,height=768,toolbar=no,menubar=no,scrollbars=no,resizable=yes,location=no,status=no",
  );

  if (!popup) {
    throw new PopupBlockedError(
      "Popup bloqueada pelo navegador. Permita popups para abrir o acesso remoto.",
    );
  }

  popup.focus();
}
