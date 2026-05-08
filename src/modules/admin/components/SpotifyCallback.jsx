import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

const DSP_AUTH_CHANNEL = 'flowerpil-dsp-auth';
const DSP_AUTH_STORAGE_KEY = 'flowerpil:dsp-auth-event';
const REDIRECT_FALLBACK = '/curator-admin?tab=dsp';

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
    // Ignore BroadcastChannel failures; fall back to storage
  }
  try {
    window.localStorage?.setItem(DSP_AUTH_STORAGE_KEY, JSON.stringify({ ...payload, ts: Date.now() }));
    setTimeout(() => {
      try { window.localStorage?.removeItem(DSP_AUTH_STORAGE_KEY); } catch (_) { /* noop */ }
    }, 0);
  } catch (_) {
    // Storage may be unavailable (private mode, etc.)
  }
};

const SpotifyCallback = () => {
  const processedRef = useRef(false);
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Completing Spotify authentication...');
  const [showManualClose, setShowManualClose] = useState(false);
  const [redirectHref, setRedirectHref] = useState('');

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');

    const hasOpener = !!(window.opener && !window.opener.closed);

    const notifyAndClose = (payload) => {
      broadcastAuthEvent(payload);

      // Update status immediately to show feedback
      if (payload.type === 'SPOTIFY_AUTH_SUCCESS') {
        setStatus('success');
        setMessage('✓ Successfully connected! This window will close automatically.');
      } else {
        setStatus('error');
        setMessage(`Authentication failed: ${payload.error || 'Unknown error'}. You can close this window.`);
      }

      if (hasOpener) {
        try { window.opener.postMessage(payload, window.location.origin); } catch (_) { /* noop */ }

        // Close window after 1 second to give user visual feedback
        setTimeout(() => {
          window.close();
          // Check if window actually closed after another 400ms
          setTimeout(() => {
            if (!window.closed) {
              setShowManualClose(true);
            }
          }, 400);
        }, 1000);
      } else {
        if (payload.type === 'SPOTIFY_AUTH_SUCCESS') {
          setMessage('Spotify authentication successful! You can return to Flowerpil.');
        }
        setRedirectHref(REDIRECT_FALLBACK);
      }
    };

    if (error) {
      notifyAndClose({ type: 'SPOTIFY_AUTH_ERROR', error });
      return;
    }

    if (!code) {
      notifyAndClose({ type: 'SPOTIFY_AUTH_ERROR', error: 'No authorization code received' });
      return;
    }

    if (hasOpener) {
      notifyAndClose({ type: 'SPOTIFY_AUTH_SUCCESS', code, state });
      return;
    }

    (async () => {
      try {
        const csrfToken = getCsrfToken();
        const response = await fetch('/api/v1/export/auth/spotify/callback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
          },
          credentials: 'include',
          body: JSON.stringify({ code, state })
        });
        let result = {};
        try {
          result = await response.json();
        } catch (_) {
          result = {};
        }
        if (response.ok && result?.success) {
          notifyAndClose({ type: 'SPOTIFY_AUTH_SUCCESS', state, handled: true });
        } else {
          throw new Error(result?.error || 'Spotify authentication failed');
        }
      } catch (err) {
        notifyAndClose({ type: 'SPOTIFY_AUTH_ERROR', error: err.message });
      }
    })();
  }, []);

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
        {!showManualClose && !redirectHref && (
          <SubText>This window will close automatically.</SubText>
        )}
      </CallbackContent>
    </CallbackContainer>
  );
};

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
  max-width: 400px;
`;

const StatusIcon = styled.div`
  font-size: 42px;
  margin-bottom: ${theme.spacing.md};
`;

const StatusMessage = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-bottom: ${theme.spacing.md};
`;

const SubText = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[600]};
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

export default SpotifyCallback;
