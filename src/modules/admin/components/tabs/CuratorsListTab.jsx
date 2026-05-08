import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import styled from 'styled-components';
import { format } from 'date-fns';
import { theme, Button } from '@shared/styles/GlobalStyles';
import { getCuratorSummaries } from '../../services/adminService';
import { adminPut, adminPatch } from '../../utils/adminApi';
import CuratorEditorModal from '../curators/CuratorEditorModal.jsx';
import CuratorBulkExportModal from '../curators/CuratorBulkExportModal.jsx';
import CuratorBulkDeleteModal from '../curators/CuratorBulkDeleteModal.jsx';

const TabWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xl};
`;

const SurfaceCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  padding: clamp(${theme.spacing.sm}, 3vw, ${theme.spacing.xl});
  border-radius: 14px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  background: ${theme.colors.fpwhite};
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.06);
`;

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
`;

const HeadingGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const SectionTitle = styled.h2`
  margin: 0;
  font-size: clamp(1.25rem, 2vw, 1.6rem);
  font-family: ${theme.fonts.Primary};
  text-transform: uppercase;
  letter-spacing: -0.9px;
`;

const MetaText = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.58);
  letter-spacing: 0.05em;
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
`;

const StatGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.sm};
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
`;

const StatTile = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: 10px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.14);
  background: rgba(0, 0, 0, 0.028);
`;

const StatLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.6);
`;

const StatValue = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: clamp(1.3rem, 2.2vw, 1.6rem);
  letter-spacing: 0.04em;
`;

const StatMeta = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.5);
`;

const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: 10px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.08);
  background: rgba(0, 0, 0, 0.02);
`;

const SearchInput = styled.input`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.25);
  background: ${theme.colors.fpwhite};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  min-width: 220px;
  border-radius: 6px;

  &:focus {
    border-color: ${theme.colors.black};
    outline: none;
  }
`;

const Select = styled.select`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.25);
  background: ${theme.colors.fpwhite};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  border-radius: 6px;

  &:focus {
    border-color: ${theme.colors.black};
    outline: none;
  }
`;

const TableShell = styled.div`
  border-radius: 12px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  background: ${theme.colors.fpwhite};
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.02);
`;

const TableScroll = styled.div`
  max-height: 460px;
  overflow-y: auto;
  position: relative;
`;

const TableHeaderRow = styled.div`
  display: grid;
  grid-template-columns: 15px 2.5fr 1fr 1.5fr 1fr 1fr 1fr 1.5fr 1fr;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
    align-items: left;

  letter-spacing: 0.08em;
  background: rgba(0, 0, 0, 0.92);
  border-bottom: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  color: ${theme.colors.fpwhite};
  position: sticky;
  top: 0;
  z-index: 2;
  backdrop-filter: blur(4px);

  @media (max-width: ${theme.breakpoints.tablet}) {
    display: none;
  }
`;

const TableRow = styled.div`
  display: grid;
  grid-template-columns: 15px 2.5fr 1fr 1.5fr 1fr 1fr 1fr 1.5fr 1fr;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.sm};
  border-bottom: ${theme.borders.solidThin} rgba(0, 0, 0, 0.05);
  align-items: left;
  font-family: ${theme.fonts.primary};
  line-height: 1;

  font-size: ${theme.fontSizes.tiny};
  background: ${({ $selected, $zebra }) => {
    if ($selected) return 'rgba(255, 211, 78, 0.28)';
    return $zebra ? 'rgba(253, 253, 253, 0.94)' : 'rgba(221, 221, 221, 0.62)';
  }};
  transition: background 0.15s ease-in-out, box-shadow 0.15s ease-in-out;

  &:hover {
    background: ${({ $selected }) =>
      $selected ? 'rgba(255, 201, 46, 0.34)' : 'rgba(0, 0, 0, 0.04)'};
  }

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
    gap: ${theme.spacing.xs};
  }
`;

const CheckboxCell = styled.div`
  display: flex;
  align-items: center;
  justify-content: left;
`;

const Checkbox = styled.input.attrs({ type: 'checkbox' })`
  width: 12px;
  height: 12px;
  cursor: pointer;
`;

const NameCell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.medium};
  font-weight: ${theme.fontWeights.medium};
  color: ${theme.colors.black};
`;

const NameText = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Cell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const CellText = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const SmallMeta = styled.span`
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: -0.78px;
  text-transform: none;
  color: rgba(0, 0, 0, 0.6);
`;

const TesterPill = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.15);
  color: #15803d;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  width: fit-content;
`;

const StatusBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: ${({ $status }) =>
    $status === 'implemented' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)'};
  color: ${({ $status }) =>
    $status === 'implemented' ? '#15803d' : '#854d0e'};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  width: fit-content;
`;

const Actions = styled.div`
  display: flex;
  justify-content: right;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
  width: 100%;
`;

const EmptyState = styled.div`
  padding: ${theme.spacing.lg};
  text-align: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.6);
`;

const BulkActionsBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: 10px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.08);
  background: rgba(0, 0, 0, 0.02);
`;

const GhostButton = styled(Button)`
  background: transparent;
  border-color: rgba(0, 0, 0, 0.28);
  color: ${theme.colors.black};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: ${theme.spacing.xs} ${theme.spacing.sm};

  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.05);
    border-color: ${theme.colors.black};
  }
`;

const SpotifyImportsGrid = styled.div`
  display: flex;
  flex-direction: column;
`;

const SpotifyImportRow = styled.div`
  display: grid;
  grid-template-columns: 1.5fr 1.5fr 1.5fr 140px 120px 100px;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-bottom: ${theme.borders.solidThin} rgba(0, 0, 0, 0.05);
  align-items: center;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.tiny};
  background: ${({ $zebra }) => $zebra ? 'rgba(253, 253, 253, 0.94)' : 'rgba(221, 221, 221, 0.62)'};
  transition: background 0.15s ease-in-out;

  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
    gap: ${theme.spacing.xs};
  }
`;

const SpotifyHeaderRow = styled.div`
  display: grid;
  grid-template-columns: 1.5fr 1.5fr 1.5fr 140px 120px 100px;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: rgba(0, 0, 0, 0.92);
  border-bottom: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  color: ${theme.colors.fpwhite};
  position: sticky;
  top: 0;
  z-index: 2;

  @media (max-width: ${theme.breakpoints.tablet}) {
    display: none;
  }
`;

const StatusDropdown = styled.select`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.solidThin} ${({ value }) =>
    value === 'added' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(234, 88, 12, 0.4)'};
  border-radius: 6px;
  background: ${({ value }) =>
    value === 'added' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 88, 12, 0.15)'};
  color: ${({ value }) =>
    value === 'added' ? '#15803d' : '#9a3412'};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  font-weight: ${theme.fontWeights.medium};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${({ value }) =>
      value === 'added' ? 'rgba(34, 197, 94, 0.6)' : 'rgba(234, 88, 12, 0.6)'};
    box-shadow: 0 0 8px ${({ value }) =>
      value === 'added' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(234, 88, 12, 0.3)'};
  }

  &:focus {
    outline: none;
    border-color: ${({ value }) =>
      value === 'added' ? '#22c55e' : '#ea580c'};
    box-shadow: 0 0 12px ${({ value }) =>
      value === 'added' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(234, 88, 12, 0.4)'};
  }
`;

const OAuthDropdown = styled.select`
  padding: 2px 6px;
  border: ${theme.borders.solidThin} ${({ value }) =>
    value === 'approved' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(156, 163, 175, 0.4)'};
  border-radius: 4px;
  background: ${({ value }) =>
    value === 'approved' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(156, 163, 175, 0.08)'};
  color: ${({ value }) =>
    value === 'approved' ? '#15803d' : '#6b7280'};
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  font-weight: ${theme.fontWeights.medium};
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: ${({ value }) =>
      value === 'approved' ? 'rgba(34, 197, 94, 0.6)' : 'rgba(156, 163, 175, 0.6)'};
  }

  &:focus {
    outline: none;
    border-color: ${({ value }) =>
      value === 'approved' ? '#22c55e' : '#9ca3af'};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const CuratorsTab = () => {
  const [curators, setCurators] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [verificationFilter, setVerificationFilter] = useState('all');
  const [dspStatusFilter, setDspStatusFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorCuratorId, setEditorCuratorId] = useState(null);
  const [bulkExportOpen, setBulkExportOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [spotifyImports, setSpotifyImports] = useState([]);
  const [showSpotifyImports, setShowSpotifyImports] = useState(false);

  const loadCurators = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getCuratorSummaries({
        search: search.trim() || undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
        verification: verificationFilter !== 'all' ? verificationFilter : undefined,
        limit: 200,
        sort: 'name',
        order: 'asc'
      });
      setCurators(data);
      setSelectedIds(prev => new Set([...prev].filter(id => data.some(curator => curator.id === id))));
    } catch (err) {
      console.error('Failed to load curators:', err);
      setError(err?.message || 'Failed to load curators');
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter, verificationFilter]);

  const loadSpotifyImports = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/admin/dashboard/spotify-imports', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setSpotifyImports(data.imports || []);
      }
    } catch (err) {
      console.error('Failed to load Spotify imports:', err);
    }
  }, []);

  useEffect(() => {
    loadCurators();
    loadSpotifyImports();
  }, [loadCurators, loadSpotifyImports]);

  const filteredCurators = useMemo(() => {
    if (dspStatusFilter === 'all') return curators;
    return curators.filter(c => c.dsp_implementation_status === dspStatusFilter);
  }, [curators, dspStatusFilter]);

  const stats = useMemo(() => {
    const total = curators.length;
    const verified = curators.filter((c) => c.verification_status === 'verified').length;
    const featured = curators.filter((c) => c.verification_status === 'featured').length;
    const testers = curators.filter((c) => c.tester).length;
    return { total, verified, featured, testers };
  }, [curators]);

  const toggleSelection = (curatorId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(curatorId)) {
        next.delete(curatorId);
      } else {
        next.add(curatorId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      if (prev.size === filteredCurators.length) {
        return new Set();
      }
      return new Set(filteredCurators.map(curator => curator.id));
    });
  };

  const handleOpenEditor = (curatorId = null) => {
    setEditorCuratorId(curatorId);
    setEditorOpen(true);
  };

  const handleEditorClose = () => {
    setEditorOpen(false);
  };

  const handleCuratorSaved = () => {
    loadCurators();
  };

  const handleCuratorDeleted = (deletedId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(deletedId);
      return next;
    });
    loadCurators();
  };

  const handleSpotifyStatusChange = async (importId, newStatus) => {
    try {
      await adminPut(`/api/v1/admin/dashboard/spotify-imports/${importId}/status`, {
        status: newStatus
      });

      // Update local state
      setSpotifyImports(imports =>
        imports.map(item =>
          item.id === importId ? { ...item, status: newStatus } : item
        )
      );
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status. Please try again.');
    }
  };

  const handleOAuthApprovalChange = async (curatorId, platform, approved) => {
    try {
      await adminPatch(`/api/v1/curators/${curatorId}/oauth-approval`, {
        platform,
        approved
      });

      // Update local state
      setCurators(prev =>
        prev.map(c =>
          c.id === curatorId
            ? { ...c, [`${platform}_oauth_approved`]: approved }
            : c
        )
      );
    } catch (error) {
      console.error('Error updating OAuth approval:', error);
      alert('Failed to update OAuth approval. Please try again.');
    }
  };

  const selectedCount = selectedIds.size;
  const selectedCuratorIds = useMemo(() => Array.from(selectedIds), [selectedIds]);

  return (
    <TabWrapper>
      <SurfaceCard>
        <HeaderRow>
          <HeadingGroup>
            <SectionTitle>Curators</SectionTitle>
            <MetaText>
              Showing {stats.total} curators • {stats.verified} verified • {stats.featured} featured • {stats.testers} tester access
            </MetaText>
          </HeadingGroup>
          <HeaderActions>
            <GhostButton onClick={loadCurators} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </GhostButton>
            <Button variant="primary" onClick={() => handleOpenEditor(null)}>
              Add New Account
            </Button>
          </HeaderActions>
        </HeaderRow>

        <StatGrid>
        <StatTile>
          <StatLabel>Total Curators</StatLabel>
          <StatValue>{stats.total}</StatValue>
          <StatMeta>Across all roster types</StatMeta>
        </StatTile>

        <StatTile>
          <StatLabel>Featured</StatLabel>
          <StatValue>{stats.featured}</StatValue>
          <StatMeta>Surfacing in spotlight modules</StatMeta>
        </StatTile>

        <StatTile>
          <StatLabel>Tester Access</StatLabel>
          <StatValue>{stats.testers}</StatValue>
          <StatMeta>Enabled for feedback tooling</StatMeta>
        </StatTile>
      </StatGrid>

        <Toolbar>
          <SearchInput
            placeholder="Search by name, bio, or location"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">All types</option>
            <option value="artist">Artist</option>
            <option value="label">Label</option>
            <option value="collective">Collective</option>
            <option value="curator">Curator</option>
            <option value="publication">Publication</option>
            <option value="writer">Writer</option>
            <option value="radio">Radio</option>
            <option value="playlist">Playlist</option>
            <option value="agency">Agency</option>
            <option value="venue">Venue</option>
            <option value="festival">Festival</option>
            <option value="radio-station">Radio Station</option>
          </Select>
          <Select value={verificationFilter} onChange={(event) => setVerificationFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="verified">Verified</option>
            <option value="featured">Featured</option>
            <option value="pending">Pending</option>
          </Select>
          <Select value={dspStatusFilter} onChange={(event) => setDspStatusFilter(event.target.value)}>
            <option value="all">All DSP statuses</option>
            <option value="implemented">Implemented</option>
            <option value="not_yet_implemented">Not Yet Implemented</option>
          </Select>
        </Toolbar>

        {error && <MetaText style={{ color: theme.colors.danger }}>{error}</MetaText>}

        <TableShell role="table" aria-label="Curator accounts">
          <TableScroll>
            <TableHeaderRow role="row">
              <CheckboxCell>
                <Checkbox
                  checked={selectedIds.size === filteredCurators.length && filteredCurators.length > 0}
                  onChange={toggleSelectAll}
                  aria-label="Select all curators"
                />
              </CheckboxCell>
              <span>Name</span>
              <span>Type</span>
              <span>Email</span>
              <span>Spotify OAuth</span>
              <span>DSP Status</span>
              <span>Published</span>
              <span>Last Login</span>
              <span>Actions</span>
            </TableHeaderRow>

            {loading ? (
              <EmptyState>Loading curators…</EmptyState>
            ) : filteredCurators.length === 0 ? (
              <EmptyState>No curators match the current filters.</EmptyState>
            ) : (
              filteredCurators.map((curator, index) => (
                <TableRow
                  key={curator.id}
                  $selected={selectedIds.has(curator.id)}
                  $zebra={index % 2 === 1}
                >
                  <CheckboxCell>
                    <Checkbox
                      checked={selectedIds.has(curator.id)}
                      onChange={() => toggleSelection(curator.id)}
                      aria-label={`Select ${curator.name}`}
                />
              </CheckboxCell>
              <NameCell>
                <NameText>{curator.name}</NameText>
                <SmallMeta>{curator.bio_short?.slice(0, 60) || 'No bio'}</SmallMeta>
                {curator.tester && <TesterPill>Tester</TesterPill>}
              </NameCell>
                  <Cell>
                    <CellText>{curator.profile_type || curator.type || '—'}</CellText>
                  </Cell>
                  <Cell>
                    <CellText>{curator.contact_email || '—'}</CellText>
                  </Cell>
                  <Cell>
                    <OAuthDropdown
                      value={curator.spotify_oauth_approved ? 'approved' : 'restricted'}
                      onChange={(e) => handleOAuthApprovalChange(
                        curator.id,
                        'spotify',
                        e.target.value === 'approved'
                      )}
                    >
                      <option value="restricted">Restricted</option>
                      <option value="approved">Approved</option>
                    </OAuthDropdown>
                  </Cell>
                  <Cell>
                    {curator.dsp_implementation_status ? (
                      <StatusBadge $status={curator.dsp_implementation_status}>
                        {curator.dsp_implementation_status === 'implemented' ? 'Implemented' : 'Not Yet'}
                      </StatusBadge>
                    ) : (
                      <CellText>—</CellText>
                    )}
                  </Cell>
                  <Cell>
                    <CellText>{curator.published_playlists ?? 0}</CellText>
                  </Cell>
                  <Cell>
                    <CellText>
                      {curator.last_login ? format(new Date(curator.last_login), 'd MMM yyyy') : '—'}
                    </CellText>
                    <SmallMeta>
                      Joined {curator.created_at ? format(new Date(curator.created_at), 'd MMM yyyy') : '—'}
                    </SmallMeta>
                  </Cell>
                  <Cell>

                  <Actions>
                    <GhostButton
                      size="tiny"
                      variant="primary"
                      onClick={() => handleOpenEditor(curator.id)}
                    >
                      Edit
                    </GhostButton>
                    <GhostButton
                      size="tiny"
                      onClick={() =>
                        window.open(`/curator/${encodeURIComponent(curator.name)}`, '_blank', 'noopener')
                      }
                    >
                      View
                    </GhostButton>
                  </Actions>

                  </Cell>

                </TableRow>
              ))
            )}
          </TableScroll>
        </TableShell>

        <BulkActionsBar>
          <MetaText>
            {selectedCount === 0
              ? 'Select curators to enable bulk actions.'
              : `${selectedCount} curator${selectedCount === 1 ? '' : 's'} selected.`}
          </MetaText>
          <div style={{ display: 'flex', gap: theme.spacing.xs }}>
            <GhostButton
              type="button"
              size="small"
              disabled={selectedCount === 0}
              onClick={() => setBulkExportOpen(true)}
            >
              Export to DSPs
            </GhostButton>
            <GhostButton
              type="button"
              size="small"
              disabled={selectedCount === 0}
              onClick={() => setBulkDeleteOpen(true)}
              style={{
                borderColor: selectedCount > 0 ? theme.colors.danger : 'rgba(0, 0, 0, 0.28)',
                color: selectedCount > 0 ? theme.colors.danger : theme.colors.black
              }}
            >
              Delete Selected
            </GhostButton>
          </div>
        </BulkActionsBar>
      </SurfaceCard>

      {/* Spotify Import Requests Section */}
      <SurfaceCard>
        <HeaderRow>
          <HeadingGroup>
            <SectionTitle>Spotify Import Requests ({spotifyImports.length})</SectionTitle>
            <MetaText>Curator requests for Spotify playlist imports</MetaText>
          </HeadingGroup>
          <HeaderActions>
            <GhostButton onClick={() => setShowSpotifyImports(!showSpotifyImports)}>
              {showSpotifyImports ? 'Hide' : 'Show'}
            </GhostButton>
          </HeaderActions>
        </HeaderRow>

        {showSpotifyImports && spotifyImports.length > 0 && (
          <TableShell>
            <TableScroll>
              <SpotifyImportsGrid>
                <SpotifyHeaderRow>
                  <span>Curator</span>
                  <span>Email</span>
                  <span>Spotify Email</span>
                  <span>Status</span>
                  <span>Submitted</span>
                  <span>Actions</span>
                </SpotifyHeaderRow>
                {spotifyImports.map((item, index) => (
                  <SpotifyImportRow key={item.id} $zebra={index % 2 === 1}>
                    <Cell>{item.curator_name || '—'}</Cell>
                    <Cell>{item.curator_email || '—'}</Cell>
                    <Cell>{item.spotify_email}</Cell>
                    <Cell>
                      <StatusDropdown
                        value={item.status}
                        onChange={(e) => handleSpotifyStatusChange(item.id, e.target.value)}
                      >
                        <option value="not_added">Not Added</option>
                        <option value="added">Added</option>
                      </StatusDropdown>
                    </Cell>
                    <Cell>{new Date(item.created_at).toLocaleDateString()}</Cell>
                    <Cell>
                      <a href={`mailto:${item.spotify_email}`} style={{ color: theme.colors.primary }}>
                        Email
                      </a>
                    </Cell>
                  </SpotifyImportRow>
                ))}
              </SpotifyImportsGrid>
            </TableScroll>
          </TableShell>
        )}

        {showSpotifyImports && spotifyImports.length === 0 && (
          <EmptyState>No Spotify import requests yet</EmptyState>
        )}
      </SurfaceCard>

      <CuratorEditorModal
        isOpen={editorOpen}
        curatorId={editorCuratorId}
        onClose={handleEditorClose}
        onSaved={handleCuratorSaved}
        onDeleted={handleCuratorDeleted}
      />

      <CuratorBulkExportModal
        isOpen={bulkExportOpen}
        curatorIds={selectedCuratorIds}
        onClose={() => setBulkExportOpen(false)}
        onQueued={() => setBulkExportOpen(false)}
      />

      <CuratorBulkDeleteModal
        isOpen={bulkDeleteOpen}
        curatorIds={selectedCuratorIds}
        onClose={() => setBulkDeleteOpen(false)}
        onDeleted={() => {
          setSelectedIds(new Set());
          loadCurators();
        }}
      />
    </TabWrapper>
  );
};

export default CuratorsTab;
