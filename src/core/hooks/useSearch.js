import { useEffect, useRef, useState, useCallback } from 'react';
import ApiClient from '@core/api/ApiClient';

const DEFAULT_PREVIEW_RESULTS = {
  groups: [],
  intent: 'mixed',
  took_ms: 0
};

const DEFAULT_FULL_RESULTS = {
  results: [],
  secondary_groups: [],
  intent: 'mixed',
  took_ms: 0,
  pagination: { limit: 20, offset: 0, total: 0, has_more: false }
};

export const useSearch = ({ debounceMs = 300, mode = 'preview' } = {}) => {
  const isFullMode = mode === 'full';
  const defaults = isFullMode ? DEFAULT_FULL_RESULTS : DEFAULT_PREVIEW_RESULTS;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState(defaults);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const debounceRef = useRef(null);
  const controllerRef = useRef(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults(defaults);
      setLoading(false);
      setError(null);
      if (controllerRef.current) {
        controllerRef.current.abort();
        controllerRef.current = null;
      }
      return undefined;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    setLoading(true);
    setError(null);

    debounceRef.current = setTimeout(async () => {
      if (controllerRef.current) {
        controllerRef.current.abort();
      }

      controllerRef.current = new AbortController();

      try {
        const response = await ApiClient.search(query, {
          mode,
          signal: controllerRef.current.signal
        });

        if (isFullMode) {
          setResults({
            results: response?.results || [],
            secondary_groups: response?.secondary_groups || [],
            intent: response?.intent || 'mixed',
            took_ms: response?.took_ms ?? 0,
            pagination: response?.pagination || DEFAULT_FULL_RESULTS.pagination,
            success: response?.success ?? true,
            query: response?.query ?? query
          });
        } else {
          setResults({
            groups: response?.groups || [],
            intent: response?.intent || 'mixed',
            took_ms: response?.took_ms ?? 0,
            success: response?.success ?? true,
            query: response?.query ?? query
          });
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          return;
        }
        setError(err);
        setResults(defaults);
      } finally {
        setLoading(false);
      }
    }, debounceMs);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [query, debounceMs, mode]);

  useEffect(() => () => {
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
  }, []);

  return {
    query,
    setQuery,
    results,
    loading,
    error,
    intent: results.intent
  };
};

/**
 * One-shot search for the full search results page.
 * Fetches results once based on provided query/limit/offset, no debouncing.
 */
export const useFullSearch = ({ query: initialQuery, limit, offset }) => {
  const [results, setResults] = useState(DEFAULT_FULL_RESULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const controllerRef = useRef(null);

  const fetchResults = useCallback(async (q, fetchLimit, fetchOffset) => {
    if (!q || !q.trim()) {
      setResults(DEFAULT_FULL_RESULTS);
      setLoading(false);
      return;
    }

    if (controllerRef.current) {
      controllerRef.current.abort();
    }
    controllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const response = await ApiClient.search(q, {
        mode: 'full',
        limit: fetchLimit,
        offset: fetchOffset,
        signal: controllerRef.current.signal
      });

      setResults({
        results: response?.results || [],
        secondary_groups: response?.secondary_groups || [],
        intent: response?.intent || 'mixed',
        took_ms: response?.took_ms ?? 0,
        pagination: response?.pagination || DEFAULT_FULL_RESULTS.pagination,
        success: response?.success ?? true,
        query: response?.query ?? q
      });
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err);
      setResults(DEFAULT_FULL_RESULTS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResults(initialQuery, limit, offset);
  }, [initialQuery, limit, offset, fetchResults]);

  useEffect(() => () => {
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
  }, []);

  return { results, loading, error, refetch: fetchResults };
};

export default useSearch;
