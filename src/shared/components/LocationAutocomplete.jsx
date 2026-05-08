import { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import usePlacesAutocomplete, { getGeocode, getLatLng } from 'use-places-autocomplete';
import { Input, theme } from '@shared/styles/GlobalStyles';

const AutocompleteWrapper = styled.div`
  position: relative;
  width: 100%;
`;

const SuggestionsList = styled.ul`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 1000;
  margin: ${theme.spacing.xs} 0 0 0;
  padding: 0;
  list-style: none;
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.black};
  border-radius: 4px;
  max-height: 300px;
  overflow-y: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
`;

const SuggestionItem = styled.li`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  cursor: pointer;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  border-bottom: 1px solid ${theme.colors.black};
  transition: background ${theme.transitions.fast};

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: ${theme.colors.gray[100]};
  }

  &.active {
    background: ${theme.colors.gray[100]};
  }
`;

const MainText = styled.div`
  font-weight: ${theme.fontWeights.medium};
`;

const SecondaryText = styled.div`
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  margin-top: 2px;
`;

const ErrorText = styled.div`
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.danger};
  margin-top: ${theme.spacing.xs};
  font-family: ${theme.fonts.mono};
`;

const getFirstMatchingComponent = (components = [], types = []) =>
  components.find(component => types.some(type => component.types.includes(type)));

const splitSecondary = (secondary = '') =>
  secondary.split(',').map(part => part.trim()).filter(Boolean);

const deriveCity = (components, suggestion) => {
  const locality = getFirstMatchingComponent(components, ['locality']);
  if (locality?.long_name) return locality.long_name;

  const postalTown = getFirstMatchingComponent(components, ['postal_town']);
  if (postalTown?.long_name) return postalTown.long_name;

  const adminLevel2 = getFirstMatchingComponent(components, ['administrative_area_level_2']);
  if (adminLevel2?.long_name) return adminLevel2.long_name;

  const primaryTerm = suggestion?.terms?.[0]?.value || suggestion?.structured_formatting?.main_text;
  if (primaryTerm && typeof primaryTerm === 'string') return primaryTerm;

  const adminLevel1 = getFirstMatchingComponent(components, ['administrative_area_level_1']);
  if (adminLevel1?.long_name) return adminLevel1.long_name;

  return '';
};

const deriveCountry = (components, suggestion) => {
  const country = getFirstMatchingComponent(components, ['country']);
  if (country?.long_name) return country.long_name;

  const terms = suggestion?.terms || [];
  if (terms.length > 1) {
    const lastTerm = terms[terms.length - 1]?.value;
    if (lastTerm && typeof lastTerm === 'string') return lastTerm;
  }

  const secondaryParts = splitSecondary(suggestion?.structured_formatting?.secondary_text);
  const lastSecondary = secondaryParts.pop();
  if (lastSecondary) return lastSecondary;

  return '';
};

const buildDisplayName = ({ city, country, suggestion, fallback }) => {
  if (city && country) return `${city}, ${country}`;
  if (city) {
    const secondaryParts = splitSecondary(suggestion?.structured_formatting?.secondary_text);
    const maybeCountry = secondaryParts.pop();
    if (maybeCountry && maybeCountry !== city) return `${city}, ${maybeCountry}`;
    return city;
  }
  if (country) return country;

  const main = suggestion?.structured_formatting?.main_text;
  const secondary = suggestion?.structured_formatting?.secondary_text;
  if (main && secondary) {
    const parts = splitSecondary(secondary);
    const tail = parts.pop();
    if (tail) return `${main}, ${tail}`;
    return `${main}, ${secondary}`;
  }
  return main || fallback || '';
};

const sanitizeNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const waitForGooglePlacesReady = () => new Promise((resolve, reject) => {
  if (typeof window === 'undefined') {
    reject(new Error('Window object unavailable'));
    return;
  }
  const start = Date.now();
  const timeoutMs = 10000;
  (function checkReady() {
    if (window.google?.maps?.places) {
      resolve();
      return;
    }
    if (Date.now() - start > timeoutMs) {
      reject(new Error('Google Places API failed to initialise'));
      return;
    }
    setTimeout(checkReady, 100);
  })();
});

const injectGooglePlacesScript = (apiKey) => new Promise((resolve, reject) => {
  if (typeof document === 'undefined') {
    reject(new Error('Document unavailable'));
    return;
  }

  const existing = document.querySelector('script[data-google-places]');
  if (existing) {
    waitForGooglePlacesReady().then(resolve).catch(reject);
    return;
  }

  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
  script.async = true;
  script.defer = true;
  script.dataset.googlePlaces = 'true';
  script.onload = () => waitForGooglePlacesReady().then(resolve).catch(reject);
  script.onerror = () => reject(new Error('Failed to load Google Places API script'));
  document.head.appendChild(script);
});

const fetchGooglePlacesKey = async () => {
  try {
    const response = await fetch('/api/v1/config/google-places-key', { credentials: 'include' });
    if (!response.ok) return null;
    const data = await response.json();
    if (data?.success && data.key) {
      return data.key;
    }
  } catch (error) {
    console.warn('Failed to fetch Google Places key from config endpoint', error);
  }
  return null;
};

let inlineLoaderPromise = null;

const getInlineGooglePlacesLoader = () => {
  if (inlineLoaderPromise) return inlineLoaderPromise;

  const loaderPromise = (async () => {
    if (typeof window === 'undefined') {
      throw new Error('Window object unavailable');
    }

    if (window.google?.maps?.places) {
      return;
    }

    let apiKey = '';
    if (typeof import.meta !== 'undefined') {
      apiKey = import.meta?.env?.VITE_GOOGLE_PLACES_API_KEY || '';
    }
    if (!apiKey) {
      apiKey = await fetchGooglePlacesKey();
    }
    if (!apiKey) {
      throw new Error('Google Places API key not available');
    }

    await injectGooglePlacesScript(apiKey);
  })();

  inlineLoaderPromise = loaderPromise;
  loaderPromise.catch(() => {
    inlineLoaderPromise = null;
  });

  return loaderPromise;
};

/**
 * LocationAutocompleteInput - Internal component that uses the Google Places hook
 * Only rendered after the Google Maps API is confirmed loaded
 */
function LocationAutocompleteInput({
  value = '',
  onChange,
  placeholder = 'City, Country',
  disabled = false,
  ...inputProps
}) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  const placeTypes = useMemo(() => ['(cities)'], []);

  // Safe to call hook here - script is guaranteed loaded
  const {
    ready,
    value: searchValue,
    suggestions: { status, data },
    setValue,
    clearSuggestions,
  } = usePlacesAutocomplete({
    requestOptions: {
      types: placeTypes,
    },
    debounce: 300,
  });

  // Sync internal search value with external value prop
  useEffect(() => {
    if (value !== searchValue) {
      setValue(value, false);
    }
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInput = (e) => {
    const inputValue = e.target.value;
    setValue(inputValue);
    setIsOpen(true);
    setActiveIndex(-1);

    // If user clears the input, notify parent immediately
    if (!inputValue) {
      onChange?.({
        formatted: '',
        city: '',
        country: '',
        lat: null,
        lng: null,
        raw: '',
        placeId: '',
        description: ''
      });
      return;
    }

    // If hook not ready, allow manual input
    if (!ready) {
      onChange?.({
        formatted: inputValue,
        city: '',
        country: '',
        lat: null,
        lng: null,
        raw: inputValue,
        placeId: '',
        description: inputValue
      });
    }
  };

  const handleSelect = async (suggestion) => {
    const rawAddress = suggestion.description;
    setIsOpen(false);
    clearSuggestions();
    setActiveIndex(-1);

    try {
      // Get detailed place information
      let results = [];
      if (suggestion.place_id) {
        try {
          results = await getGeocode({ placeId: suggestion.place_id });
        } catch (lookupError) {
          console.warn('Failed geocoding by placeId, retrying with address', lookupError);
          results = [];
        }
      }
      if (!results || results.length === 0) {
        results = await getGeocode({ address: rawAddress });
      }
      if (results && results[0]) {
        const { lat, lng } = await getLatLng(results[0]);

        // Parse address components for normalized city/country
        const addressComponents = results[0].address_components;
        const city = deriveCity(addressComponents, suggestion);
        const country = deriveCountry(addressComponents, suggestion);
        const formatted = buildDisplayName({
          city,
          country,
          suggestion,
          fallback: rawAddress
        });

        setValue(formatted, false);

        // Notify parent with normalized data
        onChange?.({
          formatted,
          city,
          country,
          lat: sanitizeNumber(lat),
          lng: sanitizeNumber(lng),
          raw: rawAddress,
          placeId: suggestion.place_id || '',
          description: rawAddress
        });
        return;
      }
    } catch (error) {
      console.error('Error getting geocode:', error);
    }

    const city = deriveCity([], suggestion);
    const country = deriveCountry([], suggestion);
    const fallbackFormatted = buildDisplayName({
      city,
      country,
      suggestion,
      fallback: rawAddress
    });
    setValue(fallbackFormatted, false);
    onChange?.({
      formatted: fallbackFormatted,
      city,
      country,
      lat: null,
      lng: null,
      raw: rawAddress,
      placeId: suggestion.place_id || '',
      description: rawAddress
    });
  };

  const handleKeyDown = (e) => {
    if (!isOpen || data.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => (prev < data.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && data[activeIndex]) {
          handleSelect(data[activeIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
        clearSuggestions();
        break;
      default:
        break;
    }
  };

  const showSuggestions = isOpen && status === 'OK' && data.length > 0;

  return (
    <AutocompleteWrapper ref={wrapperRef}>
      <Input
        value={searchValue}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (data.length > 0) setIsOpen(true);
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        {...inputProps}
      />

      {showSuggestions && (
        <SuggestionsList>
          {data.map((suggestion, index) => {
            const {
              place_id,
              structured_formatting: { main_text, secondary_text },
            } = suggestion;

            return (
              <SuggestionItem
                key={place_id}
                onClick={() => handleSelect(suggestion)}
                className={index === activeIndex ? 'active' : ''}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <MainText>{main_text}</MainText>
                {secondary_text && <SecondaryText>{secondary_text}</SecondaryText>}
              </SuggestionItem>
            );
          })}
        </SuggestionsList>
      )}
    </AutocompleteWrapper>
  );
}

/**
 * LocationAutocomplete - Google Places autocomplete input component
 * Wrapper that handles script loading and conditionally renders the autocomplete input
 *
 * @param {string} value - Current location value
 * @param {function} onChange - Called with normalized location data: { formatted, city, country, lat, lng, raw, placeId }
 * @param {string} placeholder - Input placeholder text
 * @param {boolean} disabled - Disable input
 * @param {object} inputProps - Additional props to pass to the Input component
 */
export default function LocationAutocomplete(props) {
  const [isLoadingScript, setIsLoadingScript] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Load Google Places API on component mount (lazy loading)
  useEffect(() => {
    let mounted = true;

    const loadScript = async () => {
      setIsLoadingScript(true);
      try {
        if (window.loadGooglePlaces) {
          await window.loadGooglePlaces();
        } else {
          await getInlineGooglePlacesLoader();
        }
        if (mounted) {
          setIsLoadingScript(false);
          setLoadError(false);
        }
      } catch (error) {
        console.error('Failed to load Google Places API:', error);
        if (mounted) {
          setIsLoadingScript(false);
          setLoadError(true);
        }
      }
    };

    loadScript();

    return () => {
      mounted = false;
    };
  }, []);

  // Show loading state while script loads
  if (isLoadingScript) {
    return (
      <AutocompleteWrapper>
        <Input
          value={props.value || ''}
          onChange={(e) => {
            // Allow manual input during loading
            const inputValue = e.target.value;
            props.onChange?.({
              formatted: inputValue,
              city: '',
              country: '',
              lat: null,
              lng: null,
              raw: inputValue,
              placeId: '',
              description: inputValue
            });
          }}
          placeholder={props.placeholder || 'City, Country'}
          disabled={props.disabled}
          autoComplete="off"
          {...props.inputProps}
        />
        <ErrorText>Loading location services...</ErrorText>
      </AutocompleteWrapper>
    );
  }

  // Show error state if script failed to load
  if (loadError) {
    return (
      <AutocompleteWrapper>
        <Input
          value={props.value || ''}
          onChange={(e) => {
            // Allow manual input on error
            const inputValue = e.target.value;
            props.onChange?.({
              formatted: inputValue,
              city: '',
              country: '',
              lat: null,
              lng: null,
              raw: inputValue,
              placeId: '',
              description: inputValue
            });
          }}
          placeholder="Location (autocomplete unavailable)"
          disabled={props.disabled}
          autoComplete="off"
          {...props.inputProps}
        />
        <ErrorText style={{ color: '#666' }}>
          Location autocomplete unavailable - you can still type manually
        </ErrorText>
      </AutocompleteWrapper>
    );
  }

  // Script loaded successfully - render full autocomplete component
  return <LocationAutocompleteInput {...props} />;
}
