import styled from 'styled-components';
import { tokens, theme } from '../ui/index.jsx';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[6]};
`;

const TableSection = styled.div`
  background: ${theme.colors.fpwhite};
  border: 2px solid ${theme.colors.black};
  padding: ${tokens.spacing[4]};
`;

const SectionTitle = styled.h4`
  margin: 0 0 ${tokens.spacing[3]} 0;
  font-size: 1.1rem;
  font-weight: bold;
  color: ${theme.colors.black};
`;

const DataTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;

  th, td {
    padding: ${tokens.spacing[2]} ${tokens.spacing[3]};
    text-align: left;
    border-bottom: 1px solid ${theme.colors.lightgray};
  }

  th {
    font-weight: bold;
    background: ${theme.colors.fpwhite};
    color: ${theme.colors.black};
    position: sticky;
    top: 0;
  }

  tr:last-child td {
    border-bottom: none;
  }

  tr:hover {
    background: rgba(0, 0, 0, 0.02);
  }

  td.number {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  th.number {
    text-align: right;
  }
`;

export default function AnalysisTable({ analytics, tracks }) {
  if (!analytics) return null;

  const formatPercentage = (value) => {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    return `${(value * 100).toFixed(1)}%`;
  };

  const audioFeatures = [
    { key: 'danceability', label: 'Danceability', description: 'How suitable for dancing', isPercentage: true },
    { key: 'energy', label: 'Energy', description: 'Intensity and activity', isPercentage: true },
    { key: 'valence', label: 'Valence', description: 'Musical positivity', isPercentage: true },
    { key: 'acousticness', label: 'Acousticness', description: 'Acoustic vs electronic', isPercentage: true },
    { key: 'instrumentalness', label: 'Instrumentalness', description: 'Lack of vocals', isPercentage: true },
    { key: 'liveness', label: 'Liveness', description: 'Presence of audience', isPercentage: true },
    { key: 'speechiness', label: 'Speechiness', description: 'Presence of spoken words', isPercentage: true },
    { key: 'tempo', label: 'Tempo', description: 'Beats per minute', isPercentage: false },
    { key: 'loudness', label: 'Loudness', description: 'Overall volume in dB', isPercentage: false },
  ];

  return (
    <Container>
      {/* Audio Features Averages */}
      <TableSection>
        <SectionTitle>Audio Feature Averages</SectionTitle>
        <DataTable>
          <thead>
            <tr>
              <th>Feature</th>
              <th className="number">Average</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {audioFeatures.map(feature => {
              const value = analytics.audioAverages[feature.key];
              if (value === undefined) return null;

              return (
                <tr key={feature.key}>
                  <td>{feature.label}</td>
                  <td className="number">
                    {feature.isPercentage
                      ? formatPercentage(value)
                      : feature.key === 'tempo'
                        ? `${value.toFixed(0)} BPM`
                        : value.toFixed(1)}
                  </td>
                  <td>{feature.description}</td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </TableSection>

      {/* Top Artists */}
      {analytics.topArtists.length > 0 && (
        <TableSection>
          <SectionTitle>Top Artists (by track count)</SectionTitle>
          <DataTable>
            <thead>
              <tr>
                <th className="number">Rank</th>
                <th>Artist</th>
                <th className="number">Tracks</th>
                <th className="number">Percentage</th>
              </tr>
            </thead>
            <tbody>
              {analytics.topArtists.map(([artist, count], index) => (
                <tr key={artist}>
                  <td className="number">{index + 1}</td>
                  <td>{artist}</td>
                  <td className="number">{count}</td>
                  <td className="number">
                    {formatPercentage(count / analytics.totalTracks)}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </TableSection>
      )}

      {/* Top Genres */}
      {analytics.topGenres.length > 0 && (
        <TableSection>
          <SectionTitle>Top Genres (from artist data)</SectionTitle>
          <DataTable>
            <thead>
              <tr>
                <th className="number">Rank</th>
                <th>Genre</th>
                <th className="number">Occurrences</th>
                <th className="number">Percentage</th>
              </tr>
            </thead>
            <tbody>
              {analytics.topGenres.map(([genre, count], index) => (
                <tr key={genre}>
                  <td className="number">{index + 1}</td>
                  <td>{genre}</td>
                  <td className="number">{count}</td>
                  <td className="number">
                    {formatPercentage(count / analytics.totalTracks)}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </TableSection>
      )}

      {/* Release Year Distribution */}
      {analytics.yearDistribution.length > 0 && (
        <TableSection>
          <SectionTitle>Release Year Distribution</SectionTitle>
          <DataTable>
            <thead>
              <tr>
                <th className="number">Year</th>
                <th className="number">Tracks</th>
                <th className="number">Percentage</th>
              </tr>
            </thead>
            <tbody>
              {analytics.yearDistribution.map(([year, count]) => (
                <tr key={year}>
                  <td className="number">{year}</td>
                  <td className="number">{count}</td>
                  <td className="number">
                    {formatPercentage(count / analytics.totalTracks)}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </TableSection>
      )}
    </Container>
  );
}
