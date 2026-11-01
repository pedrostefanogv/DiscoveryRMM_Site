import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, Button } from "@/components/ui";

/**
 * Base dos cards de política que suportam herança por escopo (janela de
 * manutenção, tools MCP do chat). Concentra o que era duplicado entre eles:
 *
 * - estado local do card ressincronizado com o valor salvo (refetch, troca de
 *   escopo, import de configuração);
 * - modo "herdando": mostra o valor efetivo em leitura até o admin pedir para
 *   ajustar neste escopo (evita override silencioso);
 * - "não salvo" + salvamento assíncrono com spinner próprio (não trava com o
 *   PATCH de outro card da página);
 * - "Voltar a herdar" quando o escopo tem override;
 * - bloqueio de salvamento com motivo (ex.: allowlist vazia).
 */
export interface InheritablePolicyCardRenderArgs<T> {
  cfg: T;
  update: (patch: Partial<T>) => void;
  /** true = controles devem ficar somente leitura. */
  readOnly: boolean;
}

export interface InheritablePolicyCardProps<T> {
  title: string;
  icon: string;
  iconClassName?: string;
  /** JSON do override local ("" / null quando o escopo herda do nível acima). */
  value: string | null | undefined;
  /** JSON efetivo (herdado), exibido no modo herdando. */
  effectiveValue?: string | null;
  /** true = o campo está herdando do nível acima. */
  inherited?: boolean;
  /** false = somente leitura (escopo inferior sem permissão de gestão). */
  canManage?: boolean;
  /** Origem exibida no chip de herança (ex.: "Servidor"). */
  inheritedFrom?: string | null;
  parse: (json: string | null | undefined) => T;
  serialize: (cfg: T) => string;
  /** Resumo de uma linha do valor em vigor (modo herdando). */
  describe: (cfg: T) => string;
  onSave: (json: string) => void | Promise<void>;
  /** Limpa o override (volta a herdar). Só existe em cliente/site. */
  onClear?: () => void | Promise<void>;
  saveLabel: string;
  /** Motivo que impede o salvamento (mostrado ao usuário). */
  blockReason?: string | null;
  /** Controle extra no cabeçalho (ex.: checkbox "Ativa"). */
  renderHeaderControl?: (args: InheritablePolicyCardRenderArgs<T>) => ReactNode;
  children: (args: InheritablePolicyCardRenderArgs<T>) => ReactNode;
}

export function InheritablePolicyCard<T>({
  title,
  icon,
  iconClassName,
  value,
  effectiveValue,
  inherited,
  canManage,
  inheritedFrom,
  parse,
  serialize,
  describe,
  onSave,
  onClear,
  saveLabel,
  blockReason,
  renderHeaderControl,
  children,
}: InheritablePolicyCardProps<T>) {
  const [cfg, setCfg] = useState<T>(() => parse(inherited ? effectiveValue : value));
  const [dirty, setDirty] = useState(false);
  // Herdando: controles em leitura até o admin pedir para ajustar neste escopo.
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const isInherited = !!inherited && !editing;

  // parse() é estável (função de módulo), mas fica em ref para o efeito não
  // reexecutar a cada render por causa de um callback inline.
  const parseRef = useRef(parse);
  parseRef.current = parse;

  useEffect(() => {
    setCfg(parseRef.current(inherited ? effectiveValue : value));
    setDirty(false);
    setEditing(false);
  }, [value, effectiveValue, inherited]);

  const update = (patch: Partial<T>) => {
    setCfg((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const readOnly = busy || canManage === false || isInherited;
  const renderArgs: InheritablePolicyCardRenderArgs<T> = { cfg, update, readOnly };

  const save = async () => {
    if (blockReason) return;
    setBusy(true);
    try {
      await onSave(serialize(cfg));
      // Só limpa o marcador quando o salvamento conclui; em erro o botão segue
      // habilitado para o usuário tentar de novo.
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
      // idem: erro reportado pelo pai
    } finally {
      setBusy(false);
    }
  };

  const cancelEditing = () => {
    setCfg(parse(effectiveValue));
    setDirty(false);
    setEditing(false);
  };

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon name={icon} className={`h-4 w-4 ${iconClassName ?? ""}`} />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</span>
        </div>
        {isInherited ? (
          <span className="rounded-full border border-border bg-surface-light px-2 py-0.5 text-[11px] font-medium text-muted">
            herdando de {inheritedFrom ?? "nível superior"}
          </span>
        ) : (
          renderHeaderControl?.(renderArgs)
        )}
      </div>

      {isInherited ? (
        <p className="rounded-lg border border-border bg-surface-light px-3 py-2 text-xs text-muted">
          Valor em vigor neste escopo: <strong>{describe(cfg)}</strong>. Ajuste abaixo para criar um
          override próprio.
        </p>
      ) : null}

      {children(renderArgs)}

      {blockReason ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-800 dark:text-amber-200">
          {blockReason}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {dirty && (
          <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">não salvo</span>
        )}
        {isInherited ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setCfg(parse(effectiveValue));
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
              <Button size="sm" variant="ghost" onClick={cancelEditing} disabled={busy}>
                Cancelar
              </Button>
            ) : null}
            <Button
              size="sm"
              onClick={() => void save()}
              disabled={readOnly || !dirty || !!blockReason}
              loading={busy}
            >
              <Icon name="save" className="mr-1 h-4 w-4" />
              {saveLabel}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
