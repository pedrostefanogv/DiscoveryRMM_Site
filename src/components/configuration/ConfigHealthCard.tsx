import { useState } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  Cloud,
  FileStack,
  Loader2,
  RefreshCw,
  Wifi,
  XCircle,
} from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui";
import type { ServerConfiguration } from "@/api";
import {
  parseTicketAttachmentSettings,
  type NatsTestResult,
  type ObjectStorageTestResult,
  type StoredAiKeyTestResult,
} from "@/services/configurationApi";
import {
  useTestNatsServer,
  useTestObjectStorage,
  useTestStoredAiKey,
} from "@/hooks/useConfigurationApi";

type HealthStatus = "ok" | "warn" | "error" | "unknown";

interface HealthItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  status: HealthStatus;
  detail: string;
}

const STATUS_CLASSES: Record<HealthStatus, string> = {
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  error: "border-red-500/30 bg-red-500/10 text-red-300",
  unknown: "border-border bg-surface-light text-muted",
};

function statusIcon(status: HealthStatus) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 shrink-0" />;
  if (status === "error") return <XCircle className="h-4 w-4 shrink-0" />;
  return <Activity className="h-4 w-4 shrink-0" />;
}

export function ConfigHealthCard({ config }: { config: ServerConfiguration | undefined }) {
  const storageTest = useTestObjectStorage();
  const natsTest = useTestNatsServer();
  const aiTest = useTestStoredAiKey();

  const [storageResult, setStorageResult] = useState<ObjectStorageTestResult | null>(null);
  const [natsResult, setNatsResult] = useState<NatsTestResult | null>(null);
  const [aiResult, setAiResult] = useState<StoredAiKeyTestResult | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const attachments = parseTicketAttachmentSettings(config?.ticketAttachmentSettingsJson);
  const storageConfigured = Boolean(config?.objectStorageEndpoint?.trim()) && Boolean(config?.objectStorageBucketName?.trim());
  const natsEnabled = config?.natsEnabled === true;
  const natsHost = (config?.natsServerHostExternal || config?.natsServerHostInternal || "").trim();
  const aiConfigured = Boolean(config?.aiApiKeyConfigured);

  const runStorage = async () => {
    try {
      const result = await storageTest.mutateAsync();
      setStorageResult(result);
    } catch (error) {
      setStorageResult({
        success: false,
        configurationValid: false,
        bucketReachable: false,
        errors: [error instanceof Error ? error.message : "Falha no teste de storage"],
        latencyMs: 0,
      });
    }
  };

  const runNats = async () => {
    if (!natsHost) {
      setNatsResult({ ok: false, errors: ["Informe o host externo ou interno do NATS."] });
      return;
    }
    try {
      const result = await natsTest.mutateAsync({ url: natsHost });
      setNatsResult(result);
    } catch (error) {
      setNatsResult({ ok: false, errors: [error instanceof Error ? error.message : "Falha no teste do NATS"] });
    }
  };

  const runAi = async () => {
    try {
      const result = await aiTest.mutateAsync();
      setAiResult(result);
    } catch (error) {
      setAiResult({ ok: false, error: error instanceof Error ? error.message : "Falha ao testar a IA" });
    }
  };

  const runAll = async () => {
    setRunning(true);
    try {
      await Promise.allSettled([runStorage(), runNats(), runAi()]);
      setLastRunAt(new Date().toLocaleString());
    } finally {
      setRunning(false);
    }
  };

  const items: HealthItem[] = [
    {
      key: "storage",
      label: "Object Storage (S3/MinIO)",
      icon: <Cloud className="h-4 w-4" />,
      status: storageResult
        ? storageResult.success
          ? "ok"
          : "error"
        : storageConfigured
          ? "unknown"
          : "warn",
      detail: storageResult
        ? storageResult.success
          ? `Conectado — ${storageResult.latencyMs}ms`
          : storageResult.errors.join(" · ") || "Falha na conexão"
        : storageConfigured
          ? "Configurado — clique em testar"
          : "Endpoint/bucket não configurados",
    },
    {
      key: "nats",
      label: "NATS (realtime)",
      icon: <Wifi className="h-4 w-4" />,
      status: natsResult ? (natsResult.ok ? "ok" : "error") : natsEnabled ? "unknown" : "warn",
      detail: natsResult
        ? natsResult.ok
          ? `Conectado${typeof natsResult.latencyMs === "number" ? ` — ${natsResult.latencyMs}ms` : ""}`
          : (natsResult.errors ?? []).join(" · ") || "Falha na conexão"
        : natsEnabled
          ? natsHost
            ? `Host: ${natsHost} — clique em testar`
            : "Host não informado"
          : "NATS desabilitado",
    },
    {
      key: "ai",
      label: "Inteligência Artificial",
      icon: <Bot className="h-4 w-4" />,
      status: aiResult ? (aiResult.ok ? "ok" : "error") : aiConfigured ? "unknown" : "warn",
      detail: aiResult
        ? aiResult.ok
          ? `API key válida (${aiResult.provider ?? "provider"})`
          : aiResult.error ?? "API key inválida"
        : aiConfigured
          ? "API key configurada — clique em testar"
          : "Nenhuma API key configurada",
    },
    {
      key: "attachments",
      label: "Anexos de tickets",
      icon: <FileStack className="h-4 w-4" />,
      status: attachments.enabled ? (storageConfigured ? "ok" : "warn") : "warn",
      detail: attachments.enabled
        ? storageConfigured
          ? `Habilitado — máx. ${Math.round(attachments.maxFileSizeBytes / (1024 * 1024))} MB`
          : "Habilitado, mas sem Object Storage configurado"
        : "Desabilitado",
    },
  ];

  const isBusy = running || storageTest.isPending || natsTest.isPending || aiTest.isPending;

  return (
    <Card>
      <CardHeader
        title="Saúde da configuração"
        subtitle="Testa as integrações configuradas neste servidor"
        action={
          <Button size="sm" variant="secondary" onClick={runAll} loading={isBusy} disabled={isBusy}>
            <RefreshCw className="h-3.5 w-3.5" />
            Testar tudo
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2" aria-live="polite">
        {items.map((item) => (
          <div
            key={item.key}
            className={`flex items-start gap-3 rounded-xl border p-4 ${STATUS_CLASSES[item.status]}`}
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/10">
              {isBusy && item.status === "unknown" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                item.icon
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {statusIcon(item.status)}
                <p className="text-sm font-medium text-foreground">{item.label}</p>
              </div>
              <p className="mt-0.5 break-words text-xs">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {lastRunAt ? `Último teste: ${lastRunAt}` : "Testes individuais disponíveis pelos cards de NATS e Object Storage."}
        </p>
        <p className="text-xs text-muted">
          Os testes usam a configuração salva; segredos nunca são exibidos.
        </p>
      </div>
    </Card>
  );
}
