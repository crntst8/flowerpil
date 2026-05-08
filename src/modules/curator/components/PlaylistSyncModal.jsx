import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import {
  ModalRoot,
  ModalSurface,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalCloseButton,
} from '@shared/components/Modal';
import { theme, DashedBox, Button } from '@shared/styles/GlobalStyles';
import ImportModal from './ImportModal.jsx';
import { adminPost, adminFetch, handleJsonResponse } from '../../admin/utils/adminApi.js';
import { savePlaylist } from '../../admin/services/adminService.js';

const SyncSurface = styled(ModalSurface)`
  --modal-surface-padding: ${theme.spacing.lg};
  --modal-surface-gap: ${theme.spacing.lg};
  background: linear-gradient(150deg, rgba(18, 19, 31, 0.97) 0%, rgba(126, 133, 172, 0.94) 100%);
  color: ${theme.colors.white};
  max-width: 960px;
  max-height: 92vh;

  @media (max-width: ${theme.breakpoints.tablet}) {
    padding: ${theme.spacing.md};
    max-height: none;
  }
`;

const Header = styled(ModalHeader)`
  border-bottom: ${theme.borders.solidThin} rgba(255, 255, 255, 0.12);
  padding-bottom: ${theme.spacing.sm};
`;

const Title = styled(ModalTitle)`
  margin: 0;
  letter-spacing: 0.08em;
  font-size: ${theme.fontSizes.small};
`;

const CloseButton = styled(ModalCloseButton)`
  background: rgba(255, 255, 255, 0.1);
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.4);
  color: ${theme.colors.white};

  &:hover {
    background: rgba(255, 255, 255, 0.18);
  }

  &:disabled {
    opacity: 0.45;
    pointer-events: none;
  }
`;

const Body = styled(ModalBody)`
  gap: ${theme.spacing.md};
`;

const SelectionSummary = styled.div`
  border: ${theme.borders.dashedThin} rgba(255, 255, 255, 0.15);
  padding: ${theme.spacing.md};
  border-radius: 12px;
  display: grid;
  gap: ${theme.spacing.sm};
  background: rgba(255, 255, 255, 0.04);
`;

const SelectionHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
`;

const Cover = styled.div.withConfig({ shouldForwardProp: (prop) => !['$image'].includes(prop) })`
  width: 72px;
  height: 72px;
  border-radius: 12px;
  background: ${({ $image }) => ($image ? `url(${$image}) center/cover` : 'rgba(255, 255, 255, 0.1)')};
  display: grid;
  place-items: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
`;

const SelectionBody = styled.div`
  display: grid;
  gap: ${theme.spacing.xxs};
`;

const MetaRow = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(255, 255, 255, 0.65);
`;

const SwitchRow = styled.label`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

const ModeRow = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  align-items: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
`;

const Radio = styled.label`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  cursor: pointer;
`;

const RadioInput = styled.input`
  width: 16px;
  height: 16px;
`;

const ToggleInput = styled.input`
  width: 18px;
  height: 18px;
`;

const Actions = styled(ModalFooter)`
  justify-content: space-between;
`;

const ErrorBanner = styled.div`
  border: ${theme.borders.solidThin} ${theme.colors.danger};
  background: rgba(229, 62, 62, 0.15);
  padding: ${theme.spacing.sm};
  border-radius: 8px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
`;

const Hint = styled.p`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(255, 255, 255, 0.65);
  line-height: 1.4;
`;

const sanitizeDescription = (value) => {
  if (!value) return '';
  if (value.length <= 180) return value;
  return `${value.slice(0, 177)}...`;
};

const toISODate = () => new Date().toISOString().split('T')[0];

export default function PlaylistSyncModal({
  isOpen,
  onClose,
  playlist,
  onSynced,
  normalizeTracks
}) {
  const [selection, setSelection] = useState(null);
  const [mode, setMode] = useState('replace');
  const [updateMetadata, setUpdateMetadata] = useState(true);
  const [refreshPublishDate, setRefreshPublishDate] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  const platformLabel = selection?.platform
    ? selection.platform.charAt(0).toUpperCase() + selection.platform.slice(1)
    : '';

  const isSpotify = selection?.platform === 'spotify';

  const trackEstimate = useMemo(() => {
    if (typeof selection?.total === 'number') return selection.total;
    return null;
  }, [selection]);

  const resetState = () => {
    setSelection(null);
    setMode('replace');
    setUpdateMetadata(true);
    setRefreshPublishDate(true);
    setError('');
  };

  const handleClose = () => {
    if (isProcessing) return;
    resetState();
    onClose();
  };

  const syncViaSpotify = async () => {
    const payload = {
      playlist_id: playlist.id,
      source: 'spotify',
      source_playlist_id: selection.id,
      mode,
      update_metadata: updateMetadata,
      refresh_publish_date: refreshPublishDate
    };
    const response = await adminPost('/api/v1/playlist-actions/import-now', payload);
    return {
      stats: response?.data?.stats || null,
      platform: 'spotify'
    };
  };

  const syncViaApple = async () => {
    const response = await adminFetch(`/api/v1/apple/import/${encodeURIComponent(selection.id)}`, { method: 'POST' });
    const payload = await handleJsonResponse(response);
    const appleData = payload.data || {};
    const applePlaylist = appleData.applePlaylist || {};
    const tracks = normalizeTracks(Array.isArray(appleData.tracks) ? appleData.tracks : []);
    const updated = await savePlaylist({
      ...playlist,
      id: playlist.id,
      title: updateMetadata ? (selection.title || applePlaylist.name || playlist.title) : playlist.title,
      description: updateMetadata ? (selection.description || applePlaylist.description || playlist.description) : playlist.description,
      description_short: updateMetadata
        ? sanitizeDescription(selection.description || applePlaylist.description || playlist.description_short || '')
        : playlist.description_short,
      image: updateMetadata ? (applePlaylist.image || selection.image || playlist.image) : playlist.image,
      apple_url: applePlaylist.apple_url || playlist.apple_url,
      publish_date: refreshPublishDate ? toISODate() : playlist.publish_date,
      tracks
    });
    return {
      stats: { total_after: tracks.length },
      platform: 'apple',
      playlist: updated
    };
  };

  const syncViaTidal = async () => {
    const response = await adminFetch(`/api/v1/tidal/import/${encodeURIComponent(selection.id)}`, { method: 'POST' });
    const payload = await handleJsonResponse(response);
    const tidalData = payload.data || {};
    const tidalPlaylist = tidalData.tidalPlaylist || {};
    const tracks = normalizeTracks(Array.isArray(tidalData.tracks) ? tidalData.tracks : []);
    const updated = await savePlaylist({
      ...playlist,
      id: playlist.id,
      title: updateMetadata ? (selection.title || tidalPlaylist.name || playlist.title) : playlist.title,
      description: updateMetadata ? (selection.description || tidalPlaylist.description || playlist.description) : playlist.description,
      description_short: updateMetadata
        ? sanitizeDescription(selection.description || tidalPlaylist.description || playlist.description_short || '')
        : playlist.description_short,
      image: updateMetadata ? (tidalPlaylist.image || selection.image || playlist.image) : playlist.image,
      tidal_url: tidalPlaylist.tidal_url || playlist.tidal_url,
      publish_date: refreshPublishDate ? toISODate() : playlist.publish_date,
      tracks
    });
    return {
      stats: { total_after: tracks.length },
      platform: 'tidal',
      playlist: updated
    };
  };

  const handleConfirm = async () => {
    if (!selection) return;
    setIsProcessing(true);
    setError('');
    try {
      let result;
      if (selection.platform === 'spotify') {
        result = await syncViaSpotify();
      } else if (selection.platform === 'apple') {
        result = await syncViaApple();
      } else if (selection.platform === 'tidal') {
        result = await syncViaTidal();
      } else {
        throw new Error('Unsupported DSP selection');
      }

      onSynced && onSynced({
        selection,
        mode,
        updateMetadata,
        refreshPublishDate,
        ...result
      });
      resetState();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to sync playlist');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalRoot
      isOpen={isOpen}
      onClose={handleClose}
      align="center"
      closeOnBackdrop={!isProcessing}
      labelledBy="sync-modal-title"
      overlayProps={{
        $backdrop: 'rgba(6, 7, 15, 0.82)',
      }}
    >
      <SyncSurface>
        <CloseButton disabled={isProcessing} />

        <Header>
          <Title id="sync-modal-title">Sync Playlist With DSP</Title>
        </Header>

        <Body>
          {!selection ? (
            <div style={{ display: 'grid', gap: theme.spacing.sm }}>
              <Hint>Select a playlist from Spotify, Apple Music, or TIDAL to update <strong>{playlist?.title}</strong>.</Hint>
              <ImportModal
                inline
                isOpen={isOpen}
                onImported={(sel) => {
                  setSelection(sel);
                  setError('');
                }}
                actionLabel="Select"
              />
            </div>
          ) : (
            <>
              <SelectionSummary>
                <SelectionHeader>
                  <Cover $image={selection.image}>{selection.title?.slice(0, 2) || 'FP'}</Cover>
                  <SelectionBody>
                    <span style={{ fontFamily: theme.fonts.mono, fontSize: theme.fontSizes.small, textTransform: 'uppercase', letterSpacing: 0.08 }}>
                      {platformLabel} • {selection.title || 'Untitled Playlist'}
                    </span>
                    {selection.description && (
                      <span style={{ fontFamily: theme.fonts.mono, fontSize: theme.fontSizes.tiny, color: 'rgba(255,255,255,0.7)' }}>
                        {sanitizeDescription(selection.description)}
                      </span>
                    )}
                    <MetaRow>
                      {trackEstimate ? `${trackEstimate} tracks` : 'Track count will be fetched during sync'}
                    </MetaRow>
                  </SelectionBody>
                </SelectionHeader>

                {isSpotify ? (
                  <ModeRow>
                    <Radio>
                    <RadioInput
                      type="radio"
                      name="sync-mode"
                      value="replace"
                      checked={mode === 'replace'}
                      onChange={() => setMode('replace')}
                      disabled={isProcessing}
                    />
                    Replace
                  </Radio>
                  <Radio>
                    <RadioInput
                      type="radio"
                      name="sync-mode"
                      value="append"
                      checked={mode === 'append'}
                      onChange={() => setMode('append')}
                      disabled={isProcessing}
                    />
                    Append new tracks
                  </Radio>
                  </ModeRow>
                ) : (
                  <Hint>Apple Music and TIDAL imports always replace the playlist contents.</Hint>
                )}

                <SwitchRow>
                  <span>Update metadata from {platformLabel}</span>
                  <ToggleInput
                    type="checkbox"
                    checked={updateMetadata}
                    onChange={(e) => setUpdateMetadata(e.target.checked)}
                    disabled={isProcessing}
                  />
                </SwitchRow>

                <SwitchRow>
                  <span>Refresh publish date</span>
                  <ToggleInput
                    type="checkbox"
                    checked={refreshPublishDate}
                    onChange={(e) => setRefreshPublishDate(e.target.checked)}
                    disabled={isProcessing}
                  />
                </SwitchRow>
              </SelectionSummary>

              {error && <ErrorBanner>{error}</ErrorBanner>}
            </>
          )}
        </Body>

        <Actions>
          {selection ? (
            <>
              <Button variant="ghost" onClick={() => { if (!isProcessing) setSelection(null); }} disabled={isProcessing}>
                Choose Different Playlist
              </Button>
              <Button variant="primary" onClick={handleConfirm} disabled={isProcessing}>
                {isProcessing ? 'Syncing…' : 'Sync Playlist'}
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={handleClose} disabled={isProcessing}>
              Cancel
            </Button>
          )}
        </Actions>
      </SyncSurface>
    </ModalRoot>
  );
}
