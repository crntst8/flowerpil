import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { theme, MainBox, Button, mediaQuery } from '@shared/styles/GlobalStyles';
import { Section, SectionHeader } from '@shared/components/Blocks.jsx';
import PlatformIcon from '@shared/components/PlatformIcon';
import { useAuth } from '@shared/contexts/AuthContext';
import { safeJson } from '@shared/utils/jsonUtils';
import { authorizeMusicKit, getMusicKitInstance } from '@shared/utils/musicKitUtils';
import { launchYouTubeMusicOAuth } from '@shared/utils/youtubeMusicAuth.js';

const DSP_PLATFORMS = ['spotify', 'tidal', 'apple', 'youtube_music'];
const platformLabels = {
  spotify: 'Spotify',
  tidal: 'TIDAL',
  apple: 'Apple Music',
  youtube_music: 'YouTube Music'
};

// Curator DSP connections manager (Spotify, TIDAL, Apple placeholder)
export default function CuratorDSPConnections() {
  const { authenticatedFetch } = useAuth();
  const [authStatus, setAuthStatus] = useState({});
  const [error, setError] = useState('');
  const [status, setStatus] = useState(''); // Separate state for status messages
  const [busy, setBusy] = useState({}); // { spotify: bool, tidal: bool }
  const [pendingAuth, setPendingAuth] = useState(null); // { platform, state }
  const [handledAuth, setHandledAuth] = useState(false);
  const [sectionExpanded, setSectionExpanded] = useState(true); // Start expanded
  const pendingAuthRef = useRef(pendingAuth);
  const handledAuthRef = useRef(handledAuth);

  // CRITICAL FIX: Store pre-initialized MusicKit instance
  const musicKitInstanceRef = useRef(null);
  const musicKitReadyRef = useRef(false);

  // DSP preference state (from questionnaire)
  const [dspPreferences, setDspPreferences] = useState({
    spotify: { available: true, email: '', useOwn: false },
    tidal: { available: true, email: '', useOwn: false },
    apple: { available: true, email: '', useOwn: false },
    youtube_music: { available: true, email: '', useOwn: false }
  });
  const [preferenceSaving, setPreferenceSaving] = useState({});
  const [preferenceStatus, setPreferenceStatus] = useState({});
  const preferenceTimersRef = useRef({});
  const dspPreferencesRef = useRef(dspPreferences);
  const [oauthApproval, setOauthApproval] = useState({ spotify: false, youtube: false });

  useEffect(() => { pendingAuthRef.current = pendingAuth; }, [pendingAuth]);
  useEffect(() => { handledAuthRef.current = handledAuth; }, [handledAuth]);
  useEffect(() => { dspPreferencesRef.current = dspPreferences; }, [dspPreferences]);

  useEffect(() => {
    // Clear error if returning from successful Apple auth
    const authSuccess = sessionStorage.getItem('apple_auth_success');
    if (authSuccess) {
      sessionStorage.removeItem('apple_auth_success');
      setError(''); // Clear any stale error messages
      setStatus(''); // Clear any stale status messages
      setBusy({}); // Clear any busy states
    }

    // Always clean up Apple auth sessionStorage on mount
    sessionStorage.removeItem('apple_auth_redirect');
    sessionStorage.removeItem('apple_dev_token');
    sessionStorage.removeItem('apple_auth_return_url');

    // Always refresh on mount so connection state persists across tab switches
    refreshStatus();
    loadPreferences();
    loadOauthApproval();

    // CRITICAL: Pre-initialize MusicKit instance on mount so it's ready when user clicks
    // This solves the "first click bug" by eliminating async delays during user gesture
    preInitializeMusicKit();
  }, []);

  useEffect(() => () => {
    Object.values(preferenceTimersRef.current || {}).forEach((timer) => {
      if (timer) clearTimeout(timer);
    });
  }, []);

  const normalizePreferences = (data = {}) => {
    const normalized = {};
    DSP_PLATFORMS.forEach((platform) => {
      const entry = data[platform] || {};
      const hasAvailability = Object.prototype.hasOwnProperty.call(entry, 'y');
      const available = hasAvailability ? !!entry.y : true;
      // Default to Flowerpil account (useOwn: false) for simpler onboarding
      normalized[platform] = {
        available,
        email: entry.email || '',
        useOwn: available ? entry.use_own === true : false,
      };
    });
    return normalized;
  };

  const showPreferenceStatus = (platform, tone, message) => {
    setPreferenceStatus((prev) => ({ ...prev, [platform]: { tone, message } }));
    if (preferenceTimersRef.current[platform]) {
      clearTimeout(preferenceTimersRef.current[platform]);
    }
    preferenceTimersRef.current[platform] = setTimeout(() => {
      setPreferenceStatus((prev) => {
        const next = { ...prev };
        delete next[platform];
        return next;
      });
      delete preferenceTimersRef.current[platform];
    }, 5000);
  };

  const loadPreferences = async () => {
    try {
      const res = await authenticatedFetch('/api/v1/curator/onboarding/dsp', { method: 'GET' });
      const json = await safeJson(res, { context: 'Load DSP preferences' });
      if (res.ok && json.success && json.data) {
        setDspPreferences(normalizePreferences(json.data));
      }
    } catch (e) {
      // Silently fail - preferences are optional
    }
  };

  const loadOauthApproval = async () => {
    try {
      const res = await authenticatedFetch('/api/v1/curator/oauth-approval-status', { method: 'GET' });
      const json = await safeJson(res, { context: 'Load OAuth approval' });
      if (res.ok && json.success) {
        setOauthApproval({
          spotify: json.data.spotify_oauth_approved,
          youtube: json.data.youtube_oauth_approved
        });
      }
    } catch (e) {
      // Silently fail - defaults to false (restricted)
    }
  };

  const mutatePreference = async (platform, updates, { successMessage } = {}) => {
    setError('');
    const prev = dspPreferencesRef.current?.[platform] || { available: false, email: '', useOwn: true };
    const next = {
      ...prev,
      ...updates,
    };

    if (!next.available) {
      next.useOwn = true;
    }

    setPreferenceSaving((state) => ({ ...state, [platform]: true }));
    setDspPreferences((state) => ({ ...state, [platform]: next }));
    dspPreferencesRef.current = { ...(dspPreferencesRef.current || {}), [platform]: next };

    try {
      const payload = next.available
        ? {
            [platform]: {
              y: true,
              email: (next.email || '').trim(),
              use_own: next.useOwn
            }
          }
        : {
            [platform]: {
              y: false
            }
          };

      const res = await authenticatedFetch('/api/v1/curator/onboarding/dsp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await safeJson(res, { context: 'Save DSP preference' });
      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || 'Failed to save preference');
      }
      const normalized = normalizePreferences(json.data);
      setDspPreferences((state) => ({ ...state, ...normalized }));
      dspPreferencesRef.current = { ...(dspPreferencesRef.current || {}), ...normalized };
      if (successMessage) {
        showPreferenceStatus(platform, 'success', successMessage);
      }
    } catch (e) {
      setError(e.message);
      setDspPreferences((state) => ({ ...state, [platform]: prev }));
      dspPreferencesRef.current = { ...(dspPreferencesRef.current || {}), [platform]: prev };
      showPreferenceStatus(platform, 'error', e.message || 'Failed to update preference.');
    } finally {
      setPreferenceSaving((state) => ({ ...state, [platform]: false }));
    }
  };

  const handleAvailabilityChange = async (platform, available) => {
    const label = platformLabels[platform] || platform.toUpperCase();
    if (!available) {
      await mutatePreference(platform, { available: false }, { successMessage: `${label} exports disabled.` });
      return;
    }
    const prev = dspPreferencesRef.current?.[platform];
    let useOwn = prev?.useOwn;
    if (useOwn === undefined) {
      useOwn = !!authStatus?.[platform]?.connected;
    }
    await mutatePreference(
      platform,
      { available: true, useOwn: useOwn !== false },
      { successMessage: `${label} exports enabled.` }
    );
  };

  const handleExportModeChange = async (platform, mode) => {
    const usesFlowerpil = mode === 'flowerpil';
    const label = platformLabels[platform] || platform.toUpperCase();
    await mutatePreference(
      platform,
      { available: true, useOwn: !usesFlowerpil },
      {
        successMessage: usesFlowerpil
          ? `Flowerpil will run your ${label} exports.`
          : `You'll export to ${label} with your account.`
      }
    );
  };

  // Handle OAuth postMessage events
  useEffect(() => {
    const onMessage = async (event) => {
      if (event.origin !== window.location.origin) return;

      if (event.data?.type === 'SPOTIFY_AUTH_SUCCESS') {
        const handledInCallback = event.data?.handled === true;
        if (handledInCallback) {
          handledAuthRef.current = true;
          setHandledAuth(true);
          pendingAuthRef.current = null;
          setPendingAuth(null);
          setBusy((b) => ({ ...b, spotify: false }));
          setTimeout(refreshStatus, 200);
          return;
        }
        const handled = handledAuthRef.current;
        const pending = pendingAuthRef.current;
        if (!handled && pending?.platform === 'spotify' && event.data.state && event.data.state === pending.state) {
          if (!event.data.code) {
            handledAuthRef.current = true;
            setHandledAuth(true);
            pendingAuthRef.current = null;
            setPendingAuth(null);
            setBusy((b) => ({ ...b, spotify: false }));
            setTimeout(refreshStatus, 200);
            return;
          }
          handledAuthRef.current = true;
          setHandledAuth(true);
          try {
            await completeSpotifyAuth(event.data.code, event.data.state);
          } catch (e) {
            setError(e.message);
          } finally {
            pendingAuthRef.current = null;
            setPendingAuth(null);
            setBusy((b) => ({ ...b, spotify: false }));
          }
        } else {
          setTimeout(refreshStatus, 200);
        }
      } else if (event.data?.type === 'TIDAL_EXPORT_AUTH_SUCCESS') {
        // TIDAL callback page already posted to API; just refresh
        if (pendingAuthRef.current?.platform === 'tidal') {
          setHandledAuth(true);
          setPendingAuth(null);
          setBusy((b) => ({ ...b, tidal: false }));
          setTimeout(refreshStatus, 300);
        } else {
          // Regardless, refresh status in case another window completed auth
          setTimeout(refreshStatus, 300);
        }
      } else if (event.data?.type === 'YOUTUBE_MUSIC_EXPORT_AUTH_SUCCESS') {
        if (pendingAuthRef.current?.platform === 'youtube_music') {
          setHandledAuth(true);
          setPendingAuth(null);
          setBusy((b) => ({ ...b, youtube_music: false }));
          setTimeout(refreshStatus, 300);
        } else {
          setTimeout(refreshStatus, 300);
        }
      } else if (event.data?.type === 'SPOTIFY_AUTH_ERROR' || event.data?.type === 'TIDAL_EXPORT_AUTH_ERROR') {
        if (!handledAuthRef.current && pendingAuthRef.current) {
          setError(event.data.error || 'Authentication failed');
          setHandledAuth(true);
          setPendingAuth(null);
          setBusy((b) => ({ ...b, [pendingAuthRef.current.platform]: false }));
        }
      } else if (event.data?.type === 'YOUTUBE_MUSIC_EXPORT_AUTH_ERROR') {
        if (!handledAuthRef.current && pendingAuthRef.current) {
          setError(event.data.error || 'Authentication failed');
          setHandledAuth(true);
          setPendingAuth(null);
          setBusy((b) => ({ ...b, [pendingAuthRef.current.platform]: false }));
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const refreshStatus = async () => {
    try {
      const res = await authenticatedFetch('/api/v1/export/auth/status', { method: 'GET' });
      const json = await safeJson(res, { context: 'Load DSP auth status' });
      if (res.ok && json.success) setAuthStatus(json.data || {});
    } catch (e) {
      // ignore noise; leave UI as-is
    }
  };

  const completeSpotifyAuth = async (code, state) => {
    const res = await authenticatedFetch('/api/v1/export/auth/spotify/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, state })
    });
    const json = await safeJson(res, { context: 'Complete Spotify auth' });
    if (!res.ok || !json.success) throw new Error(json.error || 'Spotify auth failed');
    await refreshStatus();
  };

  const startAuth = async (platform) => {
    setError('');
    setStatus('');
    setBusy((b) => ({ ...b, [platform]: true }));
    setHandledAuth(false);
    try {
      if (platform === 'youtube_music') {
        await launchYouTubeMusicOAuth({
          fetcher: authenticatedFetch,
          onPendingState: (state) => setPendingAuth({ platform, state })
        });
        setStatus('Complete YouTube Music login in the popup to finish connecting.');
        return;
      }

      const res = await authenticatedFetch(`/api/v1/export/auth/${platform}/url`, { method: 'GET' });
      const json = await safeJson(res, { context: `Start ${platform} authentication` });
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to start authentication');
      if (json?.data?.state) setPendingAuth({ platform, state: json.data.state });
      const popup = window.open(
        json.data.authUrl,
        `${platform}-oauth`,
        'width=600,height=700,scrollbars=yes,resizable=yes'
      );
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        window.location.href = json.data.authUrl;
      }
    } catch (e) {
      setError(e.message);
      setBusy((b) => ({ ...b, [platform]: false }));
    }
  };

  const revokeAuth = async (platform) => {
    setError('');
    setBusy((b) => ({ ...b, [platform]: true }));
    try {
      const res = await authenticatedFetch(`/api/v1/export/auth/${platform}`, { method: 'DELETE' });
      const json = await safeJson(res, { context: `Revoke ${platform} authentication` });
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to revoke');
      await refreshStatus();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy((b) => ({ ...b, [platform]: false }));
    }
  };

  // CRITICAL FIX: Pre-initialize MusicKit on mount (not on click)
  // This eliminates async delays during user gesture, solving the "first click bug"
  const preInitializeMusicKit = async () => {
    try {
      console.log('[MusicKit Pre-init] Starting background initialization');

      // Fetch developer token early
      const tokenRes = await authenticatedFetch('/api/v1/apple/developer-token', { method: 'GET' });
      const json = await safeJson(tokenRes, { context: 'Get Apple developer token (pre-init)' });
      if (!tokenRes.ok || !json.success) {
        console.warn('[MusicKit Pre-init] Failed to get developer token:', json.error);
        return;
      }
      const devToken = json.data.token;

      // Load and initialize MusicKit with progressive retry
      const instance = await getMusicKitInstance(devToken);

      // Store for immediate use on click
      musicKitInstanceRef.current = instance;
      musicKitReadyRef.current = true;
      console.log('[MusicKit Pre-init] ✓ Instance ready and cached');
    } catch (error) {
      console.warn('[MusicKit Pre-init] Initialization failed:', error.message);
      // Not fatal - will fall back to on-click initialization
    }
  };

  const connectApple = async () => {
    // Clear all previous state
    setError('');
    setStatus('');
    setBusy((b) => ({ ...b, apple: true }));

    try {
      console.log('[Apple Auth] Starting authentication flow');

      let music;

      // CRITICAL FIX: Use pre-initialized instance if available
      if (musicKitReadyRef.current && musicKitInstanceRef.current) {
        console.log('[Apple Auth] Using pre-initialized MusicKit instance (fast path)');
        music = musicKitInstanceRef.current;
      } else {
        // Fallback: Initialize on demand (slower, but still works)
        console.log('[Apple Auth] Pre-init not ready, initializing on demand (slow path)');
        setStatus('Loading Apple Music SDK...');

        // Fetch developer token
        const tokenRes = await authenticatedFetch('/api/v1/apple/developer-token', { method: 'GET' });
        const json = await safeJson(tokenRes, { context: 'Get Apple developer token' });
        if (!tokenRes.ok || !json.success) throw new Error(json.error || 'Failed to get developer token');
        const devToken = json.data.token;

        // Try to get MusicKit instance (this handles all loading/polling internally)
        try {
          music = await getMusicKitInstance(devToken);
        } catch (mkError) {
          console.error('[Apple Auth] getMusicKitInstance failed:', mkError);
          throw new Error(`Failed to load Apple Music SDK. Please refresh the page and try again.`);
        }
      }

      // Check if already authorized
      if (music.isAuthorized && music.musicUserToken) {
        console.log('[Apple Auth] Already authorized');
        setStatus('Saving authorization...');
        const saveRes = await authenticatedFetch('/api/v1/apple/auth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ musicUserToken: music.musicUserToken })
        });
        const saveJson = await safeJson(saveRes, { context: 'Save Apple Music token' });
        if (!saveRes.ok || !saveJson.success) throw new Error(saveJson.error || 'Failed to save authorization');
        await refreshStatus();
        setStatus('');
        setError('');
        setBusy((b) => ({ ...b, apple: false }));
        return;
      }

      // Try popup authorization
      setStatus('Waiting for authorization...');
      console.log('[Apple Auth] Calling music.authorize()');

      let mut;
      try {
        // Remove timeout race - let MusicKit handle its own timeouts
        mut = await authorizeMusicKit(music);
      } catch (authError) {
        console.error('[Apple Auth] Authorization error:', authError);
        // Check if error is specifically about popup blocking
        if (authError.message?.toLowerCase().includes('popup')) {
          throw new Error('Popup blocked. Please allow popups for this site and try again.');
        }
        throw new Error(`Authorization failed: ${authError.message}`);
      }

      if (!mut) {
        console.log('[Apple Auth] Authorization cancelled by user');
        throw new Error('Authorization was cancelled');
      }

      console.log('[Apple Auth] Authorization successful, saving token');
      setStatus('Saving authorization...');

      try {
        const saveRes = await authenticatedFetch('/api/v1/apple/auth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ musicUserToken: mut })
        });
        const saveJson = await safeJson(saveRes, { context: 'Save Apple Music token' });
        if (!saveRes.ok || !saveJson.success) {
          throw new Error(saveJson.error || 'Failed to save authorization');
        }
        console.log('[Apple Auth] Token saved successfully');
      } catch (saveError) {
        console.error('[Apple Auth] Save error:', saveError);
        throw new Error(`Failed to save authorization: ${saveError.message}`);
      }

      // Success! Refresh status and clear UI
      console.log('[Apple Auth] Refreshing connection status');
      await refreshStatus();
      setStatus('');
      setError('');
      setBusy((b) => ({ ...b, apple: false }));
      console.log('[Apple Auth] Complete - connection status updated');
    } catch (e) {
      console.error('[Apple Auth] Error in flow:', e);
      setStatus('');
      setError(e.message);
      setBusy((b) => ({ ...b, apple: false }));
    }
  };

  const renderConn = (platform, label) => {
    const auth = authStatus?.[platform] || {};
    const connected = !!auth.connected;
    const userLabel = auth.user?.email || auth.user?.display_name || auth.user?.id || '—';
    const pref = dspPreferences[platform] || { available: true, email: '', useOwn: false };
    const enabled = !!pref.available;
    const usingOwnAccount = enabled && pref.useOwn === true;
    const savingPreference = !!preferenceSaving[platform];
    const statusMessage = preferenceStatus[platform];
    const connectionBusy = !!busy[platform];
    const platformLabel = platformLabels[platform] || label;
    const pendingApproval = platform === 'spotify' && pref.pending_admin_approval === true;

    const onToggleEnabled = () => {
      if (savingPreference) return;
      handleAvailabilityChange(platform, !enabled);
    };

    const onSwitchToOwnAccount = () => {
      if (savingPreference || usingOwnAccount) return;
      handleExportModeChange(platform, 'own');
    };

    const onSwitchToFlowerpil = () => {
      if (savingPreference || !usingOwnAccount) return;
      handleExportModeChange(platform, 'flowerpil');
    };

    const connectHandler = platform === 'apple'
      ? () => connectApple()
      : () => startAuth(platform);
    const disconnectHandler = () => revokeAuth(platform);

    const isApproved = platform === 'spotify' 
      ? oauthApproval.spotify 
      : platform === 'youtube_music' 
      ? oauthApproval.youtube 
      : true; // Others are not gated

    return (
      <DSPCard key={platform} $enabled={enabled}>
        <DSPHeader>
          <PlatformIcon platform={platform} size={24} inline />
          <DSPName>{label}</DSPName>
          <EnableToggle
            type="button"
            $enabled={enabled}
            disabled={savingPreference}
            onClick={onToggleEnabled}
            aria-label={enabled ? `Disable ${label}` : `Enable ${label}`}
          >
            {enabled ? 'ON' : 'OFF'}
          </EnableToggle>
        </DSPHeader>

        {enabled && (
          <DSPBody>
            {/* Default: Flowerpil mode - simple messaging */}
            {!usingOwnAccount && (
              <FlowerpilMode>
                <ModeLabel>Using Flowerpil account</ModeLabel>
                <ModeDescription>No login required - we handle everything</ModeDescription>
                {isApproved ? (
                  <SwitchModeLink type="button" onClick={onSwitchToOwnAccount} disabled={savingPreference}>
                    Use my own account instead
                  </SwitchModeLink>
                ) : (
                  <ApiLimitNote>
                    Due to API limitations, direct account access is restricted.
                    {(platform === 'spotify' || platform === 'youtube_music') && ' Contact dev@flowerpil.com to request access.'}
                  </ApiLimitNote>
                )}
              </FlowerpilMode>
            )}

            {/* Advanced: Own account mode */}
            {usingOwnAccount && (
              <OwnAccountMode>
                <ModeLabel>Login to use your account</ModeLabel>
                {!isApproved ? (
                  <>
                    <ApiLimitNote>
                      Due to API limitations, direct account access is restricted.
                      {(platform === 'spotify' || platform === 'youtube_music') && ' Contact dev@flowerpil.com to request access.'}
                    </ApiLimitNote>
                  </>
                ) : pendingApproval ? (
                  <PendingApprovalBlock>
                    <PendingText>Pending approval</PendingText>
                    {pref.email && <EmailText>{pref.email}</EmailText>}
                  </PendingApprovalBlock>
                ) : connected ? (
                  <ConnectedSuccessBlock>
                    <SuccessIndicator>
                      <SuccessCheckmark>✓</SuccessCheckmark>
                      <div>
                        <SuccessText>Connected</SuccessText>
                        <ConnectionInfo>{userLabel}</ConnectionInfo>
                      </div>
                    </SuccessIndicator>
                    <LogOutButton onClick={disconnectHandler} disabled={connectionBusy}>
                      {connectionBusy ? 'Working…' : 'Log Out'}
                    </LogOutButton>
                  </ConnectedSuccessBlock>
                ) : (
                  <Button onClick={connectHandler} disabled={connectionBusy}>
                    {connectionBusy ? 'Connecting…' : `Connect ${label}`}
                  </Button>
                )}
                <SwitchModeLink type="button" onClick={onSwitchToFlowerpil} disabled={savingPreference}>
                  Switch to Flowerpil account
                </SwitchModeLink>
              </OwnAccountMode>
            )}
          </DSPBody>
        )}

        {!enabled && (
          <DSPDisabledMessage>
            Exports to {platformLabel} are disabled
          </DSPDisabledMessage>
        )}

        {statusMessage && (
          <PreferenceStatusText $tone={statusMessage.tone}>
            {statusMessage.message}
          </PreferenceStatusText>
        )}
      </DSPCard>
    );
  };

  const renderCollapsedSummary = () => {
    const spotifyPref = dspPreferences.spotify || {};
    const tidalPref = dspPreferences.tidal || {};
    const applePref = dspPreferences.apple || {};
    const spotifyPending = spotifyPref.pending_admin_approval === true;
    const spotifyConnected = authStatus.spotify?.connected;
    const tidalConnected = authStatus.tidal?.connected;
    const appleConnected = authStatus.apple?.connected;

    const getStatus = (pref, connected, pending) => {
      if (!pref.available) return null;
      if (pending) return 'pending';
      if (pref.useOwn && connected) return 'connected';
      if (pref.useOwn && !connected) return 'needs login';
      return 'flowerpil';
    };

    const spotifyStatus = getStatus(spotifyPref, spotifyConnected, spotifyPending);
    const tidalStatus = getStatus(tidalPref, tidalConnected, false);
    const appleStatus = getStatus(applePref, appleConnected, false);

    return (
      <CollapsedSummary>
        {spotifyStatus && (
          <SummaryItem $status={spotifyStatus}>
            Spotify · {spotifyStatus}
          </SummaryItem>
        )}
        {tidalStatus && (
          <SummaryItem $status={tidalStatus}>
            TIDAL · {tidalStatus}
          </SummaryItem>
        )}
        {appleStatus && (
          <SummaryItem $status={appleStatus}>
            Apple Music · {appleStatus}
          </SummaryItem>
        )}
        {!spotifyStatus && !tidalStatus && !appleStatus && (
          <SummaryItem>All platforms disabled</SummaryItem>
        )}
      </CollapsedSummary>
    );
  };

  return (
    <ContentShell>
      <PageHeader>
        <h1>DSP Configuration</h1>
        <p>Connect your accounts or use ours</p>
      </PageHeader>

      <SectionCard>
        <SectionHeader>
          <h3 className="title" onClick={() => setSectionExpanded(!sectionExpanded)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
            DSP Connections {sectionExpanded ? '▲' : '▼'}
          </h3>
        </SectionHeader>

        {!sectionExpanded && renderCollapsedSummary()}

      {sectionExpanded && (
          <>
            {/* Display status messages (informational) */}
            {status && <StatusText>{status}</StatusText>}

            {/* Display error messages (errors only) */}
            {error && <ErrorText role="alert">{error}</ErrorText>}

            <Cards>
              {renderConn('spotify', 'Spotify')}
              {renderConn('tidal', 'TIDAL')}
              {renderConn('apple', 'Apple Music')}
              {renderConn('youtube_music', 'YouTube Music')}
            </Cards>
          </>
        )}
      </SectionCard>
    </ContentShell>
  );

}


const PageHeader = styled(MainBox)`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  background: ${theme.colors.black};
  border: ${theme.borders.solid} ${theme.colors.black};
  padding: ${theme.spacing.lg} ${theme.spacing.xl};
  max-width: 100%;

  h1 {
    margin: 0;
    font-family: ${theme.fonts.primary};
    color: ${theme.colors.fpwhite};
    font-size: ${theme.fontSizes.h2};
    text-transform: capitalize;
    letter-spacing: -0.9px;
  }

  p {
    margin: 0;
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.fpwhite};
    opacity: 0.8;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    padding: ${theme.spacing.md};

    h1 {
      font-size: ${theme.fontSizes.h3};
    }
  }
`;

const ContentShell = styled.div`
  display: grid;
  gap: ${theme.spacing.md};
  background: ${theme.colors.fpwhite};
  padding: ${theme.spacing.md};

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.sm};
    gap: ${theme.spacing.sm};
  }
`;

const SectionCard = styled(Section)`
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.black};
  padding: ${theme.spacing.md};

  ${SectionHeader} {
    border-bottom: ${theme.borders.dashedThin} ${theme.colors.black};
    margin-bottom: ${theme.spacing.md};
    padding-bottom: ${theme.spacing.sm};
  }

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.sm};
  }
`;

const Cards = styled.div`
  display: grid;
  gap: ${theme.spacing.md};

  /* Desktop: 3 cards in a row */
  grid-template-columns: repeat(3, 1fr);

  /* Tablet: 2 cards in a row */
  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: repeat(2, 1fr);
  }

  /* Mobile: 1 card per row */
  @media (max-width: ${theme.breakpoints.mobile}) {
    grid-template-columns: 1fr;
    gap: ${theme.spacing.sm};
  }
`;

const DSPCard = styled.div.withConfig({ shouldForwardProp: (p) => !['$enabled'].includes(p) })`
  border: ${theme.borders.solid} ${p => p.$enabled ? theme.colors.black : 'rgba(0,0,0,0.3)'};
  background: ${p => p.$enabled ? theme.colors.fpwhite : 'rgba(0, 0, 0, 0.03)'};
  padding: ${theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  transition: all ${theme.transitions.fast};
  opacity: ${p => p.$enabled ? 1 : 0.6};

  @media (max-width: ${theme.breakpoints.mobile}) {
    padding: ${theme.spacing.sm};
  }
`;

const DSPHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
`;

const EnableToggle = styled.button.withConfig({ shouldForwardProp: (p) => !['$enabled'].includes(p) })`
  margin-left: auto;
  padding: ${theme.spacing.xs} ${theme.spacing.md};
  min-height: 44px;
  min-width: 60px;
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border: ${theme.borders.solidThin} ${p => p.$enabled ? theme.colors.black : 'rgba(0,0,0,0.3)'};
  background: ${p => p.$enabled ? theme.colors.black : 'transparent'};
  color: ${p => p.$enabled ? theme.colors.fpwhite : 'rgba(0,0,0,0.5)'};
  cursor: pointer;
  transition: all ${theme.transitions.fast};

  &:hover:not(:disabled) {
    background: ${p => p.$enabled ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.05)'};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const DSPBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const FlowerpilMode = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  padding: ${theme.spacing.sm};
  background: rgba(76, 175, 80, 0.08);
  border: ${theme.borders.dashed} ${theme.colors.success};
`;

const OwnAccountMode = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm};
  background: rgba(71, 159, 242, 0.08);
  border: ${theme.borders.dashed} ${theme.colors.primary};
`;

const ModeLabel = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: 12px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${theme.colors.black};
`;

const ModeDescription = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  opacity: 0.8;
`;

const SwitchModeLink = styled.button`
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solidThin} ${theme.colors.black};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  color: ${theme.colors.black};
  cursor: pointer;
  text-decoration: none;
  text-align: center;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  transition: all ${theme.transitions.fast};

  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.05);
    border-color: ${theme.colors.black};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const DSPDisabledMessage = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: 12px;
  color: rgba(0, 0, 0, 0.5);
  padding: ${theme.spacing.xs} 0;
`;

const DSPName = styled.div`
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
  font-weight: bold;
  letter-spacing: 0.06em;
  font-size: ${theme.fontSizes.small};
`;

const ConnectionInfo = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  opacity: 0.7;
  margin-top: ${theme.spacing.xs};
`;

const ConnectedSuccessBlock = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
`;

const SuccessIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  flex: 1;
`;

const SuccessCheckmark = styled.div`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: ${theme.colors.success};
  color: ${theme.colors.fpwhite};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  flex-shrink: 0;
`;

const SuccessText = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  font-weight: 600;
  color: ${theme.colors.success};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const LogOutButton = styled.button`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  min-height: 32px;
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  font-weight: bold;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border: ${theme.borders.solidThin} ${theme.colors.black};
  background: transparent;
  color: ${theme.colors.black};
  cursor: pointer;
  transition: all ${theme.transitions.fast};
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.05);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const PreferenceStatusText = styled.p.withConfig({ shouldForwardProp: (p) => !['$tone'].includes(p) })`
  margin: ${theme.spacing.sm} 0 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${(p) => {
    if (p.$tone === 'error') return theme.colors.danger;
    if (p.$tone === 'success') return theme.colors.success;
    if (p.$tone === 'info') return theme.colors.black;
    return theme.colors.black;
  }};
`;

const StatusText = styled.p`
  margin: ${theme.spacing.sm} 0 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
`;

const ErrorText = styled.p`
  margin: ${theme.spacing.sm} 0 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.danger};
`;

const CollapsedSummary = styled.div`
  padding: ${theme.spacing.sm};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  background: rgba(0, 0, 0, 0.02);
  border: ${theme.borders.dashedThin} ${theme.colors.black};
`;

const SummaryItem = styled.div.withConfig({ shouldForwardProp: (p) => !['$status'].includes(p) })`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${theme.colors.black};
  opacity: 0.9;
  
  &::before {
    content: '${p => p.$status === 'connected' || p.$status === 'flowerpil' ? '✓' : p.$status === 'pending' ? '◐' : p.$status === 'needs login' ? '○' : ''}';
    margin-right: ${theme.spacing.xs};
    color: ${p => p.$status === 'connected' || p.$status === 'flowerpil' 
      ? 'green' 
      : p.$status === 'pending' 
        ? 'orange' 
        : 'gray'};
  }
`;

const PendingApprovalBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  padding: ${theme.spacing.sm};
  background: rgba(255, 165, 0, 0.1);
  border: 1px solid rgba(255, 165, 0, 0.3);
  border-radius: 4px;
`;

const PendingText = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: orange;
  font-weight: 600;
`;

const EmailText = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.xsmall};
  color: ${theme.colors.fpwhite};
`;

const InfoText = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.xsmall};
  color: ${theme.colors.gray[400]};
  font-style: italic;
`;

const ApiLimitNote = styled.div`
  margin-top: 6px;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.5);
  font-style: italic;
  line-height: 1.4;
`;
