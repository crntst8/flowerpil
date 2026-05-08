import React from 'react';
import styled from 'styled-components';
import { getCuratorTypeLabel } from '@shared/constants/curatorTypes';
import { useSiteSettings } from '@shared/contexts/SiteSettingsContext';

const CuratorTypeDisplay = ({
  type,
  className,
  style,
  uppercase = true,
  prefix = ' | ',
  fallback = 'CURATOR',
  forceShow = false // Set to true on CuratorProfilePage to override sitewide hide
}) => {
  // Special case for "flowerpil" type - ALWAYS show (it's branding)
  if (type === 'flowerpil') {
    return (
      <FlowerpilLogo
        className={className}
        style={style}
        src="/black.png"
        alt="Flowerpil"
        prefix={prefix}
      />
    );
  }

  // Try to get settings, but don't fail if context is not available
  let shouldHide = false;
  try {
    const { shouldHideCuratorType } = useSiteSettings();
    shouldHide = shouldHideCuratorType();
  } catch (error) {
    // Context not available, default to showing
    console.warn('SiteSettingsContext not available, defaulting to showing curator type');
    shouldHide = false;
  }

  // Check if we should hide the curator type (unless forceShow is true)
  if (!forceShow && shouldHide) {
    return null;
  }

  // Default behavior for other curator types
  const label = getCuratorTypeLabel(type);
  const displayText = uppercase
    ? (label?.toUpperCase() || fallback)
    : (label || fallback.toLowerCase());

  return (
    <span className={className} style={style}>
      {prefix}{displayText}
    </span>
  );
};

const FlowerpilLogo = styled.img.withConfig({
  shouldForwardProp: (prop) => prop !== 'prefix'
})`
  /* Match the scaling and size of curator type text */
  height: 0.8em; /* Scale with parent font size */

  width: auto;
  display: inline-block;
  vertical-align: baseline;
  margin-left: ${props => props.prefix ? '0.2em' : '0'}; /* Small margin if there's a prefix */
    letter-spacing: -0.9px;

  /* Ensure it blends with text styling */
  filter: none;
  opacity: inherit;

  /* Handle prefix spacing - add pseudo-element for prefix text */
  ${props => props.prefix && `
    &::before {
      content: '${props.prefix}';
      margin-right: 0.1em;
      font-style: inherit;
      font-weight: inherit;
      font-size: inherit;
      line-height: inherit;
    }
  `}
`;

export default CuratorTypeDisplay;