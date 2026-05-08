import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import {
  ModalRoot,
  ModalSurface,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  ModalCloseButton
} from '@shared/components/Modal';
import { theme, Button } from '@shared/styles/GlobalStyles';
import {
  createExportRequest,
  getCuratorDetails
} from '../../services/adminService';

const ModalContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const SummaryRow = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
`;

const MetricCard = styled.div`
  display: inline-flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border-radius: 999px;
  border: ${theme.borders.dashed} rgba(0, 0, 0, 0.2);
  background: rgba(0, 0, 0, 0.03);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: ${theme.colors.black};
`;

const PlatformsRow = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
  align-items: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  background: rgba(0, 0, 0, 0.02);
  border-radius: 6px;
`;

const PlatformOption = styled.label`
  display: inline-flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  cursor: pointer;
`;

const ScrollGroups = styled.div`
  max-height: calc(65vh - 200px);
  overflow-y: auto;
  padding-right: ${theme.spacing.sm};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const CuratorGroup = styled.div`
  border: ${theme.borders.dashed} rgba(0, 0, 0, 0.18);
  border-radius: 6px;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background: ${theme.colors.fpwhite};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const GroupHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;

  h4 {
    margin: 0;
    font-size: ${theme.fontSizes.medium};
    color: ${theme.colors.black};
  }

  span {
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.tiny};
    color: rgba(0, 0, 0, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
`;

const PlaylistList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const PlaylistItem = styled.label`
  display: flex;
  align-items: flex-start;
  gap: ${theme.spacing.xs};
  cursor: pointer;
  padding: 3px 0;

  input {
    cursor: pointer;
    margin-top: 2px;
  }
`;

const InlineMeta = styled.span`
  display: block;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.6);
`;

const StatusBanner = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  border: ${theme.borders.dashed} ${({ $variant }) =>
    $variant === 'error' ? theme.colors.danger : theme.colors.success};
  background: ${({ $variant }) =>
    $variant === 'error' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(34, 197, 94, 0.12)'};
  color: ${({ $variant }) =>
    $variant === 'error' ? theme.colors.danger : theme.colors.success};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border-radius: 2px;
`;

const PLATFORM_OPTIONS = [
  { id: 'spotify', label: 'Spotify' },
  { id: 'apple', label: 'Apple Music' },
  { id: 'tidal', label: 'Tidal' }
];

const CuratorBulkExportModal = ({
  isOpen,
  curatorIds,
  onClose,
  onQueued
}) => {
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [curatorData, setCuratorData] = useState([]);
  const [selectedPlaylists, setSelectedPlaylists] = useState(new Set());
  const [selectedPlatforms, setSelectedPlatforms] = useState(new Set(['spotify']));
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });
  const totalCurators = curatorData.length;
  const totalPublishedPlaylists = useMemo(
    () => curatorData.reduce((sum, detail) => {
      const published = (detail.playlists || []).filter((playlist) => playlist.published);
      return sum + published.length;
    }, 0),
    [curatorData]
  );

  useEffect(() => {
    if (!isOpen) {
      setCuratorData([]);
      setSelectedPlaylists(new Set());
      setStatus({ type: '', message: '' });
      setLoading(false);
      setLoadingMessage('');
      return;
    }

    const load = async () => {
      setLoading(true);
      setLoadingMessage('Loading curator playlists…');
      try {
        const detailPromises = curatorIds.map(async (id, index) => {
          setLoadingMessage(`Loading curator ${index + 1} of ${curatorIds.length}…`);
          const detail = await getCuratorDetails(id);
          return detail;
        });
        const details = await Promise.all(detailPromises);
        setCuratorData(details);

        const initialSelection = new Set();
        details.forEach(detail => {
          (detail.playlists || [])
            .filter(playlist => playlist.published)
            .forEach(playlist => initialSelection.add(playlist.id));
        });
        setSelectedPlaylists(initialSelection);
      } catch (error) {
        console.error('Failed to load curator export info:', error);
        setStatus({
          type: 'error',
          message: error?.message || 'Failed to load curator data'
        });
      } finally {
        setLoading(false);
        setLoadingMessage('');
      }
    };

    if (curatorIds.length > 0) {
      load();
    }
  }, [isOpen, curatorIds]);

  const togglePlaylist = (playlistId) => {
    setSelectedPlaylists(prev => {
      const next = new Set(prev);
      if (next.has(playlistId)) {
        next.delete(playlistId);
      } else {
        next.add(playlistId);
      }
      return next;
    });
  };

  const togglePlatform = (platformId) => {
    setSelectedPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(platformId)) {
        next.delete(platformId);
      } else {
        next.add(platformId);
      }
      return next;
    });
  };

  const queueExports = async () => {
    if (selectedPlatforms.size === 0) {
      setStatus({ type: 'error', message: 'Select at least one platform' });
      return;
    }

    const playlistsToExport = [];
    curatorData.forEach(detail => {
      (detail.playlists || []).forEach(playlist => {
        if (selectedPlaylists.has(playlist.id)) {
          playlistsToExport.push({
            id: playlist.id,
            title: playlist.title,
            curator_name: detail.curator?.name
          });
        }
      });
    });

    if (playlistsToExport.length === 0) {
      setStatus({ type: 'error', message: 'Select at least one playlist to export' });
      return;
    }

    setSubmitting(true);
    setStatus({ type: '', message: '' });

    try {
      const destinations = Array.from(selectedPlatforms);
      const accountPreferences = destinations.reduce((acc, platform) => {
        acc[platform] = { account_type: 'flowerpil' };
        return acc;
      }, {});
      await Promise.all(
        playlistsToExport.map((playlist) =>
          createExportRequest({
            playlistId: playlist.id,
            destinations,
            requestedBy: 'admin-bulk',
            resetProgress: false,
            accountPreferences
          })
        )
      );

      setStatus({
        type: 'success',
        message: `Queued exports for ${playlistsToExport.length} playlist${playlistsToExport.length === 1 ? '' : 's'}.`
      });
      onQueued?.();
      onClose();
    } catch (error) {
      console.error('Failed to queue exports:', error);
      setStatus({
        type: 'error',
        message: error?.message || 'Failed to queue exports'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const curatorCount = curatorData.length;
  const playlistCount = useMemo(() => selectedPlaylists.size, [selectedPlaylists.size]);

  return (
    <ModalRoot isOpen={isOpen} onDismiss={onClose}>
      <ModalSurface size="large">
        <ModalHeader>
          <ModalTitle>Bulk Export to DSPs</ModalTitle>
          <ModalCloseButton onClick={onClose} />
        </ModalHeader>
        <ModalBody>
          <ModalContent>
            <SummaryRow>
              <MetricCard>Curators: {totalCurators}</MetricCard>
              <MetricCard>Published playlists: {totalPublishedPlaylists}</MetricCard>
              <MetricCard>Selected playlists: {playlistCount}</MetricCard>
            </SummaryRow>

            <PlatformsRow>
              <span>Select platforms:</span>
              {PLATFORM_OPTIONS.map(option => (
                <PlatformOption key={option.id}>
                  <input
                    type="checkbox"
                    checked={selectedPlatforms.has(option.id)}
                    onChange={() => togglePlatform(option.id)}
                  />
                  {option.label}
                </PlatformOption>
              ))}
            </PlatformsRow>

            {status.message && (
              <StatusBanner $variant={status.type}>{status.message}</StatusBanner>
            )}

            {loading ? (
              <StatusBanner $variant="default">
                {loadingMessage || 'Loading curator data…'}
              </StatusBanner>
            ) : curatorCount === 0 ? (
              <StatusBanner $variant="default">
                Select at least one curator to enable bulk export.
              </StatusBanner>
            ) : (
              <ScrollGroups>
                {curatorData.map(detail => (
                  <CuratorGroup key={detail.curator?.id}>
                    <GroupHeader>
                      <div>
                        <h4>{detail.curator?.name || 'Curator'}</h4>
                        <span>{(detail.playlists || []).filter((playlist) => playlist.published).length} published playlist(s)</span>
                      </div>
                      <Button
                        size="tiny"
                        variant="secondary"
                        onClick={() => {
                          const playableIds = (detail.playlists || [])
                            .filter(playlist => playlist.published)
                            .map(playlist => playlist.id);
                          setSelectedPlaylists(prev => {
                            const next = new Set(prev);
                            const allSelected = playableIds.every(id => next.has(id));
                            playableIds.forEach(id => {
                              if (allSelected) {
                                next.delete(id);
                              } else {
                                next.add(id);
                              }
                            });
                            return next;
                          });
                        }}
                      >
                        Toggle All
                      </Button>
                    </GroupHeader>

                    <PlaylistList>
                      {(detail.playlists || [])
                        .filter(playlist => playlist.published)
                        .map(playlist => (
                          <PlaylistItem key={playlist.id}>
                            <input
                              type="checkbox"
                              checked={selectedPlaylists.has(playlist.id)}
                              onChange={() => togglePlaylist(playlist.id)}
                            />
                            <div>
                              <div>{playlist.title || 'Untitled playlist'}</div>
                              <InlineMeta>
                                Published {playlist.publish_date ? new Date(playlist.publish_date).toLocaleDateString() : '—'} • {playlist.track_count || 0} track(s)
                              </InlineMeta>
                            </div>
                          </PlaylistItem>
                        ))}
                      {(detail.playlists || []).filter(playlist => playlist.published).length === 0 && (
                        <InlineMeta>No published playlists</InlineMeta>
                      )}
                    </PlaylistList>
                  </CuratorGroup>
                ))}
              </ScrollGroups>
            )}
          </ModalContent>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={queueExports}
            disabled={submitting || curatorCount === 0 || playlistCount === 0}
          >
            {submitting
              ? 'Queuing…'
              : `Queue ${playlistCount} playlist${playlistCount === 1 ? '' : 's'}`}
          </Button>
        </ModalFooter>
      </ModalSurface>
    </ModalRoot>
  );
};

export default CuratorBulkExportModal;
