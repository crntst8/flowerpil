import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

const Banner = styled.div`
  background: ${theme.colors.fpblack};
  color: ${theme.colors.fpwhite};
  padding: ${theme.spacing.md} ${theme.spacing.xl};
  text-align: center;
  font-family: ${theme.fonts.mono};
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${theme.spacing.sm};

  a {
    color: ${theme.colors.fpwhite};
    text-decoration: underline;
    font-weight: bold;
  }
`;

const DismissButton = styled.button`
  position: absolute;
  right: ${theme.spacing.md};
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: ${theme.colors.fpwhite};
  cursor: pointer;
  padding: ${theme.spacing.xs};
  opacity: 0.7;
  transition: opacity 0.2s;
  font-size: 18px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;

  &:hover {
    opacity: 1;
  }
`;

const QRCodeCTABanner = ({ cta, variant, onDismiss }) => {
  const mountTimeRef = useRef(Date.now());
  const [hasTrackedImpression, setHasTrackedImpression] = useState(false);

  // Track impression on mount (only once)
  useEffect(() => {
    if (!hasTrackedImpression && cta?.id) {
      setHasTrackedImpression(true);
    }
  }, [cta?.id, hasTrackedImpression]);

  const trackEvent = (eventType) => {
    if (!cta?.id) return;

    const timeToAction = Date.now() - mountTimeRef.current;

    fetch(`/api/v1/qr-ctas/${cta.id}/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variant: variant || 'A',
        eventType,
        timeToAction,
        playlistId: cta.playlist_id || null
      })
    }).catch(err => console.error('Failed to track QR CTA event:', err));
  };

  const handleClick = () => {
    trackEvent('click');
  };

  const handleDismiss = () => {
    trackEvent('dismiss');
    if (onDismiss) {
      onDismiss();
    }
  };

  // Use new A/B fields or fall back to legacy fields
  const headline = cta.headline;
  const link = cta.link || cta.cta_link;
  const ctaText = cta.cta_text;

  return (
    <Banner>
      <span>
        {headline}{' '}
        <a href={link} target="_blank" rel="noopener noreferrer" onClick={handleClick}>
          {ctaText}
        </a>
      </span>
      <DismissButton onClick={handleDismiss} aria-label="Dismiss banner">
        &times;
      </DismissButton>
    </Banner>
  );
};

export default QRCodeCTABanner;
