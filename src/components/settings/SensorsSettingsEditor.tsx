import { useEffect, useMemo, useState } from "react";
import { Icon, Input } from "@/components/ui";

/** Chave do blob JSON no catálogo de configuração do servidor. */
export const SENSORS_SETTINGS_FIELD_KEY = "SensorsSettingsJson";

/** Faixa aceita pelo domínio (SensorDefaults.MinIntervalSeconds/MaxIntervalSeconds). */
export const SENSORS_MIN_INTERVAL_SECONDS = 30;
export const SENSORS_MAX_INTERVAL_SECONDS = 86_400;
/** Default do servidor quando a chave está ausente. */
export const SENSORS_DEFAULT_INTERVAL_SECONDS = 300;

export interface SensorsSettings {
  /** Kill switch: desligado, o sync entrega 0 sensores aos agentes. */
  enabled: boolean;
  /** Intervalo default (s) dos sensores com intervalSeconds = 0. */
  defaultIntervalSeconds: number;
  /** Dispara auto-ticket a partir dos eventos de sensor. */
  autoTicketEnabled: boolean;
  /** Notificações (e-mail/webhook/in-app) dos alertas de sensor. */
  notifyEnabled: boolean;
}

/**
 * Defaults do SERVIDOR (SensorsSettings.cs): kill switch e alertas começam
 * LIGADOS e o intervalo padrão é 300s. Um JSON antigo sem alguma chave precisa
 * exibir o que o backend realmente aplica — mostrar "desligado" para uma chave
 * ausente faria o operador achar que desativou o que está ativo.
 */
const SENSORS_SETTINGS_DEFAULTS: SensorsSettings = {
  enabled: true,
  defaultIntervalSeconds: SENSORS_DEFAULT_INTERVAL_SECONDS,
  autoTicketEnabled: true,
  notifyEnabled: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Lê a chave em camelCase ou PascalCase (o backend grava camelCase). */
function readKey(source: Record<string, unknown>, key: string): unknown {
  if (key in source) return source[key];
  const pascal = key.charAt(0).toUpperCase() + key.slice(1);
  return source[pascal];
}

function readBoolean(source: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = readKey(source, key);
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

/** Clamp no intervalo aceito pelo domínio (nunca deixa o PATCH inválido). */
export function clampSensorsInterval(value: number): number {
  if (!Number.isFinite(value)) return SENSORS_DEFAULT_INTERVAL_SECONDS;
  const rounded = Math.round(value);
  if (rounded < SENSORS_MIN_INTERVAL_SECONDS) return SENSORS_MIN_INTERVAL_SECONDS;
  if (rounded > SENSORS_MAX_INTERVAL_SECONDS) return SENSORS_MAX_INTERVAL_SECONDS;
  return rounded;
}

/**
 * Lê o JSON salvo em ServerConfiguration.SensorsSettingsJson.
 * Vazio/inválido/fora de forma cai nos defaults do servidor (o parser do backend
 * é tolerante na leitura por causa de dados antigos).
 */
export function parseSensorsSettings(raw: string | null | undefined): SensorsSettings {
  if (!raw || !raw.trim()) return { ...SENSORS_SETTINGS_DEFAULTS };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...SENSORS_SETTINGS_DEFAULTS };
  }

  if (!isRecord(parsed)) return { ...SENSORS_SETTINGS_DEFAULTS };

  const rawInterval = readKey(parsed, "defaultIntervalSeconds");
  const interval = typeof rawInterval === "number" ? rawInterval : Number(rawInterval);

  return {
    enabled: readBoolean(parsed, "enabled", SENSORS_SETTINGS_DEFAULTS.enabled),
    defaultIntervalSeconds: clampSensorsInterval(
      Number.isFinite(interval) && String(rawInterval ?? "").trim() !== ""
        ? interval
        : SENSORS_SETTINGS_DEFAULTS.defaultIntervalSeconds,
    ),
    autoTicketEnabled: readBoolean(
      parsed,
      "autoTicketEnabled",
      SENSORS_SETTINGS_DEFAULTS.autoTicketEnabled,
    ),
    notifyEnabled: readBoolean(parsed, "notifyEnabled", SENSORS_SETTINGS_DEFAULTS.notifyEnabled),
  };
}

/** Serializa no formato que o servidor grava (camelCase, intervalo já clampado). */
export function serializeSensorsSettings(settings: SensorsSettings): string {
  return JSON.stringify({
    enabled: settings.enabled,
    defaultIntervalSeconds: clampSensorsInterval(settings.defaultIntervalSeconds),
    autoTicketEnabled: settings.autoTicketEnabled,
    notifyEnabled: settings.notifyEnabled,
  });
}

type SensorsBooleanKey = "enabled" | "autoTicketEnabled" | "notifyEnabled";

interface BooleanRowProps {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}

/**
 * Linha de opção booleana. Usa checkbox nativo (e NÃO role="switch"): este
 * campo é um blob JSON de configuração, não um módulo on/off — e o bug em
 * produção nasceu justamente de desenhá-lo como o switch do grupo "features".
 */
function BooleanRow({ label, description, checked, disabled, onChange }: BooleanRowProps) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
      />
      <span className="min-w-0">
        <span className="block text-foreground">{label}</span>
        <span className="block text-xs text-muted">{description}</span>
      </span>
    </label>
  );
}

interface SensorsSettingsEditorProps {
  /** JSON atual do formulário (string crua vinda do draft da API). */
  value: string;
  /** Devolve o JSON serializado a cada alteração; o pai marca o campo pendente. */
  onChange: (nextJson: string) => void;
  disabled?: boolean;
}

/**
 * Editor tipado de ServerConfiguration.SensorsSettingsJson.
 *
 * Substitui o textarea cru (e o switch por engano) por campos tipados que
 * serializam o MESMO JSON que o servidor grava. O save continua no caminho
 * único da página (pendingKeys + saveChanges), então o PATCH envia uma STRING.
 */
export default function SensorsSettingsEditor({
  value,
  onChange,
  disabled = false,
}: SensorsSettingsEditorProps) {
  const settings = useMemo(() => parseSensorsSettings(value), [value]);
  const [intervalText, setIntervalText] = useState(String(settings.defaultIntervalSeconds));
  const [intervalError, setIntervalError] = useState<string | null>(null);

  // Re-sincroniza com o valor externo (descartar alterações / refetch). Depende
  // da string, não do objeto parseado, para não sobrescrever a digitação.
  useEffect(() => {
    setIntervalText(String(parseSensorsSettings(value).defaultIntervalSeconds));
    setIntervalError(null);
  }, [value]);

  const emit = (next: SensorsSettings) => onChange(serializeSensorsSettings(next));

  const handleBoolean = (key: SensorsBooleanKey, checked: boolean) => {
    emit({ ...settings, [key]: checked });
  };

  const handleIntervalChange = (text: string) => {
    setIntervalText(text);
    const parsed = Number(text);
    if (
      !Number.isInteger(parsed) ||
      parsed < SENSORS_MIN_INTERVAL_SECONDS ||
      parsed > SENSORS_MAX_INTERVAL_SECONDS
    ) {
      setIntervalError(
        "Intervalo deve estar entre " +
          SENSORS_MIN_INTERVAL_SECONDS +
          " e " +
          SENSORS_MAX_INTERVAL_SECONDS +
          " segundos.",
      );
      return;
    }
    setIntervalError(null);
    emit({ ...settings, defaultIntervalSeconds: parsed });
  };

  const handleIntervalBlur = () => {
    const parsed = Number(intervalText);
    const clamped = clampSensorsInterval(
      Number.isFinite(parsed) ? parsed : SENSORS_DEFAULT_INTERVAL_SECONDS,
    );
    setIntervalText(String(clamped));
    setIntervalError(null);
    emit({ ...settings, defaultIntervalSeconds: clamped });
  };

  return (
    <div className="w-full rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon name="sensors" className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Sensores de Monitoramento</p>
          <p className="mt-0.5 text-xs text-muted">
            Configuração global dos sensores: kill switch do sync, intervalo padrão dos
            sensores, auto-ticket e notificações dos alertas. Vale para todos os clientes
            e sites que não sobrescreverem o campo.
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-3 border-t border-border pt-3">
        <BooleanRow
          label="Sensores habilitados"
          description="Desligado, o sync entrega 0 sensores aos agentes (kill switch) — o histórico já coletado é preservado."
          checked={settings.enabled}
          disabled={disabled}
          onChange={(checked) => handleBoolean("enabled", checked)}
        />

        <Input
          label="Intervalo padrão (segundos)"
          type="number"
          min={SENSORS_MIN_INTERVAL_SECONDS}
          max={SENSORS_MAX_INTERVAL_SECONDS}
          value={intervalText}
          disabled={disabled}
          error={intervalError ?? undefined}
          hint={
            intervalError
              ? undefined
              : "Usado por sensores com intervalSeconds = 0. De " +
                SENSORS_MIN_INTERVAL_SECONDS +
                " a " +
                SENSORS_MAX_INTERVAL_SECONDS +
                " segundos (padrão do servidor: " +
                SENSORS_DEFAULT_INTERVAL_SECONDS +
                ")."
          }
          onChange={(event) => handleIntervalChange(event.target.value)}
          onBlur={handleIntervalBlur}
        />

        <BooleanRow
          label="Auto-ticket pelos eventos de sensor"
          description="Abre chamados automaticamente a partir dos eventos de sensor, seguindo as regras de auto-ticket existentes."
          checked={settings.autoTicketEnabled}
          disabled={disabled}
          onChange={(checked) => handleBoolean("autoTicketEnabled", checked)}
        />

        <BooleanRow
          label="Notificações dos alertas de sensor"
          description="Despacha notificações de e-mail, webhook e in-app quando um sensor dispara ou resolve um alerta."
          checked={settings.notifyEnabled}
          disabled={disabled}
          onChange={(checked) => handleBoolean("notifyEnabled", checked)}
        />
      </div>
    </div>
  );
}
