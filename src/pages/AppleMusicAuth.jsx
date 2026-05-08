import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { theme } from '../shared/styles/GlobalStyles';
import { useAuth } from '../shared/contexts/AuthContext';
import { safeJson } from '../shared/utils/jsonUtils';

export default function AppleMusicAuth() {
  const { authenticatedFetch } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('Initializing Apple Music...');
  const [error, setError] = useState('');

  useEffect(() => {
    const authorize = async () => {
      try {
        // Get developer token from session or fetch new one
        let devToken = sessionStorage.getItem('apple_dev_token');
        if (!devToken) {
          setStatus('Fetching authorization token...');
          const res = await authenticatedFetch('/api/v1/apple/developer-token', { method: 'GET' });
          const json = await safeJson(res, { context: 'Get Apple developer token' });
          if (!res.ok || !json.success) throw new Error(json.error || 'Failed to get token');
          devToken = json.data.token;
        }

        setStatus('Loading Apple Music SDK...');

        // Load MusicKit if not already loaded - poll for full initialization
        await new Promise((resolve, reject) => {
          const checkReady = () => {
            return window.MusicKit &&
                   typeof window.MusicKit.configure === 'function' &&
                   typeof window.MusicKit.getInstance === 'function';
          };

          if (checkReady()) return resolve();

          const existing = document.querySelector('script[src="https://js-cdn.music.apple.com/musickit/v3/musickit.js"]');
          if (existing) {
            // Script exists, poll for MusicKit to be fully ready
            let attempts = 0;
            const check = setInterval(() => {
              if (checkReady()) {
                clearInterval(check);
                resolve();
              } else if (attempts++ > 100) {
                // 10 seconds timeout
                clearInterval(check);
                reject(new Error('MusicKit initialization timeout'));
              }
            }, 100);
            return;
          }

          const script = document.createElement('script');
          script.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
          script.async = true;
          script.onload = () => {
            // Poll for MusicKit to be fully ready after script loads
            let attempts = 0;
            const check = setInterval(() => {
              if (checkReady()) {
                clearInterval(check);
                resolve();
              } else if (attempts++ > 100) {
                clearInterval(check);
                reject(new Error('MusicKit object not initialized'));
              }
            }, 100);
          };
          script.onerror = () => reject(new Error('Failed to load MusicKit script'));
          document.head.appendChild(script);
        });

        setStatus('Configuring...');

        // Wait 200ms for MusicKit internal constructors to fully initialize
        // This prevents "D is not a constructor" errors with MusicKit v3
        await new Promise(resolve => setTimeout(resolve, 200));

        const MK = window.MusicKit;

        if (!MK || typeof MK.configure !== 'function') {
          throw new Error('MusicKit not properly initialized');
        }

        let music;
        let retryCount = 0;
        const maxRetries = 3;

        while (!music && retryCount < maxRetries) {
          try {
            music = MK.getInstance();
            if (music) {
              console.log('[Apple Auth] Got existing instance');
              break;
            }
          } catch (err) {
            console.log(`[Apple Auth] getInstance attempt ${retryCount + 1} failed:`, err);
          }

          // If getInstance failed, try configure
          try {
            console.log('[Apple Auth] Attempting to configure MusicKit');
            MK.configure({ developerToken: devToken, app: { name: 'Flowerpil', build: '1.0.0' } });
            music = MK.getInstance();
            if (music) {
              console.log('[Apple Auth] Configuration successful');
              break;
            }
          } catch (configErr) {
            console.error(`[Apple Auth] Configuration attempt ${retryCount + 1} error:`, configErr);
          }

          retryCount++;
          if (retryCount < maxRetries) {
            // Wait longer each retry: 500ms, 1000ms, 1500ms
            const delay = 500 * retryCount;
            console.log(`[Apple Auth] Waiting ${delay}ms before retry ${retryCount + 1}`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }

        if (!music) throw new Error('Failed to get MusicKit instance after retries');

        // Check if already authorized
        if (music.isAuthorized && music.musicUserToken) {
          setStatus('Already authorized, saving...');
          const saveRes = await authenticatedFetch('/api/v1/apple/auth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ musicUserToken: music.musicUserToken })
          });
          const saveJson = await safeJson(saveRes, { context: 'Save Apple Music token' });
          if (!saveRes.ok || !saveJson.success) throw new Error(saveJson.error || 'Failed to save');

          setStatus('Success! Redirecting...');
          const returnUrl = sessionStorage.getItem('apple_auth_return_url') || '/curator/dashboard';
          sessionStorage.removeItem('apple_auth_redirect');
          sessionStorage.removeItem('apple_dev_token');
          sessionStorage.removeItem('apple_auth_return_url');
          sessionStorage.setItem('apple_auth_success', 'true');
          setTimeout(() => navigate(returnUrl), 1000);
          return;
        }

        // Authorize (this page load IS the user gesture, so popup should work)
        setStatus('Waiting for Apple Music authorization...');
        const mut = await music.authorize();

        if (!mut) throw new Error('Authorization was cancelled');

        setStatus('Saving authorization...');
        const saveRes = await authenticatedFetch('/api/v1/apple/auth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ musicUserToken: mut })
        });
        const saveJson = await safeJson(saveRes, { context: 'Save Apple Music token' });
        if (!saveRes.ok || !saveJson.success) throw new Error(saveJson.error || 'Failed to save authorization');

        setStatus('Success! Redirecting...');
        const returnUrl = sessionStorage.getItem('apple_auth_return_url') || '/curator/dashboard';
        sessionStorage.removeItem('apple_auth_redirect');
        sessionStorage.removeItem('apple_dev_token');
        sessionStorage.removeItem('apple_auth_return_url');
        sessionStorage.setItem('apple_auth_success', 'true');
        setTimeout(() => navigate(returnUrl), 1000);

      } catch (err) {
        console.error('[Apple Auth Page] Error:', err);
        setError(err.message || 'Authorization failed');
        setStatus('');
      }
    };

    authorize();
  }, [authenticatedFetch, navigate]);

  const handleReturn = () => {
    const returnUrl = sessionStorage.getItem('apple_auth_return_url') || '/curator/dashboard';
    sessionStorage.removeItem('apple_auth_return_url');
    sessionStorage.removeItem('apple_auth_redirect');
    sessionStorage.removeItem('apple_dev_token');
    navigate(returnUrl);
  };

  return (
    <Container>
      <Card>
        <Logo>🍎</Logo>
        <Title>Apple Music Authorization</Title>
        {status && <Status>{status}</Status>}
        {error && (
          <>
            <Error>{error}</Error>
            <Button onClick={handleReturn}>
              Return to Dashboard
            </Button>
          </>
        )}
      </Card>
    </Container>
  );
}

const Container = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(155deg, rgba(245, 244, 243, 0.95), rgba(230, 229, 226, 0.92));
  padding: ${theme.spacing.lg};
`;

const Card = styled.div`
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.black};
  padding: ${theme.spacing.xl};
  max-width: 500px;
  width: 100%;
  text-align: center;
`;

const Logo = styled.div`
  font-size: 64px;
  margin-bottom: ${theme.spacing.md};
`;

const Title = styled.h1`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h2};
  margin-bottom: ${theme.spacing.md};
`;

const Status = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  color: ${theme.colors.black};
  margin-bottom: ${theme.spacing.md};
`;

const Error = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  color: ${theme.colors.danger};
  margin-bottom: ${theme.spacing.md};
`;

const Button = styled.button`
  background: ${theme.colors.black};
  color: ${theme.colors.fpwhite};
  border: none;
  padding: ${theme.spacing.sm} ${theme.spacing.lg};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  cursor: pointer;
  width: 100%;

  &:hover {
    opacity: 0.9;
  }
`;
