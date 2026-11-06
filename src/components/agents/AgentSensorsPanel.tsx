import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { formatDateTime } from "@/utils/format";
import { useNowTick } from "@/hooks/useNowTick";
import { useSensorEvents } from "@/hooks/useSensors";
import {
  Badge,
  Button,
  ConfirmDialog,
  ContextMenu,
  DataTable,
  EmptyState,
  Icon,
  Loading,
  Modal,
  type Column,
  type ContextMenuItem,
} from "@/components/ui";
import type {
  AgentSensorsPayload,
  SensorEvent,
  SensorItem,
  SensorUpsertRequest,
} from "@/api";
import SensorStatusBadge from "./SensorStatusBadge";
import SensorSparkline from "./SensorSparkline";
import SensorChartModal from "./SensorChartModal";
import SensorFormModal from "./SensorFormModal";
import {
  SENSOR_EVENT_KIND_LABELS,
  SENSOR_STATUS_META,
  describeSensorThresholds,
  describeSustainSamples,
  formatAgo,
  formatSensorChannelValue,
  formatSensorInterval,
  sensorOptionsFromJson,
  sensorScopeLabel,
  sensorSparklineValues,
  sensorStatusMeta,
  sensorTypeLabel,
} from "./sensorUtils";

interface AgentSensorsPanelProps {
  agentId: string;
  /** Permissão Sensors.View — sem ela o painel explica em vez de consultar. */
  canView: boolean;
  /** Permissão Sensors.Execute — executar agora e forçar sincronização. */
  canExecute: boolean;
  /** Permissão Sensors.Create — habilita "Novo sensor". */
  canCreate: boolean;
  /** Permissões Sensors.Edit/Delete — habilitam editar/excluir a definição. */
  canManage: boolean;
  payload: AgentSensorsPayload | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  onRefresh: () => void;
  isForcing: boolean;
  onForceSync: () => void;
  isRunning: boolean;
  /** Dispara a coleta (todos quando sensorIds vem vazio). */
  onRun: (sensorIds?: string[]) => Promise<void>;
  isSaving: boolean;
  onSaveSensor: (data: SensorUpsertRequest, sensorId?: string) => Promise<void>;
  onDeleteSensor: (sensorId: string) => Promise<void>;
  /** Zera estado/falhas de UM sensor (não apaga a definição). */
  onResetSensor: (sensorId: string) => Promise<void>;
  /** Zera o estado de TODOS os sensores do agente (o painel confirma antes). */
  onResetAllSensors: () => Promise<void>;
  isResetting: boolean;
  /** Cria as definições recomendadas (Disco/CPU/Memória/Uptime) no agente. */
  onAddRecommended: () => Promise<void>;
  isAddingRecommended: boolean;
  /** Progresso da criação em lote ("2 de 4"). */
  recommendedProgress: { done: number; total: number } | null;
  clientId: string | null;
  siteId: string | null;
}

/** Estado do menu "⋯" de uma linha (posição na viewport + sensor). */
interface RowMenuState {
  x: number;
  y: number;
  sensor: SensorItem;
}

function shortFingerprint(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  return raw.length > 12 ? `${raw.slice(0, 12)}…` : raw || "—";
}
/**
 * Linha rótulo/valor do modal de detalhes do sensor.
 *
 * O valor QUEBRA a linha (break-words) em vez de ser truncado: o modal mostra o
 * conteúdo completo — inclusive limiares e mensagens longas. O `title` antigo só
 * existia quando o valor era string (valores ReactNode ficavam sem alternativa),
 * então foi removido junto com o truncate.
 */
function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface-light px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 break-words text-sm text-foreground">{value}</p>
    </div>
  );
}

/**
 * Corpo do modal "Detalhes do sensor": estado, alvo/escopo, limiares, contadores,
 * canais atuais e o trecho da última saída.
 *
 * Vive no nível do módulo (e não dentro do painel) para o modal poder ser
 * renderizado como filho do `Modal` — que já cuida de portal, foco, Esc e
 * rolagem interna.
 */
function SensorDetailsBody({ sensor, nowMs }: { sensor: SensorItem; nowMs: number }) {
  const meta = sensorStatusMeta(sensor.status, sensor.isStale);
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{sensor.name}</p>
          <p className="mt-0.5 text-xs text-muted">
            {sensorTypeLabel(sensor.sensorType)}
            {sensor.target ? ` · ${sensor.target}` : ""}
          </p>
        </div>
        <Badge color={meta.color}>{meta.label}</Badge>
      </div>
      {sensor.description ? <p className="text-xs text-muted">{sensor.description}</p> : null}
      {sensor.message ? (
        <p className="rounded-lg border border-border bg-surface-light px-3 py-2 text-xs text-muted-foreground">
          {sensor.message}
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <DetailItem label="Alvo" value={sensor.target || sensor.targetKey || "—"} />
        <DetailItem label="Escopo" value={sensorScopeLabel(sensor.scopeType) + (sensor.isInherited ? " (herdado)" : "")} />
        <DetailItem
          label="Limiares"
          value={describeSensorThresholds(
            sensor.warningThreshold,
            sensor.criticalThreshold,
            sensor.thresholdUnit,
            sensor.comparison,
          )}
        />
        <DetailItem label="Intervalo" value={formatSensorInterval(sensor.intervalSeconds)} />
        <DetailItem label="Timeout" value={`${sensor.timeoutSeconds}s`} />
        <DetailItem label="Falhas antes de alertar" value={String(sensor.failsBeforeAlert)} />
        <DetailItem
          label="Amostras para agravar (histerese)"
          value={describeSustainSamples(sensorOptionsFromJson(sensor.optionsJson).sustainSamples)}
        />
        <DetailItem label="Última execução" value={formatAgo(sensor.lastRunAt, nowMs)} />
        <DetailItem label="Mudança de estado" value={formatAgo(sensor.lastStatusChangedAt, nowMs)} />
        <DetailItem label="Código de saída" value={sensor.exitCode === null ? "—" : String(sensor.exitCode)} />
        <DetailItem label="Duração" value={sensor.durationMs === null ? "—" : `${sensor.durationMs} ms`} />
        <DetailItem label="Execuções" value={`${sensor.totalRuns} (${sensor.totalFailures} falha(s))`} />
        <DetailItem label="Script" value={sensor.scriptName ?? "—"} />
      </div>
      {Object.keys(sensor.currentChannels).length > 0 ? (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Canais atuais</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {Object.entries(sensor.currentChannels).map(([key, value]) => {
              const channel = sensor.channels.find((item) => item.key === key);
              return (
                <Badge key={key} color="slate">
                  {channel?.label ?? key}:{" "}
                  {formatSensorChannelValue(key, value, channel?.unit ?? "Count")}
                </Badge>
              );
            })}
          </div>
        </div>
      ) : null}
      {sensor.outputExcerpt ? (
        <div className="min-w-0 rounded-lg border border-border bg-surface-light px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted">Saída (trecho)</p>
          <pre className="mt-0.5 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
            {sensor.outputExcerpt}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

interface SensorDetailsModalProps {
  sensor: SensorItem;
  nowMs: number;
  onClose: () => void;
  onOpenChart: () => void;
  onOpenHistory: () => void;
  onEdit: () => void;
  canManage: boolean;
}

/**
 * Modal "Detalhes do sensor" — aberto ao clicar na linha (ou no nome) do sensor.
 *
 * Substitui o antigo card de hover: o card era alto, ficava recortado na borda da
 * tabela e não dava para interagir (abrir gráfico/histórico) sem tirar o mouse da
 * linha. O modal mostra tudo, rola sozinho e concentra as ações do sensor.
 */
function SensorDetailsModal({
  sensor,
  nowMs,
  onClose,
  onOpenChart,
  onOpenHistory,
  onEdit,
  canManage,
}: SensorDetailsModalProps) {
  return (
    <Modal open onClose={onClose} title={`Detalhes — ${sensor.name}`} maxWidth="max-w-2xl">
      <div className="space-y-4">
        <SensorDetailsBody sensor={sensor} nowMs={nowMs} />
        {/* Sem botão "Fechar" aqui: o Modal já tem o X do cabeçalho e o Esc. */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          <Button size="sm" variant="secondary" onClick={onOpenHistory}>
            <Icon name="history" className="h-4 w-4" />
            Histórico
          </Button>
          <Button size="sm" variant="secondary" onClick={onOpenChart}>
            <Icon name="monitoring" className="h-4 w-4" />
            Ver gráfico
          </Button>
          <Button size="sm" variant="primary" onClick={onEdit} disabled={!canManage} title="Editar a definição deste sensor">
            <Icon name="edit" className="h-4 w-4" />
            Editar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Aba "Sensores": monitoramento por dispositivo — estado (OK/Atenção/Crítico/Sem
 * dados) + métricas numéricas que alimentam sparklines e gráficos.
 *
 * Presentational de propósito (mesmo padrão de AgentPoliciesPanel): consultas e
 * mutações vivem no AgentDetail; aqui só estado de UI (modais/menu).
 */
export default function AgentSensorsPanel({
  agentId,
  canView,
  canExecute,
  canCreate,
  canManage,
  payload,
  isLoading,
  isError,
  isFetching,
  onRetry,
  onRefresh,
  isForcing,
  onForceSync,
  isRunning,
  onRun,
  isSaving,
  onSaveSensor,
  onDeleteSensor,
  onResetSensor,
  onResetAllSensors,
  isResetting,
  onAddRecommended,
  isAddingRecommended,
  recommendedProgress,
  clientId,
  siteId,
}: AgentSensorsPanelProps) {
  const nowMs = useNowTick(15_000);
  const [rowMenu, setRowMenu] = useState<RowMenuState | null>(null);
  const [detailsSensor, setDetailsSensor] = useState<SensorItem | null>(null);
  const [chartSensor, setChartSensor] = useState<SensorItem | null>(null);
  const [historySensor, setHistorySensor] = useState<SensorItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingSensor, setEditingSensor] = useState<SensorItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SensorItem | null>(null);
  const [resetAllOpen, setResetAllOpen] = useState(false);

  const items = payload?.items ?? [];
  const counts = payload?.counts;
  const staleCount = counts?.stale ?? 0;
  const semDadosCount = (counts?.unknown ?? 0) + (counts?.pending ?? 0);

  const openCreate = () => {
    setEditingSensor(null);
    setFormOpen(true);
  };
  const openEdit = (sensor: SensorItem) => {
    setEditingSensor(sensor);
    setFormOpen(true);
  };
  const openDetails = (sensor: SensorItem) => setDetailsSensor(sensor);
  const closeDetails = () => setDetailsSensor(null);

  /** Abre o menu de ações posicionado no botão "⋯" da linha. */
  const openRowMenu = (event: ReactMouseEvent<HTMLButtonElement>, sensor: SensorItem) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setRowMenu({ x: rect.right - 220, y: rect.bottom + 4, sensor });
  };

  const columns: Column<SensorItem>[] = useMemo(
    () => [
      {
        key: "status",
        header: "Status",
        width: "13%",
        sortValue: (sensor) => sensorStatusMeta(sensor.status, sensor.isStale).label,
        render: (sensor) => (
          <SensorStatusBadge status={sensor.status} isStale={sensor.isStale} className="whitespace-nowrap" />
        ),
      },
      {
        key: "name",
        header: "Sensor",
        width: "24%",
        render: (sensor) => (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {/*
                Botão de verdade (não um <p> com onClick): o modal de detalhes é a
                ação principal da linha, então precisa de foco e Enter/Espaço por
                teclado. `stopPropagation` evita disparar o clique da linha duas
                vezes (o handler da linha abre o mesmo modal).
              */}
              <button
                type="button"
                title={sensor.name}
                onClick={(event) => {
                  event.stopPropagation();
                  openDetails(sensor);
                }}
                className="truncate text-left font-medium text-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {sensor.name}
              </button>
              {sensor.isInherited ? <Badge color="slate">herdado</Badge> : null}
            </div>
            <p className="truncate text-xs text-muted" title={sensor.target ?? sensor.targetKey}>
              {sensorTypeLabel(sensor.sensorType)}
              {sensor.target ? ` · ${sensor.target}` : sensor.targetKey ? ` · ${sensor.targetKey}` : ""}
            </p>
          </div>
        ),
      },
      {
        key: "value",
        header: "Valor atual",
        width: "20%",
        render: (sensor) => {
          const sparkline = sensorSparklineValues(sensor);
          const channel = sensor.channels.find((item) => item.key === sensor.primaryChannel);
          const unit = channel?.unit ?? sensor.thresholdUnit;
          return (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium tabular-nums text-foreground">
                  {formatSensorChannelValue(
                    sensor.primaryChannel ?? channel?.key,
                    sensor.primaryValue,
                    unit,
                  )}
                </p>
                {channel?.label ? (
                  <p className="truncate text-[11px] text-muted">{channel.label}</p>
                ) : null}
              </div>
              <SensorSparkline
                values={sparkline}
                status={sensor.status}
                isStale={sensor.isStale}
                title={`Tendência de ${sensor.name}`}
                className="shrink-0"
              />
            </div>
          );
        },
      },
      {
        key: "thresholds",
        header: "Limiares",
        width: "16%",
        render: (sensor) => {
          const label = describeSensorThresholds(
            sensor.warningThreshold,
            sensor.criticalThreshold,
            sensor.thresholdUnit,
            sensor.comparison,
          );
          return (
            <span className="block truncate text-xs text-muted-foreground" title={label}>
              {label}
            </span>
          );
        },
      },
      {
        key: "lastRun",
        header: "Última execução",
        width: "13%",
        sortValue: (sensor) => sensor.lastRunAt ?? "",
        render: (sensor) => (
          <div className="min-w-0">
            <p className="truncate text-foreground">{formatAgo(sensor.lastRunAt, nowMs)}</p>
            <p className="truncate text-[11px] text-muted" title={sensor.lastRunAt ?? undefined}>
              {sensor.lastRunAt ? formatDateTime(sensor.lastRunAt) : `a cada ${formatSensorInterval(sensor.intervalSeconds)}`}
            </p>
          </div>
        ),
      },
      {
        key: "failures",
        header: "Falhas",
        width: "9%",
        sortValue: (sensor) => sensor.consecutiveFailures,
        render: (sensor) => (
          <div className="min-w-0">
            <p className={sensor.consecutiveFailures > 0 ? "font-medium text-danger" : "text-foreground"}>
              {sensor.consecutiveFailures}/{sensor.failsBeforeAlert}
            </p>
            <p className="text-[11px] text-muted">{sensor.totalFailures} no total</p>
          </div>
        ),
      },
      {
        key: "actions",
        header: "Ações",
        width: "5%",
        sortable: false,
        className: "text-right",
        render: (sensor) => (
          <button
            type="button"
            aria-label={`Ações do sensor ${sensor.name}`}
            title="Ações"
            onClick={(event) => openRowMenu(event, sensor)}
            className="rounded-lg p-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
          >
            <Icon name="more_vert" className="h-4 w-4" />
          </button>
        ),
      },
    ],
    // nowMs entra porque a coluna "Última execução" é relativa ao relógio.
    [nowMs],
  );

  const rowMenuItems: ContextMenuItem[] = rowMenu
    ? [
        {
          key: "chart",
          label: "Ver gráfico",
          icon: <Icon name="monitoring" className="h-4 w-4" />,
          onClick: () => setChartSensor(rowMenu.sensor),
        },
        {
          key: "run",
          label: "Executar agora",
          icon: <Icon name="play_arrow" className="h-4 w-4" />,
          disabled: !canExecute,
          onClick: () => void onRun([rowMenu.sensor.sensorId]),
        },
        {
          key: "history",
          label: "Histórico",
          icon: <Icon name="history" className="h-4 w-4" />,
          onClick: () => setHistorySensor(rowMenu.sensor),
        },
        {
          key: "reset",
          label: "Reiniciar estado",
          icon: <Icon name="restart_alt" className="h-4 w-4" />,
          // Zera contadores/falhas do sensor no servidor; a coleta seguinte
          // repopula o estado. Não apaga a definição nem o histórico.
          disabled: !canExecute,
          onClick: () => void onResetSensor(rowMenu.sensor.sensorId),
        },
        {
          key: "edit",
          label: "Editar",
          icon: <Icon name="edit" className="h-4 w-4" />,
          separatorBefore: true,
          disabled: !canManage,
          onClick: () => openEdit(rowMenu.sensor),
        },
        {
          key: "delete",
          label: "Excluir",
          icon: <Icon name="delete" className="h-4 w-4" />,
          danger: true,
          disabled: !canManage,
          onClick: () => setDeleteTarget(rowMenu.sensor),
        },
      ]
    : [];

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground sm:text-xl">Sensores</h3>
          <p className="text-sm text-muted">
            {canView ? (
              <>
                {counts?.total ?? items.length} sensor(es) · fingerprint{" "}
                <span className="font-mono">{shortFingerprint(payload?.sensorFingerprint)}</span>
                {staleCount > 0 ? ` · ${staleCount} sem dados recentes` : ""}
              </>
            ) : (
              "Monitoramento por dispositivo deste agente"
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canView && payload ? (
            payload.upToDate ? (
              <Badge color="success">Agent atualizado</Badge>
            ) : (
              <Badge color="warning">
                {payload.lastSyncedSensorFingerprint ? "Agent desatualizado" : "Nunca recebeu"}
              </Badge>
            )
          ) : null}
          <Button
            size="sm"
            variant="primary"
            onClick={openCreate}
            disabled={!canCreate}
            title="Criar um novo sensor para este agente"
          >
            <Icon name="add" className="h-4 w-4" />
            Novo sensor
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void onRun()}
            loading={isRunning}
            disabled={!canExecute || items.length === 0}
            title="Pedir ao agent para coletar todos os sensores agora"
          >
            <Icon name="play_arrow" className="h-4 w-4" />
            Executar todos
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setResetAllOpen(true)}
            loading={isResetting}
            disabled={!canExecute || items.length === 0}
            title="Zerar contadores e falhas de todos os sensores deste agente"
          >
            <Icon name="restart_alt" className="h-4 w-4" />
            Reiniciar estados
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onForceSync}
            loading={isForcing}
            disabled={!canExecute || !payload}
            title="Pedir ao agent para sincronizar a policy de sensores agora"
          >
            <Icon name="bolt" className="h-4 w-4" />
            Forçar sincronização
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRefresh}
            loading={isFetching}
            title="Consultar novamente os sensores deste agente"
          >
            <Icon name="refresh" className="h-4 w-4" />
            Atualizar
          </Button>
        </div>
      </div>

      <p className="mb-3 flex items-start gap-2 rounded-lg border border-border bg-surface-light px-3 py-2 text-xs text-muted">
        <Icon name="sensors" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Sensores medem a saúde deste dispositivo em intervalos próprios: o agent coleta e o
          servidor avalia o estado (OK/Atenção/Crítico). Os canais numéricos alimentam as
          sparklines e o gráfico de histórico.
          {canView && payload ? (
            payload.upToDate ? (
              <>
                {" "}
                O agent já recebeu esta configuração
                {payload.lastSensorSyncAt ? ` (em ${formatDateTime(payload.lastSensorSyncAt)})` : ""}.
              </>
            ) : payload.lastSyncedSensorFingerprint ? (
              <>
                {" "}
                O agent ainda está com uma configuração anterior — aguarde o próximo check-in
                {canExecute ? " ou use “Forçar sincronização” para antecipar" : ""}.
              </>
            ) : (
              <> Este agent ainda não registrou o recebimento de nenhuma configuração de sensores.</>
            )
          ) : null}
        </span>
      </p>

      {canView && payload ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Badge color="success">OK {counts?.passing ?? 0}</Badge>
          <Badge color="warning">Atenção {counts?.warning ?? 0}</Badge>
          <Badge color="danger">Crítico {counts?.failing ?? 0}</Badge>
          <Badge color="slate">Sem dados {semDadosCount}</Badge>
          <Badge color="primary">Total {counts?.total ?? items.length}</Badge>
        </div>
      ) : null}

      {!canView ? (
        <EmptyState
          title="Sem permissão para ver os sensores"
          description="Sua conta não tem a permissão Sensors.View, necessária para consultar os sensores deste agente."
        />
      ) : isLoading ? (
        <Loading message="Carregando sensores..." />
      ) : isError ? (
        <EmptyState
          title="Não foi possível carregar os sensores"
          description="Tente atualizar os dados."
          action={{ label: "Tentar novamente", onClick: onRetry }}
        />
      ) : items.length === 0 ? (
        <div>
          <EmptyState
            icon="sensors"
            title="Nenhum sensor configurado"
            description="Sensores monitoram disco, CPU, memória, serviços, ping, HTTP e métricas de script. O conjunto recomendado cria disco, CPU, memória e uptime com os limiares padrão."
            // O CTA cria 4 definições (Sensors.Create): sem a permissão, só o
            // formulário manual fica acessível (e ele já fica desabilitado).
            action={
              canCreate
                ? {
                    label: isAddingRecommended
                      ? "Criando sensores…"
                      : "Adicionar sensores recomendados",
                    onClick: () => {
                      if (isAddingRecommended) return;
                      void onAddRecommended();
                    },
                  }
                : undefined
            }
          />
          {/* O CTA fica acima do rodapé do EmptyState (py-16): -mt aproxima o
              progresso/link alternativo do botão sem duplicar o componente. */}
          <div className="-mt-10 flex flex-col items-center gap-2">
            {isAddingRecommended ? (
              <p role="status" className="flex items-center gap-2 text-xs text-muted">
                <Icon name="progress_activity" className="h-3.5 w-3.5 animate-spin" />
                Criando sensores recomendados… {recommendedProgress?.done ?? 0} de{" "}
                {recommendedProgress?.total ?? 0}
              </p>
            ) : (
              <p className="text-xs text-muted">
                Prefere configurar manualmente?{" "}
                <button
                  type="button"
                  onClick={openCreate}
                  disabled={!canCreate}
                  className="font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
                >
                  Criar um sensor
                </button>
              </p>
            )}
          </div>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={items}
          keyExtractor={(sensor) => sensor.sensorId}
          // O card de detalhes é ALTO (canais, limiares, saída) e ficava
          // recortado na borda da tabela no hover — agora a linha abre um modal.
          onRowClick={openDetails}
          pageSize={15}
          emptyMessage="Nenhum sensor encontrado"
          maxHeight="min(560px, 52vh)"
          fixedLayout
        />
      )}

      {canView && items.length > 0 ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted">
          <Icon name="info" className="h-3.5 w-3.5" />
          Clique em um sensor para ver canais, limiares e a última mensagem da coleta.
        </p>
      ) : null}

      {/*
        Modal "Detalhes do sensor" (clique na linha ou no nome). As ações do
        rodapé FECHAM este modal e abrem o modal correspondente — dois modais
        abertos ao mesmo tempo empilhariam overlays e prenderiam o foco errado.
      */}
      {detailsSensor ? (
        <SensorDetailsModal
          sensor={detailsSensor}
          nowMs={nowMs}
          canManage={canManage}
          onClose={closeDetails}
          onOpenChart={() => {
            setChartSensor(detailsSensor);
            closeDetails();
          }}
          onOpenHistory={() => {
            setHistorySensor(detailsSensor);
            closeDetails();
          }}
          onEdit={() => {
            openEdit(detailsSensor);
            closeDetails();
          }}
        />
      ) : null}

      {rowMenu ? (
        <ContextMenu
          position={{ x: rowMenu.x, y: rowMenu.y }}
          items={rowMenuItems}
          onClose={() => setRowMenu(null)}
        />
      ) : null}

      {chartSensor ? (
        <SensorChartModal
          open
          agentId={agentId}
          sensor={chartSensor}
          onClose={() => setChartSensor(null)}
        />
      ) : null}

      {historySensor ? (
        <SensorHistoryModal
          agentId={agentId}
          sensor={historySensor}
          onClose={() => setHistorySensor(null)}
        />
      ) : null}

      {formOpen ? (
        <SensorFormModal
          open
          agentId={agentId}
          clientId={clientId}
          siteId={siteId}
          sensor={editingSensor}
          isSaving={isSaving}
          onSave={onSaveSensor}
          onClose={() => setFormOpen(false)}
        />
      ) : null}

      <ConfirmDialog
        open={resetAllOpen}
        title="Reiniciar estados dos sensores"
        message={
          <>
            Zerar contadores, falhas e severidade de <strong>todos os sensores</strong> deste
            agente? A configuração e o histórico são preservados; o estado volta ao normal na
            próxima coleta.
          </>
        }
        confirmLabel="Reiniciar"
        tone="primary"
        isLoading={isResetting}
        onConfirm={() => {
          setResetAllOpen(false);
          void onResetAllSensors();
        }}
        onClose={() => setResetAllOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Excluir sensor"
        message={
          deleteTarget ? (
            <>
              Excluir o sensor <strong>{deleteTarget.name}</strong>? O histórico e as amostras
              já coletados são preservados, mas a configuração não pode ser restaurada.
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Excluir"
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) void onDeleteSensor(target.sensorId);
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

/** Tamanho de página do histórico (o endpoint aceita cursor + limit). */
const SENSOR_HISTORY_PAGE_SIZE = 50;

/**
 * Modal "Histórico": eventos do sensor (mudança de estado, alerta, erro, reset).
 *
 * A API pagina por CURSOR (nextCursor) e não por offset: a lista é acumulada em
 * memória conforme o operador pede "Carregar mais", com dedupe por id (um
 * refetch da mesma página não duplica linha). Trocar de sensor zera cursor e
 * lista — o histórico de um sensor nunca se mistura com o de outro.
 */
function SensorHistoryModal({
  agentId,
  sensor,
  onClose,
}: {
  agentId: string;
  sensor: SensorItem;
  onClose: () => void;
}) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<SensorEvent[]>([]);

  useEffect(() => {
    setCursor(null);
    setLoaded([]);
  }, [sensor.sensorId]);

  const events = useSensorEvents(
    agentId,
    sensor.sensorId,
    cursor
      ? { limit: SENSOR_HISTORY_PAGE_SIZE, cursor }
      : { limit: SENSOR_HISTORY_PAGE_SIZE },
  );

  useEffect(() => {
    const page = events.data;
    if (!page) return;
    setLoaded((previous) => {
      // A primeira página SUBSTITUI a lista; as seguintes são acrescentadas.
      const base = cursor === null ? [] : previous;
      const seen = new Set(base.map((event) => event.id));
      return [...base, ...page.items.filter((event) => !seen.has(event.id))];
    });
  }, [events.data, cursor]);

  const nextCursor = events.data?.nextCursor ?? null;
  const isEmpty = !events.isLoading && !events.isError && loaded.length === 0;

  return (
    <Modal open onClose={onClose} title={`Histórico — ${sensor.name}`} maxWidth="max-w-2xl">
      {events.isLoading ? (
        <Loading message="Carregando histórico..." />
      ) : events.isError ? (
        <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          Não foi possível carregar o histórico do sensor.
        </div>
      ) : isEmpty ? (
        <p className="py-10 text-center text-sm text-muted">Nenhum evento registrado para este sensor.</p>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-2">
            {loaded.map((event) => (
              <SensorEventRow key={event.id} event={event} />
            ))}
          </ul>
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <p className="text-xs text-muted">{loaded.length} evento(s) carregado(s)</p>
            {nextCursor ? (
              <Button
                size="sm"
                variant="secondary"
                loading={events.isFetching}
                onClick={() => setCursor(nextCursor)}
              >
                <Icon name="expand_more" className="h-4 w-4" />
                Carregar mais
              </Button>
            ) : (
              <p className="text-xs text-muted">Fim do histórico</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function SensorEventRow({ event }: { event: SensorEvent }) {
  const meta = SENSOR_STATUS_META[event.status] ?? SENSOR_STATUS_META.Unknown;
  return (
    <li className="rounded-lg border border-border bg-surface-light px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dotClass}`} aria-hidden />
        <span className="font-medium text-foreground">
          {SENSOR_EVENT_KIND_LABELS[event.kind] ?? event.kind}
        </span>
        <Badge color={meta.color}>{meta.label}</Badge>
        {event.previousStatus ? (
          <span className="text-muted">
            (antes: {SENSOR_STATUS_META[event.previousStatus]?.label ?? event.previousStatus})
          </span>
        ) : null}
        <span className="ml-auto text-muted">{formatDateTime(event.occurredAt)}</span>
      </div>
      {event.message ? (
        <p className="mt-1 text-xs text-muted-foreground">{event.message}</p>
      ) : null}
    </li>
  );
}
