import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { Button, Card, Input, mediaQuery } from '@modules/curator/components/ui';
import { useBioEditorStore } from '../store/bioEditorStore';
import { DEFAULT_THEME, validateColorCombination } from '../../../shared/constants/bioThemes';

const ThemeContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const SectionHeader = styled.div`
  margin-bottom: ${theme.spacing.lg};

  h3 {
    margin: 0 0 ${theme.spacing.xs} 0;
    color: ${theme.colors.black};
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.h3};
    font-weight: ${theme.fontWeights.bold};
  }

  p {
    margin: 0;
    font-size: ${theme.fontSizes.tiny};
    font-family: ${theme.fonts.mono};
    color: rgba(0, 0, 0, 0.6);
    line-height: 1.6;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
`;

const PreviewCard = styled.div`
  background: ${props => props.$background || '#dadada'};
  border: ${theme.borders.solid} ${props => props.$borderColor || '#000'};
  padding: ${theme.spacing.xl};
  min-height: calc(${theme.spacing.xxl} * 6);
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.lg};
  transition: all 0.3s ease;

  @media (max-width: ${theme.breakpoints.mobile}) {
    padding: ${theme.spacing.lg};
    min-height: calc(${theme.spacing.xxl} * 5);
  }
`;

const PreviewContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const PreviewText = styled.div`
  color: ${props => props.$textColor || '#000'};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h3};
  font-weight: ${theme.fontWeights.bold};
`;

const PreviewLink = styled.div`
  color: ${props => props.$linkColor || '#000'};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  text-decoration: underline;
`;

const PreviewAccent = styled.div`
  display: inline-flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  color: ${props => props.$textColor || '#000'};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;

  &::before {
    content: '';
    width: ${theme.spacing.md};
    height: ${theme.spacing.md};
    border-radius: 50%;
    background: ${props => props.$accentColor || '#000'};
  }
`;

const ColorPickerSection = styled.div`
  display: grid;
  gap: ${theme.spacing.lg};
  margin-bottom: ${theme.spacing.lg};

  @media (min-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

const ColorPickerCard = styled(Card)`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const ColorPickerHeader = styled.div`
  h4 {
    margin: 0 0 ${theme.spacing.xs} 0;
    color: ${theme.colors.black};
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.body};
    font-weight: ${theme.fontWeights.bold};
  }

  p {
    margin: 0;
    font-size: ${theme.fontSizes.tiny};
    color: rgba(0, 0, 0, 0.6);
    line-height: 1.6;
    font-family: ${theme.fonts.mono};
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
`;

const ColorInputRow = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  align-items: center;
`;

const ColorInput = styled.input`
  width: ${theme.touchTarget.large};
  height: ${theme.touchTarget.large};
  border: ${theme.borders.solid} ${theme.colors.black};
  cursor: pointer;
  background: ${theme.colors.white};
  flex-shrink: 0;

  &::-webkit-color-swatch-wrapper {
    padding: ${theme.spacing.xs};
  }

  &::-webkit-color-swatch {
    border: none;
    border-radius: ${theme.radii.sm};
  }

  &:focus-visible {
    outline: 2px solid ${theme.colors.black};
    outline-offset: 2px;
  }
`;

const ColorTextInput = styled(Input)`
  flex: 1;
  min-height: ${theme.touchTarget.large};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const ContrastBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border: ${theme.borders.solid} ${props => {
    if (props.$status === 'fail') return '#dc2626';
    if (props.$status === 'AAA') return '#16a34a';
    return '#2563eb';
  }};
  background: ${props => {
    if (props.$status === 'fail') return 'rgba(220, 38, 38, 0.1)';
    if (props.$status === 'AAA') return 'rgba(22, 163, 74, 0.1)';
    return 'rgba(37, 99, 235, 0.1)';
  }};
  color: ${props => {
    if (props.$status === 'fail') return '#dc2626';
    if (props.$status === 'AAA') return '#16a34a';
    return '#2563eb';
  }};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.tiny};
  font-weight: ${theme.fontWeights.bold};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const ActionRow = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  justify-content: flex-end;
  flex-wrap: wrap;

  ${mediaQuery.mobile} {
    button {
      flex: 1;
      min-width: calc(${theme.spacing.xxl} * 3);
    }
  }
`;

const InfoBox = styled.div`
  background: rgba(37, 99, 235, 0.05);
  border: ${theme.borders.solid} rgba(37, 99, 235, 0.2);
  padding: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.lg};

  p {
    margin: 0;
    font-size: ${theme.fontSizes.tiny};
    font-family: ${theme.fonts.mono};
    color: rgba(0, 0, 0, 0.7);
    line-height: 1.6;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  strong {
    color: ${theme.colors.black};
  }
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

const ThemeCustomizerV2 = () => {
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

  const resetToDefault = () => {
    const reset = buildColorState(DEFAULT_THEME);
    setCustomColors(reset);
    updateThemeSettings({ paletteId: DEFAULT_THEME.id, customColors: null });
  };

  const contrast = validateColorCombination(customColors.background, customColors.text);
  const badgeStatus = contrast.isValid ? contrast.wcagLevel : 'fail';

  return (
    <ThemeContainer>
      <SectionHeader>
        <h3>Theme Customization</h3>
        <p>Customize the colors for your bio page. Changes apply when you activate the custom theme.</p>
      </SectionHeader>

      {hasCustomTheme ? (
        <InfoBox>
          <p><strong>Custom theme active</strong> - Your bio page is using your custom colors. Changes save automatically.</p>
        </InfoBox>
      ) : (
        <InfoBox>
          <p><strong>Default theme active</strong> - Adjust colors below and click "Activate Custom Theme" to apply them.</p>
        </InfoBox>
      )}

      <PreviewCard
        $background={previewColors.background}
        $borderColor={previewColors.border}
      >
        <div style={{
          fontSize: theme.fontSizes.small,
          color: previewColors.text,
          opacity: 0.6,
          textTransform: 'uppercase',
          letterSpacing: '0.1em'
        }}>
          Live Preview
        </div>
        <PreviewContent>
          <PreviewText $textColor={previewColors.text}>
            Your Curator Name
          </PreviewText>
          <PreviewLink $linkColor={previewColors.link}>
            Featured Link Example
          </PreviewLink>
          <PreviewAccent
            $textColor={previewColors.text}
            $accentColor={previewColors.accent}
          >
            Accent Color Example
          </PreviewAccent>
        </PreviewContent>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md }}>
          <div style={{
            fontSize: theme.fontSizes.small,
            color: previewColors.text,
            opacity: 0.5,
            fontFamily: theme.fonts.mono
          }}>
            Contrast: {typeof contrast.contrastRatio === 'number' ? contrast.contrastRatio.toFixed(2) : '0.00'}:1
          </div>
          <ContrastBadge $status={badgeStatus}>
            {badgeStatus === 'fail' ? 'Needs Improvement' : `WCAG ${badgeStatus}`}
          </ContrastBadge>
        </div>
      </PreviewCard>

      <ColorPickerSection>
        <ColorPickerCard>
          <ColorPickerHeader>
            <h4>Background Color</h4>
            <p>The main background color for your bio page</p>
          </ColorPickerHeader>
          <ColorInputRow>
            <ColorInput
              type="color"
              value={normalizeHex(customColors.background, DEFAULT_THEME.background)}
              onChange={(e) => handleColorChange('background', e.target.value)}
            />
            <ColorTextInput
              type="text"
              value={customColors.background || ''}
              onChange={(e) => handleColorChange('background', e.target.value)}
              onBlur={() => handleColorInputBlur('background')}
              placeholder="#dadada"
            />
          </ColorInputRow>
        </ColorPickerCard>

        <ColorPickerCard>
          <ColorPickerHeader>
            <h4>Border Color</h4>
            <p>Color for borders, dividers, and card outlines</p>
          </ColorPickerHeader>
          <ColorInputRow>
            <ColorInput
              type="color"
              value={normalizeHex(customColors.border, DEFAULT_THEME.border)}
              onChange={(e) => handleColorChange('border', e.target.value)}
            />
            <ColorTextInput
              type="text"
              value={customColors.border || ''}
              onChange={(e) => handleColorChange('border', e.target.value)}
              onBlur={() => handleColorInputBlur('border')}
              placeholder="#000000"
            />
          </ColorInputRow>
        </ColorPickerCard>
      </ColorPickerSection>

      <ActionRow>
        <Button
          onClick={resetToDefault}
          $variant="secondary"
          $size="md"
        >
          Reset to Default
        </Button>
        <Button
          onClick={applyCustomTheme}
          $variant="primary"
          $size="md"
          disabled={!contrast.isValid}
        >
          {hasCustomTheme ? 'Update Theme' : 'Activate Custom Theme'}
        </Button>
      </ActionRow>
    </ThemeContainer>
  );
};

export default ThemeCustomizerV2;
