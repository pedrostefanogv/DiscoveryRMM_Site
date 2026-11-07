import {
  type StartRemoteSessionRequest,
} from "@/api/remote-sessions";

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

/**
 * Abre a janela de acesso remoto SEM iniciar nenhuma sessão automaticamente.
 * Cada aba (Tela, Terminal, Arquivos) tem seu próprio botão "Conectar" que
 * inicia a sessão sob demanda — evita consumir recursos do agent sem necessidade.
 */
export async function openRemoteSessionPopup({
  agentId,
}: OpenRemoteSessionParams) {
  // URL enxuta (fix 17/09): a popup inicia a sessão sob DEMANDA (botão
  // "Conectar" de cada aba) — transport/quality/codec da URL eram legado do
  // fluxo antigo (o transport webrtc nem existe mais: o agent só suporta
  // nats) e o modo auto ajusta qualidade/codec em runtime, tornando os
  // defaults da URL irrelevantes. A página usa seus próprios defaults
  // ('nats'/'unlimited'/'webp').
  //
  // SEGURANÇA (auditoria 2026-11-07): o access token NÃO vai mais na query
  // string. Ele ia para o histórico do navegador, para o header Referer da
  // navegação e para qualquer log intermediário. O launcher de debug já
  // recusava esse padrão; o de acesso remoto o usava — a inconsistência era
  // o bug. A popup obtém o token em memória pelo canal cross-tab
  // (TOKEN_REQUEST), que é o mesmo mecanismo já existente para refresh.
  const query = new URLSearchParams({
    agentId,
  });

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
