import {
  AgentLabel,
  AgentLabelAvailableCustomField,
  AgentLabelNodeType,
  AgentLabelRuleAgentItem,
  AgentLabelRuleAgentsResponse,
  AgentLabelRuleDryRunRequest,
  AgentLabelRuleDryRunResponse,
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
    const raw = await api.get<Array<Record<string, unknown>>>(`${BASE}/agents/${agentId}`);
    return raw.map((item) => ({
      id: String(item.id ?? ""),
      agentId: String(item.agentId ?? item.AgentId ?? agentId),
      label: String(item.label ?? ""),
      sourceType: normalizeAgentLabelSourceType(item.sourceType ?? item.SourceType),
      createdAt: String(item.createdAt ?? item.CreatedAt ?? ""),
      updatedAt: String(item.updatedAt ?? item.UpdatedAt ?? ""),
    }));
  },

  async addManualLabel(agentId: string, label: string): Promise<AgentLabel> {
    const raw = await api.post<Record<string, unknown>>(`${BASE}/manual`, { agentId, label });
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
    const raw = await api.get<Array<Record<string, unknown>>>(`${BASE}/rules`, {
      includeDisabled,
    });
    return raw.map(normalizeRuleResponse);
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
    const raw = await api.post<Record<string, unknown>>(`${BASE}/rules`, payload);
    return normalizeRuleResponse(raw);
  },

  async updateRule(
    id: string,
    payload: UpdateAgentLabelRuleRequest,
  ): Promise<AgentLabelRuleResponse> {
    const raw = await api.put<Record<string, unknown>>(`${BASE}/rules/${id}`, payload);
    return normalizeRuleResponse(raw);
  },

  async deleteRule(id: string): Promise<void> {
    await api.del<void>(`${BASE}/rules/${id}`);
  },

  async reprocessAll(): Promise<{ message: string }> {
    return api.post<{ message: string }>(`${BASE}/reprocess`);
  },

  async dryRun(
    payload: AgentLabelRuleDryRunRequest,
  ): Promise<AgentLabelRuleDryRunResponse> {
    return api.post<AgentLabelRuleDryRunResponse>(
      `${BASE}/rules/dry-run`,
      payload,
    );
  },

  async getAvailableCustomFields(): Promise<AgentLabelAvailableCustomField[]> {
    const raw = await api.get<Array<Record<string, unknown>>>(`${BASE}/rules/available-custom-fields`);
    return raw.map((item) => ({
      id: String(item.id ?? ""),
      name: String(item.name ?? ""),
      label: String(item.label ?? item.name ?? ""),
      description:
        item.description === null || item.description === undefined
          ? null
          : String(item.description),
      scopeType: Number(item.scopeType ?? item.ScopeType ?? 3) as 1 | 2 | 3,
      dataType: Number(item.dataType ?? item.DataType ?? 0),
      options: normalizeStringArray(item.options ?? item.Options ?? item.allowedValues ?? item.AllowedValues),
    }));
  },
};

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "")).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeRuleResponse(raw: Record<string, unknown>): AgentLabelRuleResponse {
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

function normalizeExpressionNode(input: unknown): import("./types").AgentLabelRuleExpressionNodeDto {
  const raw = (input ?? {}) as Record<string, unknown>;
  const nodeType = normalizeAgentLabelNodeType(raw.nodeType ?? raw.NodeType);
  const childrenRaw = raw.children ?? raw.Children;

  return {
    nodeType,
    logicalOperator:
      nodeType === AgentLabelNodeType.Group
        ? normalizeAgentLabelLogicalOperator(raw.logicalOperator ?? raw.LogicalOperator)
        : null,
    children: Array.isArray(childrenRaw)
      ? childrenRaw.map((child) => normalizeExpressionNode(child))
      : [],
    field:
      nodeType === AgentLabelNodeType.Condition
        ? normalizeAgentLabelField(raw.field ?? raw.Field)
        : null,
    customFieldDefinitionId:
      raw.customFieldDefinitionId === null || raw.CustomFieldDefinitionId === null
        ? null
        : String(raw.customFieldDefinitionId ?? raw.CustomFieldDefinitionId ?? "") || null,
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
