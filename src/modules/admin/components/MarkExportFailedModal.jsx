import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme, Button } from '@shared/styles/GlobalStyles';
import { useAuth } from '@shared/contexts/AuthContext';
import { safeJson } from '@shared/utils/jsonUtils';
import {
  ModalRoot,
  ModalSurface,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
} from '@shared/components/Modal';

export default function MarkExportFailedModal({ isOpen, onClose, request, onSuccess }) {
  const { authenticatedFetch } = useAuth();
  const [tracks, setTracks] = useState([]);
  const [selectedTracks, setSelectedTracks] = useState([]);
  const [adminNote, setAdminNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingTracks, setLoadingTracks] = useState(false);

  useEffect(() => {
    if (isOpen && request) {
      loadPlaylistTracks(request.playlist_id);
      setAdminNote('');
      setSelectedTracks([]);
    }
  }, [isOpen, request]);

  const loadPlaylistTracks = async (playlistId) => {
    setLoadingTracks(true);
    try {
      const res = await authenticatedFetch(`/api/v1/playlists/${playlistId}`, { method: 'GET' });
      const json = await safeJson(res, { context: 'Load playlist for export failure' });
      if (json.success && json.data) {
        setTracks(json.data.tracks || []);
      }
    } catch (error) {
      console.error('Failed to load tracks:', error);
    } finally {
      setLoadingTracks(false);
    }
  };

  const toggleTrack = (trackId) => {
    setSelectedTracks(prev =>
      prev.includes(trackId)
        ? prev.filter(id => id !== trackId)
        : [...prev, trackId]
    );
  };

  const handleSubmit = async () => {
    if (!adminNote.trim()) {
      alert('Admin note is required');
      return;
    }

    setSubmitting(true);
    try {
      const failedTracks = tracks
        .filter(t => selectedTracks.includes(t.id))
        .map(t => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          reason: 'Selected by admin'
        }));

      const res = await authenticatedFetch(`/api/v1/export-requests/${request.id}/mark-failed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          failed_tracks: failedTracks,
          admin_note: adminNote
        })
      });

      const json = await safeJson(res, { context: 'Mark export as failed' });
      if (!json.success) throw new Error(json.error || 'Failed to mark as failed');

      onSuccess?.();
      onClose();
    } catch (error) {
      alert(`Failed to mark as failed: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalRoot
      isOpen={isOpen && Boolean(request)}
      onClose={onClose}
      labelledBy="mark-export-failed-title"
      closeOnBackdrop={!submitting}
    >
      <StyledModalSurface>
        <StyledModalHeader>
          <ModalTitle id="mark-export-failed-title">Mark Export as Failed</ModalTitle>
          <ModalCloseButton />
        </StyledModalHeader>

        <StyledModalBody>
          <PlaylistInfo>
            <PlaylistName>{request?.playlist_title || 'Untitled Playlist'}</PlaylistName>
            <CuratorInfo>by {request?.curator_name || 'Unknown'}</CuratorInfo>
          </PlaylistInfo>

          <Section>
            <SectionTitle>Admin Note (Required)</SectionTitle>
            <NoteTextarea
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              placeholder="Explain why this export failed (curator will see this)"
              rows={4}
            />
          </Section>

          <Section>
            <SectionTitle>Select Failed Tracks (Optional)</SectionTitle>
            {loadingTracks ? (
              <LoadingText>Loading tracks...</LoadingText>
            ) : tracks.length === 0 ? (
              <EmptyText>No tracks found</EmptyText>
            ) : (
              <TrackList>
                {tracks.map(track => (
                  <TrackItem key={track.id}>
                    <input
                      type="checkbox"
                      id={`track-${track.id}`}
                      checked={selectedTracks.includes(track.id)}
                      onChange={() => toggleTrack(track.id)}
                    />
                    <TrackInfo>
                      <TrackTitle>{track.title}</TrackTitle>
                      <TrackArtist>{track.artist}</TrackArtist>
                    </TrackInfo>
                  </TrackItem>
                ))}
              </TrackList>
            )}
          </Section>
        </StyledModalBody>

        <StyledModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            onClick={handleSubmit}
            disabled={submitting || !adminNote.trim()}
          >
            {submitting ? 'Marking...' : 'Mark as Failed'}
          </Button>
        </StyledModalFooter>
      </StyledModalSurface>
    </ModalRoot>
  );
}

const StyledModalSurface = styled(ModalSurface)`
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.black};
  max-width: 700px;
  width: 90%;
`;

const StyledModalHeader = styled(ModalHeader)`
  padding: ${theme.spacing.lg};
  padding-bottom: ${theme.spacing.sm};
  border-bottom: ${theme.borders.solid} ${theme.colors.black};

  h2 {
    font-family: ${theme.fonts.mono};
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
  }
`;

const StyledModalBody = styled(ModalBody)`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
  padding: ${theme.spacing.lg};
  max-height: 60vh;
  overflow-y: auto;
`;

const PlaylistInfo = styled.div`
  padding: ${theme.spacing.sm};
  background: ${theme.colors.gray[100]};
  border: ${theme.borders.dashed} ${theme.colors.black};
`;

const PlaylistName = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  font-weight: ${theme.fontWeights.bold};
  color: ${theme.colors.black};
`;

const CuratorInfo = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: 12px;
  color: ${theme.colors.gray[600]};
  margin-top: 4px;
`;

const Section = styled.div``;

const SectionTitle = styled.h4`
  font-family: ${theme.fonts.mono};
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 ${theme.spacing.sm} 0;
  color: ${theme.colors.black};
`;

const NoteTextarea = styled.textarea`
  width: 100%;
  font-family: ${theme.fonts.mono};
  font-size: 13px;
  padding: ${theme.spacing.sm};
  border: ${theme.borders.solid} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  resize: vertical;

  &:focus {
    outline: 2px solid ${theme.colors.black};
    outline-offset: 2px;
  }
`;

const LoadingText = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: 12px;
  color: ${theme.colors.gray[500]};
  padding: ${theme.spacing.sm};
`;

const EmptyText = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: 12px;
  color: ${theme.colors.gray[500]};
  padding: ${theme.spacing.sm};
`;

const TrackList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  max-height: 300px;
  overflow-y: auto;
  border: ${theme.borders.dashed} ${theme.colors.black};
  padding: ${theme.spacing.sm};
`;

const TrackItem = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.xs};
  background: ${theme.colors.fpwhite};

  &:hover {
    background: ${theme.colors.gray[50]};
  }

  input[type="checkbox"] {
    cursor: pointer;
  }
`;

const TrackInfo = styled.label`
  flex: 1;
  cursor: pointer;
`;

const TrackTitle = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: 13px;
  color: ${theme.colors.black};
`;

const TrackArtist = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  color: ${theme.colors.gray[600]};
  margin-top: 2px;
`;

const StyledModalFooter = styled(ModalFooter)`
  display: flex;
  justify-content: flex-end;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.lg};
  padding-top: ${theme.spacing.md};
  border-top: ${theme.borders.solid} ${theme.colors.black};
`;
