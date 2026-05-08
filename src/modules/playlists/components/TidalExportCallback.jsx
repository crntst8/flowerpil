import React, { useEffect, useState, useRef } from 'react';
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
    // BroadcastChannel not available or blocked; fall back to storage
  }
  try {
    window.localStorage?.setItem(DSP_AUTH_STORAGE_KEY, JSON.stringify({ ...payload, ts: Date.now() }));
    setTimeout(() => {
      try { window.localStorage?.removeItem(DSP_AUTH_STORAGE_KEY); } catch (_) { /* noop */ }
    }, 0);
  } catch (_) {
    // Storage may be unavailable (private browsing, etc.)
  }
};

const TidalExportCallback = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Processing Tidal export authentication...');
  const [showManualClose, setShowManualClose] = useState(false);
  const [redirectHref, setRedirectHref] = useState('');
  const processedRef = useRef(false);

  useEffect(() => {
    const handleCallback = async () => {
      // Guard against React StrictMode double-invocation and accidental re-entry
      if (processedRef.current) return;
      processedRef.current = true;

      console.log('🌊 TIDAL CALLBACK: Starting callback processing');
      const code = searchParams.get('code');
      const error = searchParams.get('error');
      const state = searchParams.get('state');

      console.log('🌊 TIDAL CALLBACK: URL params:', { code: code ? 'received' : 'missing', error, state });

      if (error) {
        setStatus('error');
        setMessage(`Authentication failed: ${error}. You can close this window.`);

        // Notify parent window of error
        const payload = { type: 'TIDAL_EXPORT_AUTH_ERROR', error };
        broadcastAuthEvent(payload);
        if (window.opener) {
          window.opener.postMessage(payload, window.location.origin);
          // Close window after 1 second to give user visual feedback
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
        return;
      }

      if (!code) {
        setStatus('error');
        setMessage('No authorization code received. You can close this window.');

        const payload = { type: 'TIDAL_EXPORT_AUTH_ERROR', error: 'No authorization code received' };
        broadcastAuthEvent(payload);
        if (window.opener) {
          window.opener.postMessage(payload, window.location.origin);
          // Close window after 1 second to give user visual feedback
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
        return;
      }

      try {
        console.log('🌊 TIDAL CALLBACK: Making API request to callback endpoint');
        // Call the export OAuth callback endpoint
        const csrfToken = getCsrfToken();
        const response = await fetch('/api/v1/export/auth/tidal/callback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
          },
          credentials: 'include',
          body: JSON.stringify({
            code,
            state
          })
        });

        console.log('🌊 TIDAL CALLBACK: API response status:', response.status);
        const result = await response.json();
        console.log('🌊 TIDAL CALLBACK: API response data:', result);

        if (response.ok && result.success) {
          setStatus('success');
          setMessage('✓ Successfully connected! This window will close automatically.');

          // Notify parent window of success
          const payload = {
            type: 'TIDAL_EXPORT_AUTH_SUCCESS',
            data: result.data,
            state
          };
          broadcastAuthEvent(payload);
          if (window.opener) {
            window.opener.postMessage(payload, window.location.origin);
            // Close window after 1 second to give user visual feedback
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
        } else {
          throw new Error(result.error || 'Authentication failed');
        }
      } catch (error) {
        console.error('Tidal export callback error:', error);
        setStatus('error');
        setMessage(`Authentication failed: ${error.message}. You can close this window.`);

        // Notify parent window of error
        const payload = { type: 'TIDAL_EXPORT_AUTH_ERROR', error: error.message };
        broadcastAuthEvent(payload);
        if (window.opener) {
          window.opener.postMessage(payload, window.location.origin);
          // Close window after 1 second to give user visual feedback
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
      }
    };

    handleCallback();
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
};

// Styled Components
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
  font-size: 48px;
  margin-bottom: 20px;
  
  ${props => props.$status === 'processing' && `
    animation: pulse 1s infinite;
  `}
  
  @keyframes pulse {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }
`;

const StatusMessage = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: 16px;
  color: ${theme.colors.white};
  line-height: 1.5;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const ManualCloseButton = styled.button`
  margin-top: ${theme.spacing.lg};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: transparent;
  border: ${theme.borders.solidThin} ${theme.colors.white};
  color: ${theme.colors.white};
  cursor: pointer;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.8;
  }
`;

const ManualLink = styled.a`
  display: inline-block;
  margin-top: ${theme.spacing.lg};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${theme.colors.white};
  text-decoration: underline;
`;

export default TidalExportCallback;
