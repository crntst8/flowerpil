import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { SubTabNavigation } from '../shared';
import { adminGet, adminFetch } from '../../utils/adminApi';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Legend
} from 'recharts';
import PrioritiesView from './PrioritiesView';

// Dark Analytics Theme
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

const PIE_COLORS = [AT.cyan, AT.purple, AT.green, AT.amber, AT.blue, AT.red, '#ec4899', '#06b6d4', '#84cc16', '#f97316'];

// Color map for page type badges
const TYPE_COLORS = {
  playlist: { bg: AT.blueDim, fg: AT.blue },
  curator: { bg: 'rgba(168, 85, 247, 0.15)', fg: AT.purple },
  home: { bg: AT.greenDim, fg: AT.green },
  top10: { bg: AT.amberDim, fg: AT.amber },
  feature: { bg: 'rgba(236, 72, 153, 0.15)', fg: '#ec4899' },
  release: { bg: 'rgba(6, 182, 212, 0.15)', fg: '#06b6d4' },
  blog: { bg: 'rgba(132, 204, 22, 0.15)', fg: '#84cc16' },
  about: { bg: 'rgba(148, 163, 184, 0.15)', fg: '#94a3b8' },
  bio: { bg: 'rgba(168, 85, 247, 0.12)', fg: '#c084fc' },
  'content-tag': { bg: 'rgba(249, 115, 22, 0.15)', fg: '#f97316' },
  discover: { bg: AT.greenDim, fg: '#4ade80' },
  search: { bg: 'rgba(99, 102, 241, 0.15)', fg: '#818cf8' },
  share: { bg: 'rgba(20, 184, 166, 0.15)', fg: '#14b8a6' },
  perf: { bg: 'rgba(251, 191, 36, 0.15)', fg: '#fbbf24' },
  list: { bg: AT.blueDim, fg: '#60a5fa' },
  auth: { bg: 'rgba(100, 116, 139, 0.12)', fg: '#64748b' },
  admin: { bg: 'rgba(100, 116, 139, 0.12)', fg: '#64748b' },
};
const getTypeColor = (type) => TYPE_COLORS[type] || { bg: 'rgba(255,255,255,0.05)', fg: AT.textMuted };

// Time period presets
const TIME_PRESETS = [
  { id: 'today', label: 'Today', range: 1, unit: 'days' },
  { id: 'yesterday', label: 'Yesterday', range: 2, unit: 'days' },
  { id: '7d', label: '7 Days', range: 7, unit: 'days' },
  { id: '14d', label: '14 Days', range: 14, unit: 'days' },
  { id: '30d', label: '30 Days', range: 30, unit: 'days' },
  { id: '90d', label: '90 Days', range: 90, unit: 'days' },
];

const RANGE_LIMITS = {
  minutes: { min: 5, max: 43200 },
  hours: { min: 1, max: 720 },
  days: { min: 1, max: 365 }
};

const clampRangeValue = (value, unit) => {
  const limits = RANGE_LIMITS[unit] || RANGE_LIMITS.minutes;
  if (!Number.isFinite(value)) return limits.min;
  return Math.min(Math.max(value, limits.min), limits.max);
};

const formatRangeLabel = (value, unit, capitalize = false) => {
  const numericValue = Number.isFinite(value) ? value : 0;
  const safeUnit = (unit || 'minutes').toLowerCase();
  const singularUnit = safeUnit.endsWith('s') ? safeUnit.slice(0, -1) : safeUnit;
  const unitLabel = numericValue === 1 ? singularUnit : safeUnit;
  const prefix = capitalize ? 'Last' : 'last';
  return `${prefix} ${numericValue} ${unitLabel}`;
};

const formatBucketLabel = (bucket, unit) => {
  if (!bucket) return '';
  if (unit === 'minute') return bucket.slice(5, 16);
  if (unit === 'hour') return bucket.slice(5, 13);
  if (bucket.length >= 10) return bucket.slice(5, 10);
  return bucket;
};

// Styled Components
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

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
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

  @media (max-width: 768px) {
    grid-column: span 1;
  }
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

const TrendBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
  background: ${({ $positive }) => $positive ? AT.greenDim : AT.redDim};
  color: ${({ $positive }) => $positive ? AT.green : AT.red};
`;

const ControlsRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
`;

const DarkSelect = styled.select`
  padding: 8px 12px;
  min-height: 36px;
  border: 1px solid ${AT.border};
  border-radius: 4px;
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  background: ${AT.surface};
  color: ${AT.text};
  cursor: pointer;

  &:hover { border-color: ${AT.borderLight}; }

  @media (max-width: 768px) {
    min-height: ${theme.touchTarget.min};
  }
`;

const DarkInput = styled.input`
  padding: 8px 12px;
  min-height: 36px;
  width: 92px;
  border: 1px solid ${AT.border};
  border-radius: 4px;
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  background: ${AT.surface};
  color: ${AT.text};

  &:hover { border-color: ${AT.borderLight}; }
  &:focus { outline: none; border-color: ${AT.cyan}; }

  @media (max-width: 768px) {
    min-height: ${theme.touchTarget.min};
  }
`;

const RangeLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${AT.textMuted};
`;

const RangeGroup = styled.div`
  display: inline-flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
`;

const DarkButton = styled.button`
  padding: 8px 14px;
  min-height: 36px;
  border: 1px solid ${AT.border};
  border-radius: 4px;
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  background: ${AT.surface};
  color: ${AT.text};
  cursor: pointer;

  &:hover { background: ${AT.surfaceHover}; border-color: ${AT.borderLight}; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }

  @media (max-width: 768px) {
    min-height: ${theme.touchTarget.min};
  }
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

const TypeBadge = styled.span`
  display: inline-block;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  text-transform: uppercase;
  background: ${({ $type }) => getTypeColor($type).bg};
  color: ${({ $type }) => getTypeColor($type).fg};
`;

const PulseDot = styled.span`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${AT.green};
  margin-right: 6px;
  animation: pulse 2s infinite;
  @keyframes pulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(34,197,94,0.4); }
    50% { opacity: 0.7; box-shadow: 0 0 0 4px rgba(34,197,94,0); }
  }
`;

const EmptyMsg = styled.div`
  padding: ${theme.spacing.md};
  text-align: center;
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  color: ${AT.textDim};
`;

const LoadingMsg = styled.div`
  padding: ${theme.spacing.lg};
  text-align: center;
  font-family: ${theme.fonts.mono};
  font-size: 12px;
  color: ${AT.textMuted};
`;

const JourneyPath = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
`;

const JourneyStep = styled.span`
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  text-transform: uppercase;
  background: ${({ $type }) => getTypeColor($type).bg};
  color: ${({ $type }) => getTypeColor($type).fg};
`;

const JourneyArrow = styled.span`
  color: ${AT.textDim};
  font-size: 10px;
`;

const FreqBar = styled.div`
  height: 4px;
  border-radius: 2px;
  background: ${AT.cyan};
  opacity: 0.6;
  width: ${({ $pct }) => $pct}%;
  margin-top: 4px;
`;

const InsightCard = styled.div`
  background: ${({ $color }) => $color || AT.blueDim};
  border: 1px solid ${AT.border};
  border-radius: 6px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const InsightLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  color: ${AT.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const InsightValue = styled.span`
  font-family: ${theme.fonts.primary};
  font-size: 1.1rem;
  font-weight: 600;
  color: ${AT.text};
`;

// Custom Recharts tooltip
const CustomTooltipContainer = styled.div`
  background: ${AT.surface};
  border: 1px solid ${AT.border};
  border-radius: 4px;
  padding: 8px 10px;
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  color: ${AT.text};
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
`;

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <CustomTooltipContainer>
      <div style={{ color: AT.textMuted, marginBottom: 4 }}>{label}</div>
      {payload.map((entry, i) => (
        <div key={i} style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
        </div>
      ))}
    </CustomTooltipContainer>
  );
};

// Export functionality
const ExportDropdown = styled.div`
  position: relative;
  margin-left: auto;
  &:hover > div:last-child { opacity: 1; visibility: visible; transform: translateY(0); }
`;

const ExportMenu = styled.div`
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: ${AT.surface};
  border: 1px solid ${AT.border};
  border-radius: 4px;
  min-width: 160px;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: all 0.15s ease;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
`;

const ExportItem = styled.button`
  display: block;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  text-align: left;
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  color: ${AT.text};
  cursor: pointer;
  &:hover { background: ${AT.surfaceHover}; }
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
    min-height: ${theme.touchTarget.min};
    padding: 6px 12px;
  }
`;

const TimePresets = ({ activePreset, onSelect }) => (
  <PresetRow>
    {TIME_PRESETS.map(p => (
      <PresetChip key={p.id} $active={activePreset === p.id} onClick={() => onSelect(p)}>
        {p.label}
      </PresetChip>
    ))}
  </PresetRow>
);

// ===== LIVE VIEW =====
const LiveView = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const response = await adminGet('/api/v1/admin/analytics/realtime');
      if (response.success) setData(response.data);
    } catch (error) {
      console.error('[ANALYTICS] Realtime error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) return <LoadingMsg>Connecting to live data...</LoadingMsg>;

  return (
    <DashContainer>
      <PanelGrid $cols="1fr 1fr 1fr">
        <Panel>
          <PanelTitle>Active Visitors</PanelTitle>
          <BigNumber $size="3rem" $color={AT.green}>
            <PulseDot />{data?.totalVisitors || 0}
          </BigNumber>
          <MetaText>updating every 15s</MetaText>
        </Panel>
        <Panel>
          <PanelTitle>Top Page</PanelTitle>
          <BigNumber $size="1rem">
            {data?.pages?.[0]?.path || '-'}
          </BigNumber>
          <MetaText>{data?.pages?.[0]?.count || 0} visitors</MetaText>
        </Panel>
        <Panel>
          <PanelTitle>Pages Active</PanelTitle>
          <BigNumber $size="2.5rem" $color={AT.cyan}>
            {data?.pages?.length || 0}
          </BigNumber>
        </Panel>
      </PanelGrid>

      <Panel>
        <PanelTitle>Active Sessions by Page</PanelTitle>
        {(!data?.pages || data.pages.length === 0) ? (
          <EmptyMsg>No active visitors right now</EmptyMsg>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Page</Th>
                <Th>Type</Th>
                <Th>Visitors</Th>
              </tr>
            </thead>
            <tbody>
              {data.pages.map((page, i) => (
                <tr key={i}>
                  <Td title={page.path}>{page.path}</Td>
                  <Td><TypeBadge $type={page.type}>{page.type}</TypeBadge></Td>
                  <Td style={{ color: AT.cyan }}>{page.count}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Panel>
    </DashContainer>
  );
};

// ===== OVERVIEW VIEW =====
const OverviewView = () => {
  const [data, setData] = useState(null);
  const [traffic, setTraffic] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [rangeValue, setRangeValue] = useState(14);
  const [rangeUnit, setRangeUnit] = useState('days');
  const [activePreset, setActivePreset] = useState('14d');

  const handlePreset = (preset) => {
    setActivePreset(preset.id);
    setRangeValue(preset.range);
    setRangeUnit(preset.unit);
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        range: rangeValue,
        unit: rangeUnit
      });
      const [overviewRes, trafficRes] = await Promise.all([
        adminGet(`/api/v1/admin/analytics/overview?${params.toString()}`),
        adminGet(`/api/v1/admin/analytics/traffic?${params.toString()}`)
      ]);
      if (overviewRes.success) setData(overviewRes.data);
      if (trafficRes.success) setTraffic(trafficRes.data);
    } catch (error) {
      console.error('[ANALYTICS] Overview error:', error);
    } finally {
      setLoading(false);
    }
  }, [rangeUnit, rangeValue]);

  const handleExport = async (type) => {
    setExporting(true);
    try {
      const response = await adminFetch(`/api/v1/admin/analytics/export?type=${type}&days=30`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || `analytics-${type}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('[ANALYTICS] Export error:', error);
    } finally {
      setExporting(false);
    }
  };

  const handleRangeValueChange = (event) => {
    const nextValue = parseInt(event.target.value, 10);
    if (Number.isNaN(nextValue)) return;
    setActivePreset(null);
    setRangeValue(clampRangeValue(nextValue, rangeUnit));
  };

  const handleRangeUnitChange = (event) => {
    const nextUnit = event.target.value;
    setActivePreset(null);
    setRangeUnit(nextUnit);
    setRangeValue((current) => clampRangeValue(current, nextUnit));
  };

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <LoadingMsg>Loading analytics...</LoadingMsg>;
  if (!data) return <EmptyMsg>No analytics data available</EmptyMsg>;

  const rangeLimits = RANGE_LIMITS[rangeUnit] || RANGE_LIMITS.minutes;
  const rangeLabel = formatRangeLabel(rangeValue, rangeUnit);
  const rangeTitle = formatRangeLabel(rangeValue, rangeUnit, true);
  const rangeStats = data.range || {};
  const bucketUnit = traffic?.bucketUnit;
  const hasRangeSeries = Array.isArray(traffic?.series);
  const sparkData = hasRangeSeries
    ? traffic.series.map(d => ({
      label: formatBucketLabel(d.bucket, bucketUnit),
      views: d.pageviews,
      visitors: d.unique_visitors
    }))
    : (traffic?.daily?.map(d => ({
      label: d.date?.slice(5),
      views: d.pageviews,
      visitors: d.unique_visitors
    })) || []);

  return (
    <DashContainer>
      <TimePresets activePreset={activePreset} onSelect={handlePreset} />
      <ControlsRow>
        <RangeGroup>
          <RangeLabel>Last</RangeLabel>
          <DarkInput
            type="number"
            min={rangeLimits.min}
            max={rangeLimits.max}
            step={1}
            value={rangeValue}
            onChange={handleRangeValueChange}
            aria-label="Range value"
          />
          <DarkSelect value={rangeUnit} onChange={handleRangeUnitChange} aria-label="Range unit">
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </DarkSelect>
        </RangeGroup>
        <DarkButton onClick={fetchData}>Refresh</DarkButton>
        {data.realtimeVisitors > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', fontFamily: theme.fonts.mono, fontSize: '11px', color: AT.text }}>
            <PulseDot />{data.realtimeVisitors} online now
          </span>
        )}
        <ExportDropdown>
          <DarkButton disabled={exporting}>{exporting ? 'Exporting...' : 'Export CSV'}</DarkButton>
          <ExportMenu>
            <ExportItem onClick={() => handleExport('daily')}>Daily Stats (30d)</ExportItem>
            <ExportItem onClick={() => handleExport('pages')}>Pages (30d)</ExportItem>
            <ExportItem onClick={() => handleExport('events')}>Events (30d)</ExportItem>
            <ExportItem onClick={() => handleExport('resources')}>Resources (30d)</ExportItem>
          </ExportMenu>
        </ExportDropdown>
      </ControlsRow>

      <PanelGrid $cols="repeat(4, 1fr)">
        <Panel>
          <PanelTitle>Range Views</PanelTitle>
          <BigNumber>{rangeStats.pageviews?.toLocaleString() || 0}</BigNumber>
          <MetaText>{rangeLabel}</MetaText>
        </Panel>
        <Panel>
          <PanelTitle>Range Visitors</PanelTitle>
          <BigNumber $color={AT.cyan}>{rangeStats.uniqueVisitors?.toLocaleString() || 0}</BigNumber>
          <MetaText>{rangeLabel}</MetaText>
        </Panel>
        <Panel>
          <PanelTitle>Range Sessions</PanelTitle>
          <BigNumber>{rangeStats.uniqueSessions?.toLocaleString() || 0}</BigNumber>
          <MetaText>{rangeLabel}</MetaText>
        </Panel>
        <Panel>
          <PanelTitle>Avg Time on Page</PanelTitle>
          <BigNumber $color={AT.purple}>{rangeStats.avgTimeOnPage || 0}s</BigNumber>
          <MetaText>{rangeLabel}</MetaText>
        </Panel>
      </PanelGrid>

      <PanelGrid $cols="1fr 1fr">
        <Panel $span={2}>
          <PanelTitle>{rangeTitle} Traffic Trend</PanelTitle>
          {sparkData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={sparkData}>
                <defs>
                  <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={AT.cyan} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={AT.cyan} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="visitorsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={AT.purple} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={AT.purple} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={AT.border} />
                <XAxis dataKey="label" tick={{ fill: AT.textDim, fontSize: 10 }} axisLine={{ stroke: AT.border }} />
                <YAxis tick={{ fill: AT.textDim, fontSize: 10 }} axisLine={{ stroke: AT.border }} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="views" name="Views" stroke={AT.cyan} fill="url(#viewsGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="visitors" name="Visitors" stroke={AT.purple} fill="url(#visitorsGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyMsg>No traffic data yet</EmptyMsg>
          )}
        </Panel>
      </PanelGrid>

      <PanelGrid $cols="repeat(3, 1fr)">
        <Panel>
          <PanelTitle>30-Day Views</PanelTitle>
          <BigNumber>{data.month?.pageviews?.toLocaleString() || 0}</BigNumber>
        </Panel>
        <Panel>
          <PanelTitle>30-Day Visitors</PanelTitle>
          <BigNumber $color={AT.cyan}>{data.month?.uniqueVisitors?.toLocaleString() || 0}</BigNumber>
        </Panel>
        <Panel>
          <PanelTitle>30-Day Sessions</PanelTitle>
          <BigNumber>{data.month?.uniqueSessions?.toLocaleString() || 0}</BigNumber>
        </Panel>
      </PanelGrid>
    </DashContainer>
  );
};

// ===== CONTENT VIEW =====
const ContentView = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rangeValue, setRangeValue] = useState(30);
  const [rangeUnit, setRangeUnit] = useState('days');
  const [activePreset, setActivePreset] = useState('30d');

  const handlePreset = (preset) => {
    setActivePreset(preset.id);
    setRangeValue(preset.range);
    setRangeUnit(preset.unit);
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ range: rangeValue, unit: rangeUnit });
      const response = await adminGet(`/api/v1/admin/analytics/content?${params.toString()}`);
      if (response.success) setData(response.data);
    } catch (error) {
      console.error('[ANALYTICS] Content error:', error);
    } finally {
      setLoading(false);
    }
  }, [rangeValue, rangeUnit]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <LoadingMsg>Loading content analytics...</LoadingMsg>;
  if (!data) return <EmptyMsg>No content data available</EmptyMsg>;

  const pieData = data.typePerformance?.map(t => ({
    name: t.page_type,
    value: t.views
  })) || [];

  return (
    <DashContainer>
      <TimePresets activePreset={activePreset} onSelect={handlePreset} />
      <ControlsRow>
        <DarkButton onClick={fetchData}>Refresh</DarkButton>
      </ControlsRow>

      <PanelGrid $cols="2fr 1fr">
        <Panel>
          <PanelTitle>Top Playlists</PanelTitle>
          {data.topPlaylists?.length === 0 ? (
            <EmptyMsg>No playlist data</EmptyMsg>
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <Th>Playlist</Th>
                  <Th>Views</Th>
                  <Th>Visitors</Th>
                  <Th>Avg Time</Th>
                  <Th>Scroll</Th>
                </tr>
              </thead>
              <tbody>
                {data.topPlaylists?.map((p, i) => (
                  <tr key={i}>
                    <Td title={p.page_path}>{p.page_path?.replace('/playlist/', '').replace(/-/g, ' ') || p.resource_id}</Td>
                    <Td style={{ color: AT.cyan }}>{p.views?.toLocaleString()}</Td>
                    <Td>{p.unique_visitors?.toLocaleString()}</Td>
                    <Td>{Math.round(p.avg_time || 0)}s</Td>
                    <Td>{Math.round(p.avg_scroll || 0)}%</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Panel>

        <Panel>
          <PanelTitle>Content Type Breakdown</PanelTitle>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  formatter={(value) => <span style={{ color: AT.textMuted, fontSize: 10 }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyMsg>No type data</EmptyMsg>
          )}
        </Panel>
      </PanelGrid>

      <PanelGrid $cols="1fr 1fr">
        <Panel>
          <PanelTitle>Top Curators</PanelTitle>
          {data.topCurators?.length === 0 ? (
            <EmptyMsg>No curator data</EmptyMsg>
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <Th>Curator</Th>
                  <Th>Views</Th>
                  <Th>Visitors</Th>
                  <Th>Avg Time</Th>
                </tr>
              </thead>
              <tbody>
                {data.topCurators?.map((c, i) => (
                  <tr key={i}>
                    <Td title={c.page_path}>{c.page_path?.split('/').pop() || c.resource_id}</Td>
                    <Td style={{ color: AT.purple }}>{c.views?.toLocaleString()}</Td>
                    <Td>{c.unique_visitors?.toLocaleString()}</Td>
                    <Td>{Math.round(c.avg_time || 0)}s</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Panel>

        <Panel>
          <PanelTitle>Trending Content (7d vs prior 7d)</PanelTitle>
          {data.trending?.length === 0 ? (
            <EmptyMsg>No trending data</EmptyMsg>
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <Th>Page</Th>
                  <Th>Type</Th>
                  <Th>Growth</Th>
                  <Th>Views</Th>
                </tr>
              </thead>
              <tbody>
                {data.trending?.map((t, i) => (
                  <tr key={i}>
                    <Td title={t.page_path}>{t.page_path?.split('/').pop()?.replace(/-/g, ' ') || t.resource_id}</Td>
                    <Td><TypeBadge $type={t.page_type}>{t.page_type}</TypeBadge></Td>
                    <Td>
                      <TrendBadge $positive={t.growth_pct > 0}>
                        {t.growth_pct > 0 ? '+' : ''}{t.growth_pct}%
                      </TrendBadge>
                    </Td>
                    <Td>{t.recent_views}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Panel>
      </PanelGrid>

      {data.typePerformance?.length > 0 && (
        <Panel>
          <PanelTitle>Content Type Performance</PanelTitle>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.typePerformance}>
              <CartesianGrid strokeDasharray="3 3" stroke={AT.border} />
              <XAxis dataKey="page_type" tick={{ fill: AT.textDim, fontSize: 10 }} axisLine={{ stroke: AT.border }} />
              <YAxis tick={{ fill: AT.textDim, fontSize: 10 }} axisLine={{ stroke: AT.border }} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="views" name="Views" fill={AT.cyan} radius={[3, 3, 0, 0]} />
              <Bar dataKey="unique_visitors" name="Visitors" fill={AT.purple} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      )}
    </DashContainer>
  );
};

// ===== JOURNEYS VIEW =====
const JourneysView = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rangeValue, setRangeValue] = useState(7);
  const [rangeUnit, setRangeUnit] = useState('days');
  const [activePreset, setActivePreset] = useState('7d');

  const handlePreset = (preset) => {
    setActivePreset(preset.id);
    setRangeValue(preset.range);
    setRangeUnit(preset.unit);
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ range: rangeValue, unit: rangeUnit });
      const response = await adminGet(`/api/v1/admin/analytics/journeys?${params.toString()}`);
      if (response.success) setData(response.data);
    } catch (error) {
      console.error('[ANALYTICS] Journeys error:', error);
    } finally {
      setLoading(false);
    }
  }, [rangeValue, rangeUnit]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <LoadingMsg>Analyzing session patterns...</LoadingMsg>;
  if (!data) return <EmptyMsg>No journey data available</EmptyMsg>;

  const maxPatternCount = data.topPatterns?.[0]?.count || 1;

  const depthData = data.sessionDepth?.map(d => ({
    name: d.depth,
    sessions: d.sessions
  })) || [];

  return (
    <DashContainer>
      <TimePresets activePreset={activePreset} onSelect={handlePreset} />
      <ControlsRow>
        <DarkButton onClick={fetchData}>Refresh</DarkButton>
        <MetaText style={{ marginLeft: 'auto' }}>
          {data.totalSessions?.toLocaleString()} multi-page sessions analyzed
        </MetaText>
      </ControlsRow>

      <PanelGrid $cols="3fr 1fr">
        <Panel>
          <PanelTitle>Top Session Patterns</PanelTitle>
          {data.topPatterns?.length === 0 ? (
            <EmptyMsg>No session patterns yet</EmptyMsg>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {data.topPatterns?.slice(0, 12).map((p, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <JourneyPath>
                      {p.steps.map((step, si) => (
                        <span key={si} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {si > 0 && <JourneyArrow>-&gt;</JourneyArrow>}
                          <JourneyStep $type={step}>{step}</JourneyStep>
                        </span>
                      ))}
                    </JourneyPath>
                    <span style={{ fontFamily: theme.fonts.mono, fontSize: 11, color: AT.cyan, whiteSpace: 'nowrap', marginLeft: 8 }}>
                      {p.count}x
                    </span>
                  </div>
                  <FreqBar $pct={(p.count / maxPatternCount) * 100} />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <PanelTitle>Session Depth</PanelTitle>
          {depthData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={depthData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="sessions"
                >
                  {depthData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  formatter={(value) => <span style={{ color: AT.textMuted, fontSize: 10 }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyMsg>No depth data</EmptyMsg>
          )}
        </Panel>
      </PanelGrid>

      <PanelGrid $cols="1fr 1fr">
        <Panel>
          <PanelTitle>Entry Pages (First Page Visited)</PanelTitle>
          {data.entryPages?.length === 0 ? (
            <EmptyMsg>No entry data</EmptyMsg>
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <Th>Page</Th>
                  <Th>Type</Th>
                  <Th>Entries</Th>
                </tr>
              </thead>
              <tbody>
                {data.entryPages?.map((p, i) => (
                  <tr key={i}>
                    <Td title={p.page_path}>{p.page_path}</Td>
                    <Td><TypeBadge $type={p.page_type}>{p.page_type}</TypeBadge></Td>
                    <Td style={{ color: AT.green }}>{p.entries?.toLocaleString()}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Panel>

        <Panel>
          <PanelTitle>Exit Pages (Last Page Before Leaving)</PanelTitle>
          {data.exitPages?.length === 0 ? (
            <EmptyMsg>No exit data</EmptyMsg>
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <Th>Page</Th>
                  <Th>Exits</Th>
                  <Th>Avg Time</Th>
                </tr>
              </thead>
              <tbody>
                {data.exitPages?.map((p, i) => (
                  <tr key={i}>
                    <Td title={p.page_path}>{p.page_path}</Td>
                    <Td style={{ color: AT.red }}>{p.exits?.toLocaleString()}</Td>
                    <Td>{Math.round(p.avg_time_before_exit || 0)}s</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Panel>
      </PanelGrid>
    </DashContainer>
  );
};

// ===== ACQUISITION VIEW =====
const AcquisitionView = () => {
  const [data, setData] = useState(null);
  const [traffic, setTraffic] = useState(null);
  const [geo, setGeo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rangeValue, setRangeValue] = useState(14);
  const [rangeUnit, setRangeUnit] = useState('days');
  const [activePreset, setActivePreset] = useState('14d');

  const handlePreset = (preset) => {
    setActivePreset(preset.id);
    setRangeValue(preset.range);
    setRangeUnit(preset.unit);
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ range: rangeValue, unit: rangeUnit });
      const qs = params.toString();
      const [sourcesRes, trafficRes, geoRes] = await Promise.all([
        adminGet(`/api/v1/admin/analytics/sources?${qs}`),
        adminGet(`/api/v1/admin/analytics/traffic?${qs}`),
        adminGet(`/api/v1/admin/analytics/geography?${qs}`)
      ]);
      if (sourcesRes.success) setData(sourcesRes.data);
      if (trafficRes.success) setTraffic(trafficRes.data);
      if (geoRes.success) setGeo(geoRes.data);
    } catch (error) {
      console.error('[ANALYTICS] Acquisition error:', error);
    } finally {
      setLoading(false);
    }
  }, [rangeValue, rangeUnit]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <LoadingMsg>Loading acquisition data...</LoadingMsg>;

  const trafficData = traffic?.daily?.map(d => ({
    date: d.date?.slice(5),
    views: d.pageviews,
    visitors: d.unique_visitors,
    sessions: d.sessions
  })) || [];

  const deviceData = data?.devices?.map(d => ({
    name: d.device_type || 'unknown',
    value: d.views
  })) || [];

  const referrerData = data?.referrers?.slice(0, 10).map(r => ({
    name: r.referrer_domain || 'direct',
    views: r.views,
    visitors: r.unique_visitors
  })) || [];

  return (
    <DashContainer>
      <TimePresets activePreset={activePreset} onSelect={handlePreset} />
      <ControlsRow>
        <DarkButton onClick={fetchData}>Refresh</DarkButton>
      </ControlsRow>

      <Panel>
        <PanelTitle>Traffic Over Time</PanelTitle>
        {trafficData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trafficData}>
              <defs>
                <linearGradient id="acqViewsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={AT.cyan} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={AT.cyan} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={AT.border} />
              <XAxis dataKey="date" tick={{ fill: AT.textDim, fontSize: 10 }} axisLine={{ stroke: AT.border }} />
              <YAxis tick={{ fill: AT.textDim, fontSize: 10 }} axisLine={{ stroke: AT.border }} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="views" name="Views" stroke={AT.cyan} fill="url(#acqViewsGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="visitors" name="Visitors" stroke={AT.purple} fill="transparent" strokeWidth={1.5} strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyMsg>No traffic data</EmptyMsg>
        )}
      </Panel>

      <PanelGrid $cols="2fr 1fr">
        <Panel>
          <PanelTitle>Traffic Sources</PanelTitle>
          {referrerData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={referrerData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={AT.border} />
                <XAxis type="number" tick={{ fill: AT.textDim, fontSize: 10 }} axisLine={{ stroke: AT.border }} />
                <YAxis type="category" dataKey="name" tick={{ fill: AT.textMuted, fontSize: 10 }} width={100} axisLine={{ stroke: AT.border }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="views" name="Views" fill={AT.cyan} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyMsg>No referrer data</EmptyMsg>
          )}
        </Panel>

        <Panel>
          <PanelTitle>Devices</PanelTitle>
          {deviceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={deviceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {deviceData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend formatter={(value) => <span style={{ color: AT.textMuted, fontSize: 10 }}>{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyMsg>No device data</EmptyMsg>
          )}
        </Panel>
      </PanelGrid>

      <PanelGrid $cols="1fr 1fr">
        <Panel>
          <PanelTitle>Geography</PanelTitle>
          {geo?.countries?.length === 0 ? (
            <EmptyMsg>No geography data</EmptyMsg>
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <Th>Country</Th>
                  <Th>Views</Th>
                  <Th>Visitors</Th>
                  <Th>%</Th>
                </tr>
              </thead>
              <tbody>
                {geo?.countries?.slice(0, 12).map((c, i) => (
                  <tr key={i}>
                    <Td>{c.country_code || 'Unknown'}</Td>
                    <Td>{c.views?.toLocaleString()}</Td>
                    <Td>{c.unique_visitors?.toLocaleString()}</Td>
                    <Td style={{ color: AT.cyan }}>
                      {geo.totals?.views > 0 ? ((c.views / geo.totals.views) * 100).toFixed(1) : 0}%
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Panel>

        <Panel>
          <PanelTitle>Browsers</PanelTitle>
          {data?.browsers?.length === 0 ? (
            <EmptyMsg>No browser data</EmptyMsg>
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <Th>Browser</Th>
                  <Th>Views</Th>
                  <Th>Visitors</Th>
                </tr>
              </thead>
              <tbody>
                {data?.browsers?.slice(0, 8).map((b, i) => (
                  <tr key={i}>
                    <Td>{b.browser_family}</Td>
                    <Td>{b.views?.toLocaleString()}</Td>
                    <Td>{b.unique_visitors?.toLocaleString()}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Panel>
      </PanelGrid>

      {data?.utmSources?.length > 0 && (
        <Panel>
          <PanelTitle>UTM Campaigns</PanelTitle>
          <DataTable>
            <thead>
              <tr>
                <Th>Source</Th>
                <Th>Medium</Th>
                <Th>Campaign</Th>
                <Th>Views</Th>
                <Th>Visitors</Th>
              </tr>
            </thead>
            <tbody>
              {data.utmSources.slice(0, 10).map((u, i) => (
                <tr key={i}>
                  <Td>{u.utm_source}</Td>
                  <Td>{u.utm_medium || '-'}</Td>
                  <Td>{u.utm_campaign || '-'}</Td>
                  <Td>{u.views?.toLocaleString()}</Td>
                  <Td>{u.unique_visitors?.toLocaleString()}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Panel>
      )}
    </DashContainer>
  );
};

// ===== BEHAVIOR VIEW =====
const BehaviorView = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rangeValue, setRangeValue] = useState(7);
  const [rangeUnit, setRangeUnit] = useState('days');
  const [activePreset, setActivePreset] = useState('7d');

  const handlePreset = (preset) => {
    setActivePreset(preset.id);
    setRangeValue(preset.range);
    setRangeUnit(preset.unit);
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ range: rangeValue, unit: rangeUnit });
      const response = await adminGet(`/api/v1/admin/analytics/behavior?${params.toString()}`);
      if (response.success) setData(response.data);
    } catch (error) {
      console.error('[ANALYTICS] Behavior error:', error);
    } finally {
      setLoading(false);
    }
  }, [rangeValue, rangeUnit]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <LoadingMsg>Loading behavior data...</LoadingMsg>;
  if (!data) return <EmptyMsg>No behavior data available</EmptyMsg>;

  const scrollData = data.scrollDepth?.map(d => ({
    range: d.range,
    count: d.count,
    avgTime: Math.round(d.avg_time || 0)
  })) || [];

  const timeData = data.timeDistribution?.map(d => ({
    range: d.range,
    count: d.count
  })) || [];

  const deviceData = data.deviceEngagement?.map(d => ({
    device: d.device_type || 'unknown',
    avgTime: Math.round(d.avg_time || 0),
    avgScroll: Math.round(d.avg_scroll || 0),
    count: d.exits
  })) || [];

  const bounceData = data.bounceByType?.map(d => ({
    type: d.page_type,
    bounceRate: d.total_entries > 0 ? Math.round((d.bounced / d.total_entries) * 100) : 0,
    entries: d.total_entries
  })) || [];

  const hourlyData = Array.from({ length: 24 }, (_, i) => {
    const found = data.hourlyEngagement?.find(h => h.hour === i);
    return {
      hour: `${String(i).padStart(2, '0')}:00`,
      avgTime: Math.round(found?.avg_time || 0),
      avgScroll: Math.round(found?.avg_scroll || 0),
      events: found?.events || 0
    };
  });

  // Compute insight cards
  const mobileDevice = data.deviceEngagement?.find(d => d.device_type === 'mobile');
  const desktopDevice = data.deviceEngagement?.find(d => d.device_type === 'desktop');
  const scrollGap = mobileDevice && desktopDevice
    ? Math.round((desktopDevice.avg_scroll || 0) - (mobileDevice.avg_scroll || 0))
    : null;
  const timeGap = mobileDevice && desktopDevice
    ? Math.round((desktopDevice.avg_time || 0) - (mobileDevice.avg_time || 0))
    : null;

  return (
    <DashContainer>
      <TimePresets activePreset={activePreset} onSelect={handlePreset} />
      <ControlsRow>
        <DarkButton onClick={fetchData}>Refresh</DarkButton>
      </ControlsRow>

      {(scrollGap !== null || timeGap !== null) && (
        <PanelGrid $cols="repeat(auto-fit, minmax(200px, 1fr))">
          {scrollGap !== null && (
            <InsightCard $color={scrollGap > 10 ? AT.amberDim : AT.greenDim}>
              <InsightLabel>Mobile vs Desktop Scroll</InsightLabel>
              <InsightValue>
                {scrollGap > 0 ? `Desktop scrolls ${scrollGap}% more` : `Mobile scrolls ${Math.abs(scrollGap)}% more`}
              </InsightValue>
            </InsightCard>
          )}
          {timeGap !== null && (
            <InsightCard $color={timeGap > 15 ? AT.amberDim : AT.greenDim}>
              <InsightLabel>Mobile vs Desktop Time</InsightLabel>
              <InsightValue>
                {timeGap > 0 ? `Desktop stays ${timeGap}s longer` : `Mobile stays ${Math.abs(timeGap)}s longer`}
              </InsightValue>
            </InsightCard>
          )}
          {data.scrollDepth?.length > 0 && (
            <InsightCard $color={AT.blueDim}>
              <InsightLabel>Deep Scrollers (75%+)</InsightLabel>
              <InsightValue>
                {data.scrollDepth.find(d => d.range === '75-100%')?.count?.toLocaleString() || 0} sessions
              </InsightValue>
            </InsightCard>
          )}
        </PanelGrid>
      )}

      <PanelGrid $cols="1fr 1fr">
        <Panel>
          <PanelTitle>Scroll Depth Distribution</PanelTitle>
          {scrollData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={scrollData}>
                <CartesianGrid strokeDasharray="3 3" stroke={AT.border} />
                <XAxis dataKey="range" tick={{ fill: AT.textDim, fontSize: 10 }} axisLine={{ stroke: AT.border }} />
                <YAxis tick={{ fill: AT.textDim, fontSize: 10 }} axisLine={{ stroke: AT.border }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Sessions" fill={AT.cyan} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyMsg>No scroll data</EmptyMsg>
          )}
        </Panel>

        <Panel>
          <PanelTitle>Time on Page Distribution</PanelTitle>
          {timeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={timeData}>
                <CartesianGrid strokeDasharray="3 3" stroke={AT.border} />
                <XAxis dataKey="range" tick={{ fill: AT.textDim, fontSize: 10 }} axisLine={{ stroke: AT.border }} />
                <YAxis tick={{ fill: AT.textDim, fontSize: 10 }} axisLine={{ stroke: AT.border }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Sessions" fill={AT.purple} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyMsg>No time data</EmptyMsg>
          )}
        </Panel>
      </PanelGrid>

      <PanelGrid $cols="1fr 1fr">
        <Panel>
          <PanelTitle>Device Engagement</PanelTitle>
          {deviceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={deviceData}>
                <CartesianGrid strokeDasharray="3 3" stroke={AT.border} />
                <XAxis dataKey="device" tick={{ fill: AT.textDim, fontSize: 10 }} axisLine={{ stroke: AT.border }} />
                <YAxis tick={{ fill: AT.textDim, fontSize: 10 }} axisLine={{ stroke: AT.border }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="avgTime" name="Avg Time (s)" fill={AT.cyan} radius={[3, 3, 0, 0]} />
                <Bar dataKey="avgScroll" name="Avg Scroll %" fill={AT.purple} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyMsg>No device data</EmptyMsg>
          )}
        </Panel>

        <Panel>
          <PanelTitle>Bounce Rate by Page Type</PanelTitle>
          {bounceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={bounceData}>
                <CartesianGrid strokeDasharray="3 3" stroke={AT.border} />
                <XAxis dataKey="type" tick={{ fill: AT.textDim, fontSize: 10 }} axisLine={{ stroke: AT.border }} />
                <YAxis tick={{ fill: AT.textDim, fontSize: 10 }} axisLine={{ stroke: AT.border }} domain={[0, 100]} unit="%" />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="bounceRate" name="Bounce Rate %" fill={AT.amber} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyMsg>No bounce data</EmptyMsg>
          )}
        </Panel>
      </PanelGrid>

      <Panel>
        <PanelTitle>Hourly Engagement Pattern</PanelTitle>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={hourlyData}>
            <defs>
              <linearGradient id="hourlyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={AT.green} stopOpacity={0.3} />
                <stop offset="95%" stopColor={AT.green} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={AT.border} />
            <XAxis dataKey="hour" tick={{ fill: AT.textDim, fontSize: 9 }} axisLine={{ stroke: AT.border }} interval={2} />
            <YAxis tick={{ fill: AT.textDim, fontSize: 10 }} axisLine={{ stroke: AT.border }} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="avgTime" name="Avg Time (s)" stroke={AT.green} fill="url(#hourlyGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>
    </DashContainer>
  );
};

// ===== MAIN ANALYTICS TAB =====
const AnalyticsTab = () => {
  const tabs = [
    { id: 'live', label: 'Live', content: <LiveView /> },
    { id: 'overview', label: 'Overview', content: <OverviewView /> },
    { id: 'content', label: 'Content', content: <ContentView /> },
    { id: 'journeys', label: 'Journeys', content: <JourneysView /> },
    { id: 'acquisition', label: 'Acquisition', content: <AcquisitionView /> },
    { id: 'behavior', label: 'Behavior', content: <BehaviorView /> },
    { id: 'priorities', label: 'Priorities', content: <PrioritiesView /> },
  ];

  return <SubTabNavigation tabs={tabs} defaultTab="overview" />;
};

export default AnalyticsTab;
