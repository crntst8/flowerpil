import { useState } from 'react';
import styled from 'styled-components';
import { theme, Button, Input } from '@shared/styles/GlobalStyles';
import { adminPost } from '../utils/adminApi';

const TestContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const HelperText = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.6);
  margin: 0;
`;

const StatusMessage = styled.div`
  padding: ${theme.spacing.sm};
  border-radius: 8px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  background: ${props =>
    props.$type === 'success' ? 'rgba(0, 200, 0, 0.1)' :
    props.$type === 'error' ? 'rgba(255, 0, 0, 0.1)' :
    'rgba(0, 0, 0, 0.05)'
  };
  color: ${props =>
    props.$type === 'success' ? 'rgb(0, 150, 0)' :
    props.$type === 'error' ? 'rgb(200, 0, 0)' :
    'rgba(0, 0, 0, 0.7)'
  };
  border: 1px solid ${props =>
    props.$type === 'success' ? 'rgba(0, 200, 0, 0.3)' :
    props.$type === 'error' ? 'rgba(255, 0, 0, 0.3)' :
    'rgba(0, 0, 0, 0.1)'
  };
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${theme.spacing.sm};
`;

const FieldGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const FieldLabel = styled.label`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(0, 0, 0, 0.7);
`;

const ActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
`;

const ResultsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: ${theme.spacing.sm};
`;

const ResultCard = styled.div`
  border: 1px dashed rgba(0, 0, 0, 0.2);
  border-radius: 10px;
  padding: ${theme.spacing.sm};
  background: rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const ResultTitle = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${theme.colors.black};
`;

const ResultRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: ${theme.spacing.xs};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  word-break: break-word;
`;

const ResultLabel = styled.span`
  opacity: 0.7;
`;

const ResultValue = styled.span`
  text-align: right;
`;

const ResultLink = styled.a`
  color: ${theme.colors.black};
  text-decoration: underline;
  word-break: break-all;
`;

const PLATFORM_LABELS = {
  spotify: 'Spotify',
  apple: 'Apple Music',
  tidal: 'Tidal',
  youtube: 'YouTube Music'
};

const CrossLinkDryRunTester = () => {
  const [form, setForm] = useState({
    artist: '',
    title: '',
    album: '',
    isrc: '',
    durationMs: ''
  });
  const [status, setStatus] = useState({ type: '', message: '', detail: '' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const updateField = (key) => (event) => {
    const value = event.target.value;
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleClear = () => {
    setForm({ artist: '', title: '', album: '', isrc: '', durationMs: '' });
    setStatus({ type: '', message: '', detail: '' });
    setResult(null);
  };

  const handleDryRun = async () => {
    const artist = form.artist.trim();
    const title = form.title.trim();
    const album = form.album.trim();
    const isrc = form.isrc.trim();
    const durationValue = Number.parseInt(form.durationMs, 10);

    if (!isrc && !(artist && title)) {
      setStatus({ type: 'error', message: 'Provide artist + title or ISRC', detail: '' });
      return;
    }

    const payload = {
      artist,
      title,
      album: album || undefined,
      isrc: isrc || undefined
    };

    if (Number.isFinite(durationValue) && durationValue > 0) {
      payload.duration_ms = durationValue;
    }

    setBusy(true);
    setStatus({ type: '', message: '', detail: '' });
    setResult(null);

    try {
      const response = await adminPost('/api/v1/admin/site-admin/cross-link-dry-run', payload);
      const payloadResult = response?.result || null;
      const resultsMap = payloadResult?.results || {};
      const matchedCount = Object.keys(PLATFORM_LABELS)
        .filter((key) => Boolean(resultsMap[key]))
        .length;

      const detailParts = [];
      if (payloadResult?.durationMs) {
        detailParts.push(`duration ${Math.round(payloadResult.durationMs)}ms`);
      }
      if (payloadResult?.errors?.length) {
        detailParts.push(payloadResult.errors.join(' | '));
      }

      setResult(payloadResult);
      setStatus({
        type: 'success',
        message: `Dry run complete (${matchedCount}/${Object.keys(PLATFORM_LABELS).length} matched)`,
        detail: detailParts.join(' | ')
      });
    } catch (error) {
      const fallbackMessage = 'Failed to run dry run';
      const detailMessage = error?.details?.error || error?.details?.message || error?.message || '';
      setStatus({
        type: 'error',
        message: error?.message || fallbackMessage,
        detail: detailMessage
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <TestContainer>
      <HelperText>
        Simulate cross-platform matching without writing to track records.
      </HelperText>

      <FormGrid>
        <FieldGroup>
          <FieldLabel>Artist</FieldLabel>
          <Input value={form.artist} onChange={updateField('artist')} placeholder="Artist name" />
        </FieldGroup>
        <FieldGroup>
          <FieldLabel>Title</FieldLabel>
          <Input value={form.title} onChange={updateField('title')} placeholder="Track title" />
        </FieldGroup>
        <FieldGroup>
          <FieldLabel>Album (optional)</FieldLabel>
          <Input value={form.album} onChange={updateField('album')} placeholder="Album name" />
        </FieldGroup>
        <FieldGroup>
          <FieldLabel>ISRC (optional)</FieldLabel>
          <Input value={form.isrc} onChange={updateField('isrc')} placeholder="USUM71703861" />
        </FieldGroup>
        <FieldGroup>
          <FieldLabel>Duration (ms)</FieldLabel>
          <Input value={form.durationMs} onChange={updateField('durationMs')} placeholder="210000" />
        </FieldGroup>
      </FormGrid>

      {status.message ? (
        <>
          <StatusMessage $type={status.type} role="status">
            {status.message}
          </StatusMessage>
          {status.detail ? <HelperText>{status.detail}</HelperText> : null}
        </>
      ) : null}

      <ActionRow>
        <Button size="small" variant="secondary" onClick={handleDryRun} disabled={busy}>
          {busy ? 'Running...' : 'Run Dry Run'}
        </Button>
        <Button size="small" variant="secondary" onClick={handleClear} disabled={busy}>
          Clear
        </Button>
      </ActionRow>

      {result ? (
        <ResultsGrid>
          {Object.entries(PLATFORM_LABELS).map(([key, label]) => {
            const entry = result.results?.[key];
            const hasMatch = Boolean(entry);
            const platformState = result.platformStatus?.[key];
            const statusLabel = platformState?.ok === false ? 'Unavailable' : (hasMatch ? 'Match' : 'No match');
            const resultId = entry?.id || entry?.videoId || 'N/A';
            const resultUrl = entry?.url || '';
            const resultConfidence = entry?.confidence ?? 'N/A';
            const resultSource = entry?.matchSource || entry?.source || 'N/A';
            const resultStrategy = entry?.matchStrategy || 'N/A';
            const resultError = platformState?.ok === false ? platformState.error || 'Unavailable' : null;

            return (
              <ResultCard key={key}>
                <ResultTitle>{label}</ResultTitle>
                <ResultRow>
                  <ResultLabel>Status</ResultLabel>
                  <ResultValue>{statusLabel}</ResultValue>
                </ResultRow>
                {resultError ? (
                  <ResultRow>
                    <ResultLabel>Error</ResultLabel>
                    <ResultValue>{resultError}</ResultValue>
                  </ResultRow>
                ) : null}
                <ResultRow>
                  <ResultLabel>ID</ResultLabel>
                  <ResultValue>{resultId}</ResultValue>
                </ResultRow>
                <ResultRow>
                  <ResultLabel>Confidence</ResultLabel>
                  <ResultValue>{resultConfidence}</ResultValue>
                </ResultRow>
                <ResultRow>
                  <ResultLabel>Source</ResultLabel>
                  <ResultValue>{resultSource}</ResultValue>
                </ResultRow>
                <ResultRow>
                  <ResultLabel>Strategy</ResultLabel>
                  <ResultValue>{resultStrategy}</ResultValue>
                </ResultRow>
                <ResultRow>
                  <ResultLabel>URL</ResultLabel>
                  <ResultValue>
                    {resultUrl ? (
                      <ResultLink href={resultUrl} target="_blank" rel="noreferrer">
                        Open
                      </ResultLink>
                    ) : (
                      'N/A'
                    )}
                  </ResultValue>
                </ResultRow>
              </ResultCard>
            );
          })}
        </ResultsGrid>
      ) : null}
    </TestContainer>
  );
};

export default CrossLinkDryRunTester;
