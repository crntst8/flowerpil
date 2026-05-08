import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { theme, Button, DashedBox } from '@shared/styles/GlobalStyles';
import { StatusMessage } from './shared';
import useAuthenticatedApi from '../hooks/useAuthenticatedApi';

const FeedVisibilityPanel = () => {
  const { authenticatedFetch, isAuthenticated } = useAuthenticatedApi();
  const [playlists, setPlaylists] = useState([]);
  const [config, setConfig] = useState({ pinned: [], hidden: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('all'); // 'all', 'pinned', 'hidden', 'normal'

  const showStatus = useCallback((type, message) => {
    setStatus({ type, message });
    if (type === 'success') {
      setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authenticatedFetch('/api/v1/admin/feed-visibility/playlists');
      const data = await response.json();
      if (data.success) {
        setPlaylists(data.data.playlists || []);
        setConfig(data.data.config || { pinned: [], hidden: [] });
      } else {
        showStatus('error', data.error || 'Failed to load playlists');
      }
    } catch (error) {
      console.error('[FeedVisibilityPanel] Load error:', error);
      showStatus('error', 'Failed to load feed visibility data');
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch, showStatus]);

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated, loadData]);

  const saveConfig = useCallback(async (newConfig) => {
    setSaving(true);
    try {
      const response = await authenticatedFetch('/api/v1/admin/feed-visibility', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      const data = await response.json();
      if (data.success) {
        setConfig(data.data);
        showStatus('success', 'Feed visibility updated');
        // Update local playlist states
        setPlaylists(prev => prev.map(p => ({
          ...p,
          visibility: {
            isPinned: data.data.pinned.includes(p.id),
            isHidden: data.data.hidden.includes(p.id),
            pinnedPosition: data.data.pinned.indexOf(p.id)
          }
        })));
      } else {
        showStatus('error', data.error || 'Failed to save');
      }
    } catch (error) {
      console.error('[FeedVisibilityPanel] Save error:', error);
      showStatus('error', 'Failed to save feed visibility');
    } finally {
      setSaving(false);
    }
  }, [authenticatedFetch, showStatus]);

  const handlePin = useCallback((playlistId) => {
    const newPinned = [...config.pinned, playlistId];
    const newHidden = config.hidden.filter(id => id !== playlistId);
    saveConfig({ pinned: newPinned, hidden: newHidden });
  }, [config, saveConfig]);

  const handleUnpin = useCallback((playlistId) => {
    const newPinned = config.pinned.filter(id => id !== playlistId);
    saveConfig({ ...config, pinned: newPinned });
  }, [config, saveConfig]);

  const handleHide = useCallback((playlistId) => {
    const newPinned = config.pinned.filter(id => id !== playlistId);
    const newHidden = [...config.hidden, playlistId];
    saveConfig({ pinned: newPinned, hidden: newHidden });
  }, [config, saveConfig]);

  const handleUnhide = useCallback((playlistId) => {
    const newHidden = config.hidden.filter(id => id !== playlistId);
    saveConfig({ ...config, hidden: newHidden });
  }, [config, saveConfig]);

  const handleMoveUp = useCallback((playlistId) => {
    const index = config.pinned.indexOf(playlistId);
    if (index <= 0) return;
    const newPinned = [...config.pinned];
    [newPinned[index - 1], newPinned[index]] = [newPinned[index], newPinned[index - 1]];
    saveConfig({ ...config, pinned: newPinned });
  }, [config, saveConfig]);

  const handleMoveDown = useCallback((playlistId) => {
    const index = config.pinned.indexOf(playlistId);
    if (index < 0 || index >= config.pinned.length - 1) return;
    const newPinned = [...config.pinned];
    [newPinned[index], newPinned[index + 1]] = [newPinned[index + 1], newPinned[index]];
    saveConfig({ ...config, pinned: newPinned });
  }, [config, saveConfig]);

  const filteredPlaylists = useMemo(() => {
    let result = playlists;

    // Filter by view mode
    if (viewMode === 'pinned') {
      result = result.filter(p => p.visibility.isPinned);
    } else if (viewMode === 'hidden') {
      result = result.filter(p => p.visibility.isHidden);
    } else if (viewMode === 'normal') {
      result = result.filter(p => !p.visibility.isPinned && !p.visibility.isHidden);
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const needle = searchTerm.toLowerCase();
      result = result.filter(p =>
        p.title?.toLowerCase().includes(needle) ||
        p.curator_name?.toLowerCase().includes(needle)
      );
    }

    // Sort: pinned first (by position), then by publish date
    return result.sort((a, b) => {
      const aPin = config.pinned.indexOf(a.id);
      const bPin = config.pinned.indexOf(b.id);
      if (aPin !== -1 && bPin !== -1) return aPin - bPin;
      if (aPin !== -1) return -1;
      if (bPin !== -1) return 1;
      // Sort by published_at descending for non-pinned
      const aDate = new Date(a.published_at || a.publish_date || 0);
      const bDate = new Date(b.published_at || b.publish_date || 0);
      return bDate - aDate;
    });
  }, [playlists, viewMode, searchTerm, config.pinned]);

  const stats = useMemo(() => ({
    total: playlists.length,
    pinned: config.pinned.length,
    hidden: config.hidden.length,
    normal: playlists.length - config.pinned.length - config.hidden.length
  }), [playlists, config]);

  if (!isAuthenticated) {
    return <Surface>Authenticate to manage feed visibility.</Surface>;
  }

  return (
    <Surface>
      <Header>
        <div>
          <Title>Feed Visibility</Title>
          <Subtitle>Control playlist order and visibility on the landing page</Subtitle>
        </div>
        <Button onClick={loadData} disabled={loading || saving} variant="secondary">
          {loading ? 'Loading...' : 'Refresh'}
        </Button>
      </Header>

      {status.message && <StatusMessage type={status.type} message={status.message} />}

      <StatRow>
        <StatTile>
          <StatLabel>Total</StatLabel>
          <StatValue>{stats.total}</StatValue>
        </StatTile>
        <StatTile $variant="pinned">
          <StatLabel>Pinned</StatLabel>
          <StatValue>{stats.pinned}</StatValue>
        </StatTile>
        <StatTile $variant="hidden">
          <StatLabel>Hidden</StatLabel>
          <StatValue>{stats.hidden}</StatValue>
        </StatTile>
        <StatTile>
          <StatLabel>Normal</StatLabel>
          <StatValue>{stats.normal}</StatValue>
        </StatTile>
      </StatRow>

      <InfoBox>
        <strong>How it works:</strong>
        <ul>
          <li><strong>Pinned</strong> playlists appear first on the landing page, in the exact order shown below</li>
          <li><strong>Hidden</strong> playlists are excluded from the landing page but still visible on /playlists</li>
          <li><strong>Normal</strong> playlists appear after pinned ones, sorted by publish date</li>
        </ul>
      </InfoBox>

      <Toolbar>
        <SearchInput
          placeholder="Search playlists..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <FilterGroup>
          <FilterButton $active={viewMode === 'all'} onClick={() => setViewMode('all')}>
            All ({stats.total})
          </FilterButton>
          <FilterButton $active={viewMode === 'pinned'} onClick={() => setViewMode('pinned')}>
            Pinned ({stats.pinned})
          </FilterButton>
          <FilterButton $active={viewMode === 'hidden'} onClick={() => setViewMode('hidden')}>
            Hidden ({stats.hidden})
          </FilterButton>
          <FilterButton $active={viewMode === 'normal'} onClick={() => setViewMode('normal')}>
            Normal ({stats.normal})
          </FilterButton>
        </FilterGroup>
      </Toolbar>

      {loading ? (
        <LoadingState>Loading playlists...</LoadingState>
      ) : filteredPlaylists.length === 0 ? (
        <EmptyState>No playlists match the current filter.</EmptyState>
      ) : (
        <PlaylistList>
          {filteredPlaylists.map((playlist, index) => {
            const isPinned = playlist.visibility.isPinned;
            const isHidden = playlist.visibility.isHidden;
            const pinnedIndex = config.pinned.indexOf(playlist.id);

            return (
              <PlaylistRow key={playlist.id} $isPinned={isPinned} $isHidden={isHidden}>
                <RowLeft>
                  {isPinned && (
                    <PositionBadge>#{pinnedIndex + 1}</PositionBadge>
                  )}
                  <PlaylistInfo>
                    <PlaylistTitle>{playlist.title}</PlaylistTitle>
                    <PlaylistMeta>
                      {playlist.curator_name} &bull; {formatDate(playlist.published_at || playlist.publish_date)}
                    </PlaylistMeta>
                  </PlaylistInfo>
                </RowLeft>

                <StatusBadges>
                  {isPinned && <Badge $type="pinned">Pinned</Badge>}
                  {isHidden && <Badge $type="hidden">Hidden</Badge>}
                  {!isPinned && !isHidden && <Badge $type="normal">Normal</Badge>}
                </StatusBadges>

                <ActionGroup>
                  {isPinned && (
                    <>
                      <ActionButton
                        onClick={() => handleMoveUp(playlist.id)}
                        disabled={saving || pinnedIndex === 0}
                        title="Move up"
                      >
                        Move Up
                      </ActionButton>
                      <ActionButton
                        onClick={() => handleMoveDown(playlist.id)}
                        disabled={saving || pinnedIndex === config.pinned.length - 1}
                        title="Move down"
                      >
                        Move Down
                      </ActionButton>
                      <ActionButton
                        onClick={() => handleUnpin(playlist.id)}
                        disabled={saving}
                        $variant="revert"
                      >
                        Unpin
                      </ActionButton>
                    </>
                  )}

                  {isHidden && (
                    <ActionButton
                      onClick={() => handleUnhide(playlist.id)}
                      disabled={saving}
                      $variant="revert"
                    >
                      Unhide
                    </ActionButton>
                  )}

                  {!isPinned && !isHidden && (
                    <>
                      <ActionButton
                        onClick={() => handlePin(playlist.id)}
                        disabled={saving}
                        $variant="pin"
                      >
                        Pin to Top
                      </ActionButton>
                      <ActionButton
                        onClick={() => handleHide(playlist.id)}
                        disabled={saving}
                        $variant="hide"
                      >
                        Hide
                      </ActionButton>
                    </>
                  )}

                  {isPinned && (
                    <ActionButton
                      onClick={() => handleHide(playlist.id)}
                      disabled={saving}
                      $variant="hide"
                    >
                      Hide
                    </ActionButton>
                  )}
                </ActionGroup>
              </PlaylistRow>
            );
          })}
        </PlaylistList>
      )}
    </Surface>
  );
};

const formatDate = (value) => {
  if (!value) return 'No date';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(new Date(value));
  } catch {
    return 'Invalid date';
  }
};

const Surface = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
  padding: clamp(${theme.spacing.md}, 2vw, ${theme.spacing.xl});
  background: ${theme.colors.fpwhite};
  border-radius: 12px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
`;

const Title = styled.h2`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: clamp(1.4rem, 3vw, 2rem);
  letter-spacing: -0.4px;
`;

const Subtitle = styled.p`
  margin: 0;
  color: rgba(0, 0, 0, 0.6);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const StatRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: ${theme.spacing.sm};
`;

const StatTile = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: 8px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.1);
  background: ${({ $variant }) =>
    $variant === 'pinned' ? 'rgba(34, 139, 34, 0.08)' :
    $variant === 'hidden' ? 'rgba(220, 53, 69, 0.08)' :
    'rgba(0, 0, 0, 0.02)'};
`;

const StatLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(0, 0, 0, 0.6);
`;

const StatValue = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.h4};
  font-weight: bold;
`;

const InfoBox = styled(DashedBox)`
  background: rgba(0, 0, 0, 0.02);
  font-size: ${theme.fontSizes.small};

  strong {
    display: block;
    margin-bottom: ${theme.spacing.xs};
  }

  ul {
    margin: 0;
    padding-left: ${theme.spacing.md};
  }

  li {
    margin-bottom: 4px;
  }
`;

const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${theme.spacing.md};
`;

const SearchInput = styled.input`
  padding: ${theme.spacing.sm};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  min-width: 200px;
  flex: 1;

  &:focus {
    outline: none;
    border-color: ${theme.colors.black};
  }
`;

const FilterGroup = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
`;

const FilterButton = styled.button`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  background: ${({ $active }) => $active ? theme.colors.black : 'transparent'};
  color: ${({ $active }) => $active ? theme.colors.fpwhite : theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: ${({ $active }) => $active ? theme.colors.black : 'rgba(0, 0, 0, 0.05)'};
  }
`;

const LoadingState = styled.div`
  padding: ${theme.spacing.xl};
  text-align: center;
  font-family: ${theme.fonts.mono};
  color: rgba(0, 0, 0, 0.5);
`;

const EmptyState = styled.div`
  padding: ${theme.spacing.xl};
  text-align: center;
  font-family: ${theme.fonts.mono};
  color: rgba(0, 0, 0, 0.5);
  border: ${theme.borders.dashedThin} rgba(0, 0, 0, 0.15);
  border-radius: 8px;
`;

const PlaylistList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  max-height: 600px;
  overflow-y: auto;
`;

const PlaylistRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: ${theme.spacing.md};
  align-items: center;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: 8px;
  border: ${theme.borders.solidThin} ${({ $isPinned, $isHidden }) =>
    $isPinned ? 'rgba(34, 139, 34, 0.3)' :
    $isHidden ? 'rgba(220, 53, 69, 0.3)' :
    'rgba(0, 0, 0, 0.1)'};
  background: ${({ $isPinned, $isHidden }) =>
    $isPinned ? 'rgba(34, 139, 34, 0.04)' :
    $isHidden ? 'rgba(220, 53, 69, 0.04)' :
    theme.colors.fpwhite};
  transition: all 0.15s ease;

  &:hover {
    border-color: rgba(0, 0, 0, 0.25);
  }

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
    gap: ${theme.spacing.sm};
  }
`;

const RowLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
`;

const PositionBadge = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  border-radius: 6px;
  background: rgba(34, 139, 34, 0.15);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  font-weight: bold;
  color: rgba(34, 139, 34, 1);
`;

const PlaylistInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const PlaylistTitle = styled.span`
  font-weight: ${theme.fontWeights.semibold};
`;

const PlaylistMeta = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.5);
`;

const StatusBadges = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
`;

const Badge = styled.span`
  padding: 4px 8px;
  border-radius: 4px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: ${({ $type }) =>
    $type === 'pinned' ? 'rgba(34, 139, 34, 0.15)' :
    $type === 'hidden' ? 'rgba(220, 53, 69, 0.15)' :
    'rgba(0, 0, 0, 0.08)'};
  color: ${({ $type }) =>
    $type === 'pinned' ? 'rgba(34, 139, 34, 1)' :
    $type === 'hidden' ? 'rgba(220, 53, 69, 1)' :
    'rgba(0, 0, 0, 0.6)'};
`;

const ActionGroup = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
`;

const ActionButton = styled.button`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  background: transparent;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  cursor: pointer;
  transition: all 0.15s ease;

  ${({ $variant }) => {
    switch ($variant) {
      case 'pin':
        return `
          background: rgba(34, 139, 34, 0.1);
          border-color: rgba(34, 139, 34, 0.3);
          color: rgba(34, 139, 34, 1);
          &:hover:not(:disabled) {
            background: rgba(34, 139, 34, 0.2);
          }
        `;
      case 'hide':
        return `
          background: rgba(220, 53, 69, 0.1);
          border-color: rgba(220, 53, 69, 0.3);
          color: rgba(220, 53, 69, 1);
          &:hover:not(:disabled) {
            background: rgba(220, 53, 69, 0.2);
          }
        `;
      case 'revert':
        return `
          background: rgba(0, 0, 0, 0.05);
          &:hover:not(:disabled) {
            background: rgba(0, 0, 0, 0.1);
          }
        `;
      default:
        return `
          &:hover:not(:disabled) {
            background: rgba(0, 0, 0, 0.05);
          }
        `;
    }
  }}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export default FeedVisibilityPanel;
