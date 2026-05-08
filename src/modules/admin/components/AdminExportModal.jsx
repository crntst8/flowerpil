import React, { useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { ModalRoot, ModalSurface, ModalBody, ModalFooter, ModalCloseButton } from '@shared/components/Modal';

const spin = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

const pulse = keyframes`
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
`;

const Spinner = styled.div`
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid ${theme.colors.white};
  border-radius: 50%;
  border-top-color: transparent;
  animation: ${spin} 0.8s linear infinite;
  margin-right: 8px;
  vertical-align: middle;
`;

const LoaderContainer = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StyledModalSurface = styled(ModalSurface)`
  background: ${theme.colors.white};
  border: ${theme.borders.solid} ${theme.colors.black};
  border-radius: 12px;
  max-width: 500px;
  width: 100%;
  font-family: ${theme.fonts.mono};
`;

const StyledModalBody = styled(ModalBody)`
  padding: 20px;
`;

const ModalTitle = styled.h2`
  color: ${theme.colors.black};
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 20px 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-family: ${theme.fonts.mono};
`;

const InfoBox = styled.div`
  padding: 15px;
  background: ${theme.colors.gray[100]};
  border: ${theme.borders.solid} ${theme.colors.borderGray};
  margin-bottom: 20px;
  font-size: 14px;
  color: ${theme.colors.black};
  line-height: 1.5;
`;

const PlatformSelectionGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
`;

const PlatformCheckbox = styled.label`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: ${theme.borders.solid} ${props => props.$checked ? theme.colors.primary : theme.colors.borderGray};
  background: ${props => props.$checked ? theme.colors.gray[50] : theme.colors.white};
  cursor: pointer;
  transition: all ${theme.transitions.fast};

  &:hover {
    background: ${theme.colors.gray[50]};
    border-color: ${theme.colors.primary};
  }

  input[type="checkbox"] {
    cursor: pointer;
    width: 18px;
    height: 18px;
  }

  span {
    font-size: 16px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: ${theme.colors.black};
  }
`;

const SelectAllButton = styled.button`
  padding: 8px 16px;
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.black};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  margin-bottom: 16px;
  align-self: flex-start;

  &:hover {
    background: ${theme.colors.gray[100]};
    border-color: ${theme.colors.hoverPrimary};
  }
`;

const StyledModalFooter = styled(ModalFooter)`
  display: flex;
  gap: 15px;
  padding: 20px;
  border-top: ${theme.borders.solid} ${theme.colors.black};
`;

const Button = styled.button`
  flex: 1;
  padding: 12px 24px;
  font-family: ${theme.fonts.mono};
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s ease;
  border: ${theme.borders.solid} ${theme.colors.black};

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const CancelButton = styled(Button)`
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};

  &:hover:not(:disabled) {
    background: ${theme.colors.gray[100]};
  }
`;

const ExportButton = styled(Button)`
  background: ${theme.colors.primary};
  color: ${theme.colors.white};

  &:hover:not(:disabled) {
    background: ${theme.colors.hoverPrimary};
  }

  &:disabled {
    background: ${theme.colors.gray[300]};
  }
`;

const ExportingButton = styled(Button)`
  background: ${theme.colors.gray[500]};
  color: ${theme.colors.white};
  cursor: not-allowed;
  animation: ${pulse} 2s ease-in-out infinite;
`;

export const AdminExportModal = ({ isOpen, onClose, playlist, onExport }) => {
  const [selectedPlatforms, setSelectedPlatforms] = useState({
    spotify: false,
    tidal: false,
    apple: false
  });
  const [isExporting, setIsExporting] = useState(false);

  const platforms = [
    { key: 'spotify', label: 'Spotify' },
    { key: 'tidal', label: 'TIDAL' },
    { key: 'apple', label: 'Apple Music' }
  ];

  const handleTogglePlatform = (platform) => {
    setSelectedPlatforms(prev => ({
      ...prev,
      [platform]: !prev[platform]
    }));
  };

  const handleSelectAll = () => {
    const allSelected = platforms.every(p => selectedPlatforms[p.key]);
    const newState = {};
    platforms.forEach(p => {
      newState[p.key] = !allSelected;
    });
    setSelectedPlatforms(newState);
  };

  const handleExport = async () => {
    const destinations = platforms
      .filter(p => selectedPlatforms[p.key])
      .map(p => p.key);

    if (destinations.length === 0) return;

    setIsExporting(true);
    try {
      await onExport(destinations);
      // Reset state and close on success
      setSelectedPlatforms({ spotify: false, tidal: false, apple: false });
      onClose();
    } catch (error) {
      console.error('Export failed:', error);
      // Keep modal open on error so user can retry
    } finally {
      setIsExporting(false);
    }
  };

  const handleClose = () => {
    if (isExporting) return; // Prevent closing while exporting
    setSelectedPlatforms({ spotify: false, tidal: false, apple: false });
    onClose();
  };

  const selectedCount = platforms.filter(p => selectedPlatforms[p.key]).length;
  const allSelected = selectedCount === platforms.length;

  return (
    <ModalRoot
      isOpen={isOpen}
      onClose={handleClose}
      labelledBy="admin-export-title"
      closeOnBackdrop={!isExporting}
    >
      <StyledModalSurface>
        {!isExporting && <ModalCloseButton />}

        <StyledModalBody>
          <ModalTitle id="admin-export-title">
            Export to Flowerpil Accounts
          </ModalTitle>

          <InfoBox>
            Exports will be created on Flowerpil-managed DSP accounts only.
            Curator's personal libraries will not be modified.
          </InfoBox>

          <SelectAllButton onClick={handleSelectAll}>
            {allSelected ? 'Deselect All' : 'Select All'}
          </SelectAllButton>

          <PlatformSelectionGrid>
            {platforms.map(platform => (
              <PlatformCheckbox
                key={platform.key}
                $checked={selectedPlatforms[platform.key]}
              >
                <input
                  type="checkbox"
                  checked={selectedPlatforms[platform.key]}
                  onChange={() => handleTogglePlatform(platform.key)}
                  disabled={isExporting}
                />
                <span>{platform.label}</span>
              </PlatformCheckbox>
            ))}
          </PlatformSelectionGrid>

          {playlist && (
            <InfoBox>
              <strong>Playlist:</strong> {playlist.title}
              <br />
              <strong>Curator:</strong> {playlist.curator_name}
              <br />
              <strong>Tracks:</strong> {playlist.track_count || 0}
            </InfoBox>
          )}
        </StyledModalBody>

        <StyledModalFooter>
          <CancelButton onClick={handleClose} disabled={isExporting}>
            Cancel
          </CancelButton>
          {isExporting ? (
            <ExportingButton disabled>
              <LoaderContainer>
                <Spinner />
                Exporting...
              </LoaderContainer>
            </ExportingButton>
          ) : (
            <ExportButton
              onClick={handleExport}
              disabled={selectedCount === 0}
            >
              Export {selectedCount > 0 ? `(${selectedCount})` : ''}
            </ExportButton>
          )}
        </StyledModalFooter>
      </StyledModalSurface>
    </ModalRoot>
  );
};

export default AdminExportModal;
