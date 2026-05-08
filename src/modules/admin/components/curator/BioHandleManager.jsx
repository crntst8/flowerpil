import { useState, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { theme, Input, Button } from '@shared/styles/GlobalStyles';
import { adminGet } from '../../utils/adminApi';
import { EmptyState } from '../shared';

const SectionCard = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  background: ${theme.colors.fpwhite};
  border-radius: 10px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.14);
  padding: clamp(${theme.spacing.sm}, 0.5vw, ${theme.spacing.lg});
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.04);
`;

const HandlesControls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.sm};
  align-items: center;

  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const HandlesTable = styled.div`
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.14);
  border-radius: 10px;
  background: ${theme.colors.fpwhite};
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const HandlesScroll = styled.div`
  max-height: 360px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

const HandlesHeaderRow = styled.div.withConfig({ shouldForwardProp: (prop) => prop !== '$columns' })`
  display: grid;
  grid-template-columns: ${({ $columns }) => $columns};
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.xs};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: rgba(0, 0, 0, 0.04);
  border-bottom: ${theme.borders.solidThin} rgba(0, 0, 0, 0.1);
  position: sticky;
  top: 0;
  z-index: 1;

  @media (max-width: ${theme.breakpoints.tablet}) {
    display: none;
  }
`;

const HandlesRow = styled.div.withConfig({ shouldForwardProp: (prop) => prop !== '$columns' })`
  display: grid;
  grid-template-columns: ${({ $columns }) => $columns};
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.xs};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  border-bottom: ${theme.borders.solidThin} rgba(0, 0, 0, 0.06);

  &:nth-child(even) {
    background: rgba(0, 0, 0, 0.02);
  }

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
    gap: ${theme.spacing.sm};
    padding: ${theme.spacing.md};
    border-radius: 8px;
    margin-bottom: ${theme.spacing.xs};
    background: rgba(0, 0, 0, 0.03) !important;
    border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  }
`;

const HandleLinkButton = styled.button`
  background: transparent;
  border: none;
  padding: 0;
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-decoration: underline;
  cursor: pointer;
  text-align: left;

  &:hover {
    color: ${theme.colors.success};
  }
`;

const HandleStatusBadge = styled.span.withConfig({ shouldForwardProp: (prop) => prop !== '$variant' })`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: 6px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: ${({ $variant }) => {
    if ($variant === 'published') return 'rgba(76, 175, 80, 0.15)';
    if ($variant === 'draft') return 'rgba(255, 193, 7, 0.15)';
    if ($variant === 'expired') return 'rgba(220, 53, 69, 0.15)';
    if ($variant === 'released') return 'rgba(33, 150, 243, 0.15)';
    return 'rgba(0, 0, 0, 0.1)';
  }};
  color: ${({ $variant }) => {
    if ($variant === 'published') return theme.colors.success;
    if ($variant === 'draft') return theme.colors.warning;
    if ($variant === 'expired') return theme.colors.error;
    if ($variant === 'released') return theme.colors.black;
    return theme.colors.black;
  }};
`;

const GhostButton = styled(Button).withConfig({ shouldForwardProp: (prop) => prop !== '$active' })`
  background: transparent;
  border-color: ${({ $active }) => ($active ? theme.colors.black : 'rgba(0, 0, 0, 0.25)')};
  color: ${theme.colors.black};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  font-size: ${theme.fontSizes.tiny};

  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.06);
    border-color: ${theme.colors.black};
  }

  ${({ $active }) => $active && `
    background: rgba(0, 0, 0, 0.08);
  `}
`;

const PROFILE_HANDLE_COLUMNS = 'minmax(160px, 1fr) minmax(180px, 1.2fr) minmax(90px, 0.7fr) minmax(150px, 0.9fr) minmax(150px, 0.9fr)';
const RESERVATION_HANDLE_COLUMNS = 'minmax(160px, 1fr) minmax(200px, 1.3fr) minmax(110px, 0.7fr) minmax(150px, 0.9fr) minmax(150px, 0.9fr)';

const BioHandleManager = ({ onStatusChange }) => {
  const [bioHandles, setBioHandles] = useState({ profiles: [], reservations: [] });
  const [handleSearch, setHandleSearch] = useState('');
  const [handleView, setHandleView] = useState('profiles');
  const [loading, setLoading] = useState(false);

  const formatDateTime = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const refreshBioHandles = async () => {
    setLoading(true);
    try {
      const handlesData = await adminGet('/api/v1/admin/site-admin/bio-handles');
      setBioHandles({
        profiles: handlesData.profiles || [],
        reservations: handlesData.reservations || []
      });
    } catch (error) {
      onStatusChange?.('error', `Failed to load handle directory: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshBioHandles();
  }, []);

  const filteredHandleEntries = useMemo(() => {
    const term = handleSearch.trim().toLowerCase();
    if (handleView === 'profiles') {
      return (bioHandles.profiles || []).filter((profile) => {
        if (!term) return true;
        return (
          profile.handle?.toLowerCase().includes(term) ||
          (profile.curator_name || '').toLowerCase().includes(term)
        );
      });
    }
    return (bioHandles.reservations || []).filter((reservation) => {
      if (!term) return true;
      return (
        reservation.handle?.toLowerCase().includes(term) ||
        (reservation.reserved_for || '').toLowerCase().includes(term)
      );
    });
  }, [bioHandles, handleSearch, handleView]);

  const openBioEditor = (handle) => {
    if (!handle) return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'bio');
    url.searchParams.set('handle', handle);
    window.history.pushState({}, '', url.toString());
    window.dispatchEvent(new CustomEvent('adminTabChange', {
      detail: { tab: 'bio', handle }
    }));
  };

  return (
    <SectionCard>
      <HandlesControls>
        <Input
          value={handleSearch}
          onChange={(e) => setHandleSearch(e.target.value)}
          placeholder={handleView === 'profiles' ? 'Search handles or curators' : 'Search reservations'}
          style={{ flex: '1 1 240px', minWidth: '200px' }}
        />
        <div style={{ display: 'flex', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
          <GhostButton
            type="button"
            $active={handleView === 'profiles'}
            onClick={() => setHandleView('profiles')}
          >
            Profiles ({bioHandles.profiles?.length || 0})
          </GhostButton>
          <GhostButton
            type="button"
            $active={handleView === 'reservations'}
            onClick={() => setHandleView('reservations')}
          >
            Reservations ({bioHandles.reservations?.length || 0})
          </GhostButton>
          <GhostButton type="button" onClick={refreshBioHandles} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </GhostButton>
        </div>
      </HandlesControls>
      <HandlesTable>
        <HandlesScroll>
          <HandlesHeaderRow $columns={handleView === 'profiles' ? PROFILE_HANDLE_COLUMNS : RESERVATION_HANDLE_COLUMNS}>
            {handleView === 'profiles' ? (
              <>
                <span>Handle</span>
                <span>Curator</span>
                <span>Status</span>
                <span>Updated</span>
                <span>Next Change</span>
              </>
            ) : (
              <>
                <span>Handle</span>
                <span>Reserved For</span>
                <span>Status</span>
                <span>Reserved</span>
                <span>Expires</span>
              </>
            )}
          </HandlesHeaderRow>
          {filteredHandleEntries.length === 0 ? (
            <EmptyState message="No handles found" />
          ) : (
            filteredHandleEntries.map((entry) => {
              if (handleView === 'profiles') {
                return (
                  <HandlesRow key={`profile-${entry.id}`} $columns={PROFILE_HANDLE_COLUMNS}>
                    <HandleLinkButton
                      type="button"
                      onClick={() => openBioEditor(entry.handle)}
                      title="Open in Bio Editor"
                    >
                      {entry.handle}
                    </HandleLinkButton>
                    <span>{entry.curator_name || '—'}</span>
                    <HandleStatusBadge $variant={entry.is_published ? 'published' : 'draft'}>
                      {entry.is_published ? 'Published' : 'Draft'}
                    </HandleStatusBadge>
                    <span>{formatDateTime(entry.updated_at)}</span>
                    <span>{formatDateTime(entry.next_handle_change_at)}</span>
                  </HandlesRow>
                );
              }

              const expiresAt = entry.expires_at ? new Date(entry.expires_at) : null;
              const isExpired = expiresAt ? expiresAt.getTime() < Date.now() : false;
              const reservationVariant = isExpired
                ? 'expired'
                : entry.status === 'released'
                  ? 'released'
                  : entry.status === 'reserved'
                    ? 'reserved'
                    : 'published';

              return (
                <HandlesRow key={`reservation-${entry.id}`} $columns={RESERVATION_HANDLE_COLUMNS}>
                  <span>{entry.handle}</span>
                  <span>{entry.reserved_for || '—'}</span>
                  <HandleStatusBadge $variant={reservationVariant}>
                    {entry.status || 'reserved'}
                  </HandleStatusBadge>
                  <span>{formatDateTime(entry.reserved_at)}</span>
                  <span>{formatDateTime(entry.expires_at)}</span>
                </HandlesRow>
              );
            })
          )}
        </HandlesScroll>
      </HandlesTable>
    </SectionCard>
  );
};

export default BioHandleManager;
