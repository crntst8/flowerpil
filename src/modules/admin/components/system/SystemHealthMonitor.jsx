import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import styled from 'styled-components';
import { theme, Button } from '@shared/styles/GlobalStyles';
import { adminGet, adminPost } from '../../utils/adminApi';
import { StatusMessage, EmptyState } from '../shared';

const SectionCard = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  background: ${theme.colors.fpwhite};
  border-radius: 10px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.14);
  padding: clamp(${theme.spacing.sm}, 0.5vw, ${theme.spacing.lg});
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.04);
`;

const SectionHeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
`;

const SectionHeader = styled.h3`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const SectionHeaderActions = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
`;

const HealthSummaryRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
`;

const HealthStatusBadge = styled.span.withConfig({ shouldForwardProp: (prop) => prop !== '$status' })`
  display: inline-flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border-radius: 999px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: ${({ $status }) => {
    if ($status === 'critical') return 'rgba(220, 53, 69, 0.1)';
    if ($status === 'warning') return 'rgba(255, 193, 7, 0.12)';
    return 'rgba(33, 150, 243, 0.12)';
  }};
  color: ${({ $status }) => {
    if ($status === 'critical') return theme.colors.error;
    if ($status === 'warning') return theme.colors.warning;
    return theme.colors.success;
  }};
  border: ${theme.borders.dashedThin} ${({ $status }) => {
    if ($status === 'critical') return theme.colors.error;
    if ($status === 'warning') return theme.colors.warning;
    return theme.colors.success;
  }};
`;

const HealthMeta = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
`;

const HealthMetricsGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.sm};
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
`;

const HealthMetricCard = styled.div`
  padding: ${theme.spacing.sm};
  border-radius: 10px;
  border: ${theme.borders.dashedThin} rgba(0, 0, 0, 0.15);
  background: rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const HealthMetricLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  color: ${theme.colors.black};
`;

const HealthMetricValue = styled.span`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h4};
  font-weight: ${theme.fontWeights.bold};
  color: ${theme.colors.black};
`;

const HealthMetricMeta = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
`;

const AlertList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const AlertCard = styled.div.withConfig({ shouldForwardProp: (prop) => prop !== '$severity' })`
  border-radius: 12px;
  border: ${theme.borders.solidThin} ${({ $severity }) => {
    if ($severity === 'critical') return 'rgba(220, 53, 69, 0.35)';
    if ($severity === 'warning') return 'rgba(255, 193, 7, 0.45)';
    return 'rgba(76, 175, 80, 0.35)';
  }};
  background: ${({ $severity }) => {
    if ($severity === 'critical') return 'rgba(220, 53, 69, 0.08)';
    if ($severity === 'warning') return 'rgba(255, 193, 7, 0.08)';
    return 'rgba(76, 175, 80, 0.08)';
  }};
  padding: ${theme.spacing.sm};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const AlertTitle = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.large};
  font-weight: ${theme.fontWeights.bold};
  display: flex;
  justify-content: space-between;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
`;

const AlertTimestamp = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
`;

const AlertInstructions = styled.ol`
  margin: 0;
  padding-left: 1.2rem;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  li {
    margin-bottom: ${theme.spacing.xs};
  }
`;

const AutomationActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.sm};
  align-items: center;
`;

const AutomationLog = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
`;

const HealthLogsTable = styled.div`
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.15);
  border-radius: 10px;
  overflow: hidden;
`;

const HealthLogHeader = styled.div`
  display: grid;
  grid-template-columns: 1fr minmax(80px, 0.5fr) minmax(140px, 1fr) minmax(160px, 1fr);
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm};
  background: rgba(0, 0, 0, 0.04);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;

  @media (max-width: ${theme.breakpoints.tablet}) {
    display: none;
  }
`;

const HealthLogRow = styled.div`
  display: grid;
  grid-template-columns: 1fr minmax(80px, 0.5fr) minmax(140px, 1fr) minmax(160px, 1fr);
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  border-bottom: ${theme.borders.solidThin} rgba(0, 0, 0, 0.06);

  &:nth-child(even) {
    background: rgba(0, 0, 0, 0.02);
  }

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
    gap: ${theme.spacing.xs};
    padding: ${theme.spacing.md};
    border-radius: 8px;
    margin-bottom: ${theme.spacing.xs};
    background: rgba(0, 0, 0, 0.03) !important;
    border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  }
`;

const StatusTag = styled.span.withConfig({ shouldForwardProp: (prop) => prop !== '$status' })`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 6px;
  border-radius: 6px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: ${({ $status }) => {
    if ($status === 'fail' || $status === 'error') return 'rgba(220, 53, 69, 0.18)';
    if ($status === 'warn' || $status === 'skipped') return 'rgba(255, 193, 7, 0.2)';
    if ($status === 'applied' || $status === 'pass') return 'rgba(76, 175, 80, 0.18)';
    return 'rgba(33, 150, 243, 0.18)';
  }};
  color: ${({ $status }) => {
    if ($status === 'fail' || $status === 'error') return theme.colors.error;
    if ($status === 'warn' || $status === 'skipped') return theme.colors.warning;
    if ($status === 'applied' || $status === 'pass') return theme.colors.success;
    return theme.colors.black;
  }};
`;

const SectionDivider = styled.hr`
  border: none;
  border-top: ${theme.borders.solidThin} rgba(0, 0, 0, 0.08);
`;

const SystemHealthMonitor = ({ onStatusChange }) => {
  const [systemHealth, setSystemHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState('');
  const [healthActionBusy, setHealthActionBusy] = useState(false);
  const healthIntervalRef = useRef(null);

  const formatDateTime = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatLatency = useCallback((value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '—';
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}s`;
    }
    return `${Math.round(value)}ms`;
  }, []);

  const refreshSystemHealth = useCallback(async () => {
    try {
      const snapshot = await adminGet('/api/v1/admin/site-admin/system-health');
      setSystemHealth(snapshot);
      setHealthError('');
    } catch (error) {
      setHealthError(error.message || 'Unable to load health data');
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSystemHealth();
    const interval = setInterval(() => {
      refreshSystemHealth();
    }, 60000);
    healthIntervalRef.current = interval;
    return () => {
      clearInterval(interval);
    };
  }, [refreshSystemHealth]);

  const healthStatusSummary = useMemo(() => {
    if (!systemHealth) {
      return { status: 'warning', label: 'Collecting data' };
    }
    const activeAlerts = systemHealth.activeAlerts || [];
    const hasCritical = activeAlerts.some(alert => alert.severity === 'critical');
    const hasAlerts = activeAlerts.length > 0;
    if (hasCritical) {
      return { status: 'critical', label: 'Immediate attention required' };
    }
    if (hasAlerts) {
      return { status: 'warning', label: 'Degraded, monitor closely' };
    }
    return { status: 'good', label: 'All systems nominal' };
  }, [systemHealth]);

  const healthHighlights = useMemo(() => {
    if (!systemHealth) return [];
    const highlights = [];
    const windows = systemHealth.metrics?.windows || {};
    const win5 = windows['5m'] || {};
    if (win5.public?.requestCount) {
      highlights.push({
        key: 'public-p95',
        label: 'Public p95 latency',
        value: formatLatency(win5.public.p95LatencyMs),
        meta: `${win5.public.requestCount} req in 5m`
      });
    }
    if (win5.curator?.requestCount) {
      highlights.push({
        key: 'curator-p95',
        label: 'Curator p95 latency',
        value: formatLatency(win5.curator.p95LatencyMs),
        meta: `${win5.curator.requestCount} req in 5m`
      });
    }
    const contentQuality = systemHealth.signals?.contentQuality;
    if (contentQuality) {
      const dspCoverage = contentQuality.dspGapRatio !== null && contentQuality.dspGapRatio !== undefined
        ? `${Math.max(0, (1 - contentQuality.dspGapRatio) * 100).toFixed(1)}%`
        : '—';
      highlights.push({
        key: 'dsp-coverage',
        label: 'DSP coverage',
        value: dspCoverage,
        meta: `${contentQuality.tracksMissingDSP || 0} tracks missing links`
      });
      const previewCoverage = contentQuality.previewGapRatio !== null && contentQuality.previewGapRatio !== undefined
        ? `${Math.max(0, (1 - contentQuality.previewGapRatio) * 100).toFixed(1)}%`
        : '—';
      highlights.push({
        key: 'preview-coverage',
        label: 'Preview coverage',
        value: previewCoverage,
        meta: `${contentQuality.tracksMissingPreview || 0} tracks missing previews`
      });
    }
    const backlog = systemHealth.signals?.backlog;
    if (backlog) {
      highlights.push({
        key: 'imports-due',
        label: 'Overdue imports',
        value: backlog.overdueImports ?? 0,
        meta: `${backlog.staleImportLocks || 0} stale lock(s)`
      });
      highlights.push({
        key: 'failed-exports',
        label: 'Export queue issues',
        value: backlog.failedExports ?? 0,
        meta: `${backlog.stuckExports || 0} stuck`
      });
    }
    if (systemHealth.signals?.unresolvedFlags !== null && systemHealth.signals?.unresolvedFlags !== undefined) {
      highlights.push({
        key: 'unresolved-flags',
        label: 'Unresolved user flags',
        value: systemHealth.signals.unresolvedFlags,
        meta: 'Pending moderation'
      });
    }
    return highlights;
  }, [systemHealth, formatLatency]);

  const handleRunHealthDiagnostic = async () => {
    setHealthActionBusy(true);
    try {
      const response = await adminPost('/api/v1/admin/site-admin/system-health/run-diagnostic', {});
      if (response?.snapshot) {
        setSystemHealth(response.snapshot);
      }
      onStatusChange?.('success', 'Diagnostics completed');
    } catch (error) {
      onStatusChange?.('error', `Diagnostics failed: ${error.message}`);
    } finally {
      setHealthActionBusy(false);
    }
  };

  const handleAutomationTrigger = async (actionKey) => {
    if (!actionKey) return;
    setHealthActionBusy(true);
    try {
      const response = await adminPost('/api/v1/admin/site-admin/system-health/automation', { actionKey });
      if (response?.snapshot) {
        setSystemHealth(response.snapshot);
      }
      const detailMessage = response?.result?.detail || 'Automation executed';
      onStatusChange?.('success', detailMessage);
    } catch (error) {
      onStatusChange?.('error', `Automation failed: ${error.message}`);
    } finally {
      setHealthActionBusy(false);
    }
  };

  return (
    <SectionCard>
      <SectionHeaderRow>
        <SectionHeader>System Health & Alerts</SectionHeader>
        <SectionHeaderActions>
          <Button
            size="tiny"
            variant="secondary"
            disabled={healthLoading}
            onClick={refreshSystemHealth}
          >
            Refresh
          </Button>
          <Button
            size="tiny"
            onClick={handleRunHealthDiagnostic}
            disabled={healthActionBusy || healthLoading}
          >
            Run Diagnostics
          </Button>
        </SectionHeaderActions>
      </SectionHeaderRow>

      {healthLoading ? (
        <EmptyState message="Loading system health..." />
      ) : systemHealth ? (
        <>
          {healthError ? (
            <StatusMessage type="error" message={healthError} />
          ) : null}

          <HealthSummaryRow>
            <HealthStatusBadge $status={healthStatusSummary.status}>
              {healthStatusSummary.label}
            </HealthStatusBadge>
            <HealthMeta>
              Updated {formatDateTime(systemHealth.generatedAt)}
            </HealthMeta>
          </HealthSummaryRow>

          {healthHighlights.length ? (
            <HealthMetricsGrid>
              {healthHighlights.map(highlight => (
                <HealthMetricCard key={highlight.key}>
                  <HealthMetricLabel>{highlight.label}</HealthMetricLabel>
                  <HealthMetricValue>{highlight.value}</HealthMetricValue>
                  {highlight.meta ? (
                    <HealthMetricMeta>{highlight.meta}</HealthMetricMeta>
                  ) : null}
                </HealthMetricCard>
              ))}
            </HealthMetricsGrid>
          ) : null}

          <SectionDivider />
          <SectionHeaderRow>
            <SectionHeader>Active Alerts</SectionHeader>
          </SectionHeaderRow>
          <AlertList>
            {(systemHealth.activeAlerts || []).length === 0 ? (
              <EmptyState message="All clear – no alerts." icon="✓" />
            ) : (
              (systemHealth.activeAlerts || []).map(alert => (
                <AlertCard key={alert.id} $severity={alert.severity}>
                  <AlertTitle>
                    <span>{alert.title}</span>
                    <AlertTimestamp>
                      Since {formatDateTime(alert.startedAt)}
                    </AlertTimestamp>
                  </AlertTitle>
                  <div>{alert.message}</div>
                  {alert.instructions?.length ? (
                    <AlertInstructions>
                      {alert.instructions.map((step, index) => (
                        <li key={index}>{step}</li>
                      ))}
                    </AlertInstructions>
                  ) : null}
                </AlertCard>
              ))
            )}
          </AlertList>

          <SectionDivider />
          <SectionHeaderRow>
            <SectionHeader>First-aid Automation</SectionHeader>
          </SectionHeaderRow>
          <AutomationActions>
            {(systemHealth.automation?.availableActions || []).map(action => (
              <Button
                key={action.key}
                size="tiny"
                variant="secondary"
                onClick={() => handleAutomationTrigger(action.key)}
                disabled={healthActionBusy}
              >
                {action.label}
              </Button>
            ))}
            {healthActionBusy ? <HealthMeta>Working…</HealthMeta> : null}
          </AutomationActions>
          {(systemHealth.automation?.recent || []).length ? (
            <AutomationLog>
              {(systemHealth.automation?.recent || []).map(entry => (
                <div key={`${entry.actionKey}-${entry.timestamp}`}>
                  <StatusTag $status={entry.status}>
                    {entry.status}
                  </StatusTag>{' '}
                  {entry.actionKey} • {entry.detail} •{' '}
                  {formatDateTime(entry.timestamp)}
                </div>
              ))}
            </AutomationLog>
          ) : (
            <HealthMeta>No automation runs yet.</HealthMeta>
          )}

          <SectionDivider />
          <SectionHeaderRow>
            <SectionHeader>Diagnostics</SectionHeader>
          </SectionHeaderRow>
          {(systemHealth.diagnostics || []).length ? (
            (systemHealth.diagnostics || []).map(entry => (
              <div key={entry.timestamp} style={{ marginBottom: theme.spacing.sm }}>
                <HealthMeta>
                  Ran {formatDateTime(entry.timestamp)} via {entry.trigger}
                </HealthMeta>
                <AutomationActions style={{ gap: theme.spacing.xs }}>
                  {entry.results.map(result => (
                    <StatusTag key={result.key} $status={result.status}>
                      {result.key}: {result.detail}
                    </StatusTag>
                  ))}
                </AutomationActions>
              </div>
            ))
          ) : (
            <HealthMeta>No diagnostics have been recorded yet.</HealthMeta>
          )}

          <SectionDivider />
          <SectionHeaderRow>
            <SectionHeader>Recent Signals</SectionHeader>
          </SectionHeaderRow>
          {(systemHealth.recentMetrics || []).length ? (
            <HealthLogsTable>
              <HealthLogHeader>
                <div>Metric</div>
                <div>Value</div>
                <div>Tags</div>
                <div>Recorded</div>
              </HealthLogHeader>
              {(systemHealth.recentMetrics || []).map(metric => {
                const tagSummary = metric.tags
                  ? Object.entries(metric.tags)
                      .map(([key, value]) => `${key}: ${value}`)
                      .join(' • ')
                  : '—';
                return (
                  <HealthLogRow key={metric.id}>
                    <div>{metric.metricName}</div>
                    <div>{metric.metricValue}</div>
                    <div>{tagSummary}</div>
                    <div>{formatDateTime(metric.timestamp)}</div>
                  </HealthLogRow>
                );
              })}
            </HealthLogsTable>
          ) : (
            <HealthMeta>No recent metric entries.</HealthMeta>
          )}
        </>
      ) : (
        <EmptyState message="Health snapshot unavailable." />
      )}
    </SectionCard>
  );
};

export default SystemHealthMonitor;
