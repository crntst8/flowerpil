import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { GlobalStyles } from '@shared/styles/GlobalStyles';
import { ModuleProvider } from '@core/module-loader/ModuleProvider';
import { AuthProvider } from '@shared/contexts/AuthContext';
import { WebSocketProvider } from '@shared/contexts/WebSocketContext';
import { AnnouncementProvider } from '@shared/contexts/AnnouncementContext';
import { AudioPreviewProvider } from '@shared/contexts/AudioPreviewContext';
import { SiteSettingsProvider } from '@shared/contexts/SiteSettingsContext';
import { ConsentProvider } from '@shared/contexts/ConsentContext';
import { PlaceholderColorProvider } from '@shared/contexts/PlaceholderColorContext';
import DynamicRouter from '@core/router/DynamicRouter';
import SiteProtection from './components/SiteProtection';
import BfcacheAndViewportFix from '@shared/components/BfcacheAndViewportFix';
import DevUserSwitcher from './dev/DevUserSwitcher';
import PublicSongPage from './pages/PublicSongPage';
import StaticTrackPage from './pages/StaticTrackPage';
import PublicListPage from './pages/PublicListPage';
import PublicSavedPage from './pages/PublicSavedPage';
import ContentTagPage from '@modules/content-tags/components/ContentTagPage';
import ResetPasswordPage from './pages/ResetPassword.jsx';
import AppleMusicAuth from './pages/AppleMusicAuth.jsx';
import QobizHelpPage from './pages/QobizHelpPage.jsx';
import AppleFlowPage from './pages/AppleFlowPage.jsx';
import QuickImportPage from './pages/QuickImportPage';
import LinkOutBanner from '@shared/components/LinkOutBanner/LinkOutBanner';
import EnvironmentIndicator from '@shared/components/EnvironmentIndicator';
import siteAnalytics from '@shared/utils/siteAnalytics';
import DemoAccountTracker from '@shared/components/DemoAccountTracker';
import MetaPixelManager from '@shared/components/MetaPixelManager';

const UserFeedbackWidget = lazy(() => import('@modules/feedback/UserFeedbackWidget'));

function App() {
  // Initialize site analytics on mount
  useEffect(() => {
    siteAnalytics.init();
  }, []);

  return (
    <>
    {import.meta.env.DEV && <DevUserSwitcher />}
      <EnvironmentIndicator />
      <GlobalStyles />
      <SiteProtection>
        <SiteSettingsProvider>
          <ConsentProvider>
            <PlaceholderColorProvider>
            <AuthProvider>
              <WebSocketProvider>
              <AnnouncementProvider>
              <LinkOutBanner />
              <BfcacheAndViewportFix />
              <AudioPreviewProvider>
                <ModuleProvider>
                  <DemoAccountTracker />
                  <MetaPixelManager />
                  <Routes>
                    {/* Redirect root to home */}
                    <Route path="/" element={<Navigate to="/home" replace />} />

                  {/* Public share pages (no auth required) */}
                  <Route path="/s/:slug" element={<PublicSongPage />} />
                  <Route path="/track/:trackId" element={<StaticTrackPage />} />
                  <Route path="/l/:slug" element={<PublicListPage />} />
                  <Route path="/p/:slug" element={<PublicSavedPage />} />
                  <Route path="/content-tag/:slug" element={<ContentTagPage />} />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                  <Route path="/auth/apple/authorize" element={<AppleMusicAuth />} />
                  <Route path="/qobiz-help" element={<QobizHelpPage />} />
                  <Route path="/apple-flow" element={<AppleFlowPage />} />
                  <Route path="/go" element={<QuickImportPage />} />

{/*2 Git Test src */}
                  {/* Dynamic module routes */}
                    <Route path="/*" element={<DynamicRouter />} />
                  </Routes>
                </ModuleProvider>
              </AudioPreviewProvider>
              <Suspense fallback={null}>
                <UserFeedbackWidget />
              </Suspense>
              </AnnouncementProvider>
              </WebSocketProvider>
            </AuthProvider>
            </PlaceholderColorProvider>
          </ConsentProvider>
        </SiteSettingsProvider>
      </SiteProtection>
    </>
  );
}

export default App;
