import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@shared/contexts/AuthContext';

const SESSION_KEY = 'fp:demo-session-id';

const getSessionId = () => {
  if (typeof window === 'undefined') return 'server-session';
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const generated = window.crypto?.randomUUID?.() || `demo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(SESSION_KEY, generated);
    return generated;
  } catch {
    return `demo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
};

const DemoAccountTracker = () => {
  const location = useLocation();
  const { user, isAuthenticated, authenticatedFetch } = useAuth();

  const sessionId = useMemo(() => getSessionId(), []);
  const lastPathRef = useRef(null);
  const lastFromPathRef = useRef(null);
  const lastStartRef = useRef(Date.now());

  const currentPath = useMemo(() => {
    const search = location.search || '';
    const hash = location.hash || '';
    return `${location.pathname}${search}${hash}`;
  }, [location.pathname, location.search, location.hash]);

  const sendActivity = useCallback((payload, { keepalive = false } = {}) => {
    if (!authenticatedFetch) return;
    authenticatedFetch('/api/v1/demo-accounts/activity', {
      method: 'POST',
      body: JSON.stringify(payload),
      keepalive
    }).catch(() => {});
  }, [authenticatedFetch]);

  useEffect(() => {
    if (!isAuthenticated || !user?.is_demo) {
      lastPathRef.current = null;
      lastFromPathRef.current = null;
      lastStartRef.current = Date.now();
      return;
    }

    const now = Date.now();
    if (!lastPathRef.current) {
      lastPathRef.current = currentPath;
      lastStartRef.current = now;
      return;
    }

    if (lastPathRef.current === currentPath) {
      return;
    }

    const durationMs = Math.max(now - lastStartRef.current, 0);
    sendActivity({
      session_id: sessionId,
      event_type: 'route',
      path: lastPathRef.current,
      from_path: lastFromPathRef.current,
      duration_ms: durationMs,
      metadata: {
        to_path: currentPath
      }
    });

    lastFromPathRef.current = lastPathRef.current;
    lastPathRef.current = currentPath;
    lastStartRef.current = now;
  }, [currentPath, isAuthenticated, sessionId, sendActivity, user?.is_demo]);

  useEffect(() => {
    if (!isAuthenticated || !user?.is_demo) return;

    const flushCurrent = () => {
      if (!lastPathRef.current) return;
      const now = Date.now();
      const durationMs = Math.max(now - lastStartRef.current, 0);
      sendActivity({
        session_id: sessionId,
        event_type: 'route',
        path: lastPathRef.current,
        from_path: lastFromPathRef.current,
        duration_ms: durationMs,
        metadata: {
          to_path: null
        }
      }, { keepalive: true });
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushCurrent();
      }
    };

    window.addEventListener('beforeunload', flushCurrent);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('beforeunload', flushCurrent);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isAuthenticated, sessionId, sendActivity, user?.is_demo]);

  return null;
};

export default DemoAccountTracker;
