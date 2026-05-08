import React, { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { Button } from '@shared/styles/GlobalStyles';
import { useAuth } from '@shared/contexts/AuthContext';
import AdminNavButton from './AdminNavButton';
import {
  DashboardShell,
  HeaderRow,
  HeaderInfo,
  HeaderTitle,
  HeaderMeta,
  HeaderActions,
  TabBar,
  TabButton,
  DashboardBody
} from './layout/AdminDashboardLayout';
import AdminOverviewTab from './tabs/AdminOverviewTab';
import CuratorsTab from './tabs/CuratorsTab';
import PlaylistsTab from './tabs/PlaylistsTab';
import ContentTab from './tabs/ContentTab';
import AnalyticsTab from './tabs/AnalyticsTab';

const OperationsTab = React.lazy(() => import('./tabs/OperationsTab.jsx'));
const UsersTab = React.lazy(() => import('./tabs/UsersTab.jsx'));

const TAB_CONFIG = [
  { id: 'admin', label: 'Admin', component: AdminOverviewTab },
  { id: 'analytics', label: 'Analytics', component: AnalyticsTab },
  { id: 'curators', label: 'Curators', component: CuratorsTab },
  { id: 'users', label: 'Users', component: UsersTab },
  { id: 'playlists', label: 'Playlists', component: PlaylistsTab },
  { id: 'content', label: 'Content', component: ContentTab },
  { id: 'operations', label: 'Operations', component: OperationsTab }
];

const TAB_IDS = TAB_CONFIG.map(tab => tab.id);

const LEGACY_TAB_MAPPING = {
  'site-admin': 'operations',
  'site-actions': 'operations',
  'dsp-connections': 'admin',
  'flagged-content': 'curators',
  'shows': 'operations',
  'bio': 'curators',
  'blog': 'content',
  'exports': 'playlists',
  'top10': 'content'
};

const DEFAULT_TAB = 'admin';

const normaliseTab = (value) => {
  if (!value) return DEFAULT_TAB;
  const lower = value.toString().toLowerCase();
  if (TAB_IDS.includes(lower)) return lower;
  return LEGACY_TAB_MAPPING[lower] || DEFAULT_TAB;
};

const AdminPage = () => {
  const { user, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_TAB;
    const params = new URLSearchParams(window.location.search);
    return normaliseTab(params.get('tab'));
  });

  const updateUrl = useCallback((tabId, options = {}) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tabId);
    // Clean up old site-actions query params
    url.searchParams.delete('site-panel');
    url.searchParams.delete('handle');
    window.history.pushState({}, '', url.toString());
  }, []);

  const handleTabChange = useCallback((tabId, options = {}) => {
    const nextTab = normaliseTab(tabId);
    setActiveTab(nextTab);
    updateUrl(nextTab, options);
  }, [updateUrl]);

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setActiveTab(normaliseTab(params.get('tab')));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const handleLegacyEvent = (event) => {
      const { tab, handle } = event.detail || {};
      if (!tab) return;
      handleTabChange(tab, { handle });
    };

    window.addEventListener('adminTabChange', handleLegacyEvent);
    return () => window.removeEventListener('adminTabChange', handleLegacyEvent);
  }, [handleTabChange]);

  const activeTabConfig = useMemo(
    () => TAB_CONFIG.find(tab => tab.id === activeTab) || TAB_CONFIG[0],
    [activeTab]
  );

  const ActiveComponent = activeTabConfig.component || AdminOverviewTab;

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
      // Redirect to login page after successful logout
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout error:', error);
      // Even if logout fails, redirect to login
      window.location.href = '/login';
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <DashboardShell>
      <HeaderRow>
        <HeaderInfo>
          <HeaderTitle> ADMIN</HeaderTitle>
          <HeaderMeta>
            {user ? `${user.username} (${user.role})` : 'Authenticated admin'}
          </HeaderMeta>
        </HeaderInfo>
        <HeaderActions>
          <AdminNavButton to="/" size="small" title="Go to Home Page">
            Home
          </AdminNavButton>
          <Button
            type="button"
            size="small"
            variant="danger"
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? 'Logging out...' : 'Logout'}
          </Button>
        </HeaderActions>
      </HeaderRow>

      <TabBar role="tablist" aria-label="Admin dashboard sections">
        {TAB_CONFIG.map(tab => (
          <TabButton
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`admin-tab-${tab.id}`}
            $active={activeTab === tab.id}
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.label}
          </TabButton>
        ))}
      </TabBar>

      <DashboardBody>
        <div id={`admin-tab-${activeTab}`} role="tabpanel">
          <Suspense fallback={<div>Loading…</div>}>
            <ActiveComponent
              user={user}
              onNavigate={handleTabChange}
            />
          </Suspense>
        </div>
      </DashboardBody>
    </DashboardShell>
  );
};

export default AdminPage;
