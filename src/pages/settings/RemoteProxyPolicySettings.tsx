import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Button,
  Card,
  CardHeader,
  ErrorDisplay,
  Icon,
  Loading,
  PageHeader,
  Select,
} from "@/components/ui";
import { useAllSites, useClients } from "@/hooks";
import {
  getClientConfig,
  getEntityAudit,
  getRecentAudit,
  getServerConfig,
  getSiteConfig,
  patchClientConfig,
  patchServerConfig,
  patchSiteConfig,
} from "@/services/configurationApi";
import type { ConfigurationAuditEntry } from "@/api/types";
import {
  CIDR_PRESETS,
  EMPTY_POLICY,
  PORT_PRESETS,
  PROXY_MODE_ALLOWLIST,
  PROXY_MODE_OPEN,
  formatPorts,
  parsePolicy,
  parsePorts,
  serializePolicy,
  validatePolicy,
  type RemoteProxyEntry,
  type RemoteProxyPolicy,
} from "@/utils/remoteProxyPolicy";

type ScopeKind = "global" | "client" | "site";

/**
 * Tela de Destinos Permitidos do Proxy (allowlist do acesso remoto).
 *
 * Existe porque a allowlist só vivia no appsettings.json e NENHUMA tela a
 * escrevia: o default vazio bloqueava todo destino, e o operador só via
 * "allowlist vazia: acesso bloqueado para <ip>:<porta>" no console do proxy.
 *
 * Herança: Global → Cliente → Site. O escopo mais específico que definir a
 * política SUBSTITUI a de cima por inteiro (não há merge de listas) — o mesmo
 * contrato de AgentUpdatePolicy/AIIntegration. "Herdar" = não gravar nada neste
 * escopo.
 *
 * O cadastro GLOBAL nasce inerte (flag remoteProxyGlobalEntriesEnabled=false):
 * fica salvo e visível, mas só passa a valer quando liberado aqui.
 */
export default function RemoteProxyPolicySettings() {
  const clientsQuery = useClients();
  const sitesQuery = useAllSites();

  const [scope, setScope] = useState<ScopeKind>("global");
  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [policy, setPolicy] = useState<RemoteProxyPolicy>({ ...EMPTY_POLICY, entries: [] });
  const [globalEnabled, setGlobalEnabled] = useState(false);
  /** null = este escopo não define política (herda do nível acima). */
  const [ownsPolicy, setOwnsPolicy] = useState(true);

  const [auditEntries, setAuditEntries] = useState<ConfigurationAuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const clientOptions = useMemo(
    () => [
      { value: "", label: "Selecione um cliente" },
      ...((clientsQuery.data ?? []).map((c) => ({ value: c.id, label: c.name }))),
    ],
    [clientsQuery.data],
  );

  const siteOptions = useMemo(() => {
    const all = sitesQuery.data ?? [];
    const filtered = clientId ? all.filter((s) => s.clientId === clientId) : all;
    return [
      { value: "", label: "Selecione um site" },
      ...filtered.map((s) => ({ value: s.id, label: s.name })),
    ];
  }, [sitesQuery.data, clientId]);

  const scopeReady =
    scope === "global" || (scope === "client" && !!clientId) || (scope === "site" && !!siteId);

  const loadPolicy = useCallback(async () => {
    if (!scopeReady) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (scope === "global") {
        const server = await getServerConfig();
        setPolicy(parsePolicy(server.remoteProxyPolicyJson));
        setGlobalEnabled(server.remoteProxyGlobalEntriesEnabled === true);
        setOwnsPolicy(true);
      } else if (scope === "client") {
        const config = await getClientConfig(clientId);
        const raw = config.remoteProxyPolicyJson ?? null;
        setOwnsPolicy(raw !== null && raw !== undefined && raw !== "");
        setPolicy(raw ? parsePolicy(raw) : { ...EMPTY_POLICY, entries: [] });
      } else {
        const config = await getSiteConfig(siteId);
        const raw = config.remoteProxyPolicyJson ?? null;
        setOwnsPolicy(raw !== null && raw !== undefined && raw !== "");
        setPolicy(raw ? parsePolicy(raw) : { ...EMPTY_POLICY, entries: [] });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar a política de proxy.");
    } finally {
      setLoading(false);
    }
  }, [scope, scopeReady, clientId, siteId]);

  useEffect(() => {
    void loadPolicy();
  }, [loadPolicy]);

  const loadAudit = useCallback(async () => {
    if (!scopeReady) return;
    setAuditLoading(true);
    try {
      const entityType = scope === "global" ? "Server" : scope === "client" ? "Client" : "Site";
      const entityId = scope === "global" ? "" : scope === "client" ? clientId : siteId;
      const entries = entityId
        ? await getEntityAudit(entityType, entityId, 50)
        : await getRecentAudit(30, 200);
      setAuditEntries(
        entries.filter(
          (entry) =>
            entry.fieldName === "RemoteProxyPolicyJson" ||
            entry.fieldName === "RemoteProxyGlobalEntriesEnabled",
        ),
      );
    } catch {
      // Auditoria é informativa: falha aqui não deve quebrar a tela.
      setAuditEntries([]);
    } finally {
      setAuditLoading(false);
    }
  }, [scope, scopeReady, clientId, siteId]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  const updateEntry = (index: number, patch: Partial<RemoteProxyEntry>) => {
    setPolicy((current) => ({
      ...current,
      entries: current.entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    }));
  };

  const addEntry = (cidr = "", note = "") => {
    setPolicy((current) => ({
      ...current,
      entries: [...current.entries, { cidr, ports: [], note }],
    }));
  };

  const removeEntry = (index: number) => {
    setPolicy((current) => ({
      ...current,
      entries: current.entries.filter((_, i) => i !== index),
    }));
  };

  const handleSave = async () => {
    const issues = validatePolicy(policy);
    if (issues.length) {
      toast.error(issues[0].message);
      return;
    }

    setSaving(true);
    try {
      const json = serializePolicy(policy);

      if (scope === "global") {
        await patchServerConfig({
          remoteProxyPolicyJson: json,
          remoteProxyGlobalEntriesEnabled: globalEnabled,
        });
      } else if (scope === "client") {
        // null explícito = "herdar": limpa a política deste escopo.
        await patchClientConfig(clientId, {
          remoteProxyPolicyJson: ownsPolicy ? json : null,
        });
      } else {
        await patchSiteConfig(siteId, {
          remoteProxyPolicyJson: ownsPolicy ? json : null,
        });
      }

      toast.success("Destinos do proxy salvos.");
      await loadPolicy();
      await loadAudit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const isOpen = policy.mode === PROXY_MODE_OPEN;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Destinos Permitidos do Proxy"
        description="Controla quais endereços o túnel TCP/HTTP do acesso remoto pode alcançar. Herança: Global → Cliente → Site."
      />

      <Card>
        <CardHeader
          title="Escopo"
          subtitle="A política do escopo mais específico substitui a do nível acima por inteiro."
        />
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          <Select
            label="Nível"
            value={scope}
            onChange={(e) => setScope(e.target.value as ScopeKind)}
            options={[
              { value: "global", label: "Global (toda a frota)" },
              { value: "client", label: "Cliente" },
              { value: "site", label: "Site" },
            ]}
          />
          {scope === "client" && (
            <Select
              label="Cliente"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              options={clientOptions}
            />
          )}
          {scope === "site" && (
            <>
              <Select
                label="Cliente"
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setSiteId("");
                }}
                options={clientOptions}
              />
              <Select
                label="Site"
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                options={siteOptions}
              />
            </>
          )}
        </div>
      </Card>

      {loading && <Loading />}
      {error && <ErrorDisplay message={error} />}

      {!loading && !error && !scopeReady && (
        <Card>
          <p className="p-4 text-sm text-muted-foreground">
            Selecione o {scope === "client" ? "cliente" : "site"} para editar a política.
          </p>
        </Card>
      )}

      {!loading && !error && scopeReady && (
        <>
          <Card>
            <CardHeader
              title="Modo"
              subtitle="Somente destinos pré-aprovados é o padrão seguro."
            />
            <div className="space-y-3 p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  className="mt-1"
                  checked={!isOpen}
                  onChange={() =>
                    setPolicy((c) => ({ ...c, mode: PROXY_MODE_ALLOWLIST }))
                  }
                />
                <span>
                  <span className="block text-sm font-medium">Somente destinos pré-aprovados</span>
                  <span className="block text-xs text-muted-foreground">
                    O agent recusa qualquer destino fora da lista. Recomendado.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  className="mt-1"
                  checked={isOpen}
                  onChange={() => setPolicy((c) => ({ ...c, mode: PROXY_MODE_OPEN }))}
                />
                <span>
                  <span className="block text-sm font-medium">Liberar acesso geral</span>
                  <span className="block text-xs text-muted-foreground">
                    Qualquer IP roteável passa a ser alcançável a partir do endpoint.
                  </span>
                </span>
              </label>

              {isOpen && (
                <div className="rounded border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
                  <strong>Atenção:</strong> este proxy executa DENTRO do computador do
                  cliente. Liberar o acesso geral transforma o RMM num caminho para a rede
                  interna de todos os clientes. Continuam bloqueados, sempre, os endereços
                  de link-local, multicast e metadados de nuvem (169.254.x.x / IMDS).
                </div>
              )}
            </div>
          </Card>

          {scope === "global" && (
            <Card>
              <CardHeader
                title="Destinos globais"
                subtitle="Nasce desligado: o cadastro global fica pronto, mas inerte, até ser liberado."
              />
              <label className="flex cursor-pointer items-start gap-3 p-4">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={globalEnabled}
                  onChange={(e) => setGlobalEnabled(e.target.checked)}
                />
                <span>
                  <span className="block text-sm font-medium">
                    Usar os destinos globais desta tela
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Desligado, os destinos abaixo ficam salvos mas são ignorados. Destinos
                    cadastrados em cliente e site continuam valendo normalmente.
                  </span>
                </span>
              </label>
            </Card>
          )}

          {scope !== "global" && (
            <Card>
              <CardHeader
                title="Herança"
                subtitle="Definir aqui substitui a política do nível acima por inteiro."
              />
              <label className="flex cursor-pointer items-start gap-3 p-4">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={ownsPolicy}
                  onChange={(e) => setOwnsPolicy(e.target.checked)}
                />
                <span>
                  <span className="block text-sm font-medium">Definir política neste nível</span>
                  <span className="block text-xs text-muted-foreground">
                    Desmarcado, este {scope === "client" ? "cliente" : "site"} herda a
                    política do nível superior.
                  </span>
                </span>
              </label>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Destinos pré-aprovados"
              subtitle="CIDR ou IP avulso. Portas vazias = todas as portas daquele destino."
            />
            <div className="space-y-3 p-4">
              {policy.entries.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nenhum destino cadastrado. Com o modo "somente pré-aprovados", nenhum
                  acesso é permitido.
                </p>
              )}

              {policy.entries.map((entry, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[2fr_1fr_2fr_auto]">
                  <input
                    className="rounded border border-border bg-surface px-2 py-1.5 text-sm"
                    placeholder="192.168.10.0/24"
                    value={entry.cidr}
                    onChange={(e) => updateEntry(index, { cidr: e.target.value })}
                  />
                  <input
                    className="rounded border border-border bg-surface px-2 py-1.5 text-sm"
                    placeholder="8006, 22"
                    value={formatPorts(entry.ports)}
                    onChange={(e) => {
                      const { ports } = parsePorts(e.target.value);
                      updateEntry(index, { ports });
                    }}
                  />
                  <input
                    className="rounded border border-border bg-surface px-2 py-1.5 text-sm"
                    placeholder="Observação (opcional)"
                    value={entry.note ?? ""}
                    onChange={(e) => updateEntry(index, { note: e.target.value })}
                  />
                  <Button variant="ghost" onClick={() => removeEntry(index)} title="Remover">
                    <Icon name="delete" />
                  </Button>
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button variant="secondary" onClick={() => addEntry()}>
                  Adicionar destino
                </Button>
                <span className="text-xs text-muted-foreground">Atalhos:</span>
                {CIDR_PRESETS.map((preset) => (
                  <Button
                    key={preset.cidr}
                    variant="ghost"
                    onClick={() => addEntry(preset.cidr, preset.note)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Opções avançadas"
              subtitle="Portas globais, loopback e teto de resposta."
            />
            <div className="space-y-4 p-4">
              <div>
                <label className="block text-sm font-medium">Portas globais permitidas</label>
                <input
                  className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
                  placeholder="Vazio = todas as portas"
                  value={formatPorts(policy.allowedPorts)}
                  onChange={(e) => {
                    const { ports } = parsePorts(e.target.value);
                    setPolicy((c) => ({ ...c, allowedPorts: ports }));
                  }}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Aplicado a TODOS os destinos. Vazio libera qualquer porta.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PORT_PRESETS.map((preset) => (
                    <Button
                      key={preset.port}
                      variant="ghost"
                      onClick={() =>
                        setPolicy((c) => ({
                          ...c,
                          allowedPorts: [...new Set([...c.allowedPorts, preset.port])].sort(
                            (a, b) => a - b,
                          ),
                        }))
                      }
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={policy.allowLoopback}
                  onChange={(e) =>
                    setPolicy((c) => ({ ...c, allowLoopback: e.target.checked }))
                  }
                />
                <span>
                  <span className="block text-sm font-medium">Permitir loopback</span>
                  <span className="block text-xs text-muted-foreground">
                    Necessário para alcançar 127.0.0.1/localhost no próprio endpoint — e
                    mesmo assim o endereço precisa constar na lista acima.
                  </span>
                </span>
              </label>
            </div>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => void loadPolicy()} disabled={saving}>
              Descartar alterações
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>

          <Card>
            <CardHeader
              title="Histórico de alterações"
              subtitle="Quem alterou a política, quando e de que valor para qual."
            />
            <div className="p-4">
              {auditLoading && <Loading />}
              {!auditLoading && auditEntries.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nenhuma alteração registrada para este escopo.
                </p>
              )}
              {!auditLoading && auditEntries.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-1 pr-3">Quando</th>
                        <th className="py-1 pr-3">Campo</th>
                        <th className="py-1 pr-3">Por</th>
                        <th className="py-1">Novo valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditEntries.map((entry) => (
                        <tr key={entry.id} className="border-t border-border">
                          <td className="py-1 pr-3">
                            {new Date(entry.changedAt).toLocaleString()}
                          </td>
                          <td className="py-1 pr-3">{entry.fieldName}</td>
                          <td className="py-1 pr-3">{entry.changedBy ?? "—"}</td>
                          <td className="max-w-md truncate py-1 font-mono">
                            {entry.newValue ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
