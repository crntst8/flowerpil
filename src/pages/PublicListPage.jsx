import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import SEO from '@shared/components/SEO';
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

const ListHeader = styled.div`
  background: linear-gradient(155deg, rgba(245, 244, 243, 0.95), rgba(230, 229, 226, 0.92));
  border: ${theme.borders.solidThin} rgba(15, 14, 23, 0.08);
  box-shadow: 0 32px 68px -40px rgba(10, 9, 20, 0.55);
  border-radius: 18px;
  padding: ${theme.spacing.xl};
  margin-bottom: ${theme.spacing.xl};

  @media (max-width: 480px) {
    padding: ${theme.spacing.lg};
  }
`;

const ListTitle = styled.h1`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.h1};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 ${theme.spacing.md};
  color: ${theme.colors.black};
`;

const ListDescription = styled.p`
  font-family: ${theme.fonts.sans};
  font-size: ${theme.fontSizes.body};
  color: ${theme.colors.gray[700]};
  line-height: 1.6;
  margin: 0 0 ${theme.spacing.md};
`;

const ListMeta = styled.div`
  display: flex;
  gap: ${theme.spacing.lg};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[600]};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding-top: ${theme.spacing.md};
  border-top: ${theme.borders.dashedThin} rgba(20, 19, 29, 0.12);

  @media (max-width: 480px) {
    flex-direction: column;
    gap: ${theme.spacing.sm};
  }
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

const EmptyState = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl};
  color: ${theme.colors.gray[600]};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

export default function PublicListPage() {
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [listData, setListData] = useState(null);

  useEffect(() => {
    const fetchList = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/l/${slug}`);

        if (!response.ok) {
          if (response.status === 404) {
            setError('List not found or is private');
          } else {
            setError('Failed to load list');
          }
          setLoading(false);
          return;
        }

        const data = await response.json();
        setListData(data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching list:', err);
        setError('Failed to load list');
        setLoading(false);
      }
    };

    fetchList();
  }, [slug]);

  if (loading) {
    return (
      <PageContainer>
        <LoadingContainer>
          <LoadingText>Loading list</LoadingText>
        </LoadingContainer>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <ErrorContainer>
          <ErrorTitle>List Not Found</ErrorTitle>
          <ErrorMessage>{error}</ErrorMessage>
          <FooterLink to="/">← Back to Flowerpil</FooterLink>
        </ErrorContainer>
      </PageContainer>
    );
  }

  const { list, tracks, owner } = listData;

  return (
    <PageContainer>
      <SEO
        title={list.title}
        description={`Cross-platform, curated, by people. ${list.title}.`}
        canonical={`/l/${slug}`}
        keywords={['flowerpil', 'cross-platform', 'curated', 'by people', 'list', 'playlist', ...tracks.slice(0, 3).map(t => t.artist)]}
      />
      <ListHeader>
        <ListTitle>{list.title}</ListTitle>
        {list.description && (
          <ListDescription>{list.description}</ListDescription>
        )}
        <ListMeta>
          <div>{list.track_count} {list.track_count === 1 ? 'track' : 'tracks'}</div>
          {owner && <div>by {owner.display_name || owner.username}</div>}
        </ListMeta>
      </ListHeader>

      <TracksContainer>
        {tracks.length === 0 ? (
          <EmptyState>No tracks in this list yet</EmptyState>
        ) : (
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
        )}
      </TracksContainer>

      <Footer>
        <FooterLink to="/">Create your own list on Flowerpil.io</FooterLink>
      </Footer>
    </PageContainer>
  );
}
