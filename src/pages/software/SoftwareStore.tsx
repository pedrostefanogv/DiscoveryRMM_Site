import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Search,
  ShieldCheck,
  Trash2,
  Plus,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Package,
  RefreshCw,
  Wifi,
  WifiOff,
  X,
  LayoutGrid,
  LayoutList,
  Info,
  ExternalLink,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ErrorDisplay,
  Input,
  Loading,
  Modal,
  Select,
} from '@/components/ui';
import {
  useAppStoreCatalog,
  useAppStorePackage,
  useAppStoreApprovals,
  useAppStoreAudit,
  useCreateApproval,
  useDeleteApproval,
  useSyncCatalog,
} from '@/hooks/useAppStore';
import { useClients } from '@/hooks/useClients';
import { useSites } from '@/hooks/useSites';
import { useAgentsBySite } from '@/hooks/useAgents';
import {
  AppInstallationType,
  AppApprovalScopeType,
  AppApprovalActionType,
  AppApprovalAuditChangeType,
  type AppStoreCatalogPackage,
  type AppApprovalRule,
  type CreateAppApprovalRuleRequest,
  type SyncChocolateyCatalogResponse,
} from '@/api/types';

// ── PackageIcon ───────────────────────────────────────────────

function extractDomain(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  const value = raw.trim();
  try {
    return new URL(value).hostname;
  } catch {
    try {
      return new URL(`https://${value}`).hostname;
    } catch {
      return null;
    }
  }
}

function buildIconCandidates(
  url?: string | null,
  homepage?: string | null,
  downloadUrl?: string | null,
): string[] {
  const candidates: string[] = [];
  const domains = [extractDomain(downloadUrl), extractDomain(homepage)].filter(
    (v): v is string => Boolean(v),
  );
  const uniqueDomains = [...new Set(domains)];

  if (url?.trim()) {
    candidates.push(url.trim());
  }

  for (const domain of uniqueDomains) {
    candidates.push(
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
      `https://icons.duckduckgo.com/ip3/${domain}.ico`,
      `https://${domain}/favicon.ico`,
    );
  }

  if (homepage?.trim()) {
    const source = homepage.trim();
    candidates.push(
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(source)}&sz=128`,
      `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(source)}&sz=128`,
      `https://icons.duckduckgo.com/ip3/${encodeURIComponent(source)}.ico`,
    );

    try {
      const parsed = new URL(source);
      candidates.push(
        `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=128`,
        `https://icons.duckduckgo.com/ip3/${parsed.hostname}.ico`,
        `${parsed.protocol}//${parsed.hostname}/favicon.ico`,
      );
    } catch {
      // homepage pode vir em formato inesperado; ignora parse sem quebrar o render.
    }
  }

  return [...new Set(candidates)];
}

function PackageIcon({
  url,
  homepage,
  downloadUrl,
  name,
}: {
  url?: string | null;
  homepage?: string | null;
  downloadUrl?: string | null;
  name?: string | null;
}) {
  const sources = buildIconCandidates(url, homepage, downloadUrl);
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [url, homepage, downloadUrl]);

  const currentSource = sources[sourceIndex] ?? null;

  return (
    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
      {currentSource ? (
        <img
          src={currentSource}
          alt={name ?? 'app icon'}
          width={28}
          height={28}
          className="rounded object-contain"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            setSourceIndex((prev) => prev + 1);
          }}
          onLoad={(e) => {
            e.currentTarget.style.display = 'block';
          }}
        />
      ) : null}
      <Package
        className="h-5 w-5 text-slate-500"
        style={{ display: currentSource ? 'none' : undefined }}
      />
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────

const installationTypeOptions = [
  { value: String(AppInstallationType.Winget), label: 'Winget' },
  { value: String(AppInstallationType.Chocolatey), label: 'Chocolatey' },
  { value: String(AppInstallationType.Custom), label: 'Custom' },
];

const scopeTypeOptions = [
  { value: String(AppApprovalScopeType.Global), label: 'Global' },
  { value: String(AppApprovalScopeType.Client), label: 'Cliente' },
  { value: String(AppApprovalScopeType.Site), label: 'Site' },
  { value: String(AppApprovalScopeType.Agent), label: 'Agente' },
];

const actionOptions = [
  { value: String(AppApprovalActionType.Allow), label: 'Permitir' },
  { value: String(AppApprovalActionType.Deny), label: 'Negar' },
];

const changeTypeOptions = [
  { value: '', label: 'Todos' },
  { value: String(AppApprovalAuditChangeType.Created), label: 'Criado' },
  { value: String(AppApprovalAuditChangeType.Updated), label: 'Atualizado' },
  { value: String(AppApprovalAuditChangeType.Deleted), label: 'Removido' },
];

const limitOptions = [
  { value: '20', label: '20 por página' },
  { value: '50', label: '50 por página' },
  { value: '100', label: '100 por página' },
];

const APP_STORE_LAST_SYNC_STORAGE_KEY = 'discovery.appStore.lastSyncByType.v1';

function actionBadge(action: AppApprovalActionType) {
  return action === AppApprovalActionType.Allow ? (
    <Badge color="success">Permitido</Badge>
  ) : (
    <Badge color="danger">Negado</Badge>
  );
}

function scopeLabel(s: AppApprovalScopeType) {
  return ['Global', 'Cliente', 'Site', 'Agente'][s] ?? String(s);
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR');
}

function normalizeInstallationType(value: unknown): AppInstallationType {
  if (value === AppInstallationType.Winget || value === 0 || value === '0') {
    return AppInstallationType.Winget;
  }
  if (
    value === AppInstallationType.Chocolatey ||
    value === 1 ||
    value === '1'
  ) {
    return AppInstallationType.Chocolatey;
  }
  if (value === AppInstallationType.Custom || value === 2 || value === '2') {
    return AppInstallationType.Custom;
  }
  if (
    typeof value === 'string' &&
    value.trim().toLowerCase() === 'winget'
  ) {
    return AppInstallationType.Winget;
  }
  if (
    typeof value === 'string' &&
    ['chocolatey', 'choco'].includes(value.trim().toLowerCase())
  ) {
    return AppInstallationType.Chocolatey;
  }
  if (
    typeof value === 'string' &&
    value.trim().toLowerCase() === 'custom'
  ) {
    return AppInstallationType.Custom;
  }
  return AppInstallationType.Winget;
}

interface MarkdownDescriptionProps {
  content?: string | null;
  variant?: 'preview' | 'full';
  emptyText?: string;
}

function MarkdownDescription({
  content,
  variant = 'preview',
  emptyText,
}: MarkdownDescriptionProps) {
  const normalized = content?.trim() ?? '';

  if (!normalized) {
    return emptyText ? (
      <p className={variant === 'full' ? 'text-sm text-slate-300' : 'text-xs text-slate-500'}>
        {emptyText}
      </p>
    ) : null;
  }

  const baseClass =
    '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-semibold [&_strong]:text-slate-200 [&_em]:italic '
    + '[&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-black/30 [&_pre]:p-2 '
    + '[&_p]:m-0 [&_p+_p]:mt-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 '
    + '[&_h1]:m-0 [&_h1]:text-sm [&_h1]:font-semibold [&_h1]:text-slate-200 [&_h2]:m-0 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-slate-200 '
    + '[&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-slate-200 [&_hr]:my-2 [&_hr]:border-white/10 [&_img]:hidden';

  const variantClass =
    variant === 'full'
      ? 'text-sm leading-relaxed text-slate-300'
      : 'max-h-16 overflow-hidden text-xs leading-relaxed text-slate-400 [mask-image:linear-gradient(to_bottom,black_70%,transparent)]';

  return (
    <article className={`${baseClass} ${variantClass}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {normalized}
      </ReactMarkdown>
    </article>
  );
}

// ── AgentPicker ───────────────────────────────────────────────

interface AgentPickerProps {
  value: string;
  onChange: (agentId: string) => void;
  label?: string;
}

function AgentPicker({ value, onChange, label = 'Agente' }: AgentPickerProps) {
  const [clientId, setClientId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [search, setSearch] = useState('');

  const clients = useClients();
  const sites = useSites(clientId);
  const agentsQuery = useAgentsBySite(siteId);

  const filtered = (agentsQuery.data ?? []).filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.hostname.toLowerCase().includes(q) ||
      (a.displayName?.toLowerCase().includes(q) ?? false)
    );
  });

  const selectedAgent = (agentsQuery.data ?? []).find((a) => a.id === value);

  const clientOptions = [
    { value: '', label: 'Selecione o cliente...' },
    ...(clients.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];
  const siteOptions = [
    { value: '', label: clientId ? 'Selecione o site...' : 'Escolha um cliente primeiro' },
    ...(sites.data ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-slate-300">{label}</span>

      <div className="grid grid-cols-2 gap-2">
        <Select
          options={clientOptions}
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            setSiteId('');
            onChange('');
          }}
        />
        <Select
          options={siteOptions}
          value={siteId}
          disabled={!clientId}
          onChange={(e) => {
            setSiteId(e.target.value);
            onChange('');
          }}
        />
      </div>

      {siteId && (
        <div className="space-y-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-8 pr-3 text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
              placeholder="Buscar agente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {agentsQuery.isLoading && (
            <p className="py-2 text-center text-xs text-slate-500">Carregando agentes...</p>
          )}

          {!agentsQuery.isLoading && filtered.length === 0 && (
            <p className="py-2 text-center text-xs text-slate-500">Nenhum agente encontrado.</p>
          )}

          {filtered.length > 0 && (
            <div className="max-h-44 overflow-y-auto rounded-lg border border-white/10 bg-slate-950">
              {filtered.map((agent) => {
                const active = agent.id === value;
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => onChange(agent.id)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-white/5 ${
                      active ? 'bg-primary/10' : ''
                    }`}
                  >
                    {agent.isOnline ? (
                      <Wifi className="h-3.5 w-3.5 flex-shrink-0 text-success" />
                    ) : (
                      <WifiOff className="h-3.5 w-3.5 flex-shrink-0 text-slate-600" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-white">
                        {agent.displayName ?? agent.hostname}
                      </div>
                      <div className="truncate text-xs text-slate-500">{agent.hostname}</div>
                    </div>
                    {active && <span className="text-xs text-primary">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {value && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2">
          <Wifi className="h-3.5 w-3.5 flex-shrink-0 text-success" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">
              {selectedAgent ? (selectedAgent.displayName ?? selectedAgent.hostname) : value}
            </div>
            <div className="truncate font-mono text-xs text-slate-500">{value}</div>
          </div>
          <button
            type="button"
            onClick={() => { onChange(''); setSiteId(''); setClientId(''); }}
            className="rounded p-0.5 text-slate-400 transition-colors hover:text-white"
            aria-label="Limpar agente"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Approval Form Modal ───────────────────────────────────────

interface ApprovalFormModalProps {
  open: boolean;
  onClose: () => void;
  prefillPackageId?: string;
  prefillInstallationType?: AppInstallationType;
  lockPackageId?: boolean;
}

function ApprovalFormModal({
  open,
  onClose,
  prefillPackageId = '',
  prefillInstallationType = AppInstallationType.Winget,
  lockPackageId = false,
}: ApprovalFormModalProps) {
  const isPackageIdLocked = lockPackageId || Boolean(prefillPackageId.trim());
  const clients = useClients();
  const [scopeType, setScopeType] = useState(AppApprovalScopeType.Global);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [installationType, setInstallationType] = useState(prefillInstallationType);
  const [packageId, setPackageId] = useState(prefillPackageId);
  const [action, setAction] = useState(AppApprovalActionType.Allow);
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const sites = useSites(selectedClientId);
  const createApproval = useCreateApproval();

  const scopeId =
    scopeType === AppApprovalScopeType.Client
      ? selectedClientId || null
      : scopeType === AppApprovalScopeType.Site
        ? selectedSiteId || null
        : scopeType === AppApprovalScopeType.Agent
          ? selectedAgentId || null
          : null;

  const clientOptions = [
    { value: '', label: 'Selecione...' },
    ...(clients.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];

  const siteOptions = [
    { value: '', label: 'Selecione...' },
    ...(sites.data ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];

  useEffect(() => {
    if (!open) return;
    setPackageId(prefillPackageId);
    setInstallationType(prefillInstallationType);
  }, [open, prefillPackageId, prefillInstallationType]);

  async function handleSubmit() {
    if (!packageId.trim()) {
      setError('ID do pacote é obrigatório.');
      return;
    }
    if (scopeType !== AppApprovalScopeType.Global && !scopeId) {
      setError('Selecione ou informe o escopo.');
      return;
    }
    setError(null);
    const req: CreateAppApprovalRuleRequest = {
      scopeType,
      scopeId,
      installationType,
      packageId: packageId.trim().toLowerCase(),
      action,
      autoUpdateEnabled: autoUpdate,
      reason: reason.trim() || undefined,
    };
    try {
      await createApproval.mutateAsync(req);
      onClose();
      setPackageId('');
      setReason('');
      setAutoUpdate(false);
      setScopeType(AppApprovalScopeType.Global);
      setSelectedClientId('');
      setSelectedSiteId('');
      setSelectedAgentId('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar regra.');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova Regra de Aprovação" maxWidth="max-w-xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Tipo de instalação"
            options={installationTypeOptions}
            value={String(installationType)}
            onChange={(e) => setInstallationType(Number(e.target.value) as AppInstallationType)}
          />
          <Select
            label="Escopo"
            options={scopeTypeOptions}
            value={String(scopeType)}
            onChange={(e) => {
              setScopeType(Number(e.target.value) as AppApprovalScopeType);
              setSelectedClientId('');
              setSelectedSiteId('');
              setSelectedAgentId('');
            }}
          />
        </div>

        {scopeType === AppApprovalScopeType.Client && (
          <Select
            label="Cliente"
            options={clientOptions}
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
          />
        )}
        {scopeType === AppApprovalScopeType.Site && (
          <>
            <Select
              label="Cliente"
              options={clientOptions}
              value={selectedClientId}
              onChange={(e) => {
                setSelectedClientId(e.target.value);
                setSelectedSiteId('');
              }}
            />
            <Select
              label="Site"
              options={siteOptions}
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
            />
          </>
        )}
        {scopeType === AppApprovalScopeType.Agent && (
          <AgentPicker
            value={selectedAgentId}
            onChange={setSelectedAgentId}
            label="Agente"
          />
        )}

        <Input
          label="ID do Pacote"
          placeholder="ex: Microsoft.VSCode"
          value={packageId}
          readOnly={isPackageIdLocked}
          disabled={isPackageIdLocked}
          title={isPackageIdLocked ? 'ID definido pelo pacote selecionado no catálogo' : undefined}
          className={isPackageIdLocked ? 'cursor-not-allowed opacity-70' : ''}
          onChange={(e) => {
            if (isPackageIdLocked) return;
            setPackageId(e.target.value);
          }}
        />

        {isPackageIdLocked && (
          <p className="-mt-2 text-xs text-slate-500">
            Este ID foi preenchido a partir do pacote selecionado no catálogo.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Ação"
            options={actionOptions}
            value={String(action)}
            onChange={(e) => setAction(Number(e.target.value) as AppApprovalActionType)}
          />
          <div className="flex items-end pb-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-white/10 bg-white/5 accent-primary"
                checked={autoUpdate}
                onChange={(e) => setAutoUpdate(e.target.checked)}
              />
              Auto-atualização
            </label>
          </div>
        </div>

        <Input
          label="Motivo (opcional)"
          placeholder="Ex: Aprovado pela TI"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={createApproval.isPending}>
            Salvar Regra
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Approvals Tab ─────────────────────────────────────────────

function ApprovalsTab() {
  const [installationType, setInstallationType] = useState(AppInstallationType.Winget);
  const [scopeType, setScopeType] = useState(AppApprovalScopeType.Global);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [newRuleOpen, setNewRuleOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AppApprovalRule | null>(null);

  const clients = useClients();
  const sites = useSites(selectedClientId);
  const deleteApproval = useDeleteApproval();

  const scopeId =
    scopeType === AppApprovalScopeType.Client
      ? selectedClientId || null
      : scopeType === AppApprovalScopeType.Site
        ? selectedSiteId || null
        : scopeType === AppApprovalScopeType.Agent
          ? agentId || null
          : null;

  const query = useAppStoreApprovals({ scopeType, scopeId, installationType });

  const clientOptions = [
    { value: '', label: 'Selecione...' },
    ...(clients.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];
  const siteOptions = [
    { value: '', label: 'Selecione...' },
    ...(sites.data ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];

  async function handleDelete(rule: AppApprovalRule) {
    await deleteApproval.mutateAsync({ ruleId: rule.ruleId ?? rule.id ?? '' });
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-4">
      {/* Scope selector */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Select
              label="Tipo"
              options={installationTypeOptions}
              value={String(installationType)}
              onChange={(e) => setInstallationType(Number(e.target.value) as AppInstallationType)}
            />
          </div>
          <div className="w-40">
            <Select
              label="Escopo"
              options={scopeTypeOptions}
              value={String(scopeType)}
              onChange={(e) => {
                setScopeType(Number(e.target.value) as AppApprovalScopeType);
                setSelectedClientId('');
                setSelectedSiteId('');
                setAgentId('');
              }}
            />
          </div>
          {scopeType === AppApprovalScopeType.Client && (
            <div className="w-56">
              <Select
                label="Cliente"
                options={clientOptions}
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
              />
            </div>
          )}
          {scopeType === AppApprovalScopeType.Site && (
            <>
              <div className="w-48">
                <Select
                  label="Cliente"
                  options={clientOptions}
                  value={selectedClientId}
                  onChange={(e) => {
                    setSelectedClientId(e.target.value);
                    setSelectedSiteId('');
                  }}
                />
              </div>
              <div className="w-48">
                <Select
                  label="Site"
                  options={siteOptions}
                  value={selectedSiteId}
                  onChange={(e) => setSelectedSiteId(e.target.value)}
                />
              </div>
            </>
          )}
          {scopeType === AppApprovalScopeType.Agent && (
            <div className="flex-1 min-w-72">
              <AgentPicker value={agentId} onChange={setAgentId} />
            </div>
          )}
          <div className="ml-auto">
            <Button onClick={() => setNewRuleOpen(true)}>
              <Plus className="h-4 w-4" /> Nova Regra
            </Button>
          </div>
        </div>
      </Card>

      {/* Rules list */}
      <Card padding={false}>
        <div className="border-b border-white/5 px-5 py-4">
          <span className="text-sm font-medium text-white">
            {query.data
              ? `${query.data.count} regra(s) — escopo ${scopeLabel(scopeType)}`
              : 'Regras de aprovação'}
          </span>
        </div>

        {query.isLoading && <Loading />}
        {query.isError && (
          <ErrorDisplay message="Erro ao carregar regras." onRetry={() => query.refetch()} />
        )}

        {query.data && query.data.items.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-500">
            <ShieldCheck className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">Nenhuma regra encontrada para este escopo.</p>
          </div>
        )}

        {query.data && query.data.items.length > 0 && (
          <div className="divide-y divide-white/5">
            {query.data.items.map((rule) => (
              <div
                key={rule.ruleId ?? rule.id}
                className="flex items-center justify-between px-5 py-3 hover:bg-white/5 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white font-mono">
                      {rule.packageId}
                    </span>
                    {rule.packageName && (
                      <span className="text-xs text-slate-400">{rule.packageName}</span>
                    )}
                    {actionBadge(rule.action)}
                    {rule.autoUpdateEnabled && <Badge color="primary">Auto-update</Badge>}
                    <Badge color="slate">{scopeLabel(rule.scopeType)}</Badge>
                  </div>
                  {rule.reason && (
                    <p className="mt-0.5 text-xs text-slate-500">{rule.reason}</p>
                  )}
                  <p className="mt-0.5 text-xs text-slate-600">
                    Criado em {formatDate(rule.createdAt)}
                  </p>
                </div>
                <Button variant="danger" size="sm" onClick={() => setDeleteTarget(rule)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ApprovalFormModal
        open={newRuleOpen}
        onClose={() => setNewRuleOpen(false)}
        prefillInstallationType={installationType}
      />

      {/* Delete confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Remover Regra"
        maxWidth="max-w-sm"
      >
        {deleteTarget && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Tem certeza que deseja remover a regra de{' '}
              <strong className="text-white">{deleteTarget.packageId}</strong>?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={() => handleDelete(deleteTarget)}
                loading={deleteApproval.isPending}
              >
                Remover
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Audit Tab ─────────────────────────────────────────────────

function AuditTab() {
  const [installationType, setInstallationType] = useState(AppInstallationType.Winget);
  const [packageId, setPackageId] = useState('');
  const [changedBy, setChangedBy] = useState('');
  const [changedFrom, setChangedFrom] = useState('');
  const [changedTo, setChangedTo] = useState('');
  const [changeType, setChangeType] = useState('');
  const [limit, setLimit] = useState(50);
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [page, setPage] = useState(1);

  const [appliedFilters, setAppliedFilters] = useState({
    installationType,
    packageId: '',
    changedBy: '',
    changedFrom: '',
    changedTo: '',
    changeType: '',
    limit,
  });

  const cursor = cursors[page - 1];

  const query = useAppStoreAudit({
    installationType: appliedFilters.installationType,
    packageId: appliedFilters.packageId || undefined,
    changedBy: appliedFilters.changedBy || undefined,
    changedFrom: appliedFilters.changedFrom || undefined,
    changedTo: appliedFilters.changedTo || undefined,
    changeType:
      appliedFilters.changeType !== ''
        ? (Number(appliedFilters.changeType) as AppApprovalAuditChangeType)
        : undefined,
    limit: appliedFilters.limit,
    cursor,
  });

  function applyFilters() {
    setAppliedFilters({ installationType, packageId, changedBy, changedFrom, changedTo, changeType, limit });
    setPage(1);
    setCursors([undefined]);
  }

  function resetFilters() {
    setPackageId('');
    setChangedBy('');
    setChangedFrom('');
    setChangedTo('');
    setChangeType('');
    const updated = { installationType, packageId: '', changedBy: '', changedFrom: '', changedTo: '', changeType: '', limit };
    setAppliedFilters(updated);
    setPage(1);
    setCursors([undefined]);
  }

  function handleNext() {
    const nextCursor = query.data?.nextCursor ?? null;
    if (!nextCursor) return;
    setCursors((prev) => {
      const next = [...prev];
      next[page] = nextCursor;
      return next;
    });
    setPage((p) => p + 1);
  }

  const changeTypeLabel: Record<number, string> = {
    [AppApprovalAuditChangeType.Created]: 'Criado',
    [AppApprovalAuditChangeType.Updated]: 'Atualizado',
    [AppApprovalAuditChangeType.Deleted]: 'Removido',
  };

  const changeTypeBadgeColor: Record<number, 'success' | 'warning' | 'danger'> = {
    [AppApprovalAuditChangeType.Created]: 'success',
    [AppApprovalAuditChangeType.Updated]: 'warning',
    [AppApprovalAuditChangeType.Deleted]: 'danger',
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Select
              label="Tipo"
              options={installationTypeOptions}
              value={String(installationType)}
              onChange={(e) => setInstallationType(Number(e.target.value) as AppInstallationType)}
            />
          </div>
          <div className="flex-1 min-w-32">
            <Input
              label="ID do Pacote"
              placeholder="Microsoft.VSCode"
              value={packageId}
              onChange={(e) => setPackageId(e.target.value)}
            />
          </div>
          <div className="w-40">
            <Input
              label="Alterado por"
              placeholder="username"
              value={changedBy}
              onChange={(e) => setChangedBy(e.target.value)}
            />
          </div>
          <div className="w-44">
            <Input
              label="De"
              type="datetime-local"
              value={changedFrom}
              onChange={(e) => setChangedFrom(e.target.value)}
            />
          </div>
          <div className="w-44">
            <Input
              label="Até"
              type="datetime-local"
              value={changedTo}
              onChange={(e) => setChangedTo(e.target.value)}
            />
          </div>
          <div className="w-40">
            <Select
              label="Tipo de alteração"
              options={changeTypeOptions}
              value={changeType}
              onChange={(e) => setChangeType(e.target.value)}
            />
          </div>
          <div className="w-40">
            <Select
              label="Itens por página"
              options={limitOptions}
              value={String(limit)}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </div>
          <Button onClick={applyFilters}>
            <Search className="h-4 w-4" /> Filtrar
          </Button>
          <Button variant="ghost" onClick={resetFilters}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {/* Table */}
      <Card padding={false}>
        <div className="border-b border-white/5 px-5 py-4 flex items-center justify-between">
          <span className="text-sm font-medium text-white">
            {query.data ? `${query.data.returnedItems} evento(s)` : 'Histórico de auditoria'}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-slate-400">Pág. {page}</span>
            <Button variant="ghost" size="sm" onClick={handleNext} disabled={!query.data?.hasMore}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {query.isLoading && <Loading />}
        {query.isError && (
          <ErrorDisplay message="Erro ao carregar auditoria." onRetry={() => query.refetch()} />
        )}

        {query.data && query.data.items.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-500">
            <ClipboardList className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">Nenhum evento encontrado.</p>
          </div>
        )}

        {query.data && query.data.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-xs text-slate-400">
                  <th className="px-5 py-2 text-left font-medium">Data</th>
                  <th className="px-5 py-2 text-left font-medium">Pacote</th>
                  <th className="px-5 py-2 text-left font-medium">Alteração</th>
                  <th className="px-5 py-2 text-left font-medium">Ação</th>
                  <th className="px-5 py-2 text-left font-medium">Escopo</th>
                  <th className="px-5 py-2 text-left font-medium">Por</th>
                  <th className="px-5 py-2 text-left font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((entry) => (
                  <tr key={entry.auditId} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="whitespace-nowrap px-5 py-2 text-xs text-slate-400">
                      {formatDate(entry.changedAt)}
                    </td>
                    <td className="px-5 py-2">
                      <div className="font-mono text-xs text-slate-300">{entry.packageId}</div>
                    </td>
                    <td className="px-5 py-2">
                      <Badge color={changeTypeBadgeColor[entry.changeType]}>
                        {changeTypeLabel[entry.changeType] ?? String(entry.changeType)}
                      </Badge>
                    </td>
                    <td className="px-5 py-2">{actionBadge(entry.action)}</td>
                    <td className="px-5 py-2 text-xs text-slate-400">
                      {scopeLabel(entry.scopeType)}
                      {entry.scopeId && (
                        <div className="font-mono text-slate-600 truncate max-w-[6rem]" title={entry.scopeId}>
                          {entry.scopeId.slice(0, 8)}…
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-2 text-xs text-slate-400">
                      {entry.changedBy ?? '—'}
                    </td>
                    <td className="max-w-[12rem] px-5 py-2 text-xs text-slate-500 truncate">
                      {entry.reason ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

// ── Highlight ─────────────────────────────────────────────────

function Highlight({ text, query }: { text?: string | null; query: string }) {
  if (!text) return null;
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="rounded bg-amber-400/30 px-0.5 text-amber-200">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

interface PackageDetailsModalProps {
  open: boolean;
  onClose: () => void;
  pkg: AppStoreCatalogPackage | null;
  installationType: AppInstallationType;
}

function PackageDetailsModal({ open, onClose, pkg, installationType }: PackageDetailsModalProps) {
  const detailsQuery = useAppStorePackage(pkg?.packageId, installationType);
  const details = detailsQuery.data ?? pkg;
  const detailsDownloadUrl =
    details?.installerUrlsByArch
      ? Object.values(details.installerUrlsByArch).find((value) => Boolean(value)) ?? null
      : null;
  const installationLabel =
    normalizeInstallationType(details?.installationType) === AppInstallationType.Winget
      ? 'Winget'
      : normalizeInstallationType(details?.installationType) === AppInstallationType.Chocolatey
        ? 'Chocolatey'
        : 'Custom';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={details?.name ?? details?.packageId ?? 'Detalhes do pacote'}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        {detailsQuery.isLoading && !details && <Loading />}
        {detailsQuery.isError && (
          <ErrorDisplay
            message="Não foi possível carregar os detalhes completos do pacote."
            onRetry={() => detailsQuery.refetch()}
          />
        )}

        {details && (
          <>
            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <PackageIcon
                url={details.icon}
                homepage={details.homepage}
                downloadUrl={detailsDownloadUrl}
                name={details.name}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white">{details.name ?? details.packageId}</div>
                <div className="mt-1 font-mono text-xs text-slate-400">{details.packageId}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {details.version && <Badge color="slate">{details.version}</Badge>}
                  {details.architecture && <Badge color="accent">{details.architecture}</Badge>}
                  {details.category && <Badge color="primary">{details.category}</Badge>}
                  {details.license && <Badge color="warning">{details.license}</Badge>}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Publisher</div>
                <div className="mt-1 text-sm text-slate-200">{details.publisher ?? '—'}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Tipo</div>
                <div className="mt-1 text-sm text-slate-200">
                  {installationLabel}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Descrição</div>
              <div className="mt-1">
                <MarkdownDescription
                  content={details.description}
                  variant="full"
                   emptyText="Sem descrição."
                />
              </div>
            </div>

            {!!details.tags?.length && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Tags</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {details.tags.map((tag) => (
                    <Badge key={tag} color="slate">{tag}</Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              {details.homepage && (
                <a
                  href={details.homepage}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20"
                >
                  <ExternalLink className="h-4 w-4" /> Site do app
                </a>
              )}
              <Button variant="ghost" onClick={onClose}>Fechar</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ── Catalog Tab ───────────────────────────────────────────────

function CatalogTab() {
  const [installationType, setInstallationType] = useState(AppInstallationType.Winget);
  const [searchInput, setSearchInput] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [limit, setLimit] = useState(20);
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('list');
  const [approvalTarget, setApprovalTarget] = useState<AppStoreCatalogPackage | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<AppStoreCatalogPackage | null>(null);
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const [syncConfirmValue, setSyncConfirmValue] = useState('');
  const [syncConfirmTouched, setSyncConfirmTouched] = useState(false);
  const [lastSyncByType, setLastSyncByType] = useState<
    Partial<Record<AppInstallationType, SyncChocolateyCatalogResponse>>
  >(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(APP_STORE_LAST_SYNC_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Partial<Record<string, SyncChocolateyCatalogResponse>>;
      return {
        [AppInstallationType.Winget]: parsed[String(AppInstallationType.Winget)],
        [AppInstallationType.Chocolatey]: parsed[String(AppInstallationType.Chocolatey)],
      };
    } catch {
      return {};
    }
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncCatalog = useSyncCatalog();

  const cursor = cursors[page - 1];

  const query = useAppStoreCatalog({
    installationType,
    search: searchApplied || undefined,
    limit,
    cursor,
  });

  // Debounce: aplica busca 500ms após parar de digitar
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchApplied(searchInput);
      setPage(1);
      setCursors([undefined]);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  function handleSearchEnter() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchApplied(searchInput);
    setPage(1);
    setCursors([undefined]);
  }

  function handleNext() {
    const nextCursor = query.data?.nextCursor ?? null;
    if (!nextCursor) return;
    setCursors((prev) => {
      const next = [...prev];
      next[page] = nextCursor;
      return next;
    });
    setPage((p) => p + 1);
  }

  function handlePrev() {
    setPage((p) => Math.max(1, p - 1));
  }

  function resetFilters() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchInput('');
    setSearchApplied('');
    setPage(1);
    setCursors([undefined]);
  }

  const hasMore = query.data?.hasMore ?? false;
  const isChocolatey = installationType === AppInstallationType.Chocolatey;
  const isWinget = installationType === AppInstallationType.Winget;
  const isCatalogEmpty = (query.data?.totalPackagesInSource ?? 0) === 0;
  const syncLabel = isChocolatey ? 'Chocolatey' : 'Winget';
  const lastSyncInfo = lastSyncByType[installationType];
  const syncConfirmOk = syncConfirmValue.trim().toLowerCase() === 'yes';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        APP_STORE_LAST_SYNC_STORAGE_KEY,
        JSON.stringify(lastSyncByType),
      );
    } catch {
      // storage pode estar indisponível em alguns contextos.
    }
  }, [lastSyncByType]);

  async function handleSyncCatalog() {
    try {
      const syncResult = await syncCatalog.mutateAsync(installationType);
      setLastSyncByType((prev) => ({
        ...prev,
        [installationType]: syncResult,
      }));
      await query.refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao sincronizar catálogo.';
      toast.error(message);
    }
  }

  function handleSyncRequest() {
    if (isChocolatey) {
      setSyncConfirmOpen(true);
      setSyncConfirmValue('');
      setSyncConfirmTouched(false);
      return;
    }
    void handleSyncCatalog();
  }

  function handleSyncConfirm() {
    if (!syncConfirmOk) {
      setSyncConfirmTouched(true);
      return;
    }
    setSyncConfirmOpen(false);
    void handleSyncCatalog();
  }

  return (
    <div className="space-y-4">
      <Modal
        open={syncConfirmOpen}
        onClose={() => setSyncConfirmOpen(false)}
        title="Confirmar sincronização Chocolatey"
        maxWidth="max-w-xl"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
            <p>
              Esta operação consulta a API do Chocolatey. Continue apenas se você
              tem autorização para acessar e sincronizar dados do catálogo.
            </p>
            <p className="mt-2">
              Ao confirmar, voce declara que leu e concorda com os Termos de Uso:
              {' '}
              <a
                href="https://chocolatey.org/terms"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                https://chocolatey.org/terms
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
            <p>
              Se não for possível sincronizar todos os dados agora, ao repetir a
              sincronização o processo continua de onde parou.
            </p>
            <p className="mt-2">
              Para evitar incompatibilidades posteriores, confirme conscientemente
              antes de iniciar o processo.
            </p>
          </div>
          <Input
            label="Digite yes para confirmar"
            value={syncConfirmValue}
            onChange={(e) => setSyncConfirmValue(e.target.value)}
            placeholder="yes"
            autoFocus
            error={syncConfirmTouched && !syncConfirmOk ? 'Confirmação obrigatória.' : undefined}
          />
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setSyncConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSyncConfirm}
              disabled={!syncConfirmOk}
              loading={syncCatalog.isPending}
            >
              Confirmar e sincronizar
            </Button>
          </div>
        </div>
      </Modal>
      {/* Filters */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Select
              label="Tipo"
              options={installationTypeOptions}
              value={String(installationType)}
              onChange={(e) => {
                setInstallationType(Number(e.target.value) as AppInstallationType);
                resetFilters();
              }}
            />
          </div>
          <div className="flex-1 min-w-48">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Busca</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-8 text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
                  placeholder="Nome ou ID do pacote..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchEnter()}
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    aria-label="Limpar busca"
                    title="Limpar busca"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="w-40">
            <Select
              label="Itens por página"
              options={limitOptions}
              value={String(limit)}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                resetFilters();
              }}
            />
          </div>
          {/* Toggle card / lista */}
          <div className="flex items-end pb-0.5">
            <div className="flex overflow-hidden rounded-lg border border-white/10">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                title="Visualização em lista"
                className={`flex items-center px-3 py-2 transition-colors ${
                  viewMode === 'list' ? 'bg-primary/20 text-primary' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <LayoutList className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('card')}
                title="Visualização em cards"
                className={`flex items-center px-3 py-2 transition-colors ${
                  viewMode === 'card' ? 'bg-primary/20 text-primary' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>
          <Button variant="ghost" onClick={resetFilters} title="Limpar filtros">
            <RefreshCw className="h-4 w-4" />
          </Button>
          {(isChocolatey || isWinget) && (
            <Button
              variant="primary"
              onClick={handleSyncRequest}
              loading={syncCatalog.isPending}
              title={`Sincronizar catálogo ${syncLabel}`}
            >
              <RefreshCw className="h-4 w-4" /> Sincronizar Catálogo
            </Button>
          )}
        </div>
        {(isChocolatey || isWinget) && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-slate-500">
              A sincronização do catálogo {syncLabel} e idempotente e pode levar alguns minutos.
            </p>
            {lastSyncInfo && (
              <div
                className={`rounded-lg border px-3 py-2 text-xs ${
                  lastSyncInfo.success
                    ? 'border-success/30 bg-success/10 text-slate-300'
                    : 'border-danger/30 bg-danger/10 text-slate-200'
                }`}
              >
                <p>
                  Ultima sincronização: {formatDate(lastSyncInfo.syncedAt ?? null)}
                </p>
                <p>
                  Pacotes atualizados: {lastSyncInfo.packagesUpserted}
                  {lastSyncInfo.pagesProcessed !== undefined
                    ? ` - Paginas: ${lastSyncInfo.pagesProcessed}`
                    : ''}
                  {lastSyncInfo.duration ? ` - Duração: ${lastSyncInfo.duration}` : ''}
                </p>
                {!lastSyncInfo.success && lastSyncInfo.error && (
                  <p className="text-danger">Erro: {lastSyncInfo.error}</p>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Results */}
      <Card padding={false}>
        <div className="border-b border-white/5 px-5 py-3 flex items-center justify-between">
          <span className="text-sm font-medium text-white">
            {query.isFetching && !query.data
              ? 'Carregando...'
              : query.data
                ? query.data.items.length > 0
                  ? `${query.data.items.length} pacote(s) na página ${page}${searchApplied ? ` — "${searchApplied}"` : ''}`
                  : 'Nenhum pacote encontrado'
                : 'Catálogo'}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handlePrev} disabled={page <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[3rem] text-center text-xs text-slate-400">Pág. {page}</span>
            <Button variant="ghost" size="sm" onClick={handleNext} disabled={!hasMore || query.isFetching}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {query.isFetching && !query.data && <Loading />}
        {query.isError && (
          <ErrorDisplay message="Erro ao carregar catálogo." onRetry={() => query.refetch()} />
        )}

        {query.data && query.data.items.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-500">
            <Package className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">
              {(isChocolatey || isWinget) && isCatalogEmpty
                ? `Catálogo ${syncLabel} ainda não sincronizado.`
                : 'Nenhum pacote encontrado.'}
            </p>
            {(isChocolatey || isWinget) && isCatalogEmpty && (
              <Button
                className="mt-3"
                onClick={handleSyncRequest}
                loading={syncCatalog.isPending}
              >
                <RefreshCw className="h-4 w-4" /> Sincronizar catálogo agora
              </Button>
            )}
            {searchApplied && (
              <button type="button" onClick={resetFilters} className="mt-3 text-xs text-primary hover:underline">
                Limpar busca
              </button>
            )}
          </div>
        )}

        {/* ── Vista em lista ── */}
        {query.data && query.data.items.length > 0 && viewMode === 'list' && (
          <div className={`divide-y divide-white/5 transition-opacity ${query.isFetching ? 'opacity-60' : ''}`}>
            {query.data.items.map((pkg) => (
              
              <div
                key={pkg.packageId}
                className="flex items-center gap-4 px-5 py-3 hover:bg-white/5 transition-colors"
              >
                <PackageIcon
                  url={pkg.icon}
                  homepage={pkg.homepage}
                  downloadUrl={
                    pkg.installerUrlsByArch
                      ? Object.values(pkg.installerUrlsByArch).find((value) => Boolean(value)) ?? null
                      : null
                  }
                  name={pkg.name}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white">
                      <Highlight text={pkg.name ?? pkg.packageId} query={searchApplied} />
                    </span>
                    {pkg.version && <Badge color="slate">{pkg.version}</Badge>}
                    {pkg.architecture && <Badge color="accent">{pkg.architecture}</Badge>}
                    {pkg.category && <Badge color="primary">{pkg.category}</Badge>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-400">
                    <span className="font-mono">
                      <Highlight text={pkg.packageId} query={searchApplied} />
                    </span>
                    {pkg.publisher && (
                      <span><Highlight text={pkg.publisher} query={searchApplied} /></span>
                    )}
                    {pkg.license && <span className="text-slate-600">{pkg.license}</span>}
                  </div>
                  {pkg.description && (
                    <div className="mt-1">
                      <MarkdownDescription content={pkg.description} variant="preview" />
                    </div>
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setDetailsTarget(pkg)}>
                    <Info className="h-4 w-4" /> Detalhes
                  </Button>
                  <Button size="sm" onClick={() => setApprovalTarget(pkg)}>
                    <ShieldCheck className="h-4 w-4" /> Aprovar / Negar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Vista em cards ── */}
        {query.data && query.data.items.length > 0 && viewMode === 'card' && (
          <div className={`grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 transition-opacity ${query.isFetching ? 'opacity-60' : ''}`}>
            {query.data.items.map((pkg) => (
              <div
                key={pkg.packageId}
                className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/[0.08]"
              >
                <div className="flex items-start gap-3">
                  <PackageIcon
                    url={pkg.icon}
                    homepage={pkg.homepage}
                    downloadUrl={
                      pkg.installerUrlsByArch
                        ? Object.values(pkg.installerUrlsByArch).find((value) => Boolean(value)) ?? null
                        : null
                    }
                    name={pkg.name}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold leading-tight text-white">
                      <Highlight text={pkg.name ?? pkg.packageId} query={searchApplied} />
                    </div>
                    {pkg.publisher && (
                      <div className="mt-0.5 truncate text-xs text-slate-400">
                        <Highlight text={pkg.publisher} query={searchApplied} />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  {pkg.version && <Badge color="slate">{pkg.version}</Badge>}
                  {pkg.architecture && <Badge color="accent">{pkg.architecture}</Badge>}
                  {pkg.category && <Badge color="primary">{pkg.category}</Badge>}
                </div>

                <div className="truncate font-mono text-xs text-slate-500">
                  <Highlight text={pkg.packageId} query={searchApplied} />
                </div>

                {pkg.description && (
                  <MarkdownDescription content={pkg.description} variant="preview" />
                )}

                <div className="mt-auto">
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" className="flex-1 justify-center" onClick={() => setDetailsTarget(pkg)}>
                      <Info className="h-4 w-4" /> Detalhes
                    </Button>
                    <Button size="sm" className="flex-1 justify-center" onClick={() => setApprovalTarget(pkg)}>
                      <ShieldCheck className="h-4 w-4" /> Aprovar
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Paginação inferior */}
        {query.data && query.data.items.length > 0 && (
          <div className="flex items-center justify-between border-t border-white/5 px-5 py-3">
            <span className="text-xs text-slate-500">
              {hasMore ? 'Há mais resultados na próxima página' : 'Última página'}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={handlePrev} disabled={page <= 1}>
                <ChevronLeft className="h-4 w-4" /> Anterior
              </Button>
              <span className="px-2 text-xs text-slate-400">Pág. {page}</span>
              <Button variant="ghost" size="sm" onClick={handleNext} disabled={!hasMore || query.isFetching}>
                Próxima <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <ApprovalFormModal
        open={!!approvalTarget}
        onClose={() => setApprovalTarget(null)}
        prefillPackageId={approvalTarget?.packageId ?? ''}
        prefillInstallationType={installationType}
        lockPackageId
      />

      <PackageDetailsModal
        open={!!detailsTarget}
        onClose={() => setDetailsTarget(null)}
        pkg={detailsTarget}
        installationType={installationType}
      />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

type StoreTab = 'catalog' | 'approvals' | 'audit';

export default function SoftwareStore() {
  const [tab, setTab] = useState<StoreTab>('catalog');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Loja de Softwares</h1>
          <p className="mt-1 text-sm text-slate-400">
            Catálogo de apps com aprovação por escopo e trilha de auditoria.
          </p>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={tab === 'catalog' ? 'primary' : 'ghost'}
            onClick={() => setTab('catalog')}
          >
            <Package className="h-4 w-4" /> Catálogo
          </Button>
          <Button
            variant={tab === 'approvals' ? 'primary' : 'ghost'}
            onClick={() => setTab('approvals')}
          >
            <ShieldCheck className="h-4 w-4" /> Aprovações
          </Button>
          <Button
            variant={tab === 'audit' ? 'primary' : 'ghost'}
            onClick={() => setTab('audit')}
          >
            <ClipboardList className="h-4 w-4" /> Auditoria
          </Button>
        </div>
      </Card>

      {tab === 'catalog' && <CatalogTab />}
      {tab === 'approvals' && <ApprovalsTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}
