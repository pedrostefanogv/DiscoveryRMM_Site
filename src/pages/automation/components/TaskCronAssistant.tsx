import { useEffect, useState } from "react";
import { Icon, Input, Select } from "@/components/ui";
import { describeCron, isValidCron, parseCronAssistantState } from "../automationTasksUtils";

const CRON_PRESETS = [
  { label: "A cada 15 min", value: "*/15 * * * *" },
  { label: "A cada hora", value: "0 * * * *" },
  { label: "Todo dia 08:00", value: "0 8 * * *" },
  { label: "Dias úteis 07:30", value: "30 7 * * 1-5" },
  { label: "Toda segunda 08:00", value: "0 8 * * 1" },
  { label: "Todo dia 1º 03:00", value: "0 3 1 * *" },
];

const CRON_HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: `${String(hour).padStart(2, "0")}h`,
}));

const CRON_MINUTE_OPTIONS = Array.from({ length: 60 }, (_, minute) => ({
  value: String(minute),
  label: `${String(minute).padStart(2, "0")} min`,
}));

const CRON_WEEKDAY_OPTIONS = [
  { value: "1", label: "Segunda-feira" },
  { value: "2", label: "Terça-feira" },
  { value: "3", label: "Quarta-feira" },
  { value: "4", label: "Quinta-feira" },
  { value: "5", label: "Sexta-feira" },
  { value: "6", label: "Sábado" },
  { value: "0", label: "Domingo" },
];

const CRON_MONTH_DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => ({
  value: String(index + 1),
  label: `Dia ${index + 1}`,
}));

const CRON_STEP_OPTIONS = [5, 10, 15, 20, 30].map((step) => ({
  value: String(step),
  label: `A cada ${step} minutos`,
}));

interface TaskCronAssistantProps {
  value: string;
  onChange: (cron: string) => void;
  error?: string;
}

export function TaskCronAssistant({ value, onChange, error }: TaskCronAssistantProps) {
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [cronFrequency, setCronFrequency] = useState("daily");
  const [cronMinute, setCronMinute] = useState("0");
  const [cronHour, setCronHour] = useState("8");
  const [cronWeekday, setCronWeekday] = useState("1");
  const [cronMonthDay, setCronMonthDay] = useState("1");
  const [cronStep, setCronStep] = useState("15");

  const syncFromExpression = (expr: string) => {
    const parsed = parseCronAssistantState(expr);
    setCronFrequency(parsed.frequency);
    setCronMinute(parsed.minute);
    setCronHour(parsed.hour);
    setCronWeekday(parsed.weekday);
    setCronMonthDay(parsed.monthDay);
    setCronStep(parsed.step);
  };

  useEffect(() => {
    syncFromExpression(value);
  }, [value]);

  const buildCron = (
    overrides: Partial<{
      frequency: string;
      minute: string;
      hour: string;
      weekday: string;
      monthDay: string;
      step: string;
    }> = {},
  ): string => {
    const frequency = overrides.frequency ?? cronFrequency;
    const minute = overrides.minute ?? cronMinute;
    const hour = overrides.hour ?? cronHour;
    const weekday = overrides.weekday ?? cronWeekday;
    const monthDay = overrides.monthDay ?? cronMonthDay;
    const step = overrides.step ?? cronStep;
    switch (frequency) {
      case "minutes":
        return `*/${step} * * * *`;
      case "hourly":
        return `${minute} * * * *`;
      case "monthly":
        return `${minute} ${hour} ${monthDay} * *`;
      case "weekly":
        return `${minute} ${hour} * * ${weekday}`;
      default:
        return `${minute} ${hour} * * *`;
    }
  };

  const applyFromAssistant = (
    overrides: Partial<{
      frequency: string;
      minute: string;
      hour: string;
      weekday: string;
      monthDay: string;
      step: string;
    }> = {},
  ) => {
    onChange(buildCron(overrides));
  };

  const trimmed = value.trim();
  const valid = isValidCron(trimmed);
  const stepOptions =
    /^\d+$/.test(cronStep) && !CRON_STEP_OPTIONS.some((o) => o.value === cronStep)
      ? [{ value: cronStep, label: `A cada ${cronStep} minutos` }, ...CRON_STEP_OPTIONS]
      : CRON_STEP_OPTIONS;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface-light p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">Agendamento recorrente</p>
          <p className="text-xs text-muted">
            Executado no fuso horário local do agent.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          onClick={() => setAssistantOpen((v) => !v)}
        >
          <Icon name="event" className="h-3.5 w-3.5" />
          {assistantOpen ? "Ocultar assistente" : "Assistente visual"}
        </button>
      </div>

      {assistantOpen && (
        <div className="space-y-3 rounded-lg border border-border bg-surface/40 p-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Atalhos rápidos</p>
            <div className="flex flex-wrap gap-1.5">
              {CRON_PRESETS.map((preset) => {
                const active = trimmed === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    aria-pressed={active}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      active
                        ? "border-primary/60 bg-primary/20 text-primary-100 font-medium"
                        : "border-border bg-surface-light text-foreground hover:bg-surface-hover"
                    }`}
                    onClick={() => {
                      syncFromExpression(preset.value);
                      onChange(preset.value);
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <Select
              label="Frequência"
              options={[
                { value: "minutes", label: "A cada N minutos" },
                { value: "hourly", label: "A cada hora" },
                { value: "daily", label: "Diariamente" },
                { value: "weekly", label: "Semanalmente" },
                { value: "monthly", label: "Mensalmente" },
              ]}
              value={cronFrequency}
              onChange={(e) => {
                const frequency = e.target.value;
                setCronFrequency(frequency);
                applyFromAssistant({ frequency });
              }}
            />
            {cronFrequency === "minutes" && (
              <Select
                label="Intervalo"
                options={stepOptions}
                value={cronStep}
                onChange={(e) => {
                  const step = e.target.value;
                  setCronStep(step);
                  applyFromAssistant({ step });
                }}
              />
            )}
            {(cronFrequency === "daily" ||
              cronFrequency === "weekly" ||
              cronFrequency === "monthly") && (
              <Select
                label="Hora"
                options={CRON_HOUR_OPTIONS}
                value={cronHour}
                onChange={(e) => {
                  const hour = e.target.value;
                  setCronHour(hour);
                  applyFromAssistant({ hour });
                }}
              />
            )}
            {cronFrequency !== "minutes" && (
              <Select
                label="Minuto"
                options={CRON_MINUTE_OPTIONS}
                value={cronMinute}
                onChange={(e) => {
                  const minute = e.target.value;
                  setCronMinute(minute);
                  applyFromAssistant({ minute });
                }}
              />
            )}
            {cronFrequency === "weekly" && (
              <Select
                label="Dia da semana"
                options={CRON_WEEKDAY_OPTIONS}
                value={cronWeekday}
                onChange={(e) => {
                  const weekday = e.target.value;
                  setCronWeekday(weekday);
                  applyFromAssistant({ weekday });
                }}
              />
            )}
            {cronFrequency === "monthly" && (
              <Select
                label="Dia do mês"
                options={CRON_MONTH_DAY_OPTIONS}
                value={cronMonthDay}
                onChange={(e) => {
                  const monthDay = e.target.value;
                  setCronMonthDay(monthDay);
                  applyFromAssistant({ monthDay });
                }}
              />
            )}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Input
          label="Expressão Cron (5 campos: min hora dia mês dia-semana)"
          value={value}
          error={error}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ex.: 0 8 * * 1 (toda segunda 08:00)"
          className="font-mono text-xs"
        />
        {trimmed ? (
          <div
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
              valid
                ? "border-success/30 bg-success/10 text-foreground"
                : "border-danger/40 bg-danger/10 text-danger"
            }`}
          >
            <Icon name={valid ? "check_circle" : "error"} className="h-3.5 w-3.5 shrink-0" />
            <span>{describeCron(value)}</span>
          </div>
        ) : (
          <p className="text-xs text-muted">
            Informe a expressão cron ou escolha um atalho/assistente acima.
          </p>
        )}
      </div>
    </div>
  );
}
