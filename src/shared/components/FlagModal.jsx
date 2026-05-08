import React, { useState } from 'react';
import styled from 'styled-components';
import {
  ModalRoot,
  ModalSurface,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
  ModalCloseButton,
} from '@shared/components/Modal';
import { theme } from '@shared/styles/GlobalStyles';

const FlagSurface = styled(ModalSurface)`
  --modal-surface-padding: clamp(1.5rem, 4vw, 2rem);
  --modal-surface-gap: clamp(1rem, 3vw, 1.5rem);
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  border: ${theme.borders.solid} ${theme.colors.black};
  border-radius: clamp(14px, 2vw, 20px);
  max-width: 480px;
  width: 100%;
`;

const Header = styled(ModalHeader)`
  border-bottom: ${theme.borders.solid} ${theme.colors.black};
  padding-bottom: clamp(0.75rem, 2vw, 1rem);
`;

const Title = styled(ModalTitle)`
  color: ${theme.colors.black};
  letter-spacing: 0.08em;
  font-size: clamp(1rem, 2.5vw, 1.3rem);
`;



const Body = styled(ModalBody)`
  gap: clamp(1rem, 3vw, 1.5rem);
`;

const TrackInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const TrackName = styled.div`
  font-family: ${theme.fonts.primary};
  font-weight: bold;
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
`;

const IssueSelection = styled.div`
  display: grid;
  gap: ${theme.spacing.sm};
`;

const SectionTitle = styled.h3`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: ${theme.spacing.xs};
  color: ${theme.colors.black};
`;

const IssueOption = styled.button`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  background: ${({ $isSelected }) => ($isSelected ? 'rgba(255, 255, 255, 0.12)' : 'transparent')};
  border: ${theme.borders.solid} ${({ $isSelected }) => ($isSelected ? theme.colors.red : theme.colors.black)};
  border-radius: 12px;
  padding: ${theme.spacing.md} ${theme.spacing.lg};
  cursor: pointer;
  gap: ${theme.spacing.md};
  transition: background ${theme.transitions.fast}, border ${theme.transitions.fast};
  text-align: left;

  &:hover,
  &:focus-visible {
    background: rgba(255, 255, 255, 0.1);
    outline: none;
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;

const IssueOptionContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const IssueOptionTitle = styled.span`
  font-family: ${theme.fonts.primary};
  font-weight: bold;
  font-size: ${theme.fontSizes.h4};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${theme.colors.red};
`;

const IssueOptionDescription = styled.span`
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
`;

const RadioIndicator = styled.span`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: ${theme.borders.solid} ${({ $isSelected }) => ($isSelected ? theme.colors.red : theme.colors.black)};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: ${theme.colors.black};
`;

const OtherTextArea = styled.textarea`
  width: 100%;
  min-height: 100px;
  padding: ${theme.spacing.md};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.black};
  border-radius: 12px;
  resize: vertical;
  transition: border ${theme.transitions.fast};

  &:focus {
    outline: none;
    border-color: ${theme.colors.red};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &::placeholder {
    color: ${theme.colors.black};
    opacity: 0.5;
  }
`;

const SubmitMessage = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${({ $isError }) => ($isError ? theme.colors.red : theme.colors.success)};
`;

const Actions = styled(ModalFooter)`
  justify-content: space-between;
  gap: ${theme.spacing.md};
`;

const SubmitButton = styled.button`
  flex: 1;
  padding: ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: ${theme.colors.white};
  color: ${theme.colors.black};
  border: none;
  border-radius: 999px;
  cursor: pointer;
  transition: transform ${theme.transitions.fast}, background ${theme.transitions.fast};

  &:hover {
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
`;

const CancelButton = styled.button`
  padding: ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: transparent;
  color: ${theme.colors.black};
  border: ${theme.borders.solid} ${theme.colors.black};
  border-radius: 999px;
  cursor: pointer;
  transition: border ${theme.transitions.fast}, color ${theme.transitions.fast};

  &:hover {
    color: ${theme.colors.black};
    border-color: ${theme.colors.black};
      background: white;

  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

const issueOptions = [
  {
    id: 'wrong_dsp_url',
    title: 'Wrong DSP URL',
    description: "Incorrect Spotify, Apple Music, or Tidal link",
  },
  {
    id: 'wrong_preview',
    title: 'Wrong Deezer Preview',
    description: "Preview audio doesn't match this track",
  },
  {
    id: 'broken_link',
    title: 'Broken Link',
    description: "Link doesn't work or goes to wrong page",
  },
  {
    id: 'other',
    title: 'Other Issue',
    description: 'Something else needs attention',
  },
];

const FlagModal = ({ isOpen, onClose, track, playlistId }) => {
  const [selectedIssue, setSelectedIssue] = useState('');
  const [otherText, setOtherText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!selectedIssue) {
      setSubmitMessage('Please select an issue type');
      return;
    }

    if (selectedIssue === 'other' && !otherText.trim()) {
      setSubmitMessage('Please describe the issue');
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage('Submitting...');

    try {
      const response = await fetch('/api/v1/flags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          track_id: track.id,
          playlist_id: playlistId,
          issue_type: selectedIssue,
          other_description: selectedIssue === 'other' ? otherText.trim() : undefined,
          track_title: track.title,
          track_artist: track.artist,
        }),
      });

      if (response.ok) {
        setSubmitMessage('Thank you! Issue reported successfully.');
        setTimeout(() => {
          handleClose();
        }, 2000);
      } else {
        throw new Error('Failed to submit flag');
      }
    } catch (error) {
      console.error('Error submitting flag:', error);
      setSubmitMessage('Error submitting report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
    setSelectedIssue('');
    setOtherText('');
    setSubmitMessage('');
  };

  return (
    <ModalRoot
      isOpen={isOpen}
      onClose={handleClose}
      align="center"
      closeOnBackdrop={!isSubmitting}
      labelledBy="flag-modal-title"
      overlayProps={{
        $backdrop: 'rgba(0, 0, 0, 0.85)',
        $backdropBlur: 'blur(14px)',
      }}
    >
      <FlagSurface size="sm">

        <Header>
          <Title id="flag-modal-title">Report Issue</Title>
        </Header>
            <SectionTitle>If links are broken, preview audio feels off, artwork is incorrect etc. report here and we can solve ASAP</SectionTitle>

        <Body as="section" aria-labelledby="flag-modal-title">
          <TrackInfo>
            <TrackName>
              {track.artist} — {track.title}
            </TrackName>
          </TrackInfo>

          <IssueSelection>
            {issueOptions.map((option) => (
              <IssueOption
                key={option.id}
                type="button"
                onClick={() => !isSubmitting && setSelectedIssue(option.id)}
                $isSelected={selectedIssue === option.id}
                disabled={isSubmitting}
              >
                <IssueOptionContent>
                  <IssueOptionTitle>{option.title}</IssueOptionTitle>
                  <IssueOptionDescription>{option.description}</IssueOptionDescription>
                </IssueOptionContent>
                <RadioIndicator $isSelected={selectedIssue === option.id}>
                  {selectedIssue === option.id ? '●' : ''}
                </RadioIndicator>
              </IssueOption>
            ))}
          </IssueSelection>

          {selectedIssue === 'other' && (
            <OtherTextArea
              placeholder="Please describe the issue..."
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              disabled={isSubmitting}
              rows={4}
            />
          )}

          {submitMessage && (
            <SubmitMessage $isError={submitMessage.includes('Error')}>
              {submitMessage}
            </SubmitMessage>
          )}
        </Body>

        <Actions>
          <SubmitButton onClick={handleSubmit} disabled={!selectedIssue || isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Submit Report'}
          </SubmitButton>
          <CancelButton type="button" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </CancelButton>
        </Actions>
      </FlagSurface>
    </ModalRoot>
  );
};

export default FlagModal;
