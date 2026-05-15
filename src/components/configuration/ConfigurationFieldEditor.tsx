import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, GitCompare } from "lucide-react";
import type { ConfigurationValue } from "@/api";
import { Button, Input, Modal, Select, TextArea } from "@/components/ui";
import { ConfigDiffViewer } from "./ConfigDiffViewer";
import { InheritableFieldToggle } from "./InheritableFieldToggle";
import type { ConfigurationOrigin } from "@/api";

type FieldKind = "boolean" | "number" | "string" | "json" | "policy";

interface ConfigurationFieldEditorProps {
  fieldLabel: string;
  fieldKey: string;
  fieldKind?: FieldKind;
  value: string;
  error?: string;
  inherited: boolean;
  effectiveValue: ConfigurationValue | null | undefined;
  origin: ConfigurationOrigin;
  onValueChange: (value: string) => void;
  onToggleInherit: (next: boolean) => void;
  onSavePatch: () => void;
  onResetProperty?: () => void;
  saving?: boolean;
  resetLoading?: boolean;
  disableInheritance?: boolean;
  locked?: boolean;
  lockOwner?: string | null;
  description?: string;
  unit?: string;
  hideSaveButton?: boolean;
}

export function ConfigurationFieldEditor({
  fieldLabel,
  fieldKey,
  fieldKind = "string",
  value,
  error,
  inherited,
  effectiveValue,
  origin,
  onValueChange,
  onToggleInherit,
  onSavePatch,
  onResetProperty,
  saving,
  resetLoading,
  disableInheritance,
  locked,
  lockOwner,
  description,
  unit,
  hideSaveButton,
}: ConfigurationFieldEditorProps) {
  const [showDiff, setShowDiff] = useState(false);
  const [showAiAdvanced, setShowAiAdvanced] = useState(false);
  const [showAiEmbedding, setShowAiEmbedding] = useState(false);
  const isReadOnly = !!locked;
  const inputDisabled = isReadOnly || (!!disableInheritance ? false : inherited);

  const numberRanges: Record<string, { min: number; max: number }> = {
    inventoryIntervalHours: { min: 1, max: 168 },
    agentHeartbeatIntervalSeconds: { min: 10, max: 3600 },
    agentOfflineThresholdSeconds: { min: 30, max: 86400 },
    tokenExpirationDays: { min: 1, max: 3650 },
    maxTokensPerAgent: { min: 1, max: 100 },
  };

  const fieldRange = numberRanges[fieldKey];

  const structuredJsonField =
    fieldKind === "json" &&
    [
      "aiIntegrationSettingsJson",
      "autoUpdateSettingsJson",
      "brandingSettingsJson",
      "lockedFieldsJson",
    ].includes(fieldKey);

  const aiParsedValue = useMemo(() => {
    if (!structuredJsonField) {
      return null;
    }

    if (fieldKey === "lockedFieldsJson") {
      const trimmed = value.trim();
      if (!trimmed) {
        return [] as unknown[];
      }

      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        return null;
      }

      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return {} as Record<string, unknown>;
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {} as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [fieldKey, fieldKind, value]);

  const jsonStringValue = (key: string): string => {
    if (
      !aiParsedValue ||
      Array.isArray(aiParsedValue) ||
      !(key in aiParsedValue)
    ) {
      return "";
    }

    const raw = aiParsedValue[key];
    if (typeof raw === "string") {
      return raw;
    }
    if (typeof raw === "number" || typeof raw === "boolean") {
      return String(raw);
    }
    return "";
  };

  const updateJsonObjectValue = (
    key: string,
    next: string,
    type: "string" | "number" | "boolean",
  ) => {
    const base =
      aiParsedValue && typeof aiParsedValue === "object" && !Array.isArray(aiParsedValue)
        ? { ...aiParsedValue }
        : {};

    if (type === "string") {
      if (!next.trim()) {
        delete base[key];
      } else {
        base[key] = next;
      }
    }

    if (type === "number") {
      if (!next.trim()) {
        delete base[key];
      } else {
        const numeric = Number(next);
        if (!Number.isNaN(numeric)) {
          base[key] = numeric;
        }
      }
    }

    if (type === "boolean") {
      if (!next) {
        delete base[key];
      } else {
        base[key] = next === "true";
      }
    }

    onValueChange(JSON.stringify(base, null, 2));
  };

  const lockedFieldsValue = useMemo(() => {
    if (fieldKey !== "lockedFieldsJson" || !Array.isArray(aiParsedValue)) {
      return "";
    }

    return aiParsedValue
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .join("\n");
  }, [aiParsedValue, fieldKey]);

  const updateLockedFields = (next: string) => {
    const values = next
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);

    const uniqueValues = Array.from(new Set(values));
    onValueChange(JSON.stringify(uniqueValues, null, 2));
  };

  const renderInput = () => {
    if (fieldKind === "boolean") {
      return (
        <Select
          label="Valor local"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          disabled={inputDisabled}
          options={[
            { value: "true", label: "Ativado (true)" },
            { value: "false", label: "Desativado (false)" },
          ]}
        />
      );
    }

    if (fieldKind === "policy") {
      return (
        <Select
          label="Politica"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          disabled={inputDisabled}
          options={[
            { value: "0", label: "🔒 0 (Disabled) - Nenhum aplicativo autorizado" },
            { value: "1", label: "✅ 1 (PreApproved) - Apenas aplicativos na lista" },
            { value: "2", label: "🌍 2 (All) - Qualquer aplicativo autorizado" },
          ]}
        />
      );
    }

    if (fieldKind === "number") {
      const unitSuffix = unit ? ` (${unit})` : "";
      return (
        <Input
          type="number"
          label={`Valor local${unitSuffix}`}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          disabled={inputDisabled}
          min={fieldRange?.min}
          max={fieldRange?.max}
          step={1}
          error={error}
          placeholder={
            fieldRange
              ? `${fieldRange.min}..${fieldRange.max} ${unit || ""}`
              : "Digite um número"
          }
        />
      );
    }

    if (fieldKind === "json") {
      const isAiIntegrationField = fieldKey === "aiIntegrationSettingsJson";
      const isAutoUpdateField = fieldKey === "autoUpdateSettingsJson";
      const isBrandingField = fieldKey === "brandingSettingsJson";
      const isLockedFieldsField = fieldKey === "lockedFieldsJson";

      if (isLockedFieldsField && Array.isArray(aiParsedValue)) {
        return (
          <TextArea
            label="Campos bloqueados (um por linha)"
            value={lockedFieldsValue}
            onChange={(event) => updateLockedFields(event.target.value)}
            rows={6}
            disabled={inputDisabled}
            placeholder={
              inherited
                ? "Herdando do nível acima"
                : "SupportEnabled\nTokenExpirationDays\nAIIntegrationSettingsJson"
            }
          />
        );
      }

      if (isAiIntegrationField && aiParsedValue && !Array.isArray(aiParsedValue)) {
        return (
          <div className="space-y-3">
            {/* Campos principais */}
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Provider"
                value={jsonStringValue("provider")}
                onChange={(event) =>
                  updateJsonObjectValue("provider", event.target.value, "string")
                }
                disabled={inputDisabled}
                placeholder="openai, openrouter, anthropic..."
              />
              <Input
                label="Chat Model"
                value={jsonStringValue("chatModel")}
                onChange={(event) =>
                  updateJsonObjectValue("chatModel", event.target.value, "string")
                }
                disabled={inputDisabled}
                placeholder="google/gemma-3-4b-it:free"
              />
              <Select
                label="Enabled"
                value={jsonStringValue("enabled")}
                onChange={(event) =>
                  updateJsonObjectValue("enabled", event.target.value, "boolean")
                }
                disabled={inputDisabled}
                options={[
                  { value: "", label: "Padrao do backend" },
                  { value: "true", label: "Ativado" },
                  { value: "false", label: "Desativado" },
                ]}
              />
              <Select
                label="Chat AI Enabled"
                value={jsonStringValue("chatAIEnabled")}
                onChange={(event) =>
                  updateJsonObjectValue("chatAIEnabled", event.target.value, "boolean")
                }
                disabled={inputDisabled}
                options={[
                  { value: "", label: "Padrao do backend" },
                  { value: "true", label: "Ativado" },
                  { value: "false", label: "Desativado" },
                ]}
              />
              <Select
                label="Knowledge Base Enabled"
                value={jsonStringValue("knowledgeBaseEnabled")}
                onChange={(event) =>
                  updateJsonObjectValue("knowledgeBaseEnabled", event.target.value, "boolean")
                }
                disabled={inputDisabled}
                options={[
                  { value: "", label: "Padrao do backend" },
                  { value: "true", label: "Ativado" },
                  { value: "false", label: "Desativado" },
                ]}
              />
              <Input
                type="password"
                label="API Key"
                value={jsonStringValue("apiKey")}
                onChange={(event) =>
                  updateJsonObjectValue("apiKey", event.target.value, "string")
                }
                disabled={inputDisabled}
                placeholder="Preencha apenas para trocar a chave"
              />
            </div>

            {/* Configuração avancada de chat */}
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
              <button
                type="button"
                onClick={() => setShowAiAdvanced((prev) => !prev)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/5"
              >
                <span>Configuração avancada (Chat)</span>
                {showAiAdvanced ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {showAiAdvanced && (
                <div className="mt-2 grid gap-3 sm:grid-cols-2 p-2">
                  <Input
                    label="Base URL"
                    value={jsonStringValue("baseUrl")}
                    onChange={(event) =>
                      updateJsonObjectValue("baseUrl", event.target.value, "string")
                    }
                    disabled={inputDisabled}
                    placeholder="https://openrouter.ai/api/v1/"
                  />
                  <Input
                    label="Temperature"
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={jsonStringValue("temperature")}
                    onChange={(event) =>
                      updateJsonObjectValue("temperature", event.target.value, "number")
                    }
                    disabled={inputDisabled}
                    placeholder="0.7"
                  />
                  <Input
                    label="Max Tokens Per Request"
                    type="number"
                    step="1"
                    min="1"
                    value={jsonStringValue("maxTokensPerRequest")}
                    onChange={(event) =>
                      updateJsonObjectValue("maxTokensPerRequest", event.target.value, "number")
                    }
                    disabled={inputDisabled}
                    placeholder="2000"
                  />
                </div>
              )}
            </div>

            {/* Configuração de embedding */}
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
              <button
                type="button"
                onClick={() => setShowAiEmbedding((prev) => !prev)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/5"
              >
                <span>Configuração de Embedding</span>
                {showAiEmbedding ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {showAiEmbedding && (
                <div className="mt-2 grid gap-3 sm:grid-cols-2 p-2">
                  <Input
                    label="Embedding Model"
                    value={jsonStringValue("embeddingModel")}
                    onChange={(event) =>
                      updateJsonObjectValue("embeddingModel", event.target.value, "string")
                    }
                    disabled={inputDisabled}
                    placeholder="openai/text-embedding-3-small"
                  />
                  <Input
                    label="Embedding Base URL"
                    value={jsonStringValue("embeddingBaseUrl")}
                    onChange={(event) =>
                      updateJsonObjectValue("embeddingBaseUrl", event.target.value, "string")
                    }
                    disabled={inputDisabled}
                    placeholder="https://api.openai.com/v1/"
                  />
                  <Input
                    label="Embedding Dimensions"
                    type="number"
                    step="1"
                    min="1"
                    value={jsonStringValue("embeddingDimensions")}
                    onChange={(event) =>
                      updateJsonObjectValue("embeddingDimensions", event.target.value, "number")
                    }
                    disabled={inputDisabled}
                    placeholder="1536"
                  />
                  <Input
                    type="password"
                    label="Embedding API Key"
                    value={jsonStringValue("embeddingApiKey")}
                    onChange={(event) =>
                      updateJsonObjectValue("embeddingApiKey", event.target.value, "string")
                    }
                    disabled={inputDisabled}
                    placeholder="Preencha apenas para trocar a chave"
                  />
                </div>
              )}
            </div>
          </div>
        );
      }

      if (isAutoUpdateField && aiParsedValue && !Array.isArray(aiParsedValue)) {
        return (
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Enabled"
              value={jsonStringValue("enabled")}
              onChange={(event) =>
                updateJsonObjectValue("enabled", event.target.value, "boolean")
              }
              disabled={inputDisabled}
              options={[
                { value: "", label: "Padrao do backend" },
                { value: "true", label: "Ativado" },
                { value: "false", label: "Desativado" },
              ]}
            />
            <Input
              label="Channel"
              value={jsonStringValue("channel")}
              onChange={(event) =>
                updateJsonObjectValue("channel", event.target.value, "string")
              }
              disabled={inputDisabled}
              placeholder="stable, beta..."
            />
            <Input
              label="Check Interval Hours"
              type="number"
              min="1"
              step="1"
              value={jsonStringValue("checkIntervalHours")}
              onChange={(event) =>
                updateJsonObjectValue(
                  "checkIntervalHours",
                  event.target.value,
                  "number",
                )
              }
              disabled={inputDisabled}
              placeholder="24"
            />
            <Input
              label="Rollout Percentage"
              type="number"
              min="0"
              max="100"
              step="1"
              value={jsonStringValue("rolloutPercentage")}
              onChange={(event) =>
                updateJsonObjectValue(
                  "rolloutPercentage",
                  event.target.value,
                  "number",
                )
              }
              disabled={inputDisabled}
              placeholder="100"
            />
            <Input
              label="Maintenance Window Start"
              value={jsonStringValue("maintenanceWindowStart")}
              onChange={(event) =>
                updateJsonObjectValue(
                  "maintenanceWindowStart",
                  event.target.value,
                  "string",
                )
              }
              disabled={inputDisabled}
              placeholder="02:00"
            />
            <Input
              label="Maintenance Window End"
              value={jsonStringValue("maintenanceWindowEnd")}
              onChange={(event) =>
                updateJsonObjectValue(
                  "maintenanceWindowEnd",
                  event.target.value,
                  "string",
                )
              }
              disabled={inputDisabled}
              placeholder="05:00"
            />
          </div>
        );
      }

      if (isBrandingField && aiParsedValue && !Array.isArray(aiParsedValue)) {
        return (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="App Name"
              value={jsonStringValue("appName")}
              onChange={(event) =>
                updateJsonObjectValue("appName", event.target.value, "string")
              }
              disabled={inputDisabled}
              placeholder="Discovery"
            />
            <Input
              label="Logo URL"
              value={jsonStringValue("logoUrl")}
              onChange={(event) =>
                updateJsonObjectValue("logoUrl", event.target.value, "string")
              }
              disabled={inputDisabled}
              placeholder="https://..."
            />
            <Input
              label="Primary Color"
              value={jsonStringValue("primaryColor")}
              onChange={(event) =>
                updateJsonObjectValue("primaryColor", event.target.value, "string")
              }
              disabled={inputDisabled}
              placeholder="#6366f1"
            />
            <Input
              label="Accent Color"
              value={jsonStringValue("accentColor")}
              onChange={(event) =>
                updateJsonObjectValue("accentColor", event.target.value, "string")
              }
              disabled={inputDisabled}
              placeholder="#06b6d4"
            />
            <Input
              label="Sidebar Color"
              value={jsonStringValue("sidebarColor")}
              onChange={(event) =>
                updateJsonObjectValue("sidebarColor", event.target.value, "string")
              }
              disabled={inputDisabled}
              placeholder="#0f172a"
            />
            <Input
              label="Header Color"
              value={jsonStringValue("headerColor")}
              onChange={(event) =>
                updateJsonObjectValue("headerColor", event.target.value, "string")
              }
              disabled={inputDisabled}
              placeholder="#1e293b"
            />
          </div>
        );
      }

      return (
        <>
          {structuredJsonField && (
            <p className="text-xs text-amber-300">
               Conteúdo legado inválido detectado. Ajuste o JSON para continuar usando os campos estruturados.
            </p>
          )}
          <TextArea
            label="Valor local (JSON)"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            rows={6}
            disabled={inputDisabled}
            error={error}
            placeholder={
              inherited
                 ? "Herdando do nível acima"
                : fieldKey === "lockedFieldsJson"
                  ? '["SupportEnabled", "TokenExpirationDays"]'
                  : "{\n  \"key\": \"value\"\n}"
            }
          />
        </>
      );
    }

    return (
      <Input
        label="Valor local"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        disabled={inputDisabled}
        error={error}
        placeholder={inherited ? "Herdando do nível acima" : "Digite o valor local"}
      />
    );
  };

  return (
    <div className="space-y-3 rounded-lg border border-white/5 bg-white/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">{fieldLabel}</p>
          <p className="font-mono text-xs text-slate-400">{fieldKey}</p>
          {description && (
            <p className="mt-1 text-xs text-slate-300">{description}</p>
          )}
        </div>

        {!disableInheritance && (
          <InheritableFieldToggle
            checked={inherited}
            onChange={onToggleInherit}
            disabled={saving || resetLoading || isReadOnly}
          />
        )}
      </div>

      {isReadOnly && (
        <p className="text-xs text-warning">
          Campo bloqueado{lockOwner ? ` por ${lockOwner}` : ""}.
        </p>
      )}

      <div className="grid gap-3">
        {fieldKind === "json" && fieldKey === "aiIntegrationSettingsJson" && (
          <p className="text-xs text-amber-300">
             ApiKey é write-only: o valor atual não é retornado pela API. Preencha apenas para trocar a chave.
          </p>
        )}
        {fieldKind === "json" && fieldKey === "autoUpdateSettingsJson" && (
          <p className="text-xs text-slate-400">
            Ajuste o comportamento de atualização automatica por campos estruturados.
          </p>
        )}
        {fieldKind === "json" && fieldKey === "brandingSettingsJson" && (
          <p className="text-xs text-slate-400">
            Personalize nome, logo e cores sem editar JSON manualmente.
          </p>
        )}
        {fieldKind === "json" && fieldKey === "lockedFieldsJson" && (
          <p className="text-xs text-slate-400">
            Informe um campo por linha para bloquear override em níveis inferiores.
          </p>
        )}
        {renderInput()}

        {fieldKind === "number" && fieldRange && !error && (
          <p className="text-xs text-slate-400">
            Faixa recomendada: {fieldRange.min}..{fieldRange.max}{unit ? ` ${unit}` : ""}
          </p>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {!hideSaveButton && (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowDiff(true)}
              title="Comparar valor local com efetivo"
            >
              <GitCompare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Comparar</span>
            </Button>
            <Button size="sm" onClick={onSavePatch} loading={saving} disabled={isReadOnly}>
              Salvar
            </Button>
            {onResetProperty && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onResetProperty}
                loading={resetLoading}
                disabled={isReadOnly}
              >
                Reset
              </Button>
            )}
          </>
        )}
      </div>

      <Modal
        open={showDiff}
        onClose={() => setShowDiff(false)}
        title={`Comparar: ${fieldLabel}`}
        maxWidth="max-w-2xl"
      >
        <ConfigDiffViewer
          localValue={inherited ? null : value}
          effectiveValue={effectiveValue}
          origin={origin}
        />
      </Modal>
    </div>
  );
}
