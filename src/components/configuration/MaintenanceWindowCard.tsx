import { useState } from "react";
import { Clock, Save } from "lucide-react";
import { Button, Input } from "@/components/ui";
import {
  DAY_LABELS,
  parseMaintenanceWindow,
  serializeMaintenanceWindow,
  type MaintenanceWindowConfig,
} from "./maintenancePolicy";

interface Props {
  /** JSON cru do campo (maintenanceWindowJson) ou null/"" para herdar/ausente. */
  value: string | null | undefined;
  saving?: boolean;
  /** false = somente leitura (escopo inferior sem permissão de gestão). */
  canManage?: boolean;
  /** Recebe o JSON serializado; string vazia = limpar (herdar no cliente/site, default no servidor). */
  onSave: (json: string) => void;
  /** Origem exibida quando o campo está herdando (ex.: "Servidor"). */
  inheritedFrom?: string | null;
}

/** Editor da janela de manutenção do agent (reboot/patches dentro da janela). */
export function MaintenanceWindowCard({ value, saving, canManage, onSave, inheritedFrom }: Props) {
  const [cfg, setCfg] = useState<MaintenanceWindowConfig>(() => parseMaintenanceWindow(value));
  const [dirty, setDirty] = useState(false);

  const update = (patch: Partial<MaintenanceWindowConfig>) => {
    setCfg((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const toggleDay = (day: number) => {
    const has = cfg.daysOfWeek.includes(day);
    update({ daysOfWeek: has ? cfg.daysOfWeek.filter((d) => d !== day) : [...cfg.daysOfWeek, day].sort() });
  };

  const readOnly = saving || canManage === false;
  const save = () => onSave(serializeMaintenanceWindow(cfg));

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-indigo-500" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Janela de manutenção (reboot/patches)
          </span>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            disabled={saving}
          />
          Ativa
        </label>
      </div>

      {inheritedFrom ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">Herdando de: {inheritedFrom}</p>
      ) : null}

      {cfg.enabled ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {Object.entries(DAY_LABELS).map(([day, label]) => (
              <label key={day} className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={cfg.daysOfWeek.includes(Number(day))}
                  onChange={() => toggleDay(Number(day))}
                  disabled={saving}
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
                disabled={saving}
                className="mt-1"
              />
            </label>
            <label className="text-xs text-slate-600 dark:text-slate-300">
              Duração (min)
              <Input
                type="number"
                min={1}
                max={720}
                value={cfg.durationMinutes}
                onChange={(e) => update({ durationMinutes: Number(e.target.value) || 60 })}
                disabled={saving}
                className="mt-1"
              />
            </label>
            <label className="text-xs text-slate-600 dark:text-slate-300">
              Aviso de reboot (s)
              <Input
                type="number"
                min={0}
                max={3600}
                value={cfg.rebootGraceSeconds}
                onChange={(e) => update({ rebootGraceSeconds: Math.max(0, Number(e.target.value) || 0) })}
                disabled={saving}
                className="mt-1"
              />
            </label>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Aviso 0 s = reboot imediato, sem aviso ao usuário (como hoje).
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Desligada: patches e reboots executam imediatamente (comportamento atual).
        </p>
      )}

      <Button size="sm" onClick={save} disabled={readOnly || !dirty}>
        <Save className="mr-1 h-4 w-4" />
        Salvar janela
      </Button>
    </div>
  );
}
