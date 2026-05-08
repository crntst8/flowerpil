import { useState } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

const SectionContainer = styled.div`
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.14);
  border-radius: 12px;
  background: ${theme.colors.fpwhite};
  overflow: hidden;
`;

const SectionHeader = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${theme.spacing.md};
  background: ${props => props.$collapsed ? 'transparent' : 'rgba(0, 0, 0, 0.03)'};
  border: none;
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
  }

  &:focus {
    outline: 2px solid ${theme.colors.black};
    outline-offset: -2px;
  }
`;

const SectionTitle = styled.h3`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${theme.colors.black};
  text-align: left;
`;

const SectionToggle = styled.span`
  font-size: ${theme.fontSizes.large};
  color: ${theme.colors.black};
  transition: transform 0.2s ease;
  transform: rotate(${props => props.$collapsed ? '0deg' : '180deg'});
`;

const SectionContent = styled.div`
  padding: ${props => props.$collapsed ? '0 ' + theme.spacing.md : theme.spacing.md};
  max-height: ${props => props.$collapsed ? '0' : '2000px'};
  overflow: hidden;
  transition: max-height 0.3s ease, padding 0.3s ease;
`;

const CollapsibleSection = ({
  title,
  defaultCollapsed = false,
  collapsed: controlledCollapsed,
  onToggle,
  children,
  badge
}) => {
  const [localCollapsed, setLocalCollapsed] = useState(defaultCollapsed);

  const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : localCollapsed;
  const setIsCollapsed = onToggle || setLocalCollapsed;

  const handleToggle = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <SectionContainer>
      <SectionHeader onClick={handleToggle} $collapsed={isCollapsed}>
        <SectionTitle>
          {title}
          {badge && <> {badge}</>}
        </SectionTitle>
        <SectionToggle $collapsed={isCollapsed}>▼</SectionToggle>
      </SectionHeader>
      <SectionContent $collapsed={isCollapsed}>
        {children}
      </SectionContent>
    </SectionContainer>
  );
};

export default CollapsibleSection;
