import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { theme, Button } from '@shared/styles/GlobalStyles';
import { adminUpload } from '@modules/admin/utils/adminApi';

const MediaUploadContainer = styled.div`
  margin: 0;
  padding: 0;
  width: 100%;
`;

const MediaUploadHeader = styled.div`
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

const MediaHint = styled.div`
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

const MediaPreview = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const PreviewMediaContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: ${theme.spacing.lg};
  background: #fafbfc;
  border-radius: 12px;
  border: ${theme.borders.solidThin} rgba(15, 23, 42, 0.1);
`;

const PreviewVideo = styled.video`
  display: block;
  border: ${theme.borders.solidThin} rgba(15, 23, 42, 0.15);
  border-radius: 8px;
  object-fit: contain;
  width: 100%;
  max-width: 600px;
  height: auto;
  margin: 0 auto;
  box-shadow:
    0 4px 12px rgba(15, 23, 42, 0.08),
    0 1px 3px rgba(15, 23, 42, 0.05);

  @media (max-width: ${theme.breakpoints.mobile}) {
    max-width: 100%;
  }
`;

const PreviewImage = styled.img`
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

  @media (max-width: ${theme.breakpoints.mobile}) {
    max-width: 100%;
    max-height: 280px;
  }
`;

const MediaInfo = styled.div`
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

  .mediatype {
    color: rgba(71, 159, 242, 1);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: ${theme.fontWeights.semibold};

    &::before {
      content: '•';
      margin-right: 8px;
      color: rgba(15, 23, 42, 0.3);
    }
  }
`;

const MediaActions = styled.div`
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

const FallbackSection = styled.div`
  margin-top: ${theme.spacing.lg};
  padding: ${theme.spacing.md};
  background: rgba(255, 152, 0, 0.05);
  border: ${theme.borders.solidThin} rgba(255, 152, 0, 0.2);
  border-radius: 8px;

  h4 {
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: ${theme.spacing.sm};
    color: rgba(255, 152, 0, 1);
  }

  p {
    font-size: ${theme.fontSizes.tiny};
    color: rgba(15, 23, 42, 0.7);
    margin-bottom: ${theme.spacing.md};
  }
`;

const MediaUpload = ({
  currentMediaUrl,
  currentFallbackUrl,
  onMediaUpload,
  disabled = false,
  uploadType = 'general',
  title = 'Upload Media',
  subtitle = 'Image or Video',
  previewAlt = 'Media preview',
  compact = false,
  hideHeader = false,
  frameless = false,
  acceptedTypes = 'both' // 'image', 'video', or 'both'
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState({ type: '', message: '' });
  const [previewUrl, setPreviewUrl] = useState('');
  const [fallbackUrl, setFallbackUrl] = useState('');
  const [mediaInfo, setMediaInfo] = useState(null);
  const [mediaType, setMediaType] = useState(''); // 'image' or 'video'

  const fileInputRef = useRef(null);
  const fallbackInputRef = useRef(null);
  const statusTimeoutRef = useRef(null);

  const getMediaUrl = (mediaPath) => {
    if (!mediaPath) return '';
    if (mediaPath.startsWith('http')) return mediaPath;
    if (mediaPath.startsWith('/uploads')) return mediaPath;
    return `/uploads/${mediaPath}`;
  };

  // Update preview URL when currentMediaUrl changes
  useEffect(() => {
    const mediaUrl = getMediaUrl(currentMediaUrl);
    setPreviewUrl(mediaUrl);

    // Determine media type
    if (mediaUrl) {
      const isVideo = /\.(webm|mp4)$/i.test(mediaUrl);
      setMediaType(isVideo ? 'video' : 'image');
    }
  }, [currentMediaUrl]);

  useEffect(() => {
    const fallback = getMediaUrl(currentFallbackUrl);
    setFallbackUrl(fallback);
  }, [currentFallbackUrl]);

  // Cleanup status timeout on unmount
  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  const showStatus = (type, message) => {
    setUploadStatus({ type, message });
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
    }
    statusTimeoutRef.current = setTimeout(() => setUploadStatus({ type: '', message: '' }), 8000);
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getAcceptedMimeTypes = () => {
    const imageMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const videoMimes = ['video/webm', 'video/mp4'];

    if (acceptedTypes === 'image') return imageMimes;
    if (acceptedTypes === 'video') return videoMimes;
    return [...imageMimes, ...videoMimes];
  };

  const getAcceptString = () => {
    if (acceptedTypes === 'image') return 'image/jpeg,image/jpg,image/png,image/webp';
    if (acceptedTypes === 'video') return 'video/webm,video/mp4';
    return 'image/jpeg,image/jpg,image/png,image/webp,video/webm,video/mp4';
  };

  const getUploadHint = () => {
    if (acceptedTypes === 'image') return 'JPEG, PNG, WebP • Max 10MB • Recommended: 800x800px';
    if (acceptedTypes === 'video') return 'WebM or MP4 • Max 2MB • 5-8s duration • ~720px width';
    return 'Images: JPEG, PNG, WebP (max 10MB) • Videos: WebM, MP4 (max 2MB)';
  };

  const validateFile = (file, isFallback = false) => {
    const allowedMimeTypes = isFallback ? ['image/jpeg', 'image/jpg', 'image/png'] : getAcceptedMimeTypes();
    const isVideo = file.type.startsWith('video/');
    const maxSize = isVideo ? 2 * 1024 * 1024 : 10 * 1024 * 1024; // 2MB for video, 10MB for image

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
      const maxLabel = isVideo ? '2MB' : '10MB';
      throw new Error(`File size too large. Maximum size is ${maxLabel}.`);
    }
  };

  const uploadMedia = async (file) => {
    setIsUploading(true);

    try {
      validateFile(file);

      const formData = new FormData();
      const isVideo = file.type.startsWith('video/');

      // Use video upload endpoint for videos, image endpoint for images
      const uploadEndpoint = isVideo
        ? `/api/v1/uploads/video?type=${uploadType}`
        : `/api/v1/uploads/image?type=${uploadType}`;
      const fieldName = isVideo ? 'video' : 'image';

      formData.append(fieldName, file);

      let result;
      try {
        result = await adminUpload(uploadEndpoint, formData);
      } catch (uploadError) {
        if (uploadError.message.includes('JSON') || uploadError.message.includes('parse')) {
          throw new Error('Upload failed - file may be too large or unsupported format');
        }
        throw uploadError;
      }

      const uploadedUrl = isVideo ? result.data.url : result.data.primary_url;
      setPreviewUrl(uploadedUrl);
      setMediaType(isVideo ? 'video' : 'image');
      setMediaInfo({
        filename: result.data.original_name || file.name,
        size: file.size,
        url: uploadedUrl,
        type: isVideo ? 'video' : 'image'
      });

      // Call parent callback with media URL and type
      onMediaUpload({
        mediaUrl: uploadedUrl,
        mediaType: isVideo ? 'video' : 'image',
        fallbackUrl: isVideo ? fallbackUrl : null
      });

      showStatus('success', `${isVideo ? 'Video' : 'Image'} uploaded successfully`);

    } catch (error) {
      console.error('Upload error:', error);
      const errorMessage = error.message || 'Upload failed';
      showStatus('error', errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const uploadFallback = async (file) => {
    try {
      validateFile(file, true);

      const formData = new FormData();
      formData.append('image', file);

      const result = await adminUpload(`/api/v1/uploads/image?type=${uploadType}`, formData);
      const uploadedUrl = result.data.primary_url;

      setFallbackUrl(uploadedUrl);

      // Update parent with new fallback
      onMediaUpload({
        mediaUrl: previewUrl,
        mediaType: 'video',
        fallbackUrl: uploadedUrl
      });

      showStatus('success', 'Fallback image uploaded successfully');

    } catch (error) {
      console.error('Fallback upload error:', error);
      showStatus('error', error.message || 'Fallback upload failed');
    }
  };

  const handleFileSelect = (files) => {
    if (files && files.length > 0) {
      uploadMedia(files[0]);
    }
  };

  const handleFallbackSelect = (files) => {
    if (files && files.length > 0) {
      uploadFallback(files[0]);
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
    setFallbackUrl('');
    setMediaInfo(null);
    setMediaType('');
    onMediaUpload({ mediaUrl: '', mediaType: '', fallbackUrl: '' });
    showStatus('success', 'Media removed');
  };

  const Wrapper = frameless ? 'div' : MediaUploadContainer;

  return (
    <Wrapper>
      {!hideHeader && (
        <MediaUploadHeader>
          <h3>{title}</h3>
          <p className="subtitle">{subtitle}</p>
        </MediaUploadHeader>
      )}

      {acceptedTypes !== 'image' && (
        <MediaHint>
          <strong>Tip:</strong>
          <span>Videos: 5-8s • Under 2MB • WebM preferred • Always include fallback image</span>
        </MediaHint>
      )}

      {uploadStatus.message && (
        <UploadStatus type={uploadStatus.type}>
          {uploadStatus.message}
        </UploadStatus>
      )}

      {!previewUrl ? (
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
            {isUploading ? 'Uploading media...' : 'Click to upload or drag & drop'}
          </div>

          <div className="upload-hint">
            {getUploadHint()}
          </div>

          <HiddenInput
            ref={fileInputRef}
            type="file"
            accept={getAcceptString()}
            onChange={(e) => handleFileSelect(e.target.files)}
            disabled={disabled || isUploading}
          />
        </UploadArea>
      ) : (
        <MediaPreview>
          <PreviewMediaContainer>
            {mediaType === 'video' ? (
              <PreviewVideo
                src={previewUrl}
                autoPlay
                loop
                muted
                playsInline
                poster={fallbackUrl}
              >
                {fallbackUrl && <source src={fallbackUrl} type="image/jpeg" />}
              </PreviewVideo>
            ) : (
              <PreviewImage
                src={previewUrl}
                alt={previewAlt}
              />
            )}
          </PreviewMediaContainer>

          {mediaInfo && (
            <MediaInfo>
              <span className="filename">{mediaInfo.filename}</span>
              <span className="filesize">{formatFileSize(mediaInfo.size)}</span>
              <span className="mediatype">{mediaInfo.type}</span>
            </MediaInfo>
          )}

          {mediaType === 'video' && (
            <FallbackSection>
              <h4>Fallback Image {fallbackUrl ? '✓' : '(Required)'}</h4>
              <p>Upload a static image to display if video fails to load or for browsers that don't support video.</p>

              {fallbackUrl && (
                <PreviewImage
                  src={fallbackUrl}
                  alt="Fallback preview"
                  style={{ maxWidth: '200px', marginBottom: theme.spacing.md }}
                />
              )}

              <Button
                onClick={() => fallbackInputRef.current?.click()}
                disabled={disabled || isUploading}
                variant="secondary"
              >
                {fallbackUrl ? 'Replace Fallback' : 'Upload Fallback'}
              </Button>

              <HiddenInput
                ref={fallbackInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png"
                onChange={(e) => handleFallbackSelect(e.target.files)}
                disabled={disabled || isUploading}
              />
            </FallbackSection>
          )}

          <MediaActions>
            <Button
              onClick={handleClick}
              disabled={disabled || isUploading}
              variant="primary"
            >
              Replace
            </Button>

            <Button
              onClick={handleRemove}
              disabled={disabled || isUploading}
              variant="danger"
            >
              Remove
            </Button>
          </MediaActions>

          <HiddenInput
            ref={fileInputRef}
            type="file"
            accept={getAcceptString()}
            onChange={(e) => handleFileSelect(e.target.files)}
            disabled={disabled || isUploading}
          />
        </MediaPreview>
      )}
    </Wrapper>
  );
};

export default MediaUpload;
