import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme, DashedBox, Button } from '@shared/styles/GlobalStyles';
import { useAdminStore } from '../store/adminStore';
import { useAuth } from '@shared/contexts/AuthContext';
import * as adminService from '../services/adminService';
import { getCuratorTypeLabel } from '@shared/constants/curatorTypes';
import AdminNavButton from './AdminNavButton';
import PlaylistExportModal from './PlaylistExportModal';
import AdminPlaylistQuickEditorModal from './AdminPlaylistQuickEditorModal';
import ResponsiveImage from '@shared/components/ResponsiveImage';
import { IMAGE_SIZES } from '@shared/utils/imageUtils';

const BrowserContainer = styled(DashedBox)`
  margin-bottom: ${theme.spacing.lg};
`;

const BrowserHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${theme.spacing.lg};
  flex-wrap: wrap;
  gap: ${theme.spacing.md};
  
  h3 {
    margin: 0;
  }
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const BrowserStats = styled.p`
  margin: 4px 0 0 0;
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.6);
  font-family: ${theme.fonts.mono};
`;

const SearchAndFilters = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.lg};
  flex-wrap: wrap;
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;
  }
`;



const FilterButton = styled.button.withConfig({
  shouldForwardProp: (prop) => !['active'].includes(prop),
})`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.dashed} ${props => props.active ? theme.colors.primary : theme.colors.textSecondary};
  background: ${props => props.active ? theme.colors.primary : 'transparent'};
  color: ${props => props.active ? theme.colors.background : theme.colors.text};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    border-color: ${theme.colors.primary};
  }
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    flex: 1;
  }
`;

const PlaylistGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: ${theme.spacing.md};
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    grid-template-columns: 1fr;
  }
`;

const PlaylistCard = styled(DashedBox).withConfig({
  shouldForwardProp: (prop) => !['isActive'].includes(prop),
})`
  position: relative;
  transition: all 0.2s ease;
  
  ${props => props.isActive && `
    border-color: ${theme.colors.primary};
    background: rgba(49, 130, 206, 0.05);
    box-shadow: 0 0 0 1px ${theme.colors.primary};
  `}
  
  &:hover {
    border-color: ${theme.colors.primary};
  }
`;

const CardHeader = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.sm};
`;

const CardImageContainer = styled.div`
  width: 60px;
  height: 60px;
  border: ${theme.borders.dashed} ${theme.colors.textSecondary};
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${theme.colors.backgroundSecondary};

  img, picture {
    width: 100%;
    height: 100%;
  }

  img {
    object-fit: cover;
    display: block;
  }
`;

const NoImagePlaceholder = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.textSecondary};
  text-align: center;
`;

const CardContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const CardTitle = styled.h4`
  margin: 0 0 ${theme.spacing.xs} 0;
  font-size: ${theme.fontSizes.base};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CardMeta = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.textSecondary};
  line-height: 1.4;
`;

const StatusBadge = styled.span.withConfig({
  shouldForwardProp: (prop) => prop !== 'published'
})`
  display: inline-block;
  padding: 2px ${theme.spacing.xs};
  border: ${theme.borders.dashed} ${props => 
    props.published ? theme.colors.success : theme.colors.textSecondary
  };
  background: ${props => 
    props.published ? 'rgba(76, 175, 80, 0.1)' : 'rgba(156, 163, 175, 0.1)'
  };
  color: ${props => 
    props.published ? theme.colors.success : theme.colors.textSecondary
  };
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  margin-left: ${theme.spacing.xs};
`;

const CardActions = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  margin-top: ${theme.spacing.sm};
  flex-wrap: wrap;
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    button {
      flex: 1;
    }
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl};
  color: ${theme.colors.textSecondary};
  font-family: ${theme.fonts.mono};
  
  p {
    margin: ${theme.spacing.sm} 0;
  }
`;

const LoadingState = styled.div`
  text-align: center;
  padding: ${theme.spacing.lg};
  color: ${theme.colors.textSecondary};
  font-family: ${theme.fonts.mono};
`;

const ErrorState = styled.div`
  padding: ${theme.spacing.md};
  border: ${theme.borders.dashed} ${theme.colors.danger};
  background: rgba(229, 62, 62, 0.1);
  color: ${theme.colors.danger};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const StatusMessage = styled.div`
  padding: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.md};
  border: ${theme.borders.dashed} ${props => 
    props.type === 'error' ? theme.colors.danger : 
    props.type === 'success' ? theme.colors.success : 
    props.type === 'info' ? theme.colors.primary :
    theme.colors.primary
  };
  background: ${props => 
    props.type === 'error' ? 'rgba(229, 62, 62, 0.1)' : 
    props.type === 'success' ? 'rgba(76, 175, 80, 0.1)' : 
    props.type === 'info' ? 'rgba(49, 130, 206, 0.1)' :
    'rgba(49, 130, 206, 0.1)'
  };
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
`;

const SearchInput = styled.input`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.4);
  background: rgba(0, 0, 0, 0.7);
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  min-width: 200px;
  flex: 1;

  &::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }

  &:focus {
    outline: none;
    border-color: rgba(255, 255, 255, 0.6);
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    min-width: unset;
  }
`;

const AdminIndicator = styled.span`
  display: inline-block;
  padding: 2px ${theme.spacing.xs};
  border: ${theme.borders.dashed} ${theme.colors.warning};
  background: rgba(251, 191, 36, 0.1);
  color: ${theme.colors.warning};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  margin-left: ${theme.spacing.xs};
  text-transform: uppercase;
`;

const PlaylistBrowser = ({ onPlaylistLoad }) => {
  const { user } = useAuth();
  const {
    playlists,
    isLoadingPlaylists,
    playlistsError,
    setPlaylists,
    setLoadingPlaylists,
    setPlaylistsError,
    setCurrentPlaylist,
    setTracks
  } = useAdminStore();
  
  const [filter, setFilter] = useState('all'); // 'all', 'published', 'draft'
  const [searchTerm, setSearchTerm] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [editingPlaylistId, setEditingPlaylistId] = useState(null);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportPlaylistId, setExportPlaylistId] = useState(null);
  const [quickEditorOpen, setQuickEditorOpen] = useState(false);
  const [quickEditorPlaylistId, setQuickEditorPlaylistId] = useState(null);

  useEffect(() => {
    loadPlaylists();
  }, []);

  const showStatus = (type, message) => {
    setStatus({ type, message });
    setTimeout(() => setStatus({ type: '', message: '' }), 5000);
  };

  const loadPlaylists = async () => {
    setLoadingPlaylists(true);
    setPlaylistsError(null);
    
    try {
      const result = await adminService.getPlaylists();
      setPlaylists(result);
    } catch (error) {
      console.error('Failed to load playlists:', error);
      setPlaylistsError(error.message);
      showStatus('error', `Failed to load playlists: ${error.message}`);
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const handleLoadPlaylist = async (playlist) => {
    setEditingPlaylistId(playlist.id);
    try {
      setCurrentPlaylist(playlist);

      const tracks = await adminService.getPlaylistTracks(playlist.id);
      setTracks(tracks);

      showStatus('success', `Playlist "${playlist.title}" loaded for editing`);

      if (onPlaylistLoad) {
        onPlaylistLoad(playlist);
      }
    } catch (error) {
      console.error('Failed to load playlist:', error);
      setPlaylistsError(`Failed to load playlist: ${error.message}`);
      showStatus('error', `Failed to load playlist: ${error.message}`);
    }
  };

  const handleQuickEdit = (playlistId) => {
    setQuickEditorPlaylistId(playlistId);
    setQuickEditorOpen(true);
  };

  const handleQuickEditorSaved = async (savedPlaylist) => {
    showStatus('success', `Playlist "${savedPlaylist.title}" saved successfully`);
    await loadPlaylists(); // Refresh the list
  };

  const handleDeletePlaylist = async (playlistId, playlistTitle) => {
    if (!window.confirm(`Are you sure you want to delete playlist "${playlistTitle}"? This action cannot be undone.`)) {
      return;
    }
    
    try {
      await adminService.deletePlaylist(playlistId);
      showStatus('success', `Playlist "${playlistTitle}" deleted successfully`);
      await loadPlaylists(); // Refresh the list
    } catch (error) {
      console.error('Failed to delete playlist:', error);
      setPlaylistsError(`Failed to delete playlist: ${error.message}`);
      showStatus('error', `Failed to delete playlist: ${error.message}`);
    }
  };

  const handleTogglePublish = async (playlist) => {
    try {
      if (playlist.published) {
        // Note: We'd need an unpublish endpoint for this
        console.log('Unpublish functionality would go here');
        showStatus('info', 'Unpublish functionality not yet implemented');
      } else {
        await adminService.publishPlaylist(playlist.id);
        showStatus('success', `Playlist "${playlist.title}" published successfully`);
        await loadPlaylists(); // Refresh the list
      }
    } catch (error) {
      console.error('Failed to toggle publish status:', error);
      setPlaylistsError(`Failed to update playlist: ${error.message}`);
      showStatus('error', `Failed to update playlist: ${error.message}`);
    }
  };

  const handleExportPlaylist = (playlistId) => {
    setExportPlaylistId(playlistId);
    setExportModalOpen(true);
  };

  const filteredPlaylists = playlists.filter(playlist => {
    // Apply status filter first
    let matchesFilter = true;
    if (filter === 'published') matchesFilter = playlist.published;
    else if (filter === 'draft') matchesFilter = !playlist.published;
    
    // Apply search filter
    let matchesSearch = true;
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      matchesSearch = 
        playlist.title.toLowerCase().includes(searchLower) ||
        (playlist.curator_name && playlist.curator_name.toLowerCase().includes(searchLower));
    }
    
    return matchesFilter && matchesSearch;
  });

  const formatDate = (dateString) => {
    if (!dateString) return 'No date';
    try {
      return new Date(dateString).toLocaleDateString('en-AU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return 'Invalid date';
    }
  };

  const getImageUrl = (imagePath) => {
    if (!imagePath) return null;
    // If already a full URL, return as is
    if (imagePath.startsWith('http')) return imagePath;
    // If starts with /uploads, use as relative path for proxy
    if (imagePath.startsWith('/uploads')) {
      return imagePath;
    }
    // If no leading slash, add /uploads prefix
    return `/uploads/${imagePath}`;
  };

  return (
    <BrowserContainer>
      <BrowserHeader>
        <div>
          <h3>
            Browse Playlists
            {user?.role === 'admin' && (
              <AdminIndicator>Admin Override</AdminIndicator>
            )}
          </h3>
          <BrowserStats>
            {filteredPlaylists.length} of {playlists.length} playlists
            {searchTerm && ` matching "${searchTerm}"`}
            {editingPlaylistId && ` • Editing active`}
            {user?.role === 'admin' && ` • Full admin access to all playlists`}
          </BrowserStats>
        </div>
        <div style={{ display: 'flex', gap: theme.spacing.xs }}>
          <Button
            size="small"
            variant="success"
            onClick={() => {
              setQuickEditorPlaylistId(null); // null means create new
              setQuickEditorOpen(true);
            }}
            title="Create a new playlist using quick editor"
          >
            + New Playlist
          </Button>
          <Button
            size="small"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? "Show Browse Panel" : "Hide Browse Panel"}
          >
            {isCollapsed ? "Show" : "Hide"}
          </Button>
        </div>
      </BrowserHeader>

      {status.message && (
        <StatusMessage type={status.type}>
          {status.message}
        </StatusMessage>
      )}

      <SearchAndFilters>
        <SearchInput
          type="text"
          placeholder="Search playlists by title or curator..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <FilterButton 
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        >
          All ({playlists.length})
        </FilterButton>
        <FilterButton 
          active={filter === 'published'}
          onClick={() => setFilter('published')}
        >
          Published ({playlists.filter(p => p.published).length})
        </FilterButton>
        <FilterButton 
          active={filter === 'draft'}
          onClick={() => setFilter('draft')}
        >
          Drafts ({playlists.filter(p => !p.published).length})
        </FilterButton>
        <Button 
          onClick={loadPlaylists}
          disabled={isLoadingPlaylists}
          size="small"
        >
          Refresh
        </Button>
      </SearchAndFilters>

      {!isCollapsed && (
        <>
          {playlistsError && (
            <ErrorState>
              Error: {playlistsError}
            </ErrorState>
          )}

          {isLoadingPlaylists ? (
            <LoadingState>Loading playlists...</LoadingState>
          ) : filteredPlaylists.length === 0 ? (
            <EmptyState>
              <p>No playlists found</p>
              {filter !== 'all' && (
                <p>Try changing the filter or create a new playlist</p>
              )}
            </EmptyState>
          ) : (
            <PlaylistGrid>
              {filteredPlaylists.map(playlist => (
                <PlaylistCard 
                  key={playlist.id} 
                  isActive={editingPlaylistId === playlist.id}
                >
                  <CardHeader>
                    <CardImageContainer>
                      {playlist.image ? (
                        <ResponsiveImage
                          src={playlist.image}
                          alt={`${playlist.title} cover`}
                          sizes={IMAGE_SIZES.THUMBNAIL}
                          loading="lazy"
                          placeholder="No Image"
                          fallback={playlist.image} // Fallback to original if size variants don't exist
                        />
                      ) : (
                        <NoImagePlaceholder>
                          No Image
                        </NoImagePlaceholder>
                      )}
                    </CardImageContainer>
                    <CardContent>
                      <CardTitle>
                        {playlist.title}
                        <StatusBadge published={playlist.published}>
                          {playlist.published ? 'Published' : 'Draft'}
                        </StatusBadge>
                      </CardTitle>
                      <CardMeta>
                        <div>By {playlist.curator_name} ({getCuratorTypeLabel(playlist.curator_type)})</div>
                        <div>Created: {formatDate(playlist.created_at)}</div>
                        {playlist.publish_date && (
                          <div>Publish: {formatDate(playlist.publish_date)}</div>
                        )}
                      </CardMeta>
                    </CardContent>
                  </CardHeader>
                  
                  <CardActions>
                    <Button
                      size="small"
                      variant="primary"
                      onClick={() => handleQuickEdit(playlist.id)}
                      disabled={isLoadingPlaylists}
                      title="Quick edit in focused admin editor"
                    >
                      Quick Edit
                    </Button>
                    <Button
                      size="small"
                      variant={editingPlaylistId === playlist.id ? "primary" : "secondary"}
                      onClick={() => handleLoadPlaylist(playlist)}
                      disabled={isLoadingPlaylists}
                      title="Load into main editor panel"
                    >
                      {editingPlaylistId === playlist.id ? 'Editing' : 'Load'}
                    </Button>
                    {playlist.published && (
                      <AdminNavButton 
                        to={`/playlists/${playlist.id}`}
                        size="small"
                        variant="primary"
                        external={true}
                        title="View published playlist"
                      >
                        Open
                      </AdminNavButton>
                    )}
                    <Button 
                      size="small" 
                      variant={playlist.published ? "secondary" : "success"}
                      onClick={() => handleTogglePublish(playlist)}
                      disabled={isLoadingPlaylists}
                    >
                      {playlist.published ? 'Published' : 'Publish'}
                    </Button>
                    <Button 
                      size="small" 
                      variant="primary"
                      onClick={() => handleExportPlaylist(playlist.id)}
                      disabled={isLoadingPlaylists}
                      title="Export playlist to Spotify or Tidal"
                    >
                      Export
                    </Button>
                    <Button 
                      size="small" 
                      variant="danger"
                      onClick={() => handleDeletePlaylist(playlist.id, playlist.title)}
                      disabled={isLoadingPlaylists}
                    >
                      Delete
                    </Button>
                  </CardActions>
                </PlaylistCard>
              ))}
            </PlaylistGrid>
          )}
        </>
      )}
      
      {exportModalOpen && exportPlaylistId && (
        <PlaylistExportModal
          isOpen={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
          playlistId={exportPlaylistId}
          playlist={playlists.find(p => p.id === exportPlaylistId)}
        />
      )}

      {quickEditorOpen && (
        <AdminPlaylistQuickEditorModal
          isOpen={quickEditorOpen}
          playlistId={quickEditorPlaylistId} // Can be null for new playlists
          onClose={() => {
            setQuickEditorOpen(false);
            setQuickEditorPlaylistId(null);
          }}
          onSaved={handleQuickEditorSaved}
        />
      )}
    </BrowserContainer>
  );
};

export default PlaylistBrowser;
