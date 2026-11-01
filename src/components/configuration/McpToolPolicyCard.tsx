import { useEffect, useId, useState } from "react";
import { Icon, Button } from "@/components/ui";
import {
  describeMcpToolPolicy,
  parseMcpToolPolicy,
  serializeMcpToolPolicy,
  type McpToolPolicyConfig,
} from "./maintenancePolicy";

interface Props {
  /** JSON do override local ("" / null quando o escopo herda do nível acima). */
  value: string | null | undefined;
  /** JSON efetivo (herdado), exibido quando o escopo herda. */
  effectiveValue?: string | null;
  /** true = o campo está herdando e o card mostra o valor efetivo em leitura. */
  inherited?: boolean;
  /** false = somente leitura (escopo inferior sem permissão de gestão). */
  canManage?: boolean;
  /** Recebe o JSON serializado. Pode ser async: o card aguarda antes de limpar o dirty. */
  onSave: (json: string) => void | Promise<void>;
  /** Limpa o override (volta a herdar). Só existe em cliente/site. */
  onClear?: () => void | Promise<void>;
  /** Origem exibida quando o campo está herdando (ex.: "Servidor"). */
  inheritedFrom?: string | null;
}

/** Editor da política de tools MCP do chat do agent (all | allowlist por tenant). */
export function McpToolPolicyCard({
  value,
  effectiveValue,
  inherited,
  canManage,
  onSave,
  onClear,
  inheritedFrom,
}: Props) {
  const [cfg, setCfg] = useState<McpToolPolicyConfig>(() =>
    parseMcpToolPolicy(inherited ? effectiveValue : value),
  );
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  // name único por instância: dois cards na mesma tela não podem compartilhar o
  // mesmo grupo de radios (o navegador os trataria como um grupo só).
  const radioGroupName = useId() + "-mcp-policy-mode";

  const isInherited = !!inherited && !editing;

  // Ressincroniza quando o valor salvo muda (refetch, troca de escopo/tenant,
  // import de configuração).
  useEffect(() => {
    setCfg(parseMcpToolPolicy(inherited ? effectiveValue : value));
    setDirty(false);
    setEditing(false);
  }, [value, effectiveValue, inherited]);

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

  const readOnly = busy || canManage === false || isInherited;
  // Allowlist vazia bloqueia TODAS as tools do chat no agent: não deixamos
  // salvar sem pelo menos uma tool (antes a UI salvava e só mostrava sucesso).
  const emptyAllowlist = cfg.mode === "allowlist" && cfg.allow.length === 0;

  const save = async () => {
    if (emptyAllowlist) return;
    setBusy(true);
    try {
      await onSave(serializeMcpToolPolicy(cfg));
      setDirty(false);
      setEditing(false);
    } catch {
      // O pai já exibe o erro (toast); aqui basta manter o card sujo.
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (!onClear) return;
    setBusy(true);
    try {
      await onClear();
      setDirty(false);
      setEditing(false);
    } catch {
      // idem
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon name="verified_user" className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Política de tools MCP (chat do agent)
          </span>
        </div>
        {isInherited ? (
          <span className="rounded-full border border-border bg-surface-light px-2 py-0.5 text-[11px] font-medium text-muted">
            herdando de {inheritedFrom ?? "nível superior"}
          </span>
        ) : null}
      </div>

      {isInherited ? (
        <p className="rounded-lg border border-border bg-surface-light px-3 py-2 text-xs text-muted">
          Valor em vigor neste escopo: <strong>{describeMcpToolPolicy(cfg)}</strong>. Ajuste abaixo para
          criar um override próprio.
        </p>
      ) : null}

      <div className="flex gap-4 text-sm text-slate-600 dark:text-slate-300">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={radioGroupName}
            checked={cfg.mode === "all"}
            onChange={() => update({ mode: "all" })}
            disabled={readOnly}
          />
          Todas as tools
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={radioGroupName}
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
              onChange={(e) => setAllowFromText(e.target.value)}
              disabled={readOnly}
              placeholder={"get_agent_alerts\nget_agent_labels\ninstall_update_all"}
            />
          </label>
          {emptyAllowlist ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-800 dark:text-amber-200">
              Allowlist vazia bloqueia todas as tools do chat no agent. Informe ao menos uma tool
              (ou use “Todas as tools”) antes de salvar.
            </p>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ferramentas fora da lista são recusadas no agent com{" "}
              <code className="font-mono">tool_not_allowed</code>. Tools destrutivas continuam pedindo
              consentimento do usuário, independente da lista.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Todas as tools do catálogo são executáveis (comportamento atual).
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {dirty && (
          <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">não salvo</span>
        )}
        {isInherited ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setCfg(parseMcpToolPolicy(effectiveValue));
              setEditing(true);
              setDirty(true);
            }}
            disabled={canManage === false}
          >
            <Icon name="edit" className="mr-1 h-4 w-4" />
            Ajustar neste escopo
          </Button>
        ) : (
          <>
            {onClear && !inherited ? (
              <Button size="sm" variant="ghost" onClick={() => void clear()} disabled={busy}>
                <Icon name="undo" className="mr-1 h-4 w-4" />
                Voltar a herdar
              </Button>
            ) : null}
            {editing ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  // Cancelar descarta a edição e volta a exibir o valor herdado.
                  setCfg(
                    parseMcpToolPolicy(effectiveValue),
                  );
                  setDirty(false);
                  setEditing(false);
                }}
                disabled={busy}
              >
                Cancelar
              </Button>
            ) : null}
            <Button
              size="sm"
              onClick={() => void save()}
              disabled={readOnly || !dirty || emptyAllowlist}
              loading={busy}
            >
              <Icon name="save" className="mr-1 h-4 w-4" />
              Salvar política
            </Button>
          </>
        )}
      </div>
    </div>
  );
}