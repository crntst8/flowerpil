/* eslint-disable react/prop-types */
import styled from 'styled-components';
import { theme, Button } from '@shared/styles/GlobalStyles';
import LazyImage from '@shared/components/LazyImage';

const CuratorListContainer = styled.div`
  margin-bottom: ${theme.spacing.lg};
`;

const CuratorGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.sm};
  
  @media (min-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  }
`;

const CuratorCard = styled.div`
  border: ${theme.borders.dashed} rgba(0, 0, 0, 0.4);
  padding: ${theme.spacing.sm};
  background: transparent;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  min-height: 120px;
  
  &:hover {
    border-color: rgba(255, 255, 255, 0.6);
    background: rgba(255, 255, 255, 0.02);
  }
  
  ${props => props.isEditing && `
    border-color: ${theme.colors.primary};
    background: rgba(49, 130, 206, 0.05);
    transform: scale(1.02);
  `}
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    min-height: auto;
  }
`;

const CuratorHeader = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.sm};
`;

const CuratorImage = styled.div`
  flex-shrink: 0;
`;

const CuratorInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const CuratorName = styled.h3`
  margin: 0 0 2px 0;
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  word-break: break-word;
  line-height: 1.2;
`;

const CuratorMeta = styled.div`
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
  flex-wrap: wrap;
`;

const MetaTag = styled.span`
  padding: 1px 4px;
  border: 1px solid rgba(0, 0, 0, 0.3);
  font-size: 10px;
  color: ${theme.colors.black};
  background: ${props => {
    if (props.type === 'verification') {
      switch (props.value) {
        case 'verified': return 'rgba(76, 175, 80, 0.2)';
        case 'featured': return 'rgba(255, 193, 7, 0.2)';
        default: return 'rgba(255, 255, 255, 0.1)';
      }
    }
    return 'rgba(255, 255, 255, 0.1)';
  }};
  text-transform: capitalize;
  line-height: 1;
`;

const CuratorBio = styled.p`
  margin: 0 0 6px 0;
  font-size: 11px;
  color: ${theme.colors.black};
  opacity: 0.7;
  line-height: 1.3;
  
  /* Limit to 2 lines for compactness */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const CuratorStats = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  margin-bottom: 6px;
  font-size: 10px;
  color: ${theme.colors.black};
  opacity: 0.6;
  flex-wrap: wrap;
`;

const CuratorActions = styled.div`
  display: flex;
  gap: 4px;
  justify-content: flex-end;
  margin-top: auto;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl};
  color: ${theme.colors.black};
  opacity: 0.6;
  
  p {
    margin: 0;
    font-size: ${theme.fontSizes.medium};
  }
`;

const LoadingState = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl};
  color: ${theme.colors.black};
  opacity: 0.8;
`;

const CuratorList = ({ curators, onEdit, onDelete, isLoading, editingCuratorId }) => {
  if (isLoading) {
    return (
      <CuratorListContainer>
        <LoadingState>
          <p>Loading curators...</p>
        </LoadingState>
      </CuratorListContainer>
    );
  }

  if (!curators || curators.length === 0) {
    return (
      <CuratorListContainer>
        <EmptyState>
          <p>No curators found</p>
          <p style={{ fontSize: '12px', opacity: 0.6, margin: '8px 0 0 0' }}>
            {editingCuratorId ? 'Try adjusting your search filters' : 'Create your first curator to get started'}
          </p>
        </EmptyState>
      </CuratorListContainer>
    );
  }

  return (
    <CuratorListContainer>
      <CuratorGrid>
        {curators.map((curator) => {
          const spotifyApiEmail = (() => {
            if (!curator.custom_fields) return '';
            if (typeof curator.custom_fields === 'string') {
              try {
                const parsed = JSON.parse(curator.custom_fields);
                return parsed?.spotify_api_email || '';
              } catch {
                return '';
              }
            }
            return curator.custom_fields.spotify_api_email || '';
          })();

          return (
            <CuratorCard key={curator.id} isEditing={editingCuratorId === curator.id}>
            <CuratorHeader>
              <CuratorImage>
                {curator.profile_image ? (
                  <LazyImage
                    src={curator.profile_image}
                    alt={`${curator.name} profile`}
                    width={32}
                    height={32}
                    placeholder="/images/curator-placeholder.svg"
                  />
                ) : (
                  <div style={{
                    width: 32,
                    height: 32,
                    border: `${theme.borders.dashed} rgba(255, 255, 255, 0.3)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    color: 'rgba(255, 255, 255, 0.5)'
                  }}>
                    {curator.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </CuratorImage>
              
              <CuratorInfo>
                <CuratorName>{curator.name}</CuratorName>
                <CuratorMeta>
                  <MetaTag>{curator.profile_type}</MetaTag>
                  <MetaTag type="verification" value={curator.verification_status}>
                    {curator.verification_status}
                  </MetaTag>
                  {curator.location && (
                    <MetaTag>📍 {curator.location}</MetaTag>
                  )}
                </CuratorMeta>
              </CuratorInfo>
            </CuratorHeader>

            {curator.bio_short && (
              <CuratorBio>{curator.bio_short}</CuratorBio>
            )}

            <CuratorStats>
              <span>ID: {curator.id}</span>
              {curator.website_url && <span>🌐</span>}
              {curator.contact_email && <span>✉️</span>}
              {curator.social_links && curator.social_links.length > 0 && (
                <span>🔗 {curator.social_links.length}</span>
              )}
              {curator.external_links && curator.external_links.length > 0 && (
                <span>📄 {curator.external_links.length}</span>
              )}
              {spotifyApiEmail && (
                <span title="Spotify API email on file">🎧 {spotifyApiEmail}</span>
              )}
            </CuratorStats>

            <CuratorActions>
              <Button
                size="small"
                onClick={() => onEdit(curator)}
                variant={editingCuratorId === curator.id ? "primary" : "secondary"}
                disabled={editingCuratorId && editingCuratorId !== curator.id}
              >
                {editingCuratorId === curator.id ? "Editing..." : "Edit"}
              </Button>
              <Button
                size="small"
                variant="danger"
                onClick={() => onDelete(curator.id, curator.name)}
                disabled={editingCuratorId === curator.id}
              >
                Delete
              </Button>
            </CuratorActions>
            </CuratorCard>
          );
        })}
      </CuratorGrid>
    </CuratorListContainer>
  );
};

export default CuratorList;
