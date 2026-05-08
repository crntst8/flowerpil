import React, { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import { useAudioPreview } from '@shared/contexts/AudioPreviewContext';

const PreviewButton = ({ track, className, apiEndpoint }) => {
  console.log('[PreviewButton] Component render:', { trackId: track?.id, className });

  const {
    isPlaying,
    isLoading: globalLoading,
    error: globalError,
    playPreview,
    isCurrentTrack,
    hasPreviewAvailable
  } = useAudioPreview();

  const isThisTrackPlaying = isCurrentTrack(track);
  const loading = globalLoading && isThisTrackPlaying;
  const error = globalError && isThisTrackPlaying;
  const trackIsPlaying = isPlaying && isThisTrackPlaying;

  const handlePlay = async (e) => {
    console.log('[PreviewButton] handlePlay CALLED - Event:', e?.type);
    e.stopPropagation(); // Prevent expanding the track

    console.log('🎵 PreviewButton clicked!', { track, hasId: !!track?.id, hasMetadata: !!(track?.artist && track?.title), apiEndpoint });

    if (!track?.id && (!track?.artist || !track?.title)) {
      console.warn('⚠️ PreviewButton: No track.id AND no artist/title, aborting');
      return;
    }

    console.log('🎵 Calling playPreview...');
    try {
      await playPreview(track, apiEndpoint);
      console.log('✅ playPreview completed');
    } catch (err) {
      console.error('❌ PreviewButton: Failed to play preview:', err);
    }
  };

  // Only render if the track might have a preview available
  const shouldRender = hasPreviewAvailable(track);
  console.log('[PreviewButton] Should render?', shouldRender, { trackId: track?.id, hasPreviewData: !!track?.preview_data });

  console.log('[PreviewButton] RENDERING', shouldRender ? 'button' : 'null');

  // Return null after all hooks are called to avoid hook count mismatch
  if (!shouldRender) {
    return null;
  }

  return (
    <StyledPreviewButton
      onClick={handlePlay}
      isPlaying={trackIsPlaying}
      loading={loading}
      disabled={loading || !!error}
      title={
        error
          ? error
          : loading
            ? 'Loading preview...'
            : `${trackIsPlaying ? 'Pause' : 'Play'} 30-second preview`
      }
      className={className}
    >
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorIcon>✗</ErrorIcon>
      ) : (
        <PlayIcon isPlaying={trackIsPlaying}>
          {trackIsPlaying ? '⏸' : '▶'}
        </PlayIcon>
      )}
    </StyledPreviewButton>
  );
};

// Loading animation
const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
`;

const StyledPreviewButton = styled.button.withConfig({
  shouldForwardProp: (prop) => !['isPlaying', 'loading'].includes(prop)
})`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  background: ${props => {
    if (props.loading) return 'rgba(67, 142, 255, 0.4)';
    return props.isPlaying ? theme.colors.red : 'transparent';
  }};
  border: ${theme.borders.solidThin} ${props => {
    if (props.loading) return theme.colors.black;
    return props.isPlaying ? theme.colors.red : theme.colors.black;
  }};
  color: ${props => {
    if (props.loading) return theme.colors.black;
    return props.isPlaying ? theme.colors.white : theme.colors.black;
  }};
  font-family: ${theme.fonts.mono};
  font-size: 16px;
  cursor: ${props => (props.disabled ? 'default' : 'pointer')};
  transition: all ${theme.transitions.fast};
  opacity: ${props => (props.disabled && !props.loading ? 0.5 : 1)};
  position: relative;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;

  /* Increase tap target area on mobile without changing visual size */
  &::before {
    content: '';
    position: absolute;
    top: -4px;
    right: -4px;
    bottom: -4px;
    left: -4px;
    pointer-events: none; /* Ensure clicks pass through to button */

    ${mediaQuery.mobile} {
      top: -8px;
      right: -8px;
      bottom: -8px;
      left: -8px;
    }
  }

  &:hover:not(:disabled) {
    border-color: ${props => props.isPlaying ? theme.colors.red : theme.colors.blue};
    background: ${props => {
      if (props.isPlaying) return theme.colors.red;
      return theme.colors.fpwhite;
    }};
    color: ${theme.colors.black};
  }

  &:active:not(:disabled) {
    transform: translateY(1px);
    background: ${props => {
      if (props.isPlaying) return theme.colors.red;
      return 'rgba(67, 142, 255, 0.4)';
    }};
  }

  &:disabled {
    cursor: default;
  }

  /* Mobile: When inside MobileActionBar, match other action buttons */
  ${mediaQuery.tablet} {
    &.mobile-preview-button {
      flex: 1;
      min-width: 44px;
      max-width: none;
      height: 48px;
    }
  }

  ${mediaQuery.mobile} {
    width: 44px;
    height: 48px;
    min-width: 44px;
    font-size: 16px;
  }
`;

const PlayIcon = styled.span.withConfig({
  shouldForwardProp: (prop) => prop !== 'isPlaying'
})`
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: inherit;
  color: currentColor;
  animation: ${props => props.isPlaying ? pulse : 'none'} 2s infinite;
  pointer-events: none; /* Ensure clicks pass through to button */
`;

const LoadingSpinner = styled.div`
  width: 18px; /* Increased from 16px to match larger button */
  height: 18px; /* Increased from 16px to match larger button */
  border: 2px solid transparent;
  border-top: 2px solid currentColor;
  border-radius: 50%;
  animation: ${spin} 1s linear infinite;
  pointer-events: none; /* Ensure clicks pass through to button */

  ${mediaQuery.mobile} {
    width: 18px;
    height: 18px;
  }
`;

const ErrorIcon = styled.span`
  font-size: 14px; /* Increased from 12px to match larger button */
  color: ${theme.colors.red};
  pointer-events: none; /* Ensure clicks pass through to button */

  ${mediaQuery.mobile} {
    font-size: 14px;
  }
`;

export default PreviewButton;