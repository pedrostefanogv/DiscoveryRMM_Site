import { describe, expect, it } from "vitest";

// Guarda de regressão (fonte) do compositor do chat de suporte: a área de
// digitação usa a caixa única do Chat IA do agent (textarea como corpo e
// ícones no canto inferior direito) e oferece o atalho de CONTROLE REMOTO da
// máquina sem o atendente precisar voltar para a listagem/detalhe do agent.
//
// Fontes lidas via import.meta.glob (Vite): o tsconfig do app não expõe as
// APIs de Node para os testes.
const SOURCES = import.meta.glob(
  ['./*.tsx', '../agents/AgentSupportChatWindow.tsx', '../agents/RemoteSession.tsx'],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
) as Record<string, string>;

function source(name: string): string {
  const entry = Object.entries(SOURCES).find(([path]) => path.endsWith(name));
  if (!entry) throw new Error('fonte não encontrada: ' + name);
  return entry[1];
}

describe("composer do chat de suporte — caixa única e controle remoto", () => {
  it("mantém o textarea e os ícones na mesma caixa, no canto inferior direito", () => {
    const panel = source("SupportChatPanel.tsx");
    expect(panel).toContain("focus-within:border-primary/60");
    expect(panel).toContain("absolute right-2 bottom-2");
    // Reserva de espaço para os TRÊS ícones (controle remoto, anexar, enviar).
    expect(panel).toContain("pr-28");
  });

  it("só oferece o controle remoto com o agent informado e permissão de execução", () => {
    const panel = source("SupportChatPanel.tsx");
    expect(panel).toContain("remoteControlAgentId");
    expect(panel).toContain("REMOTE_CONTROL_PERMISSIONS");
    expect(panel).toContain("canRemoteControl && (");
    expect(panel).toContain("openRemoteSessionPopup({ agentId: remoteControlAgentId");
  });

  it("a janela de CONTROLE REMOTO também abre o chat com a mesma máquina", () => {
    const remote = source("RemoteSession.tsx");
    expect(remote).toContain("openAgentSupportChatWindow(agentId, true)");
    expect(remote).toContain("Abrir o chat de suporte com esta máquina");
    expect(remote).toContain("MessageSquare");
  });

  it("os dois pontos de entrada informam o agent da máquina ao painel", () => {
    expect(source("TicketChatPanel.tsx")).toContain("remoteControlAgentId={agentId ?? null}");
    expect(source("AgentSupportChatWindow.tsx")).toContain("remoteControlAgentId={id}");
  });
});
