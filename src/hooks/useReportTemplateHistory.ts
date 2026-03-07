import { useEffect, useState } from "react";

const HISTORY_KEY = "meduza_report_template_history";
const MAX_HISTORY_ITEMS = 200;

export type ReportTemplateHistoryAction =
  | "created"
  | "updated"
  | "deleted"
  | "imported"
  | "exported"
  | "favorited"
  | "unfavorited";

export interface ReportTemplateHistoryEntry {
  id: string;
  action: ReportTemplateHistoryAction;
  templateId: string;
  templateName: string;
  timestamp: string;
  actor: string;
  details?: string;
}

export function useReportTemplateHistory() {
  const [history, setHistory] = useState<ReportTemplateHistoryEntry[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as ReportTemplateHistoryEntry[];
      setHistory(parsed);
    } catch {
      setHistory([]);
    }
  }, []);

  const persist = (entries: ReportTemplateHistoryEntry[]) => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
    setHistory(entries);
  };

  const addEntry = (
    action: ReportTemplateHistoryAction,
    payload: {
      templateId: string;
      templateName: string;
      actor?: string;
      details?: string;
    },
  ) => {
    const next: ReportTemplateHistoryEntry = {
      id: crypto.randomUUID(),
      action,
      templateId: payload.templateId,
      templateName: payload.templateName,
      timestamp: new Date().toISOString(),
      actor: payload.actor ?? "user@example.com",
      details: payload.details,
    };

    const merged = [next, ...history].slice(0, MAX_HISTORY_ITEMS);
    persist(merged);
  };

  const clearHistory = () => {
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
  };

  return {
    history,
    addEntry,
    clearHistory,
  };
}
