import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorDisplay,
  Icon,
  Input,
  Loading,
  PageHeader,
  Select,
  type Column,
} from "@/components/ui";
import SensorFormModal from "@/components/agents/SensorFormModal";
import {
  SENSOR_TYPE_OPTIONS,
  formatSensorInterval,
  sensorScopeLabel,
  sensorTypeLabel,
} from "@/components/agents/sensorUtils";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import {
  useDeleteSensor,
  useSensorDefinitions,
  useUpdateSensor,
} from "@/hooks/useSensors";
import { formatDateTime } from "@/utils/format";
import { AppApprovalScopeType } from "@/api/types";
import { describeSensorsError } from "@/api/sensors";
import type {
  SensorDefinition,
  SensorItem,
  SensorListParams,
  SensorType,
  SensorUpsertRequest,
} from "@/api";

/** Atraso da busca: tecla a tecla dispararia uma consulta por caractere. */
const SEARCH_DEBOUNCE_MS = 300;

/** Opções do filtro de status (o contrato usa isActive, não um estado textual). */
const STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
];

/**
 * GUID curto para quando a API NÃO resolveu o nome do escopo (registro
 * removido, permissão insuficiente ou resposta antiga sem os campos de nome).
 * Mostrar o GUID inteiro em tabela é ilegível; 8 caracteres já identificam.
 */
function shortId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length <= 12 ? trimmed : trimmed.slice(0, 8);
}

/**
 * Escopo resolvido de uma definição: cliente/site/agente com NOME do DTO e
 * fallback para o GUID curto. `null` = escopo não usa aquele nível.
 */
interface SensorScopeResolved {
  client: string | null;
  site: string | null;
  agent: string | null;
}

function resolveSensorScope(definition: SensorDefinition): SensorScopeResolved {
  const showClient =
    Boolean(definition.clientId) || Boolean(definition.clientName) ||
    definition.scopeType === AppApprovalScopeType.Client ||
    definition.scopeType === AppApprovalScopeType.Site ||
    definition.scopeType === AppApprovalScopeType.Agent;
  const showSite =
    Boolean(definition.siteId) || Boolean(definition.siteName) ||
    definition.scopeType === AppApprovalScopeType.Site ||
    definition.scopeType === AppApprovalScopeType.Agent;
  return {
    client: showClient ? definition.clientName ?? shortId(definition.clientId) : null,
    site: showSite ? definition.siteName ?? shortId(definition.siteId) : null,
    agent: definition.agentName ?? shortId(definition.agentId),
  };
}

/**
 * Adapta a DEFINIÇÃO ao formato de item que o SensorFormModal recebe.
 *
 * O modal é compartilhado com a aba do agente (que trabalha com SensorItem) e
 * NÃO pode ser alterado por esta frente. Em modo edição ele hidrata a partir da
 * definição completa que ele mesmo busca em /api/v1/sensors; o item passado aqui
 * é só o fallback/identificador — por isso os campos de ESTADO vêm neutros.
 */
function sensorItemFromDefinition(definition: SensorDefinition): SensorItem {
  return {
    sensorId: definition.id,
    key: definition.key,
    name: definition.name,
    description: definition.description,
    sensorType: definition.sensorType,
    target: definition.target,
    targetKey: "",
    scopeType: definition.scopeType,
    isInherited: definition.isInherited,
    sourceScope: definition.sourceScope,
    warningThreshold: definition.warningThreshold,
    criticalThreshold: definition.criticalThreshold,
    thresholdUnit: definition.thresholdUnit,
    comparison: definition.comparison,
    channels: definition.channels,
    currentChannels: {},
    primaryChannel: null,
    primaryValue: null,
    sparkline: {},
    status: "Unknown",
    severity: null,
    message: null,
    isStale: false,
    exitCode: null,
    durationMs: null,
    outputExcerpt: null,
    consecutiveFailures: 0,
    totalRuns: 0,
    totalFailures: 0,
    lastRunAt: null,
    lastStatusChangedAt: null,
    lastAlertedAt: null,
    intervalSeconds: definition.intervalSeconds,
    timeoutSeconds: definition.timeoutSeconds,
    failsBeforeAlert: definition.failsBeforeAlert,
    // Vínculo com o auto-ticket: propagado da definição (não é estado).
    autoTicketPolicy: definition.autoTicketPolicy,
    autoTicketMinDurationSeconds: definition.autoTicketMinDurationSeconds,
    autoTicketImpact: definition.autoTicketImpact,
    minSeverityToAlert: definition.minSeverityToAlert,
    scriptId: definition.scriptId,
    scriptName: definition.scriptName,
    chartJson: definition.chartJson,
    optionsJson: definition.optionsJson,
    displayOrder: definition.displayOrder,
    isPinned: definition.isPinned,
  };
}

/**
 * Página "Gerenciar sensores" (/sensors/manage).
 *
 * Diferente da página de frota (que mostra ESTADO agregado), esta lista as
 * DEFINIÇÕES: é aqui que o operador edita, exclui e ativa/desativa sensores de
 * qualquer escopo (global, cliente, site ou agente) sem entrar no detalhe de
 * cada dispositivo.
 *
 * Filtros e busca vivem na URL (useSearchParams) com o mesmo padrão da página de
 * frota: o link filtrado fica compartilhável e sobrevive ao F5.
 */
export default function SensorsManagePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedClientId = searchParams.get("clientId") ?? "";
  const selectedSiteId = searchParams.get("siteId") ?? "";
  const selectedType = (searchParams.get("sensorType") ?? "") as SensorType | "";
  const selectedStatus = searchParams.get("status") ?? "";
  const urlSearch = searchParams.get("q") ?? "";

  /** Busca local: só vai para a URL depois do debounce (histórico limpo). */
  const [searchText, setSearchText] = useState(urlSearch);

  /**
   * Grava filtros na URL removendo chaves vazias (URL limpa = "todos").
   * `replace: true` evita uma entrada de histórico por tecla/filtro.
   */
  const applyFilters = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(updates)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  // Debounce da busca: sem isso cada tecla refaz a consulta e escreve na URL.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trimmed = searchText.trim();
      if (trimmed !== urlSearch) applyFilters({ q: trimmed });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchText, urlSearch, applyFilters]);

  const clients = useClients();
  const sites = useSites(selectedClientId || undefined);

  /**
   * Filtros da consulta. `includeInactive: true` é obrigatório aqui: a página
   * gerencia Ativar/Desativar, então precisa enxergar também os inativos (o
   * recorte "só ativos" é o filtro de status).
   */
  const listParams = useMemo<SensorListParams>(() => {
    const params: SensorListParams = { includeInactive: true };
    if (selectedClientId) params.clientId = selectedClientId;
    if (selectedSiteId) params.siteId = selectedSiteId;
    if (selectedType) params.sensorType = selectedType;
    if (selectedStatus === "active") params.isActive = true;
    if (selectedStatus === "inactive") params.isActive = false;
    if (urlSearch) params.search = urlSearch;
    return params;
  }, [selectedClientId, selectedSiteId, selectedType, selectedStatus, urlSearch]);

  const definitions = useSensorDefinitions(listParams);
  const deleteSensor = useDeleteSensor();
  const updateSensor = useUpdateSensor();

  /** Sensor em edição (null = modal fechado). */
  const [editing, setEditing] = useState<SensorDefinition | null>(null);
  /** Sensor aguardando confirmação de exclusão. */
  const [deleting, setDeleting] = useState<SensorDefinition | null>(null);
  /** Erro de ação (excluir/ativar) — separado do erro de carregamento. */
  const [actionError, setActionError] = useState<string | null>(null);

  const items = definitions.data ?? [];
  const hasFilters = Boolean(
    selectedClientId || selectedSiteId || selectedType || selectedStatus || urlSearch,
  );

  const clientOptions = useMemo(
    () => [
      { value: "", label: "Todos os clientes" },
      ...(clients.data ?? []).map((client) => ({ value: client.id, label: client.name })),
    ],
    [clients.data],
  );
  const siteOptions = useMemo(
    () => [
      { value: "", label: "Todos os sites" },
      ...(sites.data ?? []).map((site) => ({ value: site.id, label: site.name })),
    ],
    [sites.data],
  );
  const typeOptions = useMemo(
    () => [{ value: "", label: "Todos os tipos" }, ...SENSOR_TYPE_OPTIONS],
    [],
  );

  /** Botão Ativar/Desativar por linha (update parcial: o resto é preservado). */
  const handleToggleActive = useCallback(
    async (definition: SensorDefinition) => {
      setActionError(null);
      try {
        await updateSensor.mutateAsync({
          id: definition.id,
          data: { isActive: !definition.isActive },
        });
      } catch (error) {
        setActionError(
          describeSensorsError(
            error,
            definition.isActive
              ? "Falha ao desativar o sensor."
              : "Falha ao ativar o sensor.",
          ),
        );
      }
    },
    [updateSensor],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deleting) return;
    setActionError(null);
    try {
      await deleteSensor.mutateAsync({ sensorId: deleting.id });
      setDeleting(null);
    } catch (error) {
      setActionError(describeSensorsError(error, "Falha ao excluir o sensor."));
    }
  }, [deleting, deleteSensor]);

  /** Salva a edição no modal (o modal já fecha sozinho em caso de sucesso). */
  const handleSave = useCallback(
    async (data: SensorUpsertRequest, sensorId?: string) => {
      const id = sensorId ?? editing?.id;
      if (!id) return;
      await updateSensor.mutateAsync({ id, data });
    },
    [editing?.id, updateSensor],
  );

  const columns = useMemo<Column<SensorDefinition>[]>(
    () => [
      {
        key: "name",
        header: "Nome",
        sortValue: (item) => item.name.toLowerCase(),
        render: (item) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground" title={item.name}>
              {item.name}
            </p>
            {item.description ? (
              <p className="truncate text-xs text-muted" title={item.description}>
                {item.description}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        key: "key",
        header: "Chave",
        sortValue: (item) => item.key ?? "",
        render: (item) =>
          item.key ? (
            <code className="rounded bg-surface-light px-1.5 py-0.5 text-xs text-foreground">
              {item.key}
            </code>
          ) : (
            <span className="text-muted">—</span>
          ),
      },
      {
        key: "sensorType",
        header: "Tipo",
        sortValue: (item) => sensorTypeLabel(item.sensorType),
        render: (item) => <span className="text-foreground">{sensorTypeLabel(item.sensorType)}</span>,
      },
      {
        key: "scopeType",
        header: "Escopo",
        sortValue: (item) => sensorScopeLabel(item.scopeType),
        render: (item) => (
          <div className="flex items-center gap-1.5">
            <Badge color={item.isInherited ? "slate" : "primary"}>
              {sensorScopeLabel(item.scopeType)}
            </Badge>
          </div>
        ),
      },
      {
        key: "scope",
        header: "Cliente / Site / Agente",
        sortValue: (item) => {
          const scope = resolveSensorScope(item);
          return [scope.client, scope.site, scope.agent].filter(Boolean).join(" / ");
        },
        render: (item) => {
          const scope = resolveSensorScope(item);
          const target = [scope.site, scope.agent].filter(Boolean).join(" · ");
          if (!scope.client && !target) return <span className="text-muted">—</span>;
          return (
            <div className="min-w-0">
              <p className="truncate text-foreground">{scope.client ?? "—"}</p>
              {target ? <p className="truncate text-xs text-muted">{target}</p> : null}
            </div>
          );
        },
      },
      {
        key: "target",
        header: "Alvo",
        sortValue: (item) => item.target ?? "",
        render: (item) =>
          item.target ? (
            <span className="truncate text-foreground" title={item.target}>
              {item.target}
            </span>
          ) : (
            <span className="text-muted">—</span>
          ),
      },
      {
        key: "intervalSeconds",
        header: "Intervalo",
        sortValue: (item) => item.intervalSeconds,
        render: (item) => (
          <span className="text-foreground">{formatSensorInterval(item.intervalSeconds)}</span>
        ),
      },
      {
        key: "isActive",
        header: "Ativo",
        sortValue: (item) => (item.isActive ? 1 : 0),
        render: (item) => (
          <Badge color={item.isActive ? "success" : "slate"}>
            {item.isActive ? "Ativo" : "Inativo"}
          </Badge>
        ),
      },
      {
        key: "updatedAt",
        header: "Atualizado em",
        sortValue: (item) => item.updatedAt ?? item.lastUpdatedAt ?? "",
        render: (item) => (
          <span className="whitespace-nowrap text-muted">
            {formatDateTime(item.updatedAt ?? item.lastUpdatedAt)}
          </span>
        ),
      },
      {
        key: "actions",
        header: "Ações",
        className: "text-right",
        render: (item) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Editar ${item.name}`}
              title="Editar"
              onClick={() => setEditing(item)}
            >
              <Icon name="edit" className="h-4 w-4" />
              Editar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={item.isActive ? `Desativar ${item.name}` : `Ativar ${item.name}`}
              title={item.isActive ? "Desativar" : "Ativar"}
              onClick={() => void handleToggleActive(item)}
            >
              <Icon name={item.isActive ? "block" : "power_settings_new"} className="h-4 w-4" />
              {item.isActive ? "Desativar" : "Ativar"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-danger"
              aria-label={`Excluir ${item.name}`}
              title="Excluir"
              onClick={() => setDeleting(item)}
            >
              <Icon name="delete" className="h-4 w-4" />
              Excluir
            </Button>
          </div>
        ),
      },
    ],
    [handleToggleActive],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gerenciar sensores"
        description="Todas as definições de sensor (global, cliente, site e agente): edite limiares, alvos e ative ou desative o monitoramento."
        onBack={() => navigate("/sensors")}
        backLabel="Voltar para a visão de frota"
      >
        <Button
          variant="secondary"
          onClick={() => void definitions.refetch()}
          disabled={definitions.isFetching}
        >
          <Icon name="refresh" className="h-4 w-4" />
          Atualizar
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Cliente"
          fullWidth={false}
          value={selectedClientId}
          onChange={(event) => {
            // Site pertence a um cliente: trocar o cliente limpa o site.
            applyFilters({ clientId: event.target.value, siteId: "" });
          }}
          options={clientOptions}
        />
        <Select
          label="Site"
          fullWidth={false}
          value={selectedSiteId}
          disabled={!selectedClientId}
          onChange={(event) => applyFilters({ siteId: event.target.value })}
          options={siteOptions}
        />
        <Select
          label="Tipo"
          fullWidth={false}
          value={selectedType}
          onChange={(event) => applyFilters({ sensorType: event.target.value })}
          options={typeOptions}
        />
        <Select
          label="Status"
          fullWidth={false}
          value={selectedStatus}
          onChange={(event) => applyFilters({ status: event.target.value })}
          options={STATUS_OPTIONS}
        />
        <div className="w-full sm:w-64">
          <Input
            label="Buscar"
            placeholder="Nome, chave ou alvo"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>
        {hasFilters ? (
          <Button
            variant="ghost"
            onClick={() => {
              setSearchText("");
              applyFilters({ clientId: "", siteId: "", sensorType: "", status: "", q: "" });
            }}
          >
            <Icon name="refresh" className="h-4 w-4" />
            Limpar filtros
          </Button>
        ) : null}
      </div>

      {actionError ? (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {actionError}
        </p>
      ) : null}

      {definitions.isLoading ? (
        <Loading message="Carregando definições de sensor..." />
      ) : definitions.isError ? (
        <ErrorDisplay onRetry={() => void definitions.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="sensors"
          title={hasFilters ? "Nenhum sensor neste filtro" : "Nenhum sensor cadastrado"}
          description={
            hasFilters
              ? "Ajuste os filtros (cliente, site, tipo, status ou busca) para encontrar a definição."
              : "Sensores são criados na aba Sensores do detalhe de um agente — o conjunto recomendado (disco, CPU, memória e uptime) cobre a saúde básica."
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={items}
          keyExtractor={(item) => item.id}
          defaultSort={{ key: "name", direction: "asc" }}
          emptyMessage="Nenhum sensor encontrado"
        />
      )}

      <SensorFormModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        agentId={editing?.agentId ?? ""}
        clientId={editing?.clientId ?? null}
        siteId={editing?.siteId ?? null}
        sensor={editing ? sensorItemFromDefinition(editing) : null}
        isSaving={updateSensor.isPending}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Excluir sensor"
        message={
          <>
            Excluir a definição <strong>{deleting?.name}</strong>? O histórico de
            amostras e eventos dela deixa de ser coletado. Esta ação não pode ser
            desfeita.
          </>
        }
        confirmLabel="Excluir"
        isLoading={deleteSensor.isPending}
        onConfirm={() => void handleConfirmDelete()}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
