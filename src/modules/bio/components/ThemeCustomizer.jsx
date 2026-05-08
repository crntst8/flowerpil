import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { MainBox, Button, theme } from '@shared/styles/GlobalStyles';
import { useBioEditorStore } from '../store/bioEditorStore';
import { DEFAULT_THEME, validateColorCombination } from '../../../shared/constants/bioThemes';

const ThemeContainer = styled(MainBox)`
  padding: ${theme.spacing.md};
`;

const SectionHeader = styled.div`
  margin-bottom: ${theme.spacing.md};

  h4 {
    margin: 0 0 ${theme.spacing.xs} 0;
    color: ${theme.colors.black};
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.medium};
  }

  p {
    margin: 0;
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.black};
    opacity: 0.7;
  }
`;

const PreviewStack = styled.div`
  display: grid;
  gap: ${theme.spacing.md};

  @media (min-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const PreviewCard = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'background' && prop !== 'borderColor'
})`
  border: 2px ${props => props.borderColor || '#000'} solidThin;
  background: ${props => props.background || '#dadada'};
  padding: ${theme.spacing.md};
  min-height: 140px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: border-color 0.2s ease;
`;

const PreviewTitle = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  letter-spacing: 0.05em;
  text-transform: uppercase;
`;

const PreviewSample = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'textColor' && prop !== 'linkColor' && prop !== 'accentColor'
})`
  display: grid;
  gap: ${theme.spacing.xs};

  span {
    display: inline-flex;
    align-items: center;
    gap: ${theme.spacing.xs};
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.small};
  }

  span::after {
    display: none;
  }

  span[data-role='primary'] {
    color: ${props => props.textColor || '#000'};
  }

  span[data-role='link'] {
    color: ${props => props.linkColor || '#f5f5f5'};
  }

  span[data-role='accent'] {
    color: ${props => props.textColor || '#000'};
  }

  span[data-role='accent']::after {
    display: inline-block;
    content: '';
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: ${props => props.accentColor || '#000'};
  }
`;

const PreviewFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  opacity: 0.7;
  color: ${theme.colors.black};

  ${Button} {
    margin-left: auto;
  }
`;

const HeaderStatus = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${theme.colors.black};
  opacity: 0.6;
`;

const SettingLegend = styled.div`
  display: grid;
  gap: ${theme.spacing.xs};
  margin-bottom: ${theme.spacing.md};
`;

const LegendItem = styled.div`
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  opacity: 0.75;
`;

const LegendLabel = styled.span`
  font-family: ${theme.fonts.mono};
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: ${theme.colors.black};
  opacity: 0.8;
  margin-right: ${theme.spacing.xs};
`;

const CustomThemeSection = styled.div`
  padding: ${theme.spacing.md};
  background: rgba(255, 255, 255, 0.05);
  border: ${theme.borders.solid} rgba(0, 0, 0, 0.4);
  margin-top: ${theme.spacing.lg};
`;

const CustomThemeHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.md};

  h5 {
    margin: 0;
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.black};
  }

  p {
    margin: 0;
    font-size: ${theme.fontSizes.small};
    opacity: 0.7;
    color: ${theme.colors.black};
  }
`;

const ColorInputGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: ${theme.spacing.md};
`;

const ColorField = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const ColorLabel = styled.label`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  letter-spacing: 0.03em;
`;

const ColorHelper = styled.span`
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  opacity: 0.6;
  line-height: 1.4;
`;

const ColorInputContainer = styled.div`
  display: grid;
  grid-template-columns: 48px 1fr;
  gap: ${theme.spacing.xs};
`;

const ColorInput = styled.input`
  width: 48px;
  height: 32px;
  border: ${theme.borders.solid} rgba(0, 0, 0, 0.4);
  background: ${theme.colors.fpwhite};
  cursor: pointer;
`;

const ColorTextInput = styled.input`
  width: 100%;
  padding: ${theme.spacing.sm};
  border: ${theme.borders.solid} rgba(0, 0, 0, 0.4);
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};

  &:focus {
    outline: none;
    border-color: ${theme.colors.black};
  }
`;

const ValidationMessage = styled.div`
  margin-top: ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Badge = styled.span.withConfig({
  shouldForwardProp: (prop) => prop !== 'status'
})`
  padding: calc(${theme.spacing.xs} / 2) ${theme.spacing.sm};
  border-radius: 999px;
  border: 1px solid
    ${props => props.status === 'fail' ? '#c62828' : props.status === 'AAA' ? '#2e7d32' : '#1565c0'};
  color: ${props => props.status === 'fail' ? '#c62828' : props.status === 'AAA' ? '#2e7d32' : '#1565c0'};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.05em;
  text-transform: uppercase;
`;

const ControlsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.sm};
  justify-content: flex-end;
  margin-top: ${theme.spacing.md};
`;

const normalizeHex = (value, fallback) => {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;

  if (/^#[0-9a-fA-F]{3}$/.test(trimmed) || /^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  if (/^rgba?\(/i.test(trimmed)) {
    return trimmed;
  }

  return fallback;
};

const buildColorState = (colors) => ({
  background: colors.background || DEFAULT_THEME.background,
  text: colors.text || DEFAULT_THEME.text,
  link: colors.link || DEFAULT_THEME.link,
  border: colors.border || DEFAULT_THEME.border,
  accent: colors.accent || DEFAULT_THEME.accent,
  featuredLinkBg: colors.featuredLinkBg || DEFAULT_THEME.featuredLinkBg
});

const COLOR_FIELD_CONFIG = [
  {
    key: 'background',
    label: 'Background',
    placeholder: '#dadada',
    helper: 'Main background color for your bio page.'
  },
  {
    key: 'border',
    label: 'Border',
    placeholder: '#000000',
    helper: 'Border color for cards, dividers, and elements.'
  }
];

const ThemeCustomizer = () => {
  const { currentBioProfile, updateThemeSettings } = useBioEditorStore();

  const themeSettings = currentBioProfile.theme_settings || {};
  const hasCustomTheme = Boolean(themeSettings.customColors);

  const [customColors, setCustomColors] = useState(() =>
    buildColorState(themeSettings.customColors || {})
  );

  useEffect(() => {
    setCustomColors(buildColorState(themeSettings.customColors || {}));
  }, [JSON.stringify(themeSettings.customColors || {})]);

  const previewColors = useMemo(() => (
    buildColorState(customColors)
  ), [customColors]);

  const commitCustomColors = (colors) => {
    updateThemeSettings({ paletteId: DEFAULT_THEME.id, customColors: colors });
  };

  const handleToggleCustom = () => {
    if (hasCustomTheme) {
      const reset = buildColorState(DEFAULT_THEME);
      setCustomColors(reset);
      updateThemeSettings({ paletteId: DEFAULT_THEME.id, customColors: null });
    } else {
      const applied = buildColorState(customColors);
      setCustomColors(applied);
      commitCustomColors(applied);
    }
  };

  const handleReset = () => {
    const reset = buildColorState(DEFAULT_THEME);
    setCustomColors(reset);
    updateThemeSettings({ paletteId: DEFAULT_THEME.id, customColors: null });
  };

  const handleColorChange = (key, value) => {
    const nextColors = { ...customColors, [key]: value };
    setCustomColors(nextColors);

    if (hasCustomTheme) {
      commitCustomColors(nextColors);
    }
  };

  const handleColorInputBlur = (key) => {
    const fallback = DEFAULT_THEME[key] || '#000000';
    const normalized = normalizeHex(customColors[key], fallback);
    if (normalized !== customColors[key]) {
      const nextColors = { ...customColors, [key]: normalized };
      setCustomColors(nextColors);
      if (hasCustomTheme) {
        commitCustomColors(nextColors);
      }
    }
  };

  const applyCustomTheme = () => {
    const applied = buildColorState(customColors);
    setCustomColors(applied);
    commitCustomColors(applied);
  };

  const contrast = validateColorCombination(customColors.background, customColors.text);
  const badgeStatus = contrast.isValid ? contrast.wcagLevel : 'fail';

  return (
    <ThemeContainer>
      <SectionHeader>
        <h4>Theme Customization</h4>
        <p>Adjust how your published pil.bio looks. Apply when you want the live page to update.</p>
      </SectionHeader>

      <SettingLegend>
        {COLOR_FIELD_CONFIG.map(({ key, label, helper }) => (
          <LegendItem key={key}>
            <LegendLabel>{label}</LegendLabel>
            {helper}
          </LegendItem>
        ))}
      </SettingLegend>

      <PreviewStack>
        <PreviewCard
          background={DEFAULT_THEME.background}
          borderColor={DEFAULT_THEME.border}
        >
          <PreviewTitle>Default</PreviewTitle>
          <PreviewSample
            textColor={DEFAULT_THEME.text}
            linkColor={DEFAULT_THEME.link}
            accentColor={DEFAULT_THEME.accent}
          >
            <span data-role="primary">Primary text</span>
            <span data-role="link">Link text</span>
            <span data-role="accent">Accent detail</span>
          </PreviewSample>
          <PreviewFooter>
            <span>{DEFAULT_THEME.background} / {DEFAULT_THEME.text}</span>
            <Button size="small" variant="secondary" onClick={handleReset}>
              Reset to Default
            </Button>
          </PreviewFooter>
        </PreviewCard>

        <PreviewCard
          background={previewColors.background}
          borderColor={previewColors.border}
        >
          <PreviewTitle>{hasCustomTheme ? 'Custom Theme Live' : 'Custom Theme Preview'}</PreviewTitle>
          <PreviewSample
            textColor={previewColors.text}
            linkColor={previewColors.link}
            accentColor={previewColors.accent}
          >
            <span data-role="primary">Primary text</span>
            <span data-role="link">Link text</span>
            <span data-role="accent">Accent detail</span>
          </PreviewSample>
          <PreviewFooter>
            <span>{previewColors.background} / {previewColors.text}</span>
            <span>Links {previewColors.link}</span>
            <Button
              size="small"
              onClick={handleToggleCustom}
              disabled={!hasCustomTheme && !contrast.isValid}
            >
              {hasCustomTheme ? 'Disable Custom Theme' : 'Activate Custom Theme'}
            </Button>
          </PreviewFooter>
        </PreviewCard>
      </PreviewStack>

      <CustomThemeSection>
        <CustomThemeHeader>
          <div>
            <h5>Custom Colors</h5>
            <p>Adjust values and apply to sync the live pil.bio page.</p>
          </div>
          <HeaderStatus>
            {hasCustomTheme ? 'Live custom theme' : 'Custom theme inactive'}
          </HeaderStatus>
        </CustomThemeHeader>

        <ColorInputGrid>
          {COLOR_FIELD_CONFIG.map(({ key, label, placeholder, helper }) => {
            const baseId = `bio-theme-${key}`;
            return (
              <ColorField key={key}>
                <ColorLabel id={`${baseId}-label`} htmlFor={`${baseId}-hex`}>
                  {label}
                </ColorLabel>
                <ColorHelper>{helper}</ColorHelper>
                <ColorInputContainer>
                  <ColorInput
                    id={`${baseId}-picker`}
                    type="color"
                    aria-labelledby={`${baseId}-label`}
                    value={normalizeHex(customColors[key], DEFAULT_THEME[key])}
                    onChange={(event) => handleColorChange(key, event.target.value)}
                  />
                  <ColorTextInput
                    id={`${baseId}-hex`}
                    type="text"
                    aria-labelledby={`${baseId}-label`}
                    value={customColors[key] || ''}
                    onChange={(event) => handleColorChange(key, event.target.value)}
                    onBlur={() => handleColorInputBlur(key)}
                    placeholder={placeholder}
                  />
                </ColorInputContainer>
              </ColorField>
            );
          })}
        </ColorInputGrid>

        <ValidationMessage>
          <span>Contrast ratio: {typeof contrast.contrastRatio === 'number' ? contrast.contrastRatio.toFixed(2) : '0.00'}:1</span>
          <Badge status={badgeStatus}>
            {badgeStatus === 'fail' ? 'Needs improvement' : `WCAG ${badgeStatus}`}
          </Badge>
        </ValidationMessage>

        <ControlsRow>
          <Button size="small" variant="secondary" onClick={handleReset}>
            Reset Colors
          </Button>
          <Button
            size="small"
            onClick={applyCustomTheme}
            disabled={!contrast.isValid}
          >
            {hasCustomTheme ? 'Update Custom Theme' : 'Apply Custom Theme'}
          </Button>
        </ControlsRow>
      </CustomThemeSection>
    </ThemeContainer>
  );
};

export default ThemeCustomizer;
