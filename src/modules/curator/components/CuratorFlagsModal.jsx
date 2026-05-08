import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import {
  ModalRoot,
  ModalSurface,
  ModalHeader,
  ModalBody,
  ModalTitle,
  ModalCloseButton,
} from '@shared/components/Modal';
import { adminGet, adminPut } from '@modules/admin/utils/adminApi';
import { Button, tokens, theme, mediaQuery } from './ui/index.jsx';

const StyledSurface = styled(ModalSurface)`
  max-width: 860px;
  max-height: 90vh;
  border: ${theme.borders.solid};
  background: ${theme.colors.fpwhite};
  border-radius: ${tokens.radii.md};
  box-shadow: ${tokens.shadows.modal};

  ${mediaQuery.mobile} {
    max-width: 95vw;
  }
`;

const Header = styled(ModalHeader)`
  padding: ${tokens.spacing[6]};
  border-bottom: ${theme.borders.solid};

  ${mediaQuery.mobile} {
    padding: ${tokens.spacing[4]};
  }
`;

const Title = styled(ModalTitle)`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  font-weight: ${theme.fontWeights.bold};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${theme.colors.black};
`;

const Body = styled(ModalBody)`
  gap: ${tokens.spacing[4]};
  padding: ${tokens.spacing[6]};

  ${mediaQuery.mobile} {
    padding: ${tokens.spacing[4]};
  }
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: ${tokens.spacing[3]};
`;

const List = styled.div`
  display: grid;
  gap: ${tokens.spacing[3]};
`;

const FlagItem = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: ${tokens.spacing[4]};
  align-items: start;
  padding: ${tokens.spacing[4]};
  border: ${theme.borders.solid};
  background: ${theme.colors.fpwhite};
  border-radius: ${tokens.radii.sm};
  box-shadow: ${tokens.shadows.card};

  ${mediaQuery.mobile} {
    grid-template-columns: 1fr;
    gap: ${tokens.spacing[3]};
  }
`;

const ErrorBox = styled.div`
  padding: ${tokens.spacing[3]};
  border: ${theme.borders.solid};
  background: rgba(239, 68, 68, 0.05);
  border-color: ${theme.colors.danger};
  color: ${theme.colors.danger};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  border-radius: ${tokens.radii.sm};
`;

const EmptyBox = styled.div`
  padding: ${tokens.spacing[4]};
  border: ${theme.borders.solid};
  background: rgba(0, 0, 0, 0.02);
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  border-radius: ${tokens.radii.sm};
  text-align: center;
`;

export default function CuratorFlagsModal({ isOpen, onClose, initialPlaylistId = null }) {
  const [summary, setSummary] = useState([]);
  const [flags, setFlags] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [playlistId, setPlaylistId] = useState(initialPlaylistId);

  const hasAny = useMemo(() => flags.length > 0, [flags]);

  const issueTypeLabels = {
    wrong_dsp_url: {
      title: 'Wrong DSP URL',
      description: 'Incorrect Spotify, Apple Music, or Tidal link'
    },
    wrong_preview: {
      title: 'Wrong Deezer Preview',
      description: "Preview audio doesn't match this track"
    },
    broken_link: {
      title: 'Broken Link',
      description: "Link doesn't work or goes to wrong page"
    },
    other: {
      title: 'Other Issue',
      description: 'Something else needs attention'
    }
  };

  useEffect(() => { setPlaylistId(initialPlaylistId); }, [initialPlaylistId]);

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      setBusy(true); setError('');
      try {
        const s = await adminGet('/api/v1/curator/flags/summary');
        if (s?.success) setSummary(s.summary || []);
        const q = playlistId ? `?status=unresolved&playlistId=${playlistId}` : '?status=unresolved';
        const f = await adminGet(`/api/v1/curator/flags${q}`);
        if (f?.success) setFlags(f.flags || []);
      } catch (e) {
        setError(e.message || 'Failed to load flags');
      } finally { setBusy(false); }
    };
    load();
  }, [isOpen, playlistId]);

  const editFlagTrack = (flag) => {
    const pid = flag.playlist_id || playlistId;
    if (!pid) return;
    // Navigate to curator playlist editor and highlight the track
    window.location.href = `/curator-admin/playlists?select=${pid}&highlightTrack=${flag.track_id}`;
  };

  const resolveFlag = async (id) => {
    setBusy(true); setError('');
    try {
      const r = await adminPut(`/api/v1/curator/flags/${id}/resolve`, {});
      if (r?.success) {
        setFlags(prev => prev.filter(f => f.id !== id));
        // Update summary counts locally
        setSummary(prev => prev.map(s => s.playlist_id === (playlistId || 0) ? { ...s, unresolved: Math.max(0, (s.unresolved || 1) - 1) } : s));
      }
    } catch (e) {
      setError(e.message || 'Failed to resolve flag');
    } finally { setBusy(false); }
  };

  if (!isOpen) return null;

  return (
    <ModalRoot
      isOpen={isOpen}
      onClose={onClose}
      align="center"
      labelledBy="flags-modal-title"
    >
      <StyledSurface>
        <ModalCloseButton />

        <Header>
          <Title id="flags-modal-title">Review Flags</Title>
        </Header>

        <Body>
          <Row>
            <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
              <div style={{ color: theme.colors.black[600], fontFamily: theme.fonts.mono, textTransform: 'uppercase' }}>Playlist</div>
              <select
                value={playlistId || ''}
                onChange={(e) => setPlaylistId(e.target.value ? parseInt(e.target.value, 10) : null)}
                style={{
                  background: theme.colors.fpwhite,
                  color: theme.colors.black,
                  border: theme.borders.solid,
                  borderRadius: tokens.radii.sm,
                  padding: `${tokens.spacing[2]} ${tokens.spacing[3]}`,
                  fontFamily: theme.fonts.mono,
                  fontSize: theme.fontSizes.tiny,
                  cursor: 'pointer'
                }}
              >
                <option value="">All Playlists</option>
                {summary.map(s => (
                  <option key={s.playlist_id} value={s.playlist_id}>
                    #{s.playlist_id} ({s.unresolved || 0}/{s.total || 0})
                  </option>
                ))}
              </select>
            </div>
            <div style={{ fontFamily: theme.fonts.mono, color: theme.colors.black[600] }}>{busy ? 'Loading…' : ''}</div>
          </Row>

          {error && (
            <ErrorBox>{error}</ErrorBox>
          )}

          {!hasAny ? (
            <EmptyBox>No unresolved flags{playlistId ? ' for this playlist' : ''}.</EmptyBox>
          ) : (
            <List>
              {flags.map(flag => {
                const issue = issueTypeLabels[flag.issue_type] || { title: flag.issue_type, description: '' };
                const title = flag.track_artist && flag.track_title
                  ? `${flag.track_artist} - ${flag.track_title}`
                  : flag.track_title || `Track ID: ${flag.track_id}`;
                const created = flag.created_at ? new Date(flag.created_at).toLocaleString() : '';
                const resolved = flag.resolved_at ? new Date(flag.resolved_at).toLocaleString() : '';
                return (
                  <FlagItem key={flag.id}>
                    <div>
                      <div style={{ fontFamily: theme.fonts.mono, color: theme.colors.red, textTransform: 'uppercase' }}>Flag #{flag.id}</div>
                      <div style={{ fontFamily: theme.fonts.mono }}>{title}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.spacing.xs, marginTop: theme.spacing.md }}>
                        <div>
                          <div style={{ color: theme.colors.red, fontFamily: theme.fonts.mono, gap: theme.spacing.xs, textTransform: 'uppercase' }}>Issue</div>
                          <div style={{ fontFamily: theme.fonts.black, gap: theme.spacing.xs,  }}>{issue.title}</div>
                          {issue.description && (
                            <div style={{ fontFamily: theme.fonts.primary, color: theme.colors.black, marginTop: theme.spacing.md  }}>{issue.description}</div>
                          )}
                        </div>
                        <div>
                          <div style={{ fontFamily: theme.fonts.mono, textTransform: 'uppercase' }}>Reported: {created || '-'}</div>
                          {flag.status === 'resolved' && (
                            <>
                              <div style={{ fontFamily: theme.fonts.mono }}>Resolved: {resolved || '-'}</div>
                              {flag.resolved_by && (
                                <div style={{ fontFamily: theme.fonts.mono }}>By: {flag.resolved_by}</div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: tokens.spacing[2], flexWrap: 'wrap' }}>
                      <Button onClick={() => editFlagTrack(flag)} $variant="default" $size="sm">Edit</Button>
                      {flag.status !== 'resolved' && (
                        <Button onClick={() => resolveFlag(flag.id)} $variant="success" $size="sm">Resolve</Button>
                      )}
                    </div>
                  </FlagItem>
                );
              })}
            </List>
          )}
        </Body>
      </StyledSurface>
    </ModalRoot>
  );
}
