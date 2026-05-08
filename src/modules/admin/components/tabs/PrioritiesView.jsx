import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { adminGet } from '../../utils/adminApi';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';

const AT = {
  bg: '#1f1f30',
  surface: '#12121a',
  surfaceHover: '#1a1a25',
  border: '#1e1e2e',
  borderLight: '#2a2a3a',
  text: '#ffffff',
  textMuted: '#8888a0',
  textDim: '#55556a',
  cyan: '#00d4ff',
  purple: '#a855f7',
  green: '#22c55e',
  greenDim: 'rgba(34, 197, 94, 0.15)',
  amber: '#f59e0b',
  amberDim: 'rgba(245, 158, 11, 0.15)',
  red: '#ef4444',
  redDim: 'rgba(239, 68, 68, 0.15)',
  blue: '#3b82f6',
  blueDim: 'rgba(59, 130, 246, 0.15)',
};

const TIME_PRESETS = [
  { id: '7d', label: '7 Days', range: 7, unit: 'days' },
  { id: '14d', label: '14 Days', range: 14, unit: 'days' },
  { id: '30d', label: '30 Days', range: 30, unit: 'days' },
  { id: '90d', label: '90 Days', range: 90, unit: 'days' },
];

const DashContainer = styled.div`
  background: ${AT.bg};
  min-height: 100vh;
  padding: ${theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const PanelGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.md};
  grid-template-columns: ${({ $cols }) => $cols || 'repeat(auto-fit, minmax(280px, 1fr))'};
  @media (max-width: 768px) { grid-template-columns: 1fr; }
`;

const Panel = styled.div`
  background: ${AT.surface};
  border: 1px solid ${AT.border};
  border-radius: 6px;
  padding: ${theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  ${({ $span }) => $span && `grid-column: span ${$span};`}
  @media (max-width: 768px) { grid-column: span 1; }
`;

const PanelTitle = styled.h4`
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: ${AT.textMuted};
  margin: 0;
`;

const BigNumber = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${({ $size }) => $size || '2rem'};
  font-weight: 700;
  color: ${({ $color }) => $color || AT.text};
  line-height: 1;
`;

const MetaText = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  color: ${AT.textDim};
`;

const DataTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-family: ${theme.fonts.mono};
  font-size: 11px;
`;

const Th = styled.th`
  text-align: left;
  padding: 8px 6px;
  border-bottom: 1px solid ${AT.border};
  color: ${AT.textDim};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 500;
  white-space: nowrap;
`;

const Td = styled.td`
  padding: 6px;
  border-bottom: 1px solid ${AT.border}33;
  color: ${AT.text};
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ScoreBadge = styled.span`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
  background: ${({ $score }) => {
    if ($score >= 50) return AT.redDim;
    if ($score >= 25) return AT.amberDim;
    return AT.greenDim;
  }};
  color: ${({ $score }) => {
    if ($score >= 50) return AT.red;
    if ($score >= 25) return AT.amber;
    return AT.green;
  }};
`;

const RateBadge = styled.span`
  color: ${({ $high }) => $high ? AT.red : AT.textMuted};
  font-weight: ${({ $high }) => $high ? 600 : 400};
`;

const PresetRow = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
`;

const PresetChip = styled.button`
  padding: 5px 10px;
  min-height: 28px;
  border: 1px solid ${({ $active }) => $active ? AT.cyan : AT.border};
  border-radius: 3px;
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: ${({ $active }) => $active ? 'rgba(0, 212, 255, 0.1)' : 'transparent'};
  color: ${({ $active }) => $active ? AT.cyan : AT.textMuted};
  cursor: pointer;
  transition: all 0.12s ease;
  &:hover {
    border-color: ${AT.cyan};
    color: ${AT.text};
    background: rgba(0, 212, 255, 0.06);
  }
  @media (max-width: 768px) {
    min-height: ${theme.touchTarget?.min || '44px'};
    padding: 6px 12px;
  }
`;

const LoadingMsg = styled.div`
  padding: ${theme.spacing.lg};
  text-align: center;
  font-family: ${theme.fonts.mono};
  font-size: 12px;
  color: ${AT.textMuted};
`;

const EmptyMsg = styled.div`
  padding: ${theme.spacing.md};
  text-align: center;
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  color: ${AT.textDim};
`;

const ChartTooltipWrapper = styled.div`
  background: ${AT.surface};
  border: 1px solid ${AT.border};
  border-radius: 4px;
  padding: 8px 12px;
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  color: ${AT.text};
`;

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <ChartTooltipWrapper>
      <div style={{ color: AT.textMuted, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>{p.name}: {p.value}</div>
      ))}
    </ChartTooltipWrapper>
  );
};

const PrioritiesView = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePreset, setActivePreset] = useState('30d');
  const [range, setRange] = useState({ range: 30, unit: 'days' });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await adminGet(`/api/v1/admin/analytics/priorities?range=${range.range}&unit=${range.unit}`);
      if (response.success) setData(response.data);
    } catch (error) {
      console.error('[PRIORITIES] Fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePresetSelect = (preset) => {
    setActivePreset(preset.id);
    setRange({ range: preset.range, unit: preset.unit });
  };

  if (loading && !data) return <LoadingMsg>Loading priorities data...</LoadingMsg>;

  const topline = data?.topline || {};
  const priorityRanking = data?.priorityRanking || [];
  const featureUsage = data?.featureUsage || [];
  const featureFriction = data?.featureFriction || [];
  const topClickTargets = data?.topClickTargets || [];
  const topTransitions = data?.topTransitions || [];

  const transitionChartData = topTransitions.slice(0, 10).map(t => ({
    name: `${t.from_feature} -> ${t.to_feature}`,
    count: t.count,
    sessions: t.unique_sessions,
  }));

  return (
    <DashContainer>
      <PresetRow>
        {TIME_PRESETS.map(p => (
          <PresetChip key={p.id} $active={activePreset === p.id} onClick={() => handlePresetSelect(p)}>
            {p.label}
          </PresetChip>
        ))}
      </PresetRow>

      {/* Topline KPIs */}
      <PanelGrid $cols="repeat(4, 1fr)">
        <Panel>
          <PanelTitle>Total Sessions</PanelTitle>
          <BigNumber $color={AT.cyan}>{topline.totalSessions?.toLocaleString() || 0}</BigNumber>
        </Panel>
        <Panel>
          <PanelTitle>Tracked Actions</PanelTitle>
          <BigNumber $color={AT.purple}>{topline.trackedActions?.toLocaleString() || 0}</BigNumber>
        </Panel>
        <Panel>
          <PanelTitle>Active Features</PanelTitle>
          <BigNumber $color={AT.green}>{topline.activeFeatures || 0}</BigNumber>
        </Panel>
        <Panel>
          <PanelTitle>Unique Visitors</PanelTitle>
          <BigNumber $color={AT.amber}>{topline.uniqueVisitors?.toLocaleString() || 0}</BigNumber>
        </Panel>
      </PanelGrid>

      {/* Priority Ranking */}
      <Panel>
        <PanelTitle>Priority Ranking</PanelTitle>
        {priorityRanking.length === 0 ? (
          <EmptyMsg>No priority data yet. Actions will appear as users interact with tracked features.</EmptyMsg>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <DataTable>
              <thead>
                <tr>
                  <Th>Feature</Th>
                  <Th>Score</Th>
                  <Th>Usage Share</Th>
                  <Th>Dropoff</Th>
                  <Th>Error Rate</Th>
                  <Th>Rage Rate</Th>
                  <Th>Impact</Th>
                </tr>
              </thead>
              <tbody>
                {priorityRanking.map(row => (
                  <tr key={row.feature_key}>
                    <Td style={{ fontWeight: 600 }}>{row.feature_key}</Td>
                    <Td><ScoreBadge $score={row.priority_score}>{row.priority_score.toFixed(1)}</ScoreBadge></Td>
                    <Td>{(row.usage_share * 100).toFixed(1)}%</Td>
                    <Td><RateBadge $high={row.components.dropoff_rate > 0.25}>{(row.components.dropoff_rate * 100).toFixed(0)}%</RateBadge></Td>
                    <Td><RateBadge $high={row.components.error_rate > 0.25}>{(row.components.error_rate * 100).toFixed(0)}%</RateBadge></Td>
                    <Td><RateBadge $high={row.components.rage_rate > 0.05}>{(row.components.rage_rate * 100).toFixed(0)}%</RateBadge></Td>
                    <Td>{row.absolute_impact}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}
        <MetaText>Highest score = best candidate for product investment. Score = f(usage, friction, absolute impact).</MetaText>
      </Panel>

      {/* Feature Transitions */}
      <Panel>
        <PanelTitle>Feature Transitions</PanelTitle>
        {transitionChartData.length === 0 ? (
          <EmptyMsg>No transitions recorded yet.</EmptyMsg>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(transitionChartData.length * 36, 200)}>
            <BarChart data={transitionChartData} layout="vertical" margin={{ left: 120, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={AT.border} horizontal={false} />
              <XAxis type="number" stroke={AT.textDim} tick={{ fontSize: 10, fill: AT.textMuted }} />
              <YAxis type="category" dataKey="name" stroke={AT.textDim} tick={{ fontSize: 10, fill: AT.textMuted }} width={120} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" fill={AT.cyan} name="Transitions" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <PanelGrid $cols="1fr 1fr">
        {/* Click Hotspots */}
        <Panel>
          <PanelTitle>Click Hotspots</PanelTitle>
          {topClickTargets.length === 0 ? (
            <EmptyMsg>No click data yet.</EmptyMsg>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <DataTable>
                <thead>
                  <tr>
                    <Th>Feature</Th>
                    <Th>Target</Th>
                    <Th>Clicks</Th>
                    <Th>Sessions</Th>
                  </tr>
                </thead>
                <tbody>
                  {topClickTargets.slice(0, 20).map((row, i) => (
                    <tr key={i}>
                      <Td>{row.feature_key}</Td>
                      <Td>{row.target_key}</Td>
                      <Td>{row.clicks}</Td>
                      <Td>{row.unique_sessions}</Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          )}
        </Panel>

        {/* Friction Detail */}
        <Panel>
          <PanelTitle>Friction Detail</PanelTitle>
          {featureFriction.length === 0 ? (
            <EmptyMsg>No friction data yet.</EmptyMsg>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <DataTable>
                <thead>
                  <tr>
                    <Th>Feature</Th>
                    <Th>Starts</Th>
                    <Th>Completes</Th>
                    <Th>Errors</Th>
                    <Th>Dropoff</Th>
                    <Th>Error Rate</Th>
                  </tr>
                </thead>
                <tbody>
                  {featureFriction.map(row => (
                    <tr key={row.feature_key}>
                      <Td>{row.feature_key}</Td>
                      <Td>{row.starts}</Td>
                      <Td>{row.completes}</Td>
                      <Td>{row.errors}</Td>
                      <Td><RateBadge $high={row.dropoff_rate > 0.25}>{(row.dropoff_rate * 100).toFixed(0)}%</RateBadge></Td>
                      <Td><RateBadge $high={row.error_rate > 0.25}>{(row.error_rate * 100).toFixed(0)}%</RateBadge></Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          )}
        </Panel>
      </PanelGrid>

      {/* Feature Usage */}
      <Panel>
        <PanelTitle>Feature Usage</PanelTitle>
        {featureUsage.length === 0 ? (
          <EmptyMsg>No usage data yet.</EmptyMsg>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <DataTable>
              <thead>
                <tr>
                  <Th>Feature</Th>
                  <Th>Sessions</Th>
                  <Th>Actions</Th>
                  <Th>Usage Share</Th>
                  <Th>Growth</Th>
                </tr>
              </thead>
              <tbody>
                {featureUsage.map(row => (
                  <tr key={row.feature_key}>
                    <Td style={{ fontWeight: 600 }}>{row.feature_key}</Td>
                    <Td>{row.sessions}</Td>
                    <Td>{row.actions}</Td>
                    <Td>{(row.usage_share * 100).toFixed(1)}%</Td>
                    <Td style={{ color: row.growth_pct > 0 ? AT.green : row.growth_pct < 0 ? AT.red : AT.textMuted }}>
                      {row.growth_pct !== null ? `${row.growth_pct > 0 ? '+' : ''}${row.growth_pct.toFixed(1)}%` : '--'}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}
      </Panel>
    </DashContainer>
  );
};

export default PrioritiesView;
