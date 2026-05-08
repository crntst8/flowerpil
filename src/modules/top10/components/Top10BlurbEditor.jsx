/**
 * Top10BlurbEditor Component
 *
 * Modal for editing track blurbs in Top10 editor.
 * Adapted from TrackQuoteEditor but with Top10 brutalist design.
 *
 * Features:
 * - Rich text editing for blurbs
 * - Supports HTML (p/strong/em/br/a tags)
 * - Saves to track.blurb field
 *
 * Design: Brutalist black/white aesthetic matching Top10 design system
 */

import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
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

const StyledModalSurface = styled(ModalSurface)`
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  background: #fff;
  border: 3px solid #000;
  border-radius: 0;
  box-shadow: 8px 8px 0 rgba(0, 0, 0, 0.2);
  max-width: 700px;
  width: 100%;

  @media (max-width: 375px) {
    max-width: 95vw;
    border: 2px solid #000;
    box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.2);
  }
`;

const StyledModalHeader = styled(ModalHeader)`
  padding: 1.5rem;
  border-bottom: 2px solid #000;
  background: #000;
  color: #fff;

  h2 {
    margin: 0 0 0.5rem 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    font-size: 1.5rem;
    font-weight: 900;
    text-transform: lowercase;
    letter-spacing: -0.02em;
  }

  @media (max-width: 375px) {
    padding: 1rem;

    h2 {
      font-size: 1.25rem;
    }
  }
`;

const TrackInfo = styled.div`
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.4;

  @media (max-width: 375px) {
    font-size: 0.8rem;
  }
`;

const TrackTitle = styled.div`
  font-weight: 700;
  color: #fff;
`;

const StyledModalBody = styled(ModalBody)`
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;

  @media (max-width: 375px) {
    padding: 1rem;
  }
`;

const StyledModalFooter = styled(ModalFooter)`
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  padding: 1.5rem;
  border-top: 2px solid #000;

  @media (max-width: 375px) {
    padding: 1rem;
    flex-direction: column-reverse;

    button {
      width: 100%;
    }
  }
`;

const Button = styled.button`
  padding: 0.75rem 1.5rem;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-size: 0.875rem;
  font-weight: 700;
  text-transform: lowercase;
  background: ${props => props.$variant === 'primary' ? '#000' : '#fff'};
  color: ${props => props.$variant === 'primary' ? '#fff' : '#000'};
  border: 2px solid #000;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 48px;

  &:hover:not(:disabled) {
    background: ${props => props.$variant === 'primary' ? '#333' : '#f9f9f9'};
    transform: translateY(-2px);
    box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.2);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: none;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 375px) {
    font-size: 0.8rem;
    padding: 0.65rem 1.25rem;
  }
`;

const ErrorBox = styled.div`
  padding: 0.75rem;
  border: 2px solid #ff0000;
  background: rgba(255, 0, 0, 0.05);
  color: #ff0000;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-size: 0.875rem;
  font-weight: 600;

  @media (max-width: 375px) {
    font-size: 0.8rem;
    padding: 0.65rem;
  }
`;

const HelpText = styled.div`
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-size: 0.75rem;
  color: #666;
  line-height: 1.4;

  @media (max-width: 375px) {
    font-size: 0.7rem;
  }
`;

const Top10BlurbEditor = ({ track, onUpdate, onClose }) => {
  const [blurb, setBlurb] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setBlurb(track?.blurb || '');
  }, [track?.position]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');

      // Strip HTML tags and whitespace to check if empty
      const strippedBlurb = blurb.replace(/<[^>]*>/g, '').trim();
      const blurbToSave = strippedBlurb ? blurb : null;

      // Call parent update handler
      await onUpdate(track.position, blurbToSave);
      onClose();
    } catch (e) {
      setError(e.message || 'Failed to save blurb');
    } finally {
      setSaving(false);
    }
  };

  if (!track) return null;

  return (
    <ModalRoot
      isOpen={true}
      onClose={onClose}
      labelledBy="blurb-editor-modal-title"
      closeOnBackdrop={!saving}
    >
      <StyledModalSurface>
        <StyledModalHeader>
          <div>
            <ModalTitle id="blurb-editor-modal-title">
              edit blurb
            </ModalTitle>
            <TrackInfo>
              <TrackTitle>
                {track.position}. {track.artist} — {track.title}
              </TrackTitle>
            </TrackInfo>
          </div>
          <ModalCloseButton />
        </StyledModalHeader>

        <StyledModalBody>
          {error && <ErrorBox>{error}</ErrorBox>}

          <HelpText>
            add a short blurb about why this track made your top 10. it will
            appear below the track on your published page.
          </HelpText>

          <RichTextEditor
            value={blurb}
            onChange={setBlurb}
            placeholder="write something about this track..."
          />
        </StyledModalBody>

        <StyledModalFooter>
          <Button onClick={onClose} disabled={saving}>
            cancel
          </Button>
          <Button $variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'saving...' : 'save blurb'}
          </Button>
        </StyledModalFooter>
      </StyledModalSurface>
    </ModalRoot>
  );
};

export default Top10BlurbEditor;
