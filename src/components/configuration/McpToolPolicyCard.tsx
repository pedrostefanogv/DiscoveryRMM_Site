import { useState } from "react";
import { Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui";
import { parseMcpToolPolicy, serializeMcpToolPolicy, type McpToolPolicyConfig } from "./maintenancePolicy";

interface Props {
  /** JSON cru do campo (mcpToolPolicyJson) ou null/"" para herdar/ausente. */
  value: string | null | undefined;
  saving?: boolean;
  /** false = somente leitura (escopo inferior sem permissão de gestão). */
  canManage?: boolean;
  /** Recebe o JSON serializado; string vazia = limpar (herdar/default). */
  onSave: (json: string) => void;
  inheritedFrom?: string | null;
}

/** Editor da política de tools MCP do chat do agent (all | allowlist por tenant). */
export function McpToolPolicyCard({ value, saving, canManage, onSave, inheritedFrom }: Props) {
  const [cfg, setCfg] = useState<McpToolPolicyConfig>(() => parseMcpToolPolicy(value));
  const [dirty, setDirty] = useState(false);

  const update = (patch: Partial<McpToolPolicyConfig>) => {
    setCfg((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const setAllowFromText = (text: string) => {
    const allow = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "");
    update({ allow });
  };

  const readOnly = saving || canManage === false;
  const save = () => onSave(serializeMcpToolPolicy(cfg));

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-500" />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Política de tools MCP (chat do agent)
        </span>
      </div>

      {inheritedFrom ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">Herdando de: {inheritedFrom}</p>
      ) : null}

      <div className="flex gap-4 text-sm text-slate-600 dark:text-slate-300">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="mcp-policy-mode"
            checked={cfg.mode === "all"}
            onChange={() => update({ mode: "all" })}
            disabled={saving}
          />
          Todas as tools
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="mcp-policy-mode"
            checked={cfg.mode === "allowlist"}
            onChange={() => update({ mode: "allowlist" })}
            disabled={saving}
          />
          Allowlist (só as listadas)
        </label>
      </div>

      {cfg.mode === "allowlist" ? (
        <div className="space-y-1">
          <label className="text-xs text-slate-600 dark:text-slate-300">
            Tools permitidas (uma por linha)
            <textarea
              className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 font-mono text-xs text-slate-700 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              rows={6}
              value={cfg.allow.join("\n")}
              onChange={(e) => setAllowFromText(e.target.value)}
              disabled={saving}
              placeholder={"get_agent_alerts\nget_agent_labels\ninstall_update_all"}
            />
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ferramentas fora da lista são recusadas no agent com{" "}
            <code className="font-mono">tool_not_allowed</code>. Tools destrutivas continuam pedindo
            consentimento do usuário, independente da lista.
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Todas as tools do catálogo são executáveis (comportamento atual).
        </p>
      )}

      <Button size="sm" onClick={save} disabled={readOnly || !dirty}>
        <Save className="mr-1 h-4 w-4" />
        Salvar política
      </Button>
    </div>
  );
}
