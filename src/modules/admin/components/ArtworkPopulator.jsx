import { useState } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { adminPost } from '../utils/adminApi';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const InputGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const Label = styled.label`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 0, 0, 0.6);
`;

const Input = styled.input`
  padding: ${theme.spacing.sm};
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 6px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};

  &:focus {
    outline: none;
    border-color: ${theme.colors.primary};
  }
`;

const CheckboxRow = styled.label`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  cursor: pointer;
`;

const ButtonRow = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
`;

const Button = styled.button`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border: none;
  border-radius: 6px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  cursor: pointer;
  transition: opacity 0.2s;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    opacity: 0.8;
  }
`;

const PrimaryButton = styled(Button)`
  background: ${theme.colors.primary};
  color: white;
`;

const SecondaryButton = styled(Button)`
  background: rgba(0, 0, 0, 0.08);
  color: rgba(0, 0, 0, 0.8);
`;

const ResultBox = styled.div`
  padding: ${theme.spacing.md};
  border-radius: 8px;
  background: ${props => props.$error ? 'rgba(220, 53, 69, 0.1)' : 'rgba(40, 167, 69, 0.1)'};
  border: 1px solid ${props => props.$error ? 'rgba(220, 53, 69, 0.3)' : 'rgba(40, 167, 69, 0.3)'};
`;

const ResultTitle = styled.div`
  font-family: ${theme.fonts.Primary};
  font-size: ${theme.fontSizes.base};
  margin-bottom: ${theme.spacing.sm};
`;

const ResultStats = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.sm};
`;

const Stat = styled.div`
  text-align: center;
  padding: ${theme.spacing.sm};
  background: rgba(255, 255, 255, 0.5);
  border-radius: 4px;
`;

const StatValue = styled.div`
  font-family: ${theme.fonts.Primary};
  font-size: ${theme.fontSizes.large};
`;

const StatLabel = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.6);
`;

const ErrorList = styled.ul`
  margin: ${theme.spacing.sm} 0 0 0;
  padding-left: ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.7);
`;

const TrackList = styled.div`
  margin-top: ${theme.spacing.sm};
  max-height: 200px;
  overflow-y: auto;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
`;

const TrackItem = styled.div`
  padding: ${theme.spacing.xs};
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);

  &:last-child {
    border-bottom: none;
  }
`;

const ArtworkPopulator = () => {
  const [playlistId, setPlaylistId] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleRun = async () => {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const data = await adminPost('/api/v1/admin/site-admin/populate-artwork', {
        playlistId: playlistId ? parseInt(playlistId, 10) : null,
        dryRun
      });
      setResult(data);
    } catch (err) {
      setError(err.message || err.details?.error || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container>
      <InputGroup>
        <Label>Playlist ID (optional - leave blank for all)</Label>
        <Input
          type="number"
          value={playlistId}
          onChange={(e) => setPlaylistId(e.target.value)}
          placeholder="e.g., 292"
        />
      </InputGroup>

      <CheckboxRow>
        <input
          type="checkbox"
          checked={dryRun}
          onChange={(e) => setDryRun(e.target.checked)}
        />
        Dry run (preview only, no changes)
      </CheckboxRow>

      <ButtonRow>
        <PrimaryButton onClick={handleRun} disabled={loading}>
          {loading ? 'Processing...' : (dryRun ? 'Preview' : 'Run')}
        </PrimaryButton>
        {result && (
          <SecondaryButton onClick={() => setResult(null)}>
            Clear
          </SecondaryButton>
        )}
      </ButtonRow>

      {error && (
        <ResultBox $error>
          <ResultTitle>Error</ResultTitle>
          {error}
        </ResultBox>
      )}

      {result && (
        <ResultBox $error={false}>
          <ResultTitle>
            {result.dryRun ? 'Dry Run Preview' : 'Completed'}
          </ResultTitle>

          {result.dryRun ? (
            <>
              <p>{result.message}</p>
              {result.tracks && result.tracks.length > 0 && (
                <TrackList>
                  {result.tracks.map((track) => (
                    <TrackItem key={track.id}>
                      #{track.id}: {track.artist} - {track.title}
                    </TrackItem>
                  ))}
                  {result.totalCount > result.tracks.length && (
                    <TrackItem>... and {result.totalCount - result.tracks.length} more</TrackItem>
                  )}
                </TrackList>
              )}
            </>
          ) : (
            <>
              <ResultStats>
                <Stat>
                  <StatValue>{result.processed}</StatValue>
                  <StatLabel>Processed</StatLabel>
                </Stat>
                <Stat>
                  <StatValue>{result.updated}</StatValue>
                  <StatLabel>Updated</StatLabel>
                </Stat>
                <Stat>
                  <StatValue>{result.failed}</StatValue>
                  <StatLabel>Failed</StatLabel>
                </Stat>
              </ResultStats>

              {result.errors && result.errors.length > 0 && (
                <>
                  <Label>Errors (first 10):</Label>
                  <ErrorList>
                    {result.errors.map((err, i) => (
                      <li key={i}>
                        #{err.trackId} {err.title}: {err.reason}
                      </li>
                    ))}
                  </ErrorList>
                </>
              )}
            </>
          )}
        </ResultBox>
      )}
    </Container>
  );
};

export default ArtworkPopulator;
