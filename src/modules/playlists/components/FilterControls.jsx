import React from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

const FilterControlsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.lg};
  padding: ${theme.spacing.md};
  border: ${theme.borders.dashed} ${theme.colors.black};
  border-radius: 4px;
  background: ${theme.colors.fpwhiteIn};

  @media (max-width: ${theme.breakpoints.tablet}) {
    padding: ${theme.spacing.md};
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    gap: ${theme.spacing.sm};
    padding: ${theme.spacing.sm};
  }
`;

const SearchRow = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
  align-items: flex-start;

  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;
  }
`;

const FilterToggleRow = styled.div`
  display: none;

  @media (max-width: ${theme.breakpoints.mobile}) {
    display: flex;
    justify-content: flex-end;
  }
`;

const FilterRow = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
  align-items: flex-start;

  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;
  }
`;

const SearchInput = styled.input.withConfig({
  shouldForwardProp: (prop) => !['hasValue'].includes(prop)
})`
  flex: 1 1 320px;
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.dashed} ${theme.colors.black};
  border-radius: 4px;
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  letter-spacing: 0.02em;
  line-height: 1.2;
  min-height: 34px;

  &::placeholder {
    color: rgba(0, 0, 0, 0.5);
  }
  
  &:focus {
    outline: none;
    border-color: ${theme.colors.blackAct};
    box-shadow: 0 0 0 2px ${theme.colors.yellow};
  }
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    width: 100%;
    min-height: 30px;
    padding: ${theme.spacing.xs};
    font-size: ${theme.fontSizes.tiny};
    flex: none;
    flex-basis: auto;
  }
`;

const FilterSelect = styled.select`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.dashed} ${theme.colors.black};
  border-radius: 4px;
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  min-width: 150px;
  flex: 1 1 150px;
  cursor: pointer;
  appearance: none;
  line-height: 1.2;
  min-height: 34px;
  
  option {
    background: ${theme.colors.fpwhite};
    color: ${theme.colors.black};
  }
  
  &:focus {
    outline: none;
    border-color: ${theme.colors.blackAct};
    box-shadow: 0 0 0 2px ${theme.colors.yellow};
  }
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    width: 100%;
    min-width: unset;
    flex: none;
    flex-basis: auto;
    min-height: 30px;
    font-size: ${theme.fontSizes.tiny};
    padding: ${theme.spacing.xs};
  }
`;

const GenreFilterContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const GenreInputRow = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
  align-items: center;
`;

const GenreInput = styled(SearchInput)`
  max-width: 240px;
  flex: 1;
`;

const AddGenreButton = styled.button`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border: ${theme.borders.solid} ${theme.colors.black};
  border-radius: 4px;
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: background ${theme.transitions.fast};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 116px;
  
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  
  &:not(:disabled):hover {
    background: ${theme.colors.yellow};
  }
`;

const GenreChipList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
`;

const GenreChip = styled.span.withConfig({ shouldForwardProp: (prop) => prop !== '$color' })`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border: ${theme.borders.solidThin} ${props => props.$color || theme.colors.black};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 3px;
  background: ${theme.colors.fpwhite};
`;

const RemoveChipButton = styled.button`
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: ${theme.fontSizes.small};
  line-height: 1;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

const GenreSuggestionList = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${theme.spacing.xs};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  font-style: italic;
`;

const SuggestionButton = styled.button`
  border: ${theme.borders.dashedThin} ${theme.colors.black};
  border-radius: 3px;
  background: transparent;
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 6px;
  cursor: pointer;

  &:hover {
    background: ${theme.colors.yellow};
  }
`;

const ClearButton = styled.button`
  padding: ${theme.spacing.sm} ${theme.spacing.lg};
  border: ${theme.borders.dashed} ${theme.colors.black};
  border-radius: 4px;
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: background ${theme.transitions.fast};
  align-self: flex-start;
  
  &:hover {
    background: ${theme.colors.yellow};
  }
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    width: 100%;
    align-self: stretch;
  }
`;

const ToggleFiltersButton = styled.button`
  padding: ${theme.spacing.xs} ${theme.spacing.md};
  border: ${theme.borders.dashed} ${theme.colors.black};
  border-radius: 4px;
  background: transparent;
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: background ${theme.transitions.fast};

  &:hover {
    background: ${theme.colors.yellow};
  }
`;

const CompactClearButton = styled(ClearButton)`
  width: 100%;
  margin-top: ${theme.spacing.xs};
`;

const FilterControls = ({ 
  searchTerm, 
  onSearchChange, 
  typeFilter, 
  onTypeFilterChange, 
  types = [],
  locationFilter,
  onLocationFilterChange,
  locations = [],
  dspFilter,
  onDspFilterChange,
  quotesFilter,
  onQuotesFilterChange,
  genreInput = '',
  onGenreInputChange,
  genreOptions = [],
  selectedGenres = [],
  onGenreAdd,
  onGenreRemove,
  sortBy,
  onSortByChange,
  onClear
}) => {
  const [isCompact, setIsCompact] = React.useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = React.useState(false);
  const initializedRef = React.useRef(false);
  const hasActiveFilters = Boolean(
    searchTerm || 
    (typeFilter && typeFilter !== 'ALL') ||
    (locationFilter && locationFilter !== 'ALL') ||
    (dspFilter && dspFilter !== 'ALL') ||
    (quotesFilter && quotesFilter !== 'ALL') ||
    (selectedGenres && selectedGenres.length > 0)
  );

  const normalizedGenreInput = (genreInput || '').trim().toLowerCase();
  const genreSuggestions = React.useMemo(() => {
    if (!genreOptions.length || !normalizedGenreInput) return [];

    return genreOptions
      .filter(option => {
        const value = (option.value || '').toLowerCase();
        const label = (option.label || value).toLowerCase();
        const matches = label.includes(normalizedGenreInput) || value.includes(normalizedGenreInput);
        const alreadySelected = (selectedGenres || []).some(selected => selected.value === value);
        return matches && !alreadySelected;
      })
      .slice(0, 6);
  }, [genreOptions, normalizedGenreInput, selectedGenres]);

  const handleGenreSubmit = (event) => {
    event?.preventDefault();
    const raw = (genreInput || '').trim();
    if (!raw) return;
    onGenreAdd?.(raw);
    onGenreInputChange?.('');
  };

  const handleGenreKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleGenreSubmit();
    }
  };

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const query = window.matchMedia(`(max-width: ${theme.breakpoints.mobile})`);
    const applyMatch = (matches) => {
      setIsCompact(matches);
      if (!initializedRef.current) {
        setShowAdvancedFilters(!matches);
        initializedRef.current = true;
      } else if (!matches) {
        setShowAdvancedFilters(true);
      }
    };

    applyMatch(query.matches);

    const handleChange = (event) => {
      applyMatch(event.matches);
    };

    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', handleChange);
      return () => query.removeEventListener('change', handleChange);
    }

    query.addListener(handleChange);
    return () => query.removeListener(handleChange);
  }, []);

  const shouldShowAdvanced = !isCompact || showAdvancedFilters;

  return (
    <FilterControlsContainer>
      <SearchRow>
        <SearchInput
          type="text"
          placeholder="Search playlists"
          value={searchTerm}
          onChange={onSearchChange}
          hasValue={!!searchTerm}
          aria-label="Search playlists"
        />
        <FilterSelect
          value={sortBy || 'PUBLISH_DATE_DESC'}
          onChange={onSortByChange}
          aria-label="Sort by"
        >
          <option value="PUBLISH_DATE_DESC">Newest First</option>
          <option value="PUBLISH_DATE_ASC">Oldest First</option>
          <option value="PLAYLIST_NAME_ASC">Playlist A-Z</option>
          <option value="PLAYLIST_NAME_DESC">Playlist Z-A</option>
          <option value="CURATOR_NAME_ASC">Curator A-Z</option>
          <option value="CURATOR_NAME_DESC">Curator Z-A</option>
          <option value="CURATOR_TYPE_ASC">Type A-Z</option>
          <option value="CURATOR_TYPE_DESC">Type Z-A</option>
        </FilterSelect>
      </SearchRow>

      {isCompact && (
        <FilterToggleRow>
          <ToggleFiltersButton
            type="button"
            onClick={() => setShowAdvancedFilters(prev => !prev)}
          >
            {showAdvancedFilters ? 'Hide Filters' : 'More Filters'}
          </ToggleFiltersButton>
        </FilterToggleRow>
      )}

      {shouldShowAdvanced && (
        <>
          <FilterRow>
            <FilterSelect
              value={typeFilter || 'ALL'}
              onChange={onTypeFilterChange}
              aria-label="Filter by curator type"
            >
              <option value="ALL">All Types</option>
              {types.map((type) => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </FilterSelect>
            
            <FilterSelect
              value={locationFilter || 'ALL'}
              onChange={onLocationFilterChange}
              aria-label="Filter by curator location"
            >
              <option value="ALL">All Locations</option>
              {locations.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </FilterSelect>
            
            <FilterSelect
              value={dspFilter || 'ALL'}
              onChange={onDspFilterChange}
              aria-label="Filter by streaming platform"
            >
              <option value="ALL">All Platforms</option>
              <option value="HAS_SPOTIFY">Has Spotify</option>
              <option value="HAS_APPLE">Has Apple Music</option>
              <option value="HAS_TIDAL">Has Tidal</option>
              <option value="NO_DSP">No DSP Links</option>
            </FilterSelect>
            <FilterSelect
              value={quotesFilter || 'ALL'}
              onChange={onQuotesFilterChange}
              aria-label="Filter by quotes"
            >
              <option value="ALL">Quotes: Any</option>
              <option value="HAS_QUOTES">Has Quotes</option>
              <option value="NO_QUOTES">No Quotes</option>
            </FilterSelect>
          </FilterRow>

          <GenreFilterContainer>
            <GenreInputRow>
              <GenreInput
                type="text"
                placeholder="Filter by genre"
                value={genreInput}
                onChange={(event) => onGenreInputChange?.(event.target.value)}
                onKeyDown={handleGenreKeyDown}
                list="playlist-genre-suggestions"
                aria-label="Add genre filter"
              />
              <AddGenreButton 
                type="button"
                onClick={handleGenreSubmit}
                disabled={!genreInput?.trim()}
              >
                Add Genre
              </AddGenreButton>
            </GenreInputRow>
            <datalist id="playlist-genre-suggestions">
              {genreOptions.map(option => (
                <option key={option.value} value={option.label} />
              ))}
            </datalist>
            {genreSuggestions.length > 0 && (
              <GenreSuggestionList>
                <span>Suggestions:</span>
                {genreSuggestions.map(option => (
                  <SuggestionButton
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onGenreAdd?.(option.value);
                      onGenreInputChange?.('');
                    }}
                  >
                    {option.label}
                  </SuggestionButton>
                ))}
              </GenreSuggestionList>
            )}
            {selectedGenres?.length > 0 && (
              <GenreChipList>
                {selectedGenres.map(item => (
                  <GenreChip key={item.value} $color={item.color}>
                    {item.label.toUpperCase()}
                    <RemoveChipButton type="button" onClick={() => onGenreRemove?.(item.value)} aria-label={`Remove ${item.label}`}>
                      ×
                    </RemoveChipButton>
                  </GenreChip>
                ))}
              </GenreChipList>
            )}
          </GenreFilterContainer>

          {hasActiveFilters && (
            <ClearButton 
              onClick={onClear}
              aria-label="Clear all filters"
            >
              Clear All Filters
            </ClearButton>
          )}
        </>
      )}

      {hasActiveFilters && !shouldShowAdvanced && (
        <CompactClearButton
          onClick={onClear}
          aria-label="Clear all filters"
        >
          Clear Filters
        </CompactClearButton>
      )}
    </FilterControlsContainer>
  );
};

export default FilterControls;
