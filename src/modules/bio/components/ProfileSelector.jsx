import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme, DashedBox } from '@shared/styles/GlobalStyles';
import * as curatorService from '../../admin/services/curatorService';

const ProfileSelectorContainer = styled(DashedBox)`
  padding: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.md};
`;

const FormField = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const Label = styled.label`
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.white};
  font-weight: 500;
`;

const Select = styled.select.withConfig({
  shouldForwardProp: (prop) => prop !== 'disabled'
})`
  padding: ${theme.spacing.sm};
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.4);
  background: rgba(0, 0, 0, 0.7);
  color: ${theme.colors.white};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  
  option {
    background: ${theme.colors.black};
    color: ${theme.colors.white};
  }
  
  &:focus {
    outline: none;
    border-color: rgba(255, 255, 255, 0.6);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const CuratorInfo = styled.div`
  margin-top: ${theme.spacing.sm};
  padding: ${theme.spacing.sm};
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.02);
`;

const CuratorName = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.white};
  font-weight: 500;
`;

const CuratorDetails = styled.div`
  font-size: ${theme.fontSizes.small};
  color: rgba(255, 255, 255, 0.7);
  margin-top: ${theme.spacing.xs};
`;

const LoadingMessage = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(255, 255, 255, 0.6);
  font-style: italic;
`;

const ProfileSelector = ({ selectedCurator, onCuratorSelect, disabled }) => {
  const [curators, setCurators] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadCurators = async () => {
      try {
        setIsLoading(true);
        const response = await curatorService.getCurators();
        setCurators(response.data || []);
        setError(null);
      } catch (err) {
        console.error('Failed to load curators:', err);
        setError('Failed to load curator profiles');
        setCurators([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadCurators();
  }, []);

  const handleCuratorChange = (e) => {
    const curatorId = parseInt(e.target.value, 10);
    const curator = curators.find(c => c.id === curatorId);
    onCuratorSelect(curator || null);
  };

  const getCuratorTypeLabel = (type) => {
    const typeMap = {
      'artist': 'Artist',
      'label': 'Label',
      'radio': 'Radio Show',
      'blogger': 'Blog/Media',
      'dj': 'DJ',
      'collective': 'Collective',
      'venue': 'Venue'
    };
    return typeMap[type] || type;
  };

  if (isLoading) {
    return (
      <ProfileSelectorContainer>
        <LoadingMessage>Loading curator profiles...</LoadingMessage>
      </ProfileSelectorContainer>
    );
  }

  if (error) {
    return (
      <ProfileSelectorContainer>
        <LoadingMessage style={{ color: theme.colors.danger }}>
          {error}
        </LoadingMessage>
      </ProfileSelectorContainer>
    );
  }

  return (
    <ProfileSelectorContainer>
      <FormField>
        <Label>Select Curator Profile</Label>
        <Select
          value={selectedCurator?.id || ''}
          onChange={handleCuratorChange}
          disabled={disabled || isLoading}
        >
          <option value="">-- Select a curator profile --</option>
          {curators.map(curator => (
            <option key={curator.id} value={curator.id}>
              {curator.name} ({getCuratorTypeLabel(curator.profile_type)})
            </option>
          ))}
        </Select>
      </FormField>

      {selectedCurator && (
        <CuratorInfo>
          <CuratorName>{selectedCurator.name}</CuratorName>
          <CuratorDetails>
            Type: {getCuratorTypeLabel(selectedCurator.profile_type)}
            {selectedCurator.location && ` • Location: ${selectedCurator.location}`}
            {selectedCurator.bio_short && (
              <>
                <br />
                Bio: {selectedCurator.bio_short.substring(0, 100)}
                {selectedCurator.bio_short.length > 100 && '...'}
              </>
            )}
          </CuratorDetails>
        </CuratorInfo>
      )}
    </ProfileSelectorContainer>
  );
};

export default ProfileSelector;