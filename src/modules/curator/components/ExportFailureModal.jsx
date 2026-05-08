import React from 'react';
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
import { theme, Button } from '@shared/styles/GlobalStyles';

const StyledSurface = styled(ModalSurface)`
  max-width: 600px;
`;

const Header = styled(ModalHeader)`
  border-bottom: ${theme.borders.solid} ${theme.colors.black};
  padding-bottom: ${theme.spacing.sm};
`;

const Title = styled(ModalTitle)`
  letter-spacing: 0.05em;
`;

const Body = styled(ModalBody)`
  gap: ${theme.spacing.lg};
`;

const AdminNoteSection = styled.div``;

const FailedTracksSection = styled.div``;

const SectionTitle = styled.h4`
  font-family: ${theme.fonts.mono};
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 ${theme.spacing.sm} 0;
  color: ${theme.colors.black};
`;

const AdminNote = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: 13px;
  color: ${theme.colors.black};
  background: ${theme.colors.gray[100]};
  border: ${theme.borders.dashed} ${theme.colors.black};
  padding: ${theme.spacing.sm};
  margin: 0;
  white-space: pre-wrap;
`;

const TrackList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const TrackItem = styled.div`
  border: ${theme.borders.dashed} ${theme.colors.black};
  padding: ${theme.spacing.sm};
  background: ${theme.colors.fpwhite};
`;

const TrackName = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: 13px;
  font-weight: ${theme.fontWeights.bold};
  color: ${theme.colors.black};
`;

const TrackArtist = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: 12px;
  color: ${theme.colors.gray[600]};
  margin-top: 2px;
`;

const TrackReason = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  color: ${theme.colors.danger};
  margin-top: ${theme.spacing.xs};
  font-style: italic;
`;

const Actions = styled(ModalFooter)`
  justify-content: flex-end;
  padding-top: ${theme.spacing.md};
  border-top: ${theme.borders.solid} ${theme.colors.black};
`;

export default function ExportFailureModal({ isOpen, onClose, exportRequest }) {
  if (!isOpen || !exportRequest) return null;

  const failedTracks = (() => {
    try {
      return JSON.parse(exportRequest.failed_tracks || '[]');
    } catch {
      return [];
    }
  })();

  return (
    <ModalRoot
      isOpen={isOpen}
      onClose={onClose}
      align="center"
      labelledBy="export-failure-modal-title"
    >
      <StyledSurface>
        <ModalCloseButton />

        <Header>
          <Title id="export-failure-modal-title">Export Failed</Title>
        </Header>

        <Body>
          {exportRequest.admin_note && (
            <AdminNoteSection>
              <SectionTitle>Admin Note</SectionTitle>
              <AdminNote>{exportRequest.admin_note}</AdminNote>
            </AdminNoteSection>
          )}

          {failedTracks.length > 0 && (
            <FailedTracksSection>
              <SectionTitle>Failed Tracks</SectionTitle>
              <TrackList>
                {failedTracks.map((track, idx) => (
                  <TrackItem key={idx}>
                    <TrackName>{track.title}</TrackName>
                    <TrackArtist>{track.artist}</TrackArtist>
                    {track.reason && <TrackReason>{track.reason}</TrackReason>}
                  </TrackItem>
                ))}
              </TrackList>
            </FailedTracksSection>
          )}
        </Body>

        <Actions>
          <Button onClick={onClose}>Close</Button>
        </Actions>
      </StyledSurface>
    </ModalRoot>
  );
}
