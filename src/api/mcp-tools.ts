import { api } from "./client";

/**
 * Governança das MCP tools (servidor + agente) por escopo.
 * Escopos: global (tudo nulo), client, site ou agent — no máximo um por vez.
 */

export type McpToolScopeLevel = "global" | "client" | "site" | "agent";

export interface McpToolScopeRef {
  clientId?: string | null;
  siteId?: string | null;
  agentId?: string | null;
}

export interface McpToolScope extends McpToolScopeRef {
  level: McpToolScopeLevel;
  isGlobal: boolean;
}

export interface McpToolCatalogItem {
  name: string;
  source: "server" | "agent" | string;
  description: string;
  isEnabled: boolean;
  overriddenHere: boolean;
  locked: boolean;
  maxCallsPerMinute: number;
  timeoutSeconds: number;
  lowerScopeOverrides: number;
  /** Agrupamento exibido/filtrável na tela (ex.: Software, Rede). */
  category: string;
  /** Orientação de "quando usar" (o que a ferramenta faz e em que contexto). */
  whenToUse?: string | null;
  /** Timeout sugerido pela plataforma para a carga desta ferramenta. */
  recommendedTimeoutSeconds: number;
  /** false quando a ferramenta aguarda o usuário e o timeout não é aplicado. */
  timeoutApplies: boolean;
  /**
   * true para capacidades governáveis que NÃO são ferramentas executáveis
   * (ex.: a2ui): não têm rate limit nem timeout — apenas ligar/desligar.
   * Opcional para tolerar versões da API anteriores à exposição do campo;
   * quando ausente, a tela infere por maxCallsPerMinute = 0 + timeoutApplies = false.
   */
  isCapability?: boolean;
}

export interface McpToolCatalog {
  scope: McpToolScope;
  tools: McpToolCatalogItem[];
}

export interface SaveMcpToolPolicyRequest extends McpToolScopeRef {
  isEnabled: boolean;
  maxCallsPerMinute?: number | null;
  timeoutSeconds?: number | null;
  locked: boolean;
}

const BASE = "/api/v1/mcp-tools";

function scopeQuery(scope: McpToolScopeRef, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(extra);
  if (scope.agentId) params.set("agentId", scope.agentId);
  else if (scope.siteId) params.set("siteId", scope.siteId);
  else if (scope.clientId) params.set("clientId", scope.clientId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const mcpToolsApi = {
  catalog: (scope: McpToolScopeRef) =>
    api.get<McpToolCatalog>(`${BASE}${scopeQuery(scope)}`),

  save: (toolName: string, body: SaveMcpToolPolicyRequest) =>
    api.put<McpToolCatalog>(`${BASE}/${encodeURIComponent(toolName)}`, body),

  reset: (toolName: string, scope: McpToolScopeRef) =>
    api.del<McpToolCatalog>(`${BASE}/${encodeURIComponent(toolName)}${scopeQuery(scope)}`),

  impact: (toolName: string, scope: McpToolScopeRef) =>
    api.get<{ lowerScopeOverrides: number }>(
      `${BASE}/${encodeURIComponent(toolName)}/impact${scopeQuery(scope)}`,
    ),
};
