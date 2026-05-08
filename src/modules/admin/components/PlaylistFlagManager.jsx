import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme, Button } from '@shared/styles/GlobalStyles';
import { adminGet, adminPost, adminDelete } from '../../admin/utils/adminApi.js';

const PlaylistFlagSection = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${theme.spacing.lg};
  margin-top: ${theme.spacing.lg};
  
  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
  }
`;

const PlaylistList = styled.div`
  max-height: 400px;
  overflow-y: auto;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.14);
  border-radius: 10px;
  padding: ${theme.spacing.sm};
  background: ${theme.colors.fpwhite};
`;

const PlaylistItem = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== '$selected'
})`
  padding: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.xs};
  border-radius: 8px;
  border: ${theme.borders.solidThin} ${({ $selected }) => ($selected ? theme.colors.black : 'transparent')};
  background: ${({ $selected }) => ($selected ? 'rgba(0, 0, 0, 0.05)' : 'transparent')};
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: rgba(0, 0, 0, 0.03);
  }
  
  .title {
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.black};
    margin-bottom: ${theme.spacing.xs};
  }
  
  .meta {
    font-size: ${theme.fontSizes.tiny};
    color: ${theme.colors.black[400]};
  }
`;

const FlagAssignmentPanel = styled.div`
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.14);
  border-radius: 10px;
  padding: ${theme.spacing.md};
  background: ${theme.colors.fpwhite};
`;

const AssignedFlagItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  margin-bottom: ${theme.spacing.xs};
  border-radius: 8px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  background: rgba(0, 0, 0, 0.02);
`;

const FlagIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  
  .flag-color {
    width: 12px;
    height: 12px;
    border: 1px solid rgba(0, 0, 0, 0.3);
    border-radius: 2px;
  }
  
  .flag-text {
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.black};
  }
`;

const AvailableFlags = styled.div`
  margin-top: ${theme.spacing.md};
  
  .header {
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.black};
    margin-bottom: ${theme.spacing.sm};
  }
`;

const AvailableFlagItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.xs};
  border: ${theme.borders.dashed} transparent;
  background: rgba(0, 0, 0, 0.02);

  &:hover {
    border-color: ${theme.colors.black};
  }
`;

const SectionHeader = styled.h3`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.medium};
  color: ${theme.colors.black};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const PlaylistFlagManager = ({ onStatusChange }) => {
  const [playlistsForFlags, setPlaylistsForFlags] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [playlistFlags, setPlaylistFlags] = useState([]);
  const [customFlags, setCustomFlags] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [flagsData, playlistsData] = await Promise.all([
        adminGet('/api/v1/admin/site-admin/custom-flags'),
        adminGet('/api/v1/admin/site-admin/playlists-for-flags')
      ]);
      setCustomFlags(flagsData.flags || []);
      setPlaylistsForFlags(playlistsData.playlists || []);
    } catch (error) {
      if (onStatusChange) {
        onStatusChange('error', `Failed to load data: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlaylist = async (playlistId) => {
    try {
      const flagsData = await adminGet(`/api/v1/admin/site-admin/playlist-flags/${playlistId}`);
      setPlaylistFlags(flagsData.assignments || []);
      setSelectedPlaylist(playlistId);
    } catch (error) {
      if (onStatusChange) {
        onStatusChange('error', `Failed to load playlist flags: ${error.message}`);
      }
    }
  };

  const handleAssignFlag = async (playlistId, flagId) => {
    try {
      await adminPost('/api/v1/admin/site-admin/playlist-flags', { playlistId, flagId });
      const flagsData = await adminGet(`/api/v1/admin/site-admin/playlist-flags/${playlistId}`);
      setPlaylistFlags(flagsData.assignments || []);
      await loadData(); // Reload to update flag counts
      if (onStatusChange) {
        onStatusChange('success', 'Tag assigned to playlist');
      }
    } catch (error) {
      if (onStatusChange) {
        onStatusChange('error', `Failed to assign tag: ${error.message}`);
      }
    }
  };

  const handleRemoveFlag = async (playlistId, flagId) => {
    try {
      await adminDelete(`/api/v1/admin/site-admin/playlist-flags/${playlistId}/${flagId}`);
      const flagsData = await adminGet(`/api/v1/admin/site-admin/playlist-flags/${playlistId}`);
      setPlaylistFlags(flagsData.assignments || []);
      await loadData(); // Reload to update flag counts
      if (onStatusChange) {
        onStatusChange('success', 'Tag removed from playlist');
      }
    } catch (error) {
      if (onStatusChange) {
        onStatusChange('error', `Failed to remove tag: ${error.message}`);
      }
    }
  };

  if (loading) {
    return <div style={{ padding: theme.spacing.md, fontFamily: theme.fonts.mono }}>Loading...</div>;
  }

  return (
    <PlaylistFlagSection>
      <div>
        <SectionHeader style={{ marginBottom: theme.spacing.md }}>
          Playlists
        </SectionHeader>
        <PlaylistList>
          {playlistsForFlags.map(playlist => (
            <PlaylistItem 
              key={playlist.id}
              $selected={selectedPlaylist === playlist.id}
              onClick={() => handleSelectPlaylist(playlist.id)}
            >
              <div className="title">{playlist.title}</div>
              <div className="meta">
                {playlist.curator_name} • {playlist.flag_count} tag{playlist.flag_count !== 1 ? 's' : ''}
              </div>
            </PlaylistItem>
          ))}
        </PlaylistList>
      </div>
      
      <div>
        <SectionHeader style={{ marginBottom: theme.spacing.md }}>
          {selectedPlaylist ? 'Tag Assignment' : 'Select a playlist'}
        </SectionHeader>
        {selectedPlaylist && (
          <div style={{
            margin: `-${theme.spacing.sm} 0 ${theme.spacing.md} 0`,
            fontFamily: theme.fonts.mono,
            fontSize: theme.fontSizes.tiny,
            color: theme.colors.black
          }}>
            Choose a tag below and click "Apply Tag".
          </div>
        )}
        <FlagAssignmentPanel>
          {selectedPlaylist ? (
            <>
              <div>
                <h4 style={{ 
                  margin: `0 0 ${theme.spacing.sm} 0`, 
                  fontFamily: theme.fonts.mono,
                  fontSize: theme.fontSizes.small,
                  color: theme.colors.black
                }}>
                  Assigned Tags
                </h4>
                {playlistFlags.length > 0 ? (
                  playlistFlags.map(assignment => (
                    <AssignedFlagItem key={assignment.id}>
                      <FlagIndicator>
                        <div 
                          className="flag-color" 
                          style={{ backgroundColor: assignment.color }}
                        />
                        <div className="flag-text">{assignment.text}</div>
                      </FlagIndicator>
                      <Button 
                        size="tiny" 
                        variant="danger"
                        onClick={() => handleRemoveFlag(selectedPlaylist, assignment.flag_id)}
                      >
                        Remove
                      </Button>
                    </AssignedFlagItem>
                  ))
                ) : (
                  <div style={{ 
                    padding: theme.spacing.md, 
                    textAlign: 'center',
                    color: theme.colors.black[400],
                    fontFamily: theme.fonts.mono,
                    fontSize: theme.fontSizes.small
                  }}>
                    No tags assigned
                  </div>
                )}
              </div>
              
              <AvailableFlags>
                <div className="header">Available Tags</div>
                {customFlags
                  .filter(flag => !playlistFlags.find(pf => pf.flag_id === flag.id))
                  .map(flag => (
                    <AvailableFlagItem key={flag.id}>
                      <FlagIndicator>
                        <div 
                          className="flag-color" 
                          style={{ backgroundColor: flag.color }}
                        />
                        <div className="flag-text">{flag.text}</div>
                      </FlagIndicator>
                      <Button 
                        size="tiny"
                        onClick={() => handleAssignFlag(selectedPlaylist, flag.id)}
                      >
                        Apply Tag
                      </Button>
                    </AvailableFlagItem>
                  ))}
                {customFlags.filter(flag => !playlistFlags.find(pf => pf.flag_id === flag.id)).length === 0 && (
                  <div style={{ 
                    padding: theme.spacing.md, 
                    textAlign: 'center',
                    color: theme.colors.black[400],
                    fontFamily: theme.fonts.mono,
                    fontSize: theme.fontSizes.small
                  }}>
                    All tags assigned
                  </div>
                )}
              </AvailableFlags>
            </>
          ) : (
            <div style={{ 
              padding: theme.spacing.lg, 
              textAlign: 'center',
              color: theme.colors.black[400],
              fontFamily: theme.fonts.mono,
              fontSize: theme.fontSizes.small
            }}>
              Select a playlist from the left to manage its tags
            </div>
          )}
        </FlagAssignmentPanel>
      </div>
    </PlaylistFlagSection>
  );
};

export default PlaylistFlagManager;
