import { api } from "./client";

// ── Types ──────────────────────────────────────────────

export interface UniversalSearchResult {
  groups: SearchResultGroup[];
  totalResults: number;
  generatedAtUtc: string; // ISO 8601
}

export interface SearchResultGroup {
  entityType: string; // "agents" | "clients" | "sites" | "tickets" | "software"
  label: string;
  icon: string;
  items: SearchResultItem[];
}

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  entityType: string;
  clientId: string | null;
  clientName: string | null;
  siteId: string | null;
  siteName: string | null;
  url: string;
}

// ── API ────────────────────────────────────────────────

const BASE = "/api/v1/search";

export const searchApi = {
  search: (q: string, maxResults = 10) =>
    api.get<UniversalSearchResult>(BASE, {
      q: q.trim(),
      maxResults: Math.min(Math.max(maxResults, 1), 25),
    }),
};
