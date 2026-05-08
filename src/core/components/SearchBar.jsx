import React, {
  useMemo,
  useState,
  useCallback,
  useRef,
  useEffect
} from 'react';
import { createPortal } from 'react-dom';
import styled, { css } from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { theme } from '@shared/styles/GlobalStyles';
import { useSearch } from '@core/hooks/useSearch';
import { useSearchSuggestions } from '@core/hooks/useSearchSuggestions';

const GROUP_LABELS = {
  playlists_title: 'Playlists',
  playlists_by_artist: 'Featuring Artist',
  playlists_by_genre: 'By Genre / Mood',
  playlists_by_track: 'Tracks',
  recent_playlists: 'Recently Added',
  suggested_queries: 'SUGGESTED'
};

const DEFAULT_SUGGESTION_ITEMS = [
  {
    title: 'Fresh Releases',
    description: 'New drops inside thirty days',
    preset_query: 'fresh releases',
    target_url: null
  },
  {
    title: 'Wistful Shoegaze',
    description: 'Dream guitars, foggy vocals, neon haze',
    preset_query: 'wistful shoegaze',
    target_url: null
  },
  {
    title: 'Afterhours Pulse',
    description: 'Low lights, late night electronic drift',
    preset_query: 'afterhours electronic',
    target_url: null
  },
  {
    title: 'Spotlight Curators',
    description: 'Voices shaping the Flowerpil index',
    preset_query: 'curator spotlight',
    target_url: null
  }
];

const formatDate = (value) => {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return null;
  }
};

const buildSubtitle = (item) => {
  if (item?.subtitle) {
    return item.subtitle;
  }

  if (item?.track?.title) {
    const artist = item.track.artist ? ` — ${item.track.artist}` : '';
    return `Track: ${item.track.title}${artist}`;
  }

  const latest = formatDate(item?.latest_track_date);
  if (latest) {
    return `Latest: ${latest}`;
  }

  const published = formatDate(item?.publish_date);
  if (published) {
    return `Published: ${published}`;
  }

  if (item?.curator) {
    return `Curator: ${item.curator}`;
  }

  return '';
};

const flattenGroups = (groups = []) => {
  const items = [];
  groups.forEach(group => {
    (group.items || []).forEach(entry => {
      items.push({
        ...entry,
        groupType: group.type
      });
    });
  });
  return items;
};

const SearchBar = ({ placeholder = 'search for anything' }) => {
  const navigate = useNavigate();
  const { query, setQuery, results, loading, error } = useSearch({ mode: 'preview' });
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(`(max-width: ${theme.breakpoints.mobile})`).matches;
  });
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(`(max-width: ${theme.breakpoints.mobile})`).matches;
  });
  const introTimeoutsRef = useRef([]);
  const { suggestions: editorialSuggestions } = useSearchSuggestions({ limit: 4 });

  const groups = useMemo(() => results?.groups || [], [results]);
  const isQueryEmpty = query.trim().length === 0;
  const showSuggestions = isOpen && isQueryEmpty;
  const suggestionItems = useMemo(() => {
    const source = Array.isArray(editorialSuggestions) && editorialSuggestions.length
      ? editorialSuggestions
      : DEFAULT_SUGGESTION_ITEMS;

    return source.slice(0, 4).map((item, index) => ({
      id: item.id ?? `suggestion-${index}`,
      title: item.title || 'Untitled',
      subtitle: item.description || item.subtitle || '',
      presetQuery: item.preset_query || item.presetQuery || item.title || '',
      image_url: item.image_url || item.imageUrl || null,
      target_url: item.target_url || item.targetUrl || null,
      targetUrl: item.target_url || item.targetUrl || null
    }));
  }, [editorialSuggestions]);

  const suggestionGroups = useMemo(() => (
    suggestionItems.length
      ? [{ type: 'suggested_queries', items: suggestionItems }]
      : []
  ), [suggestionItems]);

  const visibleGroups = useMemo(
    () => (showSuggestions ? suggestionGroups : groups),
    [showSuggestions, suggestionGroups, groups]
  );
  const flatItems = useMemo(() => flattenGroups(visibleGroups), [visibleGroups]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mediaQuery = window.matchMedia(`(max-width: ${theme.breakpoints.mobile})`);
    const updateState = (event) => {
      setIsMobile(event.matches);
      setIsCollapsed(event.matches);
    };

    updateState(mediaQuery);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateState);
      return () => mediaQuery.removeEventListener('change', updateState);
    }

    mediaQuery.addListener(updateState);
    return () => mediaQuery.removeListener(updateState);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    introTimeoutsRef.current.forEach(timeoutId => window.clearTimeout(timeoutId));
    introTimeoutsRef.current = [];

    if (!isMobile || typeof document === 'undefined') {
      if (!isMobile) {
        setIsCollapsed(false);
      }
      return undefined;
    }

    setIsCollapsed(true);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sessionKey = 'fp-mobile-search-intro';
    let storage = null;

    try {
      storage = window.sessionStorage;
    } catch {
      storage = null;
    }

    const hasPlayed = storage?.getItem(sessionKey) === '1';
    const isDryReferrer = !document.referrer;

    if (hasPlayed || !isDryReferrer || prefersReducedMotion) {
      return undefined;
    }

    storage?.setItem(sessionKey, '1');

    const expandTimeout = window.setTimeout(() => {
      setIsCollapsed(false);
      const collapseTimeout = window.setTimeout(() => {
        setIsCollapsed(true);
      }, 3000);
      introTimeoutsRef.current.push(collapseTimeout);
    }, 1500);

    introTimeoutsRef.current.push(expandTimeout);

    return () => {
      introTimeoutsRef.current.forEach(timeoutId => window.clearTimeout(timeoutId));
      introTimeoutsRef.current = [];
    };
  }, [isMobile]);

  useEffect(() => {
    if (flatItems.length) {
      setActiveIndex(0);
    } else {
      setActiveIndex(-1);
    }
  }, [flatItems]);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    if (isMobile) {
      setIsCollapsed(true);
    }
  }, [isMobile, setQuery]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target)) {
        closeDropdown();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeDropdown]);

  const handleFocus = useCallback(() => {
    if (isMobile && isCollapsed) {
      setIsCollapsed(false);
    }
    if (flatItems.length || loading || isQueryEmpty) {
      setIsOpen(true);
    }
  }, [flatItems.length, isCollapsed, isMobile, loading, isQueryEmpty]);

  const arrowNavigatedRef = useRef(false);

  const handleChange = useCallback((event) => {
    setQuery(event.target.value);
    setIsOpen(true);
    arrowNavigatedRef.current = false;
  }, [setQuery]);

  const focusSearchInput = useCallback(() => {
    if (!inputRef.current) return;
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    } else {
      inputRef.current.focus();
    }
  }, []);

  const handleWrapperPointerDown = useCallback(() => {
    if (!isMobile || !isCollapsed) return;
    setIsCollapsed(false);
    focusSearchInput();
  }, [focusSearchInput, isCollapsed, isMobile]);

  const handleToggleClick = useCallback(() => {
    if (isMobile && isCollapsed) {
      setIsCollapsed(false);
    }
    focusSearchInput();
  }, [focusSearchInput, isCollapsed, isMobile]);

  const handleInputBlur = useCallback(() => {
    if (isMobile && !query) {
      setIsCollapsed(true);
    }
  }, [isMobile, query]);

  const handleSelect = useCallback((item) => {
    const preset = item?.presetQuery || item?.preset_query || '';
    const targetUrl = item?.target_url || item?.targetUrl || item?.url || '';
    const isEditorial = item?.groupType === 'suggested_queries';

    if (targetUrl) {
      if (preset) {
        setQuery(preset);
      }
      closeDropdown();
      window.location.assign(targetUrl);
      return;
    }

    const playlistId = !isEditorial ? (item?.playlist_id || item?.id) : null;
    if (playlistId) {
      setQuery('');
      navigate(`/playlist/${playlistId}`);
      closeDropdown();
      return;
    }

    if (preset) {
      setQuery(preset);
      setIsOpen(true);
      setActiveIndex(0);
      inputRef.current?.focus();
      return;
    }

    if (item?.title && !item?.playlist_id) {
      setQuery(item.title);
      setIsOpen(true);
      setActiveIndex(0);
      inputRef.current?.focus();
    }
  }, [closeDropdown, navigate, setQuery, setIsOpen, setActiveIndex]);

  const handleKeyDown = useCallback((event) => {
    switch (event.key) {
      case 'ArrowDown': {
        if (!flatItems.length) return;
        event.preventDefault();
        arrowNavigatedRef.current = true;
        setIsOpen(true);
        setActiveIndex(prev => {
          const next = prev + 1;
          return next >= flatItems.length ? 0 : next;
        });
        break;
      }
      case 'ArrowUp': {
        if (!flatItems.length) return;
        event.preventDefault();
        arrowNavigatedRef.current = true;
        setIsOpen(true);
        setActiveIndex(prev => {
          if (prev <= 0) return flatItems.length - 1;
          return prev - 1;
        });
        break;
      }
      case 'Enter': {
        event.preventDefault();
        if (arrowNavigatedRef.current && activeIndex >= 0 && activeIndex < flatItems.length) {
          handleSelect(flatItems[activeIndex]);
        } else if (query.trim()) {
          closeDropdown();
          navigate(`/search?q=${encodeURIComponent(query.trim())}`);
        }
        arrowNavigatedRef.current = false;
        break;
      }
      case 'Escape': {
        closeDropdown();
        setActiveIndex(-1);
        arrowNavigatedRef.current = false;
        break;
      }
      default:
        break;
    }
  }, [activeIndex, flatItems, closeDropdown, query, navigate, handleSelect]);

  const hasResults = flatItems.length > 0;
  const isError = Boolean(error);
  const showPanel = isOpen && (hasResults || loading || isError || showSuggestions);

  return (
    <>
      {showPanel && createPortal(
        <Backdrop
          onClick={closeDropdown}
        />,
        document.body
      )}
      <Container ref={containerRef}>
        <InputWrapper
          $isMobile={isMobile}
          $collapsed={isMobile && isCollapsed}
          onPointerDown={handleWrapperPointerDown}
        >
          <SearchIcon
            type="button"
            onClick={handleToggleClick}
            aria-label={isMobile && isCollapsed ? 'Open search' : 'Focus search'}
            $isCollapsed={isMobile && isCollapsed}
          >
            ⌕
          </SearchIcon>
          <SearchInput
            ref={inputRef}
            type="search"
            value={query}
            placeholder={placeholder}
            aria-label="Search curated playlists"
            aria-expanded={showPanel}
            aria-haspopup="listbox"
            aria-controls="flowerpil-search-results"
            onFocus={handleFocus}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={handleInputBlur}
            $isMobile={isMobile}
            $collapsed={isMobile && isCollapsed}
          />
          {query ? (
            <ClearButton
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
            >
              ×
            </ClearButton>
          ) : null}
        </InputWrapper>

        {showPanel ? (
          <ResultsPanel id="flowerpil-search-results" role="listbox">
          {loading ? (
            <EmptyState>SEARCHING…</EmptyState>
          ) : null}

          {!loading && isError ? (
            <EmptyState>SEARCH UNAVAILABLE</EmptyState>
          ) : null}

          {!loading && !isError && !hasResults ? (
            <EmptyState>NO MATCHES FOUND</EmptyState>
          ) : null}

          {!loading && !isError ? (
            visibleGroups.map(group => {
              if (!group.items?.length) return null;
              const label = GROUP_LABELS[group.type] || 'Results';
              return (
                <Group key={group.type}>
                  <GroupLabel>{label}</GroupLabel>
                  <GroupList>
                    {group.items.map((item, itemIndex) => {
                      const flatIndex = flatItems.findIndex((flat) => {
                        if (flat.groupType !== group.type) return false;
                        if ((flat.presetQuery || item.presetQuery) && flat.presetQuery === item.presetQuery) {
                          return true;
                        }
                        return (flat.playlist_id || flat.id) === (item.playlist_id || item.id)
                          && (flat.track?.id || null) === (item.track?.id || null);
                      });
                      const isActive = flatIndex === activeIndex;
                      const subtitle = buildSubtitle(item);
                      const isEditorial = group.type === 'suggested_queries';
                      const hasThumbnail = isEditorial && Boolean(item.image_url);
                      const payload = { ...item, groupType: group.type };

                      return (
                        <ResultItem
                          type="button"
                          key={`${group.type}-${itemIndex}-${item.playlist_id || item.id || item.presetQuery || 'suggestion'}`}
                          role="option"
                          aria-selected={isActive}
                          $active={isActive}
                          $hasThumbnail={hasThumbnail}
                          $isEditorial={isEditorial}
                          onMouseEnter={() => setActiveIndex(flatIndex >= 0 ? flatIndex : itemIndex)}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            handleSelect(payload);
                          }}
                        >
                          {hasThumbnail ? (
                            <ResultThumbnail
                              src={item.image_url}
                              alt=""
                              loading="lazy"
                            />
                          ) : null}
                          <ResultCopy>
                            <ResultTitle>{item.title}</ResultTitle>
                            {subtitle ? <ResultMeta>{subtitle}</ResultMeta> : null}
                          </ResultCopy>
                        </ResultItem>
                      );
                    })}
                  </GroupList>
                </Group>
              );
            })
          ) : null}
        </ResultsPanel>
        ) : null}
      </Container>
    </>
  );
};

const Container = styled.div`
  position: relative;
  width: min(100%, 460px);
  margin-left: 0;
  z-index: 100;

  @media (min-width: ${theme.breakpoints.desktop}) {
    margin-left: ${theme.spacing.xs};
  }
`;

const InputWrapper = styled.div.withConfig({ shouldForwardProp: (prop) => !['$isMobile', '$collapsed'].includes(prop) })`
  position: relative;
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  background: rgba(16, 15, 15, 0.95);
  border-right: 1px solid rgba(0, 0, 0, 0.72);
  padding: 0.88rem 0.12rem 0.88rem 2rem;
  border-radius: 0 5px 5px 0;
  color: ${theme.colors.fpwhite};
  transition:
    border-color ${theme.transitions.fast},
    box-shadow ${theme.transitions.fast},
    width 0.45s cubic-bezier(0.16, 1, 0.3, 1),
    padding 0.45s cubic-bezier(0.16, 1, 0.3, 1),
    gap 0.35s ease;
  border-left: none;
  width: 120%;

  /* Create concave curve on left edge using mask - larger for smoother appearance */
  -webkit-mask: radial-gradient(circle at -18px 50%, transparent 38px, black 38.5px);
  mask: radial-gradient(circle at -18px 50%, transparent 38px, black 38.5px);

  /* Curved left border that follows the concave edge */
  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 38px;
    height: 76px;
    border: 1px solid rgba(22, 21, 21, 0.72);
    border-left: none;
    border-radius: 0 38px 38px 0;
    margin-left: -18px;
    background: transparent;
    pointer-events: none;
    transition: border-color ${theme.transitions.fast};
  }

  ${({ $isMobile, $collapsed }) => $isMobile && css`
    width: ${$collapsed ? '39px' : '100%'};
    gap: ${$collapsed ? '0' : theme.spacing.md};
    padding: ${$collapsed ? '0.8rem 0.4rem' : '0.88rem 0.12rem'};
    cursor: ${$collapsed ? 'pointer' : 'text'};
    justify-content: ${$collapsed ? 'center' : 'flex-start'};
    border-radius: 999px;
    -webkit-mask: none;
    mask: none;

    /* Hide curved border when collapsed on mobile */
    &::before {
      display: none;
    }
  `}


`;

const SearchInput = styled.input.withConfig({ shouldForwardProp: (prop) => !['$collapsed', '$isMobile'].includes(prop) })`
  flex: 1;
  border: none;
  background: rgba(16, 15, 15, 0.95);
  color: ${theme.colors.fpwhite};
  font-family: ${theme.fonts.primary};
  font-size: 0.86rem;
  letter-spacing: 0.03em;
  text-align: left;
  padding: 0 12px;
  transition: opacity 0.2s ease;

  /* Prevent Safari mobile auto-zoom by using 16px minimum on mobile */
  @media (max-width: ${theme.breakpoints.mobile}) {
    font-size: 1rem;
    touch-action: manipulation;
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.43);
    transition: opacity 0.2s ease;
  }

  &:focus::placeholder {
    opacity: 0.5;
  }

  &:focus {
    outline: none;
    background: rgba(16, 15, 15, 0.95);
  }

  ${({ $isMobile, $collapsed }) => $isMobile && css`
    width: ${$collapsed ? '0' : '100%'};
    opacity: ${$collapsed ? 0 : 1};
    padding: ${$collapsed ? '0' : '0 12px'};
    pointer-events: ${$collapsed ? 'none' : 'auto'};
    transition:
      opacity 0.35s ease,
      width 0.45s cubic-bezier(0.16, 1, 0.3, 1);
  `}
`;

const SearchIcon = styled.button.withConfig({ shouldForwardProp: (prop) => prop !== '$isCollapsed' })`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 39px;
  height: 39px;
  border: none;
  background: transparent;
  font-size: 1.3rem;
  line-height: 0.4;
  margin-left: 12px;
  color: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: color ${theme.transitions.fast}, transform ${theme.transitions.fast};
  -webkit-tap-highlight-color: transparent;

  ${({ $isCollapsed }) => $isCollapsed && css`
    color: rgba(255, 255, 255, 0.75);
    margin-left: 0;
  `}

  &:hover,
  &:focus-visible {
    color: ${theme.colors.fpwhite};
    outline: none;
  }
`;

const ClearButton = styled.button`
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.45);
  font-size: 1.05rem;
  cursor: pointer;
  line-height: 1;
  transition: color ${theme.transitions.fast};

  &:hover {
    color: ${theme.colors.fpwhite};
  }
`;

const ResultsPanel = styled.div`
  position: absolute;
  top: calc(99% + 0.4rem);
  left: 0;
  width: 120%;
  background: rgba(12, 12, 11, 0.8);
  border-radius: 5px 5px 20px 20px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow:
    0 22px 60px rgba(0, 0, 0, 0.2),
    0 8px 24px rgba(0, 0, 0, 0.15),
    0 0 0 1px rgba(255, 255, 255, 0.1);
  padding: ${theme.spacing.md} ${theme.spacing.sm} ${theme.spacing.xl} ${theme.spacing.sm};
  
  max-height: 1200px;
  overflow-y: auto;
  z-index: 101;
  backdrop-filter: blur(10px);

  
`;

const Group = styled.div`
  & + & {
    margin-top: ${theme.spacing.md};
  }
`;

const GroupLabel = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: 0.75rem;
  opacity: 0.5;
  letter-spacing: -0.2px;
  color: ${theme.colors.fpwhite};
  margin-bottom: ${theme.spacing.xs};
  text-transform: uppercase;
`;

const GroupList = styled.div`
  display: flex;
  flex-direction: column;
`;

const ResultItem = styled.button.withConfig({ shouldForwardProp: (prop) => prop !== '$active' && prop !== '$hasThumbnail' && prop !== '$isEditorial' })`
  display: grid;
  grid-template-columns: ${({ $hasThumbnail }) => ($hasThumbnail ? '64px 1fr' : '1fr')};
  gap: ${({ $hasThumbnail }) => ($hasThumbnail ? theme.spacing.sm : theme.spacing.xs)};
  align-items: center;
  border: none;
  background: ${({ $active }) => ($active ? 'rgba(0, 0, 0, 0.08)' : 'transparent')};
  color: ${theme.colors.fpwhite};
  padding: 0.4rem 0.4rem;
  text-align: left;
  border-radius: 14px;
  cursor: pointer;
  transition: background ${theme.transitions.fast}, transform ${theme.transitions.fast}, box-shadow ${theme.transitions.fast};

  &:hover {
    background: rgba(0, 0, 0, 0.08);
    box-shadow: ${({ $hasThumbnail }) => ($hasThumbnail ? '0 12px 24px rgba(0, 0, 0, 0.12)' : '0 8px 18px rgba(0, 0, 0, 0.08)')};
    transform: translateY(-1px);
  }


`;

const ResultThumbnail = styled.img`
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: 1px;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.18);
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: ${theme.colors.fpwhite};
`;

const ResultCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
`;

const ResultTitle = styled.span`
  font-family: ${theme.fonts.primary};
  font-size: 1.2rem;
  margin-left: 3px;
  font-weight: bold;
  letter-spacing: -0.9px;
`;

const ResultMeta = styled.span`
  font-family: ${theme.fonts.primary};
  font-size: 0.90rem;
    margin-left: 6px;
    line-height: 1;
  letter-spacing: -0.5px;
  color: ${theme.colors.fpwhite};

`;

const EmptyState = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: 0.82rem;
  letter-spacing: 0.05em;
  color: ${theme.colors.fpwhite};
  padding: ${theme.spacing.sm} 0;
`;

const Backdrop = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 99;
  cursor: pointer;
  pointer-events: all;
  -webkit-tap-highlight-color: transparent;
`;

export default SearchBar;
