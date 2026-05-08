
import { createGlobalStyle } from 'styled-components';

export const theme = {
  // Design Tokens - UX Primitives
  touchTarget: {
    min: '44px',        // Apple HIG / Android minimum
    comfortable: '48px', // Recommended for primary actions
    large: '56px',       // Hero buttons, CTAs
  },

  // Border Radius Tokens
  radii: {
    none: '0',
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
  },

  // Shadow Tokens
  shadows: {
    card: '0 2px 8px rgba(0, 0, 0, 0.08)',
    cardHover: '0 4px 16px rgba(0, 0, 0, 0.12)',
    modal: '0 8px 32px rgba(0, 0, 0, 0.24)',
    button: '3px 3px 0 #000',
    buttonHover: '4px 4px 0 #000',
    buttonActive: '2px 2px 0 #000',
  },

  // Colors
  colors: {
    black: '#000000',
    blackLess: '#000000bc',
    blackAct: '#272626ff',
    white: '#ffffff',
    fpwhite: 'rgba(219, 219, 218, 1)', // main white
    fpwhiteTrans: 'rgba(219, 219, 218, 0.85)',
    fpwhiteIn: 'rgba(219, 219, 218, 0.97)',
        curatorAction: '#fffffff3',
        selected: '#001affff',
        selectedFill: '#b7bffff0',

    
    // for track rows in metadata editor 
    fpwhiteRow: '#fff78eb8',
    
    
    // for quote borders on ExpandableTracks
    quote: '#191979',
    
    // for focused text editing inputs 
    focusinText: '#edeff0ff',
    focusoutText: '#ffffffe4',
	
    alertBorder: '#000000ff',
    alertBG: '#ececece4',


    
    plaftormSpotify: '#1ED760',
    platformApple: '#FA243C',
    platformSoundcloud:'#FF5500',
    platformBandcamp:'#408294',
    platformInstagram: '#FF0069',
    platformDiscogs: '#333333',
    plattformDiscord: '#5865F2',
    platformYoutube: '#FF0000',
    platformMixcloud: '#5000FF',
    platformReddit: '#FF4500',
    // TikTok & TIDAL = #000000




//for backgrounds
bgGreen: '#333300',
bgBlue: '#00bffff7',

    red: '#ff3b30',
    success: '#4caf50',
    stateSaved: '#009e375f',



    // for buttons
    danger: '#e53e3e',
    hoverDanger: '#8f2828ff',
    dangerBG: '#6a1b1b69',

    action: '#dfdfdfff',
    hoverAction: '#c2c0c0ff', 
    warning: '#dd6b20',
        hoverPrimary: '#91caffff',
    primary: '#479ff2e1',
    olive: '#aaff00a3',
    yellow: '#ebc803d0',
    oliveHover: '#7a9a2b',
    blue: '#438eff66',
    gray: {
      50: 'rgba(255,255,255,0.05)',
      100: 'rgba(255,255,255,0.1)',
      200: 'rgba(255,255,255,0.2)',
      300: 'rgba(255,255,255,0.3)',
      400: 'rgba(255,255,255,0.4)',
      500: 'rgba(255,255,255,0.5)',
      600: 'rgba(255,255,255,0.6)',
      700: 'rgba(255,255,255,0.7)',
      800: 'rgba(255,255,255,0.8)',
      900: 'rgba(255,255,255,0.9)',
    },
    darkGray: '#1a1a1a',
    borderGray: '#333',
    textGray: '#aaa',
    stickyAct: '#8a7b7bec',
  },
  




  // Typography
  fonts: {
    primary: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    mono: "'Paper Mono', 'Courier New', monospace",
  },
  
  fontWeights: {
    light: 300,
    regular: 400,
    medium: 500,
    bold: 700,
  },
  
  // Responsive font sizes using clamp
  fontSizes: {
    h1: 'clamp(1.8rem, 4vw, 2.5rem)',
    h2: 'clamp(1.3rem, 3vw, 2rem)',
    h3: 'clamp(1.2rem, 2.5vw, 1.5rem)',
    hx: 'clamp(1rem, 2.5vw, 1.5rem)',

    body: 'clamp(14px, 2vw, 16px)',
    small: 'clamp(0.7rem, 1.5vw, 0.85rem)',
    tiny: 'clamp(0.65rem, 1.2vw, 0.75rem)',
  },
  
  // Spacing
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    xxl: '3rem',
  },
  
  // Breakpoints
  breakpoints: {
    mobile: '420px',
    tablet: '768px',
    desktop: '1024px',
    wide: '1200px',
  },
  
  // Layout
  layout: {
    maxWidth: '1400px',
    containerPadding: 'clamp(1rem, 4vw, 2rem)',
  },
  
  // Transitions
  transitions: {
    fast: '0.15s ease',
    normal: '0.2s ease',
    slow: '0.3s ease',
  },
  
  // Borders
  borders: {
    dashed: '1px dashed',
    dashedThin: '0.5px dashed',
    dashedAct: '0.7px dashed',
    solid: '1px solid',
    solidThin: '0.5px solid',
    solidAct: '0.7px solid'
  },
};

export const GlobalStyles = createGlobalStyle`
  /* Font imports */
  @font-face {
    font-family: 'Paper Mono';
    src: url('/fonts/PaperMono-Regular.woff2') format('woff2');
    font-weight: 300 700;
    font-style: normal;
    font-display: swap;
  }

  /* Reset and base styles */
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  html {
    font-size: 16px;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    height: 100%;
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
  }
  
  body {
    background: ${theme.colors.fpwhite};
    color: ${theme.colors.black};
    font-family: ${theme.fonts.primary};
    font-weight: ${theme.fontWeights.regular};
    font-size: ${theme.fontSizes.body};
    line-height: 1.5;
    overflow-x: hidden;
    width: 100%;
    max-width: 100%;

    /* Mobile viewport fix */
    min-height: 100vh;
    min-height: -webkit-fill-available;
    min-height: calc(var(--vh, 1vh) * 100);
  }

  #root {
    min-height: 100vh;
    min-height: -webkit-fill-available;
    min-height: calc(var(--vh, 1vh) * 100);
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
  }
  
  /* Typography */
  h1, h2, h3, h4, h5, h6 {
    font-family: ${theme.fonts.primary};
    font-weight: ${theme.fontWeights.bold};
    line-height: 1.1;
    letter-spacing: -0.02em;
    margin: 0;
  }
  
  h1 {
    font-size: ${theme.fontSizes.h1};
  }
  
  h2 {
    font-size: ${theme.fontSizes.h2};
  }
  
  h3 {
    font-size: ${theme.fontSizes.h3};
  }
    hx {
    font-size: ${theme.fontSizes.h3};
    font-weight: ${theme.fontWeights.bold};
    letter-spacing: 0.9px;
  }
  p {
    margin: 0;
    line-height: 1.6;
  }
      px {
    margin: 0;
    line-height: 1.1;
    font-weight: bold;
    
  }
  
  /* Links */
  a {
    color: inherit;
    text-decoration: none;
    transition: opacity ${theme.transitions.fast};
    
    &:hover {
      opacity: 0.8;
    }
  }
  
  /* Buttons */
  button {
    background: none;
    border: none;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
    cursor: pointer;
    transition: all ${theme.transitions.fast};
    
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    
    &:active:not(:disabled) {
      transform: translateY(1px);
    }
  }
  
  /* Forms */
  input, textarea, select {
    background: ${theme.colors.white};
    color: ${theme.colors.black};
    border: ${theme.borders.solid} ${theme.colors.blackAct};
    padding: ${theme.spacing.sm} ${theme.spacing.md};
    font-family: inherit;
    font-size: inherit;
    
    border-radius: 0;
    transition: all ${theme.transitions.fast};
    
    &:focus {
      outline: none;
      border-color: ${theme.colors.primary};
      background: ${theme.colors.white};
    }
    
    &::placeholder {
      color:  rgba(122, 114, 114, 0.46);
    }
  }
  
  textarea {
    resize: vertical;
    min-height: 100px;
  }
  
  select {
    cursor: pointer;
  }
  
  /* Lists */
  ul, ol {
    list-style: none;
  }
  
  /* Images */
  img {
    max-width: 100%;
    display: block;
  }
  
  /* Scrollbar styling */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  
  ::-webkit-scrollbar-track {
    background: ${theme.colors.black};
  }
  
  ::-webkit-scrollbar-thumb {
    background: ${theme.colors.black};
    border-radius: 0;
    
    &:hover {
      background: ${theme.colors.gray[500]};
    }
  }
  
  /* Selection */
  ::selection {
    background: ${theme.colors.selectedFill};
    color: ${theme.colors.black};
  }
  
  /* Mobile-specific styles */
  @media (max-width: ${theme.breakpoints.mobile}) {
    body {
      font-size: 14px;
    }
    
    /* Touch target optimization - 44px minimum per Apple HIG / Android guidelines */
    button, 
    input[type="checkbox"], 
    input[type="radio"],
    select {
      min-height: ${theme.touchTarget.min};
    }

    input, textarea {
      min-height: ${theme.touchTarget.min};
      padding: 12px 16px;
    }

    /* Ensure checkbox/radio have adequate touch area */
    input[type="checkbox"],
    input[type="radio"] {
      width: ${theme.touchTarget.min};
      cursor: pointer;
    }
  }
  
  /* Utility classes */
  .container {
    max-width: ${theme.layout.maxWidth};
    margin: 0 auto;
    padding: 0 ${theme.layout.containerPadding};
  }
  
  .mono {
    font-family: ${theme.fonts.mono};
  }
  
  .uppercase {
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  
  .dashed-border {
    border: ${theme.borders.dashed} ${theme.colors.blackAct};
  }
  
  .loading {
    opacity: 0.6;
    pointer-events: none;
  }
  
  /* Animation keyframes */
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  
  @keyframes slideUp {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
  
  @keyframes pulse {
    0% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
    100% {
      opacity: 1;
    }
  }
  
  /* Loading dots animation */
  @keyframes ellipsis {
    0% { content: '.'; }
    33% { content: '..'; }
    66% { content: '...'; }
  }
  
  .loading-dots::after {
    content: '.';
    animation: ellipsis 1.5s infinite;
  }
`;

// Styled component utilities
export const mediaQuery = {
  mobile: `@media (max-width: ${theme.breakpoints.mobile})`,
  tablet: `@media (max-width: ${theme.breakpoints.tablet})`,
  desktop: `@media (min-width: ${theme.breakpoints.desktop})`,
  wide: `@media (min-width: ${theme.breakpoints.wide})`,
};

// Common styled components
import styled from 'styled-components';

export const Container = styled.div`
  max-width: ${theme.layout.maxWidth};
  margin: 0 auto;
  padding: 0 ${theme.layout.containerPadding};
`;

export const DashedBox = styled.div`
  border: ${theme.borders.dashedThin} ${theme.colors.blackAct};
  padding: ${theme.spacing.md};
  
  ${mediaQuery.mobile} {
    padding: ${theme.spacing.sm};
  }
`;
export const AlertBox = styled.div`
  border: ${theme.borders.solid} ${theme.colors.alertBorder};
  background: ${theme.colors.alertBG};
  padding: ${theme.spacing.md};
  
  ${mediaQuery.mobile} {
    padding: ${theme.spacing.sm};
  }
`;

export const MainBox = styled.div`
  padding: ${theme.spacing.sm};
  
  ${mediaQuery.mobile} {
    padding: ${theme.spacing.xs};
  }
`;
export const SolidBox = styled.div`
  border: ${theme.borders.solid} ${theme.colors.black};
  padding: ${theme.spacing.md};
  
  ${mediaQuery.mobile} {
    padding: ${theme.spacing.sm};
  }
`;

const buttonBg = (variant) => {
  switch (variant) {
    case 'primary':
      return theme.colors.primary;
    case 'secondary':
      return theme.colors.action;
    case 'olive':
    case 'olivePrimary':
      return theme.colors.olive;
    case 'yellow':
      return theme.colors.yellow;
    case 'action':
      return theme.colors.action;
    case 'success':
      return theme.colors.success;
    case 'danger':
      return theme.colors.danger;
    case 'fpwhite':
    default:
      return theme.colors.fpwhite;
  }
};

const buttonHoverBg = (variant) => {
  switch (variant) {
    case 'primary':
      return theme.colors.hoverPrimary || theme.colors.primary;
    case 'secondary':
      return theme.colors.hoverAction || theme.colors.action;
    case 'olive':
    case 'olivePrimary':
      return theme.colors.oliveHover || theme.colors.olive;
    case 'yellow':
      return theme.colors.yellow;
    case 'action':
      return theme.colors.hoverAction || theme.colors.action;
    case 'success':
      return theme.colors.success;
    case 'danger':
      return theme.colors.hoverDanger || theme.colors.danger;
    case 'fpwhite':
    default:
      return theme.colors.fpwhiteTrans;
  }
};

const buttonTextColor = (variant) => {
  if (variant === 'danger') return theme.colors.fpwhite;
  if (variant === 'primary') return theme.colors.black;
  if (variant === 'olivePrimary') return theme.colors.fpwhite;
  return theme.colors.black;
};
export const Button = styled.button`
  padding: ${props => {
    if (props.size === 'tiny') return `${theme.spacing.xs} ${theme.spacing.sm}`;
    if (props.size === 'small') return `${theme.spacing.sm} ${theme.spacing.md}`;
    if (props.size === 'large') return `${theme.spacing.md} ${theme.spacing.lg}`;
    return `${theme.spacing.sm} ${theme.spacing.md}`;
  }};
  min-height: ${props => {
    if (props.size === 'tiny') return '36px';
    if (props.size === 'small') return theme.touchTarget.min;
    if (props.size === 'large') return theme.touchTarget.large;
    return theme.touchTarget.min;
  }};
  border: 2px solid ${theme.colors.black};
  border-radius: 0;
  background: ${props => buttonBg(props.variant)};
  color: ${props => buttonTextColor(props.variant)};
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: ${theme.fontWeights.bold};
  font-size: ${props => {
    if (props.size === 'tiny') return theme.fontSizes.tiny;
    if (props.size === 'small') return theme.fontSizes.small;
    if (props.size === 'large') return theme.fontSizes.h3;
    return theme.fontSizes.small;
  }};
  transition: transform ${theme.transitions.fast}, box-shadow ${theme.transitions.normal}, background ${theme.transitions.fast}, border-color ${theme.transitions.fast}, color ${theme.transitions.fast};
  position: relative;

  /* Subtle premium enhancements */
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  box-shadow: ${theme.shadows.button};

  &:hover:not(:disabled) {
    background: ${props => buttonHoverBg(props.variant)};
    border-color: ${theme.colors.black};
    color: ${props => buttonTextColor(props.variant)};
    transform: translateY(-1px);
    box-shadow: ${theme.shadows.buttonHover};
  }

  &:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: ${theme.shadows.buttonActive};
  }

  &:disabled {
    opacity: 0.5;
    box-shadow: none;
  }

  /* Touch target enforcement on mobile */
  ${mediaQuery.mobile} {
    min-height: ${theme.touchTarget.min};
    padding: 12px 16px;
  }

  ${props => props.variant === 'danger' && !props.outline && `
    background: ${theme.colors.danger};
  `}

  ${props => props.variant === 'danger' && props.outline && `
    background: transparent;
    border-color: ${theme.colors.danger};
    color: ${theme.colors.danger};

    &:hover:not(:disabled) {
      background: ${theme.colors.dangerBG};
      border-color: ${theme.colors.hoverDanger};
      color: ${theme.colors.hoverDanger};
    }
  `}

    ${props => props.variant === 'action' && `
    background: ${theme.colors.action};
  `}
  ${props => props.variant === 'success' && `
    background: ${theme.colors.success};
  `}

  ${props => props.variant === 'olive' && `
    border-color: ${theme.colors.black};
  `}
    ${props => props.variant === 'fpwhite' && `
    border-color: ${theme.colors.black};
  `}
    ${props => props.variant === 'olivePrimary' && `
    border-color: ${theme.colors.black};
    color: ${theme.colors.fpwhite};
    font-family: ${theme.fonts.primary};
  `}
`;

export const Input = styled.input`
  width: 100%;
  background: ${theme.colors.focusoutText};
  border: ${theme.borders.solid} ${theme.colors.black};
  color: ${theme.colors.black};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  min-height: ${theme.touchTarget.min};

  &:focus {
    border-color: ${theme.colors.primary};
    background: ${theme.colors.intext};
  }

  ${mediaQuery.mobile} {
    padding: 12px 16px;
  }
`;

export const Select = styled.select`
  width: 100%;
  background: ${theme.colors.focusoutText};
  border: ${theme.borders.solid} ${theme.colors.black};
  color: ${theme.colors.black};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  cursor: pointer;

  &:focus {
    border-color: ${theme.colors.primary};
    background: ${theme.colors.focusinText};
  }
`;

export const TextArea = styled.textarea`
  width: 100%;
  border: ${theme.borders.solid} ${theme.colors.blackAct};
  color: ${theme.colors.black};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.primary};
  min-height: 100px;
  
  &:focus {
    border-color: ${theme.colors.black};
    background: ${theme.colors.intext};
  }
`;

export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: ${theme.spacing.lg};
  
  ${mediaQuery.mobile} {
    grid-template-columns: 1fr;
    grid-template-rows: 2fr;
    gap: ${theme.spacing.sm};
  }
`;

// Shared container components for curator module consistency

export const Card = styled.div`
  background: ${props => props.$variant === 'dark' ? theme.colors.black : 'rgba(255, 255, 255, 0.78)'};
  color: ${props => props.$variant === 'dark' ? theme.colors.fpwhite : theme.colors.black};
  border: ${theme.borders.solid} ${theme.colors.black};
  padding: ${theme.spacing.md};
  box-shadow: ${theme.shadows.card};
  transition: box-shadow ${theme.transitions.normal};

  ${props => props.$hoverable && `
    &:hover {
      box-shadow: ${theme.shadows.cardHover};
    }
  `}

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.sm};
  }
`;

export const FormSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

export const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

export const FormLabel = styled.label`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${theme.colors.black};
  margin-bottom: ${theme.spacing.xs};
`;

export const ActionBar = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  justify-content: ${props => props.$align || 'flex-start'};
  flex-wrap: wrap;

  ${mediaQuery.mobile} {
    flex-direction: ${props => props.$mobileStack ? 'column' : 'row'};

    ${props => props.$mobileStack && `
      > * {
        width: 100%;
      }
    `}
  }
`;

export const TouchCheckbox = styled.label`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  cursor: pointer;
  min-height: ${theme.touchTarget.min};
  padding: ${theme.spacing.xs} 0;
  user-select: none;

  input[type="checkbox"] {
    width: 24px;
    height: 24px;
    cursor: pointer;
    accent-color: ${theme.colors.black};
  }

  span {
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.small};
  }

  ${mediaQuery.mobile} {
    min-height: ${theme.touchTarget.comfortable};
    padding: ${theme.spacing.sm} 0;
  }
`;

export const ToggleButtonGroup = styled.div`
  display: inline-flex;
  gap: ${theme.spacing.xs};

  ${mediaQuery.mobile} {
    display: flex;
    width: 100%;
    gap: ${theme.spacing.sm};
  }
`;

export const ToggleButtonOption = styled.button`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  min-height: ${theme.touchTarget.min};
  font-family: ${theme.fonts.mono};
  font-size: 12px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border: ${theme.borders.solidThin} ${theme.colors.black};
  background: ${props => props.$active ? theme.colors.black : 'transparent'};
  color: ${props => props.$active ? theme.colors.fpwhite : theme.colors.black};
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  opacity: ${props => props.disabled ? 0.6 : 1};
  transition: background ${theme.transitions.fast}, color ${theme.transitions.fast};

  ${mediaQuery.mobile} {
    flex: 1;
    padding: ${theme.spacing.sm};
    font-size: 11px;
  }
`;
