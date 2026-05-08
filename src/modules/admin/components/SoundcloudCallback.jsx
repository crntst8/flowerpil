import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

const DSP_AUTH_CHANNEL = 'flowerpil-dsp-auth';
const DSP_AUTH_STORAGE_KEY = 'flowerpil:dsp-auth-event';
const REDIRECT_FALLBACK = '/curator-admin?tab=dsp';

const broadcastAuthEvent = (payload) => {
  if (typeof window === 'undefined') return;
  try {
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel(DSP_AUTH_CHANNEL);
      channel.postMessage(payload);
      setTimeout(() => channel.close(), 0);
    }
  } catch (_) {
    // ignore BroadcastChannel issues
  }
  try {
    window.localStorage?.setItem(DSP_AUTH_STORAGE_KEY, JSON.stringify({ ...payload, ts: Date.now() }));
    setTimeout(() => {
      try { window.localStorage?.removeItem(DSP_AUTH_STORAGE_KEY); } catch (_) { /* noop */ }
    }, 0);
  } catch (_) {
    // storage may be unavailable
  }
};

const SoundcloudCallback = () => {
  const processedRef = useRef(false);
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Completing SoundCloud authentication...');
  const [showManualClose, setShowManualClose] = useState(false);
  const [redirectHref, setRedirectHref] = useState('');

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    const hasOpener = !!(window.opener && !window.opener.closed);

    const notifyAndClose = (payload) => {
      broadcastAuthEvent(payload);
      if (payload.type === 'SOUNDCLOUD_AUTH_SUCCESS') {
        setStatus('success');
        setMessage('✓ SoundCloud connected. This window will close automatically.');
      } else {
        setStatus('error');
        setMessage(`Authentication failed: ${payload.error || 'Unknown error'}. You can close this window.`);
      }

      if (hasOpener) {
        try { window.opener.postMessage(payload, window.location.origin); } catch (_) { /* noop */ }

        setTimeout(() => {
          window.close();
          setTimeout(() => { if (!window.closed) setShowManualClose(true); }, 400);
        }, 1000);
      } else {
        if (payload.type === 'SOUNDCLOUD_AUTH_SUCCESS') {
          setMessage('SoundCloud authentication successful! You can return to Flowerpil.');
        }
        setRedirectHref(REDIRECT_FALLBACK);
      }
    };

    if (error) {
      notifyAndClose({ type: 'SOUNDCLOUD_AUTH_ERROR', error });
      return;
    }

    if (!code) {
      notifyAndClose({ type: 'SOUNDCLOUD_AUTH_ERROR', error: 'No authorization code received' });
      return;
    }

    notifyAndClose({ type: 'SOUNDCLOUD_AUTH_SUCCESS', code, state });
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
  max-width: 420px;
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
  color: ${theme.colors.white};
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
  cursor: pointer;
`;

const ManualLink = styled.a`
  display: inline-block;
  margin-top: ${theme.spacing.md};
  padding: ${theme.spacing.xs} ${theme.spacing.md};
  border: 1px solid ${theme.colors.gray[500]};
  color: ${theme.colors.gray[100]};
  font-family: ${theme.fonts.mono};
  letter-spacing: 0.05em;
  text-decoration: none;
`;

export default SoundcloudCallback;
