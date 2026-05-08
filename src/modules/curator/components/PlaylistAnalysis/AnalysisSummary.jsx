import styled from 'styled-components';
import { tokens, theme } from '../ui/index.jsx';

const Container = styled.div`
  margin-bottom: ${tokens.spacing[6]};
`;

const SectionTitle = styled.h3`
  margin: 0 0 ${tokens.spacing[4]} 0;
  font-size: 1.2rem;
  font-weight: bold;
  color: ${theme.colors.black};
`;

const StatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${tokens.spacing[4]};
`;

const StatCard = styled.div`
  background: ${theme.colors.fpwhite};
  border: 2px solid ${theme.colors.black};
  padding: ${tokens.spacing[4]};
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};

  .label {
    font-size: 0.85rem;
    color: ${theme.colors.darkgray};
    text-transform: uppercase;
    font-weight: 500;
    letter-spacing: 0.5px;
  }

  .value {
    font-size: 1.5rem;
    font-weight: bold;
    color: ${theme.colors.black};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    font-size: 0.85rem;
    color: ${theme.colors.darkgray};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

export default function AnalysisSummary({ analytics }) {
  if (!analytics) return null;

  const formatPercentage = (value) => {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    return `${(value * 100).toFixed(0)}%`;
  };

  const formatTempo = (tempo) => {
    if (typeof tempo !== 'number' || isNaN(tempo)) return 'N/A';
    return `${tempo.toFixed(0)} BPM`;
  };

  const formatDuration = (durationMs) => {
    if (typeof durationMs !== 'number' || isNaN(durationMs)) return 'N/A';
    const totalSeconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <Container>
      <SectionTitle>Key Metrics</SectionTitle>
      <StatGrid>
        <StatCard>
          <span className="label">Total Tracks</span>
          <span className="value">{analytics.totalTracks}</span>
        </StatCard>

        {analytics.avgDurationMs && (
          <StatCard>
            <span className="label">Avg Song Length</span>
            <span className="value">{formatDuration(analytics.avgDurationMs)}</span>
            <span className="meta">Average track duration</span>
          </StatCard>
        )}

        {analytics.topArtists[0] && (
          <StatCard>
            <span className="label">Top Artist</span>
            <span className="value">{analytics.topArtists[0][0]}</span>
            <span className="meta">{analytics.topArtists[0][1]} tracks</span>
          </StatCard>
        )}

        {analytics.topGenres[0] && (
          <StatCard>
            <span className="label">Top Genre</span>
            <span className="value">{analytics.topGenres[0][0]}</span>
            <span className="meta">{analytics.topGenres[0][1]} tracks</span>
          </StatCard>
        )}

        {analytics.mostPopularTrack && (
          <StatCard>
            <span className="label">Most Popular</span>
            <span className="value">{analytics.mostPopularTrack.title}</span>
            <span className="meta">{analytics.mostPopularTrack.artist}</span>
          </StatCard>
        )}

        {analytics.audioAverages.danceability !== undefined && (
          <StatCard>
            <span className="label">Avg Danceability</span>
            <span className="value">{formatPercentage(analytics.audioAverages.danceability)}</span>
            <span className="meta">How suitable for dancing</span>
          </StatCard>
        )}

        {analytics.audioAverages.energy !== undefined && (
          <StatCard>
            <span className="label">Avg Energy</span>
            <span className="value">{formatPercentage(analytics.audioAverages.energy)}</span>
            <span className="meta">Intensity and activity</span>
          </StatCard>
        )}

        {analytics.audioAverages.valence !== undefined && (
          <StatCard>
            <span className="label">Avg Valence</span>
            <span className="value">{formatPercentage(analytics.audioAverages.valence)}</span>
            <span className="meta">Musical positivity</span>
          </StatCard>
        )}

        {analytics.audioAverages.tempo !== undefined && (
          <StatCard>
            <span className="label">Avg Tempo</span>
            <span className="value">{formatTempo(analytics.audioAverages.tempo)}</span>
            <span className="meta">Beats per minute</span>
          </StatCard>
        )}

        {analytics.yearRange && (
          <StatCard>
            <span className="label">Year Range</span>
            <span className="value">{analytics.yearRange[0]} - {analytics.yearRange[1]}</span>
            <span className="meta">{analytics.yearRange[1] - analytics.yearRange[0] + 1} years</span>
          </StatCard>
        )}
      </StatGrid>
    </Container>
  );
}
