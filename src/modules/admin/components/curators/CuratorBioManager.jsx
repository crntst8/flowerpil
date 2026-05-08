import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { theme, Button, Input } from '@shared/styles/GlobalStyles';
import { getDashboardBios, deleteBioProfile } from '../../services/adminService';

const Card = styled.div`
  border: ${theme.borders.dashed} rgba(0, 0, 0, 0.15);
  padding: ${theme.spacing.lg};
  background: ${theme.colors.fpwhite};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;

  h3 {
    margin: 0;
    font-size: ${theme.fontSizes.medium};
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
`;

const StatusNote = styled.p`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.6);
`;

const Toolbar = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
`;

const BioTable = styled.div`
  border: ${theme.borders.solid} ${theme.colors.black};
  border-radius: 3px;
  overflow: hidden;
`;

const TableHeader = styled.div`
  display: grid;
  grid-template-columns: 180px 1fr 1fr 120px;
  gap: ${theme.spacing.xs};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background: ${theme.colors.black};
  color: ${theme.colors.fpwhite};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;

  @media (max-width: ${theme.breakpoints.tablet}) {
    display: none;
  }
`;

const TableRow = styled.div`
  display: grid;
  grid-template-columns: 180px 1fr 1fr 120px;
  gap: ${theme.spacing.xs};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-top: ${theme.borders.dashed} rgba(0, 0, 0, 0.1);
  align-items: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
    gap: ${theme.spacing.xs};
  }
`;

const GhostButton = styled(Button).withConfig({ shouldForwardProp: (prop) => prop !== '$active' })`
  background: transparent;
  border-color: ${({ $active }) => ($active ? theme.colors.black : 'rgba(0, 0, 0, 0.25)')};
  color: ${theme.colors.black};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
    font-size: ${theme.fontSizes.tiny};


  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.06);
    border-color: ${theme.colors.black};
  }

  ${({ $active }) => $active && `
    background: rgba(0, 0, 0, 0.08);
  `}
`;

const EmptyState = styled.div`
  padding: ${theme.spacing.md};
  text-align: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.6);
`;

const Meta = styled.span`
  display: block;
  color: rgba(0, 0, 0, 0.6);
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const CuratorBioManager = () => {
  const [bios, setBios] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });

  const loadBios = async () => {
    setLoading(true);
    try {
      const data = await getDashboardBios({
        search: search.trim() || undefined,
        limit: 50
      });
      setBios(data);
    } catch (error) {
      setStatus({ type: 'error', message: error?.message || 'Failed to load bio profiles' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBios();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmitSearch = (event) => {
    event.preventDefault();
    loadBios();
  };

  const handleDelete = async (bioId) => {
    const confirmed = window.confirm('Delete this bio profile?');
    if (!confirmed) return;
    try {
      await deleteBioProfile(bioId);
      setBios((prev) => prev.filter((bio) => bio.id !== bioId));
      setStatus({ type: 'success', message: 'Bio profile deleted' });
    } catch (error) {
      setStatus({ type: 'error', message: error?.message || 'Failed to delete bio profile' });
    }
  };

  const formatDate = (value) => {
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }).format(new Date(value));
    } catch {
      return '—';
    }
  };

  return (
    <Card>
      <Header>
        <div>
          <h3>Bio Manager</h3>

        </div>
        <GhostButton variant="secondary" size="tiny" onClick={loadBios} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </GhostButton>
      </Header>

      {status.message && (
        <StatusNote style={{ color: status.type === 'error' ? theme.colors.danger : theme.colors.success }}>
          {status.message}
        </StatusNote>
      )}

      <form onSubmit={handleSubmitSearch}>
        <Toolbar>
          <Input
            placeholder="Search handles or curator names"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <Button type="submit" variant="primary" disabled={loading}>
            Search
          </Button>
        </Toolbar>
      </form>

      <BioTable>
        <TableHeader>
          <span>Handle</span>
          <span>Curator</span>
          <span>Updated</span>
          <span>Actions</span>
        </TableHeader>
        {loading ? (
          <EmptyState>Loading bio profiles…</EmptyState>
        ) : bios.length === 0 ? (
          <EmptyState>No bio profiles found.</EmptyState>
        ) : (
          bios.map((bio) => (
            <TableRow key={bio.id}>
              <div>
                {bio.handle}
                <Meta>{bio.is_published ? 'Published' : 'Draft'}</Meta>
              </div>
              <div>
                {bio.curator_name || '—'}
                <Meta>ID #{bio.curator_id || '—'}</Meta>
              </div>
              <div>
                {formatDate(bio.updated_at)}
                <Meta>Created {formatDate(bio.created_at)}</Meta>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <GhostButton
                  size="tiny"
                  variant="secondary"
                  onClick={() => handleDelete(bio.id)}
                >
                  Delete
                </GhostButton>
              </div>
            </TableRow>
          ))
        )}
      </BioTable>
    </Card>
  );
};

export default CuratorBioManager;
