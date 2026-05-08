/**
 * FeaturePieceList Component
 *
 * List view showing published features and drafts with card layout.
 * Route: /features
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import PropTypes from 'prop-types';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import ReusableHeader from '@shared/components/ReusableHeader';
import { useAuth } from '@shared/contexts/AuthContext';
import {
  fetchPublished,
  fetchAll,
  fetchAccess,
  fetchMine,
  getImageUrl,
  formatDate
} from '../services/featurePiecesService.js';
import { visuals } from '../styles/featureStyles.js';

const FeaturePieceList = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [pieces, setPieces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all', 'published', 'draft'
  const [access, setAccess] = useState(null);

  const isAdmin = user?.role === 'admin';
  const canEdit = isAuthenticated && (isAdmin || access?.can_access_dashboard);

  useEffect(() => {
    const loadPieces = async () => {
      try {
        setLoading(true);
        setError(null);

        let response = null;
        let accessData = null;

        if (isAuthenticated && (user?.role === 'curator' || user?.role === 'admin')) {
          try {
            const accessResponse = await fetchAccess();
            accessData = accessResponse?.data || null;
            setAccess(accessData);
          } catch (accessError) {
            console.warn('Failed to load writing access for list page:', accessError);
            setAccess(null);
          }
        } else {
          setAccess(null);
        }

        if (isAdmin || accessData?.can_access_dashboard) {
          response = isAdmin ? await fetchAll() : await fetchMine();
        } else {
          response = await fetchPublished();
        }

        setPieces(response.data || []);
      } catch (err) {
        console.error('Failed to load feature pieces:', err);
        setError('Failed to load features');
      } finally {
        setLoading(false);
      }
    };

    loadPieces();
  }, [isAdmin, isAuthenticated, user?.role]);

  // Filter pieces based on selected filter
  const filteredPieces = pieces.filter(piece => {
    if (filter === 'published') return piece.status === 'published';
    if (filter === 'draft') return piece.status === 'draft';
    return true;
  });

  const publishedCount = pieces.filter(p => p.status === 'published').length;
  const draftCount = pieces.filter(p => p.status === 'draft').length;

  return (
    <PageContainer>
      <ReusableHeader />

      <MainContent>
        <PageHeader>
          <HeaderContent>
            <PageTitle>Features</PageTitle>
            <PageSubtitle>Editoral content</PageSubtitle>
          </HeaderContent>
          {canEdit && (
            <HeaderActions>
              <NewButton onClick={() => navigate('/features/new')}>
                + New Feature
              </NewButton>
            </HeaderActions>
          )}
        </PageHeader>

        {/* Filters (admin only) */}
        {canEdit && pieces.length > 0 && (
          <FilterBar>
            <FilterButton
              $active={filter === 'all'}
              onClick={() => setFilter('all')}
            >
              All ({pieces.length})
            </FilterButton>
            <FilterButton
              $active={filter === 'published'}
              onClick={() => setFilter('published')}
            >
              Published ({publishedCount})
            </FilterButton>
            <FilterButton
              $active={filter === 'draft'}
              onClick={() => setFilter('draft')}
            >
              Drafts ({draftCount})
            </FilterButton>
          </FilterBar>
        )}

        {/* Loading State */}
        {loading && (
          <LoadingContainer>
            <LoadingText>Loading...</LoadingText>
          </LoadingContainer>
        )}

        {/* Error State */}
        {error && !loading && (
          <ErrorContainer>
            <ErrorText>{error}</ErrorText>
          </ErrorContainer>
        )}

        {/* Empty State */}
        {!loading && !error && filteredPieces.length === 0 && (
          <EmptyContainer>
            <EmptyText>
              {filter === 'draft'
                ? 'No drafts yet'
                : filter === 'published'
                ? 'No published features yet'
                : 'No features yet'}
            </EmptyText>
            {canEdit && (
              <NewButton onClick={() => navigate('/features/new')}>
                Create your first feature
              </NewButton>
            )}
          </EmptyContainer>
        )}

        {/* Feature Cards */}
        {!loading && !error && filteredPieces.length > 0 && (
          <CardGrid>
            {filteredPieces.map((piece) => (
              <FeatureCard
                key={piece.id}
                piece={piece}
                canEdit={canEdit}
              />
            ))}
          </CardGrid>
        )}
      </MainContent>
    </PageContainer>
  );
};

/**
 * FeatureCard Component
 */
const FeatureCard = ({ piece, canEdit }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    if (canEdit) {
      navigate(`/features/${piece.id}/edit`);
    } else if (piece.status === 'published') {
      navigate(`/features/${piece.slug}`);
    }
  };

  const handleViewClick = (e) => {
    e.stopPropagation();
    if (piece.status === 'published') {
      navigate(`/features/${piece.slug}`);
    }
  };

  return (
    <Card onClick={handleClick} $clickable={canEdit || piece.status === 'published'}>
      {piece.hero_image ? (
        <CardImage
          src={getImageUrl(piece.hero_image, 'medium')}
          alt={piece.title}
          loading="lazy"
        />
      ) : (
        <CardImagePlaceholder>
          <PlaceholderText>No Image</PlaceholderText>
        </CardImagePlaceholder>
      )}

      <CardContent>
        <CardMeta>
          {piece.metadata_type || 'Feature'}
          {piece.metadata_date && ` / ${formatDate(piece.metadata_date, 'short')}`}
        </CardMeta>

        <CardTitle>{piece.title || 'Untitled'}</CardTitle>

        {piece.subtitle && (
          <CardSubtitle>{piece.subtitle}</CardSubtitle>
        )}

        <CardFooter>
          <StatusBadge $published={piece.status === 'published'}>
            {piece.status === 'published' ? 'Published' : 'Draft'}
          </StatusBadge>

          {canEdit && piece.status === 'published' && (
            <ViewLink onClick={handleViewClick}>
              View
            </ViewLink>
          )}
        </CardFooter>
      </CardContent>
    </Card>
  );
};

FeatureCard.propTypes = {
  piece: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    slug: PropTypes.string,
    title: PropTypes.string,
    subtitle: PropTypes.string,
    status: PropTypes.string,
    hero_image: PropTypes.string,
    metadata_type: PropTypes.string,
    metadata_date: PropTypes.string
  }).isRequired,
  canEdit: PropTypes.bool
};

// ============================================
// Styled Components
// ============================================

const PageContainer = styled.div`
  min-height: 100vh;
  background: ${visuals.background};
`;

const MainContent = styled.main`
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 20px 120px;

  ${mediaQuery.mobile} {
    padding: 24px 16px 80px;
  }
`;

const PageHeader = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 40px;
  gap: 20px;

  ${mediaQuery.mobile} {
    flex-direction: column;
    gap: 16px;
    margin-bottom: 24px;
  }
`;

const HeaderContent = styled.div``;

const PageTitle = styled.h1`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h1};
  font-weight: ${theme.fontWeights.bold};
  color: ${theme.colors.black};
  margin: 0 0 8px 0;
`;

const PageSubtitle = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 12px;
`;

const NewButton = styled.button`
  padding: 12px 24px;
  background: ${theme.colors.black};
  color: ${theme.colors.fpwhite};
  border: 2px solid ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  font-weight: ${theme.fontWeights.bold};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: all ${theme.transitions.fast};
  box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.2);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.2);
  }

  &:active {
    transform: translateY(0);
    box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.2);
  }
`;

const FilterBar = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 32px;

  ${mediaQuery.mobile} {
    margin-bottom: 24px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
`;

const FilterButton = styled.button`
  padding: 8px 16px;
  background: ${({ $active }) => $active ? theme.colors.black : 'transparent'};
  color: ${({ $active }) => $active ? theme.colors.fpwhite : theme.colors.black};
  border: 1px solid ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: all ${theme.transitions.fast};
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: ${({ $active }) => $active ? theme.colors.black : 'rgba(0, 0, 0, 0.05)'};
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
`;

const LoadingText = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  text-transform: uppercase;
  letter-spacing: 0.1em;
`;

const ErrorContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
`;

const ErrorText = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.danger};
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

const EmptyContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  gap: 24px;
`;

const EmptyText = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const CardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 24px;

  ${mediaQuery.mobile} {
    grid-template-columns: 1fr;
    gap: 16px;
  }
`;

const Card = styled.article`
  background: ${theme.colors.fpwhite};
  border: 1px solid ${theme.colors.black};
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.1);
  cursor: ${({ $clickable }) => $clickable ? 'pointer' : 'default'};
  transition: all ${theme.transitions.fast};

  ${({ $clickable }) => $clickable && `
    &:hover {
      transform: translateY(-2px);
      box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.15);
    }
  `}
`;

const CardImage = styled.img`
  width: 100%;
  height: 200px;
  object-fit: cover;
  display: block;
  border-bottom: 1px solid ${theme.colors.black};
`;

const CardImagePlaceholder = styled.div`
  width: 100%;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.05);
  border-bottom: 1px solid ${theme.colors.black};
`;

const PlaceholderText = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.3);
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const CardContent = styled.div`
  padding: 20px;
`;

const CardMeta = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 8px;
`;

const CardTitle = styled.h2`
  font-family: ${theme.fonts.primary};
  font-size: clamp(1.1rem, 2vw, 1.25rem);
  font-weight: ${theme.fontWeights.bold};
  color: ${theme.colors.black};
  margin: 0 0 8px 0;
  line-height: 1.2;
`;

const CardSubtitle = styled.p`
  font-family: 'Times New Roman', Times, Georgia, serif;
  font-size: ${theme.fontSizes.small};
  font-style: italic;
  color: rgba(0, 0, 0, 0.7);
  margin: 0 0 16px 0;
  line-height: 1.4;
`;

const CardFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed rgba(0, 0, 0, 0.2);
`;

const StatusBadge = styled.span`
  padding: 4px 10px;
  background: ${({ $published }) => $published ? 'rgba(76, 175, 80, 0.1)' : 'transparent'};
  border: 1px solid ${({ $published }) => $published ? theme.colors.success : 'rgba(0, 0, 0, 0.3)'};
  color: ${({ $published }) => $published ? theme.colors.success : 'rgba(0, 0, 0, 0.5)'};
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const ViewLink = styled.button`
  background: transparent;
  border: none;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${theme.colors.black};
  text-decoration: underline;
  cursor: pointer;

  &:hover {
    text-decoration: none;
  }
`;

export default FeaturePieceList;
