import { useCallback, useEffect, useRef, useState } from "react";
import { searchApi, type UniversalSearchResult } from "@/api";

interface UseSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  results: UniversalSearchResult | null;
  loading: boolean;
  error: string | null;
  clear: () => void;
}

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;
const DEFAULT_MAX_RESULTS = 5;

export function useSearch(): UseSearchReturn {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UniversalSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    setQuery("");
    setResults(null);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Limpa timer anterior
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Aborta request anterior se ainda estiver pendente
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    const trimmed = query.trim();

    // Menos de 2 caracteres → limpa resultados
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const data = await searchApi.search(trimmed, DEFAULT_MAX_RESULTS);

        // Se o componente foi desmontado ou a query mudou, ignora
        if (controller.signal.aborted) return;

        setResults(data);
        setLoading(false);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (controller.signal.aborted) return;

        setResults(null);
        setError("Erro ao realizar a busca.");
        setLoading(false);
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [query]);

  return { query, setQuery, results, loading, error, clear };
}
