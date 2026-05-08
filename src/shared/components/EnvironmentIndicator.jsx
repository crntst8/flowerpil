import { useMemo } from 'react';
import styled from 'styled-components';

const getEnvironment = () => {
  if (typeof window === 'undefined') return null;

  const hostname = window.location.hostname;
  const searchParams = new URLSearchParams(window.location.search);
  const hasStagingParam = searchParams.get('staging') === 'true';

  // Check for staging domain or query param
  if (hostname === 'staging.fpil.xyz' || hasStagingParam) {
    return 'staging';
  }

  // Check for localhost/dev
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'dev';
  }

  // Production - don't show indicator
  return null;
};

const Indicator = styled.div`
  position: fixed;
  top: clamp(16px, 4vw, 20px);
  left: clamp(16px, 4vw, 20px);
  z-index: 2147482998;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  backdrop-filter: blur(10px);
  opacity: 0.85;
  border-radius: 4px;
  pointer-events: none;
  user-select: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;

  ${props => {
    if (props.$env === 'staging') {
      return `
        background: rgba(255, 152, 0, 0.25);
        color: rgba(255, 193, 7, 0.95);
        border: 1px solid rgba(255, 152, 0, 0.4);
      `;
    }
    if (props.$env === 'dev') {
      return `
        background: rgba(76, 175, 80, 0.25);
        color: rgba(129, 199, 132, 0.95);
        border: 1px solid rgba(76, 175, 80, 0.4);
      `;
    }
    return '';
  }}
`;

const EnvironmentIndicator = () => {
  const environment = useMemo(() => getEnvironment(), []);

  if (!environment) {
    return null;
  }

  return (
    <Indicator $env={environment}>
      {environment}
    </Indicator>
  );
};

export default EnvironmentIndicator;

