import { cacheService, cachedFetch } from '@shared/services/cacheService';
import { safeJson } from '@shared/utils/jsonUtils';
import { fetchBootstrapData, getBootstrapSnapshot } from '@shared/services/bootstrapService';

let inflightGenreRequest = null;

const hydrateFromBootstrap = () => {
  const snapshot = getBootstrapSnapshot();
  const genres = snapshot?.genres;
  if (Array.isArray(genres) && genres.length) {
    cacheService.setCachedGenres(genres);
    return genres;
  }
  return null;
};

export const getGenreCatalog = async ({ force = false } = {}) => {
  if (!force) {
    const cached = cacheService.getCachedGenres();
    if (cached) {
      return cached;
    }

     const primed = hydrateFromBootstrap();
     if (primed) {
       return primed;
     }
  }

  if (!force) {
    try {
      const bootstrapData = await fetchBootstrapData();
      const genresFromBootstrap = bootstrapData?.genres;
      if (Array.isArray(genresFromBootstrap) && genresFromBootstrap.length) {
        cacheService.setCachedGenres(genresFromBootstrap);
        return genresFromBootstrap;
      }
    } catch (error) {
      if (import.meta.env?.DEV) {
        console.warn('[GenreCatalog] Bootstrap fetch failed, falling back to API', error);
      }
    }
  }

  if (!inflightGenreRequest) {
    inflightGenreRequest = (async () => {
      const response = await cachedFetch('/api/v1/genre-categories');
      const data = await safeJson(response, {
        context: 'Fetch genre categories',
        fallbackValue: { categories: [] }
      });

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load genres');
      }

      const categories = Array.isArray(data.categories) ? data.categories : [];
      cacheService.setCachedGenres(categories);
      return categories;
    })().finally(() => {
      inflightGenreRequest = null;
    });
  }

  return inflightGenreRequest;
};

export const getGenreColorMap = async (options) => {
  const catalog = await getGenreCatalog(options);
  return catalog.reduce((acc, category) => {
    if (category?.id) {
      acc[category.id] = category.color || '#000000';
    }
    return acc;
  }, {});
};

export const searchGenres = async (term = '') => {
  const catalog = await getGenreCatalog();
  const normalized = term.trim().toLowerCase();
  if (!normalized) {
    return catalog;
  }

  return catalog.filter(category => (
    category.label?.toLowerCase().includes(normalized) ||
    category.id?.toLowerCase().includes(normalized)
  ));
};

export const clearGenreCatalogCache = () => {
  cacheService.clearGenreCache();
};
