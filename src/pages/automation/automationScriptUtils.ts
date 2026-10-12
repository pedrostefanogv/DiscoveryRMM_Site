import { AutomationScriptType } from "@/api";

/**
 * Rótulo legível do tipo de script.
 *
 * A API pode devolver o enum numérico (AutomationScriptType) ou a string com o
 * nome do tipo, dependendo da versão/serialização; os dois casos são aceitos.
 */
export function scriptTypeLabel(value: unknown): string {
  if (value === AutomationScriptType.PowerShell || value === "PowerShell") return "PowerShell";
  if (value === AutomationScriptType.Shell || value === "Shell") return "Shell";
  if (value === AutomationScriptType.Python || value === "Python") return "Python";
  if (value === AutomationScriptType.Batch || value === "Batch") return "Batch";
  if (value === AutomationScriptType.Custom || value === "Custom") return "Custom";
  return String(value ?? "-");
}

/** Rótulo em pt-BR do tipo de evento da auditoria do script. */
export function scriptChangeTypeLabel(value: unknown): string {
  switch (String(value)) {
    case "Created":
      return "Criado";
    case "Updated":
      return "Atualizado";
    case "Deleted":
      return "Excluído";
    case "Consumed":
      return "Consumido";
    case "Activated":
      return "Ativado";
    case "Deactivated":
      return "Desativado";
    default:
      return String(value ?? "-");
  }
}

/** Formata um JSON guardado como texto; devolve o texto original se inválido. */
export function prettyJson(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text) return "";
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
