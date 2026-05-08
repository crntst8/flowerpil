import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import { useAuth } from '@shared/contexts/AuthContext';
import { useSiteSettings } from '@shared/contexts/SiteSettingsContext';

const AccordionMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { isAuthenticated, user, logout } = useAuth();
  const { isTop10NavVisible } = useSiteSettings();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const hasTop10 = user?.top10_playlist_id != null;
  const canViewCuratorProfile = isAuthenticated && user?.role === 'curator' && user?.curator_name;
  const curatorProfilePath = canViewCuratorProfile
    ? `/curator/${encodeURIComponent(user.curator_name)}`
    : null;

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const closeMenu = () => {
    setIsOpen(false);
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
      closeMenu();
      navigate('/home');
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Edge swipe gesture disabled to avoid interfering with browser back/forward navigation
  // Menu can still be opened via the hamburger button

  // Close with ESC key when open
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  return (
    <MenuContainer>
      <MenuButton onClick={toggleMenu} aria-expanded={isOpen}>
        ☰
      </MenuButton>
      
      <MenuOverlay $isOpen={isOpen} onClick={closeMenu} />
      
      <MenuPanel $isOpen={isOpen}>
        <MenuHeader>
          <CloseButton onClick={closeMenu}>&times;</CloseButton>
        </MenuHeader>
        
        <MenuContent>
          <Group>
            <SectionLabel>EXPLORE</SectionLabel>
            <MenuItem>
              <MenuLink to="/home" onClick={closeMenu}>
                HOME
              </MenuLink>
            </MenuItem>
            <MenuItem>
              <MenuLink to="/playlists" onClick={closeMenu}>
                PLAYLISTS
              </MenuLink>
            </MenuItem>
            <MenuItem>
              <MenuLink to="/curators" onClick={closeMenu}>
                CURATORS
              </MenuLink>
            </MenuItem>
            {isTop10NavVisible() && (
              <MenuItem>
                <MenuLink to="/top10/browse" onClick={closeMenu}>
                   TOP 10 of 2025
                </MenuLink>
              </MenuItem>
            )}
            <MenuItem>
              <MenuLink to="/go" onClick={closeMenu}>
                QUICK IMPORT
              </MenuLink>
            </MenuItem>
            <MenuItem>
              <MenuLink to="/about" onClick={closeMenu}>
                ABOUT
              </MenuLink>
            </MenuItem>
          </Group>
          <br></br>
            <SectionLabel>ACCOUNT</SectionLabel>

          <ActionsGroup>
            {isAuthenticated && (user?.role === 'curator' || user?.role === 'admin') && (
              <MenuItem>
                <MenuAction to="/curator-admin" onClick={closeMenu}>
                  DASHBOARD
                </MenuAction>
              </MenuItem>
            )}
            {canViewCuratorProfile && (
              <MenuItem>
                <MenuAction to={curatorProfilePath} onClick={closeMenu}>
                  VIEW YOUR PROFILE
                </MenuAction>
              </MenuItem>
            )}
            {!isAuthenticated && (
              <>
                <MenuItem>
                  <MenuAction to="/curator-admin/login" onClick={closeMenu}>
                    LOGIN
                  </MenuAction>
                </MenuItem>
                <MenuItem>
                  <MenuAction to="/signup" onClick={closeMenu}>
                    CREATE AN ACCOUNT
                  </MenuAction>
                </MenuItem>
              </>
            )}
            {isAuthenticated && (
              <MenuItem>
                <MenuAction
                  as="button"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  aria-busy={isLoggingOut}
                  aria-disabled={isLoggingOut}
                  type="button"
                >
                  {isLoggingOut ? 'LOGGING OUT…' : 'LOGOUT'}
                </MenuAction>
              </MenuItem>
            )}
          </ActionsGroup>
        </MenuContent>
      </MenuPanel>
    </MenuContainer>
  );
};

// Styled Components
const MenuContainer = styled.div`
  position: relative;
  z-index: 1000;
`;

const MenuButton = styled.button`
  background: none;
  border: none;
  font-size: 50px;
  color: ${theme.colors.fpwhite};
  opacity: 0.4;
  cursor: pointer;
  padding: 0;
  margin: 0;
  font-family: ${theme.fonts.primary};
  transition: all ${theme.transitions.fast};
  height: 74px;
  width: 60px;
  display: flex;
  align-items: center;
  justify-content: right;
  line-height: 1;
  align-self: end;

  ${mediaQuery.mobile} {
    font-size: 36px;
    height: 56px;
    width: 40px;
    opacity: 0.4;
  }

  &:hover {
    opacity: 0.7;
    transform: scale(1.1);
  }

`;

const MenuOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(2px);
  opacity: ${props => props.$isOpen ? 1 : 0};
  visibility: ${props => props.$isOpen ? 'visible' : 'hidden'};
  transition: all ${theme.transitions.normal};
  z-index: 999;
`;

const MenuPanel = styled.div`
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  width: 300px;
  background: ${theme.colors.black};
  border-left: ${theme.borders.solid} ${theme.colors.fpwhite};
  transform: translateX(${props => props.$isOpen ? '0' : '100%'});
  transition: transform ${theme.transitions.normal};
  z-index: 1001;
  display: flex;
  flex-direction: column;
  
  ${mediaQuery.mobile} {
    width: 280px;
  }
`;

const MenuHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${theme.spacing.lg};
  border-bottom: ${theme.borders.solidThin} ${theme.colors.gray[300]};
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 32px;
  color: ${theme.colors.fpwhite};
  cursor: pointer;
  padding: 0;
  line-height: 1;
  transition: all ${theme.transitions.fast};
  
  &:hover {
    opacity: 0.7;
    transform: scale(1.1);
  }
  

`;

const MenuContent = styled.nav`
  flex: 1;
  padding: ${theme.spacing.md} 0;
`;

const MenuItem = styled.div`
  border-bottom: ${theme.borders.solidThin} ${theme.colors.gray[800]};
  
  &:last-child {
    border-bottom: none;
  }
`;

const Group = styled.div`
  padding: ${theme.spacing.sm} 0 ${theme.spacing.md};
`;

const SectionLabel = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.gray[500]};
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 0 ${theme.spacing.lg};
  margin: 0 0 ${theme.spacing.xs};
      border-bottom: ${theme.borders.solidThin} ${theme.colors.gray[800]};
      padding-bottom: ${theme.spacing.md};

`;

const MenuLink = styled(Link).withConfig({
  shouldForwardProp: (prop) => prop !== 'disabled'
})`
  display: block;
  padding: ${theme.spacing.md} ${theme.spacing.lg};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.hx};
  
  text-transform: uppercase;
  letter-spacing: -0.9px;
  color: ${props => props.disabled ? theme.colors.gray[600] : theme.colors.white};
  text-decoration: none;
  transition: all ${theme.transitions.fast};
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  position: relative;
  min-height: 48px;
  display: flex;
  align-items: center;
  
  
  ${props => !props.disabled && `
    &:hover {
      background: ${theme.colors.blackLess[900]};
      transform: translateX(8px);
    }
    

  `}
`;

const MenuAction = styled(MenuLink)`
  padding: ${theme.spacing.sm} ${theme.spacing.lg};
  font-size: ${theme.fontSizes.hx};
  opacity: 0.95;
  
`;

const ActionsGroup = styled(Group)`
    border-bottom: ${theme.borders.solidThin} ${theme.colors.gray[800]};

  background: linear-gradient(
    to bottom,
    transparent,
    rgba(255,255,255,0.02)
  );
`;

export default AccordionMenu;
