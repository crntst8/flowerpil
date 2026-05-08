import React from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { Button, FormField, Input, TextArea, IconButton, tokens, mediaQuery } from '@modules/curator/components/ui';
import { useBioEditorStore } from '../store/bioEditorStore';

const SettingsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
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

const SettingsGroup = styled.div`
  margin-bottom: ${theme.spacing.xl};
`;

const GroupTitle = styled.h4`
  margin: 0 0 ${theme.spacing.md} 0;
  color: ${theme.colors.black};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  font-weight: ${theme.fontWeights.bold};
  padding-bottom: ${theme.spacing.sm};
  border-bottom: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
`;

const ToggleGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.sm};
`;

const ToggleRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  box-shadow: ${tokens.shadows.subtle};
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    border-color: rgba(0, 0, 0, 0.15);
    box-shadow: ${tokens.shadows.cardHover};
  }

  ${mediaQuery.mobile} {
    grid-template-columns: 1fr;
  }
`;

const ToggleInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const ToggleLabel = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  font-weight: ${theme.fontWeights.bold};
  color: ${theme.colors.black};
  margin-bottom: ${theme.spacing.xs};
`;

const ToggleDescription = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.5);
  line-height: 1.6;
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const CharCount = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.6);
  text-align: right;
  margin-top: ${theme.spacing.xs};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const KeywordsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.sm};
  margin-top: ${theme.spacing.sm};
`;

const KeywordTag = styled.div`
  display: inline-flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background: rgba(0, 0, 0, 0.03);
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.15);
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
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
`;

const DisplaySettingsPanelV2 = () => {
  const {
    currentBioProfile,
    updateDisplaySettings,
    updateSeoMetadata,
    updateDraftContent
  } = useBioEditorStore();

  const displaySettings = currentBioProfile.display_settings || {};
  const seoMetadata = currentBioProfile.seo_metadata || {};
  const draftContent = currentBioProfile.draft_content || {};

  const handleDisplayToggle = (setting) => {
    updateDisplaySettings({
      [setting]: !displaySettings[setting]
    });
  };

  const handleSeoChange = (field, value) => {
    updateSeoMetadata({
      [field]: value
    });
  };

  const handleBioChange = (value) => {
    updateDraftContent({
      ...draftContent,
      customBio: value
    });
  };

  const handleKeywordAdd = (keyword) => {
    if (!keyword.trim()) return;

    const keywords = seoMetadata.keywords || [];
    if (!keywords.includes(keyword.trim())) {
      updateSeoMetadata({
        keywords: [...keywords, keyword.trim()]
      });
    }
  };

  const handleKeywordRemove = (keywordToRemove) => {
    const keywords = seoMetadata.keywords || [];
    updateSeoMetadata({
      keywords: keywords.filter(keyword => keyword !== keywordToRemove)
    });
  };

  const handleKeywordInput = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleKeywordAdd(e.target.value);
      e.target.value = '';
    }
  };

  const visibilitySettings = [
    {
      key: 'showBio',
      label: 'Show Bio Section',
      description: 'Display bio text and description'
    },
    {
      key: 'showLocation',
      label: 'Show Location',
      description: 'Display curator location'
    },
    {
      key: 'showProfilePicture',
      label: 'Show Profile Picture',
      description: 'Display curator profile image'
    },
    {
      key: 'showSocialLinks',
      label: 'Show Social Links',
      description: 'Display social media buttons'
    },
    {
      key: 'showFeaturedLinks',
      label: 'Show Featured Links',
      description: 'Display featured link cards'
    },
    {
      key: 'showAnalytics',
      label: 'Show View Counter',
      description: 'Display page view counter'
    }
  ];

  return (
    <SettingsContainer>
      <SectionHeader>
        <h3>Display & SEO Settings</h3>
        <p>Control what appears on your bio page and optimize for search engines.</p>
      </SectionHeader>

      {/* Visibility Settings */}
      <SettingsGroup>
        <GroupTitle>Visibility Controls</GroupTitle>
        <InfoBox>
          <p>Toggle which sections appear on your published bio page. Hidden sections won't be visible to visitors.</p>
        </InfoBox>
        <ToggleGrid>
          {visibilitySettings.map(setting => (
            <ToggleRow key={setting.key}>
              <ToggleInfo>
                <ToggleLabel>{setting.label}</ToggleLabel>
                <ToggleDescription>{setting.description}</ToggleDescription>
              </ToggleInfo>
              <Button
                $variant={displaySettings[setting.key] ? 'success' : 'secondary'}
                $size="sm"
                onClick={() => handleDisplayToggle(setting.key)}
                aria-pressed={displaySettings[setting.key]}
              >
                {displaySettings[setting.key] ? 'Visible' : 'Hidden'}
              </Button>
            </ToggleRow>
          ))}
        </ToggleGrid>
      </SettingsGroup>

      {/* Custom Bio */}
      <SettingsGroup>
        <GroupTitle>Custom Bio Text</GroupTitle>
        <InfoBox>
          <p>Override your curator bio with custom text for this bio page. Leave empty to use your default curator bio.</p>
        </InfoBox>
        <div>
          <FormField label="Custom Bio (Optional)">
          <TextArea
            id="customBio"
            value={draftContent.customBio || ''}
            onChange={(e) => handleBioChange(e.target.value)}
            placeholder="Add custom bio text here..."
            maxLength={500}
          />
          </FormField>
          <CharCount>
            {(draftContent.customBio || '').length}/500 characters
          </CharCount>
        </div>
      </SettingsGroup>

      {/* SEO Metadata */}
      <SettingsGroup>
        <GroupTitle>SEO Optimization</GroupTitle>
        <InfoBox>
          <p>Improve your bio page's visibility on search engines and social media platforms.</p>
        </InfoBox>

        <div>
          <FormField label="Page Title">
          <Input
            id="seoTitle"
            type="text"
            value={seoMetadata.title || ''}
            onChange={(e) => handleSeoChange('title', e.target.value)}
            placeholder="Custom page title (auto-generated if empty)"
            maxLength={60}
          />
          </FormField>
          <CharCount>
            {(seoMetadata.title || '').length}/60 characters
          </CharCount>
        </div>

        <div>
          <FormField label="Meta Description">
          <TextArea
            id="seoDescription"
            value={seoMetadata.description || ''}
            onChange={(e) => handleSeoChange('description', e.target.value)}
            placeholder="Brief description for search results and social sharing"
            maxLength={160}
            rows={3}
          />
          </FormField>
          <CharCount>
            {(seoMetadata.description || '').length}/160 characters
          </CharCount>
        </div>

        <FormField label="Keywords">
          <Input
            id="seoKeywords"
            type="text"
            placeholder="Type a keyword and press Enter or comma"
            onKeyDown={handleKeywordInput}
          />
          {seoMetadata.keywords && seoMetadata.keywords.length > 0 && (
            <KeywordsContainer>
              {seoMetadata.keywords.map((keyword, index) => (
                <KeywordTag key={index}>
                  {keyword}
                  <IconButton
                    $variant="ghost"
                    $size="sm"
                    onClick={() => handleKeywordRemove(keyword)}
                    aria-label="Remove keyword"
                  >
                    x
                  </IconButton>
                </KeywordTag>
              ))}
            </KeywordsContainer>
          )}
        </FormField>
      </SettingsGroup>
    </SettingsContainer>
  );
};

export default DisplaySettingsPanelV2;
