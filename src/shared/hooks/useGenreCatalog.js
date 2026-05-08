import { useEffect, useMemo, useState, useCallback } from 'react';
import { getGenreCatalog } from '@shared/services/genreCatalogService';

export const useGenreCatalog = () => {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async ({ force = false } = {}) => {
    try {
      setLoading(true);
      setError('');
      const data = await getGenreCatalog({ force });
      setCatalog(data);
    } catch (err) {
      setError(err?.message || 'Failed to load genres');
      setCatalog([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load({ force: false });
  }, [load]);

  const colorMap = useMemo(() => {
    return catalog.reduce((acc, category) => {
      if (category?.id) {
        acc[category.id] = category.color || '#888888';
      }
      return acc;
    }, {});
  }, [catalog]);

  return {
    catalog,
    colorMap,
    loading,
    error,
    refresh: load
  };
};
