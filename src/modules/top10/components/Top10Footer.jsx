/**
 * Top10Footer Component
 *
 * Footer for public Top 10 view with:
 * - "Open playlist in" text
 * - DSP icons (Spotify, Apple Music, Tidal) if export URLs exist
 * - "MAKE YOUR OWN" button linking to /top10/start
 *
 * Design: Black background, white text, large DSP icons
 */

import React from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';
import { theme } from '@shared/styles/GlobalStyles';

const FooterContainer = styled.footer`
  background: #000;
  color: #fff;
  padding: clamp(1.5rem, 4vw, 2.5rem) clamp(1rem, 5vw, 3rem);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  border-top: 2px solid #fff;

  @media (max-width: 375px) {
    padding: 1.5rem 1rem;
    gap: 1.25rem;
  }
`;

const OpenText = styled.p`
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: clamp(0.875rem, 2vw, 1rem);
  color: rgba(255, 255, 255, 0.9);
  margin: 0;
  text-align: center;
  letter-spacing: 0.02em;
`;

const DSPIconsLarge = styled.div`
  display: flex;
  gap: clamp(12px, 3vw, 24px);
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
`;

const DSPIconLarge = styled.a`
  width: 64px;
  height: 64px;
  min-width: 64px;
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px solid #fff;
  background: rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: transform 0.2s ease, background 0.2s ease;
  text-decoration: none;

  &:hover {
    transform: scale(1.1);
    background: rgba(255, 255, 255, 0.2);
  }

  &:active {
    transform: scale(1);
  }

  @media (max-width: 375px) {
    width: 56px;
    height: 56px;
    min-width: 56px;
    min-height: 56px;
  }
`;

const FooterButtonsContainer = styled.div`
  display: flex;
  flex-direction: row;
  gap: 12px;
  width: 100%;
  max-width: 420px;
  align-items: center;
`;

const FooterButton = styled(Link)`
  width: 100%;
  padding: 18px 24px;
  font-size: clamp(0.95rem, 4vw, 1.05rem);
  font-weight: 600;
  text-transform: lowercase;
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  border: 2px solid ${theme.colors.white};
  border-radius: 0;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: ${theme.fonts.primary};
  min-height: 56px;
  letter-spacing: 0.01em;
  text-decoration: none;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: ${theme.colors.fpwhiteIn};
    transform: translateY(-2px);
    box-shadow: 0 4px 0 ${theme.colors.black};
  }

  &:active {
    transform: translateY(0);
    box-shadow: none;
  }
`;


const Top10Footer = ({ exportUrls = {} }) => {
  const { spotify_export_url, apple_export_url, tidal_export_url } = exportUrls;

  const dspPlatforms = [
    { name: 'Spotify', url: spotify_export_url, icon: '/icons/spotify.svg' },
    { name: 'Apple Music', url: apple_export_url, icon: '/icons/apple.svg' },
    { name: 'Tidal', url: tidal_export_url, icon: '/icons/tidal.svg' },
  ];

  const availablePlatforms = dspPlatforms.filter(platform => platform.url);

  return (
    <FooterContainer>
      {availablePlatforms.length > 0 && (
        <>
          <OpenText>Open playlist in</OpenText>
          <DSPIconsLarge>
            {availablePlatforms.map((platform) => (
              <DSPIconLarge
                key={platform.name}
                href={platform.url}
                target="_blank"
                rel="noopener noreferrer"
                title={`Open on ${platform.name}`}
                aria-label={`Open on ${platform.name}`}
              >
                <img src={platform.icon} alt={platform.name} style={{ width: '32px', height: '32px' }} />
              </DSPIconLarge>
            ))}
          </DSPIconsLarge>
        </>
      )}
      <FooterButtonsContainer>
        <FooterButton to="/top10/start"> make your own → </FooterButton>
        <FooterButton to="/">more playlists →</FooterButton>
      </FooterButtonsContainer>
    </FooterContainer>
  );
};

export default Top10Footer;
