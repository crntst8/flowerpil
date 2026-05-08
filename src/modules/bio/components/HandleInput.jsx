import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { Button, Card, Input, tokens } from '@modules/curator/components/ui';
import { useBioEditorStore } from '../store/bioEditorStore';
import * as bioService from '../services/bioService';

const HandleContainer = styled(Card)`
  padding: ${tokens.spacing[4]};
  background: ${theme.colors.fpwhite};
`;

const SectionHeader = styled.div`
  margin-bottom: ${theme.spacing.md};
  
  h4 {
    margin: 0 0 ${theme.spacing.xs} 0;
    color: ${theme.colors.black};
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.h3};
    font-weight: ${theme.fontWeights.bold};
  }
  
  p {
    margin: 0;
    font-size: ${theme.fontSizes.tiny};
    color: rgba(0, 0, 0, 0.6);
    font-family: ${theme.fonts.mono};
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
`;

const HandleInputContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const HandleFieldContainer = styled.div.withConfig({
  shouldForwardProp: (prop) => !['hasError', 'isValidating'].includes(prop)
})`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.solid} ${props => 
    props.hasError ? theme.colors.danger :
    props.isValidating ? theme.colors.warning :
    theme.colors.black
  };
  background: ${theme.colors.focusoutText};
  min-height: ${theme.touchTarget.comfortable};

  &:focus-within {
    border-color: ${theme.colors.primary};
    box-shadow: 0 0 0 3px rgba(49, 130, 206, 0.1);
  }
`;

const HandlePrefix = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.6);
  white-space: nowrap;
`;

const HandleInput = styled(Input).withConfig({
  shouldForwardProp: (prop) => !['hasError', 'isValidating'].includes(prop)
})`
  flex: 1;
  border: none;
  background: transparent;
  padding: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  min-height: ${theme.touchTarget.comfortable};
  
  &::placeholder {
    color: rgba(0, 0, 0, 0.4);
  }
  
  &:focus {
    outline: none;
    box-shadow: none;
  }
`;

const ValidationMessage = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'type'
})`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${props => 
    props.type === 'error' ? theme.colors.danger :
    props.type === 'success' ? theme.colors.success :
    props.type === 'warning' ? theme.colors.warning :
    theme.colors.black
  };
  opacity: ${props => props.type === 'info' ? 0.7 : 1};
  min-height: ${theme.touchTarget.min};
  display: flex;
  align-items: center;
`;

const PreviewContainer = styled.div`
  margin-top: ${theme.spacing.sm};
  padding: ${theme.spacing.sm};
  background: rgba(0, 0, 0, 0.03);
  border: ${theme.borders.solid} rgba(0, 0, 0, 0.12);
`;

const PreviewLabel = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.6);
  margin-bottom: ${theme.spacing.xs};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const PreviewUrl = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  word-break: break-all;
`;

const SuggestionsContainer = styled.div`
  margin-top: ${theme.spacing.sm};
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
`;

// Debounce hook
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

const HandleInputComponent = () => {
  const {
    currentBioProfile,
    handleValidation,
    updateHandle,
    setHandleValidation,
    previewUrl
  } = useBioEditorStore();

  const [localHandle, setLocalHandle] = useState(currentBioProfile.handle || '');
  const debouncedHandle = useDebounce(localHandle, 500);

  // Validation function
  const validateHandle = useCallback(async (handle) => {
    if (!handle.trim()) {
      setHandleValidation({
        isValid: false,
        isAvailable: false,
        isChecking: false,
        errors: ['Handle is required'],
        suggestions: []
      });
      return;
    }

    const cleanHandle = handle.toLowerCase().trim();
    
    // Start validation
    setHandleValidation(prev => ({
      ...prev,
      isChecking: true,
      errors: []
    }));

    try {
      // Pass current profile ID for editing scenarios to exclude from availability check
      const result = await bioService.validateHandle(cleanHandle, currentBioProfile.id);
      
      setHandleValidation({
        isValid: result.isValid,
        isAvailable: result.isAvailable,
        isChecking: false,
        errors: result.errors || [],
        suggestions: result.suggestions || []
      });
    } catch (error) {
      setHandleValidation({
        isValid: false,
        isAvailable: false,
        isChecking: false,
        errors: [`Validation failed: ${error.message}`],
        suggestions: []
      });
    }
  }, [setHandleValidation, currentBioProfile.id]);

  // Handle local input changes
  const handleInputChange = (e) => {
    let value = e.target.value;
    
    // Basic cleaning: only lowercase letters, numbers, hyphens
    value = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    
    // No consecutive hyphens (but allow editing)
    value = value.replace(/--+/g, '-');
    
    // Max length 30
    if (value.length > 30) {
      value = value.substring(0, 30);
    }
    
    // Don't strip leading/trailing hyphens during editing - let validation handle that
    setLocalHandle(value);
  };

  // Update store when debounced handle changes
  useEffect(() => {
    if (debouncedHandle !== currentBioProfile.handle) {
      updateHandle(debouncedHandle);
    }
  }, [debouncedHandle, updateHandle, currentBioProfile.handle]);

  // Validate when debounced handle changes
  useEffect(() => {
    if (debouncedHandle) {
      validateHandle(debouncedHandle);
    }
  }, [debouncedHandle, validateHandle]);

  // Sync local state with store only on initial mount or when store value changes externally
  useEffect(() => {
    if (currentBioProfile.handle !== localHandle && 
        currentBioProfile.handle !== debouncedHandle) {
      setLocalHandle(currentBioProfile.handle || '');
    }
  }, [currentBioProfile.handle]); // Remove localHandle dependency to avoid loops

  const getValidationMessage = () => {
    if (handleValidation.isChecking) {
      return { type: 'warning', text: 'Checking availability...' };
    }
    
    if (handleValidation.errors && handleValidation.errors.length > 0) {
      return { type: 'error', text: handleValidation.errors[0] };
    }
    
    if (!localHandle.trim()) {
      return { type: 'info', text: 'Choose a unique handle for your bio page' };
    }
    
    if (handleValidation.isValid && handleValidation.isAvailable) {
      return { type: 'success', text: 'Handle is available' };
    }
    
    return { type: 'info', text: 'Enter handle to check availability' };
  };

  const handleSuggestionClick = (suggestion) => {
    setLocalHandle(suggestion);
  };

  const validationMessage = getValidationMessage();

  return (
    <HandleContainer>
      <SectionHeader>
        <h4>Your Subdomain</h4>
        <p>3-30 characters, letters, numbers, hyphens only</p>
      </SectionHeader>

      <HandleInputContainer>
        <HandleFieldContainer
          hasError={handleValidation.errors && handleValidation.errors.length > 0}
          isValidating={handleValidation.isChecking}
        >
          <HandlePrefix>https://</HandlePrefix>
          <HandleInput
            type="text"
            value={localHandle}
            onChange={handleInputChange}
            placeholder="your-handle"
            maxLength={30}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
          />
          <HandlePrefix>.pil.bio</HandlePrefix>
        </HandleFieldContainer>

        <ValidationMessage type={validationMessage.type} role="status" aria-live="polite">
          {validationMessage.text}
        </ValidationMessage>

        {localHandle && handleValidation.isValid && handleValidation.isAvailable && (
          <PreviewContainer>
            <PreviewLabel>Your link-in-bio will be available at:</PreviewLabel>
            <PreviewUrl>{previewUrl}</PreviewUrl>
          </PreviewContainer>
        )}

        {handleValidation.suggestions && handleValidation.suggestions.length > 0 && (
          <div>
            <ValidationMessage type="info">
              Suggested alternatives:
            </ValidationMessage>
            <SuggestionsContainer>
              {(handleValidation.suggestions || []).slice(0, 5).map((suggestion, index) => (
                <Button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  type="button"
                  $variant="default"
                  $size="sm"
                >
                  {suggestion}
                </Button>
              ))}
            </SuggestionsContainer>
          </div>
        )}
      </HandleInputContainer>
    </HandleContainer>
  );
};

export default HandleInputComponent;
