import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { adminGet } from '../../utils/adminApi';

/**
 * AnalyticsView - Display A/B test metrics and user interaction data
 * Shows aggregated stats by variant with CTR and scroll-back rates
 */
const AnalyticsView = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetchAnalytics();
  }, [days]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const response = await adminGet(`/api/v1/admin/end-scroll/analytics?days=${days}`);
      if (response.success) {
        setAnalytics(response.data);
      }
    } catch (error) {
      console.error('[END_SCROLL] Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingMessage>Loading analytics...</LoadingMessage>;
  }

  if (!analytics) {
    return <ErrorMessage>Failed to load analytics data</ErrorMessage>;
  }

  const { byVariant, totalImpressions, totalClicks } = analytics;

  return (
    <Container>
      <ControlsBar>
        <Label>Time Period:</Label>
        <Select value={days} onChange={(e) => setDays(parseInt(e.target.value, 10))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </Select>
      </ControlsBar>

      <AnalyticsGrid>
        <AnalyticCard>
          <AnalyticLabel>Total Impressions</AnalyticLabel>
          <AnalyticValue>{totalImpressions?.toLocaleString() || 0}</AnalyticValue>
        </AnalyticCard>

        <AnalyticCard>
          <AnalyticLabel>Total Clicks</AnalyticLabel>
          <AnalyticValue>{totalClicks?.toLocaleString() || 0}</AnalyticValue>
        </AnalyticCard>

        {byVariant?.A && (
          <AnalyticCard>
            <AnalyticLabel>Variant A CTR</AnalyticLabel>
            <AnalyticValue>{byVariant.A.ctr}%</AnalyticValue>
            <AnalyticMeta>{byVariant.A.impressions} impressions • {byVariant.A.clicks} clicks</AnalyticMeta>
          </AnalyticCard>
        )}

        {byVariant?.B && (
          <AnalyticCard>
            <AnalyticLabel>Variant B CTR</AnalyticLabel>
            <AnalyticValue>{byVariant.B.ctr}%</AnalyticValue>
            <AnalyticMeta>{byVariant.B.impressions} impressions • {byVariant.B.clicks} clicks</AnalyticMeta>
          </AnalyticCard>
        )}

        {byVariant?.default && (
          <AnalyticCard>
            <AnalyticLabel>Default CTR</AnalyticLabel>
            <AnalyticValue>{byVariant.default.ctr}%</AnalyticValue>
            <AnalyticMeta>{byVariant.default.impressions} impressions • {byVariant.default.clicks} clicks</AnalyticMeta>
          </AnalyticCard>
        )}
      </AnalyticsGrid>

      {analytics.mostClickedPlaylists && analytics.mostClickedPlaylists.length > 0 && (
        <>
          <SectionTitle>Most Clicked Playlists</SectionTitle>
          <PlaylistTable>
            <thead>
              <tr>
                <TableHeader>Playlist</TableHeader>
                <TableHeader>Clicks</TableHeader>
              </tr>
            </thead>
            <tbody>
              {analytics.mostClickedPlaylists.map((playlist) => (
                <tr key={playlist.id}>
                  <TableCell>{playlist.title}</TableCell>
                  <TableCell>{playlist.click_count}</TableCell>
                </tr>
              ))}
            </tbody>
          </PlaylistTable>
        </>
      )}
    </Container>
  );
};

// Styled Components
const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
  margin-top: ${theme.spacing.md};
`;

const ControlsBar = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
`;

const Label = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const Select = styled.select`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.solid} ${theme.colors.black};
  border-radius: 4px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  background: ${theme.colors.fpwhite};
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${theme.colors.primary};
  }
`;

const AnalyticsGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.md};
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
`;

const AnalyticCard = styled.div`
  background: rgba(0, 0, 0, 0.77);
  border: ${theme.borders.dashedThin} rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  padding: ${theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const AnalyticLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 1);
`;

const AnalyticValue = styled.span`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h3};
  font-weight: ${theme.fontWeights.bold};
  color: ${theme.colors.success};
`;

const AnalyticMeta = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(51, 255, 0, 0.55);
`;

const SectionTitle = styled.h4`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h5};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: ${theme.spacing.md} 0 ${theme.spacing.sm} 0;
`;

const PlaylistTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const TableHeader = styled.th`
  text-align: left;
  padding: ${theme.spacing.sm};
  border-bottom: ${theme.borders.solid} ${theme.colors.black};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: ${theme.fontWeights.bold};
`;

const TableCell = styled.td`
  padding: ${theme.spacing.sm};
  border-bottom: ${theme.borders.solidThin} rgba(0, 0, 0, 0.1);
`;

const LoadingMessage = styled.div`
  padding: ${theme.spacing.lg};
  text-align: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  color: ${theme.colors.darkgrey};
`;

const ErrorMessage = styled.div`
  padding: ${theme.spacing.md};
  background: ${theme.colors.dangerBG};
  border: ${theme.borders.solid} ${theme.colors.danger};
  border-radius: 8px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.danger};
  text-align: center;
`;

export default AnalyticsView;
