import { useEffect, useState } from 'react';
import ApiClient from '@core/api/ApiClient';

export const useSearchSuggestions = ({ limit = 4 } = {}) => {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    ApiClient.searchSuggestions(limit)
      .then((response) => {
        if (!isMounted) return;
        const normalized = Array.isArray(response?.items)
          ? response.items.map(item => ({
              id: item.id ?? null,
              title: item.title ?? '',
              description: item.description ?? '',
              image_url: item.image_url ?? item.imageUrl ?? null,
              preset_query: item.preset_query ?? item.presetQuery ?? null,
              target_url: item.target_url ?? item.targetUrl ?? null
            }))
          : [];
        setSuggestions(normalized);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err);
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [limit]);

  return { suggestions, loading, error };
};

export default useSearchSuggestions;
