import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

const DSP_AUTH_CHANNEL = 'flowerpil-dsp-auth';
const DSP_AUTH_STORAGE_KEY = 'flowerpil:dsp-auth-event';

const getCsrfToken = () => {
  try {
    const match = document.cookie.match(/(?:^|; )csrf_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  } catch (_) {
    return '';
  }
};

const broadcastAuthEvent = (payload) => {
  if (typeof window === 'undefined') return;
  try {
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel(DSP_AUTH_CHANNEL);
      channel.postMessage(payload);
      setTimeout(() => channel.close(), 0);
    }
  } catch (_) {
    // Fall through to localStorage broadcast
  }
  try {
    window.localStorage?.setItem(DSP_AUTH_STORAGE_KEY, JSON.stringify({ ...payload, ts: Date.now() }));
    setTimeout(() => {
      try { window.localStorage?.removeItem(DSP_AUTH_STORAGE_KEY); } catch (_) { /* noop */ }
    }, 0);
  } catch (_) {
    // Storage may be unavailable
  }
};

export default function YouTubeMusicExportCallback() {
  const [searchParams] = useSearchParams();
  const processedRef = useRef(false);
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Completing YouTube Music authentication...');
  const [showManualClose, setShowManualClose] = useState(false);
  const [redirectHref, setRedirectHref] = useState('');

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const state = searchParams.get('state');

    const hasOpener = !!(window.opener && !window.opener.closed);

    const notifyAndMaybeClose = (payload) => {
      broadcastAuthEvent(payload);
      if (hasOpener) {
        try { window.opener.postMessage(payload, window.location.origin); } catch (_) { /* noop */ }
        setTimeout(() => {
          window.close();
          setTimeout(() => {
            if (!window.closed) {
              setShowManualClose(true);
            }
          }, 400);
        }, 1000);
        return;
      }
      setRedirectHref('/curator-admin?tab=dsp');
    };

    if (error) {
      setStatus('error');
      setMessage(`Authentication failed: ${error}. You can close this window.`);
      notifyAndMaybeClose({ type: 'YOUTUBE_MUSIC_EXPORT_AUTH_ERROR', error, state });
      return;
    }

    if (!code) {
      setStatus('error');
      setMessage('No authorization code received. You can close this window.');
      notifyAndMaybeClose({ type: 'YOUTUBE_MUSIC_EXPORT_AUTH_ERROR', error: 'No authorization code received', state });
      return;
    }

    (async () => {
      try {
        const csrfToken = getCsrfToken();
        const response = await fetch('/api/v1/export/auth/youtube_music/callback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
          },
          credentials: 'include',
          body: JSON.stringify({ code, state })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Authentication failed');
        }

        setStatus('success');
        setMessage('✓ Successfully connected! This window will close automatically.');
        notifyAndMaybeClose({ type: 'YOUTUBE_MUSIC_EXPORT_AUTH_SUCCESS', data: result.data, state });
      } catch (err) {
        setStatus('error');
        setMessage(`Authentication failed: ${err.message}. You can close this window.`);
        notifyAndMaybeClose({ type: 'YOUTUBE_MUSIC_EXPORT_AUTH_ERROR', error: err.message, state });
      }
    })();
  }, [searchParams]);

  return (
    <CallbackContainer>
      <CallbackContent>
        <StatusIcon $status={status}>
          {status === 'processing' && '⏳'}
          {status === 'success' && '✅'}
          {status === 'error' && '❌'}
        </StatusIcon>
        <StatusMessage>{message}</StatusMessage>
        {showManualClose && (
          <ManualCloseButton type="button" onClick={() => window.close()}>
            Close this window
          </ManualCloseButton>
        )}
        {!showManualClose && redirectHref && (
          <ManualLink href={redirectHref}>
            Return to Flowerpil
          </ManualLink>
        )}
      </CallbackContent>
    </CallbackContainer>
  );
}

const CallbackContainer = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${theme.colors.black};
  padding: 20px;
`;

const CallbackContent = styled.div`
  text-align: center;
  max-width: 420px;
`;

const StatusIcon = styled.div`
  font-size: 48px;
  margin-bottom: 20px;
  
  ${props => props.$status === 'processing' && `
    animation: pulse 1s infinite;
  `}
  
  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
  }
`;

const StatusMessage = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-bottom: 20px;
`;

const ManualCloseButton = styled.button`
  margin-top: ${theme.spacing.md};
  padding: ${theme.spacing.xs} ${theme.spacing.md};
  background: transparent;
  border: 1px solid ${theme.colors.gray[500]};
  color: ${theme.colors.gray[100]};
  font-family: ${theme.fonts.mono};
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
`;

const ManualLink = styled.a`
  display: inline-block;
  margin-top: ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  letter-spacing: 0.05em;
  color: ${theme.colors.gray[100]};
  text-transform: uppercase;
  text-decoration: none;
  border-bottom: 1px solid ${theme.colors.gray[500]};
  padding-bottom: 2px;
`;

