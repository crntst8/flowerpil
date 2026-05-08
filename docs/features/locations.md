# Location Normalization System

## Purpose

Provides Google Places autocomplete for curator profiles with normalized city/country data, coordinates, and place IDs. Supports both build-time and runtime API key injection for flexible deployment.

## How It Works

Environment wiring checks VITE_GOOGLE_PLACES_API_KEY from Vite build environment or fetches from /api/v1/config/google-places-key endpoint which reads VITE_GOOGLE_PLACES_API_KEY, GOOGLE_PLACES_API_KEY, GOOGLE_PLACES_KEY, or MAPS_API_KEY from server environment (checked in order).

Script bootstrap in index.html:90 attempts to read import.meta.env.VITE_GOOGLE_PLACES_API_KEY. If empty, performs GET /api/v1/config/google-places-key with credentials to pull key from Node process. Once key is available, creates script tag loading https://maps.googleapis.com/maps/api/js?key=...&libraries=places. Guards against double-injection by checking data-google-places attribute on existing scripts. Dev builds log warning if key cannot be resolved, keeping field disabled.

LocationAutocomplete component (`src/shared/components/LocationAutocomplete.jsx`) uses use-places-autocomplete hook with types: ['(cities)'] to bias towards city-level matches. Handles keyboard navigation, debouncing (300ms), suggestion list styling. On selection, tries getGeocode({ placeId }), falls back to getGeocode({ address }) if placeId lookup fails.

Normalization extracts city from locality, postal_town, or admin_area_level_2 components, falls back to main suggestion term. Country extracted from country component, falls back to last suggestion term/secondary text. Formatted display always City, Country when both exist, with smart fallbacks when only one part available.

Emits structured object: formatted (display string), city (normalized), country (normalized), lat/lng coordinates, raw (original suggestion), placeId (Google identifier). Curator profile persists under custom_fields.location_details JSON column.

CuratorSignup (`src/modules/curator/components/CuratorSignup.jsx`) maintains location (formatted string) and locationDetails (structured payload) state. Initial signup sends location string in /api/v1/auth/curator/signup. Follow-up profile save (PUT /api/v1/curator/profile) writes custom_fields.location_details with structured object, merging with existing custom fields.

CuratorProfilePage (`src/modules/curator/components/CuratorProfilePage.jsx`) parses curator.custom_fields on load, prefills input with c.location or custom.location_details.formatted, stores custom_fields in component state for merging. On change, handleLocationChange updates both display string and custom_fields.location_details. Save stringifies merged custom_fields for PUT /api/v1/curator/profile.

## API/Interface

### Config Endpoint

```
GET /api/v1/config/google-places-key
```

Returns Google Places API key when Vite environment variable unavailable.

**Response:**
```json
{
  "success": true,
  "key": "AIzaSy..."
}
```

Returns 404 if no key found:
```json
{
  "success": false
}
```

From `server/api/config.js`:

```javascript
router.get('/google-places-key', (_req, res) => {
  const apiKey =
    process.env.VITE_GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_PLACES_KEY ||
    process.env.MAPS_API_KEY ||
    '';

  if (!apiKey) return res.status(404).json({ success: false });
  res.json({ success: true, key: apiKey });
});
```

### Component Interface

**LocationAutocomplete:**
```javascript
<LocationAutocomplete
  value={location}
  onChange={(data) => {
    // data structure:
    // {
    //   formatted: 'Melbourne, Australia',
    //   city: 'Melbourne',
    //   country: 'Australia',
    //   lat: -37.8136,
    //   lng: 144.9631,
    //   raw: 'Melbourne VIC, Australia',
    //   placeId: 'ChIJ0T3i4ODd1moR8Sn9n...'
    // }
  }}
  placeholder="City, Country"
  disabled={false}
/>
```

## Database

Location data stored in curators.custom_fields JSON column:

```json
{
  "profile_featured_links": {},
  "location_details": {
    "formatted": "Berlin, Germany",
    "city": "Berlin",
    "country": "Germany",
    "lat": 52.52,
    "lng": 13.405,
    "raw": "Berlin, Germany",
    "placeId": "ChIJAVkDPzdOqEcRcDteW0YgIQQ"
  }
}
```

Database schema (`server/database/db.js`) stores custom_fields as TEXT column (JSON payload). No migrations required - existing curators without field simply lack the key.

## Integration Points

### Internal Dependencies

- **LocationAutocomplete** (`src/shared/components/LocationAutocomplete.jsx`) - Reusable autocomplete component
- **CuratorSignup** (`src/modules/curator/components/CuratorSignup.jsx`) - Onboarding integration at step 2
- **CuratorProfilePage** (`src/modules/curator/components/CuratorProfilePage.jsx`) - Dashboard editor integration
- **index.html** - Script injection logic at line 90
- `server/api/config.js` - Exposes API key to SPA
- `server/index.js` - Mounts config route

### External Dependencies

- **Google Maps JavaScript API** - Script injection for global google object
- **use-places-autocomplete** - React hook (npm package) with built-in 300ms debouncing
- **Google Places API** - Autocomplete service
- **Google Geocoding API** - Place details and coordinates

### Script Injection

From `index.html`:90:

```html
<script>
  let apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    fetch('/api/v1/config/google-places-key', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          apiKey = data.key;
          injectScript();
        }
      });
  } else {
    injectScript();
  }

  function injectScript() {
    if (apiKey && !document.querySelector('[data-google-places]')) {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.dataset.googlePlaces = 'true';
      document.head.appendChild(script);
    }
  }
</script>
```

## Configuration

### Environment Variables

**VITE_GOOGLE_PLACES_API_KEY**
- Google Places API key
- Injected at build time (Vite) or runtime (server fallback)
- No default - component disabled if missing

**Alternative server-side names:**
- GOOGLE_PLACES_API_KEY
- GOOGLE_PLACES_KEY
- MAPS_API_KEY

Only one variable needs to be set - runtime checks list in order.

### Deployment Configuration

**Local development:**
Add VITE_GOOGLE_PLACES_API_KEY to .env file, run npm run dev.

**PM2 production:**
Export VITE_GOOGLE_PLACES_API_KEY or GOOGLE_PLACES_API_KEY in /etc/environment before pm2 start. PM2 inherits variables on boot.

**Cloudflare Pages:**
Set VITE_GOOGLE_PLACES_API_KEY in project environment variables for build-time injection.

**Fallback:**
When Vite env var missing (frontend bundled separately from PM2), SPA requests /api/v1/config/google-places-key which returns server-side key.

## Usage Examples

### Signup Integration

From `src/modules/curator/components/CuratorSignup.jsx`:

```javascript
const [location, setLocation] = useState('');
const [locationDetails, setLocationDetails] = useState(null);

<LocationAutocomplete
  value={location}
  onChange={(data) => {
    setLocation(data.formatted);
    setLocationDetails(data);
  }}
  placeholder="City, Country"
/>

// Initial signup
await fetch('/api/v1/auth/curator/signup', {
  method: 'POST',
  body: JSON.stringify({ location }) // String only
});

// Profile save
await fetch('/api/v1/curator/profile', {
  method: 'PUT',
  body: JSON.stringify({
    custom_fields: {
      location_details: locationDetails
    }
  })
});
```

### Profile Editor Integration

From `src/modules/curator/components/CuratorProfilePage.jsx`:

```javascript
const [location, setLocation] = useState('');
const [customFields, setCustomFields] = useState({});

useEffect(() => {
  const custom = JSON.parse(curator.custom_fields || '{}');
  setLocation(curator.location || custom.location_details?.formatted || '');
  setCustomFields(custom);
}, [curator]);

const handleLocationChange = (data) => {
  setLocation(data.formatted);
  setCustomFields({
    ...customFields,
    location_details: data
  });
};

const handleSave = async () => {
  await fetch('/api/v1/curator/profile', {
    method: 'PUT',
    body: JSON.stringify({
      location: location,
      custom_fields: JSON.stringify(customFields)
    })
  });
};
```

### Error Handling

```javascript
useEffect(() => {
  const handleGeocodeFailure = (error) => {
    console.error('Geocode error:', error);
    // Fall back to best-effort formatting using suggestion text
    onChange({
      formatted: suggestionText,
      city: extractCity(suggestionText),
      country: extractCountry(suggestionText),
      lat: null,
      lng: null,
      raw: suggestionText,
      placeId: null
    });
  };
}, []);
```

### City/Country Extraction

From `src/shared/components/LocationAutocomplete.jsx`:

```javascript
const normalizeLocation = (result) => {
  const addressComponents = result.address_components;

  // City extraction priority
  const city =
    addressComponents.find(c => c.types.includes('locality'))?.long_name ||
    addressComponents.find(c => c.types.includes('postal_town'))?.long_name ||
    addressComponents.find(c => c.types.includes('admin_area_level_2'))?.long_name ||
    result.structured_formatting?.main_text;

  // Country extraction
  const country =
    addressComponents.find(c => c.types.includes('country'))?.long_name ||
    result.structured_formatting?.secondary_text?.split(',').pop()?.trim();

  // Formatted display
  const formatted = city && country
    ? `${city}, ${country}`
    : city || country || result.description;

  return { city, country, formatted };
};
```
