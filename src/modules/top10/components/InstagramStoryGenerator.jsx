/**
 * InstagramStoryGenerator Component
 *
 * Generates a downloadable Instagram Story image with:
 * - White background
 * - Times New Roman typography
 * - Track list (Artist - Title format)
 * - Platform icons at bottom
 * - Minimalist MOMA aesthetic
 *
 * Renders to canvas and provides download functionality
 */

import React, { useRef, useEffect, useState } from 'react';

const InstagramStoryGenerator = ({ tracks, curatorName, slug, onImageReady }) => {
  const canvasRef = useRef(null);
  const [imageUrl, setImageUrl] = useState(null);

  useEffect(() => {
    if (tracks && tracks.length > 0 && canvasRef.current) {
      generateImage();
    }
  }, [tracks, curatorName, slug]);

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
    ctx.textAlign = 'right';

    // Margins
    const topMargin = 150;

    // Title at top
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

      // Convert canvas to blob URL
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        setImageUrl(url);
        if (onImageReady) {
          onImageReady(url);
        }
      }, 'image/png');
    };

    bottomImage.onerror = () => {
      // Fallback: generate without bottom image
      console.warn('Failed to load ig-bottom.png, generating without bottom image');
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        setImageUrl(url);
        if (onImageReady) {
          onImageReady(url);
        }
      }, 'image/png');
    };
  };

  const downloadImage = () => {
    if (!imageUrl) return;

    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `${slug || 'top10'}-instagram-story.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return {
    canvas: <canvas ref={canvasRef} style={{ display: 'none' }} />,
    imageUrl,
    downloadImage,
  };
};

export default InstagramStoryGenerator;
