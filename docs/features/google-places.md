# Google Places API Integration

## Purpose

Provides location autocomplete and normalization for curator profiles using Google Places Autocomplete API. Returns structured location data with city, country, coordinates, and place ID for consistent formatting and future geographic features.

## How It Works

LocationAutocomplete component (`src/shared/components/LocationAutocomplete.jsx`) wraps use-places-autocomplete library with 300ms built-in debouncing. The component initializes when VITE_GOOGLE_PLACES_API_KEY is available, either from Vite environment variable baked into build or via fallback fetch to `/api/v1/config/google-places-key` which returns server-side key.

Google Maps JavaScript API script is injected automatically into document head when key is present. If key is missing, component stays disabled and logs warning in dev builds.

User typing triggers Places Autocomplete API request to Google with query string and types filter set to (cities). Selecting suggestion triggers Geocoding API call to fetch full place details including normalized city/country names from address_components, latitude/longitude coordinates via getLatLng(), and Google place ID.

Component returns structured object with formatted string (display), normalized city and country fields extracted from address_components array, coordinates, placeId, and raw description. Curator profile persists this under custom_fields.location_details JSON column for consistent location formatting across profiles and regional analytics.

## API/Interface

### Public Config Endpoint

```
GET /api/v1/config/google-places-key
```

Returns Google Places API key when VITE_GOOGLE_PLACES_API_KEY is unavailable from build-time environment.

**Response:**
```json
{
  "key": "AIzaSy..."
}
```

### Component Props

**LocationAutocomplete:**
```javascript
{
  value: string,
  onChange: function,  // Called with location data object
  placeholder: string,
  disabled: boolean
}
```

**onChange callback receives:**
```javascript
{
  formatted: "Berlin, Germany",
  city: "Berlin",
  country: "Germany",
  lat: 52.52,
  lng: 13.405,
  placeId: "ChIJAVkDPzdOqEcRcDteW0YgIQQ",
  raw: "Berlin, Germany"
}
```

## Database

Location data stored in curators.custom_fields JSON column:

```sql
custom_fields: {
  "location_details": {
    "formatted": "Berlin, Germany",
    "city": "Berlin",
    "country": "Germany",
    "lat": 52.52,
    "lng": 13.405,
    "placeId": "ChIJAVkDPzdOqEcRcDteW0YgIQQ",
    "raw": "Berlin, Germany"
  }
}
```

## Integration Points

### Internal Dependencies

- **LocationAutocomplete** (`src/shared/components/LocationAutocomplete.jsx`) - Main component
- **use-places-autocomplete** - React hook for Google Places integration with debouncing
- **CuratorSignup** (`src/modules/curator/components/CuratorSignup.jsx`:729-734) - Step 2 profile setup
- **CuratorProfilePage** (`src/modules/curator/components/CuratorProfilePage.jsx`:556-563) - Identity section

### External Dependencies

- **Google Maps JavaScript API** - Script injection for global google object
- **Google Places API** - Autocomplete and place details
- **Google Geocoding API** - Coordinate and normalized address data

### Required Google Cloud APIs

Enable in Google Cloud Console > APIs & Services > Library:
- Places API
- Geocoding API
- Maps JavaScript API

## Configuration

### Environment Variables

**VITE_GOOGLE_PLACES_API_KEY**
- Google Places API key
- Injected at build time (Vite) or runtime (server fallback)
- No default - component disabled if missing
- Alternative server-side name: GOOGLE_PLACES_API_KEY

**Deployment-specific configuration:**
- Local development: Add to `.env` file
- Production PM2: Export in `/etc/environment` before pm2 start
- Cloudflare Pages: Set in project environment variables for build-time injection

### API Key Restrictions

**Application restrictions (HTTP referrers):**
```
https://flowerpil.io/*
https://*.flowerpil.io/*
http://localhost:*
```

**API restrictions:**
Restrict to: Places API, Geocoding API, Maps JavaScript API only

### Google Cloud Billing

Billing must be enabled on GCP project even for free tier usage.

**Pricing:**
- $200 free credit per month
- Covers ~28,000 Autocomplete requests
- Beyond free tier: ~$2.83 per 1,000 requests

**Built-in optimizations:**
- 300ms debouncing via use-places-autocomplete library
- Requests only triggered after user types
- Types filter set to (cities) reduces result scope

## Usage Examples

### Component Usage

From `src/modules/curator/components/CuratorSignup.jsx`:729-734:

```javascript
import LocationAutocomplete from '@shared/components/LocationAutocomplete';

<LocationAutocomplete
  value={location}
  onChange={(data) => {
    setLocation(data.formatted);
    setLocationDetails(data); // Store full object
  }}
  placeholder="City, Country"
  disabled={false}
/>
```

### Accessing Normalized Data

```javascript
const handleLocationChange = (data) => {
  console.log(data.city);       // "Berlin"
  console.log(data.country);    // "Germany"
  console.log(data.lat);        // 52.52
  console.log(data.lng);        // 13.405
  console.log(data.placeId);    // "ChIJAVkDPzdOqEcRcDteW0YgIQQ"
  console.log(data.formatted);  // "Berlin, Germany"
};
```

### Persisting to Database

```javascript
const updateCuratorProfile = async (location) => {
  await fetch('/api/v1/curator/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: location.formatted,
      custom_fields: {
        location_details: location
      }
    })
  });
};
```

### Script Injection Pattern

From `src/shared/components/LocationAutocomplete.jsx`:

```javascript
useEffect(() => {
  let apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    // Fallback to server-side key
    fetch('/api/v1/config/google-places-key')
      .then(res => res.json())
      .then(data => apiKey = data.key)
      .catch(() => console.warn('Google Places API key not available'));
  }

  if (apiKey && !window.google) {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    document.head.appendChild(script);
  }
}, []);
```

### use-places-autocomplete Hook

```javascript
import usePlacesAutocomplete, {
  getGeocode,
  getLatLng
} from 'use-places-autocomplete';

const {
  ready,
  value,
  suggestions: { status, data },
  setValue,
  clearSuggestions
} = usePlacesAutocomplete({
  requestOptions: {
    types: ['(cities)']
  },
  debounce: 300
});

const handleSelect = async (address) => {
  setValue(address, false);
  clearSuggestions();

  try {
    const results = await getGeocode({ address });
    const { lat, lng } = await getLatLng(results[0]);

    const addressComponents = results[0].address_components;
    const city = addressComponents.find(c =>
      c.types.includes('locality'))?.long_name;
    const country = addressComponents.find(c =>
      c.types.includes('country'))?.long_name;

    onChange({
      formatted: address,
      city,
      country,
      lat,
      lng,
      placeId: results[0].place_id,
      raw: address
    });
  } catch (error) {
    console.error('Error fetching geocode:', error);
  }
};
```

### Address Component Extraction

```javascript
const extractCityCountry = (addressComponents) => {
  const city = addressComponents.find(component =>
    component.types.includes('locality')
  )?.long_name;

  const country = addressComponents.find(component =>
    component.types.includes('country')
  )?.long_name;

  return { city, country };
};
```
