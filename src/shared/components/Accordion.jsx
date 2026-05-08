import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { theme } from '../styles/GlobalStyles';

const AccordionContainer = styled.div.withConfig({
  shouldForwardProp: (prop) => !['isOpen'].includes(prop)
})`
  border: ${theme.borders.dashed} rgba(255, 255, 255, 0.3);
  margin-bottom: ${theme.spacing.lg};
  background: transparent;
  
  @media (min-width: 1024px) {
    margin-bottom: ${theme.spacing.xl}; /* 32px gap between sections */
  }
`;

const AccordionHeader = styled.button.withConfig({
  shouldForwardProp: (prop) => !['isOpen'].includes(prop)
})`
  display: none;
  background: none;
  border: none;
  font-size: 16px;
  color: ${theme.colors.white};
  opacity: 0.4;
  cursor: pointer;
  padding: 0;
  margin: 0;
  font-family: ${theme.fonts.mono};
  transition: all ${theme.transitions.fast};
  /* Match Button component height: small font + sm padding (0.5rem * 2 = 1rem) + line height */
  width: auto;
  align-items: center;
  justify-content: center;
  align-self: end;
  
  &:hover {
    background: rgba(255, 255, 255, 0.02);
  }
  
  &:focus {
    outline: 2px dashed ${theme.colors.white};
    outline-offset: 2px;
  }
  
  &:active {
    transform: translateY(1px);
  }
`;

const AccordionTitle = styled.span`
  flex: 1;
  overflow-wrap: anywhere; // Never break words mid-word
  word-break: normal;
`;

const AccordionChevron = styled.span.withConfig({
  shouldForwardProp: (prop) => !['isOpen'].includes(prop)
})`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  font-size: 12px;
  transform: ${props => props.isOpen ? 'rotate(180deg)' : 'rotate(0deg)'};
  transition: transform 0.2s ease;
  margin-left: ${theme.spacing.md};
  flex-shrink: 0;
`;

const AccordionContent = styled.div.withConfig({
  shouldForwardProp: (prop) => !['isOpen'].includes(prop)
})`
  border-top: ${props => props.isOpen ? theme.borders.dashed + ' rgba(255, 255, 255, 0.2)' : 'none'};
  padding: ${props => props.isOpen ? theme.spacing.lg : '0'};
  max-height: ${props => props.isOpen ? 'none' : '0'};
  overflow: ${props => props.isOpen ? 'visible' : 'hidden'};
  opacity: ${props => props.isOpen ? '1' : '0'};
  transition: all 0.2s ease;
  background: transparent;
  
  ${props => !props.isOpen && `
    padding-top: 0;
    padding-bottom: 0;
  `}
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl};
  color: ${theme.colors.white};
  opacity: 0.6;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  
  p {
    margin: 0;
  }
`;

/**
 * Reusable Accordion component with localStorage persistence
 * 
 * @param {Object} props
 * @param {string} props.title - Accordion title (will be uppercased)
 * @param {React.ReactNode} props.children - Content to display when expanded
 * @param {Object} props.config - Section configuration
 * @param {boolean} props.config.enabled - Whether section is enabled
 * @param {number} props.config.displayOrder - Display order (for sorting)
 * @param {boolean} props.config.openOnLoad - Default open state
 * @param {string} props.storageKey - Unique key for localStorage persistence
 * @param {string} props.emptyMessage - Message to show when no content
 * @param {boolean} props.isEmpty - Whether content is empty
 * @param {string} props.ariaLabel - Accessibility label for screen readers
 */
const Accordion = ({
  title,
  children,
  config = { enabled: true, displayOrder: 0, openOnLoad: false },
  storageKey,
  emptyMessage = 'No items to display',
  isEmpty = false,
  ariaLabel
}) => {
  const [isOpen, setIsOpen] = useState(config.openOnLoad);

  // Load saved state from localStorage on mount
  useEffect(() => {
    if (storageKey) {
      try {
        const savedState = localStorage.getItem(storageKey);
        if (savedState !== null) {
          setIsOpen(JSON.parse(savedState));
        }
      } catch (error) {
        console.warn('Failed to load accordion state from localStorage:', error);
        // Fall back to config default
        setIsOpen(config.openOnLoad);
      }
    }
  }, [storageKey, config.openOnLoad]);

  // Save state to localStorage when changed
  const handleToggle = useCallback(() => {
    const newOpenState = !isOpen;
    setIsOpen(newOpenState);
    
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(newOpenState));
      } catch (error) {
        console.warn('Failed to save accordion state to localStorage:', error);
      }
    }
  }, [isOpen, storageKey]);

  // Keyboard handling for accessibility
  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleToggle();
    }
  }, [handleToggle]);

  // Don't render if section is disabled
  if (!config.enabled) {
    return null;
  }

  // Create accessible IDs
  const headerId = `accordion-header-${storageKey || title.toLowerCase().replace(/\s+/g, '-')}`;
  const contentId = `accordion-content-${storageKey || title.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <AccordionContainer>
      <AccordionHeader
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        isOpen={isOpen}
        aria-expanded={isOpen}
        aria-controls={contentId}
        id={headerId}
        aria-label={ariaLabel || `Toggle ${title} section`}
        type="button"
      >
        <AccordionTitle>{title.toUpperCase()}</AccordionTitle>
        <AccordionChevron isOpen={isOpen} aria-hidden="true">
          ▲
        </AccordionChevron>
      </AccordionHeader>
      
      <AccordionContent
        isOpen={isOpen}
        id={contentId}
        aria-labelledby={headerId}
        role="region"
      >
        {isEmpty ? (
          <EmptyState>
            <p>{emptyMessage}</p>
          </EmptyState>
        ) : (
          children
        )}
      </AccordionContent>
    </AccordionContainer>
  );
};

export default Accordion;