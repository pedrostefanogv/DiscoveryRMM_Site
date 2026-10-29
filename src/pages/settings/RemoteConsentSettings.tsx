import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Icon, Button, Card, CardHeader, ErrorDisplay, Loading, Select,
PageHeader,
} from "@/components/ui";
import { useAllSites, useClients, useIamGroups, useIamUsers, useSites } from "@/hooks";
import {
  remoteConsentApi,
  type RemoteConsentEffective,
  type RemoteConsentMode,
  type RemoteConsentOverride,
  type RemoteConsentOverrideRequest,
  type RemoteConsentSubjectType,
  type RemoteConsentTimeoutAction,
} from "@/api/remote-consent";

interface FormState {
  id?: string;
  subjectType: RemoteConsentSubjectType;
  subjectId: string;
  clientId: string;
  siteId: string;
  mode: "" | RemoteConsentMode;
  timeoutSeconds: string;
  timeoutAction: "" | RemoteConsentTimeoutAction;
  showBanner: "" | "true" | "false";
  message: string;
  bannerText: string;
}

const EMPTY_FORM: FormState = {
  subjectType: "User",
  subjectId: "",
  clientId: "",
  siteId: "",
  mode: "",
  timeoutSeconds: "",
  timeoutAction: "",
  showBanner: "",
  message: "",
  bannerText: "",
};

const MODE_OPTIONS = [
  { value: "", label: "Herdar do nível superior" },
  { value: "Off", label: "Desligado (sem aviso)" },
  { value: "NotifyOnly", label: "Apenas notificar" },
  { value: "Prompt", label: "Solicitar autorização" },
];

const ACTION_OPTIONS = [
  { value: "", label: "Herdar do nível superior" },
  { value: "Deny", label: "Negar automaticamente" },
  { value: "Approve", label: "Aprovar automaticamente" },
];

const BANNER_OPTIONS = [
  { value: "", label: "Herdar do nível superior" },
  { value: "true", label: "Exibir banner" },
  { value: "false", label: "Não exibir banner" },
];

function toRequest(form: FormState): RemoteConsentOverrideRequest {
  return {
    subjectType: form.subjectType,
    subjectId: form.subjectId,
    clientId: form.clientId || null,
    siteId: form.siteId || null,
    mode: form.mode || null,
    timeoutSeconds: form.timeoutSeconds ? Number(form.timeoutSeconds) : null,
    timeoutAction: form.timeoutAction || null,
    showBanner: form.showBanner === "" ? null : form.showBanner === "true",
    message: form.message.trim() || null,
    bannerText: form.bannerText.trim() || null,
  };
}

export default function RemoteConsentSettings() {
  const usersQuery = useIamUsers();
  const groupsQuery = useIamGroups();
  const clientsQuery = useClients();
  const allSitesQuery = useAllSites();
  const [overrides, setOverrides] = useState<RemoteConsentOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const formSitesQuery = useSites(form?.clientId ?? "", false);
  const [saving, setSaving] = useState(false);

  const [agentId, setAgentId] = useState("");
  const [previewUserId, setPreviewUserId] = useState("");
  const [effective, setEffective] = useState<RemoteConsentEffective | null>(null);

  const subjectOptions = useMemo(() => {
    const source = form?.subjectType === "UserGroup" ? groupsQuery.data : usersQuery.data;
    return [
      { value: "", label: "Selecione" },
      ...((source ?? []).map((item) => ({
        value: item.id,
        label: "name" in item && item.name ? item.name : (item as { fullName?: string; login?: string }).fullName
          || (item as { login?: string }).login || item.id,
      })) ?? []),
    ];
  }, [form?.subjectType, groupsQuery.data, usersQuery.data]);

  const clientName = (clientId?: string | null) =>
    (clientsQuery.data ?? []).find((client) => client.id === clientId)?.name ?? "—";

  const siteName = (siteId?: string | null) =>
    (allSitesQuery.data ?? []).find((site) => site.id === siteId)?.name
    ?? (siteId ? siteId : "—");

  const scopeLabel = (item: RemoteConsentOverride) => {
    if (!item.clientId && !item.siteId) return "Global";
    if (item.siteId) return `Site: ${siteName(item.siteId)}`;
    return `Cliente: ${clientName(item.clientId)}`;
  };

  const subjectName = (item: RemoteConsentOverride) => {
    const source = item.subjectType === "UserGroup" ? groupsQuery.data : usersQuery.data;
    const found = (source ?? []).find((candidate) => candidate.id === item.subjectId);
    if (!found) return item.subjectId;
    return "name" in found && found.name
      ? found.name
      : (found as { fullName?: string }).fullName || (found as { login?: string }).login || found.id;
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setOverrides(await remoteConsentApi.listOverrides());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar overrides.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openCreate = () => setForm({ ...EMPTY_FORM });
  const openEdit = (item: RemoteConsentOverride) => setForm({
    id: item.id,
    subjectType: item.subjectType,
    subjectId: item.subjectId,
    clientId: item.clientId ?? "",
    siteId: item.siteId ?? "",
    mode: item.mode ?? "",
    timeoutSeconds: item.timeoutSeconds ? String(item.timeoutSeconds) : "",
    timeoutAction: item.timeoutAction ?? "",
    showBanner: item.showBanner === null || item.showBanner === undefined ? "" : item.showBanner ? "true" : "false",
    message: item.message ?? "",
    bannerText: item.bannerText ?? "",
  });

  const save = async () => {
    if (!form) return;
    if (!form.subjectId) { toast.error("Selecione o usuário/grupo."); return; }
    setSaving(true);
    try {
      const request = toRequest(form);
      if (form.id) await remoteConsentApi.updateOverride(form.id, request);
      else await remoteConsentApi.createOverride(request);
      toast.success("Override salvo.");
      setForm(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar override.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: RemoteConsentOverride) => {
    if (!window.confirm(`Remover o override de ${subjectName(item)}?`)) return;
    try {
      await remoteConsentApi.deleteOverride(item.id);
      toast.success("Override removido.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao remover.");
    }
  };

  const loadEffective = async () => {
    if (!agentId) { toast.error("Informe o agentId."); return; }
    try {
      setEffective(await remoteConsentApi.getEffective(agentId, previewUserId || undefined));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao resolver política.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Autorização de Acesso Remoto" description="Política efetiva: Servidor → Cliente → Site → Grupos → Usuário. Aplica-se somente a sessões de área de trabalho."   breadcrumb={<Link to="/settings" className="transition-colors hover:text-foreground">Configurações</Link>}
      />

      <Card>
        <CardHeader
          title="Overrides por usuário ou grupo"
          subtitle="Campos em branco herdam do nível superior. O override do usuário vence os grupos."
          action={<Button size="sm" onClick={openCreate}><Icon name="add" className="mr-1 h-4 w-4" />Novo override</Button>}
        />
        {error ? <ErrorDisplay message={error} /> : null}
        {loading ? <Loading /> : (
          <div className="divide-y divide-border">
            {overrides.length === 0 ? (
              <p className="py-4 text-sm text-muted">Nenhum override configurado — todos herdam a cascata.</p>
            ) : overrides.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {subjectName(item)} <span className="text-xs text-muted">({item.subjectType === "User" ? "Usuário" : "Grupo"} · {scopeLabel(item)})</span>
                  </p>
                  <p className="text-xs text-muted">
                    modo: {item.mode ?? "herda"} · timeout: {item.timeoutSeconds ?? "herda"}s · ação: {item.timeoutAction ?? "herda"} · banner: {item.showBanner === null || item.showBanner === undefined ? "herda" : item.showBanner ? "sim" : "não"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(item)}>Editar</Button>
                  <Button size="sm" variant="ghost" onClick={() => void remove(item)} aria-label="Remover exceção" title="Remover exceção"><Icon name="delete" className="h-4 w-4" aria-hidden="true" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Política efetiva (preview)"
          subtitle="Informe um agente e, opcionalmente, um usuário para ver a política e a origem de cada campo."
          action={<Button size="sm" variant="ghost" onClick={() => void loadEffective()}><Icon name="refresh" className="mr-1 h-4 w-4" />Resolver</Button>}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted">
            Agent ID
            <input className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm" value={agentId} onChange={(event) => setAgentId(event.target.value)} />
          </label>
          <label className="text-xs text-muted">
            Usuário (opcional)
            <Select value={previewUserId} onChange={(event) => setPreviewUserId(event.target.value)} options={[
              { value: "", label: "Sem usuário (cascata do tenant)" },
              ...((usersQuery.data ?? []).map((user) => ({ value: user.id, label: user.fullName || user.login || user.id }))),
            ]} />
          </label>
        </div>
        {effective ? (
          <div className="mt-4 space-y-2 text-sm">
            <p><strong>Modo:</strong> {effective.mode} · <strong>Timeout:</strong> {effective.timeoutSeconds}s · <strong>Ação:</strong> {effective.timeoutAction} · <strong>Banner:</strong> {effective.showBanner ? "sim" : "não"} · <strong>Origem:</strong> {effective.topSource}</p>
            <p className="text-muted">{effective.message}</p>
            <p className="text-xs text-muted">Banner: {effective.bannerText}</p>
            <div className="grid gap-1 sm:grid-cols-2">
              {Object.entries(effective.sources).map(([field, source]) => (
                <p key={field} className="text-xs text-muted">{field}: <strong>{source.source}</strong>{source.subjectName ? ` — ${source.subjectName}` : ""}</p>
              ))}
            </div>
          </div>
        ) : <p className="mt-3 text-xs text-muted">Nenhuma política resolvida ainda.</p>}
      </Card>

      {form ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <div className="w-full max-w-xl space-y-3 rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold">{form.id ? "Editar override" : "Novo override"}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-muted">Sujeito
                <Select value={form.subjectType} onChange={(event) => setForm({ ...form, subjectType: event.target.value as RemoteConsentSubjectType, subjectId: "" })} options={[
                  { value: "User", label: "Usuário" },
                  { value: "UserGroup", label: "Grupo de usuários" },
                ]} />
              </label>
              <label className="text-xs text-muted">Usuário/Grupo
                <Select value={form.subjectId} onChange={(event) => setForm({ ...form, subjectId: event.target.value })} options={subjectOptions} />
              </label>
              <label className="text-xs text-muted">Cliente (opcional)
                <Select
                  value={form.clientId}
                  onChange={(event) => setForm({ ...form, clientId: event.target.value, siteId: "" })}
                  options={[
                    { value: "", label: "Todos os clientes" },
                    ...((clientsQuery.data ?? []).map((client) => ({ value: client.id, label: client.name }))),
                  ]}
                />
              </label>
              <label className="text-xs text-muted">Site (opcional)
                <Select
                  value={form.siteId}
                  disabled={!form.clientId}
                  onChange={(event) => setForm({ ...form, siteId: event.target.value })}
                  options={[
                    { value: "", label: form.clientId ? "Todos os sites do cliente" : "Escolha um cliente primeiro" },
                    ...((formSitesQuery.data ?? []).map((site) => ({ value: site.id, label: site.name }))),
                  ]}
                />
              </label>
              <label className="text-xs text-muted">Modo
                <Select value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value as FormState["mode"] })} options={MODE_OPTIONS} />
              </label>
              <label className="text-xs text-muted">Ação no timeout
                <Select value={form.timeoutAction} onChange={(event) => setForm({ ...form, timeoutAction: event.target.value as FormState["timeoutAction"] })} options={ACTION_OPTIONS} />
              </label>
              <label className="text-xs text-muted">Timeout (s)
                <input type="number" min={10} max={600} className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm" value={form.timeoutSeconds} onChange={(event) => setForm({ ...form, timeoutSeconds: event.target.value })} />
              </label>
              <label className="text-xs text-muted">Banner
                <Select value={form.showBanner} onChange={(event) => setForm({ ...form, showBanner: event.target.value as FormState["showBanner"] })} options={BANNER_OPTIONS} />
              </label>
            </div>
            <label className="block text-xs text-muted">Mensagem
              <textarea className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm" rows={2} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} />
            </label>
            <label className="block text-xs text-muted">Texto do banner
              <input className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm" value={form.bannerText} onChange={(event) => setForm({ ...form, bannerText: event.target.value })} />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setForm(null)} disabled={saving}>Cancelar</Button>
              <Button size="sm" onClick={() => void save()} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
