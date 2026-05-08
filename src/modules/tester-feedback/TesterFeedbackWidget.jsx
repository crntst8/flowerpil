import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { useAuth } from '@shared/contexts/AuthContext';
import { useSiteSettings } from '@shared/contexts/SiteSettingsContext';

const STORAGE_KEY = 'flowerpil_tester_feedback_queue_v1';
const envFeatureFlag = String(import.meta.env.VITE_FEATURE_TESTER_FEEDBACK || '').toLowerCase() === 'true';
const batchSize = 5;

const FloatingButton = styled.button`
  position: fixed;
  z-index: 2147483000;
  bottom: clamp(16px, 4vw, 28px);
  right: clamp(16px, 4vw, 28px);
  background: rgba(15, 15, 15, 0.92);
  color: #f2f2f2;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  padding: 10px 18px;
  font-size: 0.9rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
  box-shadow: 0px 12px 32px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(14px);
  transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: 0.88;

  &:hover {
    transform: translateY(-2px);
    opacity: 1;
    box-shadow: 0px 16px 40px rgba(0, 0, 0, 0.4);
  }

  &:active {
    transform: translateY(0px) scale(0.98);
  }

  @media (max-width: 768px) {
    padding: 10px 16px;
    font-size: 0.85rem;
  }
`;

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(4, 37, 201, 0.32);
  color: rgba(255, 255, 255, 0.88);
  padding: 6px 12px 6px 10px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  position: fixed;
  bottom: clamp(64px, 12vw, 92px);
  right: clamp(16px, 4vw, 28px);
  z-index: 2147482999;
  backdrop-filter: blur(10px);
  opacity: 0.72;
`;

const OverlayBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(10, 10, 10, 0.55);
  z-index: 2147483500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(16px, 4vw, 32px);
  backdrop-filter: blur(4px);
`;

const OverlayCard = styled.div`
  background: rgba(15, 15, 15, 0.91);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0px 18px 60px rgba(0, 0, 0, 0.45);
  width: min(540px, 100%);
  padding: clamp(20px, 3vw, 28px);
  color: #f8f8f8;
  position: relative;
`;

const OverlayHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;

  h2 {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0;
    letter-spacing: 0.04em;
  }
`;

const CloseButton = styled.button`
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  font-size: 1.2rem;
  cursor: pointer;
  padding: 4px 6px;
  transition: color 0.2s ease;

  &:hover {
    color: #fff;
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 140px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: #fefefe;
  padding: 14px;
  font-size: 0.95rem;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s ease, background 0.2s ease;

  &:focus {
    border-color: rgba(255, 255, 255, 0.35);
    background: rgba(255, 255, 255, 0.06);
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }
`;

const ActionsRow = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
`;

const SubmitButton = styled.button`
  background: #46c529ff;
  color: #0f0f0f;
  border: none;
  padding: 10px 22px;
  font-weight: 600;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0px 12px 30px rgba(255, 106, 193, 0.32);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }
`;

const SecondaryButton = styled.button`
  background: rgba(219, 18, 18, 0.79);
  color: rgba(0, 0, 0, 0.8);
  border: none;
  padding: 10px 22px;
  font-weight: 600;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    color: #fff;
  }
`;

const StatusText = styled.p`
  margin: 12px 0 0;
  font-size: 0.85rem;
  color: ${({ $variant }) =>
    $variant === 'error'
      ? '#ff98b8'
      : $variant === 'success'
        ? '#a8ffcb'
        : 'rgba(255,255,255,0.6)'};
`;

const useIsClient = () => {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);
  return isClient;
};

const createEntry = ({ actionId, message, typingStartedAt }) => {
  const href = window.location.href;
  const route = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const submittedAt = new Date().toISOString();
  const userAgent = navigator.userAgent || null;
  const language = navigator.language || null;
  const platform = navigator.platform || null;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const viewport = { width: window.innerWidth, height: window.innerHeight };

  return {
    actionId,
    url: href,
    route,
    message,
    metadata: {
      user_agent: userAgent,
      language,
      platform,
      timezone: timeZone,
      submitted_at: submittedAt,
      typing_started_at: typingStartedAt,
      page_title: document.title || null,
      referrer: document.referrer || null,
      viewport,
      prefers_color_scheme: prefersDark ? 'dark' : 'light',
      app_env: import.meta.env.MODE,
      build: import.meta.env.VITE_APP_BUILD || import.meta.env.VITE_GIT_SHA || null
    },
    attempts: 0
  };
};

const loadQueue = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => ({
        ...entry,
        attempts: entry.attempts || 0
      }));
    }
    return [];
  } catch (_) {
    return [];
  }
};

const persistQueue = (queue) => {
  try {
    if (!queue || !queue.length) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (_) {
    // ignore storage errors
  }
};

const TesterFeedbackWidget = () => {
  const { user, isAuthenticated, authenticatedFetch } = useAuth();
  const { isTesterFeedbackEnabled } = useSiteSettings();
  const isClient = useIsClient();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [queue, setQueue] = useState([]);
  const queueRef = useRef(queue);
  const [status, setStatus] = useState(null);
  const [statusVariant, setStatusVariant] = useState('info');
  const [isFlushing, setIsFlushing] = useState(false);
  const typingStartRef = useRef(null);
  const flushTimeoutRef = useRef(null);

  useEffect(() => {
    if (!isClient) return;
    const initialQueue = loadQueue();
    if (initialQueue.length) {
      setQueue(initialQueue);
    }
  }, [isClient]);

  useEffect(() => {
    queueRef.current = queue;
    if (isClient) {
      persistQueue(queue);
    }
  }, [queue, isClient]);

  const closeOverlay = useCallback(() => {
    setVisible(false);
    setMessage('');
    typingStartRef.current = null;
  }, []);

  const flushQueue = useCallback(async (urgent = false) => {
    if (isFlushing) return;
    const currentQueue = queueRef.current;
    if (!currentQueue.length) return;

    setIsFlushing(true);
    try {
      const batch = currentQueue.slice(0, batchSize);
      const payload = batch.map((entry) => ({
        action_id: entry.actionId,
        url: entry.url,
        route: entry.route,
        message: entry.message,
        metadata: entry.metadata,
        userAgent: entry.metadata?.user_agent
      }));

      const response = await authenticatedFetch('/api/v1/tester-feedback/batch', {
        method: 'POST',
        body: JSON.stringify({ entries: payload })
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        const accepted = new Set(data.action_ids || []);
        setQueue((prev) => prev.filter((entry) => !accepted.has(entry.actionId)));
        if (!urgent) {
          setStatus('Thanks for the note.');
          setStatusVariant('success');
        }
      } else if (response.status === 403) {
        setQueue([]);
        setStatus('Feedback channel disabled.');
        setStatusVariant('error');
      } else {
        setQueue((prev) =>
          prev.map((entry) =>
            batch.some((item) => item.actionId === entry.actionId)
              ? { ...entry, attempts: (entry.attempts || 0) + 1 }
              : entry
          )
        );
        if (!urgent) {
          setStatus('We could not send that yet, trying again shortly.');
          setStatusVariant('warning');
        }
      }
    } catch (error) {
      console.error('[TesterFeedback] flush failed', error);
      setQueue((prev) =>
        prev.map((entry, index) =>
          index < batchSize ? { ...entry, attempts: (entry.attempts || 0) + 1 } : entry
        )
      );
      if (!urgent) {
        setStatus('We could not reach the server, retrying soon.');
        setStatusVariant('warning');
      }
  } finally {
    setIsFlushing(false);
  }
  }, [authenticatedFetch, isFlushing]);

  const scheduleFlush = useCallback((delay = 1500) => {
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
    }
    flushTimeoutRef.current = setTimeout(() => {
      flushTimeoutRef.current = null;
      flushQueue();
    }, delay);
  }, [flushQueue]);

  useEffect(() => {
    if (!queue.length) return undefined;
    scheduleFlush();
    return () => {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
        flushTimeoutRef.current = null;
      }
    };
  }, [queue, scheduleFlush]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && queueRef.current.length) {
        flushQueue(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [flushQueue]);

  const handleSubmit = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      setStatus('Share a little context so we can help.');
      setStatusVariant('warning');
      return;
    }

    const actionId = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const entry = createEntry({ actionId, message: trimmed, typingStartedAt: typingStartRef.current });
    setQueue((prev) => [...prev, entry]);
    setMessage('');
    typingStartRef.current = null;
    setVisible(false);
    setStatus('Thanks! Sending in the background.');
    setStatusVariant('success');
  }, [message]);

  const handleInputChange = useCallback((event) => {
    if (!typingStartRef.current) {
      typingStartRef.current = new Date().toISOString();
    }
    setMessage(event.target.value);
  }, []);

  const computedFeatureFlag = typeof isTesterFeedbackEnabled === 'function'
    ? isTesterFeedbackEnabled()
    : envFeatureFlag;
  const canShow = computedFeatureFlag && isClient && isAuthenticated && user?.tester;
  const queueSize = queue.length;

  const portalNode = useMemo(() => {
    if (!isClient) return null;
    const node = document.createElement('div');
    node.setAttribute('id', 'tester-feedback-root');
    return node;
  }, [isClient]);

  useEffect(() => {
    if (!portalNode || !isClient) return undefined;
    document.body.appendChild(portalNode);
    return () => {
      document.body.removeChild(portalNode);
    };
  }, [portalNode, isClient]);

  if (!canShow) {
    return null;
  }

  const overlay = visible ? (
    <OverlayBackdrop>
      <OverlayCard>
        <OverlayHeader>
          <h2>Thoughts? Feelings? Requests? Complaints?</h2>
          <CloseButton onClick={closeOverlay} aria-label="Close feedback form">
            ×
          </CloseButton>
        </OverlayHeader>
        <TextArea
          value={message}
          placeholder="Tell us what felt rough, broke, or needs love."
          onChange={handleInputChange}
        />
        <ActionsRow>
          <SecondaryButton onClick={closeOverlay}>Cancel</SecondaryButton>
          <SubmitButton onClick={handleSubmit} disabled={!message.trim()}>
            Submit
          </SubmitButton>
        </ActionsRow>
        {status && <StatusText $variant={statusVariant}>{status}</StatusText>}
      </OverlayCard>
    </OverlayBackdrop>
  ) : null;

  const button = (
    <>
      <Badge>DEVELOPMENT TESTING</Badge>
      <FloatingButton onClick={() => setVisible(true)} aria-label="Open feedback form">
        ✶ Give Feedback
        {queueSize > 0 ? (
          <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>{queueSize}</span>
        ) : null}
      </FloatingButton>
      {overlay}
    </>
  );

  if (!portalNode) {
    return button;
  }

  return createPortal(button, portalNode);
};

export default TesterFeedbackWidget;
