import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { adminGet, adminPost } from '../utils/adminApi';

/**
 * Cross-Platform Linking Manager
 * 
 * Admin interface for managing cross-platform DSP linking across Apple Music and Tidal.
 * Features batch processing, real-time progress tracking, and manual override capabilities.
 */

const Container = styled.div`
  padding: ${theme.spacing?.lg || '24px'};
  max-width: 1200px;
  margin: 0 auto;
  font-family: 'Paper Mono', monospace;
`;

const Title = styled.h1`
  font-size: 1.25rem;
  color: #ffffff;
  margin-bottom: 16px;
  border-bottom: ${theme.borders.dashed} rgba(255, 255, 255, 0.3);
  padding-bottom: 8px;
`;

const Section = styled.div`
  margin-bottom: 24px;
  padding: 16px;
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.3);
  background: transparent;
`;

const Button = styled.button`
  font-family: 'Paper Mono', monospace;
  padding: 12px 16px;
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.4);
  background: transparent;
  color: #ffffff;
  cursor: pointer;
  margin-right: 8px;
  margin-bottom: 8px;
  
  &:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.6);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Select = styled.select`
  font-family: 'Paper Mono', monospace;
  padding: 8px;
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.4);
  background: rgba(0, 0, 0, 0.7);
  color: #ffffff;
  margin-bottom: 16px;
  width: 100%;
  max-width: 400px;
  
  &:focus {
    outline: none;
    border-color: rgba(255, 255, 255, 0.6);
    background: rgba(0, 0, 0, 0.9);
  }
  
  option {
    background: #000000;
    color: #ffffff;
  }
`;

const StatusGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
`;

const StatCard = styled.div`
  padding: 16px;
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.02);
  text-align: center;
`;

const StatValue = styled.div`
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: 4px;
  color: #ffffff;
`;

const StatLabel = styled.div`
  font-size: 0.75rem;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
`;

const SectionHeader = styled.h3`
  color: #ffffff;
  margin-bottom: 16px;
  font-size: 1.1rem;
`;

const CrossPlatformLinkingManager = () => {
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [stats, setStats] = useState(null);
  const [backfillPreview, setBackfillPreview] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [apiStatus, setApiStatus] = useState({ apple: 'unknown', tidal: 'unknown', spotify: 'unknown' });
  const [error, setError] = useState(null);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [jobProgress, setJobProgress] = useState(null);

  // Load playlists on mount
  useEffect(() => {
    loadPlaylists();
    testApiConnections();
  }, []);

  // Load stats and backfill preview when playlist is selected
  useEffect(() => {
    if (selectedPlaylistId) {
      loadPlaylistStats();
      loadBackfillPreview();
    } else {
      setBackfillPreview(null);
    }
  }, [selectedPlaylistId]);

  const loadPlaylists = async () => {
    try {
      const response = await fetch('/api/v1/playlists');
      const data = await response.json();
      if (data.success) {
        setPlaylists(data.data);
      }
    } catch (error) {
      console.error('Failed to load playlists:', error);
      setError('Failed to load playlists');
    }
  };

  const loadPlaylistStats = async () => {
    try {
      const data = await adminGet(`/api/v1/cross-platform/stats/${selectedPlaylistId}`);
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const loadBackfillPreview = async () => {
    try {
      const data = await adminGet(`/api/v1/cross-platform/backfill-preview/${selectedPlaylistId}`);
      if (data.success) {
        setBackfillPreview(data.data);
      }
    } catch (error) {
      console.error('Failed to load backfill preview:', error);
      setBackfillPreview(null);
    }
  };

  const testApiConnections = async () => {
    try {
      const data = await adminGet('/api/v1/cross-platform/test-connections');
      if (data.success) {
        setApiStatus(data.data);
      }
    } catch (error) {
      console.error('Failed to test API connections:', error);
    }
  };

  const pollJobStatus = async (jobId, isBackfillJob = false) => {
    try {
      const data = await adminGet(`/api/v1/cross-platform/job-status/${jobId}`);
      if (data.success) {
        const job = data.data;
        setJobProgress(job.progress);

        if (job.status === 'completed' || job.status === 'failed') {
          if (isBackfillJob) {
            setIsBackfilling(false);
          } else {
            setIsProcessing(false);
          }
          setCurrentJobId(null);
          setJobProgress(null);
          loadPlaylistStats();
          loadBackfillPreview();
          return false; // Stop polling
        }
        return true; // Continue polling
      }
    } catch (error) {
      console.error('Failed to poll job status:', error);
      if (isBackfillJob) {
        setIsBackfilling(false);
      } else {
        setIsProcessing(false);
      }
      setCurrentJobId(null);
      setJobProgress(null);
      return false; // Stop polling on error
    }
  };

  const startJobPolling = (jobId, isBackfillJob = false) => {
    setCurrentJobId(jobId);

    const poll = async () => {
      const shouldContinue = await pollJobStatus(jobId, isBackfillJob);
      if (shouldContinue) {
        setTimeout(poll, 2000); // Poll every 2 seconds
      }
    };

    setTimeout(poll, 2000); // Start polling after 2 seconds
  };

  const startPlaylistLinking = async (forceRefresh = false) => {
    if (!selectedPlaylistId) {
      setError('Please select a playlist');
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);
      setJobProgress(null);

      const data = await adminPost('/api/v1/cross-platform/link-playlist', {
        playlistId: selectedPlaylistId,
        forceRefresh
      });

      if (data.success) {
        console.log('Linking started:', data.data);
        if (data.data.jobId) {
          startJobPolling(data.data.jobId);
        } else {
          // Job completed immediately (no tracks to process)
          setIsProcessing(false);
          loadPlaylistStats();
        }
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Failed to start linking:', error);
      setError(error.message);
      setIsProcessing(false);
    }
  };

  const startBackfill = async () => {
    if (!selectedPlaylistId) {
      setError('Please select a playlist');
      return;
    }

    try {
      setIsBackfilling(true);
      setError(null);
      setJobProgress(null);

      const data = await adminPost('/api/v1/cross-platform/backfill-playlist', {
        playlistId: selectedPlaylistId
      });

      if (data.success) {
        console.log('Backfill started:', data.data);
        if (data.data.jobId) {
          startJobPolling(data.data.jobId, true);
        } else {
          // No tracks to backfill
          setIsBackfilling(false);
          loadPlaylistStats();
          loadBackfillPreview();
        }
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Failed to start backfill:', error);
      setError(error.message);
      setIsBackfilling(false);
    }
  };

  const selectedPlaylist = playlists.find(p => p.id.toString() === selectedPlaylistId);

  return (
    <Container>
      <Title>DSP-LINK</Title>
      
      {/* API Status */}
      <Section>
        <SectionHeader>Service Status</SectionHeader>
        <StatusGrid>
          <StatCard>
            <StatValue style={{ color: '#00aa00' }}>
              ✓
            </StatValue>
            <StatLabel>Apple Music</StatLabel>
          </StatCard>
          <StatCard>
            <StatValue style={{ 
              color: apiStatus.tidal?.status === 'connected' ? '#00aa00' : '#aa0000' 
            }}>
              {apiStatus.tidal?.status === 'connected' ? '✓' : '✗'}
            </StatValue>
            <StatLabel>Tidal API</StatLabel>
          </StatCard>
          <StatCard>
            <StatValue style={{ 
              color: apiStatus.spotify?.status === 'connected' ? '#00aa00' : '#aa0000' 
            }}>
              {apiStatus.spotify?.status === 'connected' ? '✓' : '✗'}
            </StatValue>
            <StatLabel>Spotify API</StatLabel>
          </StatCard>
        </StatusGrid>
      </Section>

      {/* Playlist Selection */}
      <Section>
        <SectionHeader>Select Playlist</SectionHeader>
        <Select
          value={selectedPlaylistId}
          onChange={(e) => setSelectedPlaylistId(e.target.value)}
        >
          <option value="">Choose a playlist...</option>
          {playlists.map(playlist => (
            <option key={playlist.id} value={playlist.id}>
              {playlist.title}
            </option>
          ))}
        </Select>
        
        <div>
          <Button
            onClick={() => startPlaylistLinking(false)}
            disabled={!selectedPlaylistId || isProcessing}
          >
            {isProcessing ? 'Processing...' : 'Link Missing Tracks'}
          </Button>
          <Button
            onClick={() => startPlaylistLinking(true)}
            disabled={!selectedPlaylistId || isProcessing}
          >
            Force Refresh All
          </Button>
          <Button
            onClick={testApiConnections}
          >
            Test Service Status
          </Button>
        </div>
        
        {/* Job Progress */}
        {jobProgress && (
          <div style={{ 
            marginTop: '16px', 
            padding: '12px',
            border: `${theme.borders.dashed} rgba(255, 255, 255, 0.3)`,
            background: 'rgba(255, 255, 255, 0.02)'
          }}>
            <div style={{ fontSize: '0.9rem', marginBottom: '8px', color: '#ffffff' }}>
              Progress: {jobProgress.processed} / {jobProgress.total} tracks processed
            </div>
            <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.7)' }}>
              Found: {jobProgress.found} matches | Errors: {jobProgress.errors?.length || 0}
            </div>
          </div>
        )}
        
        {error && (
          <div style={{ 
            color: '#ff4444', 
            marginTop: '16px',
            padding: '8px',
            border: `${theme.borders.dashed} #ff4444`,
            background: 'rgba(255, 68, 68, 0.1)'
          }}>
            Error: {error}
          </div>
        )}
      </Section>

      {/* Statistics */}
      {stats && selectedPlaylist && (
        <Section>
          <SectionHeader>{selectedPlaylist.title} - Statistics</SectionHeader>
          <StatusGrid>
            <StatCard>
              <StatValue>{stats.total_tracks}</StatValue>
              <StatLabel>Total Tracks</StatLabel>
            </StatCard>
            <StatCard>
              <StatValue>{stats.isrc_count || 0}</StatValue>
              <StatLabel>Have ISRC</StatLabel>
            </StatCard>
            <StatCard>
              <StatValue>{stats.spotify_links}</StatValue>
              <StatLabel>Spotify Links</StatLabel>
            </StatCard>
            <StatCard>
              <StatValue>{stats.apple_links}</StatValue>
              <StatLabel>Apple Music Links</StatLabel>
            </StatCard>
            <StatCard>
              <StatValue>{stats.tidal_links}</StatValue>
              <StatLabel>Tidal Links</StatLabel>
            </StatCard>
            <StatCard>
              <StatValue>{stats.youtube_links}</StatValue>
              <StatLabel>YouTube Music Links</StatLabel>
            </StatCard>
            <StatCard>
              <StatValue>{Math.round((stats.coverage || 0) * 100)}%</StatValue>
              <StatLabel>Overall Coverage</StatLabel>
            </StatCard>
            <StatCard>
              <StatValue>{stats.flagged}</StatValue>
              <StatLabel>Flagged for Review</StatLabel>
            </StatCard>
            <StatCard>
              <StatValue>{stats.completed}</StatValue>
              <StatLabel>Processing Complete</StatLabel>
            </StatCard>
          </StatusGrid>
          {stats.isrc_count < stats.total_tracks && stats.tidal_links < stats.total_tracks && (
            <div style={{
              marginTop: '12px',
              padding: '8px 12px',
              background: 'rgba(255, 170, 0, 0.1)',
              border: `${theme.borders.dashed} rgba(255, 170, 0, 0.4)`,
              fontSize: '0.85rem',
              color: 'rgba(255, 255, 255, 0.8)'
            }}>
              {stats.total_tracks - (stats.isrc_count || 0)} tracks missing ISRC.
              Use &quot;Force Refresh All&quot; to fetch ISRCs from Spotify and enable Tidal matching.
            </div>
          )}
        </Section>
      )}

      {/* Backfill Missing Links */}
      {backfillPreview && backfillPreview.totalPartial > 0 && selectedPlaylist && (
        <Section>
          <SectionHeader>Backfill Missing Links</SectionHeader>
          <div style={{
            marginBottom: '16px',
            padding: '12px',
            background: 'rgba(100, 149, 237, 0.1)',
            border: `${theme.borders.dashed} rgba(100, 149, 237, 0.4)`,
            fontSize: '0.9rem',
            color: 'rgba(255, 255, 255, 0.9)'
          }}>
            <div style={{ marginBottom: '8px' }}>
              <strong>{backfillPreview.totalPartial}</strong> tracks have partial coverage:
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', color: 'rgba(255, 255, 255, 0.7)' }}>
              {backfillPreview.missingApple > 0 && (
                <li>{backfillPreview.missingApple} missing Apple Music</li>
              )}
              {backfillPreview.missingTidal > 0 && (
                <li>{backfillPreview.missingTidal} missing Tidal</li>
              )}
              {backfillPreview.missingSpotify > 0 && (
                <li>{backfillPreview.missingSpotify} missing Spotify</li>
              )}
              {backfillPreview.missingYouTube > 0 && (
                <li>{backfillPreview.missingYouTube} missing YouTube Music</li>
              )}
            </ul>
          </div>
          <Button
            onClick={startBackfill}
            disabled={isBackfilling || isProcessing}
          >
            {isBackfilling ? 'Backfilling...' : 'Backfill Missing Links'}
          </Button>
          {isBackfilling && jobProgress && (
            <div style={{
              marginTop: '16px',
              padding: '12px',
              border: `${theme.borders.dashed} rgba(255, 255, 255, 0.3)`,
              background: 'rgba(255, 255, 255, 0.02)'
            }}>
              <div style={{ fontSize: '0.9rem', marginBottom: '8px', color: '#ffffff' }}>
                Backfill Progress: {jobProgress.processed} / {jobProgress.total} tracks
              </div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.7)' }}>
                Links found: {jobProgress.found} | Errors: {jobProgress.errors?.length || 0}
              </div>
            </div>
          )}
        </Section>
      )}

    </Container>
  );
};

export default CrossPlatformLinkingManager;
