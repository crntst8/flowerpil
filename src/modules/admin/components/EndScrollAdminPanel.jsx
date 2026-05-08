import { useState, useEffect, Suspense, lazy } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { SubTabNavigation, StatusMessage } from './shared';
import { adminGet } from '../utils/adminApi';

const GlobalConfig = lazy(() => import('./endScroll/GlobalConfig'));
const TagBasedConfig = lazy(() => import('./endScroll/TagBasedConfig'));
const PerPlaylistConfig = lazy(() => import('./endScroll/PerPlaylistConfig'));
const AnalyticsView = lazy(() => import('./endScroll/AnalyticsView'));

const LoadingFallback = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.6);
  padding: ${theme.spacing.md};
`;

const SurfaceCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  padding: clamp(${theme.spacing.sm}, 3vw, ${theme.spacing.xl});
  border-radius: 14px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  background: ${theme.colors.fpwhite};
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.06);
`;

const SectionTitle = styled.h2`
  margin: 0;
  font-size: clamp(1.25rem, 2vw, 1.6rem);
  font-family: ${theme.fonts.Primary};
  text-transform: uppercase;
  letter-spacing: -0.9px;
`;

const MetaText = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.58);
  letter-spacing: 0.05em;
`;

/**
 * EndScrollAdminPanel - Main admin interface for end-scroll configuration
 * Provides tabs for global config, tag-based rules, per-playlist overrides, and analytics
 */
const EndScrollAdminPanel = () => {
  const [status, setStatus] = useState({ type: '', message: '' });
  const [configCount, setConfigCount] = useState(0);
  const [analyticsCount, setAnalyticsCount] = useState(0);

  // Fetch counts for display in tab labels
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const response = await adminGet('/api/v1/admin/end-scroll/config');
        const configs = response?.data ?? response;
        if (Array.isArray(configs)) {
          setConfigCount(configs.length);
        }
      } catch (err) {
        console.error('Error fetching config count:', err);
      }
    };

    fetchCounts();
  }, []);

  const handleStatusChange = (type, message) => {
    setStatus({ type, message });
    setTimeout(() => setStatus({ type: '', message: '' }), 5000);
  };

  const globalContent = (
    <Suspense fallback={<LoadingFallback>Loading global configuration…</LoadingFallback>}>
      <SurfaceCard>
        <SectionTitle>Global Default</SectionTitle>
        <MetaText>Configure the default end-scroll behavior for all playlists</MetaText>
        {status.message && (
          <StatusMessage type={status.type} message={status.message} />
        )}
        <GlobalConfig onStatusChange={handleStatusChange} />
      </SurfaceCard>
    </Suspense>
  );

  const tagBasedContent = (
    <Suspense fallback={<LoadingFallback>Loading tag-based configurations…</LoadingFallback>}>
      <SurfaceCard>
        <SectionTitle>Tag-Based Rules</SectionTitle>
        <MetaText>Create specific rules for playlists with certain tags or flags</MetaText>
        {status.message && (
          <StatusMessage type={status.type} message={status.message} />
        )}
        <TagBasedConfig onStatusChange={handleStatusChange} />
      </SurfaceCard>
    </Suspense>
  );

  const perPlaylistContent = (
    <Suspense fallback={<LoadingFallback>Loading per-playlist configurations…</LoadingFallback>}>
      <SurfaceCard>
        <SectionTitle>Per-Playlist Overrides</SectionTitle>
        <MetaText>Override end-scroll behavior for specific playlists ({configCount} total)</MetaText>
        {status.message && (
          <StatusMessage type={status.type} message={status.message} />
        )}
        <PerPlaylistConfig onStatusChange={handleStatusChange} />
      </SurfaceCard>
    </Suspense>
  );

  const analyticsContent = (
    <Suspense fallback={<LoadingFallback>Loading analytics…</LoadingFallback>}>
      <SurfaceCard>
        <SectionTitle>Analytics & Testing</SectionTitle>
        <MetaText>View A/B test metrics and user interaction data</MetaText>
        <AnalyticsView />
      </SurfaceCard>
    </Suspense>
  );

  const tabs = [
    {
      id: 'global',
      label: 'Global Default',
      content: globalContent
    },
    {
      id: 'tags',
      label: 'Tag-Based Rules',
      content: tagBasedContent
    },
    {
      id: 'playlists',
      label: `Per-Playlist Overrides (${configCount})`,
      content: perPlaylistContent
    },
    {
      id: 'analytics',
      label: 'Analytics',
      content: analyticsContent
    }
  ];

  return <SubTabNavigation tabs={tabs} defaultTab="global" />;
};

export default EndScrollAdminPanel;
