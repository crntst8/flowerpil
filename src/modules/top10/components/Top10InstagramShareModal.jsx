/**
 * Top10InstagramShareModal Component
 *
 * Generates and downloads an Instagram Story image with:
 * - White background with minimalist MOMA aesthetic
 * - Times New Roman typography
 * - Track list in "Artist - Title" format
 * - Platform icons at bottom
 *
 * Flow: Shows preview → Download button → Copy URL instructions
 */

import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import {
  ModalRoot,
  ModalSurface,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalCloseButton,
} from '@shared/components/Modal';
import { Button } from '@modules/curator/components/ui';
import { theme } from '@shared/styles/GlobalStyles';

// Canvas element (hidden)
const HiddenCanvas = styled.canvas`
  display: none;
`;

// Preview image container
const PreviewContainer = styled.div`
  width: 100%;
  max-width: 160px;
  margin: 0.5rem auto 0;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
`;

const PreviewImage = styled.img`
  width: 100%;
  height: auto;
  display: block;
`;

const StepsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const StepBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  text-align: center;
`;

const StepNumber = styled.span`
  font-family: ${theme.fonts.primary};
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(0, 0, 0, 0.4);
`;

const StepTitle = styled.p`
  font-family: ${theme.fonts.primary};
  font-size: 1rem;
  font-weight: 500;
  letter-spacing: -0.02em;
  margin: 0;
  color: ${theme.colors.black};
`;

const URLBox = styled.div`
  padding: 0.625rem 0.875rem;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 6px;
  font-family: ${theme.fonts.mono};
  font-size: 0.8125rem;
  word-break: break-all;
  text-align: center;
  color: rgba(0, 0, 0, 0.7);
`;

// Main Modal Component
const Top10InstagramShareModal = ({ isOpen, onClose, slug, tracks, curatorName }) => {
  const canvasRef = useRef(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [copied, setCopied] = useState(false);

  const publicUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/top10/${slug}`
    : `https://flowerpil.com/top10/${slug}`;

  // Generate image when modal opens
  useEffect(() => {
    if (isOpen && tracks && tracks.length > 0 && canvasRef.current) {
      generateImage();
    }
  }, [isOpen, tracks, curatorName, slug]);

  const generateImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Instagram Story dimensions (1080 x 1920)
    canvas.width = 1080;
    canvas.height = 1920;

    // White background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Set default text properties
    ctx.fillStyle = '#000000';

    // Margins
    const topMargin = 150;
    const bottomMargin = 50;

    // Title at top (centered)
    ctx.textAlign = 'center';
    ctx.font = '56px "Times New Roman", serif';
    ctx.fillText('10 songs I loved in 2025', canvas.width / 2, 200 + topMargin);

    // Track list - sorted by position
    const sortedTracks = [...tracks].sort((a, b) => a.position - b.position);

    ctx.font = '36px "Times New Roman", serif';
    ctx.textAlign = 'left';

    const startY = 320 + topMargin;
    const lineHeight = 80;
    const leftMargin = 120;
    const maxWidth = canvas.width - 240;

    sortedTracks.forEach((track, index) => {
      const y = startY + (index * lineHeight);
      const text = `${track.artist} - ${track.title}`;

      // Truncate text if too long
      let displayText = text;
      let textWidth = ctx.measureText(displayText).width;

      if (textWidth > maxWidth) {
        while (textWidth > maxWidth && displayText.length > 3) {
          displayText = displayText.slice(0, -4) + '...';
          textWidth = ctx.measureText(displayText).width;
        }
      }

      ctx.fillText(displayText, leftMargin, y);
    });

    // Load and draw bottom image with DSP icons
    const bottomImage = new Image();
    bottomImage.crossOrigin = 'anonymous';
    bottomImage.src = '/ig-bottom.png';

    bottomImage.onload = () => {
      // Position image so bottom edge is 200px from canvas bottom
      // Image should be exactly 1080px wide to match canvas
      const bottomBuffer = 200;
      const imageY = canvas.height - bottomBuffer - bottomImage.height;

      // Draw at exact natural dimensions (image is 1080px wide)
      ctx.drawImage(bottomImage, 0, imageY);

      // Convert to blob URL
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        setImageUrl(url);
      }, 'image/png');
    };

    bottomImage.onerror = () => {
      console.error('Failed to load ig-bottom.png');
      // Fallback to text-only rendering
      const bottomY = 1920 - 350 - bottomMargin;
      ctx.font = '32px "Times New Roman", serif';
      ctx.textAlign = 'center';
      ctx.fillText('links to', canvas.width / 2, bottomY);
      ctx.font = '28px "Times New Roman", serif';
      ctx.fillText('Spotify • Apple Music • Tidal', canvas.width / 2, bottomY + 50);
      ctx.fillText('and more on', canvas.width / 2, bottomY + 100);
      ctx.font = 'bold 36px "Times New Roman", serif';
      ctx.fillText('flowerpil', canvas.width / 2, bottomY + 150);

      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        setImageUrl(url);
      }, 'image/png');
    };
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  const handleClose = () => {
    setCopied(false);
    onClose();
  };

  if (!slug || !tracks || tracks.length === 0) {
    return null;
  }

  return (
    <ModalRoot isOpen={isOpen} onClose={handleClose}>
      <ModalSurface $size="md">
        <ModalCloseButton />
        <ModalHeader>
          <ModalTitle>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img
                src="/assets/playlist-actions/instagram.svg"
                alt="Instagram"
                style={{ width: '24px', height: '24px' }}
              />
              Share to Instagram Story
            </div>
          </ModalTitle>
        </ModalHeader>
        <ModalBody>
          <HiddenCanvas ref={canvasRef} />
          <StepsContainer>
            <StepBlock>
              <StepNumber>Step 1</StepNumber>
              <StepTitle>Long press to save image</StepTitle>
              {imageUrl && (
                <PreviewContainer>
                  <PreviewImage src={imageUrl} alt="Instagram Story Preview" />
                </PreviewContainer>
              )}
            </StepBlock>

            <StepBlock>
              <StepNumber>Step 2</StepNumber>
              <StepTitle>Add to story with link sticker</StepTitle>
              <URLBox>{publicUrl}</URLBox>
              <Button onClick={handleCopyUrl} $variant={copied ? 'success' : 'secondary'} $fullWidth>
                {copied ? 'Copied!' : 'Copy Link'}
              </Button>
            </StepBlock>
          </StepsContainer>
        </ModalBody>
      </ModalSurface>
    </ModalRoot>
  );
};

export default Top10InstagramShareModal;
