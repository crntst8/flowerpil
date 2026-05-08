import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { createExportRequest } from '../services/adminService.js';
import {
  ModalRoot,
  ModalSurface,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
} from '@shared/components/Modal';
import { Button as DesignButton, tokens, theme, mediaQuery } from '../../curator/components/ui/index.jsx';
import { authorizeMusicKit, getMusicKitInstance } from '@shared/utils/musicKitUtils';
import { launchYouTubeMusicOAuth } from '@shared/utils/youtubeMusicAuth.js';
import { canSyncInPlace } from '@shared/utils/exportHelpers';

const PlaylistExportModal = ({ isOpen, onClose, playlistId, playlist = null }) => {
  // State management
  const [authStatus, setAuthStatus] = useState({});
  const [validationData, setValidationData] = useState({});
  const [exportStatus, setExportStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingAuth, setPendingAuth] = useState(null);
  const [handledAuth, setHandledAuth] = useState(false);
  const pendingAuthRef = useRef(pendingAuth);
  const handledAuthRef = useRef(handledAuth);

  // Platform selection and account type selection
  const [targets, setTargets] = useState({
    spotify: false,
    tidal: false,
    apple: false,
    youtube_music: false,
  });

  const [accountTypeSelection, setAccountTypeSelection] = useState({
    spotify: 'curator',
    tidal: 'curator',
    apple: 'curator',
    youtube_music: 'curator',
  });

  const [progress, setProgress] = useState({});

  // Keep refs in sync to avoid stale closures in message handler
  useEffect(() => { pendingAuthRef.current = pendingAuth; }, [pendingAuth]);
  useEffect(() => { handledAuthRef.current = handledAuth; }, [handledAuth]);

  // Load auth status and validation data when modal opens
  useEffect(() => {
    if (isOpen && playlistId) {
      loadAuthStatus();
      loadValidationData();
      detectExistingExports();
    }
  }, [isOpen, playlistId]);

  // Listen for OAuth callback messages
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (event.data.type === 'SPOTIFY_AUTH_SUCCESS') {
        if (event.data.handled) {
          handledAuthRef.current = true;
          setHandledAuth(true);
          pendingAuthRef.current = null;
          setPendingAuth(null);
          setTimeout(loadAuthStatus, 500);
          return;
        }
        const handled = handledAuthRef.current;
        const pending = pendingAuthRef.current;
        if (
          !handled &&
          pending?.platform === 'spotify' &&
          event.data.state &&
          event.data.state === pending.state &&
          event.data.code
        ) {
          console.log('Spotify OAuth success, completing callback');
          handledAuthRef.current = true;
          setHandledAuth(true);
          handleSpotifyCallback(event.data.code, event.data.state);
          pendingAuthRef.current = null;
          setPendingAuth(null);
        } else {
          setTimeout(loadAuthStatus, 500);
        }
      } else if (event.data.type === 'TIDAL_EXPORT_AUTH_SUCCESS') {
        console.log('Tidal OAuth success');
        setTimeout(loadAuthStatus, 500);
        if (pendingAuthRef.current?.platform === 'tidal') {
          setHandledAuth(true);
          setPendingAuth(null);
        }
      } else if (event.data.type === 'YOUTUBE_MUSIC_EXPORT_AUTH_SUCCESS') {
        setTimeout(loadAuthStatus, 500);
        if (pendingAuthRef.current?.platform === 'youtube_music') {
          setHandledAuth(true);
          setPendingAuth(null);
        }
      } else if (event.data.type === 'SPOTIFY_AUTH_ERROR' || event.data.type === 'TIDAL_EXPORT_AUTH_ERROR') {
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
        setAuthStatus(data.data || {});
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
        setValidationData(data.data || {});
      }
    } catch (error) {
      console.error('Failed to load validation data:', error);
    }
  };

  // Detect existing exports from playlist data
  const detectExistingExports = () => {
    if (!playlist) return;

    const existing = {};
    if (playlist.spotify_link) existing.spotify = playlist.spotify_link;
    if (playlist.apple_music_link) existing.apple = playlist.apple_music_link;
    if (playlist.tidal_link) existing.tidal = playlist.tidal_link;
    if (playlist.youtube_music_url || playlist.exported_youtube_music_url) {
      existing.youtube_music = playlist.exported_youtube_music_url || playlist.youtube_music_url;
    }

    // Auto-select platforms that have existing exports
    if (Object.keys(existing).length > 0) {
      setTargets(t => ({
        ...t,
        ...Object.keys(existing).reduce((acc, key) => ({ ...acc, [key]: true }), {})
      }));
    }
  };

  // Multi-select handlers
  const toggleTarget = (platform) => setTargets(t => ({ ...t, [platform]: !t[platform] }));
  const selectAll = () => setTargets({ spotify: true, tidal: true, apple: true, youtube_music: true });

  // Account type selection handler
  const setAccountType = (platform, accountType) => {
    setAccountTypeSelection(prev => ({ ...prev, [platform]: accountType }));
  };

  // Handle Spotify OAuth callback completion
  const handleSpotifyCallback = async (code, state) => {
    try {
      const response = await fetch('/api/v1/export/auth/spotify/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code, state })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        console.log('Spotify export OAuth completed successfully');
        setTimeout(loadAuthStatus, 500);
      } else {
        console.error('Spotify OAuth callback failed:', result.error);
        setErrorMessage(`Spotify authentication failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Spotify callback error:', error);
      setErrorMessage(`Spotify authentication failed: ${error.message}`);
    }
  };

  // Handle authentication flow for curator accounts
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

      if (platform === 'apple') {
        const devRes = await fetch('/api/v1/apple/developer-token', { credentials: 'include' });
        const devJson = await devRes.json();
        if (!devRes.ok || !devJson.success) throw new Error(devJson.error || 'Failed to get Apple developer token');
        const music = await getMusicKitInstance(devJson.data.token);
        const mut = await authorizeMusicKit(music);
        if (!mut) throw new Error('Authorization cancelled');
        const saveRes = await fetch('/api/v1/apple/auth/token', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ musicUserToken: mut })
        });
        const saveJson = await saveRes.json();
        if (!saveRes.ok || !saveJson.success) throw new Error(saveJson.error || 'Failed to save token');
        await loadAuthStatus();
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
      setErrorMessage(error?.message ? `Failed to start ${platform} authentication: ${error.message}` : `Failed to start ${platform} authentication`);
    }
  };

  // Handle export of selected targets
  const handleExportSelected = async () => {
    setErrorMessage('');
    setProgress({});
    setExportStatus('exporting');

    const selected = ['spotify', 'tidal', 'apple', 'youtube_music'].filter(k => targets[k]);

    for (const platform of selected) {
      const accountType = accountTypeSelection[platform];
      const platformAuth = authStatus[platform];
      const selectedAuth = platformAuth?.contexts?.[accountType];
      const v = validationData[platform];

      // Check authentication
      if (!selectedAuth?.connected) {
        setProgress(p => ({
          ...p,
          [platform]: {
            status: 'auth_required',
            message: `${accountType === 'flowerpil' ? 'Flowerpil' : 'Your'} account not connected`,
            accountType
          }
        }));
        continue;
      }

      // Check validation
      if (!v?.exportable) {
        setProgress(p => ({
          ...p,
          [platform]: {
            status: 'error',
            message: 'No tracks available to export',
            accountType
          }
        }));
        continue;
      }

      // Perform export
      const willSync = canSyncInPlace(platform, v, accountType, playlist?.curator_id || null);
      try {
        setProgress(p => ({
          ...p,
          [platform]: {
            status: 'exporting',
            message: willSync ? 'Syncing playlist...' : 'Creating playlist...',
            accountType
          }
        }));

        const response = await fetch(`/api/v1/export/playlists/${playlistId}/export/${platform}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            isPublic: true,
            account_type: accountType
          })
        });

        const json = await response.json();

        if (response.ok && json.success) {
          const action = willSync ? 'Synced' : 'Exported';
          setProgress(p => ({
            ...p,
            [platform]: {
              status: 'success',
              message: `${action} ${json.data.tracksAdded}/${json.data.totalTracks} tracks`,
              url: json.data.playlistUrl,
              accountType
            }
          }));
        } else if (json.code === 'AUTH_REQUIRED') {
          setProgress(p => ({
            ...p,
            [platform]: {
              status: 'auth_required',
              message: 'Authentication required',
              accountType
            }
          }));
        } else {
          setProgress(p => ({
            ...p,
            [platform]: {
              status: 'error',
              message: json.error || 'Export failed',
              accountType
            }
          }));
        }
      } catch (e) {
        setProgress(p => ({
          ...p,
          [platform]: {
            status: 'error',
            message: e.message || 'Export failed',
            accountType
          }
        }));
      }
    }

    setExportStatus('idle');
  };

  // Check if platform has existing export (prefer managed exports, fall back to legacy)
  const hasExistingExport = (platform) => {
    const validation = validationData[platform] || {};
    if (validation.managedExport?.status === 'active') return true;
    if (!playlist) return false;
    if (platform === 'spotify') return !!playlist.spotify_link;
    if (platform === 'apple') return !!playlist.apple_music_link;
    if (platform === 'tidal') return !!playlist.tidal_link;
    if (platform === 'youtube_music') return !!(playlist.exported_youtube_music_url || playlist.youtube_music_url);
    return false;
  };

  // Get existing export URL (prefer managed exports, fall back to legacy)
  const getExistingExportUrl = (platform) => {
    const validation = validationData[platform] || {};
    if (validation.managedExport?.status === 'active' && validation.exportedUrl) {
      return validation.exportedUrl;
    }
    if (!playlist) return null;
    if (platform === 'spotify') return playlist.spotify_link;
    if (platform === 'apple') return playlist.apple_music_link;
    if (platform === 'tidal') return playlist.tidal_link;
    if (platform === 'youtube_music') return playlist.exported_youtube_music_url || playlist.youtube_music_url || null;
    return null;
  };

  // Get re-export badge label based on platform capability and ownership
  const getReexportLabel = (platform) => {
    const validation = validationData[platform] || {};
    const accountType = accountTypeSelection[platform] || 'flowerpil';
    if (canSyncInPlace(platform, validation, accountType, playlist?.curator_id || null)) return 'Replace existing';
    return 'Create new';
  };

  return (
    <ModalRoot
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="playlist-export-title"
      closeOnBackdrop={exportStatus !== 'exporting'}
    >
      <StyledModalSurface>
        <ModalCloseButton />

        <StyledModalBody>
          <ModalTitle id="playlist-export-title">Export Playlist</ModalTitle>


          <SectionTitle>SELECT PLATFORMS</SectionTitle>
          <div style={{ marginBottom: 10 }}>
            <MiniButton onClick={selectAll}>Select All</MiniButton>
          </div>

          <PlatformsGrid>
            {['spotify', 'tidal', 'apple', 'youtube_music'].map(platform => {
              const platformAuth = authStatus[platform] || {};
              const curatorAuth = platformAuth.contexts?.curator || {};
              const flowerpilAuth = platformAuth.contexts?.flowerpil || {};
              const selectedAccountType = accountTypeSelection[platform];
              const selectedAuth = selectedAccountType === 'curator' ? curatorAuth : flowerpilAuth;
              const validation = validationData[platform] || {};
              const existingUrl = getExistingExportUrl(platform);
              const platformLabel = platform === 'apple'
                ? 'Apple Music'
                : platform === 'youtube_music'
                ? 'YouTube Music'
                : platform.charAt(0).toUpperCase() + platform.slice(1);

              return (
                <PlatformCard key={platform} $active={targets[platform]}>
                  <PlatformHeader>
                    <label>
                      <input
                        type="checkbox"
                        checked={targets[platform]}
                        onChange={() => toggleTarget(platform)}
                      />
                      <span className="label">{platformLabel}</span>
                    </label>
                    {existingUrl && (
                      <ReexportBadge>{getReexportLabel(platform)}</ReexportBadge>
                    )}
                  </PlatformHeader>

                  {/* Account Type Selector */}
                  <AccountTypeSelector>
                    <AccountTypeOption
                      $active={selectedAccountType === 'curator'}
                      onClick={() => setAccountType(platform, 'curator')}
                    >
                      <input
                        type="radio"
                        checked={selectedAccountType === 'curator'}
                        onChange={() => setAccountType(platform, 'curator')}
                      />
                      <span>My Account</span>
                    </AccountTypeOption>
                    <AccountTypeOption
                      $active={selectedAccountType === 'flowerpil'}
                      onClick={() => setAccountType(platform, 'flowerpil')}
                    >
                      <input
                        type="radio"
                        checked={selectedAccountType === 'flowerpil'}
                        onChange={() => setAccountType(platform, 'flowerpil')}
                      />
                      <span>Flowerpil</span>
                    </AccountTypeOption>
                  </AccountTypeSelector>

                  {/* Auth Status for Selected Account Type */}
                  <AuthStatus>
                    {selectedAuth.connected ? (
                      <span className="connected">
                        ✓ Connected • {validation.readyTracks || 0}/{validation.totalTracks || 0} tracks
                      </span>
                    ) : (
                      <>
                        <span className="not-connected">
                          ⚠ Not Connected
                        </span>
                        {selectedAccountType === 'curator' ? (
                          <MiniButton onClick={() => handleAuthenticate(platform)}>
                            Connect
                          </MiniButton>
                        ) : (
                          <AdminNote>exports to @flowerpil</AdminNote>
                        )}
                      </>
                    )}
                  </AuthStatus>

                  {existingUrl && (
                    <ExistingLink>
                      <a href={existingUrl} target="_blank" rel="noopener noreferrer">
                        View existing export →
                      </a>
                    </ExistingLink>
                  )}
                </PlatformCard>
              );
            })}
          </PlatformsGrid>

          {/* Export Progress */}
          {Object.keys(progress).length > 0 && (
            <ResultSection>
              <SectionTitle>Export Progress</SectionTitle>
              <ProgressList>
                {Object.entries(progress).map(([platform, result]) => (
                  <ProgressRow key={platform} $status={result.status}>
                    <span className="name">{platform.toUpperCase()}</span>
                    <div className="details">
                      <span className="msg">{result.message}</span>
                      <span className="account">({result.accountType === 'flowerpil' ? 'Flowerpil' : 'Your'} account)</span>
                    </div>
                    {result.url && (
                      <ResultLink href={result.url} target="_blank" rel="noopener noreferrer">
                        Open →
                      </ResultLink>
                    )}
                  </ProgressRow>
                ))}
              </ProgressList>
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
          <DesignButton onClick={onClose} disabled={exportStatus === 'exporting'} $variant="default" style={{ flex: 1 }}>
            Close
          </DesignButton>
          <DesignButton
            onClick={handleExportSelected}
            disabled={Object.values(targets).every(v => !v) || exportStatus === 'exporting'}
            $variant="primary"
            style={{ flex: 2 }}
          >
            {exportStatus === 'exporting' ? 'Exporting...' : 'Export Selected'}
          </DesignButton>
        </StyledModalFooter>
      </StyledModalSurface>
    </ModalRoot>
  );
};

// Styled Components
const StyledModalSurface = styled(ModalSurface)`
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid};
  border-radius: ${tokens.radii.md};
  box-shadow: ${tokens.shadows.modal};
  max-width: 600px;
  width: 100%;
  font-family: ${theme.fonts.mono};

  ${mediaQuery.mobile} {
    max-width: 95vw;
  }
`;

const StyledModalBody = styled(ModalBody)`
  padding: ${tokens.spacing[6]};
  max-height: 70vh;
  overflow-y: auto;
  gap: ${tokens.spacing[1]};

  ${mediaQuery.mobile} {
    padding: ${tokens.spacing[4]};
  }
`;

const ModalTitle = styled.h2`
  color: ${theme.colors.black};
  font-size: ${theme.fontSizes.body};
  font-weight: ${theme.fontWeights.bold};
  margin: 0 0 ${tokens.spacing[4]} 0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-family: ${theme.fonts.mono};
`;

const SectionTitle = styled.h3`
  color: ${theme.colors.black};
  font-size: ${theme.fontSizes.small};
  font-weight: ${theme.fontWeights.bold};
  margin: ${tokens.spacing[4]} 0 ${tokens.spacing[2]} 0;
  text-transform: uppercase;

  letter-spacing: 0.08em;
`;

const InfoBox = styled.div`
  padding: ${tokens.spacing[4]};
  background: rgba(0, 0, 0, 0.02);
  border: ${theme.borders.solid};
  border-radius: ${tokens.radii.sm};
  margin-bottom: ${tokens.spacing[4]};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  line-height: 1.5;

  strong {
    font-weight: ${theme.fontWeights.bold};
  }

  ul {
    margin: ${tokens.spacing[2]} 0 0 0;
    padding-left: ${tokens.spacing[5]};
  }

  li {
    margin: ${tokens.spacing[1]} 0;
  }
`;

const PlatformsGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[3]};
  margin-bottom: ${tokens.spacing[4]};
`;

const PlatformCard = styled.div`
  padding: ${tokens.spacing[4]};
  border: ${theme.borders.solid};
  border-color: ${p => p.$active ? theme.colors.primary : theme.colors.black};
  background: ${p => p.$active ? 'rgba(37, 99, 235, 0.02)' : theme.colors.fpwhite};
  box-shadow: ${p => p.$active ? tokens.shadows.card : 'none'};
  transition: all ${tokens.transitions.fast};
`;

const PlatformHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;

  label {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;

    input[type="checkbox"] {
      cursor: pointer;
      width: 18px;
      height: 18px;
    }

    .label {
      font-size: 16px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.01em;
        font-family: ${theme.fonts.primary};

      color: ${theme.colors.black};
    }
  }
`;

const ReexportBadge = styled.span`
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 4px 8px;
  background: ${theme.colors.warning};
  color: ${theme.colors.white};
  border-radius: 3px;
`;

const AccountTypeSelector = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
`;

const AccountTypeOption = styled.label`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  border: ${theme.borders.solid} ${p => p.$active ? theme.colors.black : theme.colors.borderGray};
  background: ${p => p.$active ? theme.colors.white : theme.colors.fpwhite};
  cursor: pointer;
  font-size: 12px;
  font-weight: ${p => p.$active ? 700 : 400};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  transition: all ${theme.transitions.fast};

  &:hover {
    border-color: ${theme.colors.black};
  }

  input[type="radio"] {
    cursor: pointer;
    width: 14px;
    height: 14px;
  }
`;

const AuthStatus = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  padding: 8px 0;

  .connected {
    color: ${theme.colors.success};
    font-weight: 600;
  }

  .not-connected {
    color: ${theme.colors.warning};
    font-weight: 600;
  }
`;

const AdminNote = styled.span`
  font-size: 11px;
  color: ${theme.colors.black};
  font-style: italic;
`;

const ExistingLink = styled.div`
  margin-top: 8px;
  padding-top: 8px;
  border-top: ${theme.borders.dashed} ${theme.colors.borderGray};

  a {
    font-size: 12px;
    color: ${theme.colors.primary};
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
`;

const MiniButton = styled.button`
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.black};
  color: ${theme.colors.black};
  padding: 6px 12px;
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all ${theme.transitions.fast};

  &:hover {
    background: ${theme.colors.gray[100]};
    border-color: ${theme.colors.hoverPrimary};
  }
`;

const ResultSection = styled.div`
  margin-top: 20px;
  padding-top: 20px;
  border-top: ${theme.borders.solid} ${theme.colors.borderGray};
`;

const ProgressList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const ProgressRow = styled.div`
  display: grid;
  grid-template-columns: 80px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border: ${theme.borders.solid} ${p => {
    switch (p.$status) {
      case 'success': return theme.colors.success;
      case 'error': return theme.colors.error;
      case 'auth_required': return theme.colors.warning;
      case 'exporting': return theme.colors.primary;
      default: return theme.colors.borderGray;
    }
  }};
  background: ${p => {
    switch (p.$status) {
      case 'success': return 'rgba(34, 197, 94, 0.05)';
      case 'error': return 'rgba(239, 68, 68, 0.05)';
      default: return theme.colors.white;
    }
  }};

  .name {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: ${theme.colors.black};
  }

  .details {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .msg {
    font-size: 13px;
    color: ${theme.colors.black};
  }

  .account {
    font-size: 11px;
    color: ${theme.colors.gray[500]};
  }
`;

const ResultLink = styled.a`
  font-size: 12px;
  font-weight: 700;
  color: ${theme.colors.primary};
  text-decoration: none;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }
`;

const ErrorSection = styled.div`
  margin-top: 20px;
`;

const ErrorMessage = styled.div`
  padding: 15px;
  background: rgba(239, 68, 68, 0.1);
  border: ${theme.borders.solid} ${theme.colors.error};
  color: ${theme.colors.error};
  font-size: 13px;
  line-height: 1.5;
`;

const StyledModalFooter = styled(ModalFooter)`
  display: flex;
  gap: ${tokens.spacing[3]};
  padding: ${tokens.spacing[6]};
  border-top: ${theme.borders.solid};

  ${mediaQuery.mobile} {
    padding: ${tokens.spacing[4]};
    flex-direction: column-reverse;
  }
`;


const IntroGrid = styled.div`
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: ${theme.spacing.md};
  margin: ${theme.spacing.md} 0;

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
  }
`;

const IntroCard = styled.div`
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 12px;
  padding: ${theme.spacing.md};
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.02), rgba(15, 23, 42, 0.05));
  display: grid;
  gap: ${theme.spacing.sm};
`;

const IntroHeading = styled.div`
  font-family: ${theme.fonts.primary};
  font-weight: ${theme.fontWeights.semibold};
  letter-spacing: -0.2px;
  color: #0f172a;
`;

const IntroRow = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
`;

const DestinationChip = styled.span.withConfig({ shouldForwardProp: (p) => !['$active'].includes(p) })`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: ${p => (p.$active ? 'rgba(37, 99, 235, 0.12)' : 'rgba(15, 23, 42, 0.04)')};
  border: 1px solid ${p => (p.$active ? 'rgba(37, 99, 235, 0.35)' : 'rgba(15, 23, 42, 0.1)')};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${p => (p.$active ? '#1d4ed8' : 'rgba(15, 23, 42, 0.7)')};
`;

const IntroHint = styled.p`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  color: rgba(15, 23, 42, 0.75);
  line-height: 1.45;
`;

export default PlaylistExportModal;
