import { Suspense, lazy } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { SubTabNavigation } from '../shared';
import QRCodeCTAManager from '../QRCodeCTAManager.jsx';


const ScheduledImportsPanel = lazy(() => import('../ScheduledImportsPanel.jsx'));
const SiteDisplaySettings = lazy(() => import('../SiteDisplaySettings.jsx'));
const SignupsSettings = lazy(() => import('../SignupsSettings.jsx'));
const AdminDSPConnections = lazy(() => import('../AdminDSPConnections.jsx'));
const RequestsQueue = lazy(() => import('../RequestsQueue.jsx'));
const SlackNotificationTester = lazy(() => import('../SlackNotificationTester.jsx'));
const CrossLinkDryRunTester = lazy(() => import('../CrossLinkDryRunTester.jsx'));
const UrlImportTester = lazy(() => import('../UrlImportTester.jsx'));
const DemoAccountPanel = lazy(() => import('../DemoAccountPanel.jsx'));
const YouTubeCrossLinkReview = lazy(() => import('../YouTubeCrossLinkReview.jsx'));
const MetaSettings = lazy(() => import('../MetaSettings.jsx'));
const ArtworkPopulator = lazy(() => import('../ArtworkPopulator.jsx'));

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

const OperationsTab = () => {
  const scheduledImportsContent = (
    <Suspense fallback={<LoadingFallback>Loading scheduled imports…</LoadingFallback>}>
      <SurfaceCard>
        <SectionTitle>Scheduled Imports</SectionTitle>
        <MetaText>Monitor and manage scheduled playlist imports</MetaText>
        <ScheduledImportsPanel />
      </SurfaceCard>
    </Suspense>
  );

  const exportsContent = (
    <Suspense fallback={<LoadingFallback>Loading export queue…</LoadingFallback>}>
      <SurfaceCard>
        <SectionTitle>Export Queue</SectionTitle>
        <MetaText>Monitor and manage export requests</MetaText>
        <RequestsQueue />
      </SurfaceCard>
    </Suspense>
  );

  const dspConnectionsContent = (
    <Suspense fallback={<LoadingFallback>Loading DSP connections…</LoadingFallback>}>
      <SurfaceCard>
        <SectionTitle>DSP Connections</SectionTitle>
        <MetaText>Manage DSP integrations and connections</MetaText>
        <AdminDSPConnections />
      </SurfaceCard>
    </Suspense>
  );

  const siteSettingsContent = (
    <Suspense fallback={<LoadingFallback>Loading display settings…</LoadingFallback>}>
      <SurfaceCard>
        <SectionTitle>Site Settings</SectionTitle>
        <MetaText>Configure site display settings and toggles</MetaText>
        <SiteDisplaySettings />
      </SurfaceCard>
    </Suspense>
  );

  const metaSettingsContent = (
    <Suspense fallback={<LoadingFallback>Loading Meta settings…</LoadingFallback>}>
      <SurfaceCard>
        <SectionTitle>Meta Settings</SectionTitle>
        <MetaText>Manage Meta Pixel and ads feature toggles</MetaText>
        <MetaSettings />
      </SurfaceCard>
    </Suspense>
  );

  const signupsSettingsContent = (
    <Suspense fallback={<LoadingFallback>Loading signup settings…</LoadingFallback>}>
      <SurfaceCard>
        <SectionTitle>Signup Settings</SectionTitle>
        <MetaText>Configure user signup and referral code settings</MetaText>
        <SignupsSettings />
      </SurfaceCard>
    </Suspense>
  );

  const slackTestContent = (
    <Suspense fallback={<LoadingFallback>Loading Slack tester…</LoadingFallback>}>
      <SurfaceCard>
        <SectionTitle>Test Slack Notifications</SectionTitle>
        <MetaText>Test individual Slack notification types to verify bot configuration</MetaText>
        <SlackNotificationTester />
      </SurfaceCard>
    </Suspense>
  );

  const urlImportTestContent = (
    <Suspense fallback={<LoadingFallback>Loading URL import tester…</LoadingFallback>}>
      <SurfaceCard>
        <SectionTitle>URL Import Test</SectionTitle>
        <MetaText>Test playlist URL imports across all platforms (Spotify, Apple Music, TIDAL, Qobuz, YouTube, SoundCloud)</MetaText>
        <UrlImportTester />
      </SurfaceCard>
    </Suspense>
  );

  const crossLinkDryRunContent = (
    <Suspense fallback={<LoadingFallback>Loading cross-link dry run…</LoadingFallback>}>
      <SurfaceCard>
        <SectionTitle>Cross-Link Dry Run</SectionTitle>
        <MetaText>Simulate cross-platform matching without writing to track records</MetaText>
        <CrossLinkDryRunTester />
      </SurfaceCard>
    </Suspense>
  );

  const demoAccountContent = (
    <Suspense fallback={<LoadingFallback>Loading demo accounts…</LoadingFallback>}>
      <SurfaceCard>
        <SectionTitle>Demo Account</SectionTitle>
        <MetaText>Track demo curator usage without exposing public profiles</MetaText>
        <DemoAccountPanel />
      </SurfaceCard>
    </Suspense>
  );

  const youtubeCrossLinkContent = (
    <Suspense fallback={<LoadingFallback>Loading YouTube cross-link review…</LoadingFallback>}>
      <SurfaceCard>
        <SectionTitle>YouTube Cross-Link Review</SectionTitle>
        <MetaText>Review and apply YouTube Music matches with manual override support</MetaText>
        <YouTubeCrossLinkReview />
      </SurfaceCard>
    </Suspense>
  );
  const qrManager = (
    <Suspense fallback={<LoadingFallback>Loading YouTube cross-link review…</LoadingFallback>}>
      <SurfaceCard>
        <SectionTitle>QR CTA</SectionTitle>
        <QRCodeCTAManager />
      </SurfaceCard>
    </Suspense>
  );

  const artworkPopulatorContent = (
    <Suspense fallback={<LoadingFallback>Loading artwork populator…</LoadingFallback>}>
      <SurfaceCard>
        <SectionTitle>Populate Artwork</SectionTitle>
        <MetaText>Backfill missing track artwork using Spotify API lookups</MetaText>
        <ArtworkPopulator />
      </SurfaceCard>
    </Suspense>
  );

  const tabs = [
    {
      id: 'imports',
      label: 'Schedules',
      content: scheduledImportsContent
    },

    {
      id: 'exports',
      label: 'Exports',
      content: exportsContent
    },
    {
      id: 'dsp',
      label: 'DSP',
      content: dspConnectionsContent
    },
    {
      id: 'settings',
      label: 'visability',
      content: siteSettingsContent
    },
    {
      id: 'signups',
      label: 'Signups',
      content: signupsSettingsContent
    },
    {
      id: 'meta',
      label: 'Meta',
      content: metaSettingsContent
    },
    {
      id: 'test-slack',
      label: 'Slack',
      content: slackTestContent
    },
    {
      id: 'cross-link-dry-run',
      label: 'Cross-Link Test',
      content: crossLinkDryRunContent
    },
    {
      id: 'url-import',
      label: 'URL Test',
      content: urlImportTestContent
    },

    {
      id: 'youtube-crosslink',
      label: 'YouTube',
      content: youtubeCrossLinkContent
    },
    {
      id: 'demo-account',
      label: 'Demo Account',
      content: demoAccountContent
    },
    {
      id: 'qr-ctas',
      label: 'QR CTAs',
      content: qrManager
    },
    {
      id: 'artwork',
      label: 'Artwork',
      content: artworkPopulatorContent
    }
  ];

  return <SubTabNavigation tabs={tabs} defaultTab="imports" />;
};

export default OperationsTab;
