/**
 * Top10Header Component
 *
 * Header for Top10 views showing:
 * - 2025 logo on the left
 * - "curated by [name]" on the right
 * - Horizontal divider
 *
 * Design: Black background, white/light text, brutalist aesthetic
 */

import React from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';
import { theme } from '@shared/styles/GlobalStyles';

const HeaderContainer = styled.header`
  background: #000;
  color: #fff;
  padding: clamp(1.5rem, 4vw, 2.5rem) clamp(1rem, 5vw, 3rem);
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 1rem;
  border-bottom: 2px solid #fff;
  min-height: 80px;

  @media (max-width: 375px) {
    padding: 1.5rem 1rem;
    min-height: 70px;
    grid-template-columns: 1fr;
    align-items: flex-start;
    gap: 0.75rem;
  }
`;

const LogoSection = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const LogoLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  text-decoration: none;
  cursor: pointer;
`;

const Logo2025 = styled.img`
  height: clamp(60px, 15vw, 100px);
  width: auto;
  border-radius: 4px;
  object-fit: contain;
  flex-shrink: 0;

  @media (max-width: 375px) {
    font-size: 2rem;
  }
`;

const CuratedBy = styled.div`
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-size: clamp(0.875rem, 2vw, 1rem);
  color: rgba(255, 255, 255, 0.8);
  text-align: right;
  line-height: 1.4;

  @media (max-width: 375px) {
    text-align: left;
    font-size: 0.875rem;
  }
`;

const CuratorName = styled.span`
  color: #fff;
  font-weight: 600;
`;

const CTASection = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;

  @media (max-width: 375px) {
    justify-content: center;
    width: 100%;
  }
`;

const CTAButton = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  border: 2px solid ${theme.colors.white};
  font-family: ${theme.fonts.primary};
  font-size: clamp(0.875rem, 2vw, 1rem);
  font-weight: 600;
  text-decoration: none;
  text-transform: lowercase;
  transition: all 0.2s ease;
  white-space: nowrap;

  &:hover {
    background: ${theme.colors.fpwhiteIn};
    transform: translateY(-2px);
    box-shadow: 0 4px 0 ${theme.colors.black};
  }

  &:active {
    transform: translateY(0);
    box-shadow: none;
  }

  @media (max-width: 375px) {
    font-size: 0.875rem;
    padding: 6px 16px;
  }
`;

const Top10Header = ({ curatorName = 'Anonymous', showCurator = true, showCTA = false, logoLinkTo }) => {
  return (
    <HeaderContainer>
      <LogoSection>
        {logoLinkTo ? (
          <LogoLink to={logoLinkTo} aria-label="Flowerpil home">
            <Logo2025 src="/2025.png" alt="2025" />
          </LogoLink>
        ) : (
          <Logo2025 src="/2025.png" alt="2025" />
        )}
      </LogoSection>

      {showCurator && (
        <CuratedBy>
          curated by <CuratorName>{curatorName}</CuratorName>
        </CuratedBy>
      )}

      {showCTA && (
        <CTASection>
          <CTAButton as={Link} to="/top10/start">
            make your own →
          </CTAButton>
        </CTASection>
      )}
    </HeaderContainer>
  );
};

export default Top10Header;
