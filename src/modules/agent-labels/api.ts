import {
  AgentLabel,
  AgentLabelAvailableCustomField,
  AgentLabelCustomFieldScopeType,
  AgentLabelNodeType,
  AgentLabelRuleAgentItem,
  AgentLabelRuleAgentsResponse,
  AgentLabelRuleDryRunRequest,
  AgentLabelRuleDryRunResponse,
  AgentLabelRuleImpactRequest,
  AgentLabelRuleImpactResponse,
  AgentLabelReprocessStatus,
  AgentLabelRuleResponse,
  AgentLabelSourceType,
  CreateAgentLabelRuleRequest,
  normalizeAgentLabelApplyMode,
  normalizeAgentLabelComparisonOperator,
  normalizeAgentLabelField,
  normalizeAgentLabelLogicalOperator,
  normalizeAgentLabelNodeType,
  normalizeAgentLabelSourceType,
  UpdateAgentLabelRuleRequest,
} from "./types";
import {
  api,
  ApiError,
  parseErrorMessage,
  apiFetchResponse,
} from "@/api/client";

const BASE = "/api/v1/agent-labels";

async function toJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const message = await parseErrorMessage(res);
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export const agentLabelsApi = {
  async getAgentLabels(agentId: string): Promise<AgentLabel[]> {
    const raw = await api.get<Array<Record<string, unknown>>>(
      `${BASE}/agents/${agentId}`,
    );
    return raw.map((item) => ({
      id: String(item.id ?? ""),
      agentId: String(item.agentId ?? item.AgentId ?? agentId),
      label: String(item.label ?? ""),
      sourceType: normalizeAgentLabelSourceType(
        item.sourceType ?? item.SourceType,
      ),
      createdAt: String(item.createdAt ?? item.CreatedAt ?? ""),
      updatedAt: String(item.updatedAt ?? item.UpdatedAt ?? ""),
    }));
  },

  async getDistinctLabels(): Promise<string[]> {
    return api.get<string[]>(`${BASE}/distinct`);
  },

  async addManualLabel(agentId: string, label: string): Promise<AgentLabel> {
    const raw = await api.post<Record<string, unknown>>(`${BASE}/manual`, {
      agentId,
      label,
    });
    return {
      id: String(raw.id ?? ""),
      agentId: String(raw.agentId ?? agentId),
      label: String(raw.label ?? label),
      sourceType: AgentLabelSourceType.Manual,
      createdAt: String(raw.createdAt ?? ""),
      updatedAt: String(raw.updatedAt ?? ""),
    };
  },

  async removeManualLabel(labelId: string): Promise<void> {
    await api.del<void>(`${BASE}/manual/${labelId}`);
  },

  async getRules(includeDisabled = true): Promise<AgentLabelRuleResponse[]> {
    const raw = await api.get<unknown>(`${BASE}/rules`, {
      includeDisabled,
    });
    if (Array.isArray(raw)) {
      return (raw as Array<Record<string, unknown>>).map(normalizeRuleResponse);
    }
    if (
      raw &&
      typeof raw === "object" &&
      Array.isArray((raw as Record<string, unknown>).items)
    ) {
      return (
        (raw as Record<string, unknown>).items as Array<Record<string, unknown>>
      ).map(normalizeRuleResponse);
    }
    return [];
  },

  async getRuleAgents(ruleId: string): Promise<AgentLabelRuleAgentsResponse> {
    const res = await apiFetchResponse(`${BASE}/rules/${ruleId}/agents`);
    const raw = await toJson<{
      ruleId?: string;
      ruleName?: string;
      label?: string;
      description?: string | null;
      totalAgents?: number;
      total?: number;
      count?: number;
      agents?: AgentLabelRuleAgentItem[];
      items?: AgentLabelRuleAgentItem[];
    }>(res);

    const agents = raw.agents ?? raw.items ?? [];
    const totalAgents =
      typeof raw.totalAgents === "number"
        ? raw.totalAgents
        : typeof raw.total === "number"
          ? raw.total
          : typeof raw.count === "number"
            ? raw.count
            : agents.length;

    return {
      ruleId: raw.ruleId ?? ruleId,
      ruleName: raw.ruleName ?? "",
      label: raw.label ?? "",
      description: raw.description ?? null,
      totalAgents,
      agents,
    };
  },

  async createRule(
    payload: CreateAgentLabelRuleRequest,
  ): Promise<AgentLabelRuleResponse> {
    const raw = await api.post<Record<string, unknown>>(
      `${BASE}/rules`,
      payload,
    );
    return normalizeRuleResponse(raw);
  },

  async updateRule(
    id: string,
    payload: UpdateAgentLabelRuleRequest,
  ): Promise<AgentLabelRuleResponse> {
    const raw = await api.put<Record<string, unknown>>(
      `${BASE}/rules/${id}`,
      payload,
    );
    return normalizeRuleResponse(raw);
  },

  async deleteRule(id: string): Promise<void> {
    await api.del<void>(`${BASE}/rules/${id}`);
  },

  async reprocessAll(): Promise<{ jobId: string; message: string }> {
    const raw = await api.post<Record<string, unknown>>(`${BASE}/reprocess`);
    return {
      jobId: String(raw.jobId ?? raw.JobId ?? ""),
      message: String(raw.message ?? raw.Message ?? "Reprocessamento iniciado."),
    };
  },

  /** Progresso de um reprocessamento em andamento. */
  async getReprocessStatus(jobId: string): Promise<AgentLabelReprocessStatus> {
    const raw = await api.get<Record<string, unknown>>(`${BASE}/reprocess/${jobId}`);
    return {
      jobId: String(raw.jobId ?? jobId),
      state: String(raw.state ?? "Unknown"),
      processed: Number(raw.processed ?? 0),
      total: Number(raw.total ?? 0),
      percent: Number(raw.percent ?? 0),
      isCompleted: Boolean(raw.isCompleted),
      message: raw.message == null ? null : String(raw.message),
    };
  },

  async dryRun(
    payload: AgentLabelRuleDryRunRequest,
  ): Promise<AgentLabelRuleDryRunResponse> {
    return api.post<AgentLabelRuleDryRunResponse>(
      `${BASE}/rules/dry-run`,
      payload,
    );
  },

  /** Estima quantos agentes da frota a regra afetaria, sem exigir escolher cliente/site. */
  async evaluateImpact(
    payload: AgentLabelRuleImpactRequest,
  ): Promise<AgentLabelRuleImpactResponse> {
    const raw = await api.post<Record<string, unknown>>(
      `${BASE}/rules/impact`,
      payload,
    );

    return {
      sampled: Number(raw.sampled ?? 0),
      matched: Number(raw.matched ?? 0),
      wouldAddLabel: Number(raw.wouldAddLabel ?? 0),
      wouldRemoveLabel: Number(raw.wouldRemoveLabel ?? 0),
      estimatedTotalAgents: Number(raw.estimatedTotalAgents ?? 0),
      estimatedMatched: Number(raw.estimatedMatched ?? 0),
      truncated: Boolean(raw.truncated),
      samples: Array.isArray(raw.samples)
        ? (raw.samples as Array<Record<string, unknown>>).map(sample => ({
            agentId: String(sample.agentId ?? ""),
            hostname: String(sample.hostname ?? ""),
            displayName: sample.displayName == null ? null : String(sample.displayName),
            matched: Boolean(sample.matched),
            wouldAddLabel: Boolean(sample.wouldAddLabel),
            wouldRemoveLabel: Boolean(sample.wouldRemoveLabel),
            currentAutomaticLabels: Array.isArray(sample.currentAutomaticLabels)
              ? (sample.currentAutomaticLabels as unknown[]).map(item => String(item))
              : [],
          }))
        : [],
    };
  },

  async getAvailableCustomFields(): Promise<AgentLabelAvailableCustomField[]> {
    const raw = await api.get<unknown>(`${BASE}/rules/available-custom-fields`);
    const items = extractList(raw);
    return items.map(normalizeAvailableCustomField);
  },
};

/**
 * Normaliza um custom field disponivel para regras.
 *
 * A API passou a devolver `dataType` como numero, `label` e `scopeType`.
 * Antes o backend enviava `fieldType` (string) e o front lia `dataType`,
 * resultando em NaN e fazendo todos os campos caírem nos operadores de texto.
 */
function normalizeAvailableCustomField(
  item: Record<string, unknown>,
): AgentLabelAvailableCustomField {
  const id = String(item.id ?? item.Id ?? "");
  const name = String(item.name ?? item.Name ?? "");

  return {
    id,
    name,
    label: String(item.label ?? item.Label ?? name),
    description:
      item.description === null || item.description === undefined
        ? null
        : String(item.description),
    scopeType: normalizeScopeType(item.scopeType ?? item.ScopeType),
    dataType: normalizeDataType(
      item.dataType ?? item.DataType ?? item.fieldType ?? item.FieldType,
    ),
    options: normalizeStringArray(
      item.options ?? item.Options ?? item.allowedValues ?? item.AllowedValues,
    ),
  };
}

function extractList(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) {
    return raw as Array<Record<string, unknown>>;
  }
  if (raw && typeof raw === "object") {
    const items = (raw as Record<string, unknown>).items;
    if (Array.isArray(items)) {
      return items as Array<Record<string, unknown>>;
    }
  }
  return [];
}

const SCOPE_TYPE_NAMES: Record<string, AgentLabelCustomFieldScopeType> = {
  Client: 1,
  Site: 2,
  Agent: 3,
};

function normalizeScopeType(value: unknown): AgentLabelCustomFieldScopeType {
  if (typeof value === "number" && value >= 1 && value <= 3) {
    return value as AgentLabelCustomFieldScopeType;
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= 3) {
      return numeric as AgentLabelCustomFieldScopeType;
    }
    const named = SCOPE_TYPE_NAMES[value.trim()];
    if (named) return named;
  }
  return 3; // Agent
}

/** Aceita o numero do enum ou o nome textual ("Integer", "Boolean", ...). */
function normalizeDataType(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }
    const named = DATA_TYPE_NAMES[value.trim()];
    if (named !== undefined) return named;
  }
  return 0; // Text
}

const DATA_TYPE_NAMES: Record<string, number> = {
  Text: 0,
  Integer: 1,
  Decimal: 2,
  Boolean: 3,
  Date: 4,
  DateTime: 5,
  Dropdown: 6,
  ListBox: 7,
};

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "")).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeRuleResponse(
  raw: Record<string, unknown>,
): AgentLabelRuleResponse {
  return {
    id: String(raw.id ?? raw.ruleId ?? ""),
    name: String(raw.name ?? ""),
    label: String(raw.label ?? ""),
    description:
      raw.description === null || raw.description === undefined
        ? null
        : String(raw.description),
    isEnabled: Boolean(raw.isEnabled ?? raw.IsEnabled ?? true),
    applyMode: normalizeAgentLabelApplyMode(raw.applyMode ?? raw.ApplyMode),
    expression: normalizeExpressionNode(raw.expression ?? raw.Expression),
    createdAt: String(raw.createdAt ?? raw.CreatedAt ?? ""),
    updatedAt: String(raw.updatedAt ?? raw.UpdatedAt ?? ""),
  };
}

function normalizeExpressionNode(
  input: unknown,
): import("./types").AgentLabelRuleExpressionNodeDto {
  const raw = (input ?? {}) as Record<string, unknown>;
  const nodeType = normalizeAgentLabelNodeType(raw.nodeType ?? raw.NodeType);
  const childrenRaw = raw.children ?? raw.Children;
  const isContainer =
    nodeType === AgentLabelNodeType.Group ||
    nodeType === AgentLabelNodeType.DiskGroup;

  return {
    nodeType,
    logicalOperator: isContainer
      ? normalizeAgentLabelLogicalOperator(
          raw.logicalOperator ?? raw.LogicalOperator,
        )
      : null,
    children: Array.isArray(childrenRaw)
      ? childrenRaw.map((child) => normalizeExpressionNode(child))
      : [],
    field:
      nodeType === AgentLabelNodeType.Condition
        ? normalizeAgentLabelField(raw.field ?? raw.Field)
        : null,
    customFieldDefinitionId:
      raw.customFieldDefinitionId === null ||
      raw.CustomFieldDefinitionId === null
        ? null
        : String(
            raw.customFieldDefinitionId ?? raw.CustomFieldDefinitionId ?? "",
          ) || null,
    operator:
      nodeType === AgentLabelNodeType.Condition
        ? normalizeAgentLabelComparisonOperator(raw.operator ?? raw.Operator)
        : null,
    value:
      raw.value === null || raw.Value === null
        ? null
        : String(raw.value ?? raw.Value ?? ""),
  };
}
