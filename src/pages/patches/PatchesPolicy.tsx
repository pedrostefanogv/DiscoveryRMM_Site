import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { Badge, Button, Card, CardHeader, ErrorDisplay, Icon, Input, Loading, PageHeader, Select } from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import { usePatchPolicy, useUpdatePatchPolicy } from "@/hooks/usePatches";
import { useAuthorization } from "@/auth/authorization";
import type { PatchApprovalScopeType, PatchEnforcementMode, PatchRebootPolicy } from "@/api/types";
import {
  listTimeZoneOptions,
  withCurrentTimeZoneOption,
} from "@/components/configuration/maintenancePolicy";

const SEVERITIES: Array<{ value: string; label: string }> = [
  { value: "Critical", label: "Crítica" },
  { value: "Important", label: "Importante" },
  { value: "Moderate", label: "Moderada" },
  { value: "Low", label: "Baixa" },
];

const CLASSIFICATIONS: Array<{ value: string; label: string }> = [
  { value: "Security Updates", label: "Segurança" },
  { value: "Critical Updates", label: "Críticas" },
  { value: "Definition Updates", label: "Definições" },
  { value: "Update Rollups", label: "Rollups" },
  { value: "Updates", label: "Atualizações" },
];

const WEEKDAYS: Array<{ day: number; label: string }> = [
  { day: 1, label: "Seg" },
  { day: 2, label: "Ter" },
  { day: 3, label: "Qua" },
  { day: 4, label: "Qui" },
  { day: 5, label: "Sex" },
  { day: 6, label: "Sáb" },
  { day: 7, label: "Dom" },
];

const DEFAULT_WINDOW_DAYS = [1, 2, 3, 4, 5];
const DEFAULT_WINDOW_START = "22:00";
const DEFAULT_WINDOW_END = "05:00";
const DEFAULT_WINDOW_TIMEZONE = "America/Sao_Paulo";

const ENFORCEMENT_OPTIONS: Array<{ value: PatchEnforcementMode; label: string }> = [
  { value: "Monitor", label: "Monitorar (somente inventário)" },
  { value: "AgentEnforced", label: "Agente instala apenas aprovados" },
  { value: "OsEnforced", label: "Enforcement no SO (ocultar recusados / pausar WU) — best-effort" },
];

const ENFORCEMENT_SHORT_LABELS: Record<PatchEnforcementMode, string> = {
  Monitor: "Monitorar",
  AgentEnforced: "Agente",
  OsEnforced: "SO (best-effort)",
};

const REBOOT_OPTIONS: Array<{ value: PatchRebootPolicy; label: string }> = [
  { value: "Never", label: "Nunca reiniciar automaticamente" },
  { value: "Notify", label: "Avisar e aguardar operador" },
  { value: "MaintenanceWindow", label: "Somente na janela (se habilitado)" },
];

const REBOOT_SHORT_LABELS: Record<PatchRebootPolicy, string> = {
  Never: "Sem reboot automático",
  Notify: "Notificar operador",
  MaintenanceWindow: "Na janela",
};

interface PolicyFormSnapshot {
  enforcementMode: PatchEnforcementMode;
  autoInstallEnabled: boolean;
  autoSeverities: string[];
  autoClassifications: string[];
  rebootPolicy: PatchRebootPolicy;
  rebootAllowed: boolean;
  maxInstallsPerRun: number;
  hideDeniedUpdates: boolean;
  deferralDays: number;
  deadlineDays: number;
  allowOs: boolean;
  allowThirdParty: boolean;
  allowThirdPartyApps: boolean;
  windowDays: number[];
  windowStart: string;
  windowEnd: string;
  windowTimezone: string;
}

function serializeSnapshot(s: PolicyFormSnapshot): string {
  return JSON.stringify({
    ...s,
    autoSeverities: [...s.autoSeverities].sort(),
    autoClassifications: [...s.autoClassifications].sort(),
    windowDays: [...s.windowDays].sort((a, b) => a - b),
  });
}

function formatDaysLabel(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return "Todos os dias";
  if (sorted.join(",") === "1,2,3,4,5") return "Seg–Sex";
  if (sorted.join(",") === "6,7") return "Fim de semana";
  return sorted
    .map((d) => WEEKDAYS.find((w) => w.day === d)?.label ?? String(d))
    .join(", ");
}

export default function PatchesPolicy() {
  const [scopeType, setScopeType] = useState<PatchApprovalScopeType>("Global");
  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");

  const [enforcementMode, setEnforcementMode] = useState<PatchEnforcementMode>("Monitor");
  const [autoInstallEnabled, setAutoInstallEnabled] = useState(false);
  const [autoSeverities, setAutoSeverities] = useState<string[]>([]);
  const [autoClassifications, setAutoClassifications] = useState<string[]>([]);
  const [rebootPolicy, setRebootPolicy] = useState<PatchRebootPolicy>("Never");
  const [rebootAllowed, setRebootAllowed] = useState(false);
  const [maxInstallsPerRun, setMaxInstallsPerRun] = useState(50);
  const [hideDeniedUpdates, setHideDeniedUpdates] = useState(false);
  const [deferralDays, setDeferralDays] = useState(0);
  const [deadlineDays, setDeadlineDays] = useState(0);
  const [allowOs, setAllowOs] = useState(true);
  const [allowThirdParty, setAllowThirdParty] = useState(false);
  const [allowThirdPartyApps, setAllowThirdPartyApps] = useState(false);
  const [windowDays, setWindowDays] = useState<number[]>(DEFAULT_WINDOW_DAYS);
  const [windowStart, setWindowStart] = useState(DEFAULT_WINDOW_START);
  const [windowEnd, setWindowEnd] = useState(DEFAULT_WINDOW_END);
  const [windowTimezone, setWindowTimezone] = useState(DEFAULT_WINDOW_TIMEZONE);
  const [savedSnapshot, setSavedSnapshot] = useState<PolicyFormSnapshot | null>(null);

  const clients = useClients();
  const sites = useSites(clientId || undefined);
  const { hasAnyPermission } = useAuthorization();
  const canEdit = hasAnyPermission(["Patches.Edit", "patches.*", "admin.*"]);

  const scopeId = scopeType === "Client" ? clientId : scopeType === "Site" ? siteId : undefined;
  const enabled = scopeType === "Global" || Boolean(scopeId);

  const policy = usePatchPolicy(scopeType, scopeId);
  const updatePolicy = useUpdatePatchPolicy();

  const timeZoneOptions = useMemo(
    () => withCurrentTimeZoneOption(listTimeZoneOptions(), windowTimezone),
    [windowTimezone],
  );

  const clientOptions = useMemo(
    () => [{ value: "", label: "Selecione um cliente..." }, ...(clients.data ?? []).map((client) => ({ value: client.id, label: client.name }))],
    [clients.data],
  );
  const siteOptions = useMemo(
    () => [{ value: "", label: "Selecione um site..." }, ...(sites.data ?? []).map((site) => ({ value: site.id, label: site.name }))],
    [sites.data],
  );

  const applyFromPolicyData = useCallback((data: NonNullable<typeof policy.data>) => {
    const sources = data.sources ?? [];
    const effective = sources.length > 0 ? sources : ["os"];
    const nextAllowOs = effective.includes("os");
    const nextAllowThirdParty = effective.includes("third_party");
    const nextAllowThirdPartyApps = nextAllowThirdParty ? (data.allowThirdPartyApps ?? false) : false;

    let nextDays = DEFAULT_WINDOW_DAYS;
    let nextStart = DEFAULT_WINDOW_START;
    let nextEnd = DEFAULT_WINDOW_END;
    let nextTimezone = DEFAULT_WINDOW_TIMEZONE;

    if (data.maintenanceWindowJson) {
      try {
        const parsed = JSON.parse(data.maintenanceWindowJson) as {
          days?: number[];
          start?: string;
          end?: string;
          timezone?: string;
        };
        if (Array.isArray(parsed.days)) {
          const validDays = parsed.days.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
          if (validDays.length > 0) nextDays = validDays;
        }
        if (parsed.start) nextStart = parsed.start;
        if (parsed.end) nextEnd = parsed.end;
        if (parsed.timezone) nextTimezone = parsed.timezone;
      } catch {
        // JSON legado/inválido: restaura defaults limpos para o escopo atual.
      }
    }

    const nextSnapshot: PolicyFormSnapshot = {
      enforcementMode: data.enforcementMode,
      autoInstallEnabled: data.autoInstallEnabled,
      autoSeverities: data.autoApproveSeverities ?? [],
      autoClassifications: data.autoApproveClassifications ?? [],
      rebootPolicy: data.rebootPolicy,
      rebootAllowed: data.rebootPolicy === "MaintenanceWindow" ? data.rebootAllowed : false,
      maxInstallsPerRun: data.maxInstallsPerRun ?? 50,
      hideDeniedUpdates: data.enforcementMode === "OsEnforced" ? data.hideDeniedUpdates : false,
      deferralDays: data.deferralDays ?? 0,
      deadlineDays: data.deadlineDays ?? 0,
      allowOs: nextAllowOs,
      allowThirdParty: nextAllowThirdParty,
      allowThirdPartyApps: nextAllowThirdPartyApps,
      windowDays: nextDays,
      windowStart: nextStart,
      windowEnd: nextEnd,
      windowTimezone: nextTimezone,
    };

    setEnforcementMode(nextSnapshot.enforcementMode);
    setAutoInstallEnabled(nextSnapshot.autoInstallEnabled);
    setAutoSeverities(nextSnapshot.autoSeverities);
    setAutoClassifications(nextSnapshot.autoClassifications);
    setRebootPolicy(nextSnapshot.rebootPolicy);
    setRebootAllowed(nextSnapshot.rebootAllowed);
    setMaxInstallsPerRun(nextSnapshot.maxInstallsPerRun);
    setHideDeniedUpdates(nextSnapshot.hideDeniedUpdates);
    setDeferralDays(nextSnapshot.deferralDays);
    setDeadlineDays(nextSnapshot.deadlineDays);
    setAllowOs(nextSnapshot.allowOs);
    setAllowThirdParty(nextSnapshot.allowThirdParty);
    setAllowThirdPartyApps(nextSnapshot.allowThirdPartyApps);
    setWindowDays(nextSnapshot.windowDays);
    setWindowStart(nextSnapshot.windowStart);
    setWindowEnd(nextSnapshot.windowEnd);
    setWindowTimezone(nextSnapshot.windowTimezone);
    setSavedSnapshot(nextSnapshot);
  }, []);

  useEffect(() => {
    if (!policy.data) return;
    applyFromPolicyData(policy.data);
  }, [policy.data, applyFromPolicyData]);

  const currentSnapshot: PolicyFormSnapshot = useMemo(
    () => ({
      enforcementMode,
      autoInstallEnabled,
      autoSeverities,
      autoClassifications,
      rebootPolicy,
      rebootAllowed,
      maxInstallsPerRun,
      hideDeniedUpdates,
      deferralDays,
      deadlineDays,
      allowOs,
      allowThirdParty,
      allowThirdPartyApps,
      windowDays,
      windowStart,
      windowEnd,
      windowTimezone,
    }),
    [
      enforcementMode,
      autoInstallEnabled,
      autoSeverities,
      autoClassifications,
      rebootPolicy,
      rebootAllowed,
      maxInstallsPerRun,
      hideDeniedUpdates,
      deferralDays,
      deadlineDays,
      allowOs,
      allowThirdParty,
      allowThirdPartyApps,
      windowDays,
      windowStart,
      windowEnd,
      windowTimezone,
    ],
  );

  const isDirty = useMemo(() => {
    if (!savedSnapshot) return false;
    return serializeSnapshot(currentSnapshot) !== serializeSnapshot(savedSnapshot);
  }, [currentSnapshot, savedSnapshot]);

  const handleDiscard = () => {
    if (!policy.data) return;
    applyFromPolicyData(policy.data);
  };

  const toggle = (value: string, list: string[], setList: (next: string[]) => void) => {
    setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  const toggleWeekday = (day: number) => {
    setWindowDays((prev) => {
      if (prev.includes(day)) {
        if (prev.length === 1) {
          toast.error("Mantenha ao menos um dia na janela de manutenção.");
          return prev;
        }
        return prev.filter((item) => item !== day);
      }
      return [...prev, day].sort((a, b) => a - b);
    });
  };

  const handleToggleAllowOs = (checked: boolean) => {
    if (!checked && !allowThirdParty) {
      toast.error("Pelo menos uma origem de patch precisa permanecer habilitada.");
      return;
    }
    setAllowOs(checked);
  };

  const handleToggleAllowThirdParty = (checked: boolean) => {
    if (!checked && !allowOs) {
      toast.error("Pelo menos uma origem de patch precisa permanecer habilitada.");
      return;
    }
    setAllowThirdParty(checked);
    if (!checked) {
      setAllowThirdPartyApps(false);
    }
  };

  const handleEnforcementChange = (mode: PatchEnforcementMode) => {
    setEnforcementMode(mode);
    if (mode !== "OsEnforced") {
      setHideDeniedUpdates(false);
    }
  };

  const handleRebootPolicyChange = (next: PatchRebootPolicy) => {
    setRebootPolicy(next);
    if (next !== "MaintenanceWindow") {
      setRebootAllowed(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;
    if (scopeType !== "Global" && !scopeId) {
      toast.error("Selecione o cliente/site da política.");
      return;
    }

    const days = [...windowDays].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort((a, b) => a - b);
    const maintenanceWindowJson = JSON.stringify({
      days: days.length > 0 ? days : DEFAULT_WINDOW_DAYS,
      start: windowStart || DEFAULT_WINDOW_START,
      end: windowEnd || DEFAULT_WINDOW_END,
      timezone: windowTimezone,
    });

    try {
      await updatePolicy.mutateAsync({
        scopeType,
        scopeId,
        body: {
          enforcementMode,
          autoApproveClassifications: autoClassifications,
          autoApproveSeverities: autoSeverities,
          autoInstallEnabled,
          maintenanceWindowJson,
          rebootPolicy,
          rebootAllowed,
          maxInstallsPerRun,
          hideDeniedUpdates,
          deferralDays,
          deadlineDays,
          sources: [
            ...(allowOs ? ["os"] : []),
            ...(allowThirdParty ? ["third_party"] : []),
          ],
          allowThirdPartyApps,
        },
      });
      setSavedSnapshot(currentSnapshot);
      toast.success("Política de patches salva.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar política.");
    }
  };

  if (clients.isLoading) return <Loading />;
  if (clients.isError) return <ErrorDisplay onRetry={() => clients.refetch()} />;

  const actionButtons = (
    <>
      {isDirty && (
        <Button variant="ghost" onClick={handleDiscard} disabled={updatePolicy.isPending}>
          Descartar
        </Button>
      )}
      <Button
        variant="primary"
        onClick={() => void handleSave()}
        disabled={!canEdit || !enabled || policy.isLoading || updatePolicy.isPending || !isDirty}
        title={!canEdit ? "Sem permissão para editar políticas de patch" : undefined}
      >
        <Icon name="save" className="h-4 w-4" />
        {updatePolicy.isPending ? "Salvando..." : "Salvar"}
      </Button>
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Política de patches"
        description="Enforcement, auto-aprovação e janela de manutenção por escopo (o mais específico vence)."
      >
        {actionButtons}
      </PageHeader>

      <Card>
        <CardHeader title="Escopo" subtitle="Política é suportada em Global, Cliente e Site (o mais específico vence)." />
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Escopo"
            fullWidth={false}
            value={scopeType}
            onChange={(event) => {
              setScopeType(event.target.value as PatchApprovalScopeType);
              setSiteId("");
              setSavedSnapshot(null);
            }}
            options={[
              { value: "Global", label: "Global" },
              { value: "Client", label: "Cliente" },
              { value: "Site", label: "Site" },
            ]}
          />
          {scopeType !== "Global" && (
            <Select
              label="Cliente"
              fullWidth={false}
              value={clientId}
              onChange={(event) => {
                setClientId(event.target.value);
                setSiteId("");
                setSavedSnapshot(null);
              }}
              options={clientOptions}
            />
          )}
          {scopeType === "Site" && (
            <Select
              label="Site"
              fullWidth={false}
              value={siteId}
              onChange={(event) => {
                setSiteId(event.target.value);
                setSavedSnapshot(null);
              }}
              options={siteOptions}
            />
          )}
        </div>
      </Card>

      {!enabled ? (
        <Card><CardHeader title="Selecione o escopo" subtitle="Escolha cliente/site para carregar a política." /></Card>
      ) : policy.isLoading ? (
        <Loading />
      ) : policy.isError ? (
        <ErrorDisplay onRetry={() => policy.refetch()} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-light/50 px-3.5 py-2.5 text-xs">
            <span className="font-medium text-muted">Resumo:</span>
            <Badge color="accent">Modo: {ENFORCEMENT_SHORT_LABELS[enforcementMode]}</Badge>
            <Badge color="slate">
              Origens:{" "}
              {[
                ...(allowOs ? ["Windows Update"] : []),
                ...(allowThirdParty ? [allowThirdPartyApps ? "Terceiros (auto)" : "Terceiros (manual)"] : []),
              ].join(" + ")}
            </Badge>
            <Badge color={autoInstallEnabled ? "success" : "slate"}>
              {autoInstallEnabled
                ? `Auto-instalação: ${formatDaysLabel(windowDays)} · ${windowStart}–${windowEnd}`
                : "Auto-instalação: desativada"}
            </Badge>
            <Badge color={rebootAllowed ? "warning" : "slate"}>
              Reinício: {REBOOT_SHORT_LABELS[rebootPolicy]}
            </Badge>
            {isDirty && <Badge color="warning">Alterações não salvas</Badge>}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Enforcement" subtitle="OsEnforced é opt-in por site e best-effort (GPO/Intune podem sobrepor)." />
              <Select
                label="Modo"
                value={enforcementMode}
                disabled={!canEdit}
                onChange={(event) => handleEnforcementChange(event.target.value as PatchEnforcementMode)}
                options={ENFORCEMENT_OPTIONS}
              />
              <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={hideDeniedUpdates}
                  disabled={!canEdit || enforcementMode !== "OsEnforced"}
                  onChange={(event) => setHideDeniedUpdates(event.target.checked)}
                />
                <span className={enforcementMode !== "OsEnforced" ? "text-muted" : undefined}>
                  Ocultar no Windows Update os KBs recusados (somente em OsEnforced)
                </span>
              </label>
            </Card>

            <Card>
              <CardHeader
                title="Origens de patch"
                subtitle="Apps de terceiros (Chocolatey/winget) vêm desativados por padrão. Habilitar aqui é o 1º consentimento; a instalação automática exige o 2º abaixo."
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={allowOs}
                    disabled={!canEdit}
                    onChange={(event) => handleToggleAllowOs(event.target.checked)}
                  />
                  Windows Update (OS)
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={allowThirdParty}
                    disabled={!canEdit}
                    onChange={(event) => handleToggleAllowThirdParty(event.target.checked)}
                  />
                  Aplicativos de terceiros (Chocolatey/winget)
                </label>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={allowThirdPartyApps}
                  disabled={!canEdit || !allowThirdParty}
                  onChange={(event) => setAllowThirdPartyApps(event.target.checked)}
                />
                <span className={!allowThirdParty ? "text-muted" : undefined}>
                  2º consentimento: permitir auto-aprovar/instalar apps de terceiros
                </span>
              </label>
            </Card>
          </div>

          <Card>
            <CardHeader title="Auto-aprovação" subtitle="Aplicada quando não existe regra explícita para a atualização." />
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-muted-foreground">Severidades</p>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => setAutoSeverities(SEVERITIES.map((s) => s.value))}
                      className="text-primary hover:underline disabled:opacity-50"
                    >
                      Todas
                    </button>
                    <button
                      type="button"
                      disabled={!canEdit || autoSeverities.length === 0}
                      onClick={() => setAutoSeverities([])}
                      className="text-muted hover:text-foreground disabled:opacity-40"
                    >
                      Limpar
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {SEVERITIES.map((severity) => {
                    const selected = autoSeverities.includes(severity.value);
                    return (
                      <button
                        key={severity.value}
                        type="button"
                        disabled={!canEdit}
                        aria-pressed={selected}
                        onClick={() => toggle(severity.value, autoSeverities, setAutoSeverities)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                          selected
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-border bg-surface-light text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {severity.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-muted-foreground">Classificações</p>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => setAutoClassifications(CLASSIFICATIONS.map((c) => c.value))}
                      className="text-primary hover:underline disabled:opacity-50"
                    >
                      Todas
                    </button>
                    <button
                      type="button"
                      disabled={!canEdit || autoClassifications.length === 0}
                      onClick={() => setAutoClassifications([])}
                      className="text-muted hover:text-foreground disabled:opacity-40"
                    >
                      Limpar
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {CLASSIFICATIONS.map((classification) => {
                    const selected = autoClassifications.includes(classification.value);
                    return (
                      <button
                        key={classification.value}
                        type="button"
                        disabled={!canEdit}
                        aria-pressed={selected}
                        onClick={() => toggle(classification.value, autoClassifications, setAutoClassifications)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                          selected
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-border bg-surface-light text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {classification.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Instalação automática e janela" subtitle="O job instala aprovados dentro da janela; nunca reinicia sozinho." />
            <p className="mb-3 rounded-lg border border-border bg-surface-light px-3 py-2 text-xs text-muted">
              A janela <strong>global</strong> do agente (UTC, dias, duração e aviso de reboot) é configurada em{" "}
              <Link to="/settings/server" className="font-medium text-primary hover:underline">
                Configurações → Servidor → Janela de Manutenção
              </Link>
              ; os campos abaixo definem a janela desta política por escopo.
            </p>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={autoInstallEnabled}
                disabled={!canEdit}
                onChange={(event) => setAutoInstallEnabled(event.target.checked)}
              />
              Instalar automaticamente os aprovados dentro da janela
            </label>

            <div className="mt-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-muted-foreground">Dias da semana</span>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setWindowDays([1, 2, 3, 4, 5])}
                    className="text-primary hover:underline disabled:opacity-50"
                  >
                    Seg–Sex
                  </button>
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setWindowDays([1, 2, 3, 4, 5, 6, 7])}
                    className="text-primary hover:underline disabled:opacity-50"
                  >
                    Todos os dias
                  </button>
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setWindowDays([6, 7])}
                    className="text-primary hover:underline disabled:opacity-50"
                  >
                    Fim de semana
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map(({ day, label }) => {
                  const selected = windowDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={!canEdit}
                      aria-pressed={selected}
                      onClick={() => toggleWeekday(day)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        selected
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border bg-surface-light text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Input
                label="Início"
                type="time"
                value={windowStart}
                disabled={!canEdit}
                onChange={(event) => setWindowStart(event.target.value)}
              />
              <Input
                label="Fim"
                type="time"
                value={windowEnd}
                disabled={!canEdit}
                onChange={(event) => setWindowEnd(event.target.value)}
              />
              <Select
                label="Fuso horário"
                value={windowTimezone}
                disabled={!canEdit}
                onChange={(event) => setWindowTimezone(event.target.value)}
                options={timeZoneOptions}
                hint="Dias e horários são locais deste fuso"
              />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Input
                label="Máximo de instalações por execução"
                type="number"
                min={1}
                value={maxInstallsPerRun}
                disabled={!canEdit}
                onChange={(event) => setMaxInstallsPerRun(Math.max(1, Number(event.target.value) || 50))}
              />
              <Select
                label="Reinício após instalação"
                value={rebootPolicy}
                disabled={!canEdit}
                onChange={(event) => handleRebootPolicyChange(event.target.value as PatchRebootPolicy)}
                options={REBOOT_OPTIONS}
              />
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={rebootAllowed}
                disabled={!canEdit || rebootPolicy !== "MaintenanceWindow"}
                onChange={(event) => setRebootAllowed(event.target.checked)}
              />
              <span className={rebootPolicy !== "MaintenanceWindow" ? "text-muted" : undefined}>
                Autorizar reinício na janela (somente quando política = Na janela)
              </span>
            </label>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Input
                label="Retenção por idade (dias)"
                type="number"
                min={0}
                max={365}
                value={deferralDays}
                disabled={!canEdit}
                onChange={(event) => setDeferralDays(Math.max(0, Math.min(365, Number(event.target.value) || 0)))}
                hint="0 = sem retenção. Update sem data de publicação fica retido (fail-closed)."
              />
              <Input
                label="Deadline de instalação (dias)"
                type="number"
                min={0}
                max={365}
                value={deadlineDays}
                disabled={!canEdit}
                onChange={(event) => setDeadlineDays(Math.max(0, Math.min(365, Number(event.target.value) || 0)))}
                hint="0 = sem prazo. Vencido o prazo, a janela é ampliada até o deadline (nunca reinicia sozinho)."
              />
            </div>
          </Card>

          {isDirty && (
            <div className="flex items-center justify-end gap-2 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3">
              <span className="mr-auto text-xs text-muted-foreground">Existem alterações não salvas nesta política.</span>
              {actionButtons}
            </div>
          )}
        </>
      )}
    </div>
  );
}
