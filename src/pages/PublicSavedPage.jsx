import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import ExpandableTrack from '@modules/playlists/components/ExpandableTrack';

const PageContainer = styled.div`
  max-width: 960px;
  margin: 0 auto;
  padding: ${theme.spacing.xl};
  min-height: 100vh;

  @media (max-width: 768px) {
    padding: ${theme.spacing.lg};
  }
`;

const UserHeader = styled.div`
  background: linear-gradient(155deg, rgba(245, 244, 243, 0.95), rgba(230, 229, 226, 0.92));
  border: ${theme.borders.solidThin} rgba(15, 14, 23, 0.08);
  box-shadow: 0 32px 68px -40px rgba(10, 9, 20, 0.55);
  border-radius: 18px;
  padding: ${theme.spacing.xl};
  margin-bottom: ${theme.spacing.xl};
  display: flex;
  align-items: center;
  gap: ${theme.spacing.lg};

  @media (max-width: 480px) {
    padding: ${theme.spacing.lg};
    flex-direction: column;
    text-align: center;
  }
`;

const Avatar = styled.div`
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: ${theme.colors.gray[200]};
  overflow: hidden;
  flex-shrink: 0;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const UserInfo = styled.div`
  flex: 1;
`;

const UserName = styled.h1`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.h1};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 ${theme.spacing.sm};
  color: ${theme.colors.black};
`;

const UserBio = styled.p`
  font-family: ${theme.fonts.sans};
  font-size: ${theme.fontSizes.body};
  color: ${theme.colors.gray[700]};
  line-height: 1.6;
  margin: 0 0 ${theme.spacing.md};
`;

const TrackCount = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[600]};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const TracksContainer = styled.div`
  background: rgba(255, 255, 255, 0.98);
  border: ${theme.borders.solidThin} rgba(20, 19, 29, 0.08);
  box-shadow: 0 24px 48px -32px rgba(15, 14, 23, 0.5);
  border-radius: 16px;
  padding: ${theme.spacing.xl};

  @media (max-width: 480px) {
    padding: ${theme.spacing.lg};
  }
`;

const TrackList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
`;

const LoadingText = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: ${theme.colors.black};

  &::after {
    content: '.';
    animation: ellipsis 1.5s infinite;
  }

  @keyframes ellipsis {
    0% { content: '.'; }
    33% { content: '..'; }
    66% { content: '...'; }
  }
`;

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  padding: ${theme.spacing.xl};
  text-align: center;
`;

const ErrorTitle = styled.h2`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.h2};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: ${theme.spacing.md};
  color: ${theme.colors.black};
`;

const ErrorMessage = styled.p`
  font-family: ${theme.fonts.sans};
  font-size: ${theme.fontSizes.body};
  color: ${theme.colors.gray[600]};
  margin-bottom: ${theme.spacing.lg};
`;

const Footer = styled.div`
  text-align: center;
  margin-top: ${theme.spacing.xl};
  padding: ${theme.spacing.lg};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[500]};
`;

const FooterLink = styled(Link)`
  color: ${theme.colors.black};
  text-decoration: none;
  border-bottom: 1px dashed ${theme.colors.gray[400]};
  transition: border-color ${theme.transitions.fast};

  &:hover {
    border-color: ${theme.colors.black};
  }
`;

const LoadMoreButton = styled.button`
  width: 100%;
  padding: ${theme.spacing.md};
  margin-top: ${theme.spacing.lg};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${theme.colors.black};
  background: transparent;
  border: ${theme.borders.dashedThin} ${theme.colors.gray[400]};
  border-radius: 8px;
  cursor: pointer;
  transition: all ${theme.transitions.fast};

  &:hover {
    background: ${theme.colors.gray[100]};
    border-color: ${theme.colors.black};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl};
  color: ${theme.colors.gray[600]};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

export default function PublicSavedPage() {
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userData, setUserData] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [pagination, setPagination] = useState({ offset: 0, limit: 50, total: 0 });
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchTracks = async (offset = 0) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || ''}/p/${slug}?offset=${offset}&limit=50`
      );

      if (!response.ok) {
        if (response.status === 404) {
          setError('User not found or saved tracks are private');
        } else {
          setError('Failed to load saved tracks');
        }
        return null;
      }

      const data = await response.json();
      return data;
    } catch (err) {
      console.error('Error fetching saved tracks:', err);
      setError('Failed to load saved tracks');
      return null;
    }
  };

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      const data = await fetchTracks(0);
      if (data) {
        setUserData(data.user);
        setTracks(data.tracks);
        setPagination(data.pagination);
      }
      setLoading(false);
    };

    loadInitialData();
  }, [slug]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    const newOffset = pagination.offset + pagination.limit;
    const data = await fetchTracks(newOffset);
    if (data) {
      setTracks((prev) => [...prev, ...data.tracks]);
      setPagination(data.pagination);
    }
    setLoadingMore(false);
  };

  if (loading) {
    return (
      <PageContainer>
        <LoadingContainer>
          <LoadingText>Loading saved tracks</LoadingText>
        </LoadingContainer>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <ErrorContainer>
          <ErrorTitle>Page Not Found</ErrorTitle>
          <ErrorMessage>{error}</ErrorMessage>
          <FooterLink to="/">← Back to Flowerpil</FooterLink>
        </ErrorContainer>
      </PageContainer>
    );
  }

  const hasMore = pagination.offset + tracks.length < pagination.total;

  return (
    <PageContainer>
      <UserHeader>
        {userData.avatar_url && (
          <Avatar>
            <img src={userData.avatar_url} alt={userData.display_name || userData.username} />
          </Avatar>
        )}
        <UserInfo>
          <UserName>{userData.display_name || userData.username}</UserName>
          {userData.bio && <UserBio>{userData.bio}</UserBio>}
          <TrackCount>{pagination.total} saved {pagination.total === 1 ? 'track' : 'tracks'}</TrackCount>
        </UserInfo>
      </UserHeader>

      <TracksContainer>
        {tracks.length === 0 ? (
          <EmptyState>No saved tracks yet</EmptyState>
        ) : (
          <>
            <TrackList>
              {tracks.map((track, index) => (
                <ExpandableTrack
                  key={track.id}
                  track={track}
                  trackNumber={index + 1}
                  isDashboard={false}
                />
              ))}
            </TrackList>
            {hasMore && (
              <LoadMoreButton onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading...' : 'Load More'}
              </LoadMoreButton>
            )}
          </>
        )}
      </TracksContainer>

      <Footer>
        <FooterLink to="/">Save your music on Flowerpil.io</FooterLink>
      </Footer>
    </PageContainer>
  );
}
