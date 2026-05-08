import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  EmptyState,
  StatusBanner,
  tokens,
  theme,
  mediaQuery
} from './ui/index.jsx';
import {
  fetchAccess,
  fetchMine,
  fetchAnalytics
} from '@modules/features/services/featurePiecesService.js';

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const CuratorWritingPanel = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState(null);
  const [pieces, setPieces] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const accessResponse = await fetchAccess();
      const accessData = accessResponse?.data || null;
      setAccess(accessData);

      if (!accessData?.can_access_dashboard) {
        setPieces([]);
        setAnalytics(null);
        return;
      }

      const [piecesResponse, analyticsResponse] = await Promise.all([
        fetchMine(),
        fetchAnalytics()
      ]);

      setPieces(Array.isArray(piecesResponse?.data) ? piecesResponse.data : []);
      setAnalytics(analyticsResponse?.data || null);
    } catch (loadError) {
      console.error('Failed to load curator writing panel:', loadError);
      setError(loadError?.message || 'Failed to load writing data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totals = analytics?.totals || {
    pieces: pieces.length,
    published: pieces.filter((piece) => piece.status === 'published').length,
    drafts: pieces.filter((piece) => piece.status !== 'published').length,
    views: pieces.reduce((sum, piece) => sum + (piece.view_count || 0), 0),
    avg_views_per_piece: 0
  };

  const orderedPieces = useMemo(() => {
    return [...pieces].sort((a, b) => {
      const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
      const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
      return bTime - aTime;
    });
  }, [pieces]);

  if (loading) {
    return (
      <PanelRoot>
        <StatusBanner status="info">Loading writing workspace...</StatusBanner>
      </PanelRoot>
    );
  }

  if (error) {
    return (
      <PanelRoot>
        <StatusBanner status="error">{error}</StatusBanner>
      </PanelRoot>
    );
  }

  if (!access?.can_access_dashboard) {
    return (
      <PanelRoot>
        <StatusBanner status="warning">
          Writing is not enabled for this account yet. Ask site admin to add this curator to the pilot allowlist.
        </StatusBanner>
      </PanelRoot>
    );
  }

  return (
    <PanelRoot>
      <HeaderRow>
        <HeaderText>
          <Title>Writing</Title>
          <Subtitle>
            Build long-form pieces with SEO controls, homepage cards, and newsletter CTA links.
          </Subtitle>
        </HeaderText>
        <ButtonGroup>
          <Button type="button" $variant="secondary" onClick={loadData}>Refresh</Button>
          <Button type="button" $variant="success" onClick={() => navigate('/features/new')}>New Piece</Button>
        </ButtonGroup>
      </HeaderRow>

      <StatsGrid>
        <StatCard>
          <StatLabel>Total Pieces</StatLabel>
          <StatValue>{totals.pieces || 0}</StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>Published</StatLabel>
          <StatValue>{totals.published || 0}</StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>Drafts</StatLabel>
          <StatValue>{totals.drafts || 0}</StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>Total Views</StatLabel>
          <StatValue>{totals.views || 0}</StatValue>
        </StatCard>
      </StatsGrid>

      {orderedPieces.length === 0 ? (
        <EmptyState>
          <p>No pieces yet. Create your first piece to start your writing archive.</p>
        </EmptyState>
      ) : (
        <PieceList>
          {orderedPieces.map((piece) => (
            <PieceRow key={piece.id}>
              <PieceMeta>
                <PieceMetaTop>
                  <StatusPill $published={piece.status === 'published'}>
                    {piece.status === 'published' ? 'Published' : 'Draft'}
                  </StatusPill>
                  <SmallMeta>{piece.metadata_type || 'Feature'}</SmallMeta>
                </PieceMetaTop>
                <PieceTitle>{piece.title}</PieceTitle>
                <SmallMeta>
                  Updated {formatDate(piece.updated_at)}
                  {piece.published_at ? ` • Published ${formatDate(piece.published_at)}` : ''}
                  {Number(piece.view_count || 0) > 0 ? ` • ${piece.view_count} views` : ''}
                </SmallMeta>
              </PieceMeta>
              <PieceActions>
                <Button type="button" $size="sm" onClick={() => navigate(`/features/${piece.id}/edit`)}>Edit</Button>
                {piece.slug && (
                  <Button
                    type="button"
                    $size="sm"
                    onClick={() => window.open(`/features/${piece.slug}`, '_blank', 'noopener,noreferrer')}
                  >
                    View
                  </Button>
                )}
              </PieceActions>
            </PieceRow>
          ))}
        </PieceList>
      )}
    </PanelRoot>
  );
};

export default CuratorWritingPanel;

const PanelRoot = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[4]};
`;

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: ${tokens.spacing[4]};
  flex-wrap: wrap;
`;

const HeaderText = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[1]};
`;

const Title = styled.h2`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h2};
  letter-spacing: -0.7px;
`;

const Subtitle = styled.p`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.66);
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: ${tokens.spacing[2]};
  flex-wrap: wrap;
`;

const StatsGrid = styled.div`
  display: grid;
  gap: ${tokens.spacing[3]};
  grid-template-columns: repeat(4, minmax(0, 1fr));

  ${mediaQuery.tablet} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const StatCard = styled.div`
  border: ${theme.borders.solidThin} ${theme.colors.blackAct};
  background: ${theme.colors.fpwhite};
  padding: ${tokens.spacing[3]};
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[1]};
`;

const StatLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.6);
`;

const StatValue = styled.span`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h3};
  font-weight: ${theme.fontWeights.bold};
`;

const PieceList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};
`;

const PieceRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: ${tokens.spacing[3]};
  align-items: center;
  border: ${theme.borders.solidThin} ${theme.colors.blackAct};
  background: ${theme.colors.fpwhite};
  padding: ${tokens.spacing[3]};

  ${mediaQuery.mobile} {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
`;

const PieceMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[1]};
  min-width: 0;
`;

const PieceMetaTop = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing[2]};
`;

const StatusPill = styled.span.withConfig({
  shouldForwardProp: (prop) => prop !== '$published'
})`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  padding: 4px 8px;
  border: ${theme.borders.solidThin} ${({ $published }) => ($published ? '#166534' : '#9a3412')};
  color: ${({ $published }) => ($published ? '#14532d' : '#7c2d12')};
  background: ${({ $published }) => ($published ? 'rgba(22, 101, 52, 0.08)' : 'rgba(194, 65, 12, 0.08)')};
`;

const PieceTitle = styled.h3`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h4};
  letter-spacing: -0.4px;
`;

const SmallMeta = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.58);
`;

const PieceActions = styled.div`
  display: flex;
  gap: ${tokens.spacing[2]};
  flex-wrap: wrap;
  justify-content: flex-end;

  ${mediaQuery.mobile} {
    justify-content: flex-start;
  }
`;
