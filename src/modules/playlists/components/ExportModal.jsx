import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import { createExportRequest } from '../../admin/services/adminService.js';
import { launchYouTubeMusicOAuth } from '@shared/utils/youtubeMusicAuth.js';
import {
  ModalRoot,
  ModalSurface,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
} from '@shared/components/Modal';

const ExportModal = ({ isOpen, onClose, playlistId }) => {
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [authStatus, setAuthStatus] = useState({});
  const [validationData, setValidationData] = useState({});
  const [exportStatus, setExportStatus] = useState('idle'); // idle, validating, auth_required, exporting, success, error
  const [exportResult, setExportResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingAuth, setPendingAuth] = useState(null); // { platform, state }
  const [handledAuth, setHandledAuth] = useState(false);
  const pendingAuthRef = useRef(pendingAuth);
  const handledAuthRef = useRef(handledAuth);

  // Keep refs in sync to avoid stale closures in message handler
  useEffect(() => { pendingAuthRef.current = pendingAuth; }, [pendingAuth]);
  useEffect(() => { handledAuthRef.current = handledAuth; }, [handledAuth]);

  // Load auth status and validation data when modal opens
  useEffect(() => {
    if (isOpen && playlistId) {
      loadAuthStatus();
      loadValidationData();
    }
  }, [isOpen, playlistId]);

  // Listen for OAuth callback messages
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) {
        return; // Only accept messages from same origin
      }

      if (event.data.type === 'SPOTIFY_AUTH_SUCCESS') {
        if (event.data.handled) {
          handledAuthRef.current = true;
          setHandledAuth(true);
          pendingAuthRef.current = null;
          setPendingAuth(null);
          setTimeout(() => {
            loadAuthStatus();
            loadValidationData();
          }, 500);
          return;
        }
        // Guard: only handle once and only for the current pending auth state
        const handled = handledAuthRef.current;
        const pending = pendingAuthRef.current;
        if (
          !handled &&
          pending?.platform === 'spotify' &&
          event.data.state &&
          event.data.state === pending.state &&
          event.data.code
        ) {
          console.log('Spotify OAuth success (matched state), completing callback');
          handledAuthRef.current = true;
          setHandledAuth(true);
          // Complete the OAuth flow by calling the callback endpoint
          handleSpotifyCallback(event.data.code, event.data.state);
          // clear pending
          pendingAuthRef.current = null;
          setPendingAuth(null);
        } else {
          console.log('Ignoring Spotify OAuth message (no match or already handled)');
          setTimeout(() => {
            loadAuthStatus();
            loadValidationData();
          }, 500);
        }
      } else if (event.data.type === 'TIDAL_EXPORT_AUTH_SUCCESS') {
        console.log('Tidal OAuth success:', event.data);
        // Reload auth status and validation data after successful authentication
        setTimeout(() => {
          loadAuthStatus();
          loadValidationData();
        }, 500);
        // Clear pending if it was tidal
        if (pendingAuthRef.current?.platform === 'tidal') {
          setHandledAuth(true);
          setPendingAuth(null);
        }
      } else if (event.data.type === 'YOUTUBE_MUSIC_EXPORT_AUTH_SUCCESS') {
        setTimeout(() => {
          loadAuthStatus();
          loadValidationData();
        }, 500);
        if (pendingAuthRef.current?.platform === 'youtube_music') {
          setHandledAuth(true);
          setPendingAuth(null);
        }
      } else if (event.data.type === 'SPOTIFY_AUTH_ERROR' || event.data.type === 'TIDAL_EXPORT_AUTH_ERROR') {
        // Only surface errors for the active auth flow
        if (!handledAuthRef.current && pendingAuthRef.current) {
          console.error('OAuth error:', event.data.error);
          setErrorMessage(`Authentication failed: ${event.data.error}`);
          setHandledAuth(true);
          setPendingAuth(null);
        }
      } else if (event.data.type === 'YOUTUBE_MUSIC_EXPORT_AUTH_ERROR') {
        if (!handledAuthRef.current && pendingAuthRef.current) {
          console.error('OAuth error:', event.data.error);
          setErrorMessage(`Authentication failed: ${event.data.error}`);
          setHandledAuth(true);
          setPendingAuth(null);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Load authentication status for all platforms
  const loadAuthStatus = async () => {
    try {
      const response = await fetch('/api/v1/export/auth/status', {
        method: 'GET',
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Auth status loaded:', data.data);
        setAuthStatus(data.data || {});
        // Reset export status when auth status changes
        if (exportStatus === 'auth_required' && data.data?.[selectedPlatform]?.connected) {
          setExportStatus('idle');
        }
      }
    } catch (error) {
      console.error('Failed to load auth status:', error);
    }
  };

  // Load validation data for all platforms
  const loadValidationData = async () => {
    try {
      const response = await fetch(`/api/v1/export/playlists/${playlistId}/export/validate`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Validation data loaded:', data.data);
        setValidationData(data.data || {});
      }
    } catch (error) {
      console.error('Failed to load validation data:', error);
    }
  };

  // Handle platform selection
  const handlePlatformSelect = (platform) => {
    setSelectedPlatform(platform);
    setExportStatus('idle');
    setExportResult(null);
    setErrorMessage('');
  };

  // Handle Spotify OAuth callback completion
  const handleSpotifyCallback = async (code, state) => {
    try {
      const response = await fetch('/api/v1/export/auth/spotify/callback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          code,
          state
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        console.log('Spotify export OAuth completed successfully');
        // Reload auth status and validation data to show connected state
        setTimeout(() => {
          loadAuthStatus();
          loadValidationData();
        }, 500);
      } else {
        console.error('Spotify OAuth callback failed:', result.error);
        setErrorMessage(`Spotify authentication failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Spotify callback error:', error);
      setErrorMessage(`Spotify authentication failed: ${error.message}`);
    }
  };

  // Handle authentication flow
  const handleAuthenticate = async (platform) => {
    try {
      if (platform === 'youtube_music') {
        await launchYouTubeMusicOAuth({
          onPendingState: (state) => {
            if (state) setPendingAuth({ platform, state });
            setHandledAuth(false);
          }
        });
        return;
      }

      const response = await fetch(`/api/v1/export/auth/${platform}/url`, {
        method: 'GET',
        credentials: 'include'
      });
      
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `Failed to start ${platform} authentication`);
      }
      if (data?.data?.state) {
        setPendingAuth({ platform, state: data.data.state });
        setHandledAuth(false);
      }
      const popup = window.open(
        data.data.authUrl,
        `${platform}-oauth`,
        'width=600,height=700,scrollbars=yes,resizable=yes'
      );
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        window.location.href = data.data.authUrl;
      }
    } catch (error) {
      console.error(`Failed to start ${platform} authentication:`, error);
      setErrorMessage(error?.message || `Failed to start ${platform} authentication`);
    }
  };

  // Handle export execution
  const handleExport = async () => {
    if (!selectedPlatform || !validationData[selectedPlatform]?.exportable) {
      return;
    }

    setExportStatus('exporting');
    setErrorMessage('');
    setExportResult(null);

    let exportRequestId = null;
    try {
      const accountPreferences = {
        [selectedPlatform]: { account_type: 'curator' }
      };
      const record = await createExportRequest({
        playlistId,
        destinations: [selectedPlatform],
        requestedBy: 'curator',
        accountPreferences
      });
      exportRequestId = record?.id || null;
    } catch (err) {
      console.error('Failed to create export request', err);
      setErrorMessage(err?.message || 'Failed to queue export request');
    }

    try {
      const response = await fetch(`/api/v1/export/playlists/${playlistId}/export/${selectedPlatform}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          isPublic: true,
          account_type: 'curator',
          ...(exportRequestId ? { export_request_id: exportRequestId } : {})
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setExportResult(data.data);
        setExportStatus('success');
      } else {
        if (data.code === 'AUTH_REQUIRED') {
          setExportStatus('auth_required');
          setErrorMessage('Authentication required. Please connect your account.');
        } else {
          setExportStatus('error');
          setErrorMessage(data.error || 'Export failed');
        }
      }
    } catch (error) {
      console.error('Export failed:', error);
      setExportStatus('error');
      setErrorMessage('Export failed. Please try again.');
    }
  };

  // Get button text based on current state
  const getExportButtonText = () => {
    if (!selectedPlatform) return 'Select Platform';
    
    const platform = selectedPlatform.charAt(0).toUpperCase() + selectedPlatform.slice(1);
    const validation = validationData[selectedPlatform];
    const auth = authStatus[selectedPlatform];
    const alreadyExported = !!validation?.alreadyExported;
    
    console.log(`Button state for ${platform}:`, { 
      exportStatus, 
      authConnected: auth?.connected, 
      validationExportable: validation?.exportable,
      readyTracks: validation?.readyTracks,
      totalTracks: validation?.totalTracks
    });
    
    switch (exportStatus) {
      case 'exporting':
        return 'Creating Playlist...';
      case 'success':
        return 'Exported Successfully!';
      case 'error':
        return 'Export Failed - Retry';
      case 'auth_required':
        return `Connect to ${platform}`;
      default:
        if (!auth?.connected) {
          return `Connect to ${platform}`;
        }
        if (!validation?.exportable) {
          return 'No Tracks Available';
        }
        return `${alreadyExported ? 'Re-export to' : 'Export to'} ${platform} (${validation.readyTracks}/${validation.totalTracks})`;
    }
  };

  // Check if export is possible
  const canExport = () => {
    if (!selectedPlatform) return false;
    const validation = validationData[selectedPlatform];
    const auth = authStatus[selectedPlatform];
    return validation?.exportable && auth?.connected && exportStatus !== 'exporting';
  };

  return (
    <ModalRoot
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="export-modal-title"
      closeOnBackdrop={exportStatus !== 'exporting'}
    >
      <StyledModalSurface $size="md">
        <StyledModalHeader>
          <ModalTitle id="export-modal-title">Export Playlist</ModalTitle>
          <ModalCloseButton />
        </StyledModalHeader>

        <StyledModalBody>
          {/* Platform Selection */}
          <SectionTitle>Select Platform</SectionTitle>
          
          <PlatformSelector>
            <PlatformButton
              $isSelected={selectedPlatform === 'spotify'}
              $isConnected={authStatus.spotify?.connected}
              onClick={() => handlePlatformSelect('spotify')}
            >
              <PlatformIcon>🎵</PlatformIcon>
              <div>
                <PlatformName>Spotify</PlatformName>
                <PlatformStatus>
                  {authStatus.spotify?.connected ? (
                    <>✅ Connected • {validationData.spotify?.readyTracks || 0}/{validationData.spotify?.totalTracks || 0} tracks</>
                  ) : (
                    <>⚠️ Connect Required</>
                  )}
                </PlatformStatus>
              </div>
            </PlatformButton>
            
            <PlatformButton
              $isSelected={selectedPlatform === 'tidal'}
              $isConnected={authStatus.tidal?.connected}
              onClick={() => handlePlatformSelect('tidal')}
            >
              <PlatformIcon>🌊</PlatformIcon>
              <div>
                <PlatformName>Tidal</PlatformName>
                <PlatformStatus>
                  {authStatus.tidal?.connected ? (
                    <>✅ Connected • {validationData.tidal?.readyTracks || 0}/{validationData.tidal?.totalTracks || 0} tracks</>
                  ) : (
                    <>⚠️ Connect Required</>
                  )}
                </PlatformStatus>
              </div>
            </PlatformButton>

            <PlatformButton
              $isSelected={selectedPlatform === 'youtube_music'}
              $isConnected={authStatus.youtube_music?.connected}
              onClick={() => handlePlatformSelect('youtube_music')}
            >
              <PlatformIcon>📺</PlatformIcon>
              <div>
                <PlatformName>YouTube Music</PlatformName>
                <PlatformStatus>
                  {authStatus.youtube_music?.connected ? (
                    <>✅ Connected • {validationData.youtube_music?.readyTracks || 0}/{validationData.youtube_music?.totalTracks || 0} tracks</>
                  ) : (
                    <>⚠️ Connect Required</>
                  )}
                </PlatformStatus>
              </div>
            </PlatformButton>
          </PlatformSelector>

          {/* Validation Display */}
          {selectedPlatform && validationData[selectedPlatform] && (
            <ValidationSection>
              <SectionTitle>Export Summary</SectionTitle>
              <ValidationSummary>
                <ValidationStat>
                  <strong>{validationData[selectedPlatform].readyTracks}</strong> of <strong>{validationData[selectedPlatform].totalTracks}</strong> tracks ready
                </ValidationStat>
                <ValidationCoverage $coverage={validationData[selectedPlatform].coverage}>
                  {Math.round(validationData[selectedPlatform].coverage * 100)}% coverage
                </ValidationCoverage>
              </ValidationSummary>
              {validationData[selectedPlatform].exportedUrl && (
                <div style={{ marginBottom: 8 }}>
                  <a href={validationData[selectedPlatform].exportedUrl} target="_blank" rel="noopener noreferrer">Previously exported →</a>
                </div>
              )}
              
              {validationData[selectedPlatform].missingTracks > 0 && (
                <ValidationWarning>
                  {validationData[selectedPlatform].missingTracks} tracks missing from {selectedPlatform}
                </ValidationWarning>
              )}
            </ValidationSection>
          )}

          {/* Export Result */}
          {exportStatus === 'success' && exportResult && (
            <ResultSection>
              <SectionTitle>Export Complete!</SectionTitle>
              <ResultContent>
                <ResultText>
                  Successfully exported <strong>{exportResult.tracksAdded}</strong> tracks to {selectedPlatform}
                </ResultText>
                <ResultLink
                  href={exportResult.playlistUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Playlist →
                </ResultLink>
              </ResultContent>
            </ResultSection>
          )}

          {/* Error Message */}
          {errorMessage && (
            <ErrorSection>
              <ErrorMessage>{errorMessage}</ErrorMessage>
            </ErrorSection>
          )}
        </StyledModalBody>

        <StyledModalFooter>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton
            onClick={canExport() ? handleExport : () => selectedPlatform && handleAuthenticate(selectedPlatform)}
            disabled={!selectedPlatform || exportStatus === 'exporting'}
            $status={exportStatus}
          >
            {getExportButtonText()}
          </PrimaryButton>
        </StyledModalFooter>
      </StyledModalSurface>
    </ModalRoot>
  );
};

// Styled Components
const StyledModalSurface = styled(ModalSurface)`
  max-width: 500px;
  font-family: ${theme.fonts.mono};
  background: ${theme.colors.black};
  border: ${theme.borders.dashed} ${theme.colors.white};
  border-radius: 0;
  padding: 0;
  gap: 0;
`;

const StyledModalHeader = styled(ModalHeader)`
  padding: 20px;
  border-bottom: ${theme.borders.dashed} ${theme.colors.gray[300]};
  margin-bottom: 0;

  h2 {
    color: ${theme.colors.white};
    font-size: 18px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
`;

const StyledModalBody = styled(ModalBody)`
  padding: 20px;
  overflow-y: auto;
  flex: 1;
  gap: 0;
`;

const SectionTitle = styled.h3`
  color: ${theme.colors.white};
  font-size: 14px;
  font-weight: 700;
  margin: 0 0 15px 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const PlatformSelector = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 30px;
`;

const PlatformButton = styled.button`
  width: 100%;
  background: transparent;
  border: ${theme.borders.dashed} ${props => props.$isSelected ? theme.colors.white : theme.colors.gray[300]};
  padding: 15px;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 15px;
  transition: all 0.2s ease;
  
  &:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: ${theme.colors.white};
  }
  
  ${props => props.$isSelected && `
    background: rgba(255, 255, 255, 0.1);
  `}
`;

const PlatformIcon = styled.span`
  font-size: 24px;
  width: 30px;
  text-align: center;
`;

const PlatformName = styled.div`
  color: ${theme.colors.white};
  font-size: 16px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
`;

const PlatformStatus = styled.div`
  color: ${theme.colors.gray[400]};
  font-size: 12px;
  font-weight: 400;
`;

const ValidationSection = styled.div`
  margin-bottom: 20px;
`;

const ValidationSummary = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  background: rgba(255, 255, 255, 0.05);
  border: ${theme.borders.dashed} ${theme.colors.gray[300]};
  margin-bottom: 10px;
`;

const ValidationStat = styled.div`
  color: ${theme.colors.white};
  font-size: 14px;
  font-weight: 400;
`;

const ValidationCoverage = styled.div`
  color: ${props => props.$coverage >= 0.8 ? theme.colors.success : props.$coverage >= 0.5 ? theme.colors.warning : theme.colors.error};
  font-size: 14px;
  font-weight: 700;
`;

const ValidationWarning = styled.div`
  color: ${theme.colors.warning};
  font-size: 12px;
  font-weight: 400;
`;

const ResultSection = styled.div`
  margin-bottom: 20px;
`;

const ResultContent = styled.div`
  padding: 15px;
  background: rgba(34, 197, 94, 0.1);
  border: ${theme.borders.dashed} ${theme.colors.success};
`;

const ResultText = styled.div`
  color: ${theme.colors.white};
  font-size: 14px;
  margin-bottom: 10px;
`;

const ResultLink = styled.a`
  color: ${theme.colors.success};
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  
  &:hover {
    text-decoration: underline;
  }
`;

const ErrorSection = styled.div`
  margin-bottom: 20px;
`;

const ErrorMessage = styled.div`
  padding: 15px;
  background: rgba(239, 68, 68, 0.1);
  border: ${theme.borders.dashed} ${theme.colors.error};
  color: ${theme.colors.error};
  font-size: 14px;
`;

const StyledModalFooter = styled(ModalFooter)`
  padding: 20px;
  border-top: ${theme.borders.dashed} ${theme.colors.gray[300]};
  gap: 15px;
  margin-top: 0;
`;

const SecondaryButton = styled.button`
  flex: 1;
  background: transparent;
  border: ${theme.borders.dashed} ${theme.colors.gray[300]};
  color: ${theme.colors.white};
  padding: 12px 24px;
  font-family: ${theme.fonts.mono};
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: ${theme.colors.white};
  }
`;

const PrimaryButton = styled.button`
  flex: 2;
  background: ${props => {
    switch (props.$status) {
      case 'success': return theme.colors.success;
      case 'error': return theme.colors.error;
      case 'exporting': return theme.colors.gray[500];
      default: return theme.colors.white;
    }
  }};
  border: ${theme.borders.dashed} transparent;
  color: ${props => props.$status === 'success' || props.$status === 'error' || props.$status === 'exporting' ? theme.colors.white : theme.colors.black};
  padding: 12px 24px;
  font-family: ${theme.fonts.mono};
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  &:hover:not(:disabled) {
    opacity: 0.9;
  }
`;

export default ExportModal;
