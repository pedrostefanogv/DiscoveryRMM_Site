import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Icon, Button, Card, CardHeader, ErrorDisplay, Input, Loading, PageHeader, Select } from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import { usePatchPolicy, useUpdatePatchPolicy } from "@/hooks/usePatches";
import type { PatchApprovalScopeType, PatchEnforcementMode, PatchRebootPolicy } from "@/api/types";

const SEVERITIES = ["Critical", "Important", "Moderate", "Low"];
const CLASSIFICATIONS = ["Security Updates", "Critical Updates", "Definition Updates", "Update Rollups", "Updates"];

const ENFORCEMENT_OPTIONS: Array<{ value: PatchEnforcementMode; label: string }> = [
  { value: "Monitor", label: "Monitorar (somente inventário)" },
  { value: "AgentEnforced", label: "Agente instala apenas aprovados" },
  { value: "OsEnforced", label: "Enforcement no SO (ocultar recusados / pausar WU) — best-effort" },
];

const REBOOT_OPTIONS: Array<{ value: PatchRebootPolicy; label: string }> = [
  { value: "Never", label: "Nunca reiniciar automaticamente" },
  { value: "Notify", label: "Avisar e aguardar operador" },
  { value: "MaintenanceWindow", label: "Somente na janela (se habilitado)" },
];

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
  // WU-04/D09 e WU-05/D03: retenção por idade e deadline de instalação.
  const [deferralDays, setDeferralDays] = useState(0);
  const [deadlineDays, setDeadlineDays] = useState(0);
  // WU-19/WU-20 (D22): duplo consentimento para apps de terceiros.
  const [allowOs, setAllowOs] = useState(true);
  const [allowThirdParty, setAllowThirdParty] = useState(false);
  const [allowThirdPartyApps, setAllowThirdPartyApps] = useState(false);
  const [windowDays, setWindowDays] = useState("1,2,3,4,5");
  const [windowStart, setWindowStart] = useState("22:00");
  const [windowEnd, setWindowEnd] = useState("05:00");
  const [windowTimezone, setWindowTimezone] = useState("America/Sao_Paulo");

  const clients = useClients();
  const sites = useSites(clientId || undefined);

  const scopeId = scopeType === "Client" ? clientId : scopeType === "Site" ? siteId : undefined;
  const enabled = scopeType === "Global" || Boolean(scopeId);

  const policy = usePatchPolicy(scopeType, scopeId);
  const updatePolicy = useUpdatePatchPolicy();

  const clientOptions = useMemo(
    () => [{ value: "", label: "Selecione um cliente..." }, ...(clients.data ?? []).map((client) => ({ value: client.id, label: client.name }))],
    [clients.data],
  );
  const siteOptions = useMemo(
    () => [{ value: "", label: "Selecione um site..." }, ...(sites.data ?? []).map((site) => ({ value: site.id, label: site.name }))],
    [sites.data],
  );

  useEffect(() => {
    const data = policy.data;
    if (!data) return;
    setEnforcementMode(data.enforcementMode);
    setAutoInstallEnabled(data.autoInstallEnabled);
    setAutoSeverities(data.autoApproveSeverities ?? []);
    setAutoClassifications(data.autoApproveClassifications ?? []);
    setRebootPolicy(data.rebootPolicy);
    setRebootAllowed(data.rebootAllowed);
    setMaxInstallsPerRun(data.maxInstallsPerRun ?? 50);
    setHideDeniedUpdates(data.hideDeniedUpdates);
    setDeferralDays(data.deferralDays ?? 0);
    setDeadlineDays(data.deadlineDays ?? 0);
    const sources = data.sources ?? ["os"];
    setAllowOs(sources.includes("os"));
    setAllowThirdParty(sources.includes("third_party"));
    setAllowThirdPartyApps(data.allowThirdPartyApps ?? false);
    if (data.maintenanceWindowJson) {
      try {
        const parsed = JSON.parse(data.maintenanceWindowJson) as {
          days?: number[];
          start?: string;
          end?: string;
          timezone?: string;
        };
        if (Array.isArray(parsed.days)) setWindowDays(parsed.days.join(","));
        if (parsed.start) setWindowStart(parsed.start);
        if (parsed.end) setWindowEnd(parsed.end);
        if (parsed.timezone) setWindowTimezone(parsed.timezone);
      } catch {
        // JSON legado/inválido: mantém os defaults do formulário.
      }
    }
  }, [policy.data]);

  const toggle = (value: string, list: string[], setList: (next: string[]) => void) => {
    setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  const handleSave = async () => {
    if (scopeType !== "Global" && !scopeId) {
      toast.error("Selecione o cliente/site da política.");
      return;
    }

    const days = windowDays
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7);

    const maintenanceWindowJson = JSON.stringify({
      days: days.length > 0 ? days : [1, 2, 3, 4, 5, 6, 7],
      start: windowStart,
      end: windowEnd,
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
      toast.success("Política de patches salva.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar política.");
    }
  };

  if (clients.isLoading) return <Loading />;
  if (clients.isError) return <ErrorDisplay onRetry={() => clients.refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader title="Política de patches" description="Enforcement, auto-aprovação e janela de manutenção por escopo.">
        <Button onClick={() => void handleSave()} disabled={!enabled || policy.isLoading || updatePolicy.isPending}>
          <Icon name="save" className="h-4 w-4" />
          {updatePolicy.isPending ? "Salvando..." : "Salvar"}
        </Button>
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
            }}
            options={[
              { value: "Global", label: "Global" },
              { value: "Client", label: "Cliente" },
              { value: "Site", label: "Site" },
            ]}
          />
          {scopeType !== "Global" && (
            <Select label="Cliente" fullWidth={false} value={clientId} onChange={(event) => { setClientId(event.target.value); setSiteId(""); }} options={clientOptions} />
          )}
          {scopeType === "Site" && (
            <Select label="Site" fullWidth={false} value={siteId} onChange={(event) => setSiteId(event.target.value)} options={siteOptions} />
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
          <Card>
            <CardHeader title="Enforcement" subtitle="OsEnforced é opt-in por site e best-effort (GPO/Intune podem sobrepor)." />
            <Select
              label="Modo"
              value={enforcementMode}
              onChange={(event) => setEnforcementMode(event.target.value as PatchEnforcementMode)}
              options={ENFORCEMENT_OPTIONS}
            />
            <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={hideDeniedUpdates} onChange={(event) => setHideDeniedUpdates(event.target.checked)} />
              Ocultar no Windows Update os KBs recusados (somente em OsEnforced)
            </label>
          </Card>

          <Card>
            <CardHeader
              title="Origens de patch"
              subtitle="Apps de terceiros (Chocolatey/winget) exigem duplo consentimento: habilitar a origem aqui e a instalação automática abaixo."
            />
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={allowOs} onChange={(event) => setAllowOs(event.target.checked)} />
                Windows Update (OS)
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={allowThirdParty} onChange={(event) => setAllowThirdParty(event.target.checked)} />
                Aplicativos de terceiros (Chocolatey/winget)
              </label>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={allowThirdPartyApps}
                disabled={!allowThirdParty}
                onChange={(event) => setAllowThirdPartyApps(event.target.checked)}
              />
              2º consentimento: permitir auto-aprovar/instalar apps de terceiros (sem este, terceiros ficam aguardando aprovação manual)
            </label>
          </Card>

          <Card>
            <CardHeader title="Auto-aprovação" subtitle="Aplicada quando não existe regra explícita para a atualização." />
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium text-muted-foreground">Severidades</p>
                <div className="flex flex-wrap gap-3">
                  {SEVERITIES.map((severity) => (
                    <label key={severity} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={autoSeverities.includes(severity)} onChange={() => toggle(severity, autoSeverities, setAutoSeverities)} />
                      {severity}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-muted-foreground">Classificações</p>
                <div className="flex flex-wrap gap-3">
                  {CLASSIFICATIONS.map((classification) => (
                    <label key={classification} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={autoClassifications.includes(classification)} onChange={() => toggle(classification, autoClassifications, setAutoClassifications)} />
                      {classification}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Instalação automática e janela" subtitle="O job instala aprovados dentro da janela; nunca reinicia sozinho." />
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={autoInstallEnabled} onChange={(event) => setAutoInstallEnabled(event.target.checked)} />
              Instalar automaticamente os aprovados dentro da janela
            </label>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Input label="Dias (ISO 1-7)" value={windowDays} onChange={(event) => setWindowDays(event.target.value)} hint="Ex.: 1,2,3,4,5 (seg a sex)" />
              <Input label="Início" value={windowStart} onChange={(event) => setWindowStart(event.target.value)} hint="HH:mm" />
              <Input label="Fim" value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} hint="HH:mm" />
              <Input label="Timezone" value={windowTimezone} onChange={(event) => setWindowTimezone(event.target.value)} hint="Ex.: America/Sao_Paulo" />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Input
                label="Máximo de instalações por execução"
                type="number"
                value={maxInstallsPerRun}
                onChange={(event) => setMaxInstallsPerRun(Number(event.target.value) || 50)}
              />
              <Select
                label="Reinício após instalação"
                value={rebootPolicy}
                onChange={(event) => setRebootPolicy(event.target.value as PatchRebootPolicy)}
                options={REBOOT_OPTIONS}
              />
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={rebootAllowed} onChange={(event) => setRebootAllowed(event.target.checked)} />
              Autorizar reinício na janela (padrão: desligado — o operador decide)
            </label>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Input
                label="Retenção por idade (dias)"
                type="number"
                value={deferralDays}
                onChange={(event) => setDeferralDays(Math.max(0, Math.min(365, Number(event.target.value) || 0)))}
                hint="0 = sem retenção. Update sem data de publicação fica retido (fail-closed)."
              />
              <Input
                label="Deadline de instalação (dias)"
                type="number"
                value={deadlineDays}
                onChange={(event) => setDeadlineDays(Math.max(0, Math.min(365, Number(event.target.value) || 0)))}
                hint="0 = sem prazo. Vencido o prazo, a janela é ampliada até o deadline (nunca reinicia sozinho)."
              />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
