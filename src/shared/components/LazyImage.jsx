import React, { useEffect, useRef, useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { imageLoader } from '@shared/utils/performanceUtils';

const LazyImage = ({ 
  src, 
  alt, 
  placeholder = 'NO IMAGE', 
  className,
  loading = 'lazy',
  width,
  height,
  style,
  ...props 
}) => {
  const imgRef = useRef(null);
  const [imageState, setImageState] = useState('loading');
  const [imageSrc, setImageSrc] = useState('');

  useEffect(() => {
    const imgElement = imgRef.current;
    if (!imgElement || !src) return;

    // Set data-src for lazy loading
    imgElement.dataset.src = src;

    // Handle image load events
    const handleLoad = () => {
      setImageState('loaded');
      setImageSrc(src);
    };

    const handleError = () => {
      setImageState('error');
    };

    imgElement.addEventListener('load', handleLoad);
    imgElement.addEventListener('error', handleError);

    // Start observing for lazy loading
    if (loading === 'lazy') {
      imageLoader.observe(imgElement);
    } else {
      // Load immediately for eager loading
      imgElement.src = src;
    }

    return () => {
      imgElement.removeEventListener('load', handleLoad);
      imgElement.removeEventListener('error', handleError);
      if (loading === 'lazy') {
        imageLoader.unobserve(imgElement);
      }
    };
  }, [src, loading]);

  return (
    <ImageContainer 
      className={className} 
      state={imageState}
      style={{ width, height, ...style }}
    >
      <StyledImage
        ref={imgRef}
        alt={alt}
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

export default LazyImage;
