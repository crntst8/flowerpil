/**
 * ResponsiveImage Component
 * Phase 2: Responsive Image Delivery
 *
 * A modern image component that serves optimal format (AVIF/WebP/JPEG)
 * and size based on browser support and viewport
 *
 * @example
 * <ResponsiveImage
 *   src="https://images.flowerpil.io/playlists/abc123_large.jpg"
 *   alt="Playlist cover"
 *   sizes="(max-width: 640px) 100vw, 400px"
 *   loading="lazy"
 * />
 */

import React, { useEffect, useRef, useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { imageLoader } from '@shared/utils/performanceUtils';
import { getResponsiveImageUrls, buildSrcSet } from '@shared/utils/imageUtils';

const ResponsiveImage = ({
  src,
  alt,
  sizes = '100vw',
  loading = 'lazy',
  width,
  height,
  style,
  className,
  placeholder = 'NO IMAGE',
  fallback = null, // Original image URL if size variants don't exist
  onLoad,
  onError,
  ...props
}) => {
  const imgRef = useRef(null);
  const [imageState, setImageState] = useState('loading');

  useEffect(() => {
    const imgElement = imgRef.current;
    if (!imgElement || !src) return;

    // Fix: Check if image already loaded from browser cache
    if (imgElement.complete && imgElement.naturalHeight !== 0) {
      setImageState('loaded');
      if (onLoad) onLoad({ target: imgElement });
      return;
    }

    const handleLoad = (e) => {
      setImageState('loaded');
      if (onLoad) onLoad(e);
    };

    const handleError = (e) => {
      setImageState('error');
      if (onError) onError(e);
    };

    imgElement.addEventListener('load', handleLoad);
    imgElement.addEventListener('error', handleError);

    if (loading === 'lazy') {
      // Use IntersectionObserver for lazy loading
      imageLoader.observe(imgElement);
    }

    return () => {
      imgElement.removeEventListener('load', handleLoad);
      imgElement.removeEventListener('error', handleError);
      if (loading === 'lazy') {
        imageLoader.unobserve(imgElement);
      }
    };
  }, [src, loading, onLoad, onError]);

  // Generate responsive URLs for all formats
  const imageUrls = getResponsiveImageUrls(src);

  if (!imageUrls) {
    // Fallback to simple img if URL parsing fails
    return (
      <ImageContainer className={className} state={imageState} style={{ width, height, ...style }}>
        <StyledImage
          ref={imgRef}
          src={src}
          alt={alt}
          loading={loading}
          state={imageState}
          {...props}
        />
        {imageState === 'loading' && (
          <ImagePlaceholder>
            <LoadingSpinner />
            {placeholder}
          </ImagePlaceholder>
        )}
        {imageState === 'error' && (
          <ImagePlaceholder>
            {placeholder}
          </ImagePlaceholder>
        )}
      </ImageContainer>
    );
  }

  return (
    <ImageContainer className={className} state={imageState} style={{ width, height, ...style }}>
      <picture>
        {/* AVIF - best compression, newer browsers */}
        {imageUrls.avif && (
          <source
            type="image/avif"
            srcSet={buildSrcSet(imageUrls.avif)}
            sizes={sizes}
          />
        )}

        {/* WebP - good compression, wide support */}
        {imageUrls.webp && (
          <source
            type="image/webp"
            srcSet={buildSrcSet(imageUrls.webp)}
            sizes={sizes}
          />
        )}

        {/* JPEG/PNG fallback - universal support */}
        <StyledImage
          ref={imgRef}
          src={src || fallback || imageUrls.jpeg?.large || imageUrls.jpeg?.medium}
          srcSet={buildSrcSet(imageUrls.jpeg)}
          sizes={sizes}
          alt={alt}
          loading={loading}
          state={imageState}
          width={width}
          height={height}
          onError={(e) => {
            // If the size variant fails, try the fallback original
            if (fallback && e.target.src !== fallback) {
              e.target.src = fallback;
              e.target.removeAttribute('srcset'); // Remove srcset to prevent further attempts
            } else {
              // Call parent onError if provided
              if (onError) onError(e);
            }
          }}
          {...props}
        />
      </picture>

      {imageState === 'loading' && (
        <ImagePlaceholder>
          <LoadingSpinner />
          <PlaceholderText>{placeholder}</PlaceholderText>
        </ImagePlaceholder>
      )}

      {imageState === 'error' && (
        <ImagePlaceholder>
          <PlaceholderText>{placeholder}</PlaceholderText>
        </ImagePlaceholder>
      )}
    </ImageContainer>
  );
};

// Animations
const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

// Styled Components
const ImageContainer = styled.div`
  position: relative;
  overflow: hidden;
  background: ${theme.colors.gray[100]};

  ${props => props.state === 'loaded' && css`
    animation: ${fadeIn} 0.3s ease-out;
  `}
`;

const StyledImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: opacity 0.3s ease;

  ${props => props.state === 'loading' && css`
    opacity: 0;
  `}

  ${props => props.state === 'error' && css`
    display: none;
  `}

  ${props => props.state === 'loaded' && css`
    opacity: 1;
  `}
`;

const ImagePlaceholder = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.gray[500]};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  text-align: center;
  line-height: 1.2;
  padding: ${theme.spacing.sm};
`;

const LoadingSpinner = styled.div`
  width: 16px;
  height: 16px;
  border: 2px solid ${theme.colors.gray[300]};
  border-top: 2px solid ${theme.colors.primary};
  border-radius: 50%;
  animation: ${spin} 1s linear infinite;
  margin-bottom: ${theme.spacing.xs};
`;

const PlaceholderText = styled.div`
  margin-top: ${theme.spacing.xs};
`;

export default ResponsiveImage;
