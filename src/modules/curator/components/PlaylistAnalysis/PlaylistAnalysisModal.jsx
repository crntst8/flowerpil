import { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import styled, { keyframes } from 'styled-components';
import { Button, tokens, theme } from '../ui/index.jsx';
import { useAuth } from '@shared/contexts/AuthContext';
import PlaylistSelector from './PlaylistSelector.jsx';
import AnalysisDisplay from './AnalysisDisplay.jsx';
import CuratorModalShell, {
  CuratorModalSection,
  CuratorModalStatus,
} from '../ui/CuratorModalShell.jsx';

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const LoadingState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${tokens.spacing[3]};
  padding: ${tokens.spacing[8]} ${tokens.spacing[4]};
  text-align: center;

  p {
    margin: 0;
    font-family: ${theme.fonts.mono};
  }

  .muted {
    font-size: ${theme.fontSizes.tiny};
    opacity: 0.7;
  }
`;

const Spinner = styled.div`
  width: 42px;
  height: 42px;
  border: 3px solid rgba(0, 0, 0, 0.16);
  border-top-color: ${theme.colors.black};
  border-radius: 999px;
  animation: ${spin} 0.9s linear infinite;
`;

// Helper to extract playlist ID from Spotify URL
function extractPlaylistId(input) {
  if (!input) return null;

  // Already a playlist ID (22 characters, alphanumeric)
  if (/^[a-zA-Z0-9]{22}$/.test(input.trim())) {
    return input.trim();
  }

  // Extract from URL
  const urlMatch = input.match(/playlist[/:]([a-zA-Z0-9]{22})/);
  if (urlMatch) {
    return urlMatch[1];
  }

  return null;
}

// Compute analytics from enriched tracks
function computeAnalytics(tracks) {
  if (!tracks || tracks.length === 0) {
    return null;
  }

  // Artist frequency
  const artistCounts = {};
  tracks.forEach(track => {
    const artist = track.artist;
    artistCounts[artist] = (artistCounts[artist] || 0) + 1;
  });

  // Genre frequency (flatten all genres)
  const genreCounts = {};
  tracks.forEach(track => {
    (track.genres || []).forEach(genre => {
      genreCounts[genre] = (genreCounts[genre] || 0) + 1;
    });
  });

  // Year distribution
  const yearCounts = {};
  tracks.forEach(track => {
    if (track.year) {
      yearCounts[track.year] = (yearCounts[track.year] || 0) + 1;
    }
  });

  // Audio feature averages
  const audioFeatureKeys = [
    'danceability', 'energy', 'valence', 'tempo',
    'acousticness', 'instrumentalness', 'liveness',
    'speechiness', 'loudness'
  ];

  const averages = {};
  audioFeatureKeys.forEach(key => {
    const values = tracks
      .map(t => t[key])
      .filter(v => typeof v === 'number' && !isNaN(v));

    if (values.length > 0) {
      averages[key] = values.reduce((sum, v) => sum + v, 0) / values.length;
    }
  });

  // Most popular track
  const mostPopular = tracks.reduce((max, track) =>
    track.popularity > (max?.popularity || 0) ? track : max
  , null);

  // Year range
  const years = tracks.map(t => t.year).filter(Boolean);
  const yearRange = years.length > 0 ? [Math.min(...years), Math.max(...years)] : null;

  // Average song length
  const durations = tracks
    .map(t => t.duration_ms)
    .filter(d => typeof d === 'number' && !isNaN(d) && d > 0);

  const avgDurationMs = durations.length > 0
    ? durations.reduce((sum, d) => sum + d, 0) / durations.length
    : null;

  return {
    totalTracks: tracks.length,
    topArtists: Object.entries(artistCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10),
    topGenres: Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15),
    yearDistribution: Object.entries(yearCounts)
      .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10)),
    audioAverages: averages,
    mostPopularTrack: mostPopular,
    yearRange,
    avgDurationMs
  };
}

export default function PlaylistAnalysisModal({ isOpen, onClose }) {
  const { authenticatedFetch } = useAuth();
  const [step, setStep] = useState('select'); // 'select' | 'analyzing' | 'results'
  const [analysisData, setAnalysisData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [spotifyToken, setSpotifyToken] = useState(null);

  // Load Spotify token from API (from DSP connections)
  useEffect(() => {
    const loadSpotifyToken = async () => {
      try {
        const response = await authenticatedFetch('/api/v1/curator/dsp/spotify/token', {
          method: 'GET'
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data?.access_token) {
            setSpotifyToken(data.data.access_token);
          }
        }
      } catch (loadError) {
        console.error('Failed to load Spotify token:', loadError);
      }
    };

    if (isOpen) {
      loadSpotifyToken();
    }
  }, [isOpen, authenticatedFetch]);

  // Compute analytics from tracks
  const analytics = useMemo(() => {
    if (!analysisData?.tracks) return null;
    return computeAnalytics(analysisData.tracks);
  }, [analysisData]);

  const handleAnalyze = async (playlistId) => {
    if (!spotifyToken) {
      setError({
        message: 'Spotify connection required',
        details: 'Please connect your Spotify account in the DSP Settings tab before analyzing playlists.',
        action: {
          label: 'Go to DSP Settings',
          handler: () => {
            onClose();
            const url = new URL(window.location.href);
            url.searchParams.set('tab', 'dsp');
            window.history.pushState({}, '', url);
            window.location.reload();
          }
        }
      });
      return;
    }

    const id = extractPlaylistId(playlistId);
    if (!id) {
      setError({
        message: 'Invalid playlist ID or URL',
        details: 'Please enter a valid Spotify playlist URL or ID.',
        action: null
      });
      return;
    }

    setLoading(true);
    setError(null);
    setStep('analyzing');

    try {
      const response = await authenticatedFetch(`/api/v1/spotify/analyze/${id}`, {
        method: 'POST',
        headers: {
          'x-spotify-token': spotifyToken,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Your Spotify connection has expired. Please reconnect in DSP Settings.');
        }
        if (response.status === 404) {
          throw new Error('Playlist not found or is private. Make sure you have access to this playlist.');
        }
        throw new Error('Failed to analyze playlist');
      }

      const result = await response.json();
      setAnalysisData(result.data);
      setStep('results');
    } catch (err) {
      console.error('Analysis error:', err);
      setError({
        message: 'Analysis failed',
        details: err.message,
        action: null
      });
      setStep('select');
    } finally {
      setLoading(false);
    }
  };

  const handleNewAnalysis = () => {
    setStep('select');
    setAnalysisData(null);
    setError(null);
  };

  return (
    <CuratorModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Playlist analysis"
      size="xl"
      mobileAlign="top"
    >
      {error && (
        <CuratorModalStatus $variant="error">
          <p><strong>{error.message}</strong> {error.details}</p>
          {error.action && (
            <Button $variant="primary" $size="sm" onClick={error.action.handler} style={{ marginTop: tokens.spacing[2] }}>
              {error.action.label}
            </Button>
          )}
        </CuratorModalStatus>
      )}

      {loading && (
        <LoadingState>
          <Spinner />
          <p>Analyzing playlist...</p>
          <p className="muted">Fetching tracks, audio features, and artist genres</p>
        </LoadingState>
      )}

      {!loading && step === 'select' && (
        <CuratorModalSection>
          <PlaylistSelector
            onAnalyze={handleAnalyze}
            authenticatedFetch={authenticatedFetch}
          />
        </CuratorModalSection>
      )}

      {!loading && step === 'results' && analysisData && analytics && (
        <AnalysisDisplay
          playlistData={analysisData.playlist}
          tracks={analysisData.tracks}
          analytics={analytics}
          onNewAnalysis={handleNewAnalysis}
        />
      )}
    </CuratorModalShell>
  );
}

PlaylistAnalysisModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
};
