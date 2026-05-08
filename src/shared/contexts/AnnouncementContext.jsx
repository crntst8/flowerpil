import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@shared/contexts/AuthContext';
import { useWebSocket } from '@shared/contexts/WebSocketContext';
import AnnouncementModal from '@modules/shared/components/announcements/AnnouncementModal';
import AnnouncementBanner from '@modules/shared/components/announcements/AnnouncementBanner';

const AnnouncementContext = createContext(null);
const TRACKING_WARNED_SESSION_KEY = 'flowerpil:announcement-tracking-warned';

export function useAnnouncements() {
  const context = useContext(AnnouncementContext);
  if (!context) {
    // Return a no-op context if not in provider (for pages that don't need announcements)
    return {
      announcements: [],
      loading: false,
      dismissAnnouncement: () => {},
      refreshAnnouncements: () => {},
      currentModal: null,
      currentBanners: [],
    };
  }
  return context;
}

// Convert pathname to page identifier for announcement targeting
function getPageFromPath(pathname) {
  // Remove leading slash and normalize
  const path = pathname.replace(/^\/+/, '').toLowerCase();

  // Map common routes to page identifiers
  if (!path || path === 'home') return 'home';
  if (path.startsWith('curator/')) return 'curator_dashboard';
  if (path.startsWith('admin/')) return 'admin';
  if (path.startsWith('playlist/')) return 'playlist_view';
  if (path.startsWith('l/') || path.startsWith('p/') || path.startsWith('s/')) return 'public_share';

  // Default: use the first path segment
  return path.split('/')[0] || 'global';
}

export function AnnouncementProvider({ children, page: pageProp }) {
  const location = useLocation();
  const { authenticatedFetch, isAuthenticated, user } = useAuth();
  const { subscribe, connected } = useWebSocket();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentModal, setCurrentModal] = useState(null);
  const [currentBanners, setCurrentBanners] = useState([]);
  const fetchedPagesRef = useRef(new Set());
  const dismissedRef = useRef(new Set());
  const delayTimeoutsRef = useRef(new Map());
  const prevUserIdRef = useRef(user?.id);
  const fallbackWarnedRef = useRef(false);

  // Derive current page from prop or pathname
  const page = pageProp || getPageFromPath(location.pathname);

  // Fetch announcements for the current page
  const fetchAnnouncements = useCallback(async (targetPage, force = false) => {
    // Skip if we've already fetched for this page (unless forced)
    if (!force && fetchedPagesRef.current.has(targetPage)) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/v1/announcements/active?page=${encodeURIComponent(targetPage)}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch announcements');
      }

      const data = await response.json();
      if (data.success && data.data) {
        fetchedPagesRef.current.add(targetPage);

        // Filter out already dismissed announcements
        const newAnnouncements = data.data.filter(
          (a) => !dismissedRef.current.has(a.id)
        );

        setAnnouncements((prev) => {
          // Merge with existing, avoiding duplicates
          const existingIds = new Set(prev.map((a) => a.id));
          const unique = newAnnouncements.filter((a) => !existingIds.has(a.id));
          return [...prev, ...unique];
        });
      }
    } catch (error) {
      console.error('[Announcements] Fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on page change
  useEffect(() => {
    if (page) {
      fetchAnnouncements(page);
    }
  }, [page, fetchAnnouncements]);

  // Refetch when user auth state changes (user logs in/out)
  useEffect(() => {
    const currentUserId = user?.id || null;
    const prevUserId = prevUserIdRef.current;

    // Only refetch if user actually changed (login/logout)
    if (currentUserId !== prevUserId) {
      prevUserIdRef.current = currentUserId;

      // Clear fetched pages cache so we refetch with new user context
      fetchedPagesRef.current.clear();

      // Clear current announcements (new user may have different targeting)
      setAnnouncements([]);
      setCurrentModal(null);
      setCurrentBanners([]);

      // Refetch for current page
      if (page) {
        fetchAnnouncements(page, true);
      }
    }
  }, [user?.id, page, fetchAnnouncements]);

  // Subscribe to WebSocket push notifications
  useEffect(() => {
    if (!connected) return;

    const unsubscribe = subscribe('announcement:push', (data) => {
      if (data.announcement) {
        const announcement = data.announcement;

        // Skip if already dismissed
        if (dismissedRef.current.has(announcement.id)) return;

        // Skip if already in list
        setAnnouncements((prev) => {
          if (prev.some((a) => a.id === announcement.id)) return prev;
          return [...prev, announcement];
        });
      }
    });

    return unsubscribe;
  }, [connected, subscribe]);

  // Helper to add announcement to display with optional delay
  const addToDisplay = useCallback((announcement) => {
    const delay = (announcement.display_delay || 0) * 1000;

    if (delay > 0) {
      // Clear any existing timeout for this announcement
      if (delayTimeoutsRef.current.has(announcement.id)) {
        clearTimeout(delayTimeoutsRef.current.get(announcement.id));
      }

      const timeoutId = setTimeout(() => {
        delayTimeoutsRef.current.delete(announcement.id);

        if (announcement.format === 'modal') {
          setCurrentModal((prev) => prev || announcement);
        } else {
          setCurrentBanners((prev) => {
            if (prev.some((b) => b.id === announcement.id)) return prev;
            return [...prev, announcement].slice(0, 2);
          });
        }
      }, delay);

      delayTimeoutsRef.current.set(announcement.id, timeoutId);
    } else {
      // No delay, add immediately
      if (announcement.format === 'modal') {
        setCurrentModal((prev) => prev || announcement);
      } else {
        setCurrentBanners((prev) => {
          if (prev.some((b) => b.id === announcement.id)) return prev;
          return [...prev, announcement].slice(0, 2);
        });
      }
    }
  }, []);

  // Clean up delay timeouts on unmount
  useEffect(() => {
    return () => {
      for (const timeoutId of delayTimeoutsRef.current.values()) {
        clearTimeout(timeoutId);
      }
      delayTimeoutsRef.current.clear();
    };
  }, []);

  // Process announcements into display queue
  useEffect(() => {
    const modals = announcements.filter(
      (a) => a.format === 'modal' && !dismissedRef.current.has(a.id)
    );
    const banners = announcements.filter(
      (a) => (a.format === 'banner_top' || a.format === 'banner_bottom') &&
        !dismissedRef.current.has(a.id)
    );

    // Show highest priority modal (with delay if applicable)
    if (modals.length > 0 && !currentModal) {
      addToDisplay(modals[0]);
    }

    // Show banners (max 2, with delay if applicable)
    for (const banner of banners.slice(0, 2)) {
      if (!currentBanners.some((b) => b.id === banner.id)) {
        addToDisplay(banner);
      }
    }
  }, [announcements, currentModal, currentBanners, addToDisplay]);

  const hasCsrfCookieToken = useCallback(() => {
    if (typeof document === 'undefined') return false;
    return /(?:^|;\s*)csrf_token=/.test(document.cookie || '');
  }, []);

  const warnTrackingSkippedOnce = useCallback((reason, extra = {}) => {
    let shouldWarn = false;
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        shouldWarn = window.sessionStorage.getItem(TRACKING_WARNED_SESSION_KEY) !== '1';
        if (shouldWarn) {
          window.sessionStorage.setItem(TRACKING_WARNED_SESSION_KEY, '1');
        }
      }
    } catch (_) {
      shouldWarn = !fallbackWarnedRef.current;
      fallbackWarnedRef.current = true;
    }

    if (shouldWarn) {
      console.warn('[Announcements] Tracking skipped', { reason, ...extra });
    }
  }, []);

  // Record view when announcement is shown
  const recordView = useCallback(async (announcementId, variant) => {
    if (!isAuthenticated) {
      return;
    }

    if (!hasCsrfCookieToken()) {
      warnTrackingSkippedOnce('csrf_cookie_missing', { action: 'view', announcementId });
      return;
    }

    try {
      await authenticatedFetch(`/api/v1/announcements/${announcementId}/view`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant }),
      });
    } catch (error) {
      if (String(error?.message || '').toLowerCase().includes('csrf')) {
        warnTrackingSkippedOnce('csrf_request_failed', { action: 'view', announcementId });
        return;
      }
      console.error('[Announcements] View tracking error:', error);
    }
  }, [authenticatedFetch, hasCsrfCookieToken, isAuthenticated, warnTrackingSkippedOnce]);

  // Record view when modal/banner shows
  useEffect(() => {
    if (currentModal) {
      recordView(currentModal.id, currentModal.variant);
    }
  }, [currentModal, recordView]);

  useEffect(() => {
    currentBanners.forEach((banner) => {
      recordView(banner.id, banner.variant);
    });
  }, [currentBanners, recordView]);

  // Dismiss announcement
  const dismissAnnouncement = useCallback(async (announcementId, { button, permanent } = {}) => {
    dismissedRef.current.add(announcementId);

    // Clear from current displays
    if (currentModal?.id === announcementId) {
      setCurrentModal(null);
    }
    setCurrentBanners((prev) => prev.filter((b) => b.id !== announcementId));

    // Remove from announcements list
    setAnnouncements((prev) => prev.filter((a) => a.id !== announcementId));

    // Record dismissal only for authenticated sessions with a CSRF token
    if (isAuthenticated && hasCsrfCookieToken()) {
      try {
        await authenticatedFetch(`/api/v1/announcements/${announcementId}/dismiss`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ button, permanent }),
        });
      } catch (error) {
        if (String(error?.message || '').toLowerCase().includes('csrf')) {
          warnTrackingSkippedOnce('csrf_request_failed', { action: 'dismiss', announcementId });
        } else {
          console.error('[Announcements] Dismiss tracking error:', error);
        }
      }
    } else if (isAuthenticated) {
      warnTrackingSkippedOnce('csrf_cookie_missing', { action: 'dismiss', announcementId });
    }

    // Check for next modal in queue
    const remainingModals = announcements.filter(
      (a) => a.format === 'modal' && !dismissedRef.current.has(a.id)
    );
    if (remainingModals.length > 0) {
      setCurrentModal(remainingModals[0]);
    }
  }, [announcements, authenticatedFetch, currentModal, hasCsrfCookieToken, isAuthenticated, warnTrackingSkippedOnce]);

  // Handle modal dismiss
  const handleModalDismiss = useCallback(({ button, permanent } = {}) => {
    if (currentModal) {
      dismissAnnouncement(currentModal.id, { button, permanent });
    }
  }, [currentModal, dismissAnnouncement]);

  // Handle banner dismiss
  const handleBannerDismiss = useCallback((bannerId) => ({ button, permanent } = {}) => {
    dismissAnnouncement(bannerId, { button, permanent });
  }, [dismissAnnouncement]);

  // Refresh announcements (e.g., after navigation)
  const refreshAnnouncements = useCallback((targetPage) => {
    fetchedPagesRef.current.delete(targetPage);
    fetchAnnouncements(targetPage);
  }, [fetchAnnouncements]);

  const value = {
    announcements,
    loading,
    dismissAnnouncement,
    refreshAnnouncements,
    currentModal,
    currentBanners,
  };

  return (
    <AnnouncementContext.Provider value={value}>
      {children}

      {/* Render current modal */}
      <AnnouncementModal
        announcement={currentModal}
        isOpen={!!currentModal}
        onDismiss={handleModalDismiss}
      />

      {/* Render banners */}
      {currentBanners.map((banner) => (
        <AnnouncementBanner
          key={banner.id}
          announcement={banner}
          position={banner.format === 'banner_top' ? 'top' : 'bottom'}
          isOpen={true}
          onDismiss={handleBannerDismiss(banner.id)}
        />
      ))}
    </AnnouncementContext.Provider>
  );
}

export default AnnouncementContext;
