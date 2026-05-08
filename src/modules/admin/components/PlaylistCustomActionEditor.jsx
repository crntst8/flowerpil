import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { theme, Input, Button } from '@shared/styles/GlobalStyles';
import { adminGet } from '@modules/admin/utils/adminApi.js';
import ImageUpload from './ImageUpload.jsx';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};

`;

const FieldRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: ${theme.spacing.lg};
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const FieldLabel = styled.label`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${theme.colors.black[600]};
`;

const HelperText = styled.p`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
`;

const IconSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const IconHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const IconArea = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
`;

const IconPreview = styled.div`
  width: 76px;
  height: 76px;
  border: ${theme.borders.dashedThin} ${theme.colors.black[400]};
  background: rgba(255, 255, 255, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
`;

const IconImage = styled.img`
  max-width: 64px;
  max-height: 64px;
`;

const IconPlaceholder = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black[500]};
  text-transform: uppercase;
`;

const IconLibrary = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
  gap: ${theme.spacing.xs};
  padding: ${theme.spacing.xs};
  max-height: 220px;
  overflow-y: auto;
  border: ${theme.borders.dashedThin} ${theme.colors.black[300]};
  background: rgba(255, 255, 255, 0.03);
`;

const IconButton = styled.button.withConfig({ shouldForwardProp: (prop) => prop !== '$selected' })`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${theme.spacing.xs};
  border: ${theme.borders.solid} ${props => props.$selected ? theme.colors.primary : theme.colors.black[500]};
  background: ${props => props.$selected ? 'rgba(49, 130, 206, 0.25)' : 'transparent'};
  cursor: pointer;
  transition: all ${theme.transitions.fast};
  min-height: 52px;

  &:hover:not(:disabled) {
    border-color: ${theme.colors.primary};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const IconThumb = styled.img`
  max-width: 40px;
  max-height: 40px;
`;

const IconGroupLabel = styled.div`
  grid-column: 1 / -1;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${theme.colors.black[500]};
  margin-top: ${theme.spacing.xs};
`;

const StatusText = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black[500]};
`;

const CollapsibleButton = styled.button.withConfig({ shouldForwardProp: (prop) => prop !== '$isExpanded' })`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: ${theme.spacing.sm} 0;
  background: none;
  border: none;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black[600]};
  cursor: pointer;
  text-align: left;
  transition: color ${theme.transitions.fast};

  &:hover {
    color: ${theme.colors.primary};
  }

  .arrow {
    transform: ${props => props.$isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'};
    transition: transform ${theme.transitions.fast};
    font-size: ${theme.fontSizes.tiny};
  }
`;

const CollapsibleContent = styled.div.withConfig({ shouldForwardProp: (prop) => prop !== '$isExpanded' })`
  display: ${props => props.$isExpanded ? 'flex' : 'none'};
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const formatIconList = (icons = []) => {
  if (!icons.length) return [];
  return icons.map((icon) => ({
    ...icon,
    name: icon.filename?.replace(/\.png$/, '') || '',
    url: icon.url,
    type: icon.type // 'preset' or 'uploaded'
  }));
};

const PlaylistCustomActionEditor = ({ value, onChange, disabled = false }) => {
  const [icons, setIcons] = useState([]);
  const [isLoadingIcons, setIsLoadingIcons] = useState(false);
  const [iconsError, setIconsError] = useState('');
  const [isIconSectionExpanded, setIsIconSectionExpanded] = useState(false);

  const loadIcons = useCallback(async () => {
    setIsLoadingIcons(true);
    setIconsError('');
    try {
      const result = await adminGet('/api/v1/icons/library');
      if (result?.success && Array.isArray(result.icons)) {
        setIcons(formatIconList(result.icons));
      } else {
        throw new Error(result?.error || 'Unable to fetch icon library');
      }
    } catch (error) {
      console.error('Failed to load playlist action icons:', error);
      setIconsError(error.message || 'Failed to load icon library');
    } finally {
      setIsLoadingIcons(false);
    }
  }, []);

  useEffect(() => {
    loadIcons();
  }, [loadIcons]);

  const selectedIcon = value?.icon || '';

  const { presetIcons, uploadedIcons } = useMemo(() => {
    const preset = icons
      .filter((icon) => icon.type === 'preset')
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const uploaded = icons.filter((icon) => icon.type === 'uploaded');
    return { presetIcons: preset, uploadedIcons: uploaded };
  }, [icons]);

  const handleFieldChange = (field, fieldValue) => {
    onChange({
      [`custom_action_${field}`]: fieldValue
    });
  };

  const handleIconSelect = (icon) => {
    if (!icon || disabled) return;
    onChange({
      custom_action_icon: icon.url
    });
  };

  const handleIconClear = () => {
    onChange({
      custom_action_icon: ''
    });
  };

  const handleClearAll = () => {
    onChange({
      custom_action_label: '',
      custom_action_url: '',
      custom_action_icon: ''
    });
  };

  const handleIconUpload = async (uploadedUrl) => {
    if (!uploadedUrl) {
      handleIconClear();
      return;
    }

    onChange({
      custom_action_icon: uploadedUrl
    });

    await loadIcons();
  };

  const isSelected = (iconUrl) => selectedIcon && iconUrl === selectedIcon;

  const hasAnyValue = !!(
    value?.label ||
    value?.custom_action_label ||
    value?.url ||
    value?.custom_action_url ||
    selectedIcon
  );

  return (
    <Wrapper>
      <FieldRow>
        <Field>
          <FieldLabel htmlFor="custom-action-label">Button Label</FieldLabel>
          <Input
            id="custom-action-label"
            value={value?.label ?? value?.custom_action_label ?? ''}
            placeholder="Listen to full episode"
            onChange={(e) => handleFieldChange('label', e.target.value)}
            disabled={disabled}
            maxLength={80}
          />
          <HelperText>Leave blank to hide the action.</HelperText>
        </Field>
        <Field>
          <FieldLabel htmlFor="custom-action-url">Target URL</FieldLabel>
          <Input
            id="custom-action-url"
            type="url"
            value={value?.url ?? value?.custom_action_url ?? ''}
            placeholder="https://example.com/"
            onChange={(e) => handleFieldChange('url', e.target.value)}
            disabled={disabled}
          />
          <HelperText>Full URL including protocol (https://).</HelperText>
        </Field>
      </FieldRow>

      <IconSection>
        <CollapsibleButton
          type="button"
          onClick={() => setIsIconSectionExpanded(!isIconSectionExpanded)}
          $isExpanded={isIconSectionExpanded}
        >
          <span>{selectedIcon ? '✓ Icon selected - click to change' : 'Add icon (optional)'}</span>
          <span className="arrow">▼</span>
        </CollapsibleButton>

        <CollapsibleContent $isExpanded={isIconSectionExpanded}>
          <IconArea>
            <div>
              <IconPreview>
                {selectedIcon ? (
                  <IconImage
                    src={selectedIcon}
                    alt="Custom action icon"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                ) : (
                  <IconPlaceholder>No Icon</IconPlaceholder>
                )}
              </IconPreview>
              {selectedIcon && (
                <Button
                  onClick={handleIconClear}
                  disabled={disabled}
                  size="tiny"
                  variant="danger"
                  outline
                  style={{ marginTop: theme.spacing.xs, width: '76px' }}
                >
                  Clear
                </Button>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <ImageUpload
                currentImage={''}
                onImageUpload={handleIconUpload}
                disabled={disabled}
                uploadType="icons"
                title=""
                subtitle=""
                previewAlt="Custom action icon upload"
                compact
                hideHeader
                frameless
                allowedMimeTypes={['image/png', 'image/svg+xml', 'image/webp']}
                accept="image/png,image/svg+xml,image/webp"
                uploadHint="PNG, SVG, or WebP • Max 10MB"
              />
            </div>
          </IconArea>

        {isLoadingIcons && (
          <StatusText>Loading icon library…</StatusText>
        )}
        {iconsError && !isLoadingIcons && (
          <StatusText style={{ color: theme.colors.danger }}>Failed to load icons</StatusText>
        )}

        {!isLoadingIcons && !iconsError && (
          <IconLibrary>
            {presetIcons.length > 0 && (
              <IconGroupLabel>Preset Icons</IconGroupLabel>
            )}
            {presetIcons.map((icon) => (
              <IconButton
                key={`preset-${icon.filename}`}
                type="button"
                onClick={() => handleIconSelect(icon)}
                disabled={disabled}
                $selected={isSelected(icon.url)}
              >
                <IconThumb
                  src={icon.url}
                  alt={icon.name}
                  onError={(e) => e.target.style.opacity = '0.3'}
                />
              </IconButton>
            ))}

            {uploadedIcons.length > 0 && (
              <IconGroupLabel>Uploaded Icons</IconGroupLabel>
            )}
            {uploadedIcons.map((icon) => (
              <IconButton
                key={`uploaded-${icon.filename}`}
                type="button"
                onClick={() => handleIconSelect(icon)}
                disabled={disabled}
                $selected={isSelected(icon.url)}
              >
                <IconThumb
                  src={icon.url}
                  alt={icon.name}
                  onError={(e) => e.target.style.opacity = '0.3'}
                />
              </IconButton>
            ))}

            {!presetIcons.length && !uploadedIcons.length && (
              <StatusText>No icons available yet.</StatusText>
            )}
          </IconLibrary>
        )}
        </CollapsibleContent>
      </IconSection>

    </Wrapper>
  );
};

export default PlaylistCustomActionEditor;
