import { useState, useCallback, useMemo } from "react";
import type {
  ReportLayoutDataSourceDefinition,
  ReportLayoutStyleDefinition,
  ReportLayoutSummaryDefinition,
  ReportLayoutDetailDefinition,
  DatasetCatalogItem,
} from "@/api/types";
import {
  findCommonJoinKeys,
  getDatasetKey,
  getDefaultAlias,
  indexCatalogByKey,
  pickPreferredJoinKey,
} from "./joinKeys";

// ── Types ─────────────────────────────────────────────────

export interface SelectedDataset {
  catalogItem: DatasetCatalogItem;
  alias: string;
  joinToAlias?: string;
  joinSourceKey?: string;
  joinTargetKey?: string;
  joinType?: "left" | "inner";
  isPrimary: boolean;
}

export interface LayoutColumn {
  field: string;
  header: string;
  format: "text" | "number" | "date" | "datetime";
  align: "left" | "center" | "right";
  width?: string;
  sourceAlias?: string;
}

export interface SubTable {
  id: string;
  title: string;
  sourceAlias: string;
  columns: LayoutColumn[];
}

/** Coluna de layout aceita na reidratacao (subconjunto do layout salvo). */
export interface HydratableColumn {
  field?: unknown;
  header?: unknown;
  format?: unknown;
  align?: unknown;
  width?: unknown;
}

/** Secao (sub-tabela) aceita na reidratacao. */
export interface HydratableSection {
  title?: unknown;
  source?: unknown;
  columns?: HydratableColumn[];
}

/**
 * Forma minima de um layout salvo aceita pela reidratacao do editor.
 * Estruturalmente compativel com ReportLayoutDefinition, mas tolerante a
 * campos ausentes/parciais vindos de templates antigos.
 */
export interface HydratableLayout {
  dataSources?: Array<{
    datasetType?: unknown;
    alias?: string;
    /** Marca da fatia D: fonte principal explicita do layout multi-source. */
    base?: boolean;
    join?: {
      joinToAlias?: string;
      sourceKey?: string;
      targetKey?: string;
      joinType?: string;
    } | null;
  }>;
  columns?: HydratableColumn[];
  sections?: HydratableSection[];
  groupBy?: string;
  summaries?: ReportLayoutSummaryDefinition[];
  groupSummaries?: ReportLayoutSummaryDefinition[];
  groupDetails?: ReportLayoutDetailDefinition[];
}

export interface WizardState {
  // Step 1 - Data Sources
  selectedDatasets: SelectedDataset[];
  selectedFields: string[];

  // Step 2 - Layout
  groupBy: string;
  groupTitleTemplate: string;
  hideGroupColumn: boolean;
  columns: LayoutColumn[];
  subTables: SubTable[];
  groupDetails: ReportLayoutDetailDefinition[];
  summaries: ReportLayoutSummaryDefinition[];
  groupSummaries: ReportLayoutSummaryDefinition[];
  orientation: "portrait" | "landscape";

  // Step 3 - Metadata
  name: string;
  subtitle: string;
  description: string;
  defaultFormat: "xlsx" | "csv" | "markdown";
  scopeType: "global" | "client" | "site" | "agent";
  style: ReportLayoutStyleDefinition;
  logoUrl: string;
  watermarkEnabled: boolean;
  watermarkLogoUrl: string;
  watermarkFit: "contain" | "cover";
  watermarkOpacityPercent: string;
  createdBy: string;
}

// ── Join: chaves derivadas do catalogo ────────────────────
//
// Nao existe mais matriz estatica aqui. As chaves vem de
// catalogItem.joinCapabilities e catalogItem.fieldMetadata[].isJoinKey
// (ver hooks/joinKeys.ts). A matriz antiga omitia 7 datasets e por isso
// "Sensores (estado e metricas)" nunca achava chave comum com "Hardware".

/** Chaves comuns entre dois itens do catalogo (derivado, nunca hardcoded). */
export function findJoinKeys(
  source: DatasetCatalogItem | undefined | null,
  target: DatasetCatalogItem | undefined | null,
): string[] {
  return findCommonJoinKeys(source, target);
}

function normalizeFieldReference(field: string, sourceAlias?: string): string {
  if (!sourceAlias) return field;
  return field.startsWith(`${sourceAlias}.`)
    ? field.slice(sourceAlias.length + 1)
    : field;
}

function normalizeLogoUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (/^(https?:\/\/|data:image\/|blob:|\/)/i.test(trimmed)) {
    return trimmed;
  }

  // Permite colar domínio sem protocolo sem quebrar o render do logo.
  return `https://${trimmed}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Alias unico dentro da selecao. Nomes puros de campo do layout dependem de
 * aliases distintos, entao colisao (hw, hw2) tem de ser evitada.
 */
function getUniqueAlias(base: string, existing: SelectedDataset[]): string {
  const taken = new Set(existing.map((d) => d.alias));
  const candidate = base || "ds";
  if (!taken.has(candidate)) return candidate;
  let suffix = 2;
  while (taken.has(`${candidate}${suffix}`)) suffix += 1;
  return `${candidate}${suffix}`;
}

/**
 * isPrimary e SEMPRE derivado do indice do array. Assim reordenar, remover
 * ou reidratar nunca deixa duas fontes marcadas como principal (ou nenhuma).
 */
export function withDerivedPrimary(datasets: SelectedDataset[]): SelectedDataset[] {
  return datasets.map((ds, index) => {
    const isPrimary = index === 0;
    return ds.isPrimary === isPrimary ? ds : { ...ds, isPrimary };
  });
}

/** Sugere a chave preferida entre os dois datasets do catalogo. */
export function suggestJoinKey(
  source: DatasetCatalogItem,
  target: DatasetCatalogItem,
): string | undefined {
  return pickPreferredJoinKey(findCommonJoinKeys(source, target));
}

// ── Default layout per dataset ───────────────────────────

const DEFAULT_COLUMNS: Record<string, LayoutColumn[]> = {
  softwareInventory: [
    { field: "softwareName", header: "Software", format: "text", align: "left" },
    { field: "publisher", header: "Fabricante", format: "text", align: "left" },
    { field: "version", header: "Versão", format: "text", align: "left" },
  ],
  agentHardware: [
    { field: "agentHostname", header: "Hostname", format: "text", align: "left" },
    { field: "totalMemoryGB", header: "RAM (GB)", format: "number", align: "right" },
    { field: "osName", header: "SO", format: "text", align: "left" },
    { field: "processor", header: "Processador", format: "text", align: "left" },
  ],
  agentLabels: [
    { field: "labelName", header: "Label", format: "text", align: "left" },
    { field: "labelSource", header: "Origem", format: "text", align: "left" },
  ],
  automaticLabelRules: [
    { field: "ruleName", header: "Regra", format: "text", align: "left" },
    { field: "labelName", header: "Label", format: "text", align: "left" },
    { field: "matchCount", header: "Agents", format: "number", align: "right" },
  ],
  logs: [
    { field: "level", header: "Nível", format: "text", align: "center" },
    { field: "message", header: "Mensagem", format: "text", align: "left" },
    { field: "createdAt", header: "Data", format: "datetime", align: "left" },
  ],
  tickets: [
    { field: "title", header: "Título", format: "text", align: "left" },
    { field: "priority", header: "Prioridade", format: "text", align: "center" },
    { field: "createdAt", header: "Aberto em", format: "datetime", align: "left" },
  ],
  configurationAudit: [
    { field: "entityType", header: "Entidade", format: "text", align: "left" },
    { field: "fieldName", header: "Campo", format: "text", align: "left" },
    { field: "changedBy", header: "Alterado por", format: "text", align: "left" },
  ],
  automationExecutions: [
    { field: "agentHostname", header: "Hostname", format: "text", align: "left" },
    { field: "status", header: "Status", format: "text", align: "center" },
    { field: "exitCode", header: "Exit Code", format: "number", align: "right" },
  ],
  agentInventoryComposite: [
    { field: "agentHostname", header: "Hostname", format: "text", align: "left" },
    { field: "softwareName", header: "Software", format: "text", align: "left" },
    { field: "osName", header: "SO", format: "text", align: "left" },
  ],
  agentMonitoringEvents: [
    { field: "severity", header: "Severidade", format: "text", align: "center" },
    { field: "title", header: "Título", format: "text", align: "left" },
    { field: "occurredAt", header: "Ocorrido em", format: "datetime", align: "left" },
  ],
  agentAlerts: [
    { field: "name", header: "Nome", format: "text", align: "left" },
    { field: "severity", header: "Severidade", format: "text", align: "center" },
    { field: "threshold", header: "Limiar", format: "number", align: "right" },
  ],
  p2pTelemetry: [
    { field: "agentHostname", header: "Hostname", format: "text", align: "left" },
    { field: "bytesServed", header: "Bytes servidos", format: "number", align: "right" },
    { field: "connectedPeers", header: "Peers", format: "number", align: "right" },
  ],
  agentDisks: [
    { field: "agentHostname", header: "Hostname", format: "text", align: "left" },
    { field: "diskName", header: "Disco", format: "text", align: "left" },
    { field: "healthStatus", header: "Saúde", format: "text", align: "center" },
  ],
  networkAdapters: [
    { field: "agentHostname", header: "Hostname", format: "text", align: "left" },
    { field: "adapterName", header: "Adaptador", format: "text", align: "left" },
    { field: "speedMbps", header: "Velocidade", format: "number", align: "right" },
  ],
  listeningPorts: [
    { field: "agentHostname", header: "Hostname", format: "text", align: "left" },
    { field: "port", header: "Porta", format: "number", align: "right" },
    { field: "processName", header: "Processo", format: "text", align: "left" },
  ],
  printers: [
    { field: "agentHostname", header: "Hostname", format: "text", align: "left" },
    { field: "printerName", header: "Impressora", format: "text", align: "left" },
    { field: "driverName", header: "Driver", format: "text", align: "left" },
  ],
  softwareCatalog: [
    { field: "name", header: "Nome", format: "text", align: "left" },
    { field: "publisher", header: "Fabricante", format: "text", align: "left" },
    { field: "latestVersion", header: "Versão", format: "text", align: "left" },
  ],
  automationScripts: [
    { field: "name", header: "Nome", format: "text", align: "left" },
    { field: "language", header: "Linguagem", format: "text", align: "center" },
    { field: "isActive", header: "Ativo", format: "text", align: "center" },
  ],
  appPackages: [
    { field: "name", header: "Nome", format: "text", align: "left" },
    { field: "publisher", header: "Fabricante", format: "text", align: "left" },
    { field: "version", header: "Versão", format: "text", align: "left" },
  ],
  ticketActivity: [
    { field: "ticketId", header: "Ticket", format: "text", align: "left" },
    { field: "action", header: "Ação", format: "text", align: "left" },
    { field: "createdAt", header: "Data", format: "datetime", align: "left" },
  ],
  ticketEscalations: [
    { field: "name", header: "Nome", format: "text", align: "left" },
    { field: "escalationLevel", header: "Nível", format: "number", align: "right" },
    { field: "isActive", header: "Ativo", format: "text", align: "center" },
  ],
  customFields: [
    { field: "entityName", header: "Entidade", format: "text", align: "left" },
    { field: "fieldName", header: "Campo", format: "text", align: "left" },
    { field: "valueType", header: "Tipo", format: "text", align: "center" },
  ],
  knowledgeBase: [
    { field: "title", header: "Título", format: "text", align: "left" },
    { field: "category", header: "Categoria", format: "text", align: "left" },
    { field: "updatedAt", header: "Atualizado em", format: "datetime", align: "left" },
  ],
  ticketAnswers: [
    { field: "ticketId", header: "Chamado", format: "text", align: "left" },
    { field: "ticketTitle", header: "Título do chamado", format: "text", align: "left" },
    { field: "questionLabel", header: "Pergunta", format: "text", align: "left" },
    { field: "valueText", header: "Resposta", format: "text", align: "left" },
    { field: "createdAt", header: "Respondido em", format: "datetime", align: "left" },
  ],
  // ── Patches do Windows (WUA) e inventário/estado dos agentes ──
  windowsUpdates: [
    { field: "agentHostname", header: "Hostname", format: "text", align: "left" },
    { field: "kbIds", header: "KB", format: "text", align: "left" },
    { field: "title", header: "Atualização", format: "text", align: "left" },
    { field: "classification", header: "Classificação", format: "text", align: "left" },
    { field: "severity", header: "Severidade", format: "text", align: "center" },
    { field: "approvalState", header: "Aprovação", format: "text", align: "center" },
    { field: "status", header: "Status", format: "text", align: "center" },
    { field: "requiresReboot", header: "Reinício", format: "text", align: "center" },
    { field: "reportedAt", header: "Reportada", format: "datetime", align: "left" },
  ],
  patchCompliance: [
    { field: "agentHostname", header: "Agente", format: "text", align: "left" },
    { field: "clientName", header: "Cliente", format: "text", align: "left" },
    { field: "siteName", header: "Site", format: "text", align: "left" },
    { field: "osName", header: "SO", format: "text", align: "left" },
    { field: "pendingCount", header: "Pendentes", format: "number", align: "right" },
    { field: "criticalCount", header: "Críticas", format: "number", align: "right" },
    { field: "deniedCount", header: "Recusadas", format: "number", align: "right" },
    { field: "approvedCount", header: "Aprovadas", format: "number", align: "right" },
    { field: "installedCount", header: "Instaladas", format: "number", align: "right" },
    { field: "pendingReboot", header: "Reinício pendente", format: "text", align: "center" },
    { field: "scanStatus", header: "Scan", format: "text", align: "center" },
    { field: "lastScanAt", header: "Último scan", format: "datetime", align: "left" },
  ],
  patchApprovals: [
    { field: "scopeType", header: "Escopo", format: "text", align: "left" },
    { field: "updateKey", header: "Atualização", format: "text", align: "left" },
    { field: "kbId", header: "KB", format: "text", align: "left" },
    { field: "action", header: "Ação", format: "text", align: "center" },
    { field: "reason", header: "Motivo", format: "text", align: "left" },
    { field: "updatedBy", header: "Alterado por", format: "text", align: "left" },
    { field: "updatedAt", header: "Atualizada em", format: "datetime", align: "left" },
  ],
  patchApprovalAudit: [
    { field: "changedAt", header: "Quando", format: "datetime", align: "left" },
    { field: "changeType", header: "Mudança", format: "text", align: "center" },
    { field: "scopeType", header: "Escopo", format: "text", align: "left" },
    { field: "updateKey", header: "Atualização", format: "text", align: "left" },
    { field: "oldAction", header: "Ação anterior", format: "text", align: "left" },
    { field: "newAction", header: "Nova ação", format: "text", align: "left" },
    { field: "reason", header: "Motivo", format: "text", align: "left" },
    { field: "changedBy", header: "Por", format: "text", align: "left" },
    { field: "ipAddress", header: "IP", format: "text", align: "left" },
  ],
  agents: [
    { field: "hostname", header: "Hostname", format: "text", align: "left" },
    { field: "clientName", header: "Cliente", format: "text", align: "left" },
    { field: "siteName", header: "Site", format: "text", align: "left" },
    { field: "status", header: "Status", format: "text", align: "center" },
    { field: "osName", header: "SO", format: "text", align: "left" },
    { field: "osVersion", header: "Versão SO", format: "text", align: "left" },
    { field: "agentVersion", header: "Agente", format: "text", align: "left" },
    { field: "loggedUser", header: "Usuário", format: "text", align: "left" },
    { field: "lastSeenAt", header: "Último contato", format: "datetime", align: "left" },
    { field: "pendingReboot", header: "Reinício pendente", format: "text", align: "center" },
  ],
  agentSensors: [
    { field: "sensorName", header: "Sensor", format: "text", align: "left" },
    { field: "sensorType", header: "Tipo", format: "text", align: "left" },
    { field: "status", header: "Status", format: "text", align: "center" },
    { field: "severity", header: "Severidade", format: "text", align: "center" },
    { field: "primaryValue", header: "Valor", format: "number", align: "right" },
    { field: "unit", header: "Unidade", format: "text", align: "left" },
    { field: "lastRunAt", header: "Última coleta", format: "datetime", align: "left" },
  ],
};

// ── Hook ──────────────────────────────────────────────────

export function useWizardState(initialState?: Partial<WizardState>) {
  const [state, setState] = useState<WizardState>(() => ({
    selectedDatasets: [],
    selectedFields: [],
    groupBy: "",
    groupTitleTemplate: "",
    hideGroupColumn: true,
    columns: [],
    subTables: [],
    groupDetails: [],
    summaries: [],
    groupSummaries: [],
    orientation: "landscape",
    name: initialState?.name ?? "",
    subtitle: "",
    description: initialState?.description ?? "",
    defaultFormat: initialState?.defaultFormat ?? "xlsx",
    scopeType: initialState?.scopeType ?? "global",
    style: initialState?.style ?? {
      primaryColor: "#16324F",
      headerBackgroundColor: "#16324F",
      headerTextColor: "#FFFFFF",
      alternateRowColor: "#EEF4F7",
      fontFamily: "Segoe UI, sans-serif",
      showRowStripes: true,
    },
    logoUrl: initialState?.logoUrl ?? initialState?.style?.logoUrl ?? "",
    watermarkEnabled: initialState?.watermarkEnabled ?? false,
    watermarkLogoUrl: initialState?.watermarkLogoUrl ?? "",
    watermarkFit: initialState?.watermarkFit ?? "contain",
    watermarkOpacityPercent: initialState?.watermarkOpacityPercent ?? "8",
    createdBy: initialState?.createdBy ?? "",
  }));

  // ── Dataset actions ───────────────────────────────────

  const addDataset = useCallback((item: DatasetCatalogItem) => {
    setState((prev) => {
      const key = getDatasetKey(item);
      const isPrimary = prev.selectedDatasets.length === 0;
      const alias = getUniqueAlias(getDefaultAlias(item), prev.selectedDatasets);

      // Se nao for a principal, sugere o join a partir do CATALOGO
      // (joinCapabilities/fieldMetadata), nunca de uma matriz estatica.
      let joinToAlias: string | undefined;
      let joinSourceKey: string | undefined;
      let joinTargetKey: string | undefined;
      if (!isPrimary && prev.selectedDatasets.length > 0) {
        const primary = prev.selectedDatasets[0];
        const suggestedKey = suggestJoinKey(item, primary.catalogItem);
        if (suggestedKey) {
          joinToAlias = primary.alias;
          joinSourceKey = suggestedKey;
          joinTargetKey = suggestedKey;
        }
      }

      const dataset: SelectedDataset = {
        catalogItem: item,
        alias,
        joinToAlias,
        joinSourceKey,
        joinTargetKey,
        joinType: "left",
        isPrimary,
      };

      const newDatasets = [...prev.selectedDatasets, dataset];

      // Auto-add default columns for this dataset
      const defaults = DEFAULT_COLUMNS[key];
      let newColumns = prev.columns;
      let newSubTables = prev.subTables;

      if (isPrimary && defaults) {
        newColumns = defaults.map((c) => ({
          ...c,
          sourceAlias: alias,
        }));
      } else if (defaults) {
        // Add as sub-table
        const subTable: SubTable = {
          id: `sub-${Date.now()}`,
          title: item.name ?? key,
          sourceAlias: alias,
          columns: defaults.map((c) => ({
            ...c,
            sourceAlias: alias,
          })),
        };
        newSubTables = [...prev.subTables, subTable];
      }

      return {
        ...prev,
        selectedDatasets: newDatasets,
        columns: newColumns,
        subTables: newSubTables,
      };
    });
  }, []);

  const removeDataset = useCallback((alias: string) => {
    setState((prev) => {
      const newDatasets = withDerivedPrimary(
        prev.selectedDatasets.filter((d) => d.alias !== alias),
      );
      const newSubTables = prev.subTables.filter((st) => st.sourceAlias !== alias);
      return {
        ...prev,
        selectedDatasets: newDatasets,
        subTables: newSubTables,
      };
    });
  }, []);

  /**
   * Atualiza o join de uma fonte. Campos ausentes no patch sao preservados,
   * entao o usuario pode montar o par origem/destino em qualquer ordem.
   */
  const setJoin = useCallback(
    (
      alias: string,
      patch: {
        joinToAlias?: string;
        joinSourceKey?: string;
        joinTargetKey?: string;
        joinType?: "left" | "inner";
      },
    ) => {
      setState((prev) => ({
        ...prev,
        selectedDatasets: prev.selectedDatasets.map((ds) => {
          if (ds.alias !== alias) return ds;
          const joinToAlias = patch.joinToAlias ?? ds.joinToAlias;
          const joinSourceKey = patch.joinSourceKey ?? ds.joinSourceKey;
          const joinTargetKey = patch.joinTargetKey ?? ds.joinTargetKey;
          const joinType = patch.joinType ?? ds.joinType ?? "left";
          return { ...ds, joinToAlias, joinSourceKey, joinTargetKey, joinType };
        }),
      }));
    },
    [],
  );

  /**
   * Move uma fonte na cadeia. A ordem define a fonte principal (indice 0),
   * portanto mover tambem redireciona os joins que apontavam para a antiga
   * principal para o novo alias base.
   */
  const moveDataset = useCallback((alias: string, direction: "up" | "down") => {
    setState((prev) => {
      const index = prev.selectedDatasets.findIndex((d) => d.alias === alias);
      if (index === -1) return prev;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.selectedDatasets.length) {
        return prev;
      }

      const reordered = [...prev.selectedDatasets];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(targetIndex, 0, moved);

      // A fonte principal e SEMPRE reordered[0]. Ao mover, ela muda, e duas
      // coisas precisam de reparo:
      //   1. quem apontava para a antiga principal passa a apontar para a nova;
      //   2. a fonte que PERDEU o posto de principal (e agora e secundaria)
      //      pode nao ter join nenhum - ela viraria uma fonte orfa. Nesse caso
      //      derivamos um join a partir do catalogo.
      const previousPrimaryAlias = prev.selectedDatasets[0]?.alias;
      const nextPrimaryAlias = reordered[0]?.alias;

      const repaired = reordered.map((ds, i) => {
        if (i === 0) return { ...ds, joinToAlias: undefined, joinSourceKey: undefined, joinTargetKey: undefined };

        let next = ds;
        if (
          previousPrimaryAlias &&
          previousPrimaryAlias !== nextPrimaryAlias &&
          ds.joinToAlias === previousPrimaryAlias
        ) {
          next = { ...next, joinToAlias: nextPrimaryAlias };
        }

        if (!next.joinToAlias || next.joinToAlias === ds.alias) {
          const newPrimary = reordered[0];
          const suggested = newPrimary ? suggestJoinKey(next.catalogItem, newPrimary.catalogItem) : undefined;
          next = {
            ...next,
            joinToAlias: newPrimary?.alias,
            joinSourceKey: suggested ?? next.joinSourceKey,
            joinTargetKey: suggested ?? next.joinTargetKey,
            joinType: next.joinType ?? "left",
          };
        }

        return next;
      });

      return { ...prev, selectedDatasets: withDerivedPrimary(repaired) };
    });
  }, []);

  // ── Column actions ─────────────────────────────────────

  const setColumns = useCallback((columns: LayoutColumn[]) => {
    setState((prev) => ({ ...prev, columns }));
  }, []);

  const addColumn = useCallback((field: string, sourceAlias?: string) => {
    setState((prev) => ({
      ...prev,
      columns: [
        ...prev.columns,
        {
          field,
          header: field,
          format: "text",
          align: "left",
          sourceAlias,
        },
      ],
    }));
  }, []);

  const removeColumn = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      columns: prev.columns.filter((_, i) => i !== index),
    }));
  }, []);

  const updateColumn = useCallback((index: number, updates: Partial<LayoutColumn>) => {
    setState((prev) => ({
      ...prev,
      columns: prev.columns.map((c, i) =>
        i === index ? { ...c, ...updates } : c,
      ),
    }));
  }, []);

  // ── Sub-table actions ─────────────────────────────────

  const addSubTable = useCallback((sourceAlias: string, title: string) => {
    setState((prev) => {
      if (prev.subTables.some((st) => st.sourceAlias === sourceAlias)) {
        return prev;
      }

      return {
        ...prev,
        subTables: [
          ...prev.subTables,
          { id: `sub-${Date.now()}`, title, sourceAlias, columns: [] },
        ],
      };
    });
  }, []);

  const removeSubTable = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      subTables: prev.subTables.filter((st) => st.id !== id),
    }));
  }, []);

  const updateSubTableColumns = useCallback(
    (id: string, columns: LayoutColumn[]) => {
      setState((prev) => ({
        ...prev,
        subTables: prev.subTables.map((st) =>
          st.id === id ? { ...st, columns } : st,
        ),
      }));
    },
    [],
  );

  // ── Bulk setters ───────────────────────────────────────

  const setField = useCallback(
    <K extends keyof WizardState>(key: K, value: WizardState[K]) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // ── Available fields from all selected datasets ───────

  const allFields = useMemo(() => {
    return state.selectedDatasets.flatMap((ds) => {
      const fields = ds.catalogItem.fields ?? [];
      return fields.map((f) => ({
        name: f,
        reference: `${ds.alias}.${f}`,
        datasetName: ds.catalogItem.name ?? getDatasetKey(ds.catalogItem),
        alias: ds.alias,
      }));
    });
  }, [state.selectedDatasets]);

  // ── Build layout JSON ─────────────────────────────────

  const buildLayoutJson = useCallback((): string => {
    const normalizedLogoUrl = normalizeLogoUrl(state.logoUrl);
    const normalizedWatermarkLogoUrl = normalizeLogoUrl(state.watermarkLogoUrl);
    const watermarkOpacityRaw = Number(state.watermarkOpacityPercent);
    const watermarkOpacity = Number.isFinite(watermarkOpacityRaw)
      ? Math.min(0.4, Math.max(0.01, watermarkOpacityRaw / 100))
      : 0.08;
    const useAliases = state.selectedDatasets.length > 1;
    const primaryAlias = state.selectedDatasets[0]?.alias;

    const normalizeSingleSourceField = (
      field: string,
      sourceAlias?: string,
    ): string => {
      const alias = sourceAlias ?? primaryAlias;
      if (!alias) return field;
      return normalizeFieldReference(field, alias);
    };

    const toLayoutField = (field: string, sourceAlias?: string): string => {
      if (!useAliases) {
        return normalizeSingleSourceField(field, sourceAlias);
      }

      if (sourceAlias) {
        return `${sourceAlias}.${normalizeFieldReference(field, sourceAlias)}`;
      }

      return field;
    };

    const normalizedGroupBy = state.groupBy
      ? toLayoutField(state.groupBy, primaryAlias)
      : undefined;

    const normalizedGroupTitleTemplate = !state.groupTitleTemplate
      ? undefined
      : !useAliases && primaryAlias
        ? state.groupTitleTemplate.replace(
          new RegExp(`\\{\\{\\s*${escapeRegExp(primaryAlias)}\\.`, "g"),
          "{{",
        )
        : state.groupTitleTemplate;

    // A fonte principal e SEMPRE o indice 0 (isPrimary derivado). Em
    // multi-source a marca "base" e serializada para o backend nao depender de
    // "dataSources[0] = base": sem ela, reordenar as fontes no wizard mudava o
    // significado do relatorio em silencio (a Fatia D criou a marca justamente
    // para isso, mas o wizard nunca a emitia).
    const isMultiSourceLayout = state.selectedDatasets.length > 1;

    const dataSources: ReportLayoutDataSourceDefinition[] =
      state.selectedDatasets.map((ds, index) => {
        const dsType = ds.catalogItem.datasetType ?? ds.catalogItem.type;
        const def: ReportLayoutDataSourceDefinition = {
          datasetType: dsType ?? "",
          alias: ds.alias,
        };

        // Somente na fonte marcada, e somente com mais de uma fonte. Nas
        // demais a propriedade e OMITIDA (nunca "base": false) para manter o
        // JSON limpo e compativel com layouts antigos.
        if (isMultiSourceLayout && index === 0) {
          def.base = true;
        }

        if (ds.joinToAlias) {
          def.join = {
            joinToAlias: ds.joinToAlias,
            sourceKey: ds.joinSourceKey ?? "",
            targetKey: ds.joinTargetKey ?? "",
            joinType: ds.joinType,
          };
        }
        return def;
      });

    const layout: Record<string, unknown> = {
      title: state.name || "Novo Relatório",
      orientation: state.orientation,
      logoUrl: normalizedLogoUrl,
      groupBy: normalizedGroupBy,
      groupTitleTemplate: normalizedGroupTitleTemplate,
      hideGroupColumn: state.hideGroupColumn,
      columns: state.columns.map((c) => ({
        field: toLayoutField(c.field, c.sourceAlias),
        header: c.header,
        format: c.format,
        align: c.align,
        width: c.width || undefined,
      })),
      style: {
        primaryColor: state.style.primaryColor,
        secondaryColor: state.style.secondaryColor,
        accentColor: state.style.accentColor,
        headerBackgroundColor: state.style.headerBackgroundColor,
        headerTextColor: state.style.headerTextColor,
        alternateRowColor: state.style.alternateRowColor,
        borderColor: state.style.borderColor,
        fontFamily: state.style.fontFamily,
        logoUrl: normalizedLogoUrl,
        logoMaxHeightPx: state.style.logoMaxHeightPx,
        showRowStripes: state.style.showRowStripes,
      },
    };

    if (state.subtitle) layout.subtitle = state.subtitle;
    if (dataSources.length > 1) layout.dataSources = dataSources;
    if (state.groupDetails.length > 0) {
      layout.groupDetails = state.groupDetails.map((detail) => ({
        ...detail,
        field: toLayoutField(detail.field, primaryAlias),
      }));
    }
    if (state.summaries.length > 0) {
      layout.summaries = state.summaries.map((summary) => ({
        ...summary,
        field: summary.field
          ? toLayoutField(summary.field, primaryAlias)
          : summary.field,
      }));
    }
    if (state.groupSummaries.length > 0) {
      layout.groupSummaries = state.groupSummaries.map((summary) => ({
        ...summary,
        field: summary.field
          ? toLayoutField(summary.field, primaryAlias)
          : summary.field,
      }));
    }

    if (state.subTables.length > 0) {
      layout.sections = state.subTables.map((st) => ({
        title: st.title,
        source: st.sourceAlias,
        columns: st.columns.map((c) => ({
          field: toLayoutField(c.field, c.sourceAlias ?? st.sourceAlias),
          header: c.header,
          format: c.format,
          align: c.align,
        })),
      }));
    }

    if (state.watermarkEnabled && (normalizedLogoUrl || normalizedWatermarkLogoUrl)) {
      layout.watermark = {
        useLogo: !normalizedWatermarkLogoUrl,
        logoUrl: normalizedWatermarkLogoUrl,
        // Mantem compatibilidade com backends antigos que priorizam imageUrl.
        imageUrl: normalizedWatermarkLogoUrl,
        imageFit: state.watermarkFit,
        imageOpacity: watermarkOpacity,
      };
    }

    return JSON.stringify(layout);
  }, [state]);

  /**
   * Reidrata a selecao a partir de um layout salvo (fluxo de edicao).
   * Recebe o catalogo ja carregado e mapeia dataSources -> catalogItem por
   * datasetType, preservando alias e o join gravado.
   */
  const hydrateFromLayout = useCallback(
    (layout: HydratableLayout, catalog: DatasetCatalogItem[]) => {
      const byType = indexCatalogByKey(catalog);
      const sources = Array.isArray(layout.dataSources) ? layout.dataSources : [];
      if (sources.length === 0) return;

      const restored: SelectedDataset[] = [];
      // Alias da fonte marcada com base=true no layout salvo (fatia D).
      let markedBaseAlias: string | undefined;

      for (const source of sources) {
        const typeKey =
          source?.datasetType === undefined || source?.datasetType === null
            ? ""
            : String(source.datasetType);
        const catalogItem = byType.get(typeKey);
        if (!catalogItem) continue;

        const alias = (source.alias ?? "").trim() || getDefaultAlias(catalogItem);
        if (restored.some((d) => d.alias === alias)) continue;

        if (source.base === true && markedBaseAlias === undefined) {
          markedBaseAlias = alias;
        }

        restored.push({
          catalogItem,
          alias,
          joinToAlias: source.join?.joinToAlias,
          joinSourceKey: source.join?.sourceKey,
          joinTargetKey: source.join?.targetKey,
          joinType: source.join?.joinType === "inner" ? "inner" : "left",
          isPrimary: false,
        });
      }

      if (restored.length === 0) return;

      // A base marcada vira a posicao 0. Sem marca, mantem dataSources[0]
      // (comportamento dos layouts antigos).
      const ordered = markedBaseAlias
        ? (() => {
            const index = restored.findIndex((d) => d.alias === markedBaseAlias);
            if (index <= 0) return restored;
            const reordered = [...restored];
            const [moved] = reordered.splice(index, 1);
            reordered.unshift(moved);
            return reordered;
          })()
        : restored;

      const aliases = new Set(ordered.map((d) => d.alias));
      const primaryAlias = ordered[0].alias;

      // "hw.agentId" -> "agentId"; nome puro -> ele mesmo.
      const splitReference = (
        value: unknown,
      ): { alias?: string; field: string } => {
        const raw = typeof value === "string" ? value.trim() : "";
        if (!raw) return { field: "" };
        const dot = raw.indexOf(".");
        if (dot < 0) return { alias: primaryAlias, field: raw };
        const prefix = raw.slice(0, dot);
        return aliases.has(prefix)
          ? { alias: prefix, field: raw.slice(dot + 1) }
          : { alias: primaryAlias, field: raw };
      };

      const toColumn = (
        value: HydratableColumn,
        fallbackAlias: string,
      ): LayoutColumn | null => {
        const parsed = splitReference(value.field);
        const field = parsed.field;
        if (!field) return null;
        const sourceAlias = parsed.alias ?? fallbackAlias;
        return {
          field,
          header:
            typeof value.header === "string" && value.header.trim()
              ? value.header
              : field,
          format: (value.format as LayoutColumn["format"]) ?? "text",
          align: (value.align as LayoutColumn["align"]) ?? "left",
          width: typeof value.width === "string" ? value.width : undefined,
          sourceAlias,
        };
      };

      const columns = (layout.columns ?? [])
        .map((column) => toColumn(column, primaryAlias))
        .filter((column): column is LayoutColumn => column !== null);

      // Secao sem nenhuma coluna valida e invalida no backend: descartar.
      const subTables = (layout.sections ?? [])
        .map((section, index) => {
          const sectionAlias =
            typeof section.source === "string" && aliases.has(section.source)
              ? section.source
              : primaryAlias;
          const sectionColumns = (Array.isArray(section.columns) ? section.columns : [])
            .map((column) => toColumn(column, sectionAlias))
            .filter((column): column is LayoutColumn => column !== null);

          if (sectionColumns.length === 0) return null;

          return {
            id: `sub-restored-${index}`,
            title:
              typeof section.title === "string" && section.title.trim()
                ? section.title
                : sectionAlias,
            sourceAlias: sectionAlias,
            columns: sectionColumns,
          } satisfies SubTable;
        })
        .filter((subTable): subTable is SubTable => subTable !== null);

      const normalizedGroupBy = splitReference(layout.groupBy).field;

      const toDetail = (
        item: ReportLayoutDetailDefinition,
      ): ReportLayoutDetailDefinition => ({
        ...item,
        field: splitReference(item.field).field,
      });

      setState((prev) => ({
        ...prev,
        selectedDatasets: withDerivedPrimary(ordered),
        columns: columns.length > 0 ? columns : prev.columns,
        subTables,
        groupBy: normalizedGroupBy,
        summaries: layout.summaries ?? [],
        groupSummaries: layout.groupSummaries ?? [],
        groupDetails: (layout.groupDetails ?? []).map(toDetail),
      }));
    },
    [],
  );

  // ── Build request payload ─────────────────────────────

  const buildRequest = useCallback(
    (
      overrides?: Partial<{
        format: string;
        filtersJson: string;
      }>,
    ) => {
      const primaryDs = state.selectedDatasets[0];
      const dsType = primaryDs?.catalogItem.datasetType ?? primaryDs?.catalogItem.type;
      // CreateReportTemplateCommand.DefaultFormat e int: "markdown" como string
      // faz o binding falhar (400) e o template nao e salvo.
      const requestedFormat = (overrides?.format ?? state.defaultFormat ?? "xlsx").toLowerCase();
      const defaultFormat = requestedFormat === "csv" ? 2 : requestedFormat === "markdown" || requestedFormat === "md" ? 3 : 0;
      return {
        name: state.name || "Novo Template",
        description: state.description || null,
        datasetType: dsType ?? "",
        defaultFormat,
        scopeType: state.scopeType,
        layoutJson: buildLayoutJson(),
        filtersJson: overrides?.filtersJson ?? null,
        createdBy: state.createdBy || undefined,
      };
    },
    [state, buildLayoutJson],
  );

  return {
    state,
    // Dataset
    addDataset,
    removeDataset,
    setJoin,
    moveDataset,
    hydrateFromLayout,
    // Columns
    columns: state.columns,
    setColumns,
    addColumn,
    removeColumn,
    updateColumn,
    // Sub-tables
    subTables: state.subTables,
    addSubTable,
    removeSubTable,
    updateSubTableColumns,
    // Fields
    allFields,
    setField,
    // Build
    buildLayoutJson,
    buildRequest,
  };
}
