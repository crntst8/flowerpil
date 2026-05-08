import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { adminDelete, adminGet, adminPost, adminPut } from '../../utils/adminApi';

// Reuse styled components from existing admin tabs
const TabStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xl};
`;

const SurfaceCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
  padding: clamp(${theme.spacing.md}, 3vw, ${theme.spacing.xl});
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
  font-family: ${theme.fonts.primary};
  text-transform: uppercase;
  letter-spacing: -1px;
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
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid rgba(0, 0, 0, 0.06);
`;

const StatLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const StatValue = styled.span`
  font-family: ${theme.fonts.primary};
  font-size: clamp(1.5rem, 3vw, 2rem);
  font-weight: 700;
  color: #000;
  letter-spacing: -1px;
`;

const StatMeta = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.4);
`;

const Toolbar = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
  align-items: center;
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 200px;
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: 2px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};

  &:focus {
    outline: none;
    border-color: rgba(0, 0, 0, 0.3);
  }
`;

const Select = styled.select`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: 2px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  background: white;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: rgba(0, 0, 0, 0.3);
  }
`;

const TableShell = styled.div`
  border: 2px solid rgba(0, 0, 0, 0.1);
  border-radius: 10px;
  overflow: hidden;
`;

const TableScroll = styled.div`
  overflow-x: auto;
  max-height: 600px;
  overflow-y: auto;
`;

const TableHeaderRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1.5fr 0.8fr 0.9fr 0.6fr 1fr 1.5fr;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background: rgba(0, 0, 0, 0.04);
  border-bottom: 2px solid rgba(0, 0, 0, 0.1);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 0, 0, 0.6);
  position: sticky;
  top: 0;
  z-index: 1;
`;

const DataRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1.5fr 0.8fr 0.9fr 0.6fr 1fr 1.5fr;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.md};
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  font-size: ${theme.fontSizes.small};
  transition: background 0.15s ease;

  &:hover {
    background: rgba(0, 0, 0, 0.02);
  }

  &:last-child {
    border-bottom: none;
  }
`;

const TableCell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;
`;

const Meta = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.5);
`;

const TableActions = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
`;

const GhostButton = styled.button`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 6px;
  background: transparent;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: lowercase;
  cursor: pointer;
  transition: all 0.15s ease;
  color: ${props => props.style?.color || 'inherit'};

  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.04);
    border-color: rgba(0, 0, 0, 0.3);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const EmptyState = styled.div`
  padding: ${theme.spacing.xl};
  text-align: center;
  color: rgba(0, 0, 0, 0.4);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const StatusMessage = styled.div`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: 8px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  background: ${props => {
    if (props.type === 'success') return 'rgba(34, 197, 94, 0.1)';
    if (props.type === 'error') return 'rgba(239, 68, 68, 0.1)';
    return 'rgba(0, 0, 0, 0.05)';
  }};
  color: ${props => {
    if (props.type === 'success') return '#16a34a';
    if (props.type === 'error') return '#dc2626';
    return 'rgba(0, 0, 0, 0.7)';
  }};
  border: 1px solid ${props => {
    if (props.type === 'success') return 'rgba(34, 197, 94, 0.3)';
    if (props.type === 'error') return 'rgba(239, 68, 68, 0.3)';
    return 'rgba(0, 0, 0, 0.1)';
  }};
`;

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: ${theme.spacing.md};
`;

const ModalDialog = styled.div`
  width: 100%;
  max-width: 640px;
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.14);
  border-radius: 14px;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
  overflow: hidden;
`;

const ModalHeader = styled.div`
  padding: ${theme.spacing.lg} ${theme.spacing.lg} ${theme.spacing.md};
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
`;

const ModalTitle = styled.h3`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.large};
  letter-spacing: -0.5px;
`;

const ModalMeta = styled.p`
  margin: ${theme.spacing.xs} 0 0 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.55);
`;

const ModalBody = styled.div`
  padding: ${theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.65);
`;

const TextInput = styled.input`
  width: 100%;
  padding: ${theme.spacing.sm};
  border-radius: 10px;
  border: 2px solid rgba(0, 0, 0, 0.1);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};

  &:focus {
    outline: none;
    border-color: rgba(0, 0, 0, 0.32);
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 220px;
  resize: vertical;
  padding: ${theme.spacing.sm};
  border-radius: 10px;
  border: 2px solid rgba(0, 0, 0, 0.1);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  line-height: 1.5;

  &:focus {
    outline: none;
    border-color: rgba(0, 0, 0, 0.32);
  }
`;

const ModalActions = styled.div`
  padding: ${theme.spacing.md} ${theme.spacing.lg} ${theme.spacing.lg};
  display: flex;
  gap: ${theme.spacing.sm};
  justify-content: flex-end;
`;

const Top10Tab = () => {
  // State management
  const [top10s, setTop10s] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [publishedFilter, setPublishedFilter] = useState('all');
  const [featuredFilter, setFeaturedFilter] = useState('all');
  const [status, setStatus] = useState({ type: '', message: '' });
  const statusTimerRef = useRef(null);
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false);
  const [bulkSubject, setBulkSubject] = useState('');
  const [bulkMessage, setBulkMessage] = useState('');
  const [bulkSending, setBulkSending] = useState(false);

  // Status management
  const showStatus = useCallback((type, message) => {
    setStatus({ type, message });
    if (statusTimerRef.current) {
      window.clearTimeout(statusTimerRef.current);
    }
    statusTimerRef.current = window.setTimeout(() => {
      setStatus({ type: '', message: '' });
    }, 5000);
  }, []);

  // Load top10s
  const loadTop10s = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        limit: '100',
        offset: '0',
        published: publishedFilter,
      });
      if (searchTerm.trim()) params.set('search', searchTerm.trim());

      const data = await adminGet(`/api/v1/admin/top10/list?${params}`);

      setTop10s(data.top10s || []);
    } catch (err) {
      setError(err.message);
      showStatus('error', err.message);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, publishedFilter, showStatus]);

  useEffect(() => {
    loadTop10s();
  }, [loadTop10s]);

  // Stats
  const stats = useMemo(() => {
    const filtered = featuredFilter === 'all'
      ? top10s
      : top10s.filter(t => t.featured === (featuredFilter === 'featured' ? 1 : 0));

    return {
      total: filtered.length,
      published: filtered.filter(t => t.is_published === 1).length,
      featured: filtered.filter(t => t.featured === 1).length,
      totalViews: filtered.reduce((sum, t) => sum + (t.view_count || 0), 0),
    };
  }, [top10s, featuredFilter]);

  // Feature/unfeature
  const handleToggleFeature = async (id, currentFeatured) => {
    try {
      await adminPut(`/api/v1/admin/top10/${id}/feature`, { featured: currentFeatured ? 0 : 1 });

      showStatus('success', currentFeatured ? 'Unfeatured successfully' : 'Featured successfully');
      await loadTop10s();
    } catch (err) {
      showStatus('error', err.message);
    }
  };

  // Delete
  const handleDelete = async (id, displayName) => {
    if (!window.confirm(`Delete ${displayName}'s Top 10? This cannot be undone.`)) {
      return;
    }

    try {
      await adminDelete(`/api/v1/admin/top10/${id}`);

      showStatus('success', 'Top 10 deleted successfully');
      await loadTop10s();
    } catch (err) {
      showStatus('error', err.message);
    }
  };

  // Manual export
  const handleManualExport = async (id, displayName) => {
    const platforms = window.prompt(
      `Export ${displayName}'s Top 10 to which platforms? (comma-separated: spotify, apple, tidal)`,
      'spotify,apple,tidal'
    );

    if (!platforms) return;

    const platformArray = platforms.split(',').map(p => p.trim()).filter(Boolean);

    try {
      const data = await adminPost(`/api/v1/admin/top10/${id}/export`, { platforms: platformArray });

      showStatus('success', data.message || 'Export completed successfully');
      await loadTop10s();
    } catch (err) {
      showStatus('error', err.message);
    }
  };

  // Email lookup (copy to clipboard)
  const handleCopyEmail = async (email, displayName) => {
    try {
      await navigator.clipboard.writeText(email);
      showStatus('success', `Copied ${displayName}'s email to clipboard`);
    } catch (err) {
      showStatus('error', 'Failed to copy email');
    }
  };

  const handleBulkEmail = () => setBulkEmailOpen(true);

  const closeBulkEmail = ({ force = false } = {}) => {
    if (bulkSending && !force) return;
    setBulkEmailOpen(false);
    setBulkSubject('');
    setBulkMessage('');
  };

  const sendBulkEmail = async () => {
    const subject = bulkSubject.trim();
    const message = bulkMessage.trim();
    if (!subject || !message) {
      showStatus('error', 'Subject and message are required');
      return;
    }

    const ok = window.confirm('Send this email to all Top 10 users?');
    if (!ok) return;

    setBulkSending(true);
    try {
      const data = await adminPost('/api/v1/admin/top10/bulk-email', { subject, message });
      const recipientCount = Number(data?.recipient_count ?? data?.recipientCount ?? 0);
      const sentCount = Number(data?.sent_count ?? data?.sentCount ?? 0);
      const failedCount = Number(data?.failed_count ?? data?.failedCount ?? 0);
      const invalidCount = Number(data?.invalid_count ?? data?.invalidCount ?? 0);

      if (recipientCount === 0) {
        const suffix = invalidCount ? ` (${invalidCount} invalid)` : '';
        showStatus('error', `No valid recipients found${suffix}.`);
      } else if (sentCount === 0) {
        const suffix = failedCount ? ` (${failedCount} failed)` : '';
        showStatus('error', `Bulk email failed to send${suffix}.`);
      } else if (failedCount || invalidCount) {
        const details = [
          failedCount ? `${failedCount} failed` : null,
          invalidCount ? `${invalidCount} invalid` : null
        ].filter(Boolean).join(', ');
        showStatus('success', `Bulk email sent to ${sentCount} recipient(s)${details ? ` (${details})` : ''}.`);
      } else {
        showStatus('success', `Bulk email sent to ${sentCount} recipient(s)`);
      }
      closeBulkEmail({ force: true });
    } catch (err) {
      showStatus('error', err.message);
    } finally {
      setBulkSending(false);
    }
  };

  // Filter top10s based on featured filter
  const displayedTop10s = useMemo(() => {
    if (featuredFilter === 'all') return top10s;
    return top10s.filter(t => t.featured === (featuredFilter === 'featured' ? 1 : 0));
  }, [top10s, featuredFilter]);

  return (
    <TabStack>
      {status.message && (
        <StatusMessage type={status.type}>{status.message}</StatusMessage>
      )}

      {bulkEmailOpen && (
        <ModalOverlay
          onClick={(e) => {
            if (e.target === e.currentTarget) closeBulkEmail();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Bulk email Top 10 users"
        >
          <ModalDialog>
            <ModalHeader>
              <ModalTitle>Bulk Email</ModalTitle>
              <ModalMeta>Sends a plaintext email to every unique email on the Top 10 database.</ModalMeta>
            </ModalHeader>
            <ModalBody>
              <Field>
                Subject
                <TextInput
                  value={bulkSubject}
                  onChange={(e) => setBulkSubject(e.target.value)}
                  placeholder="Subject"
                  disabled={bulkSending}
                />
              </Field>
              <Field>
                Message
                <TextArea
                  value={bulkMessage}
                  onChange={(e) => setBulkMessage(e.target.value)}
                  placeholder="Write your message…"
                  disabled={bulkSending}
                />
              </Field>
            </ModalBody>
            <ModalActions>
              <GhostButton onClick={closeBulkEmail} disabled={bulkSending}>
                Cancel
              </GhostButton>
              <GhostButton onClick={sendBulkEmail} disabled={bulkSending}>
                {bulkSending ? 'Sending…' : 'Send to All'}
              </GhostButton>
            </ModalActions>
          </ModalDialog>
        </ModalOverlay>
      )}

      <SurfaceCard>
        <HeaderRow>
          <HeadingGroup>
            <SectionTitle>Top 10 Lists</SectionTitle>
            <MetaText>
              {stats.total} total • {stats.published} published • {stats.featured} featured • {stats.totalViews.toLocaleString()} total views
            </MetaText>
          </HeadingGroup>
          <HeaderActions>
            <GhostButton onClick={handleBulkEmail}>
              Bulk Email
            </GhostButton>
            <GhostButton onClick={loadTop10s} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </GhostButton>
          </HeaderActions>
        </HeaderRow>

        <StatGrid>
          <StatTile>
            <StatLabel>Total Lists</StatLabel>
            <StatValue>{stats.total}</StatValue>
            <StatMeta>All Top 10 lists</StatMeta>
          </StatTile>
          <StatTile>
            <StatLabel>Published</StatLabel>
            <StatValue>{stats.published}</StatValue>
            <StatMeta>Live on site</StatMeta>
          </StatTile>
          <StatTile>
            <StatLabel>Featured</StatLabel>
            <StatValue>{stats.featured}</StatValue>
            <StatMeta>On homepage</StatMeta>
          </StatTile>
          <StatTile>
            <StatLabel>Total Views</StatLabel>
            <StatValue>{stats.totalViews.toLocaleString()}</StatValue>
            <StatMeta>All time views</StatMeta>
          </StatTile>
        </StatGrid>

        <Toolbar>
          <SearchInput
            placeholder="Search by title, user name, or email"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Select value={publishedFilter} onChange={(e) => setPublishedFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="published">Published</option>
            <option value="unpublished">Unpublished</option>
          </Select>
          <Select value={featuredFilter} onChange={(e) => setFeaturedFilter(e.target.value)}>
            <option value="all">All featured status</option>
            <option value="featured">Featured only</option>
            <option value="notfeatured">Not featured</option>
          </Select>
        </Toolbar>

        {error && <MetaText style={{ color: theme.colors.danger }}>{error}</MetaText>}

        <TableShell>
          <TableScroll>
            <TableHeaderRow>
              <span>User</span>
              <span>Title</span>
              <span>Status</span>
              <span>Conversion</span>
              <span>Views</span>
              <span>Export URLs</span>
              <span>Actions</span>
            </TableHeaderRow>

            {loading ? (
              <EmptyState>Loading Top 10s…</EmptyState>
            ) : displayedTop10s.length === 0 ? (
              <EmptyState>No Top 10s found</EmptyState>
            ) : (
              displayedTop10s.map((top10) => (
                <DataRow key={top10.id}>
                  <TableCell>
                    <span style={{ fontWeight: 600 }}>{top10.display_name}</span>
                    <Meta
                      style={{ cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => handleCopyEmail(top10.email, top10.display_name)}
                      title="Click to copy email"
                    >
                      {top10.email}
                    </Meta>
                  </TableCell>
                  <TableCell>
                    <span>{top10.title}</span>
                    {top10.slug && (
                      <Meta>
                        <a href={`/top10/${top10.slug}`} target="_blank" rel="noopener noreferrer">
                          /top10/{top10.slug}
                        </a>
                      </Meta>
                    )}
                  </TableCell>
                  <TableCell>
                    <span>{top10.is_published ? '✅ Published' : '📝 Draft'}</span>
                    <Meta>{top10.featured ? '⭐ Featured' : ''}</Meta>
                  </TableCell>
                  <TableCell>
                    <span>{top10.conversion_label || '—'}</span>
                    {top10.curator_signup_at && (
                      <Meta>{new Date(top10.curator_signup_at).toLocaleDateString()}</Meta>
                    )}
                  </TableCell>
                  <TableCell>
                    <span>{top10.view_count || 0} views</span>
                    <Meta>{top10.share_count || 0} shares</Meta>
                  </TableCell>
                  <TableCell>
                    {top10.spotify_export_url && <Meta>✅ Spotify</Meta>}
                    {top10.apple_export_url && <Meta>✅ Apple</Meta>}
                    {top10.tidal_export_url && <Meta>✅ Tidal</Meta>}
                    {!top10.spotify_export_url && !top10.apple_export_url && !top10.tidal_export_url && (
                      <Meta>No exports</Meta>
                    )}
                  </TableCell>
                  <TableActions>
                    <GhostButton
                      onClick={() => handleToggleFeature(top10.id, top10.featured)}
                      title={top10.featured ? 'Unfeature' : 'Feature'}
                    >
                      {top10.featured ? 'Unfeature' : 'Feature'}
                    </GhostButton>
                    <GhostButton
                      onClick={() => handleManualExport(top10.id, top10.display_name)}
                      disabled={!top10.is_published}
                      title="Manual export (bypasses rate limits)"
                    >
                      Export
                    </GhostButton>
                    <GhostButton
                      onClick={() => handleDelete(top10.id, top10.display_name)}
                      style={{ color: '#dc2626' }}
                    >
                      Delete
                    </GhostButton>
                  </TableActions>
                </DataRow>
              ))
            )}
          </TableScroll>
        </TableShell>
      </SurfaceCard>
    </TabStack>
  );
};

export default Top10Tab;
