import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { theme, DashedBox, Button } from '@shared/styles/GlobalStyles';
import PlatformIcon from '@shared/components/PlatformIcon';
import { useAuth } from '@shared/contexts/AuthContext';
import { safeJson } from '@shared/utils/jsonUtils';
import { authorizeMusicKit, getMusicKitInstance } from '@shared/utils/musicKitUtils';
import { launchYouTubeMusicOAuth } from '@shared/utils/youtubeMusicAuth.js';

/**
 * Admin DSP connections manager (Spotify, TIDAL, Apple)
 * Used for admin-level DSP auth (exports using Flowerpil accounts)
 */
export default function AdminDSPConnections() {
  const { authenticatedFetch } = useAuth();
  const [authStatus, setAuthStatus] = useState({});
  const [tokenHealth, setTokenHealth] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState({}); // { spotify: bool, tidal: bool, apple: bool }
  const [pendingAuth, setPendingAuth] = useState(null); // { platform, state }
  const [handledAuth, setHandledAuth] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pendingAuthRef = useRef(pendingAuth);
  const handledAuthRef = useRef(handledAuth);

  useEffect(() => { pendingAuthRef.current = pendingAuth; }, [pendingAuth]);
  useEffect(() => { handledAuthRef.current = handledAuth; }, [handledAuth]);

  useEffect(() => {
    refreshStatus();
    refreshTokenHealth();
  }, []);

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
        if (pendingAuthRef.current?.platform === 'tidal') {
          setHandledAuth(true);
          setPendingAuth(null);
          setBusy((b) => ({ ...b, tidal: false }));
          setTimeout(refreshStatus, 300);
        } else {
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
      // Silent fail
    }
  };

  const refreshTokenHealth = async () => {
    try {
      const res = await authenticatedFetch('/api/v1/admin/dsp/tokens/health', { method: 'GET' });
      const json = await safeJson(res, { context: 'Load token health' });
      if (res.ok && json.success) setTokenHealth(json.data || null);
    } catch (e) {
      // Silent fail - token health is supplementary information
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
    setBusy((b) => ({ ...b, [platform]: true }));
    setHandledAuth(false);
    try {
      if (platform === 'youtube_music') {
        await launchYouTubeMusicOAuth({
          fetcher: authenticatedFetch,
          onPendingState: (state) => setPendingAuth({ platform, state })
        });
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

  const connectApple = async () => {
    setError('');
    setBusy((b) => ({ ...b, apple: true }));
    try {
      // Fetch developer token
      const res = await authenticatedFetch('/api/v1/apple/developer-token', { method: 'GET' });
      const json = await safeJson(res, { context: 'Get Apple developer token' });
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to get Apple developer token');
      const devToken = json.data.token;

      // Load and configure MusicKit and get instance
      const music = await getMusicKitInstance(devToken);
      const mut = await authorizeMusicKit(music);
      if (!mut) throw new Error('Authorization cancelled');

      // Persist MUT to server via the new export auth callback endpoint
      const saveRes = await authenticatedFetch('/api/v1/export/auth/apple/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ musicUserToken: mut })
      });
      const saveJson = await safeJson(saveRes, { context: 'Save Apple Music token' });
      if (!saveRes.ok || !saveJson.success) throw new Error(saveJson.error || 'Failed to save Apple token');
      await refreshStatus();
      await refreshTokenHealth();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy((b) => ({ ...b, apple: false }));
    }
  };

  const getTokenHealthForPlatform = (platform) => {
    if (!tokenHealth?.tokens) return null;
    return tokenHealth.tokens.find(t => t.platform === platform && t.is_active === 1);
  };

  const getHealthBadgeColor = (status) => {
    switch (status) {
      case 'healthy': return theme.colors.success;
      case 'expiring': return '#f59e0b'; // warning yellow
      case 'expired': return theme.colors.danger;
      case 'revoked': return theme.colors.danger;
      default: return theme.colors.black[400];
    }
  };

  const formatTimeUntilExpiry = (expiresAt) => {
    if (!expiresAt) return null;
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffMs = expiry - now;
    if (diffMs < 0) return 'Expired';
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays > 0) return `${diffDays}d`;
    if (diffHours > 0) return `${diffHours}h`;
    return '<1h';
  };

  const renderConn = (platform, label) => {
    const s = authStatus?.[platform] || {};
    const connected = !!s.connected;
    const userLabel = s.user?.email || s.user?.display_name || s.user?.id || '—';
    const onClick = connected ? () => revokeAuth(platform) : () => startAuth(platform);
    const btnText = connected ? 'Disconnect' : 'Connect';
    const tokenHealthData = getTokenHealthForPlatform(platform);
    const contexts = [
      { label: 'Flowerpil', data: s.contexts?.flowerpil },
      { label: 'Curator', data: s.contexts?.curator }
    ];

    return (
      <DSPCard key={platform}>
        <DSPHeader>
          <PlatformIcon platform={platform} size={16} inline />
          <DSPName>{label}</DSPName>
          <ConnectionStatus $connected={connected}>
            {connected ? '●' : '○'}
          </ConnectionStatus>
        </DSPHeader>
        <DSPValue style={{ fontSize: theme.fontSizes.tiny, marginBottom: theme.spacing.xs }}>
          {userLabel}
        </DSPValue>
        {tokenHealthData && (
          <TokenHealthRow>
            <HealthBadge $status={tokenHealthData.health_status}>
              {tokenHealthData.health_status}
            </HealthBadge>
            {tokenHealthData.expires_at && (
              <ExpiryInfo $urgent={tokenHealthData.expiry_urgency === 'critical'}>
                {formatTimeUntilExpiry(tokenHealthData.expires_at)}
              </ExpiryInfo>
            )}
          </TokenHealthRow>
        )}
        <ContextList>
          {contexts.map((ctx) => (
            <ContextRow key={`${platform}-${ctx.label}`}>
              <span>{ctx.label}</span>
              <ContextStatus $connected={ctx.data?.connected}>
                {ctx.data?.connected ? 'connected' : 'missing'}
              </ContextStatus>
            </ContextRow>
          ))}
        </ContextList>
        <DSPActions>
          <Button onClick={onClick} disabled={!!busy[platform]} variant={connected ? 'danger' : 'primary'} size="small">
            {busy[platform] ? 'Working...' : btnText}
          </Button>
        </DSPActions>
      </DSPCard>
    );
  };

  const connectedCount = [
    authStatus?.spotify?.connected,
    authStatus?.tidal?.connected,
    authStatus?.youtube_music?.connected,
    authStatus?.apple?.connected
  ].filter(Boolean).length;

  const criticalTokenCount = tokenHealth?.summary?.expired || 0;
  const expiringTokenCount = tokenHealth?.summary?.expiring || 0;
  const needsRefreshCount = tokenHealth?.summary?.needsRefresh || 0;

  return (
    <Container>
      <Header onClick={() => setCollapsed(!collapsed)} style={{ cursor: 'pointer' }}>
        <HeaderLeft>
          <Title>DSP Connections</Title>
          <StatusSummary>
            {connectedCount}/4 connected
            {error && ' • Error'}
            {criticalTokenCount > 0 && ` • ${criticalTokenCount} expired`}
            {needsRefreshCount > 0 && ` • ${needsRefreshCount} need refresh`}
          </StatusSummary>
        </HeaderLeft>
        <CollapseIcon>{collapsed ? '▼' : '▲'}</CollapseIcon>
      </Header>

      {!collapsed && (
        <>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <DSPGrid>
            {renderConn('spotify', 'Spotify')}
            {renderConn('tidal', 'TIDAL')}
            {renderConn('youtube_music', 'YouTube Music')}
            <DSPCard>
              <DSPHeader>
                <PlatformIcon platform="apple" size={16} inline />
                <DSPName>Apple Music</DSPName>
                <ConnectionStatus $connected={authStatus?.apple?.connected}>
                  {authStatus?.apple?.connected ? '●' : '○'}
                </ConnectionStatus>
              </DSPHeader>
              <DSPValue style={{ fontSize: theme.fontSizes.tiny, marginBottom: theme.spacing.xs }}>
                {authStatus?.apple?.user?.storefront || '—'}
              </DSPValue>
              {(() => {
                const appleTokenHealth = getTokenHealthForPlatform('apple');
                return appleTokenHealth && (
                  <TokenHealthRow>
                    <HealthBadge $status={appleTokenHealth.health_status}>
                      {appleTokenHealth.health_status}
                    </HealthBadge>
                    {appleTokenHealth.expires_at && (
                      <ExpiryInfo $urgent={appleTokenHealth.expiry_urgency === 'critical'}>
                        {formatTimeUntilExpiry(appleTokenHealth.expires_at)}
                      </ExpiryInfo>
                    )}
                  </TokenHealthRow>
                );
              })()}
              <ContextList>
                {['flowerpil', 'curator'].map((ctx) => (
                  <ContextRow key={`apple-${ctx}`}>
                    <span>{ctx === 'flowerpil' ? 'Flowerpil' : 'Curator'}</span>
                    <ContextStatus $connected={authStatus?.apple?.contexts?.[ctx]?.connected}>
                      {authStatus?.apple?.contexts?.[ctx]?.connected ? 'connected' : 'missing'}
                    </ContextStatus>
                  </ContextRow>
                ))}
              </ContextList>
              <DSPActions>
                {authStatus?.apple?.connected ? (
                  <Button onClick={() => revokeAuth('apple')} disabled={!!busy.apple} variant="danger" size="small">
                    {busy.apple ? 'Working...' : 'Disconnect'}
                  </Button>
                ) : (
                  <Button onClick={connectApple} disabled={!!busy.apple} variant="primary" size="small">
                    {busy.apple ? 'Working...' : 'Connect'}
                  </Button>
                )}
              </DSPActions>
            </DSPCard>
          </DSPGrid>
        </>
      )}
    </Container>
  );
}

const Container = styled(DashedBox)`
  padding: ${theme.spacing.sm} ${theme.spacing.sm};
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.fpwhite};
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${theme.spacing.xs} 0;
  user-select: none;

  &:hover {
    opacity: 0.8;
  }
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: baseline;
  gap: ${theme.spacing.sm};
  flex: 1;
`;

const Title = styled.h3`
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: ${theme.fontSizes.small};
  margin: 0;
`;

const StatusSummary = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
`;

const CollapseIcon = styled.span`
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
`;

const ErrorMessage = styled.div`
  margin: ${theme.spacing.sm} 0;
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  background: rgba(220, 38, 38, 0.1);
  border: ${theme.borders.solid} ${theme.colors.danger};
  color: ${theme.colors.danger};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
`;

const DSPGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: ${theme.spacing.sm};
  margin-top: ${theme.spacing.sm};

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
  }
`;

const DSPCard = styled.div`
  border: ${theme.borders.solid} ${theme.colors.black[300]};
  background: rgba(255, 255, 255, 0.3);
  padding: ${theme.spacing.sm};
`;

const DSPHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  margin-bottom: ${theme.spacing.xs};
`;

const DSPName = styled.div`
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.05em;
  flex: 1;
`;

const ConnectionStatus = styled.div`
  font-size: ${theme.fontSizes.small};
  color: ${({ $connected }) => $connected ? theme.colors.success : theme.colors.black};
`;

const DSPValue = styled.div`
  color: ${theme.colors.black[600]};
  font-family: ${theme.fonts.mono};
  word-break: break-all;
`;

const ContextList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: ${theme.spacing.xs};
`;

const ContextRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
`;

const ContextStatus = styled.span`
  color: ${({ $connected }) => ($connected ? theme.colors.success : theme.colors.danger)};
`;

const DSPActions = styled.div`
  margin-top: ${theme.spacing.xs};
  padding-top: ${theme.spacing.xs};
  border-top: ${theme.borders.dashed} ${theme.colors.black[200]};
`;

const TokenHealthRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  margin-top: ${theme.spacing.xs};
  margin-bottom: ${theme.spacing.xs};
`;

const HealthBadge = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 2px;
  background: ${({ $status }) => {
    switch ($status) {
      case 'healthy': return 'rgba(34, 197, 94, 0.1)';
      case 'expiring': return 'rgba(245, 158, 11, 0.1)';
      case 'expired': return 'rgba(220, 38, 38, 0.1)';
      case 'revoked': return 'rgba(220, 38, 38, 0.1)';
      default: return 'rgba(0, 0, 0, 0.05)';
    }
  }};
  color: ${({ $status }) => {
    switch ($status) {
      case 'healthy': return '#16a34a';
      case 'expiring': return '#d97706';
      case 'expired': return '#dc2626';
      case 'revoked': return '#dc2626';
      default: return theme.colors.black[600];
    }
  }};
  border: ${theme.borders.solid} ${({ $status }) => {
    switch ($status) {
      case 'healthy': return '#16a34a';
      case 'expiring': return '#d97706';
      case 'expired': return '#dc2626';
      case 'revoked': return '#dc2626';
      default: return theme.colors.black[300];
    }
  }};
`;

const ExpiryInfo = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${({ $urgent }) => $urgent ? '#dc2626' : theme.colors.black[600]};
  font-weight: ${({ $urgent }) => $urgent ? '600' : '400'};
`;
