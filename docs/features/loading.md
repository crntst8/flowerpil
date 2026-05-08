# Loading Performance

## Purpose

Optimizes first paint by deferring module loading, caching authentication state, and providing bootstrap payload for immediate site settings and genre data access.

## How It Works

Module loading uses manifest-based lazy loading where each module exports manifest.js containing module metadata (id, routes, feature flags). The client bootstrap consumes manifest metadata only and defers actual chunk download until route activation. The loader refuses registration for modules without manifests.

AuthProvider reads cached auth snapshot from sessionStorage and schedules `/api/v1/auth/status` check via requestIdleCallback for background refresh. Force immediate refresh with auth.checkAuthStatus({ force: true }) when screen requires current state.

SiteSettingsProvider hydrates from bootstrap payload injected into window.__FLOWERPIL_BOOTSTRAP__ in index.html, supplemented by sessionStorage cache for repeat loads. Background refresh updates settings without blocking render.

Bootstrap API at `/api/v1/bootstrap` returns `{ siteSettings, genres }` bundle. fetchBootstrapData() in `@shared/services/bootstrapService` guarantees single network request using promise deduplication pattern.

Home feed renders 12 items for first view with skeleton rows, then prefetches full feed during browser idle time. Feed UI maintains O(n) complexity on rendered cards rather than entire dataset.

## API/Interface

**GET /api/v1/bootstrap**

Returns combined site settings and genre categories.

**Response:**
```json
{
  "siteSettings": {
    "hide_curator_type_sitewide": { "enabled": false }
  },
  "genres": [
    { "id": 1, "name": "Electronic", "slug": "electronic" }
  ]
}
```

**fetchBootstrapData:**
```javascript
import { fetchBootstrapData } from '@shared/services/bootstrapService';

// Guarantees single request even if called multiple times
const { siteSettings, genres } = await fetchBootstrapData();
```

**auth.checkAuthStatus:**
```javascript
const { checkAuthStatus } = useAuth();

// Force immediate auth refresh (bypasses idle callback)
await checkAuthStatus({ force: true });
```

## Database

No direct database interaction. Bootstrap endpoint aggregates data from existing tables (admin_system_config for siteSettings, genre_categories for genres).

## Integration Points

### Internal Dependencies

- **bootstrapService** (`src/shared/services/bootstrapService.js`) - Bootstrap data fetching with deduplication
- **AuthProvider** (`src/shared/contexts/AuthContext.jsx`) - sessionStorage caching and idle callback scheduling
- **SiteSettingsProvider** (`src/shared/contexts/SiteSettingsContext.jsx`) - Bootstrap payload hydration
- **Module manifests** (`src/modules/about/manifest.js`, `src/modules/admin/manifest.js`, `src/modules/bio/manifest.js`, `src/modules/blog/manifest.js`, `src/modules/common/manifest.js`, `src/modules/curator/manifest.js`, `src/modules/curators/manifest.js`, `src/modules/home/manifest.js`, `src/modules/playlists/manifest.js`, `src/modules/releases/manifest.js`, `src/modules/top10/manifest.js`) - Lazy loading metadata

### External Dependencies

- **requestIdleCallback** - Browser API for scheduling low-priority work
- **sessionStorage** - Client-side caching layer

### Bootstrap Injection

From `index.html`:

```html
<script>
  window.__FLOWERPIL_BOOTSTRAP__ = {
    siteSettings: {},
    genres: []
  };
</script>
```

## Configuration

No environment variables required. Performance optimizations are built into client architecture.

**Build Configuration:**
- Vite code splitting enabled
- Module manifests required for registration
- Bootstrap payload inlined in HTML

## Usage Examples

### Adding New Module

From module manifest pattern:

```javascript
export default {
  id: 'newfeature',
  routes: ['/newfeature'],
  featureFlags: [],
  component: () => import('./NewFeature.jsx')
};
```

### Extending Bootstrap Payload

When adding site-wide settings:

```javascript
// 1. Extend bootstrap API endpoint
// server/api/bootstrap.js
router.get('/bootstrap', (req, res) => {
  const siteSettings = getSiteSettings(); // Add new settings here
  const genres = getGenres();
  res.json({ siteSettings, genres });
});

// 2. Update SiteSettingsProvider defaults
// src/shared/contexts/SiteSettingsContext.jsx
const defaultSettings = {
  hide_curator_type_sitewide: { enabled: false },
  new_setting: { enabled: false } // Add default
};
```

### Forcing Auth Refresh

From component requiring current auth state:

```javascript
import { useAuth } from '@shared/contexts/AuthContext';

function SecureComponent() {
  const { checkAuthStatus } = useAuth();

  useEffect(() => {
    // Force immediate check on mount
    checkAuthStatus({ force: true });
  }, [checkAuthStatus]);

  return <div>Secure content</div>;
}
```

### Accessing Bootstrap Data

From `src/shared/services/bootstrapService.js`:

```javascript
let bootstrapPromise = null;

export async function fetchBootstrapData() {
  // Deduplication - reuse in-flight request
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    // Check session cache first
    const cached = sessionStorage.getItem('bootstrap_data');
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < 5 * 60 * 1000) { // 5min TTL
        return data;
      }
    }

    // Fetch fresh data
    const response = await fetch('/api/v1/bootstrap');
    const data = await response.json();

    // Cache for next time
    sessionStorage.setItem('bootstrap_data', JSON.stringify({
      data,
      timestamp: Date.now()
    }));

    return data;
  })();

  return bootstrapPromise;
}
```

### Home Feed Lazy Loading

From home page component:

```javascript
const [playlists, setPlaylists] = useState([]);
const [initialLoad, setInitialLoad] = useState(true);

useEffect(() => {
  // Load first 12 items immediately
  fetchPlaylists({ limit: 12 }).then(setPlaylists);
  setInitialLoad(false);

  // Prefetch full feed when idle
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      fetchPlaylists({ limit: 100 }).then(setPlaylists);
    });
  }
}, []);
```
