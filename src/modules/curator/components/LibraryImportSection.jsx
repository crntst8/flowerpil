import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { theme, DashedBox, Button } from '@shared/styles/GlobalStyles';
import { safeJson } from '@shared/utils/jsonUtils';

/* eslint-disable react/prop-types */

const PLATFORM_LABELS = {
  spotify: 'Spotify',
  apple: 'Apple Music',
  tidal: 'TIDAL'
};

const ensureHttps = (url) => {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  return url;
};

const formatAppleArtworkUrl = (template) => {
  if (!template) return '';
  let url = template;
  url = url.replace(/\{w\}/gi, '300');
  url = url.replace(/\{h\}/gi, '300');
  url = url.replace(/\{f\}/gi, 'jpg');
  url = url.replace(/\{c\}/gi, 'bb');
  return ensureHttps(url);
};

const buildTidalImageUrl = (raw) => {
  if (!raw || typeof raw !== 'string') return '';
  let val = raw.trim();
  if (!val) return '';
  if (val.startsWith('http')) return val;
  if (val.includes('resources.tidal.com/images/')) return val;
  val = val.replace(/^\/+|\/+$/g, '');
  if (/^[0-9a-fA-F-]{36,}$/.test(val) && val.includes('-')) {
    return `https://resources.tidal.com/images/${val.replace(/-/g, '/').toUpperCase()}/640x640.jpg`;
  }
  if (val.includes('/')) {
    return `https://resources.tidal.com/images/${val.toUpperCase()}/640x640.jpg`;
  }
  const hex = val.replace(/[^0-9a-f]/gi, '').toUpperCase();
  if (hex.length >= 32 && /^[0-9A-F]+$/.test(hex)) {
    const segments = hex.match(/.{1,2}/g)?.join('/') || '';
    if (segments) return `https://resources.tidal.com/images/${segments}/640x640.jpg`;
  }
  return '';
};

const resolveTidalArtwork = (attr) => {
  if (!attr) return '';
  const candidates = [
    attr.imageUrl, attr.squareImage, attr.image, attr.cover,
    attr.coverId, attr.imageId, attr.picture, attr.artwork
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === 'string') {
      const url = buildTidalImageUrl(candidate);
      if (url) return url;
    } else if (Array.isArray(candidate)) {
      const first = candidate[0];
      if (!first) continue;
      if (typeof first === 'string') {
        const url = buildTidalImageUrl(first);
        if (url) return url;
      } else if (first?.url) return first.url;
    } else if (typeof candidate === 'object') {
      if (candidate.url) return candidate.url;
      if (candidate.id) {
        const url = buildTidalImageUrl(candidate.id);
        if (url) return url;
      }
      if (candidate.uuid) {
        const url = buildTidalImageUrl(candidate.uuid);
        if (url) return url;
      }
    }
  }
  return '';
};

const formatCreationDate = (value) => {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
      month: 'short', day: 'numeric', year: 'numeric'
    }).format(date);
  } catch { return ''; }
};

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const SubTabs = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  margin-bottom: ${theme.spacing.sm};
`;

const SubTab = styled.button.withConfig({ shouldForwardProp: (p) => !['$active'].includes(p) })`
  background: ${p => p.$active ? theme.colors.selectedFill : 'transparent'};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  font-weight: ${p => p.$active ? 'bold' : 'normal'};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border: ${theme.borders.solid} ${p => p.$active ? theme.colors.selected : theme.colors.black[200]};
  color: ${theme.colors.black};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${p => p.$active ? theme.colors.selectedFill : theme.colors.black[100]};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SearchInput = styled.input`
  width: 100%;
  background: ${theme.colors.input};
  color: ${theme.colors.black};
  border: ${theme.borders.solidThin} ${theme.colors.black[300]};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  margin-bottom: ${theme.spacing.sm};

  &::placeholder {
    color: ${theme.colors.black[500]};
    opacity: 0.7;
  }

  &:focus {
    outline: none;
    border-color: ${theme.colors.selected};
  }
`;

const PlaylistsScroll = styled.div`
  max-height: 300px;
  overflow-y: auto;
  display: grid;
  gap: ${theme.spacing.sm};
`;

const PlaylistRow = styled.div.withConfig({ shouldForwardProp: (p) => !['$processing'].includes(p) })`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm};
  border: ${theme.borders.dashedThin} ${p => p.$processing ? theme.colors.selected : theme.colors.black[200]};
  background: ${p => p.$processing ? 'rgba(201, 225, 255, 0.3)' : theme.colors.white};
  transition: all 0.2s ease;

  &:hover {
    border-color: ${theme.colors.black[400]};
  }
`;

const Thumbnail = styled.img`
  width: 48px;
  height: 48px;
  object-fit: cover;
  border: ${theme.borders.dashed} ${theme.colors.gray[300]};
  flex-shrink: 0;
`;

const ThumbnailFallback = styled.div`
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border: ${theme.borders.dashed} ${theme.colors.black[300]};
  font-family: ${theme.fonts.mono};
  font-size: 9px;
  color: ${theme.colors.black[500]};
  flex-shrink: 0;
`;

const PlaylistInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const PlaylistTitle = styled.div`
  font-weight: ${theme.fontWeights.bold};
  font-size: ${theme.fontSizes.small};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const PlaylistMeta = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black[600]};
`;

const EmptyState = styled.div`
  padding: ${theme.spacing.lg};
  text-align: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black[600]};
  border: ${theme.borders.dashedThin} ${theme.colors.black[200]};
`;

const LoadingMessage = styled.div`
  padding: ${theme.spacing.lg};
  text-align: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black[600]};
`;

const InlineAlert = styled(DashedBox)`
  border-color: ${theme.colors.danger};
  background: rgba(229, 62, 62, 0.12);
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

export default function LibraryImportSection({ onImported, processingId = null }) {
  const [platform, setPlatform] = useState('apple');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const loadedRef = useRef({});
  const inflightRef = useRef(null);

  const [oauthApproval, setOauthApproval] = useState({ spotify: false });
  const [dspAuthStatus, setDspAuthStatus] = useState({ apple: false, tidal: false });
  const [approvalLoaded, setApprovalLoaded] = useState(false);

  // Fetch OAuth approval status and DSP auth status
  useEffect(() => {
    if (approvalLoaded) return;
    (async () => {
      try {
        const [approvalRes, authRes] = await Promise.all([
          fetch('/api/v1/curator/oauth-approval-status', { method: 'GET', credentials: 'include' }),
          fetch('/api/v1/export/auth/status', { method: 'GET', credentials: 'include' })
        ]);
        const approvalJson = await approvalRes.json();
        if (approvalRes.ok && approvalJson.success) {
          setOauthApproval({ spotify: approvalJson.data.spotify_oauth_approved });
        }
        const authJson = await authRes.json();
        if (authRes.ok && authJson.success) {
          const data = authJson.data || {};
          setDspAuthStatus({
            apple: !!data.apple?.contexts?.curator?.connected,
            tidal: !!data.tidal?.contexts?.curator?.connected
          });
        }
      } catch (err) {
        console.warn('Failed to load auth status:', err);
      } finally {
        setApprovalLoaded(true);
      }
    })();
  }, [approvalLoaded]);

  const availablePlatforms = useMemo(() => {
    const platforms = [];
    if (dspAuthStatus.apple) platforms.push('apple');
    if (dspAuthStatus.tidal) platforms.push('tidal');
    if (oauthApproval.spotify) platforms.push('spotify');
    return platforms;
  }, [oauthApproval.spotify, dspAuthStatus.apple, dspAuthStatus.tidal]);

  const sessionFetch = useCallback(async (url, label) => {
    const res = await fetch(url, { method: 'GET', credentials: 'include', cache: 'no-store' });
    const json = await safeJson(res, { context: `Load ${label} playlists` });
    if (res.status === 401) {
      throw new Error('Connect this platform in DSP Connections first.');
    }
    if (!res.ok || !json.success) {
      throw new Error(json.message || json.error || 'Failed to load playlists');
    }
    return json;
  }, []);

  // Load playlists
  useEffect(() => {
    if (!availablePlatforms.includes(platform)) {
      setPlatform(availablePlatforms[0] || 'apple');
      return;
    }
    if (loadedRef.current[platform]) return;
    if (inflightRef.current) return;

    const cooldownKey = `dsp-import-cooldown-${platform}`;
    const cooldownUntil = sessionStorage.getItem(cooldownKey);
    if (cooldownUntil && Date.now() < parseInt(cooldownUntil, 10)) {
      setError('Please wait before retrying.');
      loadedRef.current[platform] = true;
      return;
    }

    const controller = new AbortController();
    inflightRef.current = controller;

    (async () => {
      setLoading(true);
      setError('');
      try {
        if (platform === 'spotify') {
          const json = await sessionFetch('/api/v1/curator/dsp/spotify/playlists', 'spotify');
          const rows = json?.data?.items || [];
          if (!controller.signal.aborted) {
            setItems(rows.map(p => ({
              id: p.id,
              title: p.name,
              image: (p.images && p.images[0]?.url) || '',
              total: p.tracks?.total || 0,
              createdAt: p.created_at || ''
            })));
            loadedRef.current.spotify = true;
          }
        } else if (platform === 'apple') {
          const json = await sessionFetch('/api/v1/curator/dsp/apple/playlists', 'apple');
          const rows = json?.data?.data || [];
          if (!controller.signal.aborted) {
            setItems(rows.map(pl => ({
              id: pl.id,
              title: pl.attributes?.name || 'Apple Playlist',
              image: formatAppleArtworkUrl(pl.attributes?.artwork?.url || ''),
              total: pl.attributes?.trackCount || 0,
              createdAt: pl.attributes?.dateAdded || ''
            })));
            loadedRef.current.apple = true;
          }
        } else if (platform === 'tidal') {
          const json = await sessionFetch('/api/v1/curator/dsp/tidal/playlists', 'tidal');
          const rows = json?.data?.data || [];
          if (!controller.signal.aborted) {
            setItems(rows.map(pl => ({
              id: pl.id,
              title: pl.attributes?.title || pl.attributes?.name || 'TIDAL Playlist',
              image: resolveTidalArtwork(pl.attributes || {}) || buildTidalImageUrl(pl.relationships?.coverArt?.data?.[0]?.id) || '',
              total: pl.attributes?.numberOfItems || 0,
              createdAt: pl.attributes?.createdAt || ''
            })));
            loadedRef.current.tidal = true;
          }
        }
        sessionStorage.removeItem(cooldownKey);
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e.message || 'Failed to load playlists');
          setItems([]);
          sessionStorage.setItem(cooldownKey, String(Date.now() + 30000));
          loadedRef.current[platform] = true;
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
        inflightRef.current = null;
      }
    })();

    return () => {
      controller.abort();
      inflightRef.current = null;
    };
  }, [platform, availablePlatforms, sessionFetch]);

  useEffect(() => {
    setSearchTerm('');
  }, [platform]);

  const filteredItems = items.filter((item) => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return true;
    return item.title.toLowerCase().includes(query);
  });

  const handleImport = (item) => {
    const getPlaylistUrl = (plat, id) => {
      switch (plat) {
        case 'spotify': return `https://open.spotify.com/playlist/${id}`;
        case 'apple': return `https://music.apple.com/playlist/${id}`;
        case 'tidal': return `https://tidal.com/browse/playlist/${id}`;
        default: return '';
      }
    };
    onImported && onImported({
      platform,
      id: item.id,
      title: item.title,
      description: '',
      image: item.image,
      url: getPlaylistUrl(platform, item.id),
      total: item.total
    });
  };

  if (!approvalLoaded) {
    return <Container><LoadingMessage>Loading...</LoadingMessage></Container>;
  }

  if (availablePlatforms.length === 0) {
    return (
      <Container>
        <EmptyState>
          No DSP accounts connected. Connect Apple Music or TIDAL in DSP Connections to import from your library.
        </EmptyState>
      </Container>
    );
  }

  return (
    <Container>
      <SubTabs>
        {availablePlatforms.map((plat) => (
          <SubTab
            key={plat}
            $active={platform === plat}
            onClick={() => setPlatform(plat)}
            disabled={!!processingId}
          >
            {PLATFORM_LABELS[plat] || plat}
          </SubTab>
        ))}
      </SubTabs>

      <SearchInput
        type="search"
        value={searchTerm}
        placeholder={`Search ${PLATFORM_LABELS[platform] || platform} playlists...`}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      {error && <InlineAlert>{error}</InlineAlert>}

      <PlaylistsScroll>
        {loading && <LoadingMessage>Loading playlists...</LoadingMessage>}

        {!loading && filteredItems.length === 0 && (
          <EmptyState>
            {searchTerm.trim()
              ? 'No playlists match your search.'
              : `No ${PLATFORM_LABELS[platform]} playlists found. Make sure you're connected in DSP Connections.`}
          </EmptyState>
        )}

        {!loading && filteredItems.map(item => (
          <PlaylistRow key={item.id} $processing={processingId === item.id}>
            {item.image ? (
              <Thumbnail src={item.image} alt={item.title} />
            ) : (
              <ThumbnailFallback>No Cover</ThumbnailFallback>
            )}
            <PlaylistInfo>
              <PlaylistTitle title={item.title}>{item.title}</PlaylistTitle>
              <PlaylistMeta>
                {item.total > 0 && `${item.total} tracks`}
                {item.total > 0 && formatCreationDate(item.createdAt) && ' • '}
                {formatCreationDate(item.createdAt)}
              </PlaylistMeta>
            </PlaylistInfo>
            <Button
              onClick={() => handleImport(item)}
              variant="primary"
              disabled={!!processingId}
              style={{ flexShrink: 0 }}
            >
              {processingId === item.id ? 'Importing...' : 'Import'}
            </Button>
          </PlaylistRow>
        ))}
      </PlaylistsScroll>
    </Container>
  );
}
