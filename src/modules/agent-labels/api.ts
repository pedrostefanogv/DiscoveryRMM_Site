import {
  AgentLabel,
  AgentLabelRuleAgentItem,
  AgentLabelRuleAgentsResponse,
  AgentLabelRuleDryRunRequest,
  AgentLabelRuleDryRunResponse,
  AgentLabelRuleResponse,
  CreateAgentLabelRuleRequest,
  UpdateAgentLabelRuleRequest,
} from "./types";
import {
  api,
  ApiError,
  parseErrorMessage,
  apiFetchResponse,
} from "@/api/client";

const BASE = "/api/agent-labels";

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
    return api.get<AgentLabel[]>(`${BASE}/agents/${agentId}`);
  },

  async getRules(includeDisabled = true): Promise<AgentLabelRuleResponse[]> {
    return api.get<AgentLabelRuleResponse[]>(`${BASE}/rules`, {
      includeDisabled,
    });
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
    return api.post<AgentLabelRuleResponse>(`${BASE}/rules`, payload);
  },

  async updateRule(
    id: string,
    payload: UpdateAgentLabelRuleRequest,
  ): Promise<AgentLabelRuleResponse> {
    return api.put<AgentLabelRuleResponse>(`${BASE}/rules/${id}`, payload);
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
};
