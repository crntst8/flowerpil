import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { theme, DashedBox, Button } from '@shared/styles/GlobalStyles';
import PlatformIcon from '@shared/components/PlatformIcon';

/* eslint-disable react/prop-types */

const PLATFORM_LABELS = {
  spotify: 'Spotify',
  apple: 'Apple Music',
  tidal: 'TIDAL',
  qobuz: 'Qobuz',
  soundcloud: 'SoundCloud',
  youtube_music: 'YouTube Music'
};

const detectPlatformFromUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim().toLowerCase();

  if (trimmed.includes('open.spotify.com/playlist/') || trimmed.includes('spotify.com/playlist/')) {
    return 'spotify';
  }
  if (trimmed.includes('music.apple.com') && trimmed.includes('playlist')) {
    return 'apple';
  }
  if (trimmed.includes('tidal.com') && trimmed.includes('playlist')) {
    return 'tidal';
  }
  if (trimmed.includes('qobuz.com') && trimmed.includes('playlist')) {
    return 'qobuz';
  }
  if (trimmed.includes('soundcloud.com')) {
    return 'soundcloud';
  }
  if (trimmed.includes('music.youtube.com') && trimmed.includes('playlist')) {
    return 'youtube_music';
  }
  return null;
};

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const UrlInputRow = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  align-items: center;
`;

const SearchInput = styled.input`
  flex: 1;
  background: ${theme.colors.input};
  color: ${theme.colors.black};
  border: ${theme.borders.solidThin} ${theme.colors.black[300]};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  letter-spacing: 0.02em;

  &::placeholder {
    color: ${theme.colors.black[500]};
    opacity: 0.7;
  }

  &:focus {
    outline: none;
    border-color: ${theme.colors.selected};
  }
`;

const DetectedPlatform = styled.div`
  display: inline-flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  background: ${theme.colors.selectedFill};
  border: ${theme.borders.solid} ${theme.colors.selected};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${theme.colors.black};
`;

const InlineAlert = styled(DashedBox)`
  border-color: ${theme.colors.danger};
  background: rgba(229, 62, 62, 0.12);
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const Hint = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black[500]};
  line-height: 1.5;
`;

const PreviewCard = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  border: ${theme.borders.solidThin} ${theme.colors.black[300]};
  background: ${theme.colors.fpwhite};
`;

const PreviewImage = styled.img`
  width: 80px;
  height: 80px;
  object-fit: cover;
  flex-shrink: 0;
`;

const PreviewImagePlaceholder = styled.div`
  width: 80px;
  height: 80px;
  background: ${theme.colors.black[100]};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const PreviewInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  min-width: 0;
`;

const PreviewTitle = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.medium};
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const PreviewMeta = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black[500]};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const ModeSelector = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
`;

const ModeOption = styled.button`
  flex: 1;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border: ${theme.borders.solidThin} ${props => props.$active ? theme.colors.selected : theme.colors.black[300]};
  background: ${props => props.$active ? theme.colors.selectedFill : 'transparent'};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  text-align: center;

  &:hover {
    border-color: ${theme.colors.selected};
  }
`;

const ConfirmRow = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  justify-content: flex-end;
`;

const TrackPreviewToggle = styled.button`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  background: none;
  border: none;
  padding: ${theme.spacing.xs} 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${theme.colors.black[600]};
  cursor: pointer;

  &:hover {
    color: ${theme.colors.black};
  }
`;

const TrackPreviewList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 240px;
  overflow-y: auto;
  border: ${theme.borders.solidThin} ${theme.colors.black[200]};
`;

const TrackPreviewItem = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  background: ${props => props.$even ? theme.colors.black[50] : 'transparent'};
  line-height: 1.3;
`;

const TrackNum = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black[400]};
  min-width: 20px;
  text-align: right;
`;

const TrackArtist = styled.span`
  color: ${theme.colors.black[500]};
`;

const ResultPanel = styled(DashedBox)`
  border-color: ${theme.colors.selected};
  background: ${theme.colors.selectedFill};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const ResultStat = styled.span`
  font-weight: 600;
`;

// Stages: 'input' -> 'previewing' -> 'preview' -> 'importing' -> 'result'
export default function ImportModal({
  isOpen,
  onImported,
  processingId = null,
  actionLabel = 'Import',
  resetKey = 0,
  authenticatedFetch = null,
  importResult = null,
}) {
  const [pasteUrl, setPasteUrl] = useState('');
  const [error, setError] = useState('');
  const [stage, setStage] = useState('input');
  const [preview, setPreview] = useState(null);
  const [mergeMode, setMergeMode] = useState('append');
  const [showTracks, setShowTracks] = useState(false);

  useEffect(() => {
    if (resetKey > 0) {
      setPasteUrl('');
      setError('');
      setStage('input');
      setPreview(null);
      setMergeMode('append');
    }
  }, [resetKey]);

  // Show result panel when import completes
  useEffect(() => {
    if (importResult && stage === 'importing') {
      setStage('result');
    }
  }, [importResult, stage]);

  const detectedPlatform = useMemo(() => detectPlatformFromUrl(pasteUrl), [pasteUrl]);

  const fetchPreview = useCallback(async () => {
    const trimmed = pasteUrl.trim();
    if (!trimmed) {
      setError('Please enter a URL');
      return;
    }
    const platform = detectPlatformFromUrl(trimmed);
    if (!platform) {
      setError('Could not detect platform. Supported: Spotify, Apple Music, TIDAL, Qobuz, SoundCloud, YouTube Music');
      return;
    }
    setError('');
    setStage('previewing');

    if (!authenticatedFetch) {
      // Fallback: skip preview, go straight to import (backwards compat)
      setPreview({ platform, url: trimmed, title: `${PLATFORM_LABELS[platform]} playlist`, trackCount: 0, image: null });
      setStage('preview');
      return;
    }

    try {
      const resp = await authenticatedFetch('/api/v1/url-import/test-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed })
      });
      const json = await resp.json();
      if (!resp.ok || !json.success) {
        throw new Error(json.error || 'Failed to fetch playlist preview');
      }
      setPreview({
        platform: json.data.platform || platform,
        url: json.data.url || trimmed,
        title: json.data.playlist?.title || `${PLATFORM_LABELS[platform]} playlist`,
        description: json.data.playlist?.description || '',
        image: json.data.playlist?.image || null,
        trackCount: json.data.playlist?.trackCount || json.data.tracks?.length || 0,
        tracks: (json.data.tracks || []).slice(0, 10)
      });
      setStage('preview');
    } catch (err) {
      setError(err.message || 'Failed to preview playlist');
      setStage('input');
    }
  }, [pasteUrl, authenticatedFetch]);

  const handleConfirmImport = useCallback(() => {
    if (!preview) return;
    setStage('importing');
    onImported && onImported({
      platform: preview.platform,
      url: preview.url,
      title: preview.title,
      description: preview.description || '',
      image: preview.image || '',
      total: preview.trackCount || 0,
      mergeMode
    });
  }, [preview, mergeMode, onImported]);

  const handleReset = useCallback(() => {
    setPasteUrl('');
    setError('');
    setStage('input');
    setPreview(null);
    setMergeMode('append');
    setShowTracks(false);
  }, []);

  if (!isOpen) return null;

  return (
    <Container>
      {/* Stage: input */}
      {(stage === 'input' || stage === 'previewing') && (
        <>
          <Hint>
            Paste any public playlist URL from Spotify, Apple Music, TIDAL, Qobuz, SoundCloud, or YouTube Music
          </Hint>
          <UrlInputRow>
            <SearchInput
              type="url"
              value={pasteUrl}
              placeholder="https://open.spotify.com/playlist/... or https://music.apple.com/..."
              onChange={(e) => {
                setPasteUrl(e.target.value);
                setError('');
                if (stage !== 'input') setStage('input');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && pasteUrl.trim()) {
                  fetchPreview();
                }
              }}
              disabled={stage === 'previewing'}
            />
            <Button
              onClick={fetchPreview}
              variant="primary"
              disabled={stage === 'previewing' || !pasteUrl.trim()}
            >
              {stage === 'previewing' ? 'Loading...' : 'Preview'}
            </Button>
          </UrlInputRow>
          {detectedPlatform && stage === 'input' && (
            <DetectedPlatform>
              Detected: {PLATFORM_LABELS[detectedPlatform] || detectedPlatform}
            </DetectedPlatform>
          )}
        </>
      )}

      {/* Stage: preview */}
      {stage === 'preview' && preview && (
        <>
          <PreviewCard>
            {preview.image ? (
              <PreviewImage src={preview.image} alt={preview.title} />
            ) : (
              <PreviewImagePlaceholder>
                <PlatformIcon platform={preview.platform} size={32} />
              </PreviewImagePlaceholder>
            )}
            <PreviewInfo>
              <PreviewMeta>
                {PLATFORM_LABELS[preview.platform] || preview.platform} playlist
              </PreviewMeta>
              <PreviewTitle>{preview.title}</PreviewTitle>
              <PreviewMeta>
                {preview.trackCount} track{preview.trackCount !== 1 ? 's' : ''}
              </PreviewMeta>
            </PreviewInfo>
          </PreviewCard>

          {preview.tracks?.length > 0 && (
            <>
              <TrackPreviewToggle onClick={() => setShowTracks(!showTracks)}>
                {showTracks ? '▼' : '▶'} {showTracks ? 'Hide' : 'Show'} track preview
              </TrackPreviewToggle>
              {showTracks && (
                <TrackPreviewList>
                  {preview.tracks.map((track, i) => (
                    <TrackPreviewItem key={i} $even={i % 2 === 0}>
                      <TrackNum>{i + 1}</TrackNum>
                      <span>
                        {track.title || track.name || 'Untitled'}
                        {(track.artist || track.artists) && (
                          <TrackArtist> — {track.artist || (Array.isArray(track.artists) ? track.artists.join(', ') : track.artists)}</TrackArtist>
                        )}
                      </span>
                    </TrackPreviewItem>
                  ))}
                  {preview.trackCount > preview.tracks.length && (
                    <TrackPreviewItem>
                      <TrackNum />
                      <TrackArtist>+ {preview.trackCount - preview.tracks.length} more tracks</TrackArtist>
                    </TrackPreviewItem>
                  )}
                </TrackPreviewList>
              )}
            </>
          )}

          <ModeSelector>
            <ModeOption $active={mergeMode === 'append'} onClick={() => setMergeMode('append')}>
              Append tracks
            </ModeOption>
            <ModeOption $active={mergeMode === 'replace'} onClick={() => setMergeMode('replace')}>
              Replace all tracks
            </ModeOption>
          </ModeSelector>

          <ConfirmRow>
            <Button onClick={handleReset} variant="secondary">
              Cancel
            </Button>
            <Button
              onClick={handleConfirmImport}
              variant="primary"
              disabled={!!processingId}
            >
              {processingId ? `${actionLabel}...` : actionLabel}
            </Button>
          </ConfirmRow>
        </>
      )}

      {/* Stage: importing */}
      {stage === 'importing' && (
        <DetectedPlatform>
          Importing from {PLATFORM_LABELS[preview?.platform] || 'unknown'}...
        </DetectedPlatform>
      )}

      {/* Stage: result */}
      {stage === 'result' && importResult && (
        <ResultPanel>
          <div>
            <ResultStat>{importResult.added || 0}</ResultStat> track{(importResult.added || 0) !== 1 ? 's' : ''} added
            {importResult.skipped > 0 && (
              <>, <ResultStat>{importResult.skipped}</ResultStat> skipped</>
            )}
            {importResult.unmatched > 0 && (
              <>, <ResultStat>{importResult.unmatched}</ResultStat> unmatched</>
            )}
          </div>
          <Button onClick={handleReset} variant="secondary" size="sm">
            Import another
          </Button>
        </ResultPanel>
      )}

      {error && (
        <InlineAlert>
          {error}
        </InlineAlert>
      )}
    </Container>
  );
}
