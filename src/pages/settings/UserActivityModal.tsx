import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ApiError,
  type UserActivityCategory,
  type UserActivityItemDto,
  type UserDto,
  type UserSessionSummaryDto,
} from "@/api";
import {
  Badge,
  Button,
  ConfirmDialog,
  ErrorDisplay,
  Icon,
  Input,
  Loading,
  Modal,
} from "@/components/ui";
import {
  useIamUserActivity,
  useIamUserSecurityState,
  useIamUserSessions,
  useRevokeAllIamUserSessions,
  useRevokeIamUserSession,
} from "@/hooks";
import {
  formatDateBrazil,
  formatDateTime,
  formatRelative,
} from "@/utils/format";

type TabId = "activity" | "sessions" | "security";

const PERIOD_OPTIONS: Array<{ days: number | undefined; label: string }> = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
  { days: undefined, label: "Tudo" },
];

const CATEGORY_OPTIONS: Array<{
  id: UserActivityCategory;
  label: string;
}> = [
  { id: "all", label: "Tudo" },
  { id: "auth", label: "Autenticação" },
  { id: "identity", label: "Identidade" },
  { id: "remote", label: "Acesso Remoto" },
  { id: "tickets", label: "Chamados" },
  { id: "configuration", label: "Configurações" },
  { id: "automation", label: "Automação" },
  { id: "approvals", label: "Aprovações" },
  { id: "reports", label: "Relatórios" },
];

const CATEGORY_LABELS: Record<
  Exclude<UserActivityCategory, "all">,
  { label: string; color: "accent" | "success" | "warning" | "danger" | "slate" }
> = {
  auth: { label: "Autenticação", color: "accent" },
  identity: { label: "Identidade", color: "warning" },
  remote: { label: "Acesso Remoto", color: "accent" },
  tickets: { label: "Chamados", color: "success" },
  configuration: { label: "Configurações", color: "slate" },
  automation: { label: "Automação", color: "warning" },
  approvals: { label: "Aprovações", color: "success" },
  reports: { label: "Relatórios", color: "slate" },
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function isFutureDate(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) && ms > Date.now();
}

export function UserActivityModal({
  user,
  onClose,
}: {
  user: UserDto;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("activity");
  const [category, setCategory] = useState<UserActivityCategory>("all");
  const [days, setDays] = useState<number | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [allCategoryCounts, setAllCategoryCounts] = useState<
    Record<string, number>
  >({});
  const [totalAllCount, setTotalAllCount] = useState<number | undefined>(
    undefined,
  );
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    run: () => Promise<void>;
  } | null>(null);

  const activityQuery = useIamUserActivity(user.id, category, 100, days);

  useEffect(() => {
    setAllCategoryCounts({});
    setTotalAllCount(undefined);
  }, [user.id, days]);

  useEffect(() => {
    if (category === "all" && activityQuery.data) {
      setAllCategoryCounts(activityQuery.data.categoryCounts ?? {});
      setTotalAllCount(activityQuery.data.totalReturned);
    }
  }, [activityQuery.data, category]);
  const sessionsQuery = useIamUserSessions(user.id);
  const securityQuery = useIamUserSecurityState(user.id);
  const revokeSession = useRevokeIamUserSession(user.id);
  const revokeAllSessions = useRevokeAllIamUserSessions(user.id);

  const sessions = sessionsQuery.data ?? [];
  const activeSessionsCount = sessions.filter((s) => s.isActive).length;
  const securityState = securityQuery.data;
  const effectiveLastLogin =
    securityState?.lastLoginAt ?? user.lastLoginAt ?? null;
  const isLocked =
    isFutureDate(securityState?.lockoutUntil) ||
    isFutureDate(securityState?.mfaLockoutUntil);

  const activityItems = activityQuery.data?.items ?? [];
  const filteredActivity = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activityItems;
    return activityItems.filter((item) =>
      [
        item.title,
        item.summary,
        item.eventType,
        item.ipAddress,
        item.actorLogin,
        item.failureReason,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [activityItems, search]);

  const handleRevokeSession = (session: UserSessionSummaryDto) => {
    setPendingConfirm({
      title: "Encerrar sessão",
      message: `Encerrar a sessão criada em ${formatDateTime(session.createdAt)} (${session.ipAddress ?? "IP não registrado"})?`,
      confirmLabel: "Encerrar sessão",
      run: async () => {
        try {
          await revokeSession.mutateAsync(session.id);
          toast.success("Sessão encerrada com sucesso.");
        } catch (error) {
          toast.error(
            getErrorMessage(error, "Não foi possível encerrar a sessão."),
          );
        }
      },
    });
  };

  const handleRevokeAllSessions = () => {
    setPendingConfirm({
      title: "Encerrar todas as sessões",
      message: `Encerrar todas as ${activeSessionsCount} sessão(ões) ativa(s) de "${user.fullName}"?`,
      confirmLabel: "Encerrar todas",
      run: async () => {
        try {
          await revokeAllSessions.mutateAsync();
          toast.success("Todas as sessões foram encerradas.");
        } catch (error) {
          toast.error(
            getErrorMessage(error, "Não foi possível encerrar as sessões."),
          );
        }
      },
    });
  };

  const isMutating = revokeSession.isPending || revokeAllSessions.isPending;

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={`Atividade e Logs: ${user.fullName}`}
      maxWidth="max-w-4xl"
    >
      <div className="space-y-5">
        {/* Resumo superior */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-border bg-surface-light p-3">
            <p className="text-xs text-muted">Último acesso</p>
            <p
              className="mt-1 text-sm font-semibold text-foreground"
              title={
                effectiveLastLogin
                  ? formatDateTime(effectiveLastLogin)
                  : undefined
              }
            >
              {effectiveLastLogin
                ? formatRelative(effectiveLastLogin)
                : "Nunca acessou"}
            </p>
            {effectiveLastLogin && (
              <p className="mt-0.5 text-[11px] text-muted">
                {formatDateTime(effectiveLastLogin)}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-surface-light p-3">
            <p className="text-xs text-muted">Sessões ativas</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {sessionsQuery.isLoading ? "..." : activeSessionsCount}
            </p>
            <p className="mt-0.5 text-[11px] text-muted">
              {sessions.length} sessão(ões) recente(s)
            </p>
          </div>

          <div className="rounded-lg border border-border bg-surface-light p-3">
            <p className="text-xs text-muted">Estado de acesso</p>
            <div className="mt-1 flex items-center gap-2">
              {isLocked ? (
                <Badge color="danger">Bloqueado</Badge>
              ) : (
                <Badge color="success">Regular</Badge>
              )}
            </div>
            {securityState &&
              (securityState.failedLoginAttempts > 0 ||
                securityState.mfaFailedAttempts > 0) && (
                <p className="mt-1 text-[11px] text-muted">
                  Falhas: {securityState.failedLoginAttempts} senha ·{" "}
                  {securityState.mfaFailedAttempts} MFA
                </p>
              )}
          </div>

          <div className="rounded-lg border border-border bg-surface-light p-3">
            <p className="text-xs text-muted">Cadastro</p>
            <div className="mt-1 flex items-center gap-2">
              {user.isActive ? (
                <Badge color="accent">Ativo</Badge>
              ) : (
                <Badge color="slate">Inativo</Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {user.createdAt ? formatDateBrazil(user.createdAt) : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Abas */}
        <div className="flex flex-wrap gap-2 border-b border-border pb-2">
          <Button
            size="sm"
            variant={activeTab === "activity" ? "primary" : "ghost"}
            onClick={() => setActiveTab("activity")}
          >
            <Icon name="history" className="h-4 w-4" /> Atividade no sistema
          </Button>
          <Button
            size="sm"
            variant={activeTab === "sessions" ? "primary" : "ghost"}
            onClick={() => setActiveTab("sessions")}
          >
            <Icon name="devices" className="h-4 w-4" /> Sessões e acessos (
            {activeSessionsCount})
          </Button>
          <Button
            size="sm"
            variant={activeTab === "security" ? "primary" : "ghost"}
            onClick={() => setActiveTab("security")}
          >
            <Icon name="shield" className="h-4 w-4" /> Segurança da conta
          </Button>
        </div>

        {/* Aba Atividade */}
        {activeTab === "activity" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {CATEGORY_OPTIONS.map((opt) => {
                  const count =
                    opt.id === "all"
                      ? (totalAllCount ?? activityQuery.data?.totalReturned)
                      : (allCategoryCounts[opt.id] ??
                        activityQuery.data?.categoryCounts?.[opt.id]);
                  const selected = category === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setCategory(opt.id)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        selected
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-border bg-surface-light text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                      {typeof count === "number" && count > 0 ? ` (${count})` : ""}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-light p-0.5">
                {PERIOD_OPTIONS.map((opt) => {
                  const selected = days === opt.days;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setDays(opt.days)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        selected
                          ? "bg-accent text-white"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-[220px] flex-1">
                <Input
                  placeholder="Filtrar por evento, IP, ator ou detalhe..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Filtrar atividade do usuário"
                />
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void activityQuery.refetch()}
                loading={activityQuery.isFetching}
              >
                <Icon name="refresh" className="h-4 w-4" /> Atualizar
              </Button>
            </div>

            {activityQuery.isLoading && (
              <Loading message="Carregando histórico do usuário..." />
            )}

            {activityQuery.isError && (
              <ErrorDisplay
                message="Não foi possível carregar o histórico de atividades."
                onRetry={() => void activityQuery.refetch()}
              />
            )}

            {!activityQuery.isLoading && !activityQuery.isError && (
              <div className="space-y-2">
                {filteredActivity.map((item) => (
                  <ActivityRow
                    key={item.id}
                    item={item}
                    onNavigate={onClose}
                  />
                ))}
                {filteredActivity.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border-strong p-6 text-center text-sm text-muted">
                    Nenhum registro encontrado para os filtros selecionados.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Aba Sessões */}
        {activeTab === "sessions" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted">
                Sessões recentes registradas para {user.fullName}.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void sessionsQuery.refetch()}
                  loading={sessionsQuery.isFetching}
                >
                  <Icon name="refresh" className="h-4 w-4" /> Atualizar
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={activeSessionsCount === 0 || isMutating}
                  onClick={handleRevokeAllSessions}
                >
                  <Icon name="logout" className="h-4 w-4" /> Encerrar todas as
                  sessões
                </Button>
              </div>
            </div>

            {sessionsQuery.isLoading && (
              <Loading message="Carregando sessões..." />
            )}

            {sessionsQuery.isError && (
              <ErrorDisplay
                message="Não foi possível carregar as sessões do usuário."
                onRetry={() => void sessionsQuery.refetch()}
              />
            )}

            {!sessionsQuery.isLoading && !sessionsQuery.isError && (
              <div className="space-y-2">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-light px-4 py-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {session.isActive ? (
                          <Badge color="success">Ativa</Badge>
                        ) : session.isRevoked ? (
                          <Badge color="danger">Revogada</Badge>
                        ) : (
                          <Badge color="slate">Expirada</Badge>
                        )}
                        {session.mfaVerified && (
                          <Badge color="accent">MFA verificado</Badge>
                        )}
                        <span className="text-xs font-medium text-foreground">
                          IP: {session.ipAddress ?? "Não registrado"}
                        </span>
                      </div>
                      <p
                        className="truncate text-xs text-muted"
                        title={session.userAgent ?? undefined}
                      >
                        {session.userAgent ?? "User-Agent não registrado"}
                      </p>
                      <p className="text-[11px] text-muted">
                        Criada em: {formatDateTime(session.createdAt)} ·{" "}
                        {session.revokedAt
                          ? `Revogada em: ${formatDateTime(session.revokedAt)}`
                          : `Expira em: ${formatDateTime(session.expiresAt)}`}
                      </p>
                    </div>

                    {session.isActive && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isMutating}
                        onClick={() => handleRevokeSession(session)}
                      >
                        <Icon name="logout" className="h-4 w-4" /> Encerrar
                      </Button>
                    )}
                  </div>
                ))}

                {sessions.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border-strong p-6 text-center text-sm text-muted">
                    Nenhuma sessão registrada para este usuário.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Aba Segurança */}
        {activeTab === "security" && (
          <div className="space-y-3">
            {securityQuery.isLoading && (
              <Loading message="Carregando estado de segurança..." />
            )}

            {securityQuery.isError && (
              <ErrorDisplay
                message="Não foi possível carregar o estado de segurança."
                onRetry={() => void securityQuery.refetch()}
              />
            )}

            {securityState && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SecurityField
                  label="Conta ativa"
                  value={securityState.isActive ? "Sim" : "Não"}
                />
                <SecurityField
                  label="Último login"
                  value={
                    securityState.lastLoginAt
                      ? formatDateTime(securityState.lastLoginAt)
                      : "Nunca acessou"
                  }
                />
                <SecurityField
                  label="MFA obrigatório"
                  value={securityState.mfaRequired ? "Sim" : "Não"}
                />
                <SecurityField
                  label="MFA configurado"
                  value={securityState.mfaConfigured ? "Sim" : "Não"}
                />
                <SecurityField
                  label="Troca de senha pendente"
                  value={securityState.mustChangePassword ? "Sim" : "Não"}
                />
                <SecurityField
                  label="Atualização de perfil pendente"
                  value={securityState.mustChangeProfile ? "Sim" : "Não"}
                />
                <SecurityField
                  label="Tentativas falhas de senha"
                  value={String(securityState.failedLoginAttempts)}
                />
                <SecurityField
                  label="Bloqueio de senha até"
                  value={
                    securityState.lockoutUntil
                      ? formatDateTime(securityState.lockoutUntil)
                      : "Sem bloqueio"
                  }
                />
                <SecurityField
                  label="Tentativas falhas de MFA"
                  value={String(securityState.mfaFailedAttempts)}
                />
                <SecurityField
                  label="Bloqueio de MFA até"
                  value={
                    securityState.mfaLockoutUntil
                      ? formatDateTime(securityState.mfaLockoutUntil)
                      : "Sem bloqueio"
                  }
                />
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end border-t border-border pt-3">
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingConfirm)}
        title={pendingConfirm?.title ?? ""}
        message={pendingConfirm?.message ?? ""}
        confirmLabel={pendingConfirm?.confirmLabel ?? "Confirmar"}
        tone="danger"
        isLoading={isMutating}
        onConfirm={async () => {
          if (!pendingConfirm) return;
          await pendingConfirm.run();
          setPendingConfirm(null);
        }}
        onClose={() => setPendingConfirm(null)}
      />
    </Modal>
  );
}

function ActivityRow({
  item,
  onNavigate,
}: {
  item: UserActivityItemDto;
  onNavigate: () => void;
}) {
  const catMeta = CATEGORY_LABELS[item.category] ?? {
    label: item.category,
    color: "slate" as const,
  };

  return (
    <div className="rounded-lg border border-border bg-surface-light px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={catMeta.color}>{catMeta.label}</Badge>
            <Badge color={item.success ? "success" : "danger"}>
              {item.success ? "Sucesso" : "Falha"}
            </Badge>
            <span className="text-sm font-medium text-foreground">
              {item.title}
            </span>
          </div>

          {item.summary && (
            <p className="text-xs text-muted-foreground">{item.summary}</p>
          )}

          {item.failureReason && !item.summary?.includes(item.failureReason) && (
            <p className="text-xs text-danger">Motivo: {item.failureReason}</p>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
            {item.ipAddress && <span>IP: {item.ipAddress}</span>}
            {item.actorLogin && <span>Ator: {item.actorLogin}</span>}
            {item.userAgent && (
              <span className="max-w-xs truncate" title={item.userAgent}>
                {item.userAgent}
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p
            className="text-xs font-medium text-foreground"
            title={formatDateTime(item.occurredAt)}
          >
            {formatRelative(item.occurredAt)}
          </p>
          <p className="text-[11px] text-muted">
            {formatDateTime(item.occurredAt)}
          </p>
          {item.linkPath && (
            <Link
              to={item.linkPath}
              onClick={onNavigate}
              className="mt-1 inline-block text-xs font-medium text-accent hover:underline"
            >
              Abrir recurso
            </Link>
          )}
        </div>
      </div>

      {item.details && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
            Ver detalhes
          </summary>
          <pre className="mt-1.5 max-h-40 overflow-auto rounded border border-border bg-surface p-2 text-[11px] text-muted-foreground whitespace-pre-wrap break-all">
            {item.details}
          </pre>
        </details>
      )}
    </div>
  );
}

function SecurityField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-light px-3 py-2.5">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
