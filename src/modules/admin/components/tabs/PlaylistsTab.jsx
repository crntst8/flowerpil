import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { theme, Button, MainBox } from '@shared/styles/GlobalStyles';
import { useAdminStore } from '../../store/adminStore';
import PlaylistForm from '../PlaylistForm';
import TrackList from '../TrackList';
import ImportTools from '../ImportTools';
import ImageUpload from '../ImageUpload';
import AdminNavButton from '../AdminNavButton';
import PlaylistInlineEditor from '../PlaylistInlineEditor';
import AdminExportModal from '../AdminExportModal';
import ContentTagManager from '../ContentTagManager';
import CrossLinkBackfillTab from '../CrossLinkBackfillTab';
import PreviewBackfillTab from '../PreviewBackfillTab';
import FeedVisibilityPanel from '../FeedVisibilityPanel';
import DormantCuratorsTab from './DormantCuratorsTab';
import { SubTabNavigation, StatusMessage } from '../shared';
import * as adminService from '../../services/adminService';

const TabStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xl};
`;

const SurfaceCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
  padding: clamp(${theme.spacing.md}, 3vw, ${theme.spacing.xl});
  border-radius: 14px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  background: ${theme.colors.fpwhite};
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.06);
`;

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
`;

const HeadingGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const SectionTitle = styled.h2`
  margin: 0;
  font-size: clamp(1.25rem, 2vw, 1.6rem);
  font-family: ${theme.fonts.primary};
  text-transform: uppercase;
  letter-spacing: -1px;
`;

const MetaText = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.58);
  letter-spacing: 0.05em;
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
`;

const StatGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.sm};
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
`;

const StatTile = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: 10px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.14);
  background: rgba(0, 0, 0, 0.028);
`;

const StatLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.6);
`;

const StatValue = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: clamp(1.3rem, 2.2vw, 1.6rem);
  letter-spacing: 0.04em;
  font-weight: bold;
`;

const StatMeta = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.5);
`;

const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: 10px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.08);
  background: rgba(0, 0, 0, 0.02);
`;

const SearchInput = styled.input`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.25);
  background: ${theme.colors.fpwhite};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  min-width: 240px;
  border-radius: 6px;

  &:focus {
    border-color: ${theme.colors.black};
    outline: none;
  }
`;

const Select = styled.select`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.25);
  background: ${theme.colors.fpwhite};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  border-radius: 6px;

  &:focus {
    border-color: ${theme.colors.black};
    outline: none;
  }
`;

const TableShell = styled.div`
  border-radius: 12px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  background: ${theme.colors.fpwhite};
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.02);
`;

const TableScroll = styled.div`
  max-height: 460px;
  overflow-y: auto;
  position: relative;
`;

const TableHeaderRow = styled.div`
  display: grid;
  grid-template-columns: 2.8fr 1.6fr 1fr 1fr 1.4fr;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: rgba(255, 255, 255, 0.92);
  border-bottom: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  position: sticky;
  top: 0;
  z-index: 2;
  backdrop-filter: blur(4px);

  @media (max-width: ${theme.breakpoints.tablet}) {
    display: none;
  }
`;

const DataRow = styled.div`
  display: grid;
  grid-template-columns: 2.8fr 1.6fr 1fr 1fr 1.4fr;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-bottom: ${theme.borders.solidThin} rgba(0, 0, 0, 0.05);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  align-items: center;
  background: ${({ $highlight }) => ($highlight ? 'rgba(0, 0, 0, 0.04)' : 'transparent')};
  transition: background 0.15s ease-in-out;

  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
  }
`;

const TableCell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const TitleCell = styled(TableCell)`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.medium};
  font-weight: ${theme.fontWeights.semibold};
`;

const Meta = styled.span`
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.6);
`;

const TableActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
  justify-content: flex-end;
`;

const EmptyState = styled.div`
  padding: ${theme.spacing.lg};
  text-align: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.6);
`;

const WorkspaceGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.lg};
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
  }
`;

const Column = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
`;

const Panel = styled(MainBox)`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  padding: clamp(${theme.spacing.md}, 2vw, ${theme.spacing.lg});
  border-color: rgba(0, 0, 0, 0.1);
  background: ${theme.colors.fpwhite};
  border-radius: 10px;
`;

const ActionBar = styled(Panel)`
  flex-direction: column;

  @media (min-width: ${theme.breakpoints.tablet}) {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
`;

const ActionButtons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
`;

const LinkActions = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
  align-items: center;
`;

const GhostButton = styled(Button)`
  background: transparent;
  border-color: rgba(0, 0, 0, 0.28);
  color: ${theme.colors.black};
  text-transform: none;
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.04em;
  padding: ${theme.spacing.xs} ${theme.spacing.sm};

  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.05);
    border-color: ${theme.colors.black};
  }
`;

const PlaylistsTab = () => {
  const {
    currentPlaylist,
    tracks,
    isLoading,
    error,
    setCurrentPlaylist,
    setTracks,
    setLoading,
    clearError
  } = useAdminStore();

  const [playlistSummaries, setPlaylistSummaries] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [status, setStatus] = useState({ type: '', message: '' });
  const [formErrors, setFormErrors] = useState({});
  const statusTimerRef = useRef(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportModalPlaylist, setExportModalPlaylist] = useState(null);

  const showStatus = useCallback((type, message) => {
    setStatus({ type, message });
    if (statusTimerRef.current) {
      window.clearTimeout(statusTimerRef.current);
    }
    statusTimerRef.current = window.setTimeout(() => {
      setStatus({ type: '', message: '' });
      statusTimerRef.current = null;
    }, 5000);
  }, []);

  useEffect(() => {
    if (error) {
      showStatus('error', error);
    }
  }, [error, showStatus]);

  useEffect(() => {
    if (formErrors.title && currentPlaylist?.title?.trim()) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next.title;
        return next;
      });
    }
  }, [formErrors.title, currentPlaylist?.title]);

  useEffect(() => () => {
    if (statusTimerRef.current) {
      window.clearTimeout(statusTimerRef.current);
    }
  }, []);

  const formatDate = useCallback((value) => {
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }).format(new Date(value));
    } catch {
      return '—';
    }
  }, []);

  const loadSummaries = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try {
      const params = {
        limit: 100,
        sort: 'publish_date',
        order: 'desc'
      };
      if (searchTerm.trim()) params.search = searchTerm.trim();
      if (statusFilter !== 'all') {
        params.published = statusFilter === 'published';
      }
      const data = await adminService.getPlaylistSummaries(params);
      setPlaylistSummaries(data || []);
    } catch (err) {
      console.error('Failed to load playlist summaries:', err);
      setListError(err?.message || 'Failed to load playlists');
    } finally {
      setListLoading(false);
    }
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    loadSummaries();
  }, [loadSummaries]);

  const summaryStats = useMemo(() => {
    const total = playlistSummaries.length;
    const published = playlistSummaries.filter(p => p.published).length;
    const flagged = playlistSummaries.filter(p => (p.flag_count || 0) > 0 || (p.content_flag_count || 0) > 0).length;
    return { total, published, flagged };
  }, [playlistSummaries]);

  const loadPlaylistById = useCallback(async (playlistId) => {
    if (!playlistId) return;
    setLoading(true);
    try {
      clearError();
      const playlist = await adminService.getPlaylistById(playlistId);
      const playlistTracks = await adminService.getPlaylistTracks(playlistId);
      setCurrentPlaylist(playlist);
      setTracks(playlistTracks);
      showStatus('success', `Loaded "${playlist.title}"`);
    } catch (err) {
      console.error('Failed to load playlist by id:', err);
      showStatus('error', err?.message || 'Failed to load playlist');
    } finally {
      setLoading(false);
    }
  }, [clearError, setCurrentPlaylist, setTracks, setLoading, showStatus]);

  const handleSave = async () => {
    if (!currentPlaylist.title?.trim()) {
      setFormErrors({ title: 'Title is required' });
      showStatus('error', 'Playlist title is required');
      return;
    }

    setFormErrors({});
    setLoading(true);
    try {
      const result = await adminService.savePlaylist({
        ...currentPlaylist,
        tracks
      });

      setCurrentPlaylist(result);
      showStatus('success', 'Playlist saved successfully');
      await loadSummaries();
    } catch (err) {
      showStatus('error', `Failed to save: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLoad = async () => {
    setLoading(true);
    try {
      const playlists = await adminService.getPlaylists();
      if (playlists.length > 0) {
        const playlist = playlists[0];
        setCurrentPlaylist(playlist);

        const playlistTracks = await adminService.getPlaylistTracks(playlist.id);
        setTracks(playlistTracks);

        showStatus('success', 'Playlist loaded successfully');
      } else {
        showStatus('error', 'No playlists found');
      }
    } catch (err) {
      showStatus('error', `Failed to load: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!currentPlaylist.id) {
      showStatus('error', 'Save playlist before publishing');
      return;
    }

    setLoading(true);
    try {
      await adminService.publishPlaylist(currentPlaylist.id);
      setCurrentPlaylist({ ...currentPlaylist, published: true });
      showStatus('success', 'Playlist published successfully');
      await loadSummaries();
    } catch (err) {
      showStatus('error', `Failed to publish: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setCurrentPlaylist({
      title: '',
      curator_name: '',
      curator_type: 'artist',
      description: '',
      description_short: '',
      tags: '',
      image: '',
      publish_date: new Date().toISOString().split('T')[0],
      published: false,
      spotify_url: '',
      apple_url: '',
      tidal_url: '',
      custom_action_label: '',
      custom_action_url: '',
      custom_action_icon: '',
      custom_action_icon_source: ''
    });
    setTracks([]);
    clearError();
    showStatus('success', 'Form reset');
    loadSummaries();
  };

  const handleImageUpload = (imageData) => {
    setCurrentPlaylist({
      ...currentPlaylist,
      image: imageData
    });
  };

  const handleTracksImport = (importedTracks) => {
    setTracks([...(tracks || []), ...importedTracks]);
    showStatus('success', `Imported ${importedTracks.length} track${importedTracks.length === 1 ? '' : 's'}`);
  };

  const handlePlaylistImported = (info) => {
    try {
      const updated = { ...currentPlaylist };
      if (!updated.title && info?.name) updated.title = info.name;
      if (!updated.description_short && (info?.description || info?.description_short)) {
        updated.description_short = info.description || info.description_short;
      }
      if (!updated.image && info?.image) updated.image = info.image;
      if (info?.spotify_url) updated.spotify_url = info.spotify_url;
      if (info?.apple_url) updated.apple_url = info.apple_url;
      if (info?.tidal_url) updated.tidal_url = info.tidal_url;
      setCurrentPlaylist(updated);
    } catch (e) {
      // Swallow parsing errors but retain import.
    }
  };

  const handleStatusChange = useCallback((type, message) => {
    showStatus(type, message);
  }, [showStatus]);

  // Playlist management tab content
  const playlistManagementContent = (
    <TabStack>
      <SurfaceCard>
        <HeaderRow>
          <HeadingGroup>
            <SectionTitle>Playlists</SectionTitle>
            <MetaText>
              Showing {summaryStats.total} playlists • {summaryStats.published} published • {summaryStats.flagged} flagged
            </MetaText>
          </HeadingGroup>
          <HeaderActions>
            <GhostButton onClick={loadSummaries} disabled={listLoading}>
              {listLoading ? 'Refreshing…' : 'Refresh'}
            </GhostButton>
          </HeaderActions>
        </HeaderRow>

        <StatGrid>
          <StatTile>
            <StatLabel>Total Playlists</StatLabel>
            <StatValue>{summaryStats.total}</StatValue>
            <StatMeta>Includes drafts & published</StatMeta>
          </StatTile>
          <StatTile>
            <StatLabel>Published</StatLabel>
            <StatValue>{summaryStats.published}</StatValue>
            <StatMeta>Live on latest & curator pages</StatMeta>
          </StatTile>
          <StatTile>
            <StatLabel>Flagged</StatLabel>
            <StatValue>{summaryStats.flagged}</StatValue>
            <StatMeta>Needs review for content tags</StatMeta>
          </StatTile>
        </StatGrid>

        <Toolbar>
          <SearchInput
            placeholder="Search playlists or curators"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="published">Published</option>
            <option value="draft">Drafts</option>
          </Select>
        </Toolbar>

        {listError && (
          <MetaText style={{ color: theme.colors.danger }}>{listError}</MetaText>
        )}

        <TableShell role="table" aria-label="Playlist overview">
          <TableScroll>
            <TableHeaderRow role="row">
              <span role="columnheader">Title</span>
              <span role="columnheader">Curator</span>
              <span role="columnheader">Tracks</span>
              <span role="columnheader">Export Status</span>
              <span role="columnheader">Actions</span>
            </TableHeaderRow>

            {listLoading ? (
              <EmptyState role="row">Loading playlists…</EmptyState>
            ) : playlistSummaries.length === 0 ? (
              <EmptyState role="row">No playlists match the current filters.</EmptyState>
            ) : (
              playlistSummaries.map((playlist) => (
                <PlaylistInlineEditor
                  key={playlist.id}
                  playlist={playlist}
                  onSave={async (id, changes) => {
                    try {
                      const result = await adminService.updatePlaylistMetadata(id, changes, playlist.updated_at);
                      if (result.conflict) {
                        showStatus('error', 'Playlist was modified by another user. Please reload.');
                        return;
                      }
                      if (result.warnings && result.warnings.length > 0) {
                        showStatus('warning', result.warnings[0].message);
                      }
                      if (result.success) {
                        showStatus('success', 'Playlist updated successfully');
                        await loadSummaries();
                      }
                    } catch (err) {
                      throw new Error(err.message || 'Failed to save playlist');
                    }
                  }}
                  onCancel={() => {}}
                  onOpenModal={(id) => {
                    loadPlaylistById(id);
                  }}
                  onOpenExportModal={(playlist) => {
                    setExportModalPlaylist(playlist);
                    setExportModalOpen(true);
                  }}
                  onDelete={async (id) => {
                    try {
                      await adminService.deletePlaylist(id);
                      showStatus('success', 'Playlist deleted successfully');
                      await loadSummaries();
                    } catch (err) {
                      showStatus('error', err.message || 'Failed to delete playlist');
                      throw err;
                    }
                  }}
                />
              ))
            )}
          </TableScroll>
        </TableShell>
      </SurfaceCard>

      <WorkspaceGrid>
        <Column>
          <ImportTools
            onTracksImport={handleTracksImport}
            onPlaylistImported={handlePlaylistImported}
            disabled={isLoading}
          />
          <PlaylistForm
            playlist={currentPlaylist}
            onChange={setCurrentPlaylist}
            disabled={isLoading}
            errors={formErrors}
          />
          <ImageUpload
            currentImage={currentPlaylist?.image}
            onImageUpload={handleImageUpload}
            disabled={isLoading}
            uploadType="playlists"
          />
        </Column>

        <Column>
          <TrackList
            tracks={tracks}
            onChange={setTracks}
            disabled={isLoading}
          />
        </Column>
      </WorkspaceGrid>

      {status.message && (
        <StatusMessage type={status.type} message={status.message} />
      )}

      <ActionBar>
        <LinkActions>
          {currentPlaylist?.id && currentPlaylist?.published && (
            <AdminNavButton
              to={`/playlists/${currentPlaylist.id}`}
              size="small"
              variant="primary"
              external
              title="View current playlist"
            >
              View Current Playlist
            </AdminNavButton>
          )}
        </LinkActions>

        <ActionButtons>
          <GhostButton onClick={handleLoad} disabled={isLoading}>
            Load
          </GhostButton>
          <Button onClick={handleSave} disabled={isLoading} variant="primary">
            Save
          </Button>
          <Button
            onClick={handlePublish}
            disabled={isLoading || !currentPlaylist?.id}
            variant="success"
          >
            Publish
          </Button>
          <GhostButton
            onClick={handleReset}
            disabled={isLoading}
          >
            Reset
          </GhostButton>
        </ActionButtons>
      </ActionBar>

      <AdminExportModal
        isOpen={exportModalOpen}
        onClose={() => {
          setExportModalOpen(false);
          setExportModalPlaylist(null);
        }}
        playlist={exportModalPlaylist}
        onExport={async (destinations) => {
          try {
            const result = await adminService.queueExportForPlaylist(
              exportModalPlaylist.id,
              { destinations, forceFlowerpil: true }
            );
            if (result.success) {
              showStatus('success', `Export queued for ${destinations.join(', ')}`);
              await loadSummaries();
            }
          } catch (err) {
            showStatus('error', err.message || 'Failed to queue export');
            throw err;
          }
        }}
      />
    </TabStack>
  );

  // Content tags tab content
  const contentTagsContent = (
    <TabStack>
      {status.message && (
        <StatusMessage type={status.type} message={status.message} />
      )}
      <ContentTagManager onStatusChange={handleStatusChange} />
    </TabStack>
  );

  const tabs = [
    {
      id: 'playlists',
      label: 'Playlists',
      content: playlistManagementContent
    },
    {
      id: 'dormant',
      label: 'Dormant',
      content: <DormantCuratorsTab />
    },
    {
      id: 'visibility',
      label: 'Visibility',
      content: <FeedVisibilityPanel />
    },
    {
      id: 'cross-links',
      label: 'Cross-Links',
      content: <CrossLinkBackfillTab />
    },
    {
      id: 'previews',
      label: 'Previews',
      content: <PreviewBackfillTab />
    },
    {
      id: 'content-tags',
      label: 'Content Tags',
      content: contentTagsContent
    }
  ];

  return <SubTabNavigation tabs={tabs} defaultTab="playlists" />;
};

export default PlaylistsTab;
