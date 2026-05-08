/**
 * InsertButton Component
 *
 * Small [+] button displayed between blocks to insert new content at that position.
 */

import React, { useState } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

const BLOCK_TYPES = [
  { type: 'section_heading', label: 'Header' },
  { type: 'body', label: 'Body' },
  { type: 'pull_quote', label: 'Quote' },
  { type: 'divider', label: 'Line' },
  { type: 'image', label: 'Image' }
];

const InsertButton = ({ onInsert }) => {
  const [showMenu, setShowMenu] = useState(false);

  const handleButtonClick = () => {
    setShowMenu(!showMenu);
  };

  const handleTypeSelect = (type) => {
    onInsert(type);
    setShowMenu(false);
  };

  const handleBlur = (e) => {
    // Only close if clicking outside the menu
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setShowMenu(false);
    }
  };

  return (
    <Container onBlur={handleBlur}>
      <PlusButton
        onClick={handleButtonClick}
        $active={showMenu}
        title="Insert block"
      >
        +
      </PlusButton>
      {showMenu && (
        <Menu>
          {BLOCK_TYPES.map(({ type, label }) => (
            <MenuItem
              key={type}
              onClick={() => handleTypeSelect(type)}
            >
              {label}
            </MenuItem>
          ))}
        </Menu>
      )}
    </Container>
  );
};

const Container = styled.div`
  position: relative;
  display: flex;
  justify-content: center;
  height: 20px;
  margin: 4px 0;
`;

const PlusButton = styled.button`
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ $active }) => $active ? theme.colors.black : 'transparent'};
  color: ${({ $active }) => $active ? theme.colors.fpwhite : 'rgba(0, 0, 0, 0.3)'};
  border: 1px solid ${({ $active }) => $active ? theme.colors.black : 'rgba(0, 0, 0, 0.2)'};
  font-family: ${theme.fonts.mono};
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  transition: all ${theme.transitions.fast};

  &:hover {
    background: ${theme.colors.black};
    color: ${theme.colors.fpwhite};
    border-color: ${theme.colors.black};
  }
`;

const Menu = styled.div`
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 4px;
  background: ${theme.colors.fpwhite};
  border: 1px solid ${theme.colors.black};
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.1);
  z-index: 100;
  min-width: 120px;
`;

const MenuItem = styled.button`
  display: block;
  width: 100%;
  padding: 10px 16px;
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  text-align: left;
  cursor: pointer;
  transition: background ${theme.transitions.fast};

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: rgba(0, 0, 0, 0.05);
  }
`;

export default InsertButton;
