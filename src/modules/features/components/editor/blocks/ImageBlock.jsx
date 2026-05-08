/**
 * ImageBlock Component
 *
 * Image block with upload functionality, caption, and position toggle.
 */

import React, { useRef, useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { typography, visuals } from '../../../styles/featureStyles.js';
import { uploadImage, getImageUrl } from '../../../services/featurePiecesService.js';

const ImageBlock = ({ block, onUpdate, onDelete }) => {
  const fileInputRef = useRef(null);
  const captionRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const position = block.position || 'full';

  // Auto-resize caption textarea
  useEffect(() => {
    if (captionRef.current) {
      captionRef.current.style.height = 'auto';
      captionRef.current.style.height = `${captionRef.current.scrollHeight}px`;
    }
  }, [block.caption]);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be less than 10MB');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      const response = await uploadImage(file);
      onUpdate(block.id, { url: response.data.url });
    } catch (err) {
      console.error('Image upload failed:', err);
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleCaptionChange = (e) => {
    onUpdate(block.id, { caption: e.target.value });
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handlePositionChange = (newPosition) => {
    onUpdate(block.id, { position: newPosition });
  };

  return (
    <Container $position={position}>
      <ControlsRow>
        <PositionToggle>
          <PositionButton
            $active={position === 'left'}
            onClick={() => handlePositionChange('left')}
            title="Float left"
          >
            L
          </PositionButton>
          <PositionButton
            $active={position === 'full'}
            onClick={() => handlePositionChange('full')}
            title="Full width"
          >
            F
          </PositionButton>
          <PositionButton
            $active={position === 'right'}
            onClick={() => handlePositionChange('right')}
            title="Float right"
          >
            R
          </PositionButton>
        </PositionToggle>
        <DeleteButton onClick={() => onDelete(block.id)} title="Delete block">
          x
        </DeleteButton>
      </ControlsRow>

      {block.url ? (
        <ImagePreview>
          <PreviewImage
            src={getImageUrl(block.url, position === 'full' ? 'large' : 'medium')}
            alt={block.caption || 'Uploaded image'}
          />
          <ReplaceButton onClick={handleUploadClick}>
            Replace
          </ReplaceButton>
        </ImagePreview>
      ) : (
        <UploadArea $position={position} onClick={handleUploadClick}>
          {uploading ? (
            <UploadText>Uploading...</UploadText>
          ) : (
            <>
              <UploadIcon>+</UploadIcon>
              <UploadText>Upload image</UploadText>
            </>
          )}
        </UploadArea>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {error && <ErrorText>{error}</ErrorText>}

      <CaptionInput
        ref={captionRef}
        value={block.caption || ''}
        onChange={handleCaptionChange}
        placeholder="Caption (optional)"
        rows={1}
      />
    </Container>
  );
};

const Container = styled.div`
  position: relative;
  padding: 12px 0;
  width: ${({ $position }) => $position === 'full' ? '100%' : '45%'};
  float: ${({ $position }) => {
    if ($position === 'left') return 'left';
    if ($position === 'right') return 'right';
    return 'none';
  }};
  margin-right: ${({ $position }) => $position === 'left' ? '20px' : '0'};
  margin-left: ${({ $position }) => $position === 'right' ? '20px' : '0'};

  &:hover > div:first-child {
    opacity: 1;
  }
`;

const ControlsRow = styled.div`
  position: absolute;
  top: 12px;
  right: -32px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  opacity: 0;
  transition: opacity ${theme.transitions.fast};
  z-index: 2;
`;

const PositionToggle = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const PositionButton = styled.button`
  width: 24px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ $active }) => $active ? theme.colors.black : 'transparent'};
  border: 1px solid ${({ $active }) => $active ? theme.colors.black : 'rgba(0, 0, 0, 0.3)'};
  color: ${({ $active }) => $active ? theme.colors.fpwhite : 'rgba(0, 0, 0, 0.5)'};
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  cursor: pointer;
  transition: all ${theme.transitions.fast};

  &:hover {
    background: ${theme.colors.black};
    color: ${theme.colors.fpwhite};
    border-color: ${theme.colors.black};
  }
`;

const DeleteButton = styled.button`
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid ${theme.colors.danger};
  color: ${theme.colors.danger};
  font-family: ${theme.fonts.mono};
  font-size: 12px;
  cursor: pointer;
  transition: all ${theme.transitions.fast};

  &:hover {
    background: ${theme.colors.danger};
    color: ${theme.colors.fpwhite};
  }
`;

const UploadArea = styled.div`
  width: 100%;
  min-height: ${({ $position }) => $position === 'full' ? '160px' : '120px'};
  border: 2px dashed rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all ${theme.transitions.fast};

  &:hover {
    border-color: ${theme.colors.black};
    background: rgba(0, 0, 0, 0.02);
  }
`;

const UploadIcon = styled.span`
  font-size: 24px;
  color: rgba(0, 0, 0, 0.4);
`;

const UploadText = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(0, 0, 0, 0.5);
`;

const ImagePreview = styled.div`
  position: relative;
`;

const PreviewImage = styled.img`
  width: 100%;
  height: auto;
  display: block;
  box-shadow: ${visuals.imageShadow};
`;

const ReplaceButton = styled.button`
  position: absolute;
  bottom: 12px;
  right: 12px;
  padding: 6px 12px;
  background: ${theme.colors.black};
  color: ${theme.colors.fpwhite};
  border: none;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  opacity: 0;
  transition: opacity ${theme.transitions.fast};

  ${ImagePreview}:hover & {
    opacity: 1;
  }

  &:hover {
    background: rgba(0, 0, 0, 0.8);
  }
`;

const ErrorText = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.danger};
  margin-top: 6px;
`;

const CaptionInput = styled.textarea`
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  overflow: hidden;
  margin-top: 8px;

  font-family: ${typography.imageCaption.fontFamily};
  font-weight: ${typography.imageCaption.fontWeight};
  font-style: ${typography.imageCaption.fontStyle};
  font-size: ${typography.imageCaption.fontSize};
  line-height: ${typography.imageCaption.lineHeight};
  color: rgba(0, 0, 0, 0.7);

  &::placeholder {
    color: rgba(0, 0, 0, 0.3);
  }

  &:focus {
    background: rgba(0, 0, 0, 0.02);
  }
`;

export default ImageBlock;
