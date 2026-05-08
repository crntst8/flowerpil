import React, { useState } from 'react';
import styled from 'styled-components';

/**
 * Track Linking Row Component
 * 
 * Individual track display with cross-platform linking status,
 * confidence indicators, and manual override capabilities.
 */

const RowContainer = styled.div.withConfig({
  shouldForwardProp: (prop) => !['isEven'].includes(prop)
})`
  display: grid;
  grid-template-columns: 1fr auto auto auto auto;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md};
  border-bottom: 1px dashed ${({ theme }) => theme.colors.borderGray};
  background: ${({ theme, isEven }) => isEven ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.05)'};
  align-items: center;
  
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: ${({ theme }) => theme.spacing.sm};
  }
`;

const TrackInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  min-width: 0;
`;

const TrackTitle = styled.div`
  font-family: ${({ theme }) => theme.typography.fontFamily};
  font-size: ${({ theme }) => theme.typography.sizes.sm};
  color: ${({ theme }) => theme.colors.white};
  font-weight: bold;
  
  /* Handle text overflow */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const TrackArtist = styled.div`
  font-family: ${({ theme }) => theme.typography.fontFamily};
  font-size: ${({ theme }) => theme.typography.sizes.xs};
  color: ${({ theme }) => theme.colors.gray[600]};
  
  /* Handle text overflow */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const TrackMetadata = styled.div`
  font-family: ${({ theme }) => theme.typography.fontFamily};
  font-size: ${({ theme }) => theme.typography.sizes.xs};
  color: ${({ theme }) => theme.colors.gray[600]};
  margin-top: ${({ theme }) => theme.spacing.xs};
`;

const PlatformStatus = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  min-width: 80px;
`;

const PlatformLabel = styled.div`
  font-family: ${({ theme }) => theme.typography.fontFamily};
  font-size: ${({ theme }) => theme.typography.sizes.xs};
  color: ${({ theme }) => theme.colors.gray[600]};
  text-transform: uppercase;
  text-align: center;
`;

const StatusIndicator = styled.div.withConfig({
  shouldForwardProp: (prop) => !['status', 'confidence'].includes(prop)
})`
  width: 32px;
  height: 32px;
  border: 2px dashed ${({ theme }) => theme.colors.black};
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme, status }) => {
    switch (status) {
      case 'linked': return theme.colors.black;
      case 'manual': return theme.colors.red;
      case 'failed': return '#ff4444';
      case 'processing': return '#ffaa00';
      default: return theme.colors.white;
    }
  }};
  color: ${({ theme, status }) => 
    ['linked', 'manual', 'failed', 'processing'].includes(status) 
      ? theme.colors.white 
      : theme.colors.black
  };
  font-family: ${({ theme }) => theme.typography.fontFamily};
  font-size: ${({ theme }) => theme.typography.sizes.xs};
  font-weight: bold;
  cursor: ${({ status }) => status === 'linked' ? 'pointer' : 'default'};
  position: relative;
  
  &:hover {
    ${({ status, theme }) => status === 'linked' && `
      background: ${theme.colors.red};
    `}
  }
`;

const ConfidenceScore = styled.div`
  font-family: ${({ theme }) => theme.typography.fontFamily};
  font-size: ${({ theme }) => theme.typography.sizes.xs};
  color: ${({ theme }) => theme.colors.gray[600]};
  text-align: center;
`;

const ActionButtons = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xs};
  
  @media (max-width: 768px) {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
`;

const Button = styled.button.withConfig({
  shouldForwardProp: (prop) => !['variant', 'size'].includes(prop)
})`
  font-family: ${({ theme }) => theme.typography.fontFamily};
  font-size: ${({ theme }) => theme.typography.sizes.xs};
  padding: ${({ theme, size }) => 
    size === 'small' ? theme.spacing.xs : theme.spacing.sm};
  border: 1px dashed rgba(255, 255, 255, 0.4);
  background: ${({ theme, variant }) => 
    variant === 'danger' ? theme.colors.red : 'transparent'};
  color: ${({ theme, variant }) => 
    variant === 'danger' ? theme.colors.white : theme.colors.white};
  cursor: pointer;
  min-height: 32px;
  
  &:hover {
    background: ${({ theme, variant }) => 
      variant === 'danger' ? theme.colors.black : rgba(255, 255, 255, 0.1)};
    color: ${({ theme }) => theme.colors.white};
    border-color: rgba(255, 255, 255, 0.6);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ManualOverrideInput = styled.input`
  font-family: ${({ theme }) => theme.typography.fontFamily};
  font-size: ${({ theme }) => theme.typography.sizes.xs};
  padding: ${({ theme }) => theme.spacing.xs};
  border: 1px dashed rgba(255, 255, 255, 0.4);
  background: rgba(0, 0, 0, 0.7);
  color: ${({ theme }) => theme.colors.white};
  width: 100%;
  max-width: 300px;
  margin-top: ${({ theme }) => theme.spacing.xs};
  
  &:focus {
    outline: none;
    background: rgba(0, 0, 0, 0.9);
    color: ${({ theme }) => theme.colors.white};
    border-color: rgba(255, 255, 255, 0.6);
  }
  
  &::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }
`;

const ExpandedDetails = styled.div`
  grid-column: 1 / -1;
  padding: ${({ theme }) => theme.spacing.md};
  border-top: 1px dashed rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.05);
  margin-top: ${({ theme }) => theme.spacing.sm};
  color: ${({ theme }) => theme.colors.white};
`;

const TrackLinkingRow = ({ track, index, onUpdate, onStatsUpdate }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [manualUrls, setManualUrls] = useState({
    apple: '',
    tidal: ''
  });
  const [isProcessing, setIsProcessing] = useState(false);

  const getStatusInfo = (platform) => {
    const urlField = platform === 'apple' ? 'apple_music_url' : 'tidal_url';
    const sourceField = platform === 'apple' ? 'match_source_apple' : 'match_source_tidal';
    const confidenceField = platform === 'apple' ? 'match_confidence_apple' : 'match_confidence_tidal';
    
    const hasUrl = Boolean(track[urlField]);
    const source = track[sourceField];
    const confidence = track[confidenceField];
    
    if (hasUrl && source === 'manual') {
      return { status: 'manual', confidence: 100, symbol: 'M' };
    } else if (hasUrl) {
      return { 
        status: 'linked', 
        confidence: confidence || 0, 
        symbol: confidence >= 95 ? '✓' : Math.round(confidence || 0) 
      };
    } else if (track.linking_status === 'processing') {
      return { status: 'processing', confidence: 0, symbol: '...' };
    } else if (track.linking_status === 'failed') {
      return { status: 'failed', confidence: 0, symbol: '✗' };
    } else {
      return { status: 'unlinked', confidence: 0, symbol: '○' };
    }
  };

  const handlePlatformClick = (platform) => {
    const urlField = platform === 'apple' ? 'apple_music_url' : 'tidal_url';
    const url = track[urlField];
    
    if (url) {
      window.open(url, '_blank');
    }
  };

  const handleLinkTrack = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch('/api/v1/cross-platform/link-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId: track.id })
      });
      
      const data = await response.json();
      if (data.success) {
        await onUpdate();
        await onStatsUpdate();
      } else {
        console.error('Failed to link track:', data.error);
      }
    } catch (error) {
      console.error('Error linking track:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualOverride = async (platform) => {
    const url = manualUrls[platform]?.trim();
    if (!url) return;
    
    try {
      const response = await fetch('/api/v1/cross-platform/manual-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          trackId: track.id, 
          platform, 
          url 
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setManualUrls({ ...manualUrls, [platform]: '' });
        await onUpdate();
        await onStatsUpdate();
      } else {
        console.error('Failed to set manual override:', data.error);
      }
    } catch (error) {
      console.error('Error setting manual override:', error);
    }
  };

  const handleFlagForReview = async () => {
    try {
      const response = await fetch('/api/v1/cross-platform/flag-for-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          trackId: track.id, 
          reason: 'Manual review requested' 
        })
      });
      
      const data = await response.json();
      if (data.success) {
        await onUpdate();
        await onStatsUpdate();
      }
    } catch (error) {
      console.error('Error flagging track:', error);
    }
  };

  const appleStatus = getStatusInfo('apple');
  const tidalStatus = getStatusInfo('tidal');

  return (
    <>
      <RowContainer isEven={index % 2 === 0}>
        <TrackInfo>
          <TrackTitle>{track.title}</TrackTitle>
          <TrackArtist>{track.artist}</TrackArtist>
          {track.isrc && (
            <TrackMetadata>ISRC: {track.isrc}</TrackMetadata>
          )}
          {track.flagged_for_review && (
            <TrackMetadata style={{ color: theme.colors.red }}>
              ⚠️ Flagged for Review
            </TrackMetadata>
          )}
        </TrackInfo>

        <PlatformStatus>
          <PlatformLabel>Apple</PlatformLabel>
          <StatusIndicator
            status={appleStatus.status}
            confidence={appleStatus.confidence}
            onClick={() => handlePlatformClick('apple')}
            title={`Status: ${appleStatus.status}, Confidence: ${appleStatus.confidence}%`}
          >
            {appleStatus.symbol}
          </StatusIndicator>
          {appleStatus.confidence > 0 && (
            <ConfidenceScore>{appleStatus.confidence}%</ConfidenceScore>
          )}
        </PlatformStatus>

        <PlatformStatus>
          <PlatformLabel>Tidal</PlatformLabel>
          <StatusIndicator
            status={tidalStatus.status}
            confidence={tidalStatus.confidence}
            onClick={() => handlePlatformClick('tidal')}
            title={`Status: ${tidalStatus.status}, Confidence: ${tidalStatus.confidence}%`}
          >
            {tidalStatus.symbol}
          </StatusIndicator>
          {tidalStatus.confidence > 0 && (
            <ConfidenceScore>{tidalStatus.confidence}%</ConfidenceScore>
          )}
        </PlatformStatus>

        <ActionButtons>
          <Button
            onClick={handleLinkTrack}
            disabled={isProcessing}
            size="small"
          >
            {isProcessing ? '...' : 'Link'}
          </Button>
          <Button
            onClick={() => setIsExpanded(!isExpanded)}
            size="small"
          >
            {isExpanded ? '−' : '+'}
          </Button>
          {(track.flagged_for_review || (!track.apple_music_url && !track.tidal_url)) && (
            <Button
              onClick={handleFlagForReview}
              variant="danger"
              size="small"
            >
              Flag
            </Button>
          )}
        </ActionButtons>
      </RowContainer>

      {isExpanded && (
        <ExpandedDetails>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
            gap: '16px',
            fontFamily: 'Paper Mono, monospace',
            fontSize: '12px'
          }}>
            <div>
              <h4 style={{ marginBottom: '8px' }}>Apple Music Manual Override</h4>
              <ManualOverrideInput
                type="text"
                placeholder="https://music.apple.com/song/..."
                value={manualUrls.apple}
                onChange={(e) => setManualUrls({
                  ...manualUrls, 
                  apple: e.target.value
                })}
              />
              <br />
              <Button
                onClick={() => handleManualOverride('apple')}
                disabled={!manualUrls.apple.trim()}
                style={{ marginTop: '8px' }}
              >
                Set Apple URL
              </Button>
            </div>
            
            <div>
              <h4 style={{ marginBottom: '8px' }}>Tidal Manual Override</h4>
              <ManualOverrideInput
                type="text"
                placeholder="https://tidal.com/browse/track/..."
                value={manualUrls.tidal}
                onChange={(e) => setManualUrls({
                  ...manualUrls, 
                  tidal: e.target.value
                })}
              />
              <br />
              <Button
                onClick={() => handleManualOverride('tidal')}
                disabled={!manualUrls.tidal.trim()}
                style={{ marginTop: '8px' }}
              >
                Set Tidal URL
              </Button>
            </div>
          </div>

          {/* Track Metadata */}
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px dashed #ccc' }}>
            <h4>Track Metadata</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
              <div>Spotify ID: {track.spotify_id || 'None'}</div>
              <div>Apple ID: {track.apple_id || 'None'}</div>
              <div>Tidal ID: {track.tidal_id || 'None'}</div>
              <div>Album: {track.album || 'Unknown'}</div>
              <div>Year: {track.year || 'Unknown'}</div>
              <div>Duration: {track.duration || 'Unknown'}</div>
              <div>Status: {track.linking_status || 'pending'}</div>
              <div>Last Updated: {track.linking_updated_at || 'Never'}</div>
            </div>
            {track.linking_error && (
              <div style={{ marginTop: '8px', color: theme.colors.red }}>
                Error: {track.linking_error}
              </div>
            )}
          </div>
        </ExpandedDetails>
      )}
    </>
  );
};

export default TrackLinkingRow;