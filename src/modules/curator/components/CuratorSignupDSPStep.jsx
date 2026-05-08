import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import PlatformIcon from '@shared/components/PlatformIcon';

const DSP_PLATFORMS = [
  { id: 'spotify', label: 'Spotify' },
  { id: 'tidal', label: 'TIDAL' },
  { id: 'apple', label: 'Apple Music' },
  { id: 'none', label: 'Skip for now' }
];

/**
 * Simplified DSP Selection for Onboarding
 * Just collects which platforms user wants - OAuth happens post-signup
 *
 * Note: Spotify/YouTube OAuth is gated due to API limitations.
 * Curators can still import via URL and export via Flowerpil account.
 */
export default function CuratorSignupDSPStep({
  selections = {},
  onSelectionsChange,
  onValidationChange
}) {
  const [localSelections, setLocalSelections] = useState(selections);

  // Validate on mount and when selections change
  useEffect(() => {
    const hasAnySelection = Object.values(localSelections).some(v => v === true);
    const isValid = hasAnySelection;

    if (onValidationChange) {
      onValidationChange(isValid);
    }
  }, [localSelections, onValidationChange]);

  const handleCheckboxChange = (platformId, checked) => {
    let newSelections = { ...localSelections };

    if (platformId === 'none') {
      // None is mutually exclusive
      if (checked) {
        newSelections = { none: true, spotify: false, tidal: false, apple: false };
      } else {
        newSelections = { ...newSelections, none: false };
      }
    } else {
      // Selecting any DSP unchecks "None"
      newSelections[platformId] = checked;
      if (checked) {
        newSelections.none = false;
      }
    }

    setLocalSelections(newSelections);
    if (onSelectionsChange) {
      onSelectionsChange(newSelections);
    }
  };

  return (
    <Container>
      <Title>Which platforms do you use?</Title>

      <DSPGrid>
        {DSP_PLATFORMS.map((platform) => {
          const isSelected = localSelections[platform.id] || false;
          const isNone = platform.id === 'none';

          return (
            <DSPCard key={platform.id} $selected={isSelected} $isNone={isNone}>
              <CheckboxWrapper>
                <Checkbox
                  type="checkbox"
                  id={`dsp-${platform.id}`}
                  checked={isSelected}
                  onChange={(e) => handleCheckboxChange(platform.id, e.target.checked)}
                />
                <CheckboxLabel htmlFor={`dsp-${platform.id}`}>
                  {!isNone && <PlatformIcon platform={platform.id} size={24} inline />}
                  <LabelText>{platform.label}</LabelText>
                </CheckboxLabel>
              </CheckboxWrapper>

              {isSelected && ['spotify', 'tidal', 'apple'].includes(platform.id) && (
                <HintText>Connect after signup</HintText>
              )}
            </DSPCard>
          );
        })}
      </DSPGrid>
    </Container>
  );
}

// Styled Components
const Container = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
`;

const Title = styled.h2`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h3};
  font-weight: 400;
  letter-spacing: -0.5px;
  margin: 0;
  text-align: center;
  color: ${theme.colors.black};
`;

const DSPGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: ${theme.spacing.md};

  ${mediaQuery.mobile} {
    grid-template-columns: 1fr;
  }
`;

const DSPCard = styled.div`
  border: 2px solid ${props => props.$selected ? theme.colors.black : 'rgba(0,0,0,0.15)'};
  background: ${props => props.$selected ? 'rgba(0,0,0,0.02)' : 'transparent'};
  padding: ${theme.spacing.md};
  transition: all 0.2s ease;
  cursor: pointer;
  min-height: ${props => props.$isNone ? 'auto' : '120px'};

  &:hover {
    border-color: ${theme.colors.black};
  }
`;

const CheckboxWrapper = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${theme.spacing.sm};
`;

const Checkbox = styled.input`
  width: 20px;
  height: 20px;
  margin-top: 2px;
  cursor: pointer;
  flex-shrink: 0;
`;

const CheckboxLabel = styled.label`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  flex: 1;
  color: ${theme.colors.black};
`;

const LabelText = styled.span`
  font-weight: 500;
  letter-spacing: -0.3px;
`;

const HintText = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0,0,0,0.5);
  letter-spacing: -0.2px;
`;
