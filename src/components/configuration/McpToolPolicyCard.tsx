import {
  describeMcpToolPolicy,
  parseMcpToolPolicy,
  serializeMcpToolPolicy,
  type McpToolPolicyConfig,
} from "./maintenancePolicy";
import { InheritablePolicyCard } from "./InheritablePolicyCard";

interface Props {
  /** JSON do override local ("" / null quando o escopo herda do nível acima). */
  value: string | null | undefined;
  /** JSON efetivo (herdado), exibido quando o escopo herda. */
  effectiveValue?: string | null;
  /** true = o campo está herdando e o card mostra o valor efetivo em leitura. */
  inherited?: boolean;
  /** false = somente leitura (escopo inferior sem permissão de gestão). */
  canManage?: boolean;
  /** Recebe o JSON serializado. Pode ser async. */
  onSave: (json: string) => void | Promise<void>;
  /** Limpa o override (volta a herdar). Só existe em cliente/site. */
  onClear?: () => void | Promise<void>;
  /** Origem exibida quando o campo está herdando (ex.: "Servidor"). */
  inheritedFrom?: string | null;
}

/** Editor da política de tools MCP do chat do agent (all | allowlist por tenant). */
export function McpToolPolicyCard(props: Props) {
  return (
    <InheritablePolicyCard<McpToolPolicyConfig>
      title="Política de tools MCP (chat do agent)"
      icon="verified_user"
      iconClassName="text-emerald-500"
      parse={parseMcpToolPolicy}
      serialize={serializeMcpToolPolicy}
      describe={describeMcpToolPolicy}
      saveLabel="Salvar política"
      // Allowlist vazia bloqueia TODAS as tools do chat no agent: não deixamos
      // salvar sem pelo menos uma tool (antes a UI salvava e só dizia "salvo").
      blockReasonFor={(cfg) =>
        cfg.mode === "allowlist" && cfg.allow.length === 0
          ? "Allowlist vazia bloqueia todas as tools do chat no agent. Informe ao menos uma tool (ou use “Todas as tools”) antes de salvar."
          : null
      }
      {...props}
    >
      {({ cfg, update, readOnly }) => (
        <>
          <div className="flex gap-4 text-sm text-slate-600 dark:text-slate-300">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="mcp-policy-mode"
                checked={cfg.mode === "all"}
                onChange={() => update({ mode: "all" })}
                disabled={readOnly}
              />
              Todas as tools
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="mcp-policy-mode"
                checked={cfg.mode === "allowlist"}
                onChange={() => update({ mode: "allowlist" })}
                disabled={readOnly}
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
                  onChange={(e) =>
                    update({
                      allow: e.target.value
                        .split(/\r?\n/)
                        .map((line) => line.trim())
                        .filter((line) => line !== ""),
                    })
                  }
                  disabled={readOnly}
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
        </>
      )}
    </InheritablePolicyCard>
  );
}
