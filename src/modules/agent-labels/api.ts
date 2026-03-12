import {
  AgentLabel,
  AgentLabelRuleDryRunRequest,
  AgentLabelRuleDryRunResponse,
  AgentLabelRuleResponse,
  CreateAgentLabelRuleRequest,
  UpdateAgentLabelRuleRequest,
} from "./types";

const BASE = "/api/agent-labels";

async function toJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw { status: res.status, ...payload };
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export const agentLabelsApi = {
  async getAgentLabels(agentId: string): Promise<AgentLabel[]> {
    const res = await fetch(`${BASE}/agents/${agentId}`);
    return toJson<AgentLabel[]>(res);
  },

  async getRules(includeDisabled = true): Promise<AgentLabelRuleResponse[]> {
    const res = await fetch(`${BASE}/rules?includeDisabled=${includeDisabled}`);
    return toJson<AgentLabelRuleResponse[]>(res);
  },

  async createRule(
    payload: CreateAgentLabelRuleRequest,
  ): Promise<AgentLabelRuleResponse> {
    const res = await fetch(`${BASE}/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    return toJson<AgentLabelRuleResponse>(res);
  },

  async updateRule(
    id: string,
    payload: UpdateAgentLabelRuleRequest,
  ): Promise<AgentLabelRuleResponse> {
    const res = await fetch(`${BASE}/rules/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    return toJson<AgentLabelRuleResponse>(res);
  },

  async deleteRule(id: string): Promise<void> {
    const res = await fetch(`${BASE}/rules/${id}`, { method: "DELETE" });
    await toJson<void>(res);
  },

  async reprocessAll(): Promise<{ message: string }> {
    const res = await fetch(`${BASE}/reprocess`, { method: "POST" });
    return toJson<{ message: string }>(res);
  },

  async dryRun(
    payload: AgentLabelRuleDryRunRequest,
  ): Promise<AgentLabelRuleDryRunResponse> {
    const res = await fetch(`${BASE}/rules/dry-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    return toJson<AgentLabelRuleDryRunResponse>(res);
  },
};
