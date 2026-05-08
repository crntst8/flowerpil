import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { theme, DashedBox } from '@shared/styles/GlobalStyles';
import ReusableHeader from '@shared/components/ReusableHeader';
import usePlaylistStore from '../store/playlistStore';
import { getPublishedPlaylists } from '../services/playlistService';
import FilterControls from './FilterControls';
import { useGenreCatalog } from '@shared/hooks/useGenreCatalog';
import { createGenreLookup, parseGenreTags } from '@shared/utils/genreUtils';
import PlatformIcon from '@shared/components/PlatformIcon';
import SEO, { generateItemListSchema } from '@shared/components/SEO';

const PlaylistList = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    playlists,
    isLoadingPlaylists,
    playlistsError,
    setPlaylists,
    setLoadingPlaylists,
    setPlaylistsError,
    clearPlaylistsError,
  } = usePlaylistStore();

  // Filter and sort state
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [dspFilter, setDspFilter] = useState('ALL');
  const [quotesFilter, setQuotesFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('PUBLISH_DATE_DESC');
  const [genreFilter, setGenreFilter] = useState([]);
  const [genreInput, setGenreInput] = useState('');

  const { catalog: genreCatalog } = useGenreCatalog();
  const genreLookup = useMemo(() => createGenreLookup(genreCatalog), [genreCatalog]);

  // Initialize filters from URL params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const searchParam = params.get('search') || '';
    const typeParam = params.get('type') || 'ALL';
    const locationParam = params.get('location') || 'ALL';
    const dspParam = params.get('dsp') || 'ALL';
    const quotesParam = params.get('quotes') || 'ALL';
    const sortParam = params.get('sort') || 'PUBLISH_DATE_DESC';
    const genresParam = params.get('genres') || '';
    const genreValues = genresParam
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean);
    
    setSearchTerm(searchParam);
    setTypeFilter(typeParam);
    setLocationFilter(locationParam);
    setDspFilter(dspParam);
    setQuotesFilter(quotesParam);
    setSortBy(sortParam);
    setGenreFilter(genreValues);
  }, [location.search]);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchTerm) params.set('search', searchTerm);
    if (typeFilter && typeFilter !== 'ALL') params.set('type', typeFilter);
    if (locationFilter && locationFilter !== 'ALL') params.set('location', locationFilter);
    if (dspFilter && dspFilter !== 'ALL') params.set('dsp', dspFilter);
    if (quotesFilter && quotesFilter !== 'ALL') params.set('quotes', quotesFilter);
    if (genreFilter.length) params.set('genres', genreFilter.join(','));
    if (sortBy && sortBy !== 'PUBLISH_DATE_DESC') params.set('sort', sortBy);
    
    const newSearch = params.toString();
    const currentSearch = location.search.replace('?', '');
    
    if (newSearch !== currentSearch) {
      navigate({
        pathname: location.pathname,
        search: newSearch ? `?${newSearch}` : ''
      }, { replace: true });
    }
  }, [searchTerm, typeFilter, locationFilter, dspFilter, quotesFilter, genreFilter, sortBy, location.pathname, location.search, navigate]);

  useEffect(() => {
    const loadPlaylists = async () => {
      clearPlaylistsError();
      setLoadingPlaylists(true);
      
      try {
        const publishedPlaylists = await getPublishedPlaylists();
        setPlaylists(publishedPlaylists);
      } catch (error) {
        console.error('Error loading playlists:', error);
        setPlaylistsError(error.message || 'Failed to load playlists');
      } finally {
        setLoadingPlaylists(false);
      }
    };

    loadPlaylists();
  }, [clearPlaylistsError, setLoadingPlaylists, setPlaylists, setPlaylistsError]);

  // Generate structured data for SEO
  const playlistSchemaItems = useMemo(() => {
    return playlists.slice(0, 10).map(p => ({
      type: 'MusicPlaylist',
      name: p.title,
      url: `https://flowerpil.io/playlists/${p.id}`
    }));
  }, [playlists]);

  // Get unique values for filter dropdowns
  const availableTypes = useMemo(() => {
    const types = [...new Set(playlists.map(playlist => playlist.curator_type))]
      .filter(Boolean)
      .sort();
    return types;
  }, [playlists]);

  const availableLocations = useMemo(() => {
    const locations = [...new Set(playlists.map(playlist => playlist.curator_location))]
      .filter(Boolean)
      .sort();
    return locations;
  }, [playlists]);

  const availableGenres = useMemo(() => {
    if (!genreCatalog?.length) return [];
    return genreCatalog.map(category => ({
      value: (category.id || '').toLowerCase(),
      label: category.label || category.id,
      color: category.color || theme.colors.primary
    }));
  }, [genreCatalog]);

  const normalizedGenreFilter = useMemo(() => genreFilter.map(value => value.toLowerCase()), [genreFilter]);

  const selectedGenres = useMemo(() => {
    if (!genreFilter.length) return [];
    return genreFilter.map(value => {
      const match = genreLookup.resolve?.(value);
      return {
        value,
        label: match?.label || value,
        color: match?.color || theme.colors.primary
      };
    });
  }, [genreFilter, genreLookup]);

  const resolveGenres = useCallback((playlistItem) => {
    const tags = parseGenreTags(playlistItem?.tags);
    if (!tags?.length) return [];

    const seen = new Set();
    const resolver = typeof genreLookup.resolve === 'function' ? genreLookup.resolve : null;

    return tags
      .map(tag => {
        const match = resolver ? resolver(tag) : null;
        const label = match?.label || tag;
        const color = match?.color || theme.colors.primary;
        const key = (match?.id || label || tag)?.toLowerCase();

        if (!label || seen.has(key)) {
          return null;
        }

        seen.add(key);
        return { id: key, label, color };
      })
      .filter(Boolean);
  }, [genreLookup]);

  // Filter and sort playlists based on all criteria
  const filteredPlaylists = useMemo(() => {
    let filtered = [...playlists];

    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(playlist => 
        playlist.title.toLowerCase().includes(searchLower) ||
        playlist.curator_name.toLowerCase().includes(searchLower) ||
        (playlist.description && playlist.description.toLowerCase().includes(searchLower)) ||
        (playlist.description_short && playlist.description_short.toLowerCase().includes(searchLower))
      );
    }

    // Apply type filter
    if (typeFilter && typeFilter !== 'ALL') {
      filtered = filtered.filter(playlist => playlist.curator_type === typeFilter);
    }

    // Apply location filter
    if (locationFilter && locationFilter !== 'ALL') {
      filtered = filtered.filter(playlist => playlist.curator_location === locationFilter);
    }

    // Apply DSP filter
    if (dspFilter && dspFilter !== 'ALL') {
      switch (dspFilter) {
        case 'HAS_SPOTIFY':
          filtered = filtered.filter(playlist => playlist.has_spotify);
          break;
        case 'HAS_APPLE':
          filtered = filtered.filter(playlist => playlist.has_apple);
          break;
        case 'HAS_TIDAL':
          filtered = filtered.filter(playlist => playlist.has_tidal);
          break;
        case 'NO_DSP':
          filtered = filtered.filter(playlist => 
            !playlist.has_spotify && !playlist.has_apple && !playlist.has_tidal
          );
          break;
      }
    }

    // Apply quotes filter
    if (quotesFilter && quotesFilter !== 'ALL') {
      switch (quotesFilter) {
        case 'HAS_QUOTES':
          filtered = filtered.filter(playlist => playlist.has_quotes);
          break;
        case 'NO_QUOTES':
          filtered = filtered.filter(playlist => !playlist.has_quotes);
          break;
      }
    }

    // Apply genre filter
    if (normalizedGenreFilter.length) {
      filtered = filtered.filter(playlist => {
        const tags = parseGenreTags(playlist.tags);
        if (!tags.length) return false;
        const normalizedTags = tags.map(tag => {
          const match = genreLookup.resolve?.(tag);
          return (match?.id || tag).toLowerCase();
        });
        return normalizedGenreFilter.every(id => normalizedTags.includes(id));
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'PUBLISH_DATE_ASC':
          return new Date(a.published_at || a.publish_date) - new Date(b.published_at || b.publish_date);
        case 'PUBLISH_DATE_DESC':
          return new Date(b.published_at || b.publish_date) - new Date(a.published_at || a.publish_date);
        case 'PLAYLIST_NAME_ASC':
          return a.title.localeCompare(b.title);
        case 'PLAYLIST_NAME_DESC':
          return b.title.localeCompare(a.title);
        case 'CURATOR_NAME_ASC':
          return a.curator_name.localeCompare(b.curator_name);
        case 'CURATOR_NAME_DESC':
          return b.curator_name.localeCompare(a.curator_name);
        case 'CURATOR_TYPE_ASC':
          return a.curator_type.localeCompare(b.curator_type);
        case 'CURATOR_TYPE_DESC':
          return b.curator_type.localeCompare(a.curator_type);
        default:
          return new Date(b.published_at || b.publish_date) - new Date(a.published_at || a.publish_date);
      }
    });

    return filtered;
  }, [playlists, searchTerm, typeFilter, locationFilter, dspFilter, quotesFilter, normalizedGenreFilter, genreLookup, sortBy]);

  const addGenreValue = useCallback((rawValue) => {
    if (!rawValue) return;
    const match = genreLookup.resolve?.(rawValue);
    const canonical = (match?.id || rawValue).toLowerCase().trim();
    if (!canonical) return;
    setGenreFilter(prev => (prev.includes(canonical) ? prev : [...prev, canonical]));
  }, [genreLookup]);

  const handleGenreSubmit = useCallback(() => {
    const value = genreInput.trim();
    if (!value) return;
    addGenreValue(value);
    setGenreInput('');
  }, [addGenreValue, genreInput]);

  const handleRemoveGenre = useCallback((value) => {
    if (!value) return;
    setGenreFilter(prev => prev.filter(item => item !== value));
  }, []);

  // Clear all filters and reset sort
  const handleClearFilters = () => {
    setSearchTerm('');
    setTypeFilter('ALL');
    setLocationFilter('ALL');
    setDspFilter('ALL');
    setQuotesFilter('ALL');
    setSortBy('PUBLISH_DATE_DESC');
    setGenreFilter([]);
    setGenreInput('');
  };

  if (playlistsError) {
    return (
      <PageContainer>
        <ReusableHeader />
        <ScrollRegion>
          <ErrorContainer>
            <ErrorMessage>Error: {playlistsError}</ErrorMessage>
            <HomeLink to="/home">← Back to Home</HomeLink>
          </ErrorContainer>
        </ScrollRegion>
      </PageContainer>
    );
  }

  if (isLoadingPlaylists) {
    return (
      <PageContainer>
        <ReusableHeader />
        <ScrollRegion>
          <LoadingContainer>
            <LoadingText className="loading-dots">Loading playlists</LoadingText>
          </LoadingContainer>
        </ScrollRegion>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <SEO
        title="Browse Curated Playlists"
        description="Cross-platform, curated, by people. Browse playlists and find new music."
        canonical="/playlists"
        keywords={[
          'curated playlists',
          'music playlists',
          'Spotify playlists',
          'Apple Music playlists',
          'TIDAL playlists',
          'playlist discovery',
          'music discovery playlists'
        ]}
        structuredData={generateItemListSchema(playlistSchemaItems, 'Curated Music Playlists')}
      />
      <ReusableHeader />
      <ScrollRegion>
        <ContentWrapper>
        {/* Page Breadcrumb */}
        <PageBreadcrumb>
          <Link to="/home">Home</Link> / Playlists
        </PageBreadcrumb>

        <PlaylistListHeader>
          <h1>Search Playlists</h1>
          <p>{playlists.length} playlist{playlists.length !== 1 ? 's' : ''}</p>
        </PlaylistListHeader>
        
        {/* Filter Controls */}
        <FilterControls
          searchTerm={searchTerm}
          onSearchChange={(e) => setSearchTerm(e.target.value)}
          typeFilter={typeFilter}
          onTypeFilterChange={(e) => setTypeFilter(e.target.value)}
          types={availableTypes}
          locationFilter={locationFilter}
          onLocationFilterChange={(e) => setLocationFilter(e.target.value)}
          locations={availableLocations}
          dspFilter={dspFilter}
          onDspFilterChange={(e) => setDspFilter(e.target.value)}
          quotesFilter={quotesFilter}
          onQuotesFilterChange={(e) => setQuotesFilter(e.target.value)}
          genreInput={genreInput}
          onGenreInputChange={setGenreInput}
          genreOptions={availableGenres}
          selectedGenres={selectedGenres}
          onGenreAdd={addGenreValue}
          onGenreRemove={handleRemoveGenre}
          sortBy={sortBy}
          onSortByChange={(e) => setSortBy(e.target.value)}
          onClear={handleClearFilters}
        />

        {/* Playlists Results */}
        {filteredPlaylists.length > 0 ? (
          <PlaylistResults>
            <PlaylistHeaderRow>
              <HeaderCell>Playlist</HeaderCell>
              <HeaderCell>Curator</HeaderCell>
              <HeaderCell>Genres</HeaderCell>
              <HeaderCell>Platforms</HeaderCell>
            </PlaylistHeaderRow>
            {filteredPlaylists.map((playlist) => {
              const resolvedGenres = resolveGenres(playlist);
              const genrePreview = resolvedGenres.slice(0, 4);
              const overflowCount = Math.max(resolvedGenres.length - genrePreview.length, 0);
              const platformIcons = [
                playlist.has_spotify && 'spotify',
                playlist.has_apple && 'apple',
                playlist.has_tidal && 'tidal'
              ].filter(Boolean);
              const metaItems = [
                playlist.curator_type && playlist.curator_type,
                playlist.curator_location && playlist.curator_location
              ].filter(Boolean);

              return (
                <PlaylistRowLink key={playlist.id} to={`/playlists/${playlist.id}`}>
                  <PlaylistCover>
                    {playlist.image ? (
                      <img src={playlist.image} alt={playlist.title} loading="lazy" />
                    ) : (
                      <NoCover>Cover TBD</NoCover>
                    )}
                  </PlaylistCover>
                  <PlaylistSummary>
                    <TitleRow>
                      <ResultTitle>{playlist.title}</ResultTitle>
                    </TitleRow>
                    <CuratorLine>
                      <span>{playlist.curator_name}</span>
                    </CuratorLine>
                    {metaItems.length > 0 && (
                      <MetaTagRow>
                        {metaItems.map(item => (
                          <MetaTag key={item}>{item}</MetaTag>
                        ))}
                      </MetaTagRow>
                    )}
                    {playlist.description_short && (
                      <DescriptionSnippet>{playlist.description_short}</DescriptionSnippet>
                    )}
                  </PlaylistSummary>
                  <GenreColumn>
                    <ColumnLabel>Genres</ColumnLabel>
                    {genrePreview.length ? (
                      <>
                        {genrePreview.map(tag => (
                          <GenrePill key={tag.id} $accent={tag.color}>
                            {tag.label.toUpperCase()}
                          </GenrePill>
                        ))}
                        {overflowCount > 0 && (
                          <GenrePill $accent={theme.colors.primary}>
                            +{overflowCount}
                          </GenrePill>
                        )}
                      </>
                    ) : (
                      <GenrePlaceholder>No genre tags yet</GenrePlaceholder>
                    )}
                  </GenreColumn>
                  <PlatformColumn>
                    <ColumnLabel>Platforms</ColumnLabel>
                    {platformIcons.length ? (
                      <PlatformIconRow>
                        {platformIcons.map(platform => (
                          <PlatformIcon key={platform} platform={platform} size={22} inline />
                        ))}
                      </PlatformIconRow>
                    ) : (
                      <PlatformPlaceholder>No platform links yet</PlatformPlaceholder>
                    )}
                  </PlatformColumn>
                </PlaylistRowLink>
              );
            })}
          </PlaylistResults>
        ) : (
          <EmptyState>
            {(searchTerm || 
              (typeFilter && typeFilter !== 'ALL') || 
              (locationFilter && locationFilter !== 'ALL') || 
              (dspFilter && dspFilter !== 'ALL') || 
              (genreFilter && genreFilter.length > 0)) ? (
              <>
                <EmptyMessage>No playlists found</EmptyMessage>
                <EmptySubtext>
                  No results match your current filters
                </EmptySubtext>
                <ClearFiltersButton onClick={handleClearFilters}>
                  Clear All Filters
                </ClearFiltersButton>
              </>
            ) : (
              <>
                <EmptyMessage>No published playlists available</EmptyMessage>
                <EmptySubtext>Check back later for new curated playlists</EmptySubtext>
              </>
            )}
          </EmptyState>
        )}
        </ContentWrapper>
      </ScrollRegion>
    </PageContainer>
  );
};

// Styled Components

// Page structure matching LandingPage pattern
const PageContainer = styled.div`
  height: calc(var(--vh, 1vh) * 100);
  min-height: calc(var(--vh, 1vh) * 100);
  width: 100%;
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const ScrollRegion = styled.div`
  flex: 1 1 auto;
  width: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: none;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-x pan-y;
  background: ${theme.colors.fpwhite};
  padding-bottom: ${theme.spacing.lg};
  scrollbar-gutter: stable;
`;

const ContentWrapper = styled.div`
  max-width: ${theme.layout.maxWidth};
  margin: 0 auto;
  padding: ${theme.spacing.lg} ${theme.layout.containerPadding} ${theme.spacing.xl};
  background: ${theme.colors.fpwhite};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};

  @media (max-width: ${theme.breakpoints.mobile}) {
    padding: ${theme.spacing.md} ${theme.spacing.sm} ${theme.spacing.lg};
    gap: ${theme.spacing.md};
  }
`;

const HomeLink = styled(Link)`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${theme.colors.black};
  text-decoration: none;
  border-bottom: 2px solid ${theme.colors.black};
  padding: ${theme.spacing.xs} 0;

  &:hover {
    background: ${theme.colors.yellow};
  }
`;

const PlaylistListHeader = styled.div`
  margin-bottom: ${theme.spacing.sm};
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.xs};

  h1 {
    margin: 0;
    font-family: ${theme.fonts.primary};
    text-transform: capitalize;
    letter-spacing: -1px;
    color: ${theme.colors.black};
    font-size: calc(${theme.fontSizes.h1} * 1.1);
  }

  p {
    margin: 0;
    font-size: ${theme.fontSizes.small};
    font-family: ${theme.fonts.mono};
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: ${theme.colors.blackAct};
  }
`;

const PlaylistResults = styled.div`
  border: ${theme.borders.solid} ${theme.colors.black};
  border-radius: 4px;
  background: ${theme.colors.fpwhiteIn};
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  margin-bottom: ${theme.spacing.xl};
`;

const PlaylistHeaderRow = styled.div`
  display: grid;
  grid-template-columns: 88px minmax(0, 1.7fr) minmax(0, 1.3fr) minmax(0, 0.9fr);
  align-items: center;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md} ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${theme.colors.black};
  background: ${theme.colors.fpwhiteTrans};
  border-bottom: ${theme.borders.solidThin} ${theme.colors.black};

  @media (max-width: ${theme.breakpoints.tablet}) {
    display: none;
  }
`;

const HeaderCell = styled.span`
  &:first-child {
    padding-left: ${theme.spacing.xs};
  }
`;

const PlaylistRowLink = styled(Link)`
  display: grid;
  grid-template-columns: 80px minmax(0, 1.7fr) minmax(0, 1.2fr) minmax(0, 0.9fr);
  grid-template-areas: 'cover summary genres platforms';
  align-items: center;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  color: ${theme.colors.black};
  text-decoration: none;
  border-top: ${theme.borders.dashedThin} ${theme.colors.blackAct};
  transition: background ${theme.transitions.fast};

  &:first-of-type {
    border-top: none;
  }

  &:hover {
    background: #eeeded;
      transition: background ${theme.transitions.slow};

  }

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 69px minmax(0, 1fr);
    grid-template-areas:
      'cover summary'
      'cover genres'
      'cover platforms';
    align-items: flex-start;
    gap: ${theme.spacing.sm};
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    grid-template-columns: 70px minmax(0, 1fr);
    grid-template-areas:
      'cover summary'
      'cover genres'
      'cover platforms';
    gap: ${theme.spacing.sm};
    padding: ${theme.spacing.sm} ${theme.spacing.sm} ${theme.spacing.md};
  }
`;

const PlaylistCover = styled.div`
  grid-area: cover;
  width: 72px;
  height: 72px;
  border: ${theme.borders.solid} ${theme.colors.black};
  border-radius: 1px;
  overflow: hidden;
  background: ${theme.colors.fpwhite};
  display: flex;
  align-items: center;
  justify-content: center;
  justify-self: start;
  align-self: start;

  @media (max-width: ${theme.breakpoints.mobile}) {
    width: 72px;
    height: 72px;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

const NoCover = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  text-align: center;
  padding: ${theme.spacing.xs};
  color: ${theme.colors.blackLess};
`;

const PlaylistSummary = styled.div`
  grid-area: summary;
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  min-width: 0;
  padding-right: ${theme.spacing.sm};
`;

const TitleRow = styled.div`
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
`;

const ResultTitle = styled.h2`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: clamp(1rem, 2.2vw, 1.35rem);
  letter-spacing: -0.5px;
  color: ${theme.colors.black};
  line-height: 1.2;
`;

const CuratorLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${theme.spacing.xs};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${theme.colors.blackAct};

  .type {
    font-weight: ${theme.fontWeights.medium};
  }
`;

const MetaTagRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
  margin-bottom: ${theme.spacing.xs};
`;

const MetaTag = styled.span`
  padding: 2px 6px;
  border: ${theme.borders.solidThin} ${theme.colors.black};
  border-radius: 3px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: ${theme.colors.fpwhite};
`;

const DescriptionSnippet = styled.p`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  line-height: 1.4;
  color: ${theme.colors.blackLess};
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const GenreColumn = styled.div`
  grid-area: genres;
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
  align-items: center;
  min-height: 32px;
  row-gap: ${theme.spacing.xs};

  @media (max-width: ${theme.breakpoints.mobile}) {
    width: 100%;
  }
`;

const GenrePill = styled.span.withConfig({ shouldForwardProp: (prop) => prop !== '$accent' })`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border: ${theme.borders.solidThin} ${props => props.$accent || theme.colors.black};
  border-radius: 3px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
`;

const GenrePlaceholder = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-style: italic;
  color: ${theme.colors.blackLess};
`;

const PlatformColumn = styled.div`
  grid-area: platforms;
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  align-items: flex-start;
  justify-content: center;
  min-height: 32px;

  @media (max-width: ${theme.breakpoints.mobile}) {
    width: 100%;
  }
`;

const PlatformIconRow = styled.div`
  display: inline-flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
`;

const PlatformPlaceholder = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${theme.colors.blackLess};
`;

const ColumnLabel = styled.span`
  display: none;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${theme.colors.blackAct};
  margin-bottom: ${theme.spacing.xs};

  @media (max-width: ${theme.breakpoints.tablet}) {
    display: inline-flex;
    flex-basis: 100%;
  }
`;

const EmptyState = styled(DashedBox)`
  text-align: center;
  padding: ${theme.spacing.xl};
  background: ${theme.colors.fpwhiteIn};
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${theme.spacing.sm};
`;

const EmptyMessage = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.h3};
  color: ${theme.colors.black};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const EmptySubtext = styled.div`
  font-size: ${theme.fontSizes.body};
  color: ${theme.colors.blackLess};
  line-height: 1.5;
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: ${theme.spacing.xl};
`;

const LoadingText = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 50vh;
  gap: ${theme.spacing.lg};
`;

const ErrorMessage = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  color: ${theme.colors.red};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  text-align: center;
`;

// Additional styled components for the updated navigation layout
const PageBreadcrumb = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: ${theme.spacing.sm};

  a {
    color: ${theme.colors.black};
    text-decoration: none;

    &:hover {
      color: ${theme.colors.red};
    }
  }
`;

const ClearFiltersButton = styled.button`
  margin-top: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.lg};
  border: ${theme.borders.dashed} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: background ${theme.transitions.fast}, color ${theme.transitions.fast};

  &:hover {
    background: ${theme.colors.yellow};
  }
`;


export default PlaylistList;
