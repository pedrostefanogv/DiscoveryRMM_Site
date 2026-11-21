import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorDisplay,
  Icon,
  Input,
  Loading,
  PageHeader,
  Select,
} from "@/components/ui";
import { useAllSites, useClients } from "@/hooks";
import { ApiError } from "@/api/client";
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
  DEFAULT_STUN_CLOUDFLARE,
  DEFAULT_STUN_GOOGLE,
  EMPTY_POLICY,
  WEBRTC_KINDS,
  WEBRTC_KIND_LABELS,
  decideSaveAction,
  isPolicyDirty,
  parsePolicy,
  serializePolicy,
  validatePolicy,
  type RemoteAccessWebRtcPolicy,
  type WebRtcKind,
} from "@/utils/remoteAccessWebRtcPolicy";

type ScopeKind = "global" | "client" | "site";

/**
 * Tela de WebRTC do Acesso Remoto.
 *
 * Por que existe: o WebRTC precisa ser ATIVÁVEL e HERDÁVEL (Global → Cliente →
 * Site) sem tocar em arquivo de configuração. Antes desta tela não havia nenhum
 * caminho de UI para ligar o transporte, e o STUN/TURN só existiria no
 * appsettings — exatamente o problema que a tela de proxy resolveu para a
 * allowlist.
 *
 * Herança: o escopo mais específico que DEFINIR a política SUBSTITUI a de cima
 * por inteiro (não há merge de listas STUN/TURN) — o mesmo contrato de
 * RemoteProxyPolicy e AgentUpdatePolicy. "Herdar" = não gravar nada neste escopo.
 *
 * O default é DESLIGADO, e os campos de STUN já vêm preenchidos com os
 * servidores públicos gratuitos (Google e Cloudflare) para o operador não
 * precisar digitá-los ao ligar a feature.
 */
export default function RemoteAccessWebRtcSettings({ embedded = false }: { embedded?: boolean } = {}) {
  const clientsQuery = useClients();
  const sitesQuery = useAllSites();

  const [scope, setScope] = useState<ScopeKind>("global");
  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [policy, setPolicy] = useState<RemoteAccessWebRtcPolicy>(cloneEmpty());
  /** null = este escopo não define política (herda do nível acima). */
  const [ownsPolicy, setOwnsPolicy] = useState(true);
  /** True quando o escopo JÁ tinha política gravada (para evitar escrita inútil). */
  const [hasOwnPolicy, setHasOwnPolicy] = useState(false);
  /**
   * JSON da política como foi CARREGADA. Comparar com o estado atual é o que
   * distingue "não mexeu em nada" de "editou e quer gravar" — sem isso, mudar
   * só um timeout num escopo que herda era descartado em silêncio.
   */
  const [loadedJson, setLoadedJson] = useState("");

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
        const parsed = parsePolicy(server.remoteAccessWebRtcPolicyJson);
        // O kill switch do servidor vive FORA do blob: refletimos no estado para
        // que a UI mostre exatamente o que vale.
        const withFlag = { ...parsed, enabled: server.remoteAccessWebRtcEnabled ?? parsed.enabled };
        setPolicy(withFlag);
        setOwnsPolicy(true);
        setHasOwnPolicy(true);
        setLoadedJson(serializePolicy(withFlag));
      } else {
        const config =
          scope === "client"
            ? await getClientConfig(clientId)
            : await getSiteConfig(siteId);
        const raw = config.remoteAccessWebRtcPolicyJson ?? null;
        const owns = raw !== null && raw !== undefined && raw !== "";
        setOwnsPolicy(owns);
        setHasOwnPolicy(owns);
        setLoadedJson(owns ? serializePolicy(parsePolicy(raw)) : "");
        setPolicy(raw ? parsePolicy(raw) : cloneEmpty());
      }
    } catch (err) {
      // 404 = este cliente/site ainda NÃO tem linha de configuração própria.
      // Estado NORMAL de quem nunca foi configurado (tudo herda do nível acima),
      // não um erro: sem este tratamento a tela morria em "Client config for
      // <guid> not found" ao abrir um cliente novo.
      if (err instanceof ApiError && err.status === 404 && scope !== "global") {
        setOwnsPolicy(false);
        setHasOwnPolicy(false);
        setLoadedJson("");
        setPolicy(cloneEmpty());
      } else {
        setError(err instanceof Error ? err.message : "Falha ao carregar a política de WebRTC.");
      }
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
      // O backend grava o fieldName EXATAMENTE como veio no corpo do PATCH, e o
      // cliente envia camelCase. Comparar só com PascalCase deixaria o histórico
      // vazio em silêncio.
      const relevant = new Set([
        "remoteaccesswebrtcpolicyjson",
        "remoteaccesswebrtcenabled",
      ]);
      setAuditEntries(
        entries.filter((entry) => relevant.has((entry.fieldName ?? "").toLowerCase())),
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

  const updateIce = (patch: Partial<RemoteAccessWebRtcPolicy["ice"]>) => {
    setPolicy((current) => ({ ...current, ice: { ...current.ice, ...patch } }));
  };

  const toggleKind = (kind: WebRtcKind) => {
    setPolicy((current) => {
      const has = current.kinds.includes(kind);
      return {
        ...current,
        kinds: has ? current.kinds.filter((k) => k !== kind) : [...current.kinds, kind],
      };
    });
  };

  /** Adiciona uma linha em branco a uma lista de URLs editável. */
  const addUrl = (field: "stunUrls" | "turnUrls") => {
    setPolicy((current) => ({
      ...current,
      ice: { ...current.ice, [field]: [...current.ice[field], ""] },
    }));
  };

  const updateUrl = (field: "stunUrls" | "turnUrls", index: number, value: string) => {
    setPolicy((current) => ({
      ...current,
      ice: {
        ...current.ice,
        [field]: current.ice[field].map((u, i) => (i === index ? value : u)),
      },
    }));
  };

  const removeUrl = (field: "stunUrls" | "turnUrls", index: number) => {
    setPolicy((current) => ({
      ...current,
      ice: { ...current.ice, [field]: current.ice[field].filter((_, i) => i !== index) },
    }));
  };

  /** Restaura os STUN públicos gratuitos (o default do produto). */
  const restoreDefaultStun = () => {
    updateIce({ stunUrls: [DEFAULT_STUN_GOOGLE, DEFAULT_STUN_CLOUDFLARE] });
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
          remoteAccessWebRtcPolicyJson: json,
          remoteAccessWebRtcEnabled: policy.enabled,
        });
      } else {
        const action = decideSaveAction({
          ownsPolicy,
          hasOwnPolicy,
          isPolicyDirty: isPolicyDirty(policy, loadedJson),
        });

        if (action === "skip") {
          // Herdava, mantém "herdar" e nada foi editado: gravar criaria uma linha
          // vazia + auditoria de uma mudança que não muda nada.
          toast.success("Nada a salvar: este nível continua herdando.");
          return;
        }

        // "persist" grava a política; "clear" grava null (volta a herdar).
        const payload =
          action === "persist"
            ? { remoteAccessWebRtcPolicyJson: json, remoteAccessWebRtcEnabled: policy.enabled }
            : { remoteAccessWebRtcPolicyJson: null, remoteAccessWebRtcEnabled: null };

        if (scope === "client") {
          await patchClientConfig(clientId, payload);
        } else {
          await patchSiteConfig(siteId, payload);
        }

        // Gravar implica passar a definir a política neste nível.
        if (action === "persist") {
          setOwnsPolicy(true);
          setHasOwnPolicy(true);
        }
      }

      toast.success("Configuração de WebRTC salva.");
      await loadPolicy();
      await loadAudit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const issues = useMemo(() => validatePolicy(policy), [policy]);
  const issueFor = (field: string) => issues.find((i) => i.field === field)?.message;
  const dirty = useMemo(() => isPolicyDirty(policy, loadedJson), [policy, loadedJson]);
  const turnConfigured = policy.ice.turnUrls.some((u) => u.trim());

  if (loading) return <Loading message="Carregando configuração de WebRTC..." />;

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader
          title="WebRTC do Acesso Remoto"
          description="Transporte direto (peer-to-peer) para tela, túnel RDP/TCP e arquivos. Herança: Global → Cliente → Site. Desligado, todo o tráfego continua pelo NATS."
        />
      )}

      {error && <ErrorDisplay message={error} onRetry={() => void loadPolicy()} />}

      <Card>
        <CardHeader
          title="Escopo"
          subtitle="O escopo mais específico que definir a política substitui a de cima por inteiro."
        />
        <div className="grid gap-4 p-4 md:grid-cols-3">
          <Select
            label="Nível"
            value={scope}
            onChange={(e) => setScope(e.target.value as ScopeKind)}
            options={[
              { value: "global", label: "Global (servidor)" },
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

      {!scopeReady ? (
        <Card>
          <p className="p-4 text-sm text-muted-foreground">
            Selecione {scope === "client" ? "um cliente" : "um site"} para continuar.
          </p>
        </Card>
      ) : (
        <>
          {scope !== "global" && (
            <Card>
              <CardHeader
                title="Herança"
                subtitle={
                  hasOwnPolicy
                    ? "Este nível JÁ define a política de WebRTC."
                    : "Este nível HERDA a política do nível acima."
                }
                action={
                  <Badge color={hasOwnPolicy ? "primary" : "slate"}>
                    {hasOwnPolicy ? "Define" : "Herda"}
                  </Badge>
                }
              />
              <div className="p-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={ownsPolicy}
                    onChange={(e) => setOwnsPolicy(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  <span>Definir política de WebRTC neste nível (desmarcado = herdar)</span>
                </label>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Ativação"
              subtitle="O WebRTC é aditivo: desligado, todo o tráfego continua pelo NATS."
              action={
                <Badge color={policy.enabled ? "success" : "slate"}>
                  {policy.enabled ? "Ligado" : "Desligado"}
                </Badge>
              }
            />
            <div className="space-y-4 p-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={policy.enabled}
                  onChange={(e) =>
                    setPolicy((current) => ({ ...current, enabled: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-border"
                />
                <span>Habilitar WebRTC</span>
              </label>

              <div>
                <p className="mb-2 text-sm font-medium text-muted-foreground">
                  Aplicar a quais sessões
                </p>
                <div className="flex flex-wrap gap-4">
                  {WEBRTC_KINDS.map((kind) => (
                    <label key={kind} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={policy.kinds.includes(kind)}
                        onChange={() => toggleKind(kind)}
                        className="h-4 w-4 rounded border-border"
                      />
                      <span>{WEBRTC_KIND_LABELS[kind]}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">
                  O terminal fica de fora de propósito: o gargalo dele é um único round-trip e o
                  volume é de poucos KB/s — o WebRTC adicionaria handshake ICE sem ganho perceptível.
                </p>
                {issueFor("kinds") && (
                  <p className="mt-1 text-xs text-danger">{issueFor("kinds")}</p>
                )}
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={policy.fallbackToNats}
                  onChange={(e) =>
                    setPolicy((current) => ({ ...current, fallbackToNats: e.target.checked }))
                  }
                  className="mt-0.5 h-4 w-4 rounded border-border"
                />
                <span>
                  Cair para NATS quando o ICE falhar
                  <span className="block text-xs text-muted">
                    Recomendado. Sem isto, uma falha de NAT encerra a sessão em vez de continuar
                    pelo caminho relayado.
                  </span>
                </span>
              </label>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Servidores STUN"
              subtitle="Descoberta de endereço público. Os defaults são servidores públicos gratuitos."
              action={
                <Button variant="ghost" size="sm" onClick={restoreDefaultStun}>
                  Restaurar padrão
                </Button>
              }
            />
            <div className="space-y-3 p-4">
              {policy.ice.stunUrls.map((url, index) => (
                <div key={`stun-${index}`} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input
                      label={index === 0 ? "Endereço STUN" : undefined}
                      value={url}
                      placeholder="stun:stun.l.google.com:19302"
                      onChange={(e) => updateUrl("stunUrls", index, e.target.value)}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeUrl("stunUrls", index)}
                    aria-label="Remover STUN"
                  >
                    <Icon name="delete" />
                  </Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => addUrl("stunUrls")}>
                <Icon name="add" /> Adicionar STUN
              </Button>
              {issueFor("stunUrls") && <p className="text-xs text-danger">{issueFor("stunUrls")}</p>}
              <p className="text-xs text-muted">
                Sem STUN restam apenas candidatos locais: funciona na mesma rede (LAN) e degrada
                fora dela. Não é erro — útil em rede fechada.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Servidores TURN"
              subtitle="Relay para redes com NAT restritivo. Exige infraestrutura própria (ex.: coturn)."
            />
            <div className="space-y-3 p-4">
              {policy.ice.turnUrls.map((url, index) => (
                <div key={`turn-${index}`} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input
                      label={index === 0 ? "Endereço TURN" : undefined}
                      value={url}
                      placeholder="turn:turn.exemplo.com:3478"
                      onChange={(e) => updateUrl("turnUrls", index, e.target.value)}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeUrl("turnUrls", index)}
                    aria-label="Remover TURN"
                  >
                    <Icon name="delete" />
                  </Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => addUrl("turnUrls")}>
                <Icon name="add" /> Adicionar TURN
              </Button>
              {issueFor("turnUrls") && <p className="text-xs text-danger">{issueFor("turnUrls")}</p>}

              {turnConfigured && (
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    label="Usuário do TURN"
                    value={policy.ice.turnUsername}
                    onChange={(e) => updateIce({ turnUsername: e.target.value })}
                  />
                  <Input
                    label="Credencial do TURN"
                    type="password"
                    value={policy.ice.turnCredential}
                    placeholder={
                      policy.ice.turnCredentialConfigured
                        ? "Credencial salva (deixe em branco para manter)"
                        : undefined
                    }
                    onChange={(e) => updateIce({ turnCredential: e.target.value })}
                    hint={
                      policy.ice.turnCredentialConfigured && !policy.ice.turnCredential
                        ? "Credencial já configurada no servidor. Deixe em branco para preservá-la ao salvar."
                        : "Armazenada de forma protegida e nunca devolvida em claro."
                    }
                  />
                </div>
              )}

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={policy.ice.relayOnly}
                  onChange={(e) => updateIce({ relayOnly: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-border"
                />
                <span>
                  Forçar relay (ignorar conexões diretas)
                  <span className="block text-xs text-muted">
                    Todo o tráfego passa pelo TURN. Exige ao menos um servidor TURN configurado.
                  </span>
                </span>
              </label>
              {issueFor("relayOnly") && (
                <p className="text-xs text-danger">{issueFor("relayOnly")}</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Avançado"
              subtitle="Tempos do ICE. Os defaults detectam falha rápido para cair no NATS."
            />
            <div className="grid gap-4 p-4 md:grid-cols-3">
              <Input
                label="Timeout de desconexão (s)"
                type="number"
                min={1}
                max={120}
                value={policy.ice.disconnectedTimeoutSeconds}
                onChange={(e) =>
                  updateIce({ disconnectedTimeoutSeconds: Number(e.target.value) })
                }
                error={issueFor("disconnectedTimeoutSeconds")}
              />
              <Input
                label="Timeout de falha (s)"
                type="number"
                min={1}
                max={120}
                value={policy.ice.failedTimeoutSeconds}
                onChange={(e) => updateIce({ failedTimeoutSeconds: Number(e.target.value) })}
                error={issueFor("failedTimeoutSeconds")}
                hint="Depois disto o fallback para NATS entra em ação."
              />
              <Input
                label="Keep-alive (s)"
                type="number"
                min={1}
                max={120}
                value={policy.ice.keepAliveIntervalSeconds}
                onChange={(e) => updateIce({ keepAliveIntervalSeconds: Number(e.target.value) })}
                error={issueFor("keepAliveIntervalSeconds")}
              />
            </div>
          </Card>

          <div className="flex items-center gap-3">
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
            {scope !== "global" && dirty && (
              <span className="text-xs text-muted">Há alterações não salvas.</span>
            )}
          </div>

          <Card>
            <CardHeader title="Histórico" subtitle="Alterações desta configuração." />
            <div className="p-4">
              {auditLoading ? (
                <Loading message="Carregando histórico..." />
              ) : auditEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma alteração registrada.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {auditEntries.map((entry, index) => (
                    <li key={index} className="flex flex-wrap gap-2 border-b border-border pb-2">
                      <span className="text-muted">{entry.changedAt}</span>
                      <span className="font-medium">{entry.fieldName}</span>
                      {entry.changedBy && <span className="text-muted">por {entry.changedBy}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/** Cópia profunda da política vazia (evita compartilhar o array de ice entre estados). */
function cloneEmpty(): RemoteAccessWebRtcPolicy {
  return { ...EMPTY_POLICY, kinds: [...EMPTY_POLICY.kinds], ice: { ...EMPTY_POLICY.ice } };
}
