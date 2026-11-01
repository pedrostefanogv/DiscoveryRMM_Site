import { useEffect, useState } from "react";
import { Input } from "@/components/ui";
import {
  DAY_LABELS,
  describeMaintenanceWindow,
  parseMaintenanceWindow,
  serializeMaintenanceWindow,
  type MaintenanceWindowConfig,
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

const MIN_DURATION_MINUTES = 1;
const MAX_DURATION_MINUTES = 720;
const MAX_REBOOT_GRACE_SECONDS = 3600;

/** Editor da janela de manutenção do agent (reboot/patches dentro da janela). */
export function MaintenanceWindowCard(props: Props) {
  // Rascunho textual da duração: permite apagar/redigitar sem o campo saltar
  // para o mínimo/60 no meio da digitação.
  const [durationDraft, setDurationDraft] = useState<string | null>(null);

  // O card base ressincroniza o cfg quando o valor muda; o rascunho acompanha.
  useEffect(() => {
    setDurationDraft(null);
  }, [props.value, props.effectiveValue, props.inherited]);

  return (
    <InheritablePolicyCard<MaintenanceWindowConfig>
      title="Janela de manutenção (reboot/patches)"
      icon="schedule"
      iconClassName="text-indigo-500"
      parse={parseMaintenanceWindow}
      serialize={serializeMaintenanceWindow}
      describe={describeMaintenanceWindow}
      saveLabel="Salvar janela"
      {...props}
      renderHeaderControl={({ cfg, update, readOnly }) => (
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            disabled={readOnly}
          />
          Ativa
        </label>
      )}
    >
      {({ cfg, update, readOnly }) =>
        cfg.enabled ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {Object.entries(DAY_LABELS).map(([day, label]) => (
                <label
                  key={day}
                  className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300"
                >
                  <input
                    type="checkbox"
                    checked={cfg.daysOfWeek.includes(Number(day))}
                    onChange={() =>
                      update({
                        daysOfWeek: cfg.daysOfWeek.includes(Number(day))
                          ? cfg.daysOfWeek.filter((d) => d !== Number(day))
                          : [...cfg.daysOfWeek, Number(day)].sort((a, b) => a - b),
                      })
                    }
                    disabled={readOnly}
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Nenhum dia marcado = janela válida todos os dias.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-xs text-slate-600 dark:text-slate-300">
                Início (UTC)
                <Input
                  type="time"
                  value={cfg.startUtc}
                  onChange={(e) => update({ startUtc: e.target.value })}
                  disabled={readOnly}
                  className="mt-1"
                />
              </label>
              <label className="text-xs text-slate-600 dark:text-slate-300">
                Duração (min)
                <Input
                  type="number"
                  min={MIN_DURATION_MINUTES}
                  max={MAX_DURATION_MINUTES}
                  value={durationDraft ?? String(cfg.durationMinutes)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setDurationDraft(raw);
                    if (raw.trim() === "") return;
                    const parsed = Number(raw);
                    if (!Number.isFinite(parsed)) return;
                    update({
                      durationMinutes: Math.min(
                        MAX_DURATION_MINUTES,
                        Math.max(MIN_DURATION_MINUTES, Math.round(parsed)),
                      ),
                    });
                  }}
                  onBlur={() => setDurationDraft(null)}
                  disabled={readOnly}
                  className="mt-1"
                />
              </label>
              <label className="text-xs text-slate-600 dark:text-slate-300">
                Aviso de reboot (s)
                <Input
                  type="number"
                  min={0}
                  max={MAX_REBOOT_GRACE_SECONDS}
                  value={cfg.rebootGraceSeconds}
                  onChange={(e) => {
                    const parsed = Number(e.target.value);
                    update({
                      rebootGraceSeconds: Number.isFinite(parsed)
                        ? Math.min(MAX_REBOOT_GRACE_SECONDS, Math.max(0, Math.round(parsed)))
                        : 0,
                    });
                  }}
                  disabled={readOnly}
                  className="mt-1"
                />
              </label>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Aviso 0 s = reboot imediato, sem aviso ao usuário. Duração entre {MIN_DURATION_MINUTES} e{" "}
              {MAX_DURATION_MINUTES} min.
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Desligada: patches e reboots executam imediatamente (comportamento atual).
          </p>
        )
      }
    </InheritablePolicyCard>
  );
}
