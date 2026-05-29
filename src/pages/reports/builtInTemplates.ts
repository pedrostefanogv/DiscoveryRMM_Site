export const BUILT_IN_TEMPLATE_ID_BY_SLUG: Record<string, string> = {
  "device-software-labels": "a0000001-0000-0000-0000-000000000001",
  "labels-to-agents": "a0000001-0000-0000-0000-000000000002",
  "software-by-machine": "a0000001-0000-0000-0000-000000000003",
  "hardware-inventory": "a0000001-0000-0000-0000-000000000004",
  "os-distribution": "a0000001-0000-0000-0000-000000000005",
  "site-overview": "a0000001-0000-0000-0000-000000000006",
  "automation-by-device": "a0000001-0000-0000-0000-000000000007",
  "tickets-by-device": "a0000001-0000-0000-0000-000000000008",
};

export function resolveBuiltInTemplateId(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return BUILT_IN_TEMPLATE_ID_BY_SLUG[slug] ?? null;
}

export function buildRunReportPath(templateId: string, clientId?: string): string {
  const params = new URLSearchParams();
  params.set("templateId", templateId);
  if (clientId) params.set("clientId", clientId);

  const query = params.toString();
  return query.length > 0 ? `/reports/run?${query}` : "/reports/run";
}
