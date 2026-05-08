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
  display: flex;
  flex-direction: column;
  justify-content: center;

  @media (max-width: 768px) {
    padding: ${theme.spacing.lg};
  }
`;

const TrackContainer = styled.div`
  background: linear-gradient(155deg, rgba(245, 244, 243, 0.95), rgba(230, 229, 226, 0.92));
  border: ${theme.borders.solidThin} rgba(15, 14, 23, 0.08);
  box-shadow: 0 32px 68px -40px rgba(10, 9, 20, 0.55);
  border-radius: 18px;
  padding: ${theme.spacing.xl};

  @media (max-width: 480px) {
    padding: ${theme.spacing.lg};
  }
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

export default function PublicSongPage() {
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trackData, setTrackData] = useState(null);

  useEffect(() => {
    const fetchTrack = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/s/${slug}`);

        if (!response.ok) {
          if (response.status === 404) {
            setError('Song not found');
          } else {
            setError('Failed to load song');
          }
          setLoading(false);
          return;
        }

        const data = await response.json();
        setTrackData(data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching track:', err);
        setError('Failed to load song');
        setLoading(false);
      }
    };

    fetchTrack();
  }, [slug]);

  if (loading) {
    return (
      <PageContainer>
        <LoadingContainer>
          <LoadingText>Loading song</LoadingText>
        </LoadingContainer>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <ErrorContainer>
          <ErrorTitle>Song Not Found</ErrorTitle>
          <ErrorMessage>{error}</ErrorMessage>
          <FooterLink to="/">← Back to Flowerpil</FooterLink>
        </ErrorContainer>
      </PageContainer>
    );
  }

  const { track } = trackData;

  return (
    <PageContainer>
      <SEO
        title={`${track.title} by ${track.artist}`}
        description={`Cross-platform, curated, by people. ${track.title} by ${track.artist}. Links for every platform.`}
        image={track.artwork_url || track.album_artwork_url}
        canonical={`/s/${slug}`}
        keywords={['flowerpil', 'cross-platform', 'curated', 'by people', track.artist, track.title, 'music']}
        type="music.song"
        structuredData={{
          '@context': 'https://schema.org',
          '@type': 'MusicRecording',
          name: track.title,
          byArtist: {
            '@type': 'MusicGroup',
            name: track.artist
          },
          inAlbum: track.album ? {
            '@type': 'MusicAlbum',
            name: track.album
          } : undefined,
          isrcCode: track.isrc || undefined,
          image: track.artwork_url || track.album_artwork_url,
          url: `https://flowerpil.io/s/${slug}`
        }}
      />
      <TrackContainer>
        <ExpandableTrack
          track={track}
          trackNumber={null}
          isDashboard={false}
          defaultExpanded={true}
        />
      </TrackContainer>

      <Footer>
        <FooterLink to="/">Discover more on Flowerpil.io</FooterLink>
      </Footer>
    </PageContainer>
  );
}
