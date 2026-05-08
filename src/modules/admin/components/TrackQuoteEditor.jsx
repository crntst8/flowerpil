import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { adminPut } from '../../admin/utils/adminApi.js';
import {
  ModalRoot,
  ModalSurface,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
} from '@shared/components/Modal';
import RichTextEditor from '../../curator/components/RichTextEditor';
import { Button, tokens, theme, mediaQuery } from '../../curator/components/ui/index.jsx';

export default function TrackQuoteEditor({ track, onUpdate, onClose }) {
  const [quote, setQuote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setQuote(track?.quote || '');
  }, [track?.id]);

  const save = async () => {
    try {
      setSaving(true); setError('');

      // Check if quote is empty (strip HTML tags and whitespace)
      const strippedQuote = quote.replace(/<[^>]*>/g, '').trim();
      const quoteToSave = strippedQuote ? quote : null;

      const res = await adminPut(`/api/v1/tracks/${track.id}`, {
        ...track,
        quote: quoteToSave
      });
      const updated = res?.data || { ...track, quote: quoteToSave };
      onUpdate && onUpdate(updated);
      onClose && onClose();
    } catch (e) {
      setError(e.message || 'Failed to save quote');
    } finally {
      setSaving(false);
    }
  };

  if (!track) return null;

  return (
    <ModalRoot
      isOpen={true}
      onClose={onClose}
      labelledBy="track-quote-modal-title"
      closeOnBackdrop={!saving}
    >
      <StyledModalSurface>
        <StyledModalHeader>
          <div>
            <ModalTitle id="track-quote-modal-title">Quote</ModalTitle>
            <Subtitle>This will display above:</Subtitle>
                      <div style={{ fontFamily: theme.fonts.mono, marginBottom: 6 }}> {track.artist} — {track.title}</div>

          </div>
          
          <ModalCloseButton />
        </StyledModalHeader>
        <StyledModalBody>
          {error && (
            <ErrorBox>{error}</ErrorBox>
          )}

          <RichTextEditor
            value={quote}
            onChange={setQuote}
            placeholder="Add a short quote or notes about this track"
          />
        </StyledModalBody>
        <StyledModalFooter>
          <Button onClick={onClose} disabled={saving} $variant="default">Cancel</Button>
          <Button onClick={save} disabled={saving} $variant="primary">{saving ? 'Saving…' : 'Save Quote'}</Button>
        </StyledModalFooter>
      </StyledModalSurface>
    </ModalRoot>
  );
}

const StyledModalSurface = styled(ModalSurface)`
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  border: ${theme.borders.solid};
  background: ${theme.colors.fpwhite};
  border-radius: ${tokens.radii.md};
  box-shadow: ${tokens.shadows.modal};
  max-width: 600px;
  width: 100%;

  ${mediaQuery.mobile} {
    max-width: 95vw;
  }
`;

const StyledModalHeader = styled(ModalHeader)`
  padding: ${tokens.spacing[6]};
  border-bottom: ${theme.borders.solid};

  h2 {
    margin: 0;
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.body};
    font-weight: ${theme.fontWeights.bold};
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: ${theme.colors.black};
  }

  ${mediaQuery.mobile} {
    padding: ${tokens.spacing[4]};
  }
`;

const Subtitle = styled.h6`
  margin: ${tokens.spacing[2]} 0 0 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  font-weight: ${theme.fontWeights.normal};
  color: ${theme.colors.black};
  opacity: 0.7;
  text-transform: none;
  letter-spacing: normal;
`;

const StyledModalBody = styled(ModalBody)`
  padding: ${tokens.spacing[6]};
  gap: ${tokens.spacing[4]};

  ${mediaQuery.mobile} {
    padding: ${tokens.spacing[4]};
  }
`;

const StyledModalFooter = styled(ModalFooter)`
  display: flex;
  gap: ${tokens.spacing[3]};
  justify-content: flex-end;
  padding: ${tokens.spacing[6]};
  border-top: ${theme.borders.solid};

  ${mediaQuery.mobile} {
    padding: ${tokens.spacing[4]};
    flex-direction: column-reverse;

    button {
      width: 100%;
    }
  }
`;

const ErrorBox = styled.div`
  padding: ${tokens.spacing[3]};
  border: ${theme.borders.solid};
  background: rgba(239, 68, 68, 0.05);
  border-color: ${theme.colors.danger};
  color: ${theme.colors.danger};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  border-radius: ${tokens.radii.sm};
`;
