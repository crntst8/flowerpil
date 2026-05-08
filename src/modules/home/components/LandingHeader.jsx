import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import SearchBar from '@core/components/SearchBar.jsx';
import AccordionMenu from './AccordionMenu';

const LandingHeader = () => {
  return (
    <HeaderContainer>
      <HeaderContent>
        {/* LAYOUT: Left Logo */}
        <LeftSection>
          <LogoLink to="/home">
            <LeftLogo src="/logo.png" alt="Flowerpil Logo" />
          </LogoLink>
        </LeftSection>

        <CenterLogoSection>
          <SearchWrapper>
            <SearchBar />
          </SearchWrapper>
        </CenterLogoSection>

        {/* LAYOUT: Right navigation menu */}
        <MenuSection>
          <AccordionMenu />
        </MenuSection>
      </HeaderContent>
    </HeaderContainer>
  );
};

/* HEADER CONTAINER: Fixed positioning and visual styling */

const HeaderContainer = styled.header`
  width: 100%;
  background: ${theme.colors.black};
  position: sticky;
  top: 0;
  z-index: 100;
  margin: 0;
  flex-shrink: 0;

  /* Optimize sticky positioning on mobile Safari */
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
`;

/* MAIN GRID LAYOUT: Three-column responsive structure with consistent width */
// GRID CHANGES: Modify grid-template-columns for layout adjustments
// Desktop: 1fr 2fr 1fr = left(25%) center(50%) right(25%)
// Mobile: auto 1fr auto = content-based left/right, flexible center
const HeaderContent = styled.div`
  display: grid;
  grid-template-columns: auto 1fr auto; /* CHANGE: Adjust column ratios here */
  align-items: end;
  max-width: ${theme.layout.maxWidth}; /* Match Container component width */
  margin: 0 auto; /* Center the header content */
  padding: ${theme.spacing.md} ${theme.layout.containerPadding} ${theme.spacing.sm} ${theme.layout.containerPadding}; /* Match Container padding */
  min-height: 80px; /* CHANGE: Adjust header height here */
  position: relative;
  
  /* Ensure all children align to exact same baseline */
  & > * {
    align-self: end;
  }
  
  /* MOBILE RESPONSIVENESS: Simplified layout for small screens */
  ${mediaQuery.mobile} {
    padding: ${theme.spacing.sm} ${theme.layout.containerPadding} ${theme.spacing.xs} ${theme.layout.containerPadding};
    grid-template-columns: auto 1fr auto; /* CHANGE: Modify mobile grid here */
    gap: ${theme.spacing.sm};
    min-height: 60px; /* CHANGE: Adjust mobile header height here */
  }
`;

/* LAYOUT SECTIONS: Define the three-column grid structure */

// Left empty section for visual balance
const LeftSection = styled.div``;

// Center logo section - contains main brand logo
const CenterLogoSection = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
`;

// Right menu section - contains navigation
const MenuSection = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: end;
  justify-self: end; /* lock to right edge of header grid */
`;

/* LOGO COMPONENTS: Clickable logo with hover effects */

// Main logo link - wraps the center logo image
const LogoLink = styled(Link)`
  text-decoration: none;
  display: inline-block;
  transition: opacity ${theme.transitions.fast}, transform ${theme.transitions.fast};

  &:hover {
    opacity: 0.8;
    transform: scale(1.1);
  }
`;
const LeftLogo = styled.img`
  height: 56px; 
  width: auto;
  max-width: 90px;
  object-fit: contain;
  display: block;
  
  ${mediaQuery.mobile} {
    height: 56px; 
    max-width: 60px;
  }
`;

const SearchWrapper = styled.div`
  display: flex;
  justify-content: flex-start;
  width: 100%;
  align-self: center;
  margin-bottom: 6px;

  ${mediaQuery.mobile} {
    width: 100%;
    margin-bottom: 2px;
  }
`;

export default LandingHeader;
