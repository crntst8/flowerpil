import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { theme, DashedBox, Button } from '@shared/styles/GlobalStyles';
import { adminUpload } from '@modules/admin/utils/adminApi';

const ImageUploadContainer = styled.div`
  margin: 0;
  padding: 0;
  width: 100%;
`;

const ImageUploadHeader = styled.div`
  margin-bottom: ${theme.spacing.lg};
    display: inline-flex;

  
  h3 {
    font-family: ${theme.fonts.mono};
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: ${theme.spacing.xs};
  }
  
  .subtitle {
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.black[500]};
    font-family: ${theme.fonts.mono};
  }
`;

const CoverHint = styled.div`
  margin-bottom: ${theme.spacing.sm};
  padding: 8px 12px;
  background: rgba(15, 23, 42, 0.03);
  color: rgba(15, 23, 42, 0.65);
  border-radius: 8px;
  border-left: 3px solid rgba(15, 23, 42, 0.15);
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.tiny};
  line-height: 1.4;
  display: flex;
  align-items: center;
  gap: 8px;

  strong {
    font-weight: ${theme.fontWeights.semibold};
    color: rgba(15, 23, 42, 0.8);
  }
`;

const UploadArea = styled.div.withConfig({
  shouldForwardProp: (prop) => !['isDragOver'].includes(prop),
})`
  border: 2px dashed ${props => props.isDragOver ? theme.colors.primary : 'rgba(15, 23, 42, 0.15)'};
  padding: ${theme.spacing.xl};
  text-align: center;
  cursor: pointer;
  transition: all ${theme.transitions.normal};
  background: ${props => props.isDragOver
    ? 'linear-gradient(135deg, rgba(71, 159, 242, 0.04) 0%, rgba(71, 159, 242, 0.06) 100%)'
    : '#fafbfc'};
  border-radius: 12px;
  transform: ${props => props.isDragOver ? 'scale(1.005)' : 'scale(1)'};
  min-height: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${theme.spacing.md};

  &:hover {
    border-color: ${theme.colors.primary};
    background: linear-gradient(135deg, rgba(71, 159, 242, 0.02) 0%, rgba(71, 159, 242, 0.04) 100%);
    transform: translateY(-1px);
  }

  .upload-icon {
    color: rgba(15, 23, 42, 0.35);

    svg {
      width: 48px;
      height: 48px;
      stroke-width: 1.5;
    }
  }

  .upload-text {
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.body};
    font-weight: ${theme.fontWeights.semibold};
    color: #0f172a;
  }

  .upload-hint {
    font-size: ${theme.fontSizes.tiny};
    color: rgba(15, 23, 42, 0.5);
    font-family: ${theme.fonts.mono};
    text-transform: uppercase;
    letter-spacing: 0.05em;
    max-width: 300px;
  }
`;

const ImagePreview = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const PreviewImageContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: ${theme.spacing.lg};
  background: #fafbfc;
  border-radius: 12px;
  border: ${theme.borders.solidThin} rgba(15, 23, 42, 0.1);
  position: relative;
`;

const PreviewImage = styled.img.withConfig({
  shouldForwardProp: (prop) => !['aspectRatio', 'isWide', 'isTall', 'compact'].includes(prop),
})`
  display: block;
  border: ${theme.borders.solidThin} rgba(15, 23, 42, 0.15);
  border-radius: 8px;
  object-fit: contain;
  width: 100%;
  max-width: 360px;
  height: auto;
  max-height: 360px;
  margin: 0 auto;
  box-shadow:
    0 4px 12px rgba(15, 23, 42, 0.08),
    0 1px 3px rgba(15, 23, 42, 0.05);

  /* Mobile responsive adjustments */
  @media (max-width: ${theme.breakpoints.mobile}) {
    max-width: 100%;
    max-height: 280px;
  }
`;

const ImageInfo = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(15, 23, 42, 0.6);
  text-align: center;
  padding: 6px 10px;
  background: rgba(15, 23, 42, 0.02);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;

  .filename {
    word-break: break-all;
    font-weight: ${theme.fontWeights.medium};
    color: rgba(15, 23, 42, 0.75);
  }

  .filesize {
    color: rgba(15, 23, 42, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.05em;

    &::before {
      content: '•';
      margin-right: 8px;
      color: rgba(15, 23, 42, 0.3);
    }
  }
`;

const ImageActions = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  margin-top: ${props => props.$noMarginTop ? 0 : theme.spacing.md};
  justify-content: center;

  @media (max-width: ${theme.breakpoints.mobile}) {
    justify-content: stretch;

    button {
      flex: 1;
    }
  }
`;

const HiddenInput = styled.input`
  display: none;
`;

const UploadStatus = styled.div`
  padding: 12px 16px;
  border: none;
  border-left: 3px solid ${props =>
    props.type === 'error' ? theme.colors.danger :
    props.type === 'success' ? theme.colors.success :
    theme.colors.primary
  };
  background: ${props =>
    props.type === 'error' ? 'linear-gradient(135deg, rgba(229, 62, 62, 0.06) 0%, rgba(229, 62, 62, 0.08) 100%)' :
    props.type === 'success' ? 'linear-gradient(135deg, rgba(76, 175, 80, 0.06) 0%, rgba(76, 175, 80, 0.08) 100%)' :
    'linear-gradient(135deg, rgba(71, 159, 242, 0.06) 0%, rgba(71, 159, 242, 0.08) 100%)'
  };
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  font-weight: ${theme.fontWeights.medium};
  color: ${props =>
    props.type === 'error' ? theme.colors.danger :
    props.type === 'success' ? theme.colors.success :
    theme.colors.primary
  };
  border-radius: 10px;
  margin-bottom: ${theme.spacing.md};
  box-shadow: ${props =>
    props.type === 'error' ? '0 2px 8px rgba(229, 62, 62, 0.12)' :
    props.type === 'success' ? '0 2px 8px rgba(76, 175, 80, 0.12)' :
    '0 2px 8px rgba(71, 159, 242, 0.12)'
  };
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};

  &::before {
    content: ${props =>
      props.type === 'error' ? '"⚠"' :
      props.type === 'success' ? '"✓"' :
      '"ℹ"'
    };
    font-size: 18px;
    flex-shrink: 0;
  }
`;

const UploadOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(6px);
  display: ${props => props.show ? 'flex' : 'none'};
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${theme.spacing.md};
  border-radius: 12px;
  z-index: 10;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
`;

const UploadSpinner = styled.div`
  width: 48px;
  height: 48px;
  border: 3px solid rgba(71, 159, 242, 0.2);
  border-top-color: ${theme.colors.primary};
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const UploadOverlayText = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  font-weight: ${theme.fontWeights.semibold};
  color: ${theme.colors.primary};
  text-align: center;
`;

const ImageUpload = ({
  currentImage,
  onImageUpload,
  disabled = false,
  uploadType = 'general',
  title = '',
  subtitle = '',
  previewAlt = 'Image preview',
  compact = false,
  hideHeader = false,
  hidePreview = false,
  actionsAlign = 'center',
  frameless = false,
  allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  accept = 'image/jpeg,image/jpg,image/png,image/webp',
  uploadHint = 'JPEG, PNG, WebP • Max 10MB • Recommended: 800x800px'
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState({ type: '', message: '' });
  const [previewUrl, setPreviewUrl] = useState('');
  const [imageInfo, setImageInfo] = useState(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0, aspectRatio: 1 });

  const fileInputRef = useRef(null);
  const statusTimeoutRef = useRef(null);

  const getImageUrl = (imagePath) => {
    if (!imagePath) return '';
    // If already a full URL, return as is
    if (imagePath.startsWith('http')) return imagePath;
    // If starts with /uploads, use as relative path for proxy
    if (imagePath.startsWith('/uploads')) {
      return imagePath;
    }
    // If no leading slash, add /uploads prefix
    return `/uploads/${imagePath}`;
  };

  // Update preview URL when currentImage changes
  useEffect(() => {
    const imageUrl = getImageUrl(currentImage);
    setPreviewUrl(imageUrl);

    // Load image to get dimensions
    if (imageUrl) {
      const img = new Image();
      img.onload = () => {
        const aspectRatio = img.naturalWidth / img.naturalHeight;
        setImageDimensions({
          width: img.naturalWidth,
          height: img.naturalHeight,
          aspectRatio
        });
      };
      img.src = imageUrl;
    }
  }, [currentImage]);

  // Cleanup status timeout on unmount
  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  const handleImageLoad = (e) => {
    const img = e.target;
    const aspectRatio = img.naturalWidth / img.naturalHeight;
    setImageDimensions({
      width: img.naturalWidth,
      height: img.naturalHeight,
      aspectRatio
    });
  };

  const showStatus = (type, message) => {
    setUploadStatus({ type, message });
    // Clear previous timeout if exists
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
    }
    // Errors persist until next user action; success/info auto-dismiss after 8s
    if (type !== 'error') {
      statusTimeoutRef.current = setTimeout(() => setUploadStatus({ type: '', message: '' }), 8000);
    }
  };

  const validateFile = (file) => {
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    if (!allowedMimeTypes.includes(file.type)) {
      const allowedLabel = allowedMimeTypes
        .map((type) => {
          const subtype = (type.split('/')[1] || type)
            .replace(/\+xml$/i, '')
            .replace(/-/g, ' ')
            .toUpperCase();
          return subtype;
        })
        .join(', ');
      throw new Error(`Invalid file type. Allowed types: ${allowedLabel}.`);
    }

    if (file.size > maxSize) {
      throw new Error('File size too large. Maximum size is 10MB.');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const uploadImage = async (file) => {
    setIsUploading(true);
    setUploadStatus({ type: 'info', message: 'Uploading image...' });

    try {
      validateFile(file);

      const formData = new FormData();

      // Special handling for icons upload
      const isIconUpload = uploadType === 'icons';
      const uploadEndpoint = isIconUpload
        ? `/api/v1/icons/upload`
        : `/api/v1/uploads/image?type=${uploadType}`;
      const fieldName = isIconUpload ? 'icon' : 'image';

      formData.append(fieldName, file);

      let result;
      try {
        result = await adminUpload(uploadEndpoint, formData);
      } catch (uploadError) {
        // Handle cases where the server returns a non-JSON response or network errors
        if (uploadError.message.includes('JSON') || uploadError.message.includes('parse')) {
          throw new Error('Upload failed - file may be too large or unsupported format');
        }
        throw uploadError;
      }

      // Set preview and image info
      // Icons endpoint returns {url, size, format}, regular upload returns {primary_url, images}
      const uploadedUrl = isIconUpload ? result.url : result.data.primary_url;
      setPreviewUrl(uploadedUrl);
      setImageInfo({
        filename: isIconUpload ? result.filename : result.data.original_name,
        size: file.size,
        url: uploadedUrl,
        images: isIconUpload ? null : result.data.images
      });

      // Load the uploaded image to get dimensions
      const img = new Image();
      img.onload = () => {
        const aspectRatio = img.naturalWidth / img.naturalHeight;
        setImageDimensions({
          width: img.naturalWidth,
          height: img.naturalHeight,
          aspectRatio
        });
      };
      img.src = uploadedUrl;

      // Call parent callback
      onImageUpload(uploadedUrl);

      showStatus('success', 'Image uploaded successfully');

    } catch (error) {
      console.error('Upload error:', error);
      let errorMessage = error.message || 'Upload failed';

      if (error?.status === 401) {
        errorMessage = 'Upload failed: please sign in again and retry.';
      } else if (error?.status === 403) {
        const requiredRoles = error?.details?.allowedRoles || error?.details?.requiredRole;
        const rolesLabel = Array.isArray(requiredRoles)
          ? requiredRoles.join(' or ')
          : requiredRoles;
        errorMessage = rolesLabel
          ? `Upload blocked: ${rolesLabel} access required.`
          : 'Upload blocked: insufficient permissions.';
      } else if (error?.status === 413) {
        errorMessage = 'File too large. Try an image under 2MB, or resize to ~1200px.';
      } else if (
        !errorMessage.includes('file type') &&
        !errorMessage.includes('File size') &&
        !errorMessage.includes('Upload failed') &&
        !errorMessage.includes('Upload blocked')
      ) {
        // Catch cryptic browser/proxy errors and translate to a helpful message
        errorMessage = 'Upload failed. The file may be too large or in an unsupported format. Try a smaller image (under 2MB, JPEG/PNG/WebP).';
      }

      showStatus('error', errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (files) => {
    if (files && files.length > 0) {
      uploadImage(files[0]);
    }
  };

  const handleClick = () => {
    if (!disabled && !isUploading) {
      fileInputRef.current?.click();
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!disabled && !isUploading) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (!disabled && !isUploading) {
      const files = Array.from(e.dataTransfer.files);
      handleFileSelect(files);
    }
  };

  const handleRemove = () => {
    setPreviewUrl('');
    setImageInfo(null);
    setImageDimensions({ width: 0, height: 0, aspectRatio: 1 });
    onImageUpload('');
    showStatus('success', 'Image removed');
  };

  const renderCompactActions = () => (
    <>
      {previewUrl && (
        <PreviewImageContainer style={{ marginBottom: theme.spacing.md }}>
          <PreviewImage
            src={previewUrl}
            alt={previewAlt}
            aspectRatio={imageDimensions.aspectRatio}
            isWide={imageDimensions.aspectRatio > 1.5}
            isTall={imageDimensions.aspectRatio < 0.7}
            compact={compact}
            onLoad={handleImageLoad}
          />
          <UploadOverlay show={isUploading}>
            <UploadSpinner />
            <UploadOverlayText>Uploading image...</UploadOverlayText>
          </UploadOverlay>
        </PreviewImageContainer>
      )}
      <ImageActions $align={actionsAlign} $noMarginTop>
        <Button
          type="button"
          onClick={handleClick}
          disabled={disabled || isUploading}
          variant="primary"
        >
          {isUploading ? 'Uploading...' : previewUrl ? 'Replace' : 'Upload'}
        </Button>
        {previewUrl && (
          <Button
            type="button"
            onClick={handleRemove}
            disabled={disabled || isUploading}
            variant="danger"
          >
            Remove
          </Button>
        )}
      </ImageActions>
      <HiddenInput
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={(e) => handleFileSelect(e.target.files)}
        disabled={disabled || isUploading}
      />
    </>
  );

  const Wrapper = frameless ? 'div' : ImageUploadContainer;

  return (
    <Wrapper>
      {!hideHeader && (
        <ImageUploadHeader>
          <h3>{title}</h3>
          <p className="subtitle">{subtitle}</p>
        </ImageUploadHeader>
      )}
      {!hideHeader && (
        <CoverHint>
          <strong>Tip:</strong>
          <span>Square format • 1200–1500px • Under 2MB</span>
        </CoverHint>
      )}
      {!previewUrl && (uploadStatus.message || isUploading) && (
        <UploadStatus type={isUploading ? 'info' : uploadStatus.type}>
          {isUploading ? 'Uploading image...' : uploadStatus.message}
        </UploadStatus>
      )}
      {compact && !previewUrl ? (
        renderCompactActions()
      ) : !previewUrl ? (
        <UploadArea
          isDragOver={isDragOver}
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="upload-icon">
            {isUploading ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="0">
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0 12 12"
                    to="360 12 12"
                    dur="1s"
                    repeatCount="indefinite"
                  />
                </circle>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
            )}
          </div>

          <div className="upload-text">
            {isUploading ? 'Uploading image...' : 'Click to upload or drag & drop'}
          </div>

          <div className="upload-hint">
            {uploadHint}
          </div>

          <HiddenInput
            ref={fileInputRef}
            type="file"
            accept={accept}
            onChange={(e) => handleFileSelect(e.target.files)}
            disabled={disabled || isUploading}
          />
        </UploadArea>
      ) : hidePreview ? (
        renderCompactActions()
      ) : (
        <ImagePreview>
          {(uploadStatus.message || isUploading) && (
            <UploadStatus type={isUploading ? 'info' : uploadStatus.type} style={{ marginBottom: theme.spacing.md }}>
              {isUploading ? 'Uploading image...' : uploadStatus.message}
            </UploadStatus>
          )}
          <PreviewImageContainer>
            <PreviewImage
              src={previewUrl}
              alt={previewAlt}
              aspectRatio={imageDimensions.aspectRatio}
              isWide={imageDimensions.aspectRatio > 1.5}
              isTall={imageDimensions.aspectRatio < 0.7}
              compact={compact}
              onLoad={handleImageLoad}
            />
            <UploadOverlay show={isUploading}>
              <UploadSpinner />
              <UploadOverlayText>Uploading image...</UploadOverlayText>
            </UploadOverlay>
          </PreviewImageContainer>

          {imageInfo && (
            <ImageInfo>
              <span className="filename">{imageInfo.filename}</span>
              <span className="filesize">{formatFileSize(imageInfo.size)}</span>
            </ImageInfo>
          )}

          <ImageActions $align={actionsAlign}>
            <Button
              type="button"
              onClick={handleClick}
              disabled={disabled || isUploading}
              variant="primary"
            >
              {isUploading ? 'Uploading...' : 'Replace'}
            </Button>

            <Button
              type="button"
              onClick={handleRemove}
              disabled={disabled || isUploading}
              variant="danger"
            >
              Remove
            </Button>
          </ImageActions>

          <HiddenInput
            ref={fileInputRef}
            type="file"
            accept={accept}
            onChange={(e) => handleFileSelect(e.target.files)}
            disabled={disabled || isUploading}
          />
        </ImagePreview>
      )}


    </Wrapper>
  );
};

export default ImageUpload;
