import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { Button, theme } from '@shared/styles/GlobalStyles';
import { adminGet, adminPost } from '@modules/admin/utils/adminApi';

const StyledSurface = styled(ModalSurface)`
  max-width: 560px;
`;

const Header = styled(ModalHeader)``;

const Title = styled(ModalTitle)`
  margin: 0;
`;

const Body = styled(ModalBody)`
  gap: ${theme.spacing.md};
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
`;

const Badge = styled.span.withConfig({ shouldForwardProp: (p) => !['$ok'].includes(p) })`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: ${theme.fonts.mono};
  font-size: 12px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  border: dashed 1px white;
  padding: 1px;
  color: ${p => (p.$ok ? theme.colors.success : theme.colors.black)};
`;

const Actions = styled(ModalFooter)`
  justify-content: flex-end;
`;

function ServiceBadge({ label, ok }) {
  return (
    <Badge $ok={ok}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: ok ? theme.colors.success : theme.colors.gray[600], display: 'inline-block' }} />
      {label}: {ok ? 'OK' : 'Unavailable'}
    </Badge>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ border: `${theme.borders.solid} ${theme.colors.black}`, padding: theme.spacing.sm }}>
      <div style={{ color: theme.colors.black, fontFamily: theme.fonts.mono, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: theme.fonts.mono }}>{value ?? '-'}</div>
    </div>
  );
}

export default function CuratorLinkingModal({ playlist, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  const [forceRefresh, setForceRefresh] = useState(false);
  const pollRef = useRef(null);
  const [serviceStatus, setServiceStatus] = useState(null);

  const isOpen = !!playlist;

  const coverage = useMemo(() => {
    if (!stats || !stats.total_tracks) return 0;
    return Math.round((stats.coverage || 0) * 100);
  }, [stats]);

  useEffect(() => {
    if (!isOpen) return;

    const fetchStats = async () => {
      try {
        const res = await adminGet(`/api/v1/cross-platform/stats/${playlist.id}`);
        if (res?.success) setStats(res.data);
      } catch {}
    };
    const fetchStatus = async () => {
      try {
        const res = await adminGet('/api/v1/cross-platform/test-connections');
        if (res?.success) setServiceStatus(res.data);
      } catch {}
    };
    fetchStats();
    fetchStatus();
    pollRef.current = setInterval(fetchStats, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [playlist?.id, isOpen]);

  const startLinking = async () => {
    setBusy(true); setError('');
    try {
      const body = { playlistId: playlist.id, forceRefresh };
      const res = await adminPost('/api/v1/cross-platform/link-playlist', body);
      if (!res?.success) throw new Error(res?.error || 'Failed to start');
    } catch (e) {
      setError(e.message || 'Failed to start');
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalRoot
      isOpen={isOpen}
      onClose={onClose}
      align="center"
      labelledBy="linking-modal-title"
    >
      <StyledSurface>
        <ModalCloseButton />

        <Header>
          <Title id="linking-modal-title">Cross-Platform Linking</Title>
        </Header>

        <Body>
          <div>
            <div style={{ color: theme.colors.black, fontFamily: theme.fonts.mono, textTransform: 'uppercase' }}>
              Playlist
            </div>
            <div style={{ fontFamily: theme.fonts.mono }}>{playlist.title}</div>
          </div>

          {serviceStatus && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.spacing.xs }}>
              <ServiceBadge label="Apple" ok={serviceStatus.apple?.status === 'connected'} />
              <ServiceBadge label="Tidal" ok={serviceStatus.tidal?.status === 'connected'} />
              <ServiceBadge label="Spotify" ok={serviceStatus.spotify?.status === 'connected'} />
            </div>
          )}

          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.spacing.sm }}>
              <Stat label="Total" value={stats.total_tracks} />
              <Stat label="Coverage" value={`${coverage}%`} />
              <Stat label="Apple" value={stats.apple_links} />
              <Stat label="Tidal" value={stats.tidal_links} />
              <Stat label="Spotify" value={stats.spotify_links} />
              <Stat label="Completed" value={stats.completed} />
              <Stat label="Flagged" value={stats.flagged} />
            </div>
          )}

          <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: theme.spacing.xs, alignItems: 'center' }}>
              <input type="checkbox" checked={forceRefresh} onChange={e => setForceRefresh(e.target.checked)} />
              Force refresh existing links
            </label>
          </div>

          {error && <p style={{ color: theme.colors.gray[600], margin: 0 }}>{error}</p>}
        </Body>

        <Actions>
          <Button onClick={startLinking} disabled={busy} variant="primary">Start Linking</Button>
        </Actions>
      </StyledSurface>
    </ModalRoot>
  );
}
