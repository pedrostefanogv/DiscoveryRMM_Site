import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { RotateCcw, Save } from "lucide-react";
import { Button, Card, CardHeader, ErrorDisplay, Input, Loading } from "@/components/ui";
import { ApiError } from "@/api";
import { statusSurface } from "@/components/configuration";
import { usePatchServerConfig, useServerConfig } from "@/hooks/useConfigurationApi";
import { parseBrandingSettings } from "@/services/configurationApi";
import { useTheme } from "@/theme/ThemeContext";

interface BrandingForm {
  applicationName: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  companyName: string;
  companyWebsite: string;
  supportEmail: string;
}

const DEFAULTS: BrandingForm = {
  applicationName: "Discovery",
  logoUrl: "",
  primaryColor: "#6366f1",
  secondaryColor: "#ec4899",
  companyName: "",
  companyWebsite: "",
  supportEmail: "",
};

function toForm(value: ReturnType<typeof parseBrandingSettings>): BrandingForm {
  return {
    applicationName: value?.applicationName ?? DEFAULTS.applicationName,
    logoUrl: value?.logoUrl ?? "",
    primaryColor: value?.primaryColor ?? DEFAULTS.primaryColor,
    secondaryColor: value?.secondaryColor ?? DEFAULTS.secondaryColor,
    companyName: value?.companyName ?? "",
    companyWebsite: value?.companyWebsite ?? "",
    supportEmail: value?.supportEmail ?? "",
  };
}

export default function BrandingSettings() {
  const serverQuery = useServerConfig();
  const patchMutation = usePatchServerConfig();
  const { updateBranding } = useTheme();

  const [form, setForm] = useState<BrandingForm>(DEFAULTS);
  const [dirty, setDirty] = useState(false);
  const [loadedFromServer, setLoadedFromServer] = useState(false);

  const serverBranding = useMemo(
    () => parseBrandingSettings(serverQuery.data?.brandingSettingsJson),
    [serverQuery.data?.brandingSettingsJson],
  );

  useEffect(() => {
    if (!serverQuery.data || loadedFromServer) return;
    setForm(toForm(serverBranding));
    setLoadedFromServer(true);
  }, [serverQuery.data, serverBranding, loadedFromServer]);

  // Mantém o tema local (preview imediato) alinhado ao que está no servidor.
  useEffect(() => {
    if (!loadedFromServer) return;
    updateBranding({
      appName: form.applicationName || DEFAULTS.applicationName,
      logoUrl: form.logoUrl || null,
      primaryColor: form.primaryColor,
      accentColor: form.secondaryColor,
    });
  }, [form.applicationName, form.logoUrl, form.primaryColor, form.secondaryColor, loadedFromServer, updateBranding]);

  const set = <K extends keyof BrandingForm>(key: K, value: BrandingForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    const payload = {
      applicationName: form.applicationName.trim() || DEFAULTS.applicationName,
      logoUrl: form.logoUrl.trim() || null,
      primaryColor: form.primaryColor,
      secondaryColor: form.secondaryColor,
      companyName: form.companyName.trim() || null,
      companyWebsite: form.companyWebsite.trim() || null,
      supportEmail: form.supportEmail.trim() || null,
    };

    try {
      await patchMutation.mutateAsync({ brandingSettingsJson: JSON.stringify(payload) });
      setDirty(false);
      toast.success("Branding salvo no servidor.");
    } catch (error) {
      toast.error(readApiError(error));
    }
  };

  const handleReset = () => {
    setForm(DEFAULTS);
    setDirty(true);
  };

  if (serverQuery.isLoading) {
    return <Loading message="Carregando branding do servidor..." />;
  }

  if (serverQuery.isError) {
    return <ErrorDisplay message={readApiError(serverQuery.error)} onRetry={serverQuery.refetch} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Branding</h1>
          <p className="text-sm text-muted">
            Identidade visual global. É herdada por clientes/sites e enviada aos agentes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs ${
              dirty ? statusSurface.warning : statusSurface.neutral
            }`}
          >
            {dirty ? "Alterações não salvas" : "Sem alterações pendentes"}
          </span>
          <Button size="sm" variant="ghost" onClick={handleReset} disabled={!dirty}>
            <RotateCcw className="h-3.5 w-3.5" />
            Restaurar padrão
          </Button>
          <Button size="sm" onClick={handleSave} loading={patchMutation.isPending} disabled={!dirty}>
            <Save className="h-3.5 w-3.5" />
            Salvar
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Identidade"
          subtitle="Nome, logo e dados institucionais exibidos no painel e nos agentes"
        />
        <div className="grid gap-6 sm:grid-cols-2">
          <Input
            label="Nome da aplicação"
            value={form.applicationName}
            onChange={(event) => set("applicationName", event.target.value)}
          />
          <Input
            label="URL do logo"
            placeholder="https://..."
            value={form.logoUrl}
            onChange={(event) => set("logoUrl", event.target.value)}
          />
          <Input
            label="Empresa"
            value={form.companyName}
            onChange={(event) => set("companyName", event.target.value)}
          />
          <Input
            label="Site da empresa"
            placeholder="https://..."
            value={form.companyWebsite}
            onChange={(event) => set("companyWebsite", event.target.value)}
          />
          <Input
            label="Email de suporte"
            type="email"
            value={form.supportEmail}
            onChange={(event) => set("supportEmail", event.target.value)}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Cores" subtitle="Cor primária e de destaque" />
        <div className="grid gap-6 sm:grid-cols-2">
          <ColorPicker
            label="Cor primária"
            value={form.primaryColor}
            onChange={(value) => set("primaryColor", value)}
          />
          <ColorPicker
            label="Cor de destaque"
            value={form.secondaryColor}
            onChange={(value) => set("secondaryColor", value)}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Preview" subtitle="Veja como as cores ficam" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Swatch label="Primary" color={form.primaryColor} />
          <Swatch label="Accent" color={form.secondaryColor} />
        </div>
      </Card>
    </div>
  );
}

function readApiError(error: unknown): string {
  if (error instanceof ApiError) return `${error.status}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "Erro inesperado";
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-muted-foreground">{label}</label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-14 cursor-pointer rounded border border-border bg-transparent"
        />
        <input
          type="text"
          aria-label={`${label} (hex)`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary/50"
        />
      </div>
    </div>
  );
}

function Swatch({ label, color }: { label: string; color: string }) {
  return (
    <div className="text-center">
      <svg className="mb-2 h-16 w-full rounded-lg border border-border" viewBox="0 0 100 64" aria-hidden="true" preserveAspectRatio="none">
        <rect x="0" y="0" width="100" height="64" fill={color} />
      </svg>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xs font-mono text-muted">{color}</p>
    </div>
  );
}
