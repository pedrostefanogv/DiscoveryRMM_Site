import { useId } from "react";
import type { ReactNode } from "react";
import type { ConfigurationOrigin } from "@/api";
import type { RemoteConsentMode, RemoteConsentTimeoutAction } from "@/api/remote-consent";
import { Icon, Button, Input, TextArea } from "@/components/ui";
import {
  selectedIcon,
  selectedSurface,
  unselectedIcon,
  unselectedSurface,
} from "@/theme/statusStyles";
import {
  DEFAULT_REMOTE_CONSENT_BANNER_TEXT,
  DEFAULT_REMOTE_CONSENT_MESSAGE,
  REMOTE_CONSENT_BANNER_ELAPSED_SAMPLE_SECONDS,
  REMOTE_CONSENT_PLACEHOLDERS,
  REMOTE_CONSENT_TEXT_MAX_LENGTH,
  REMOTE_CONSENT_TIMEOUT_MAX_SECONDS,
  REMOTE_CONSENT_TIMEOUT_MIN_SECONDS,
  appendRemoteConsentPlaceholder,
  applyRemoteConsentBannerOperatorSuffix,
  clampRemoteConsentTimeout,
  describeConsentDefaultAction,
  describeRemoteConsentFlow,
  describeTimeoutAction,
  formatRemoteConsentCountdown,
  isRemoteConsentTimeoutValid,
  normalizeRemoteConsentMode,
  normalizeRemoteConsentTimeoutAction,
  remoteConsentTextCounter,
  resolveRemoteConsentBannerText,
  resolveRemoteConsentMessage,
  type RemoteConsentPreviewContext,
} from "./remoteConsentPreview";

/**
 * Seção "Autorização de Acesso Remoto" do console.
 *
 * Antes cada campo da política (modo, timeout, ação, banner, textos) era um
 * mini-card independente com o rótulo genérico "Valor local" e um par
 * Comparar/Salvar por campo — o resultado eram seis caixas iguais, altas e sem
 * hierarquia, em que não dava para entender o efeito combinado da política.
 *
 * A seção agora:
 * - explica a política em um resumo de uma linha e em blocos (modo, prompt, banner);
 * - usa cartões de opção para decisões (modo e ação no fim da contagem);
 * - mostra a prévia real do prompt e do banner que o usuário do computador acessado verá;
 * - salva todos os campos alterados de uma vez (um único PATCH).
 */

/** Chaves da API da política de consentimento (mesmas do catálogo de configuração). */
export const REMOTE_CONSENT_FIELD_KEYS = {
  mode: "remoteConsentMode",
  timeout: "remoteConsentTimeoutSeconds",
  action: "remoteConsentTimeoutAction",
  banner: "remoteConsentShowBanner",
  message: "remoteConsentMessage",
  bannerText: "remoteConsentBannerText",
} as const;

export type RemoteConsentFieldKey =
  (typeof REMOTE_CONSENT_FIELD_KEYS)[keyof typeof REMOTE_CONSENT_FIELD_KEYS];

const REMOTE_CONSENT_KEYS: RemoteConsentFieldKey[] = [
  REMOTE_CONSENT_FIELD_KEYS.mode,
  REMOTE_CONSENT_FIELD_KEYS.timeout,
  REMOTE_CONSENT_FIELD_KEYS.action,
  REMOTE_CONSENT_FIELD_KEYS.banner,
  REMOTE_CONSENT_FIELD_KEYS.message,
  REMOTE_CONSENT_FIELD_KEYS.bannerText,
];

export interface RemoteConsentFieldState {
  value: string;
  inherited: boolean;
  origin: ConfigurationOrigin;
  locked?: boolean;
  lockOwner?: string | null;
  dirty?: boolean;
}

/** Escopo da configuração, usado nos rótulos de origem ("definido no servidor"...). */
export type RemoteAccessConsentScope = "server" | "client" | "site";

export interface RemoteAccessConsentSectionProps {
  state: Partial<Record<string, RemoteConsentFieldState>>;
  previewContext?: RemoteConsentPreviewContext;
  /** Escopo editado. Servidor não tem herança; cliente/site têm. */
  scope?: RemoteAccessConsentScope;
  /** Mostra os controles de herança (checkbox "Herdar"/"Definir"). */
  showInheritance?: boolean;
  /** Mostra o botão de reset por campo (só existe em cliente/site). */
  showReset?: boolean;
  /** Esconde o rodapé de ações (quando a página já tem barra global de salvar). */
  hideActions?: boolean;
  saving?: boolean;
  resetLoading?: boolean;
  readOnly?: boolean;
  onChange: (fieldKey: string, value: string) => void;
  onToggleInherit: (fieldKey: string, inherit: boolean) => void;
  onResetField: (fieldKey: string) => void;
  onSave: () => void;
  onDiscard: () => void;
}

const ORIGIN_LABEL: Record<ConfigurationOrigin, string> = {
  Server: "servidor",
  Client: "cliente",
  Site: "site",
};

const SCOPE_CHIP_LABEL: Record<RemoteAccessConsentScope, string> = {
  server: "definido no servidor",
  client: "definido no cliente",
  site: "definido neste site",
};

const MODE_OPTIONS: {
  value: RemoteConsentMode;
  title: string;
  description: string;
}[] = [
  {
    value: "Off",
    title: "Desligado",
    description: "Conecta sem avisar. Use apenas onde não há expectativa de privacidade.",
  },
  {
    value: "NotifyOnly",
    title: "Apenas notificar",
    description: "Mostra um aviso no computador acessado e conecta na hora, sem esperar resposta.",
  },
  {
    value: "Prompt",
    title: "Solicitar autorização",
    description: "O usuário precisa autorizar. O operador fica aguardando a decisão.",
  },
];

const MODE_TITLE: Record<RemoteConsentMode, string> = {
  Off: "Desligado",
  NotifyOnly: "Apenas notificar",
  Prompt: "Solicitar autorização",
};

const ACTION_OPTIONS: {
  value: RemoteConsentTimeoutAction;
  title: string;
  description: string;
}[] = [
  {
    value: "Deny",
    title: "Negar a sessão",
    description: "Mais seguro: sem resposta, ninguém entra.",
  },
  {
    value: "Approve",
    title: "Aprovar a sessão",
    description: "Sem resposta, o acesso é liberado — evita travar manutenção.",
  },
];

const TIMEOUT_PRESETS = [15, 30, 60, 120];

function modeIcon(mode: RemoteConsentMode): ReactNode {
  if (mode === "Off") return <Icon name="gpp_bad" className="h-4 w-4" />;
  if (mode === "NotifyOnly") return <Icon name="notifications" className="h-4 w-4" />;
  return <Icon name="verified_user" className="h-4 w-4" />;
}

function fieldOrDefault(
  state: Partial<Record<string, RemoteConsentFieldState>>,
  key: string,
): RemoteConsentFieldState {
  return state[key] ?? { value: "", inherited: true, origin: "Server" };
}

function OriginChip({
  origin,
  inherited,
  scope,
}: {
  origin: ConfigurationOrigin;
  inherited: boolean;
  scope: RemoteAccessConsentScope;
}) {
  const className = inherited
    ? "border-border bg-surface-light text-muted"
    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";

  return (
    <span
      className={"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium " + className}
    >
      {inherited ? "herdado do " + ORIGIN_LABEL[origin] : SCOPE_CHIP_LABEL[scope]}
    </span>
  );
}

function Counter({ value, id }: { value: string; id?: string }) {
  const counter = remoteConsentTextCounter(value);
  const toneClass =
    counter.tone === "danger"
      ? "text-danger"
      : counter.tone === "warning"
        ? "text-amber-700 dark:text-amber-300"
        : "text-muted";

  return (
    <p id={id} className={"text-right text-[11px] " + toneClass}>
      {counter.length}/{counter.max} caracteres
    </p>
  );
}

function PlaceholderChips({
  onInsert,
  disabled,
}: {
  onInsert: (token: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-muted">Inserir:</span>
      {REMOTE_CONSENT_PLACEHOLDERS.map((placeholder) => (
        <button
          key={placeholder.token}
          type="button"
          disabled={disabled}
          title={"Vira o " + placeholder.label.toLowerCase() + " na hora de exibir"}
          onClick={() => onInsert(placeholder.token)}
          className="rounded-md border border-border bg-surface-light px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {placeholder.token}
        </button>
      ))}
    </div>
  );
}

interface FieldRowProps {
  label: string;
  description: string;
  state: RemoteConsentFieldState;
  scope: RemoteAccessConsentScope;
  disabled: boolean;
  inheritDisabled?: boolean;
  showInheritance: boolean;
  showReset: boolean;
  onToggleInherit: (next: boolean) => void;
  onOverride: () => void;
  onReset: () => void;
  resetLoading?: boolean;
  error?: string;
  children: ReactNode;
}

function FieldRow({
  label,
  description,
  state,
  scope,
  disabled,
  inheritDisabled,
  showInheritance,
  showReset,
  onToggleInherit,
  onOverride,
  onReset,
  resetLoading,
  error,
  children,
}: FieldRowProps) {
  return (
    <div className="grid gap-3 border-t border-border/60 py-4 first:border-t-0 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <OriginChip origin={state.origin} inherited={state.inherited} scope={scope} />
          {state.dirty && (
            <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
              não salvo
            </span>
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>

        {state.locked ? (
          <p className="mt-2 flex items-center gap-1 text-xs text-warning">
            <Icon name="lock" className="h-3 w-3" />
            Bloqueado{state.lockOwner ? " por " + state.lockOwner : ""} para este escopo.
          </p>
        ) : null}
      </div>

      <div className="min-w-0 space-y-1.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">{children}</div>
          <div className="flex shrink-0 items-center gap-1 pt-1">
            {!state.locked && showReset && (
              <button
                type="button"
                onClick={onReset}
                disabled={state.inherited || !!resetLoading}
                title="Restaurar o valor herdado neste campo"
                aria-label={"Restaurar " + label}
                className="rounded-md border border-transparent p-1 text-muted transition-colors hover:border-border hover:bg-surface-light hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Icon name="restart_alt" className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {error && <p className="text-[11px] text-danger">{error}</p>}

        {showInheritance && state.inherited && state.dirty && (
          <p className="text-[11px] text-muted">
            Ao salvar, este campo volta a herdar do {ORIGIN_LABEL[state.origin]} — o valor acima é o override
            que será descartado.
          </p>
        )}

        {showInheritance && !state.locked && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex items-center gap-1.5 text-[11px] text-muted">
              <input
                type="checkbox"
                checked={state.inherited}
                disabled={inheritDisabled}
                onChange={(event) => onToggleInherit(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-border-strong bg-surface-light"
              />
              Herdar do nível superior
            </label>
            {state.inherited && !disabled && (
              <button
                type="button"
                onClick={onOverride}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                Definir neste site
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={"mt-0.5 text-sm font-medium " + (tone ?? "text-foreground")}>{value}</p>
    </div>
  );
}

function ConsentPreview({
  mode,
  message,
  bannerText,
  showBanner,
  timeoutSeconds,
  timeoutAction,
  previewContext,
}: {
  mode: RemoteConsentMode;
  message: string;
  bannerText: string;
  showBanner: boolean;
  timeoutSeconds: number;
  timeoutAction: RemoteConsentTimeoutAction;
  previewContext?: RemoteConsentPreviewContext;
}) {
  const operator =
    (previewContext?.operator ?? "").trim() || REMOTE_CONSENT_PLACEHOLDERS[0].sample;
  const siteName =
    (previewContext?.site ?? "").trim() || REMOTE_CONSENT_PLACEHOLDERS[2].sample;
  const agentName =
    (previewContext?.agent ?? "").trim() || REMOTE_CONSENT_PLACEHOLDERS[3].sample;

  // O banner real do agent NÃO tem botão (a desconexão mora no ícone da bandeja)
  // e mostra o tempo DECORRIDO da sessão, não o timeout do prompt.
  const bannerPrimary = applyRemoteConsentBannerOperatorSuffix(bannerText, operator);
  const bannerElapsed = formatRemoteConsentCountdown(
    REMOTE_CONSENT_BANNER_ELAPSED_SAMPLE_SECONDS,
  );

  return (
    <div className="rounded-xl border border-dashed border-border bg-background/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Prévia no computador acessado
        </p>
        <p className="text-[11px] text-muted">{agentName} · {siteName}</p>
      </div>

      {mode === "Off" ? (
        <p className="mt-3 rounded-lg border border-border bg-surface-light px-3 py-2 text-xs text-muted">
          Modo desligado: nenhum aviso, prompt, banner ou ícone de sessão é exibido — a sessão abre direto.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {mode === "Prompt" ? (
            <div className="mx-auto w-full max-w-md rounded-xl border border-border bg-surface p-4 shadow-sm">
              <div className="flex items-start gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-300">
                  <Icon name="verified_user" className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">Autorização de acesso remoto</p>
                  <p className="text-[11px] text-muted">Discovery · {siteName}</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                  <Icon name="schedule" className="h-3 w-3" />
                  {formatRemoteConsentCountdown(timeoutSeconds)}
                </span>
              </div>

              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-hover">
                <span className="block h-full w-3/4 rounded-full bg-emerald-500" />
              </div>

              <p className="mt-3 whitespace-pre-line text-sm text-foreground">{message}</p>

              <div className="mt-3 rounded-lg bg-surface-light px-3 py-2 text-[11px] text-foreground/80">
                {describeConsentDefaultAction(timeoutAction)}
              </div>

              <div className="mt-3 flex justify-end gap-2">
                <span className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">
                  Permitir
                </span>
                <span className="rounded-lg border border-border bg-surface-light px-3 py-1.5 text-xs font-medium text-foreground">
                  Negar
                </span>
              </div>

              <p className="mt-2 text-right text-[10px] text-muted">
                Enter confirma a ação padrão · Esc recusa
              </p>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-md rounded-xl border border-border bg-surface p-3 shadow-sm">
              <div className="flex items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-300">
                  <Icon name="notifications" className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Sem prompt: a sessão conecta direto</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {showBanner
                      ? "O aviso ao usuário é o banner/ícone da bandeja abaixo — ele não precisa autorizar."
                      : "Sem banner ligado o agent não cria banner nem ícone de sessão: o usuário não vê aviso nenhum."}
                  </p>
                </div>
              </div>
              <p className="mt-2 rounded-lg bg-surface-light px-3 py-2 text-[11px] text-muted">
                O texto do prompt não é exibido em nenhum momento no modo <strong>Apenas notificar</strong>.
              </p>
            </div>
          )}

          {showBanner ? (
            <div className="rounded-xl bg-slate-900 px-3 py-2 shadow-sm">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-xs font-medium text-slate-100"
                  title={bannerPrimary}
                >
                  {bannerPrimary}
                </span>
              </div>
              <p className="mt-1 pl-5 text-[11px] text-slate-300">
                {bannerElapsed} · Para encerrar, clique no ícone do agente na bandeja do sistema
              </p>
            </div>
          ) : (
            <p className="rounded-lg border border-border bg-surface-light px-3 py-2 text-[11px] text-muted">
              {mode === "NotifyOnly"
                ? "Banner desativado e sem ícone de sessão: neste modo o usuário não recebe nenhum aviso."
                : "Banner desativado: o usuário não vê a faixa durante a sessão."}
            </p>
          )}

          {showBanner && mode === "Prompt" && (
            <p className="text-[11px] text-muted">
              No modo <strong>Solicitar autorização</strong> o banner só aparece depois que o usuário autoriza —
              o prompt vem antes dele.
            </p>
          )}

          <p className="text-[11px] text-muted">
            Amostra com operador fictício ({operator}); nomes reais vêm do cliente, site e agente na hora da sessão.
          </p>
        </div>
      )}
    </div>
  );
}

export function RemoteAccessConsentSection({
  state,
  previewContext,
  scope = "site",
  showInheritance = true,
  showReset = true,
  hideActions = false,
  saving,
  resetLoading,
  readOnly,
  onChange,
  onToggleInherit,
  onResetField,
  onSave,
  onDiscard,
}: RemoteAccessConsentSectionProps) {
  const ids = useId();

  const modeState = fieldOrDefault(state, REMOTE_CONSENT_FIELD_KEYS.mode);
  const timeoutState = fieldOrDefault(state, REMOTE_CONSENT_FIELD_KEYS.timeout);
  const actionState = fieldOrDefault(state, REMOTE_CONSENT_FIELD_KEYS.action);
  const bannerState = fieldOrDefault(state, REMOTE_CONSENT_FIELD_KEYS.banner);
  const messageState = fieldOrDefault(state, REMOTE_CONSENT_FIELD_KEYS.message);
  const bannerTextState = fieldOrDefault(state, REMOTE_CONSENT_FIELD_KEYS.bannerText);

  const mode = normalizeRemoteConsentMode(modeState.value);
  const timeoutSeconds = clampRemoteConsentTimeout(timeoutState.value);
  const timeoutValid = isRemoteConsentTimeoutValid(timeoutState.value);
  const timeoutAction = normalizeRemoteConsentTimeoutAction(actionState.value);
  const showBanner = bannerState.value === "true";

  const dirtyCount = REMOTE_CONSENT_KEYS.filter(
    (key) => !!fieldOrDefault(state, key).dirty,
  ).length;

  // Os campos continuam EDITÁVEIS mesmo quando o modo atual os ignora: o admin
  // pode deixar a política pronta para trocar de modo depois. Quem bloqueia o
  // controle é a herança, o lock ou um salvamento em andamento.
  const sectionDisabled = !!readOnly || !!saving;
  const promptHasNoEffect = mode !== "Prompt";
  const bannerHasNoEffect = mode === "Off";

  const resolvedMessage = resolveRemoteConsentMessage(
    messageState.value,
    previewContext,
  );
  const resolvedBannerText = resolveRemoteConsentBannerText(
    bannerTextState.value,
    previewContext,
  );

  const flow = describeRemoteConsentFlow({
    mode,
    timeoutSeconds,
    timeoutAction,
    showBanner,
  });

  const chooseMode = (next: RemoteConsentMode) => {
    if (modeState.inherited && !modeState.locked && !sectionDisabled) {
      onToggleInherit(REMOTE_CONSENT_FIELD_KEYS.mode, false);
    }
    onChange(REMOTE_CONSENT_FIELD_KEYS.mode, next);
  };

  const chooseAction = (next: RemoteConsentTimeoutAction) => {
    if (actionState.inherited && !actionState.locked && !sectionDisabled) {
      onToggleInherit(REMOTE_CONSENT_FIELD_KEYS.action, false);
    }
    onChange(REMOTE_CONSENT_FIELD_KEYS.action, next);
  };

  const toggleBanner = () => {
    if (bannerState.inherited && !bannerState.locked && !sectionDisabled) {
      onToggleInherit(REMOTE_CONSENT_FIELD_KEYS.banner, false);
    }
    onChange(REMOTE_CONSENT_FIELD_KEYS.banner, showBanner ? "false" : "true");
  };

  const overrideField = (key: RemoteConsentFieldKey) => {
    if (fieldOrDefault(state, key).locked || sectionDisabled) return;
    onToggleInherit(key, false);
  };

  const insertPlaceholder = (key: RemoteConsentFieldKey, token: string) => {
    onChange(key, appendRemoteConsentPlaceholder(fieldOrDefault(state, key).value, token));
  };

  const timeoutInputId = ids + "-timeout";
  const messageInputId = ids + "-message";
  const bannerTextInputId = ids + "-banner-text";

  return (
    <div className="space-y-4">
      {/* Resumo do efeito combinado da política */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
        <div className="bg-surface-light">
          <SummaryCell label="Modo" value={MODE_TITLE[mode]} />
        </div>
        <div className="bg-surface-light">
          <SummaryCell
            label="Tempo de resposta"
            value={mode === "Prompt" ? timeoutSeconds + "s" : "não se aplica"}
            tone={mode === "Prompt" ? undefined : "text-muted"}
          />
        </div>
        <div className="bg-surface-light">
          <SummaryCell
            label="Sem resposta"
            value={mode === "Prompt" ? describeTimeoutAction(timeoutAction) : "não se aplica"}
            tone={mode === "Prompt" ? undefined : "text-muted"}
          />
        </div>
        <div className="bg-surface-light">
          <SummaryCell
            label="Banner na sessão"
            value={mode === "Off" ? "não se aplica" : showBanner ? "ligado" : "desligado"}
            tone={mode === "Off" ? "text-muted" : undefined}
          />
        </div>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{flow}</p>

      {/* 1. Modo */}
      <div className="rounded-xl border border-border bg-surface-light/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">Como autorizar a sessão</p>
            <OriginChip origin={modeState.origin} inherited={modeState.inherited} scope={scope} />
            {modeState.dirty && (
              <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">não salvo</span>
            )}
          </div>
          {showInheritance && !modeState.locked && (
            <label className="inline-flex items-center gap-1.5 text-[11px] text-muted">
              <input
                type="checkbox"
                checked={modeState.inherited}
                disabled={sectionDisabled}
                onChange={(event) => onToggleInherit(REMOTE_CONSENT_FIELD_KEYS.mode, event.target.checked)}
                className="h-3.5 w-3.5 rounded border-border-strong bg-surface-light"
              />
              Herdar do nível superior
            </label>
          )}
        </div>

        <div role="radiogroup" aria-label="Modo de autorização" className="mt-3 grid gap-2 sm:grid-cols-3">
          {MODE_OPTIONS.map((option) => {
            const selected = mode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={sectionDisabled || modeState.locked}
                onClick={() => chooseMode(option.value)}
                className={
                  "group relative flex h-full flex-col gap-1.5 rounded-xl border p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 " +
                  (selected ? selectedSurface + " hover:border-sky-500/50" : unselectedSurface)
                }
              >
                <div className="flex items-center justify-between">
                  <span
                    className={
                      "flex h-7 w-7 items-center justify-center rounded-lg transition-colors " +
                      (selected ? selectedIcon : unselectedIcon)
                    }
                  >
                    {modeIcon(option.value)}
                  </span>
                  <span
                    className={
                      "flex h-4 w-4 items-center justify-center rounded-full border " +
                      (selected ? "border-sky-500 bg-sky-500 text-white" : "border-border-strong")
                    }
                  >
                    {selected ? <Icon name="check" className="h-3 w-3" /> : null}
                  </span>
                </div>
                <p className="text-sm font-medium text-foreground">{option.title}</p>
                <p className="text-[11px] leading-snug text-muted">{option.description}</p>
              </button>
            );
          })}
        </div>

        {modeState.locked && (
          <p className="mt-2 flex items-center gap-1 text-xs text-warning">
            <Icon name="lock" className="h-3 w-3" />
            Modo bloqueado{modeState.lockOwner ? " por " + modeState.lockOwner : ""} neste escopo.
          </p>
        )}
      </div>

      {/* Prompt x (banner + prévia): duas colunas em telas largas. */}
      <div className="grid gap-4 2xl:grid-cols-2">
        <div className="space-y-4">
      {/* 2. Prompt */}
      <div className="rounded-xl border border-border bg-surface-light/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-300">
              <Icon name="timer" className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">Prompt de consentimento</p>
              <p className="text-[11px] text-muted">
                Contagem, decisão automática e texto visto pelo usuário do computador.
              </p>
            </div>
          </div>
        </div>

        {promptHasNoEffect && (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-200">
            <Icon name="warning" className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              O tempo e a ação automática só valem no modo <strong>Solicitar autorização</strong>; a mensagem
              aparece apenas no prompt — no modo <strong>Apenas notificar</strong> o agent não exibe texto nenhum.
              Os valores ficam salvos mesmo sem efeito no modo atual.
            </span>
          </p>
        )}

        <div className="mt-1">
          <FieldRow
            label="Tempo para o usuário responder"
            description={
              "Contagem regressiva do prompt, de " +
              REMOTE_CONSENT_TIMEOUT_MIN_SECONDS +
              " a " +
              REMOTE_CONSENT_TIMEOUT_MAX_SECONDS +
              " segundos (padrão 60)."
            }
            state={timeoutState}
            scope={scope}
            showInheritance={showInheritance}
            showReset={showReset}
            disabled={sectionDisabled}
            inheritDisabled={sectionDisabled}
            onToggleInherit={(next) => onToggleInherit(REMOTE_CONSENT_FIELD_KEYS.timeout, next)}
            onOverride={() => overrideField(REMOTE_CONSENT_FIELD_KEYS.timeout)}
            onReset={() => onResetField(REMOTE_CONSENT_FIELD_KEYS.timeout)}
            resetLoading={resetLoading}
            error={!timeoutValid && !timeoutState.inherited ? "Use um número inteiro entre 10 e 600 segundos." : undefined}
          >
            <div className="flex items-center gap-2">
              <div className="w-24 shrink-0">
                <Input
                  id={timeoutInputId}
                  type="number"
                  inputMode="numeric"
                  min={REMOTE_CONSENT_TIMEOUT_MIN_SECONDS}
                  max={REMOTE_CONSENT_TIMEOUT_MAX_SECONDS}
                  step={1}
                  value={timeoutState.value}
                  disabled={sectionDisabled || timeoutState.inherited || !!timeoutState.locked}
                  aria-label="Segundos de contagem regressiva"
                  onChange={(event) => onChange(REMOTE_CONSENT_FIELD_KEYS.timeout, event.target.value)}
                />
              </div>
              <span className="text-xs text-muted">segundos</span>
              <div className="ml-auto flex flex-wrap gap-1">
                {TIMEOUT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={sectionDisabled || timeoutState.inherited || !!timeoutState.locked}
                    onClick={() => onChange(REMOTE_CONSENT_FIELD_KEYS.timeout, String(preset))}
                    className={
                      "rounded-md border px-1.5 py-0.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
                      (timeoutSeconds === preset
                        ? "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                        : "border-border bg-surface-light text-muted hover:border-border-strong hover:text-foreground")
                    }
                  >
                    {preset + "s"}
                  </button>
                ))}
              </div>
            </div>
          </FieldRow>

          <FieldRow
            label="Se o usuário não responder"
            description="O que o servidor faz quando a contagem termina sem decisão."
            state={actionState}
            scope={scope}
            showInheritance={showInheritance}
            showReset={showReset}
            disabled={sectionDisabled}
            inheritDisabled={sectionDisabled}
            onToggleInherit={(next) => onToggleInherit(REMOTE_CONSENT_FIELD_KEYS.action, next)}
            onOverride={() => overrideField(REMOTE_CONSENT_FIELD_KEYS.action)}
            onReset={() => onResetField(REMOTE_CONSENT_FIELD_KEYS.action)}
            resetLoading={resetLoading}
          >
            <div role="radiogroup" aria-label="Ação ao fim da contagem" className="grid gap-2 sm:grid-cols-2">
              {ACTION_OPTIONS.map((option) => {
                const selected = timeoutAction === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={sectionDisabled || !!actionState.locked}
                    onClick={() => chooseAction(option.value)}
                    className={
                      "flex items-start gap-2 rounded-xl border p-2.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 " +
                      (selected ? selectedSurface : unselectedSurface)
                    }
                  >
                    <span
                      className={
                        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md " +
                        (selected ? selectedIcon : unselectedIcon)
                      }
                    >
                      {option.value === "Approve" ? <Icon name="check" className="h-3.5 w-3.5" /> : <Icon name="block" className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-foreground">{option.title}</span>
                      <span className="block text-[11px] leading-snug text-muted">{option.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </FieldRow>

          <FieldRow
            label="Mensagem do prompt"
            description="Texto exibido na janela de consentimento. Vazio herda o texto do nível superior."
            state={messageState}
            scope={scope}
            showInheritance={showInheritance}
            showReset={showReset}
            disabled={sectionDisabled}
            inheritDisabled={sectionDisabled}
            onToggleInherit={(next) => onToggleInherit(REMOTE_CONSENT_FIELD_KEYS.message, next)}
            onOverride={() => overrideField(REMOTE_CONSENT_FIELD_KEYS.message)}
            onReset={() => onResetField(REMOTE_CONSENT_FIELD_KEYS.message)}
            resetLoading={resetLoading}
          >
            <div className="space-y-1.5">
              <TextArea
                id={messageInputId}
                rows={3}
                maxLength={REMOTE_CONSENT_TEXT_MAX_LENGTH}
                value={messageState.value}
                disabled={sectionDisabled || messageState.inherited || !!messageState.locked}
                aria-label="Mensagem exibida no prompt de consentimento"
                placeholder={DEFAULT_REMOTE_CONSENT_MESSAGE}
                onChange={(event) => onChange(REMOTE_CONSENT_FIELD_KEYS.message, event.target.value)}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <PlaceholderChips
                  disabled={sectionDisabled || messageState.inherited || !!messageState.locked}
                  onInsert={(token) => insertPlaceholder(REMOTE_CONSENT_FIELD_KEYS.message, token)}
                />
                <Counter value={messageState.value} />
              </div>
              <button
                type="button"
                disabled={sectionDisabled || messageState.inherited || !!messageState.locked}
                onClick={() => onChange(REMOTE_CONSENT_FIELD_KEYS.message, "")}
                className="text-[11px] text-muted hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                Limpar e herdar o texto do nível superior
              </button>
            </div>
          </FieldRow>
        </div>
      </div>

        </div>
        <div className="space-y-4">
      {/* 3. Banner */}
      <div className="rounded-xl border border-border bg-surface-light/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-300">
              <Icon name="desktop_windows" className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">Banner durante a sessão</p>
              <p className="text-[11px] text-muted">
                Faixa local no computador acessado (texto + operador + tempo de sessão). A desconexão fica no
                ícone da bandeja; o banner não aparece no stream remoto.
              </p>
            </div>
          </div>
        </div>

        {bannerHasNoEffect && (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-200">
            <Icon name="warning" className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              No modo <strong>Desligado</strong> o agent não exibe banner nem ícone de sessão. O ajuste fica
              salvo para quando o modo mudar.
            </span>
          </p>
        )}

        <FieldRow
          label="Exibir banner"
          description="Ligado, o usuário do computador acessado vê que a sessão está em andamento e pode encerrá-la pelo ícone da bandeja."
          state={bannerState}
          scope={scope}
          showInheritance={showInheritance}
          showReset={showReset}
          disabled={sectionDisabled}
          inheritDisabled={sectionDisabled}
          onToggleInherit={(next) => onToggleInherit(REMOTE_CONSENT_FIELD_KEYS.banner, next)}
          onOverride={() => overrideField(REMOTE_CONSENT_FIELD_KEYS.banner)}
          onReset={() => onResetField(REMOTE_CONSENT_FIELD_KEYS.banner)}
          resetLoading={resetLoading}
        >
          <button
            type="button"
            role="switch"
            aria-checked={showBanner}
            aria-label="Exibir banner durante a sessão remota"
            disabled={sectionDisabled || bannerState.inherited || !!bannerState.locked}
            onClick={toggleBanner}
            className={
              "inline-flex items-center gap-2 rounded-full border px-1 py-1 pr-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 " +
              (showBanner
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-border bg-surface-light text-muted")
            }
          >
            <span
              className={
                "relative h-5 w-9 rounded-full transition-colors " +
                (showBanner ? "bg-emerald-500" : "bg-surface-hover")
              }
            >
              <span
                className={
                  "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform " +
                  (showBanner ? "translate-x-4" : "translate-x-0")
                }
              />
            </span>
            {showBanner ? "Ativado" : "Desativado"}
          </button>
        </FieldRow>

        <FieldRow
          label="Texto do banner"
          description="Texto principal da faixa exibida durante a sessão. Vazio herda o texto do nível superior; se o texto não citar o operador, o agent acrescenta o nome no fim."
          state={bannerTextState}
          scope={scope}
          showInheritance={showInheritance}
          showReset={showReset}
          disabled={sectionDisabled}
          inheritDisabled={sectionDisabled}
          onToggleInherit={(next) => onToggleInherit(REMOTE_CONSENT_FIELD_KEYS.bannerText, next)}
          onOverride={() => overrideField(REMOTE_CONSENT_FIELD_KEYS.bannerText)}
          onReset={() => onResetField(REMOTE_CONSENT_FIELD_KEYS.bannerText)}
          resetLoading={resetLoading}
        >
          <div className="space-y-1.5">
            <Input
              id={bannerTextInputId}
              maxLength={REMOTE_CONSENT_TEXT_MAX_LENGTH}
              value={bannerTextState.value}
              disabled={sectionDisabled || bannerTextState.inherited || !!bannerTextState.locked}
              aria-label="Texto exibido no banner da sessão"
              placeholder={DEFAULT_REMOTE_CONSENT_BANNER_TEXT}
              onChange={(event) => onChange(REMOTE_CONSENT_FIELD_KEYS.bannerText, event.target.value)}
            />
            <PlaceholderChips
              disabled={sectionDisabled || bannerTextState.inherited || !!bannerTextState.locked}
              onInsert={(token) => insertPlaceholder(REMOTE_CONSENT_FIELD_KEYS.bannerText, token)}
            />
            <Counter value={bannerTextState.value} />
            {!showBanner && (
              <p className="text-[11px] text-muted">Banner desligado: este texto fica salvo, mas não é exibido.</p>
            )}
          </div>
        </FieldRow>
      </div>

      {/* 4. Prévia */}
      <ConsentPreview
        mode={mode}
        message={resolvedMessage}
        bannerText={resolvedBannerText}
        showBanner={mode !== "Off" && showBanner}
        timeoutSeconds={timeoutSeconds}
        timeoutAction={timeoutAction}
        previewContext={previewContext}
      />
        </div>
      </div>

      {/* 5. Ações */}
      {!hideActions && (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-light px-3 py-2">
        <p className="text-xs text-muted">
          {dirtyCount === 0
            ? "Nenhuma alteração pendente nesta seção."
            : dirtyCount === 1
              ? "1 alteração não salva."
              : dirtyCount + " alterações não salvas."}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={onDiscard}
            disabled={dirtyCount === 0 || !!saving}
          >
            <Icon name="undo" className="h-3.5 w-3.5" />
            Descartar
          </Button>
          <Button size="sm" onClick={onSave} loading={saving} disabled={dirtyCount === 0}>
            <Icon name="save" className="h-3.5 w-3.5" />
            Salvar alterações
          </Button>
        </div>
      </div>
      )}
    </div>
  );
}