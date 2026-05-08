import React from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { Button, Card, tokens, mediaQuery } from '@modules/curator/components/ui';
import PlatformIcon from '@shared/components/PlatformIcon';
import { useBioEditorStore } from '../store/bioEditorStore';

const ProfileLinksContainer = styled(Card)`
  padding: ${tokens.spacing[4]};
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

const LinksList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const LinkRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: ${theme.spacing.md};
  align-items: center;
  padding: ${theme.spacing.sm};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  background: ${theme.colors.fpwhite};

  ${mediaQuery.mobile} {
    grid-template-columns: 1fr;
  }
`;

const LinkInfo = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  min-width: 0;
`;

const LinkLabel = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  font-weight: ${theme.fontWeights.bold};
  color: ${theme.colors.black};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const LinkUrl = styled.a`
  display: block;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.6);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const LinkMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  min-width: 0;
`;

const LinkActions = styled.div`
  display: flex;
  justify-content: flex-end;

  ${mediaQuery.mobile} {
    width: 100%;
    justify-content: flex-start;
  }
`;

const EmptyState = styled.div`
  padding: ${theme.spacing.lg};
  text-align: center;
  color: rgba(0, 0, 0, 0.6);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
`;

const LoadingState = styled.div`
  padding: ${theme.spacing.md};
  text-align: center;
  color: rgba(0, 0, 0, 0.6);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const ProfileLinksDisplay = () => {
  const {
    profileLinks,
    selectedCurator,
    profileLinksVisibility,
    toggleProfileLinkVisibility
  } = useBioEditorStore();

  if (!selectedCurator) {
    return (
      <ProfileLinksContainer>
        <SectionHeader>
          <h4>Profile Links</h4>
          <p>Select a curator to see their profile links</p>
        </SectionHeader>
        
        <EmptyState>
          No curator selected
        </EmptyState>
      </ProfileLinksContainer>
    );
  }

  if (!profileLinks || profileLinks.length === 0) {
    return (
      <ProfileLinksContainer>
        <SectionHeader>
          <h4>Profile Links</h4>
          <p>Automatically derived from {selectedCurator.name}'s curator profile</p>
        </SectionHeader>
        
        <EmptyState>
          No profile links found for this curator.
          <br />
          Add social links or streaming URLs to their curator profile.
        </EmptyState>
      </ProfileLinksContainer>
    );
  }

  return (
    <ProfileLinksContainer>
      <SectionHeader>
        <h4>Profile Links</h4>
        <p>Links derived from {selectedCurator.name}'s profile. Toggle visibility below (shown by default).</p>
      </SectionHeader>
      <LinksList>
        {profileLinks.map((link, index) => {
          const key = (link.platform || link.label || '').toLowerCase();
          const active = profileLinksVisibility?.[key] ?? true;
          return (
            <LinkRow key={index}>
              <LinkInfo>
                <PlatformIcon platform={link.platform} size={20} />
                <LinkMeta>
                  <LinkLabel>{link.label || link.platform}</LinkLabel>
                  <LinkUrl href={link.url} target="_blank" rel="noopener noreferrer">
                    {link.url}
                  </LinkUrl>
                </LinkMeta>
              </LinkInfo>
              <LinkActions>
                <Button
                  $variant={active ? 'primary' : 'secondary'}
                  $size="sm"
                  onClick={() => toggleProfileLinkVisibility(key)}
                  aria-pressed={active}
                >
                  {active ? 'Shown' : 'Hidden'}
                </Button>
              </LinkActions>
            </LinkRow>
          );
        })}
      </LinksList>
    </ProfileLinksContainer>
  );
};

export default ProfileLinksDisplay;
