import React from 'react';
import styled from 'styled-components';
import { theme, MainBox } from '@shared/styles/GlobalStyles';
import { useBioEditorStore } from '../store/bioEditorStore';

const SettingsContainer = styled(MainBox)`
  padding: ${theme.spacing.md};
      box-shadow: 0 24px 48px -32px rgba(15, 14, 23, 0.5);

`;

const SectionHeader = styled.div`
  border-bottom: ${theme.borders.solidThin} ${theme.colors.gray[600]} ;
    margin-bottom: ${theme.spacing.md};


  h4 {
    margin: 0 0 ${theme.spacing.sm} 0;
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

const SettingsGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.md};
`;

const SettingRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${theme.spacing.sm};
  background: rgba(255, 255, 255, 0.02);
  border: ${theme.borders.solid} rgba(255, 255, 255, 0.1);
`;

const SettingInfo = styled.div`
  flex: 1;
`;

const SettingLabel = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  font-weight: 500;
  margin-bottom: ${theme.spacing.xs / 2};
`;

const SettingDescription = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  opacity: 0.6;
  line-height: 1.3;
`;

const SettingControl = styled.div`
  margin-left: ${theme.spacing.md};
`;

const Toggle = styled.button.withConfig({
  shouldForwardProp: (prop) => prop !== 'isEnabled'
})`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.solid} ${props => 
    props.isEnabled ? theme.colors.success : 'rgba(182, 61, 61, 0.4)'
  };
  background: ${props => 
    props.isEnabled ? 'rgba(76, 175, 80, 0.1)' : 'transparent'
  };
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 80px;
  
  &:hover {
    border-color: ${props => 
      props.isEnabled ? theme.colors.success : 'rgba(255, 255, 255, 0.6)'
    };
    background: ${props => 
      props.isEnabled ? 'rgba(76, 175, 80, 0.15)' : 'rgba(255, 255, 255, 0.05)'
    };
  }
`;

const SeoSection = styled.div`
  margin-top: ${theme.spacing.lg};
  padding-top: ${theme.spacing.lg};
  border-top: ${theme.borders.dashed} rgba(255, 255, 255, 0.2);
`;

const SeoHeader = styled.div`
  margin-bottom: ${theme.spacing.md};
  
  h5 {
    margin: 0 0 ${theme.spacing.xs} 0;
    color: ${theme.colors.black};
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    font-weight: 500;
  }
  
  p {
    margin: 0;
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.black};
    opacity: 0.7;
  }
`;

const SeoField = styled.div`
  margin-bottom: ${theme.spacing.sm};
`;

const Label = styled.label`
  display: block;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  margin-bottom: ${theme.spacing.xs};
  opacity: 0.8;
`;

const Input = styled.input`
  width: 100%;
  padding: ${theme.spacing.sm};
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.4);
  background: rgba(0, 0, 0, 0.7);
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  
  &::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }
  
  &:focus {
    outline: none;
    border-color: rgba(255, 255, 255, 0.6);
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: ${theme.spacing.sm};
  border: ${theme.borders.solid} rgba(0, 0, 0, 0.4);
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  min-height: 60px;
  resize: vertical;
  
  &::placeholder {
    color: rgba(64, 60, 60, 0.5);
  }
  
  &:focus {
    outline: none;
    border-color: rgba(255, 255, 255, 0.6);
  }
`;

const CharCount = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  opacity: 0.6;
  text-align: right;
  margin-top: ${theme.spacing.xs};
`;

const KeywordsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
  margin-top: ${theme.spacing.sm};
`;

const KeywordTag = styled.div`
  padding: ${theme.spacing.xs / 2} ${theme.spacing.xs};
  background: rgba(255, 255, 255, 0.1);
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.3);
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
`;

const RemoveKeyword = styled.button`
  background: none;
  border: none;
  color: ${theme.colors.black};
  cursor: pointer;
  font-size: 12px;
  
  &:hover {
    color: ${theme.colors.danger};
  }
`;

const DisplaySettingsPanel = () => {
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

  const displaySettingsConfig = [
    {
      key: 'showBio',
      label: 'Show Bio Section',
      description: 'Display bio text and description on the page'
    },
    {
      key: 'showLocation',
      label: 'Show Location',
      description: 'Display curator location if available'
    },
    {
      key: 'showProfilePicture',
      label: 'Show Profile Picture',
      description: 'Display curator profile image between location and featured links'
    },
    {
      key: 'showSocialLinks',
      label: 'Show Social Links',
      description: 'Display social media and platform buttons'
    },
    {
      key: 'showFeaturedLinks',
      label: 'Show Featured Links',
      description: 'Display the 3 featured link containers'
    },
    {
      key: 'showAnalytics',
      label: 'Show View Counter',
      description: 'Display page view counter (privacy-compliant)'
    }
  ];

  return (
    <SettingsContainer>
      <SectionHeader>
        <h4>Display Settings</h4>
        <p>Control which sections appear on your bio page</p>
      </SectionHeader>

      <SettingsGrid>
        {displaySettingsConfig.map(setting => (
          <SettingRow key={setting.key}>
            <SettingInfo>
              <SettingLabel>{setting.label}</SettingLabel>
              <SettingDescription>{setting.description}</SettingDescription>
            </SettingInfo>
            <SettingControl>
              <Toggle
                isEnabled={displaySettings[setting.key]}
                onClick={() => handleDisplayToggle(setting.key)}
              >
                {displaySettings[setting.key] ? 'Shown' : 'Hidden'}
              </Toggle>
            </SettingControl>
          </SettingRow>
        ))}
      </SettingsGrid>

      {/* Custom Bio Section */}
      <SeoSection>
        <SeoHeader>
          <h5>Custom Bio Text</h5>
          <p>Add custom text to your bio page (optional)</p>
        </SeoHeader>

        <SeoField>
          <Label>Custom Bio</Label>
          <TextArea
            value={draftContent.customBio || ''}
            onChange={(e) => handleBioChange(e.target.value)}
            placeholder="Add custom bio text here... (Leave empty to use curator bio)"
            maxLength={500}
            rows={4}
          />
          <CharCount>
            {(draftContent.customBio || '').length}/500 characters
          </CharCount>
        </SeoField>
      </SeoSection>

      <SeoSection>
        <SeoHeader>
          <h5>SEO Metadata</h5>
          <p>Optimize your bio page for search engines and social sharing</p>
        </SeoHeader>

        <SeoField>
          <Label>Page Title</Label>
          <Input
            type="text"
            value={seoMetadata.title || ''}
            onChange={(e) => handleSeoChange('title', e.target.value)}
            placeholder="Custom page title (leave empty for auto-generated)"
            maxLength={60}
          />
          <CharCount>
            {(seoMetadata.title || '').length}/60 characters
          </CharCount>
        </SeoField>

        <SeoField>
          <Label>Meta Description</Label>
          <TextArea
            value={seoMetadata.description || ''}
            onChange={(e) => handleSeoChange('description', e.target.value)}
            placeholder="Brief description for search results and social sharing"
            maxLength={160}
          />
          <CharCount>
            {(seoMetadata.description || '').length}/160 characters
          </CharCount>
        </SeoField>

        <SeoField>
          <Label>Keywords</Label>
          <Input
            type="text"
            placeholder="Add keywords and press Enter or comma"
            onKeyDown={handleKeywordInput}
          />
          {seoMetadata.keywords && seoMetadata.keywords.length > 0 && (
            <KeywordsContainer>
              {seoMetadata.keywords.map((keyword, index) => (
                <KeywordTag key={index}>
                  {keyword}
                  <RemoveKeyword
                    onClick={() => handleKeywordRemove(keyword)}
                    title="Remove keyword"
                  >
                    ×
                  </RemoveKeyword>
                </KeywordTag>
              ))}
            </KeywordsContainer>
          )}
        </SeoField>
      </SeoSection>
    </SettingsContainer>
  );
};

export default DisplaySettingsPanel;