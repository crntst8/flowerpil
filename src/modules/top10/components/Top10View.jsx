/**
 * Top10View Component
 *
 * Public view of published Top 10 playlists
 * Matches mockup: docs/mockup/total-page.png
 *
 * Layout:
 * - Header: 2025 logo + curator name
 * - Tracks: Position bar (10→1 descending) + track card
 * - Footer: DSP export links + "MAKE YOUR OWN" button
 *
 * Features:
 * - View count tracking (rate limited 1 per IP per 24h)
 * - Responsive design (375px mobile-first)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import Top10Header from './Top10Header';
import Top10TrackCard from './Top10TrackCard';
import Top10Footer from './Top10Footer';
import Top10PublishSuccessModal from './Top10PublishSuccessModal';
import Top10InstagramShareModal from './Top10InstagramShareModal';
import { Button } from '@modules/curator/components/ui';

const Container = styled.div`
  min-height: 100vh;
  background: #000;
  color: #fff;
`;

const TracksContainer = styled.div`
  max-width: 1080px;
  margin: 0 auto;
  padding: clamp(0.5rem, 3vw, 1em);
  display: flex;
  flex-direction: column;
  gap: clamp(0.8em, 1vw, 1em);

  @media (max-width: 375px) {
    padding: 0.1rem;
    gap: 1em;
  }
`;

const LoadingContainer = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  color: #fff;
`;

const LoadingText = styled.p`
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: clamp(1rem, 2vw, 1.25rem);
  color: rgba(255, 255, 255, 0.8);
`;

const ErrorContainer = styled(LoadingContainer)``;

const ErrorText = styled.div`
  text-align: center;
  padding: 2rem;
`;

const ErrorTitle = styled.h1`
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: clamp(1.5rem, 4vw, 2rem);
  color: #fff;
  margin: 0 0 1rem;
`;

const ErrorMessage = styled.p`
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: clamp(0.875rem, 2vw, 1rem);
  color: rgba(255, 255, 255, 0.7);
  margin: 0;
`;

const ShareSection = styled.div`
  max-width: 1080px;
  margin: 2rem auto 1rem;
  padding: 0 clamp(0.5rem, 3vw, 1em);
  display: flex;
  justify-content: center;

  @media (max-width: 375px) {
    padding: 0 1rem;
    margin: 1.5rem auto 1rem;
  }
`;

const ShareButton = styled(Button)`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;

  img {
    width: 20px;
    height: 20px;
  }
`;

const Top10View = () => {
  const { slug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [top10, setTop10] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showInstagramModal, setShowInstagramModal] = useState(false);

  useEffect(() => {
    const fetchTop10 = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/v1/top10/${slug}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            setError({ title: 'Top 10 Not Found', message: 'This Top 10 doesn\'t exist or hasn\'t been published yet.' });
          } else {
            setError({ title: 'Error Loading Top 10', message: 'Something went wrong. Please try again later.' });
          }
          setLoading(false);
          return;
        }

        const data = await response.json();
        // API returns { success: true, top10: {...} }
        setTop10(data.top10);

        // Track view (rate limited on backend: 1 per IP per 24h)
        try {
          await fetch(`/api/v1/top10/${data.top10.id}/view`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (viewError) {
          // Silent fail for view tracking
          console.error('Failed to track view:', viewError);
        }

        setLoading(false);
      } catch (err) {
        console.error('Error fetching Top 10:', err);
        setError({ title: 'Error Loading Top 10', message: 'Something went wrong. Please try again later.' });
        setLoading(false);
      }
    };

    if (slug) {
      fetchTop10();
    } else {
      setError({ title: 'Invalid URL', message: 'No Top 10 specified.' });
      setLoading(false);
    }
  }, [slug]);

  // Update document title
  useEffect(() => {
    if (top10 && top10.display_name) {
      document.title = `${top10.display_name}'s Top 10 of 2025 - flowerpil.io`;
    }
    return () => {
      document.title = 'flowerpil.io';
    };
  }, [top10]);

  // Check if just published and show success modal
  useEffect(() => {
    if (searchParams.get('published') === 'true' && top10) {
      setShowSuccessModal(true);
      // Remove the published param from URL (clean up history)
      searchParams.delete('published');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, top10, setSearchParams]);

  // Sort tracks by position (1 → 10) to match source playlist order
  // IMPORTANT: This hook must be called before any early returns to avoid hook count mismatch
  const sortedTracks = useMemo(() => {
    if (!top10?.tracks) return [];
    return [...top10.tracks].sort((a, b) => a.position - b.position);
  }, [top10?.tracks]);

  if (loading) {
    return (
      <LoadingContainer>
        <LoadingText>Loading Top 10...</LoadingText>
      </LoadingContainer>
    );
  }

  if (error) {
    return (
      <ErrorContainer>
        <ErrorText>
          <ErrorTitle>{error.title}</ErrorTitle>
          <ErrorMessage>{error.message}</ErrorMessage>
        </ErrorText>
      </ErrorContainer>
    );
  }

  if (!top10) {
    return (
      <ErrorContainer>
        <ErrorText>
          <ErrorTitle>Top 10 Not Found</ErrorTitle>
          <ErrorMessage>This Top 10 doesn't exist.</ErrorMessage>
        </ErrorText>
      </ErrorContainer>
    );
  }

  return (
    <Container>
      <Top10Header
        curatorName={top10.display_name || 'Anonymous'}
        showCurator={true}
        showCTA={true}
        logoLinkTo="/"
      />

      <TracksContainer>
        {sortedTracks.length > 0 ? (
          sortedTracks.map((track) => (
            <Top10TrackCard key={track.position} track={track} />
          ))
        ) : (
          <ErrorText>
            <ErrorMessage>No tracks found in this Top 10.</ErrorMessage>
          </ErrorText>
        )}
      </TracksContainer>

      <ShareSection>
        <ShareButton
          onClick={() => setShowInstagramModal(true)}
          $variant="secondary"
        >
          <img
            src="/assets/playlist-actions/instagram.svg"
            alt=""
          />
          Share to Instagram
        </ShareButton>
      </ShareSection>

      <Top10Footer
        exportUrls={{
          spotify_export_url: top10.spotify_export_url,
          apple_export_url: top10.apple_export_url,
          tidal_export_url: top10.tidal_export_url,
        }}
      />

      <Top10PublishSuccessModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        slug={slug}
        onShareToInstagram={() => {
          setShowSuccessModal(false);
          setShowInstagramModal(true);
        }}
      />

      <Top10InstagramShareModal
        isOpen={showInstagramModal}
        onClose={() => setShowInstagramModal(false)}
        slug={slug}
        tracks={sortedTracks}
        curatorName={top10.display_name || 'Anonymous'}
      />
    </Container>
  );
};

export default Top10View;
