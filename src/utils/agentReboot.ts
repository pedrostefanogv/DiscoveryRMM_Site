/**
 * Motivos de reinício pendente reportados pela sonda do agente.
 * O backend devolve um JSON array em pendingRebootReasons.
 */
const REASON_LABELS: Record<string, string> = {
  windows_update: "Windows Update",
  cbs: "Component Based Servicing",
  file_rename: "Arquivos em uso (PendingFileRenameOperations)",
  computer_rename: "Renomeação do computador",
  servicing: "Manutenção de componentes",
};

export function parseAgentRebootReasons(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function agentRebootTooltip(raw: string | null | undefined): string {
  const reasons = parseAgentRebootReasons(raw).map((reason) => REASON_LABELS[reason] ?? reason);
  if (reasons.length === 0) return "Reinício pendente (motivo não informado)";
  return "Reinício pendente: " + reasons.join(", ");
}

export function hasPendingReboot(agent: { pendingReboot?: boolean | null }): boolean {
  return agent.pendingReboot === true;
}
