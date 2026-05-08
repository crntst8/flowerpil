/**
 * Top10PositionBar Component
 *
 * Black position bar with white number for track position display
 * Matches mockup: docs/mockup/total-page.png
 *
 * Design: Full-width black bar with centered white number
 */

import React from 'react';
import styled from 'styled-components';

const BarContainer = styled.div`
  background: #000;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(12px, 2vw, 16px) clamp(16px, 3vw, 24px);
  border: 2px solid #000;
  min-height: 48px;

  @media (max-width: 375px) {
    padding: 12px 16px;
    min-height: 44px;
  }
`;

const Position = styled.span`
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: clamp(1.5rem, 3vw, 2rem);
  font-weight: 900;
  color: #fff;
  line-height: 1;
`;

const Top10PositionBar = ({ position }) => {
  return (
    <BarContainer>
    </BarContainer>
  );
};

export default Top10PositionBar;
