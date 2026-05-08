import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import styled, { keyframes, css } from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import ReusableHeader from '@shared/components/ReusableHeader';
import ExpandableTrack from '@modules/playlists/components/ExpandableTrack';
import PlatformIcon from '@shared/components/PlatformIcon';
import { useAuth } from '@shared/contexts/AuthContext';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const LOADING_MESSAGES = ['importing...', 'cross-linking...', 'almost there...'];

export default function QuickImportPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, authenticatedFetch } = useAuth();

  const [inputUrl, setInputUrl] = useState('');
  const [state, setState] = useState('idle'); // idle | loading | result | error
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingText, setLoadingText] = useState(LOADING_MESSAGES[0]);
  const [savingToDraft, setSavingToDraft] = useState(false);

  const loadingIdx = useRef(0);
  const hasAutoResolved = useRef(false);

  // Cycling loading text
  useEffect(() => {
    if (state !== 'loading') return;
    loadingIdx.current = 0;
    setLoadingText(LOADING_MESSAGES[0]);
    const interval = setInterval(() => {
      loadingIdx.current = (loadingIdx.current + 1) % LOADING_MESSAGES.length;
      setLoadingText(LOADING_MESSAGES[loadingIdx.current]);
    }, 2500);
    return () => clearInterval(interval);
  }, [state]);

  // Auto-resolve from ?url= param
  useEffect(() => {
    const urlParam = searchParams.get('url');
    if (urlParam && !hasAutoResolved.current) {
      hasAutoResolved.current = true;
      setInputUrl(urlParam);
      resolveUrl(urlParam);
    }
  }, [searchParams]);

  const resolveUrl = useCallback(async (url) => {
    const trimmed = (url || '').trim();
    if (!trimmed) return;

    setState('loading');
    setErrorMsg('');
    setResult(null);

    try {
      const response = await fetch(`${API_BASE}/api/v1/quick-import/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: trimmed })
      });

      const data = await response.json();

      if (!response.ok) {
        setState('error');
        setErrorMsg(data.error || 'Failed to resolve URL');
        return;
      }

      setResult(data.data);
      setState('result');

      // Update URL bar for shareability
      const shareUrl = data.data.url || trimmed;
      window.history.replaceState(null, '', `/go?url=${encodeURIComponent(shareUrl)}`);
    } catch (err) {
      setState('error');
      setErrorMsg(err.message || 'Network error');
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    resolveUrl(inputUrl);
  };

  const handleReset = () => {
    setState('idle');
    setResult(null);
    setErrorMsg('');
    setInputUrl('');
    hasAutoResolved.current = false;
    window.history.replaceState(null, '', '/go');
  };

  const handleSaveToDraft = async () => {
    if (!isAuthenticated || savingToDraft) return;
    setSavingToDraft(true);

    try {
      const createRes = await authenticatedFetch(`${API_BASE}/api/v1/url-import/jobs`, {
        method: 'POST',
        body: JSON.stringify({ url: inputUrl })
      });
      const createData = await createRes.json();

      if (!createRes.ok || !createData.data?.jobId) {
        throw new Error(createData.error || 'Failed to create import job');
      }

      const jobId = createData.data.jobId;

      const poll = async () => {
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const pollRes = await authenticatedFetch(`${API_BASE}/api/v1/url-import/jobs/${jobId}`);
          const pollData = await pollRes.json();
          const job = pollData.data;

          if (job?.status === 'completed') {
            const playlistId = job.result?.playlist_id || job.target_playlist_id;
            if (playlistId) {
              navigate(`/curator/playlist/edit/${playlistId}`);
            }
            return;
          }
          if (job?.status === 'failed') {
            throw new Error(job.last_error || 'Import job failed');
          }
        }
        throw new Error('Import timed out');
      };

      await poll();
    } catch (err) {
      console.error('Save to draft failed:', err);
      setErrorMsg(err.message);
    } finally {
      setSavingToDraft(false);
    }
  };

  const isCurator = isAuthenticated && user?.role === 'curator';

  // --- IDLE STATE ---
  if (state === 'idle') {
    return (
      <IdleContainer>
        <IdleContent>
          <LogoEntrance>
            <Link to="/home">
              <TextLogo src="/text.png" alt="Flowerpil" />
            </Link>
          </LogoEntrance>
          <Tagline>
            paste any link from any dsp platform
            <br />
            <b>get the links for all the others.</b>
          </Tagline>
          <ImportForm onSubmit={handleSubmit}>
            <InputWrapper>
              <UrlInput
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="https://open.spotify.com/playlist/..."
                autoFocus
              />
            </InputWrapper>
            <GoButton type="submit" disabled={!inputUrl.trim()}>
              go
            </GoButton>
          </ImportForm>
          <IdleFooter>
            <FooterLink to="/home">discover playlists & curators →</FooterLink>
          </IdleFooter>
        </IdleContent>
      </IdleContainer>
    );
  }

  // --- LOADING STATE ---
  if (state === 'loading') {
    return (
      <IdleContainer>
        <LoadingContent>
          <JitterFlower src="/logo-nobg.png" alt="Loading" />
          <LoadingTextStyled key={loadingText}>{loadingText}</LoadingTextStyled>
        </LoadingContent>
      </IdleContainer>
    );
  }

  // --- ERROR STATE ---
  if (state === 'error') {
    return (
      <IdleContainer>
        <IdleContent>
          <TextLogo src="/text.png" alt="Flowerpil" style={{ opacity: 0.6 }} />
          <ErrorText>{errorMsg}</ErrorText>
          <ErrorHint>supported: spotify, apple music, tidal, soundcloud, youtube, bandcamp</ErrorHint>
          <ResetButtonDark onClick={handleReset}>try again</ResetButtonDark>
        </IdleContent>
      </IdleContainer>
    );
  }

  // --- RESULT STATE ---
  const isTrack = result?.kind === 'track';

  return (
    <ResultPage>
      <ResultTopZone>
        <ReusableHeader />
        <TopZoneContent>
          {/* Auth-aware banner */}
          {isCurator ? (
            <DraftBanner>
              <DraftButton onClick={handleSaveToDraft} disabled={savingToDraft}>
                {savingToDraft ? 'saving...' : 'save as draft'}
              </DraftButton>
            </DraftBanner>
          ) : (
            <CtaBanner>
              to save, share & export, <SignupLink to="/signup">create a (free) account</SignupLink>
            </CtaBanner>
          )}
        </TopZoneContent>
      </ResultTopZone>
      <ResultContainer>
        {isTrack ? (
          <TrackCard>
            <ExpandableTrack
              track={result.track}
              showCopyButton={false}
            />
          </TrackCard>
        ) : (
          <>
            <PlaylistHeader>
              {result.playlist?.image && (
                <PlaylistImage src={result.playlist.image} alt={result.playlist.title} />
              )}
              <PlaylistMeta>
                <PlaylistTitle>{result.playlist?.title}</PlaylistTitle>
                <PlatformLine>
                  <PlatformIcon platform={result.platform} size={18} />
                  <span>Imported from {result.platform}</span>
                </PlatformLine>
                <TrackCount>{result.playlist?.trackCount || result.tracks?.length || 0} tracks</TrackCount>
              </PlaylistMeta>
            </PlaylistHeader>

            <TrackListContainer>
              <TrackList>
                {(result.tracks || []).map((track, idx) => (
                  <ExpandableTrack
                    key={`qi-${idx}`}
                    track={track}
                    index={idx}
                    showCopyButton={false}
                  />
                ))}
              </TrackList>
            </TrackListContainer>
          </>
        )}

        {errorMsg && <InlineError>{errorMsg}</InlineError>}

        <ResetButton onClick={handleReset}>import another</ResetButton>
      </ResultContainer>
    </ResultPage>
  );
}

/* ── Animations ── */

const fadeUp = keyframes`
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const breathe = keyframes`
  0%, 100% { transform: scale(1); opacity: 0.7; }
  50% { transform: scale(1.06); opacity: 1; }
`;

const textSwap = keyframes`
  0% { opacity: 0; transform: translateY(6px); }
  15% { opacity: 1; transform: translateY(0); }
  85% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-6px); }
`;

const softGlow = keyframes`
  0%, 100% { filter: brightness(0) invert(1) drop-shadow(0 0 10px rgba(255, 255, 255, 0.1)); }
  50% { filter: brightness(0) invert(1) drop-shadow(0 0 22px rgba(255, 255, 255, 0.25)); }
`;

/* ── Idle / Loading / Error Layout ── */

const IdleContainer = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${theme.spacing.xl};
  background: radial-gradient(ellipse at 30% 20%, rgba(30, 30, 30, 1) 0%, transparent 60%),
              radial-gradient(ellipse at 70% 80%, rgba(20, 20, 20, 0.8) 0%, transparent 50%),
              ${theme.colors.black};
`;

const IdleContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: ${theme.spacing.lg};
  max-width: 520px;
  width: 100%;
`;

const LoadingContent = styled(IdleContent)`
  gap: ${theme.spacing.xl};
`;

const LogoEntrance = styled.div`
  animation: ${fadeUp} 0.6s ease-out both;
`;

const TextLogo = styled.img`
  height: 80px;
  width: auto;
  max-width: 320px;
  object-fit: contain;
  filter: brightness(0) invert(1) drop-shadow(0 4px 18px rgba(255, 255, 255, 0.06));

  ${mediaQuery.mobile} {
    height: 60px;
    max-width: 240px;
  }
`;

const JitterFlower = styled.img`
  width: 80px;
  height: 80px;
  object-fit: contain;
  filter: brightness(0) invert(1);
  animation: ${breathe} 3s ease-in-out infinite;
`;

const Tagline = styled.p`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h3};
  font-weight: ${theme.fontWeights.regular};
  color: ${theme.colors.white};
  animation: ${fadeUp} 0.6s ease-out 0.15s both;
`;

const ImportForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  width: 100%;
  animation: ${fadeUp} 0.6s ease-out 0.3s both;
`;

const InputWrapper = styled.div`
  position: relative;
`;

const UrlInput = styled.input`
  width: 100%;
  min-height: 48px;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  border: ${theme.borders.solid} rgba(5, 126, 255, 0.2);
  border-radius: 0;
  background: rgba(239, 231, 231, 0.93);
  backdrop-filter: blur(8px);
  color: ${theme.colors.black};
  outline: none;
  box-sizing: border-box;
  transition: border-color ${theme.transitions.fast},
              box-shadow ${theme.transitions.normal};

  &:focus {
   border-color: rgba(255, 255, 255, 0.5);
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.79),
                0 8px 24px -8px rgba(216, 205, 205, 0.3);
  }

  &::placeholder {
    color: rgba(0, 0, 0, 0.3);
  }
`;

const GoButton = styled.button`
  min-height: 48px;
  padding: ${theme.spacing.sm} ${theme.spacing.lg};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  text-transform: uppercase;
  letter-spacing: 0.12em;
  background: ${theme.colors.primary};
  color: ${theme.colors.black};
  border: none;
  border-radius: 0;
  cursor: pointer;
  box-shadow: 3px 3px 0 rgba(255, 255, 255, 0.3);
  transition: box-shadow ${theme.transitions.fast},
              transform ${theme.transitions.fast},
              opacity ${theme.transitions.fast};

  &:hover:not(:disabled) {
    box-shadow: 4px 4px 0 rgba(255, 255, 255, 0.4);
    transform: translate(-1px, -1px);
  }

  &:active:not(:disabled) {
    box-shadow: 2px 2px 0 rgba(14, 227, 78, 0.86);
    transform: translate(1px, 1px);
  }

  &:disabled {
    opacity: 0.25;
    cursor: default;
  }
`;

const LoadingTextStyled = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: ${theme.colors.white};
  animation: ${textSwap} 2.5s ease-in-out;
`;

const ErrorText = styled.p`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  color: rgba(255, 255, 255, 0.55);
  animation: ${fadeIn} 0.3s ease-out;
`;

const ErrorHint = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.3);
  animation: ${fadeIn} 0.3s ease-out 0.15s both;
`;

const ResetButton = styled.button`
  min-height: 44px;
  padding: ${theme.spacing.sm} ${theme.spacing.lg};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.1em;
  background: transparent;
  color: ${theme.colors.black};
  border: ${theme.borders.solid} ${theme.colors.black};
  border-radius: 0;
  cursor: pointer;
  box-shadow: 3px 3px 0 ${theme.colors.black};
  transition: box-shadow ${theme.transitions.fast},
              transform ${theme.transitions.fast};
  margin-top: ${theme.spacing.lg};

  &:hover {
    box-shadow: 4px 4px 0 ${theme.colors.black};
    transform: translate(-1px, -1px);
  }

  &:active {
    box-shadow: 2px 2px 0 ${theme.colors.black};
    transform: translate(1px, 1px);
  }
`;

const ResetButtonDark = styled(ResetButton)`
  color: ${theme.colors.white};
  border-color: rgba(255, 255, 255, 0.5);
  box-shadow: 3px 3px 0 rgba(255, 255, 255, 0.3);

  &:hover {
    box-shadow: 4px 4px 0 rgba(255, 255, 255, 0.4);
    transform: translate(-1px, -1px);
  }

  &:active {
    box-shadow: 2px 2px 0 rgba(255, 255, 255, 0.2);
    transform: translate(1px, 1px);
  }
`;

const IdleFooter = styled.div`
  margin-top: ${theme.spacing.md};
  animation: ${fadeUp} 0.6s ease-out 0.45s both;
`;

const FooterLink = styled(Link)`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h3};
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.25);
  padding-bottom: 1px;
  transition: color ${theme.transitions.fast},
              border-color ${theme.transitions.fast};

  &:hover {
    color: ${theme.colors.white};
    border-color: rgba(255, 255, 255, 0.6);
  }
`;

/* ── Result Layout ── */

const ResultPage = styled.div`
  min-height: 100vh;
  animation: ${fadeIn} 0.35s ease-out;
`;

const ResultTopZone = styled.div`
  background: ${theme.colors.black};
  padding-bottom: ${theme.spacing.xl};
`;

const TopZoneContent = styled.div`
  max-width: 960px;
  margin: 0 auto;
  padding: ${theme.spacing.md} ${theme.spacing.xl} 0;

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.md} ${theme.spacing.lg} 0;
  }
`;

const ResultContainer = styled.div`
  max-width: 960px;
  margin: 0 auto;
  padding: ${theme.spacing.xl};
  display: flex;
  flex-direction: column;
  align-items: center;

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.lg};
  }
`;

const CtaBanner = styled.div`
  width: 100%;
  padding: ${theme.spacing.md} ${theme.spacing.lg};
  border-radius: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h3};
  text-transform: none;
  letter-spacing: 0.05em;
  text-align: center;
  color: rgba(255, 255, 255, 0.6);
  animation: ${fadeUp} 0.5s ease-out both;
`;

const SignupLink = styled(Link)`
  color: ${theme.colors.white};
  text-decoration: underline;
`;

const DraftBanner = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  animation: ${fadeUp} 0.5s ease-out both;
`;

const DraftButton = styled.button`
  min-height: 44px;
  padding: ${theme.spacing.sm} ${theme.spacing.xl};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  text-transform: uppercase;
  letter-spacing: 0.1em;
  background: ${theme.colors.white};
  color: ${theme.colors.black};
  border: none;
  border-radius: 0;
  cursor: pointer;
  box-shadow: 3px 3px 0 rgba(255, 255, 255, 0.3);
  transition: box-shadow ${theme.transitions.fast},
              transform ${theme.transitions.fast},
              opacity ${theme.transitions.fast};

  &:hover:not(:disabled) {
    box-shadow: 4px 4px 0 rgba(255, 255, 255, 0.4);
    transform: translate(-1px, -1px);
  }

  &:active:not(:disabled) {
    box-shadow: 2px 2px 0 rgba(255, 255, 255, 0.2);
    transform: translate(1px, 1px);
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

const PlaylistHeader = styled.div`
  width: 100%;
  display: flex;
  gap: ${theme.spacing.lg};
  align-items: flex-start;
  background: linear-gradient(155deg, rgba(245, 243, 243, 0.95), rgba(230, 229, 226, 0.92));
  border: ${theme.borders.solidThin} rgba(15, 14, 23, 0.08);
  box-shadow: 0 24px 56px -28px rgba(10, 9, 20, 0.45),
              0 2px 4px rgba(0, 0, 0, 0.03);
  border-radius: 0;
  padding: ${theme.spacing.xl};
  margin-bottom: ${theme.spacing.xl};
  animation: ${fadeUp} 0.5s ease-out 0.1s both;

  ${mediaQuery.mobile} {
    flex-direction: column;
    padding: ${theme.spacing.lg};
  }
`;

const PlaylistImage = styled.img`
  width: 140px;
  height: 140px;
  border-radius: 0;
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: 0 8px 20px -6px rgba(0, 0, 0, 0.64);
  transition: transform ${theme.transitions.fast};

  &:hover {
    transform: scale(1.05);
  }

  ${mediaQuery.mobile} {
    width: 100px;
    height: 100px;
  }
`;

const PlaylistMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  padding-top: 2em
`;

const PlaylistTitle = styled.h2`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h2};
  margin: 0;
  color: ${theme.colors.black};
`;

const PlatformLine = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 0, 0, 0.5);
`;

const TrackCount = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 0, 0, 0.4);
`;

const TrackListContainer = styled.div`
  width: 100%;
  background: rgba(255, 255, 255, 0.98);
  border: ${theme.borders.solidThin} rgba(20, 19, 29, 0.08);
  box-shadow: 0 20px 44px -24px rgba(15, 14, 23, 0.4),
              0 1px 3px rgba(0, 0, 0, 0.02);
  border-radius: 0;
  padding: ${theme.spacing.xl};
  animation: ${fadeUp} 0.5s ease-out 0.2s both;

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.lg};
  }
`;

const TrackList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

const TrackCard = styled.div`
  width: 100%;
  max-width: 640px;
  background: linear-gradient(155deg, rgba(245, 244, 243, 0.95), rgba(230, 229, 226, 0.92));
  border: ${theme.borders.solidThin} rgba(15, 14, 23, 0.08);
  box-shadow: 0 24px 56px -28px rgba(10, 9, 20, 0.45),
              0 2px 4px rgba(0, 0, 0, 0.03);
  border-radius: 0;
  padding: ${theme.spacing.xl};
  animation: ${fadeUp} 0.5s ease-out 0.1s both;

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.lg};
  }
`;

const InlineError = styled.p`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  color: #c53030;
  margin-top: ${theme.spacing.md};
  animation: ${fadeIn} 0.3s ease-out;
`;
