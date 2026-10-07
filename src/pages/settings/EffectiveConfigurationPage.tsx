import { useMemo, useState } from "react";
import { Building2, Lock, MapPin, RefreshCw } from "lucide-react";
import { Badge, Button, Card, CardHeader, ErrorDisplay, Loading, Select } from "@/components/ui";
import { statusSurface, toApiFieldName } from "@/components/configuration";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import {
  useClientEffectiveConfig,
  useSiteEffectiveConfig,
} from "@/hooks/useConfigurationApi";
import { formatAppStorePolicyValue, serverEditableFields } from "@/utils/configurationEditors";
import type { ResolvedConfiguration } from "@/api";

const ORIGIN_LABELS: Record<number, string> = {
  0: "Bloqueado",
  2: "Servidor",
  3: "Cliente",
  4: "Site",
};

/** Campos escalares exibidos no simulador (os objetos aparecem só pela origem). */
const SCALAR_FIELDS = serverEditableFields.filter(
  (field) => field.kind === "boolean" || field.kind === "number" || field.kind === "policy",
);

/** Overrides de objeto (chave do mapa de inheritance, não do JSON). */
const OBJECT_FIELDS: { label: string; inheritanceKey: string }[] = [
  { label: "Atualização Automática", inheritanceKey: "AutoUpdate" },
  { label: "Atualização do Agente", inheritanceKey: "AgentUpdate" },
  { label: "Integração com IA", inheritanceKey: "AIIntegration" },
  { label: "Processamento em Segundo Plano", inheritanceKey: "BackgroundProcessing" },
];

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Ativado" : "Desativado";
  if (key === "appStorePolicy") return formatAppStorePolicyValue(value) || "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function OriginBadge({ sourceType }: { sourceType: number | undefined }) {
  const label = sourceType === undefined ? "—" : ORIGIN_LABELS[sourceType] ?? String(sourceType);
  const color = sourceType === 0 ? "danger" : sourceType === 4 ? "accent" : sourceType === 3 ? "primary" : "slate";
  return <Badge color={color}>{label}</Badge>;
}

export default function EffectiveConfigurationPage() {
  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");

  const clientsQuery = useClients();
  const sitesQuery = useSites(clientId, false);
  const clientEffective = useClientEffectiveConfig(clientId);
  const siteEffective = useSiteEffectiveConfig(siteId);

  const clientOptions = useMemo(
    () => [
      { value: "", label: "Selecione um cliente" },
      ...((clientsQuery.data ?? []).map((client) => ({ value: client.id, label: client.name })) ?? []),
    ],
    [clientsQuery.data],
  );

  const siteOptions = useMemo(
    () => [
      { value: "", label: clientId ? "Cliente inteiro (sem site)" : "Escolha um cliente primeiro" },
      ...((sitesQuery.data ?? []).map((site) => ({ value: site.id, label: site.name })) ?? []),
    ],
    [clientId, sitesQuery.data],
  );

  const resolved: ResolvedConfiguration | undefined = siteId
    ? siteEffective.data
    : clientId
      ? clientEffective.data
      : undefined;

  const query = siteId ? siteEffective : clientEffective;
  const scopeLabel = siteId ? "Site" : clientId ? "Cliente" : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configuração Efetiva</h1>
        <p className="text-sm text-muted">
          Simulador de herança Server → Client → Site: mostra o valor efetivo e a origem de cada campo.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Escopo"
          subtitle="Selecione um cliente (e opcionalmente um site) para resolver a configuração"
        />
        <div className="grid gap-3 md:grid-cols-2">
          <Select
            label="Cliente"
            options={clientOptions}
            value={clientId}
            onChange={(event) => {
              setClientId(event.target.value);
              setSiteId("");
            }}
          />
          <Select
            label="Site"
            options={siteOptions}
            value={siteId}
            disabled={!clientId || sitesQuery.isLoading}
            onChange={(event) => setSiteId(event.target.value)}
          />
        </div>
      </Card>

      {clientId && query.isLoading && <Loading message="Resolvendo configuração efetiva..." />}

      {clientId && query.isError && (
        <ErrorDisplay
          message="Não foi possível resolver a configuração efetiva."
          onRetry={() => query.refetch()}
        />
      )}

      {resolved && (
        <>
          <Card>
            <CardHeader
              title="Origem dos valores"
              subtitle={scopeLabel ? `Resolvido no escopo: ${scopeLabel}` : undefined}
              action={
                <Button size="sm" variant="ghost" onClick={() => query.refetch()}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Atualizar
                </Button>
              }
            />

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 pr-4">Campo</th>
                    <th className="py-2 pr-4">Valor efetivo</th>
                    <th className="py-2">Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {SCALAR_FIELDS.map((field) => {
                    const value = (resolved as unknown as Record<string, unknown>)[field.key];
                    const sourceType = resolved.inheritance?.[toApiFieldName(field.key)];
                    return (
                      <tr key={field.key} className="border-b border-border/50">
                        <td className="py-2 pr-4">
                          <span className="text-foreground">{field.label}</span>
                          <span className="ml-2 font-mono text-[11px] text-muted">{field.key}</span>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {formatValue(field.key, value)}
                        </td>
                        <td className="py-2">
                          <OriginBadge sourceType={sourceType} />
                        </td>
                      </tr>
                    );
                  })}
                  {OBJECT_FIELDS.map((field) => (
                    <tr key={field.inheritanceKey} className="border-b border-border/50">
                      <td className="py-2 pr-4">
                        <span className="text-foreground">{field.label}</span>
                        <span className="ml-2 font-mono text-[11px] text-muted">{field.inheritanceKey}</span>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">objeto (JSON)</td>
                      <td className="py-2">
                        <OriginBadge sourceType={resolved.inheritance?.[field.inheritanceKey]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Campos bloqueados"
              subtitle="Locks definidos no servidor ou no cliente que impedem sobrescrita nos níveis inferiores"
            />
            {(resolved.blockedFields ?? []).length === 0 ? (
              <p className="text-sm text-muted">Nenhum campo bloqueado neste escopo.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(resolved.blockedFields ?? []).map((field) => (
                  <span
                    key={field}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs ${statusSurface.danger}`}
                  >
                    <Lock className="h-3 w-3" />
                    {field}
                  </span>
                ))}
              </div>
            )}
          </Card>

          <div className="flex flex-wrap gap-2 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              Escopo resolvido em {new Date(resolved.resolvedAt).toLocaleString()}
            </span>
            {siteId && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                Site {siteId}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
