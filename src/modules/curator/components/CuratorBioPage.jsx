import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { SectionCard, tokens, mediaQuery } from '@modules/curator/components/ui';
import { useAuth } from '@shared/contexts/AuthContext';
import { useBioEditorStore } from '../../bio/store/bioEditorStore';
import BioEditor from '../../bio/components/BioEditorV2.jsx';
import { safeJson } from '@shared/utils/jsonUtils';

const HeaderCard = styled(SectionCard)`
  background: ${theme.colors.black};
  color: ${theme.colors.fpwhite};
  padding: ${tokens.spacing[6]};
  border: ${theme.borders.solid} rgba(255, 255, 255, 0.15);
  box-shadow: 0 24px 48px -32px rgba(15, 14, 23, 0.6);
`;

const PageHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};

  h1 {
    margin: 0;
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.h1};
    color: ${theme.colors.fpwhite};
    letter-spacing: -0.02em;
    text-transform: uppercase;
  }

  p {
    margin: 0;
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.tiny};
    color: rgba(255, 255, 255, 0.8);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
`;

const EditorCard = styled(SectionCard)`
  padding: ${tokens.spacing[4]};
`;

const StatusBanner = styled.div`
  margin-bottom: ${tokens.spacing[4]};
  padding: ${tokens.spacing[3]};
  background: rgba(255, 255, 255, 0.9);
  border: ${theme.borders.solidThin} rgba(10, 10, 10, 0.08);
  box-shadow: 0 18px 42px -28px rgba(15, 14, 23, 0.4);

  p {
    margin: 0;
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.tiny};
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
`;

const LoadingState = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};
  align-items: center;
  justify-content: center;
  padding: ${tokens.spacing[6]};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(0, 0, 0, 0.6);

  ${mediaQuery.mobile} {
    padding: ${tokens.spacing[4]};
  }
`;

const LoadingSpinner = styled.div`
  width: ${tokens.spacing[8]};
  height: ${tokens.spacing[8]};
  border: ${theme.borders.solid} rgba(0, 0, 0, 0.1);
  border-top-color: ${theme.colors.black};
  border-radius: 50%;
  animation: spin 0.8s linear infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

export default function CuratorBioPage() {
  const { authenticatedFetch } = useAuth();
  const { setCurators, setSelectedCurator, updateBioProfile, setCurrentBioProfile } = useBioEditorStore();
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const res = await authenticatedFetch('/api/v1/curator/profile', { method: 'GET' });
        const data = await safeJson(res, { context: 'Load curator profile for bio page' });
        if (!res.ok || !data.success) throw new Error(data.message || data.error || 'Failed to load');
        const curator = data.curator;
        // Restrict selector to only this curator and preselect
        setCurators([curator]);
        setSelectedCurator(curator);
        updateBioProfile({ curator_id: curator.id });

        // Attempt to load existing bio profile for this curator to prefill handle
        try {
          const bioRes = await authenticatedFetch(`/api/v1/bio-profiles?curator_id=${encodeURIComponent(curator.id)}`, { method: 'GET' });
          const bioData = await safeJson(bioRes, { context: 'Load bio profiles for curator bio page' });
          if (bioRes.ok && bioData.success && Array.isArray(bioData.data) && bioData.data.length > 0) {
            // Use the most recently updated profile (API already returns ordered by updated_at desc)
            const profile = bioData.data[0];
            // Ensure handle is applied to the editor store
            setCurrentBioProfile({ ...profile, handle: profile.handle });
          }
        } catch (e) {
          // Non-blocking if bio profile does not exist yet
          console.warn('[CuratorBioPage] No existing bio profile found for curator:', e?.message);
        }
        setReady(true);
      } catch (e) {
        setError(e.message);
      }
    };
    init();
  }, [authenticatedFetch, setCurators, setSelectedCurator, setCurrentBioProfile, updateBioProfile]);

  return (
    <>
      <HeaderCard>
        <PageHeader>
          <h1>pil.bio</h1>
          <p>Craft a premium link-in-bio page for your listeners</p>
        </PageHeader>
      </HeaderCard>

      <EditorCard>
        {error && (
          <StatusBanner>
            <p style={{ color: theme.colors.danger }}>{error}</p>
          </StatusBanner>
        )}

        {!ready && !error && (
          <LoadingState>
            <LoadingSpinner />
            Loading bio editor...
          </LoadingState>
        )}

        {ready && <BioEditor />}
      </EditorCard>
    </>
  );
}
