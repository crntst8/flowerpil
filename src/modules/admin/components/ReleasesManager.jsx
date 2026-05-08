import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { ThemeProvider } from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import useAuthenticatedApi from '../hooks/useAuthenticatedApi';
import CuratorReleasesPanel from '../../curator/components/CuratorReleasesPanel.jsx';

const ReleasesManager = () => {
  const { authenticatedFetch } = useAuthenticatedApi();
  const [curators, setCurators] = useState([]);
  const [selectedCuratorId, setSelectedCuratorId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [gateUpdating, setGateUpdating] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const loadCurators = async () => {
      setLoading(true);
      setError('');
      setStatus('');

      try {
        const response = await authenticatedFetch('/api/v1/admin/dashboard/curators?limit=200&order=asc&sort=name');
        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to load curators');
        }

        const nextCurators = (data.data || []).map((curator) => ({
          id: curator.id,
          name: curator.name,
          profile_type: curator.profile_type,
          type: curator.type,
          upcoming_releases_enabled: curator.upcoming_releases_enabled === true || curator.upcoming_releases_enabled === 1
        }));

        setCurators(nextCurators);
        if (!selectedCuratorId && nextCurators.length > 0) {
          setSelectedCuratorId(String(nextCurators[0].id));
        }
      } catch (err) {
        console.error('Failed to load curators for releases manager', err);
        setError(err.message || 'Failed to load curators');
      } finally {
        setLoading(false);
      }
    };

    loadCurators();
  }, [authenticatedFetch, selectedCuratorId]);

  const selectedCurator = useMemo(() => {
    if (!selectedCuratorId) return null;
    return curators.find((curator) => String(curator.id) === String(selectedCuratorId)) || null;
  }, [curators, selectedCuratorId]);

  const enabledCount = useMemo(
    () => curators.filter((curator) => curator.upcoming_releases_enabled === true).length,
    [curators]
  );

  const handleToggleGate = async () => {
    if (!selectedCurator) return;

    const nextValue = selectedCurator.upcoming_releases_enabled !== true;
    setGateUpdating(true);
    setError('');
    setStatus('');

    try {
      const response = await authenticatedFetch(`/api/v1/curators/${selectedCurator.id}`, {
        method: 'PUT',
        body: JSON.stringify({ upcoming_releases_enabled: nextValue })
      });
      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to update releases gate');
      }

      setCurators((prev) => prev.map((curator) => (
        String(curator.id) === String(selectedCurator.id)
          ? { ...curator, upcoming_releases_enabled: nextValue }
          : curator
      )));
      setStatus(`Releases gate ${nextValue ? 'enabled' : 'disabled'} for ${selectedCurator.name}.`);
    } catch (err) {
      console.error('Failed to toggle releases gate', err);
      setError(err.message || 'Failed to update releases gate');
    } finally {
      setGateUpdating(false);
    }
  };

  return (
    <ManagerContainer>
      <TopBar>
        <TopMeta>
          <h3>Releases Editor</h3>
          <p>Admin uses the exact same editor as curator dashboard.</p>
          <small>{enabledCount} curator accounts currently have releases enabled.</small>
        </TopMeta>

        <SelectorWrap>
          <label htmlFor="admin-release-curator-selector">Curator</label>
          <select
            id="admin-release-curator-selector"
            value={selectedCuratorId}
            onChange={(event) => setSelectedCuratorId(event.target.value)}
            disabled={loading || curators.length === 0}
          >
            {curators.map((curator) => (
              <option key={curator.id} value={curator.id}>
                {curator.name} ({curator.profile_type || curator.type || 'curator'})
              </option>
            ))}
          </select>
        </SelectorWrap>

        {selectedCurator && (
          <GateControls>
            <GateState>
              <span>Releases Gate</span>
              <strong>{selectedCurator.upcoming_releases_enabled ? 'Enabled' : 'Disabled'}</strong>
            </GateState>
            <GateButton
              type="button"
              onClick={handleToggleGate}
              disabled={gateUpdating}
              $danger={selectedCurator.upcoming_releases_enabled}
            >
              {gateUpdating ? 'Saving…' : (selectedCurator.upcoming_releases_enabled ? 'Disable Gate' : 'Enable Gate')}
            </GateButton>
            <OverrideNote>
              Admin post control is enabled in this tab.
            </OverrideNote>
          </GateControls>
        )}
      </TopBar>

      {error && <ErrorBanner>{error}</ErrorBanner>}
      {status && <StatusBanner>{status}</StatusBanner>}
      {loading && <LoadingBanner>Loading curator list…</LoadingBanner>}

      {!loading && !error && selectedCurator && (
        <ThemeProvider theme={theme}>
          <CuratorReleasesPanel curator={selectedCurator} adminOverride />
        </ThemeProvider>
      )}

      {!loading && !error && !selectedCurator && (
        <LoadingBanner>Select a curator to manage releases.</LoadingBanner>
      )}
    </ManagerContainer>
  );
};

const ManagerContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const TopBar = styled.div`
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  padding: ${theme.spacing.sm};
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
  background: ${theme.colors.fpwhite};
`;

const TopMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;

  h3 {
    margin: 0;
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.body};
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  p {
    margin: 0;
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.tiny};
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(0, 0, 0, 0.68);
  }

  small {
    font-family: ${theme.fonts.mono};
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(0, 0, 0, 0.48);
  }
`;

const SelectorWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 280px;

  label {
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.tiny};
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  select {
    min-height: 44px;
    border: ${theme.borders.solid} ${theme.colors.black};
    background: ${theme.colors.fpwhite};
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.small};
    padding: 0 ${theme.spacing.sm};
  }
`;

const GateControls = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
`;

const GateState = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;

  span {
    font-family: ${theme.fonts.mono};
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(0, 0, 0, 0.58);
  }

  strong {
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.small};
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
`;

const GateButton = styled.button.withConfig({
  shouldForwardProp: (prop) => prop !== '$danger'
})`
  min-height: 44px;
  border: ${theme.borders.solid} ${theme.colors.black};
  background: ${({ $danger }) => ($danger ? theme.colors.danger : theme.colors.success)};
  color: ${({ $danger }) => ($danger ? theme.colors.fpwhite : theme.colors.black)};
  padding: 0 ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  white-space: nowrap;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const OverrideNote = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 0, 0, 0.56);
`;

const ErrorBanner = styled.div`
  border: ${theme.borders.solidThin} ${theme.colors.danger};
  background: rgba(220, 38, 38, 0.1);
  color: ${theme.colors.danger};
  padding: ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
`;

const StatusBanner = styled.div`
  border: ${theme.borders.solidThin} ${theme.colors.success};
  background: rgba(34, 197, 94, 0.1);
  color: #166534;
  padding: ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
`;

const LoadingBanner = styled.div`
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.2);
  background: rgba(0, 0, 0, 0.03);
  color: rgba(0, 0, 0, 0.72);
  padding: ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

export default ReleasesManager;
