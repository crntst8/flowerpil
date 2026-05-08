import { Suspense, lazy } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { SubTabNavigation } from '../shared';
import BlogTab from './BlogTab';
import FlaggedContent from '../FlaggedContent.jsx';
import LinkOutAdminPanel from '../LinkOutAdminPanel.jsx';

const AboutPageEditor = lazy(() => import('../AboutPageEditor.jsx'));
const SearchHighlightsAdmin = lazy(() => import('../SearchHighlightsAdmin.jsx'));
const EndScrollAdminPanel = lazy(() => import('../EndScrollAdminPanel.jsx'));
const AnnouncementsManager = lazy(() => import('../AnnouncementsManager.jsx'));
// const PerfectSundaysAdmin = lazy(() => import('../PerfectSundaysAdmin.jsx'));
const LandingPageLinksAdmin = lazy(() => import('../LandingPageLinksAdmin.jsx'));
const TransferTab = lazy(() => import('./TransferTab.jsx'));
const Top10Tab = lazy(() => import('./Top10Tab.jsx'));
const ReleasesManager = lazy(() => import('../ReleasesManager.jsx'));
const WritingTab = lazy(() => import('./WritingTab.jsx'));

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
  max-height: calc(100vh - 200px);
  overflow-y: auto;
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

const ContentTab = () => {
  const blogContent = <BlogTab />;

  const aboutContent = (
    <Suspense fallback={<LoadingFallback>Loading about page editor…</LoadingFallback>}>
      <SurfaceCard>
        <SectionTitle>About Page</SectionTitle>
        <MetaText>Edit the about page content and sections</MetaText>
        <AboutPageEditor />
      </SurfaceCard>
    </Suspense>
  );

  const searchContent = (
    <Suspense fallback={<LoadingFallback>Loading search configuration…</LoadingFallback>}>
      <SurfaceCard>
        <SectionTitle>Search Configuration</SectionTitle>
        <MetaText>Configure search highlights and related content settings</MetaText>
        <SearchHighlightsAdmin />
      </SurfaceCard>
    </Suspense>
  );

  const linkoutContent = (
    <Suspense fallback={<LoadingFallback>Loading link-out configuration…</LoadingFallback>}>
      <SurfaceCard>
        <LinkOutAdminPanel />
      </SurfaceCard>
    </Suspense>
  );

  const announcementsContent = (
    <Suspense fallback={<LoadingFallback>Loading announcements manager...</LoadingFallback>}>
      <SurfaceCard>
        <SectionTitle>Announcements</SectionTitle>
        <MetaText>Create and manage announcement modals, banners, and notifications</MetaText>
        <AnnouncementsManager />
      </SurfaceCard>
    </Suspense>
  );

  const flaggedContent = (
    <SurfaceCard>
      <SectionTitle>Flag Reports</SectionTitle>
      <MetaText>Review and manage flagged content across the platform</MetaText>
      <FlaggedContent />
    </SurfaceCard>
  );

  const endScrollContent = (
    <Suspense fallback={<LoadingFallback>Loading end-scroll configuration…</LoadingFallback>}>
      <EndScrollAdminPanel />
    </Suspense>
  );

  /* const perfectSundaysContent = (
    <Suspense fallback={<LoadingFallback>Loading Perfect Sundays…</LoadingFallback>}>
      <SurfaceCard>
        <SectionTitle>Perfect Sundays</SectionTitle>
        <MetaText>Import Spotify playlists, manage artwork, and publish the /perf grid</MetaText>
        <PerfectSundaysAdmin />
      </SurfaceCard>
    </Suspense>
  ); 

  */

  const landingPageLinksContent = (
    <Suspense fallback={<LoadingFallback>Loading Landing Page Links…</LoadingFallback>}>
      <SurfaceCard>
        <SectionTitle>Landing Page Links</SectionTitle>
        <MetaText>Create custom link cards that appear on the landing page</MetaText>
        <LandingPageLinksAdmin />
      </SurfaceCard>
    </Suspense>
  );

  const releasesContent = (
    <Suspense fallback={<LoadingFallback>Loading releases manager…</LoadingFallback>}>
      <SurfaceCard>
        <SectionTitle>Releases</SectionTitle>
        <MetaText>Create and manage curated release pages</MetaText>
        <ReleasesManager />
      </SurfaceCard>
    </Suspense>
  );

  const writingContent = (
    <Suspense fallback={<LoadingFallback>Loading writing rollout…</LoadingFallback>}>
      <SurfaceCard>
        <SectionTitle>Writing Rollout</SectionTitle>
        <MetaText>Control pilot curator access and public rollout for writing pieces</MetaText>
        <WritingTab />
      </SurfaceCard>
    </Suspense>
  );

  const transferContent = (
    <Suspense fallback={<LoadingFallback>Loading transfer tool…</LoadingFallback>}>
      <TransferTab />
    </Suspense>
  );

  const top10Content = (
    <Suspense fallback={<LoadingFallback>Loading Top 10...</LoadingFallback>}>
      <Top10Tab />
    </Suspense>
  );

  const tabs = [
    
    {
      id: 'announcements',
      label: 'Announcements',
      content: announcementsContent
    },
    {
      id: 'blog',
      label: 'Blog',
      content: blogContent
    },
    {
      id: 'releases',
      label: 'Releases',
      content: releasesContent
    },
    {
      id: 'writing',
      label: 'Writing',
      content: writingContent
    },

    {
      id: 'landingPageLinks',
      label: 'Links',
      content: landingPageLinksContent
    },
    {
      id: 'about',
      label: 'About',
      content: aboutContent
    },
    {
      id: 'search',
      label: 'Search',
      content: searchContent
    },
    {
      id: 'linkout',
      label: 'Link Out',
      content: linkoutContent
    },

    {
      id: 'endScroll',
      label: 'End Scroll',
      content: endScrollContent
    },
    {
      id: 'top10',
      label: 'Top 10',
      content: top10Content
    },
    {
      id: 'flagged',
      label: 'Flag Reports',
      content: flaggedContent
    },



    {
      id: 'transfer',
      label: 'Transfer',
      content: transferContent
    }
  ];

  return <SubTabNavigation tabs={tabs} defaultTab="blog" />;
};

export default ContentTab;
