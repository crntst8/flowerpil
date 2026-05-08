import { useState } from 'react';
import styled from 'styled-components';
import { theme, Button } from '@shared/styles/GlobalStyles';
import { createTransfer } from '../../services/transferService.js';

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const Input = styled.input`
  padding: ${theme.spacing.sm};
  border-radius: 10px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.18);
  font-family: ${theme.fonts.Primary};
  font-size: ${theme.fontSizes.small};
`;

const CheckboxRow = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.dashedThin} rgba(0, 0, 0, 0.2);
  border-radius: 10px;
  cursor: pointer;
  background: rgba(0, 0, 0, 0.02);
`;

const Hint = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.6);
`;

const ErrorText = styled.div`
  color: #b23a3a;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
`;

const SliderRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
`;

const TransferJobCreate = ({ onCreated }) => {
  const [sourceUrl, setSourceUrl] = useState('');
  const [destinations, setDestinations] = useState(['apple', 'tidal']);
  const [matchThreshold, setMatchThreshold] = useState(75);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const toggleDestination = (value) => {
    setDestinations((current) => {
      if (current.includes(value)) {
        return current.filter((d) => d !== value);
      }
      return [...current, value];
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    if (!sourceUrl.trim()) {
      setError('Spotify playlist URL is required');
      return;
    }
    if (destinations.length === 0) {
      setError('Select at least one destination');
      return;
    }

    try {
      setSubmitting(true);
      const data = await createTransfer({
        sourceUrl: sourceUrl.trim(),
        destinations,
        options: { matchThreshold }
      });
      setSourceUrl('');
      if (typeof onCreated === 'function') {
        onCreated(data.id);
      }
    } catch (err) {
      setError(err?.message || 'Failed to start transfer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form onSubmit={handleSubmit}>
      <Field>
        Spotify playlist URL
        <Input
          type="url"
          placeholder="https://open.spotify.com/playlist/..."
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          required
        />
        <Hint>Supports public Spotify playlists. Curator authentication is not required.</Hint>
      </Field>

      <Field>
        Destinations
        <CheckboxRow>
          <CheckboxLabel>
            <input
              type="checkbox"
              checked={destinations.includes('apple')}
              onChange={() => toggleDestination('apple')}
            />
            Apple Music
          </CheckboxLabel>
          <CheckboxLabel>
            <input
              type="checkbox"
              checked={destinations.includes('tidal')}
              onChange={() => toggleDestination('tidal')}
            />
            TIDAL
          </CheckboxLabel>
        </CheckboxRow>
      </Field>

      <Field>
        Match threshold
        <SliderRow>
          <input
            type="range"
            min="60"
            max="90"
            step="1"
            value={matchThreshold}
            onChange={(e) => setMatchThreshold(Number(e.target.value))}
          />
          <Hint>{matchThreshold} – higher favors accuracy</Hint>
        </SliderRow>
      </Field>

      {error && <ErrorText>{error}</ErrorText>}

      <Button type="submit" disabled={submitting}>
        {submitting ? 'Starting…' : 'Start transfer'}
      </Button>
    </Form>
  );
};

export default TransferJobCreate;
