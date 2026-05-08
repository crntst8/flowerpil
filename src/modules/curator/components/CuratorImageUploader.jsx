import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { Button, MainBox, theme } from '@shared/styles/GlobalStyles';
import { useAuth } from '@shared/contexts/AuthContext';
import { safeJson } from '@shared/utils/jsonUtils';
import { compressImage, DEFAULT_IMAGE_LIMIT_BYTES, formatBytes } from '@shared/utils/imageCompression';

const UploaderShell = styled(MainBox)`
  display: grid;
  gap: ${theme.spacing.md};
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  border: ${theme.borders.solid} ${theme.colors.black};
  padding: ${theme.spacing.md};
`;

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
  padding-bottom: ${theme.spacing.sm};
  border-bottom: ${theme.borders.dashedThin} ${theme.colors.black};
`;

const TitleBlock = styled.div`
  display: grid;
  gap: 4px;

  h4 {
    margin: 0;
    font-family: ${theme.fonts.primary};
    background: ${theme.colors.black};
    color: ${theme.colors.white};
    padding: 0.4em 0.6em;
    text-transform: capitalize;
    font-size: ${theme.fontSizes.body};
  }

  p {
    margin: 0;
    color: ${theme.colors.black};
    font-size: ${theme.fontSizes.tiny};
  }
`;

const Pill = styled.span.withConfig({
  shouldForwardProp: (prop) => prop !== 'tone'
})`
  display: inline-flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  padding: 6px 10px;
  border: ${theme.borders.solidThin} ${theme.colors.black};
  background: ${({ tone }) => tone === 'warn'
    ? 'rgba(255, 200, 0, 0.15)'
    : 'rgba(0, 0, 0, 0.04)'};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const UploaderGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.md};
  grid-template-columns: 1fr 1.2fr;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const PreviewPane = styled.div`
  display: grid;
  gap: ${theme.spacing.xs};
`;

const PreviewFrame = styled.div`
  background: rgba(0, 0, 0, 0.03);
  border: ${theme.borders.solid} ${theme.colors.black};
  padding: ${theme.spacing.md};
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
`;

const PreviewImage = styled.img`
  width: 160px;
  height: 160px;
  object-fit: cover;
  border: ${theme.borders.solid} ${theme.colors.black};
  box-shadow: 4px 4px 0 ${theme.colors.black};
`;

const Placeholder = styled.div`
  width: 160px;
  height: 160px;
  border: ${theme.borders.dashed} ${theme.colors.black};
  display: grid;
  place-items: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.5);
  background: rgba(0, 0, 0, 0.02);
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const MetaRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
  align-items: center;
  color: black;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
`;

const DropPane = styled.div`
  display: grid;
  gap: ${theme.spacing.sm};
`;

const DropZone = styled.div.withConfig({
  shouldForwardProp: (prop) => !['isDragOver', 'disabled'].includes(prop)
})`
  border: ${theme.borders.dashed} ${({ isDragOver }) => isDragOver ? theme.colors.primary : theme.colors.black};
  background: ${({ isDragOver }) => isDragOver
    ? 'rgba(71, 159, 242, 0.08)'
    : 'rgba(0, 0, 0, 0.02)'};
  padding: ${theme.spacing.lg};
  min-height: 200px;
  display: grid;
  place-items: center;
  text-align: center;
  transition: all ${theme.transitions.fast};
  cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'pointer'};
  position: relative;
  overflow: hidden;

  &:hover {
    background: rgba(0, 0, 0, 0.04);
    border-color: ${theme.colors.black};
  }
`;

const DropContent = styled.div`
  display: grid;
  gap: ${theme.spacing.sm};
  align-items: center;
  justify-items: center;

  h5 {
    margin: 0;
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: ${theme.colors.black};
  }

  p {
    margin: 0;
    color: ${theme.colors.black};
    font-size: ${theme.fontSizes.small};
    max-width: 320px;
    opacity: 0.7;
  }
`;

const Status = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'tone'
})`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border: ${theme.borders.solid} ${({ tone }) => {
    if (tone === 'error') return theme.colors.danger;
    if (tone === 'success') return theme.colors.success;
    return theme.colors.black;
  }};
  background: ${({ tone }) => {
    if (tone === 'error') return 'rgba(229, 62, 62, 0.08)';
    if (tone === 'success') return 'rgba(76, 175, 80, 0.08)';
    return 'rgba(0, 0, 0, 0.04)';
  }};
  color: ${({ tone }) => {
    if (tone === 'error') return theme.colors.danger;
    if (tone === 'success') return theme.colors.success;
    return theme.colors.black;
  }};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  display: flex;
  gap: ${theme.spacing.xs};
  align-items: center;
`;

const Actions = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
  margin-top: ${theme.spacing.sm};

  button {
    min-height: 44px;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    button {
      flex: 1;
      min-width: 140px;
    }
  }
`;

const HiddenInput = styled.input`
  display: none;
`;

const Overlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.9);
  display: ${({ show }) => show ? 'flex' : 'none'};
  align-items: center;
  justify-content: center;
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const HintRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const resolveImageUrl = (imagePath) => {
  if (!imagePath) return '';
  if (imagePath.startsWith('http')) return imagePath;
  if (imagePath.startsWith('/uploads')) return imagePath;
  return `/uploads/${imagePath}`;
};

const formatDimensions = (meta) => {
  if (!meta?.width || !meta?.height) return null;
  return `${meta.width}×${meta.height}px`;
};

export default function CuratorImageUploader({
  value,
  onChange,
  disabled = false,
  maxSizeBytes = DEFAULT_IMAGE_LIMIT_BYTES,
  label = 'Profile image',
  hint = 'Square 1200–1500px recommended. JPG, PNG, or WebP.',
  cta = 'Upload image'
}) {
  const { authenticatedFetch } = useAuth();
  const [preview, setPreview] = useState(resolveImageUrl(value));
  const [status, setStatus] = useState({ tone: '', message: '' });
  const [busyStage, setBusyStage] = useState('idle'); // idle | optimizing | uploading
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    setPreview(resolveImageUrl(value));
  }, [value]);

  const setStatusMessage = (tone, message) => {
    setStatus({ tone, message });
  };

  const handleUpload = async (file) => {
    setBusyStage('uploading');
    setStatusMessage('info', 'Uploading…');
    setError('');

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await authenticatedFetch('/api/v1/uploads/image?type=curators', {
        method: 'POST',
        body: formData
      });
      const data = await safeJson(res, { context: 'Upload curator image' });
      if (!res.ok || !data.success) {
        const message = data?.error || data?.message || 'Upload failed';
        throw new Error(message);
      }

      const uploadedUrl = data?.data?.primary_url || data?.data?.url || data?.url || '';
      const resolvedUrl = resolveImageUrl(uploadedUrl);
      setPreview(resolvedUrl);
      onChange?.(resolvedUrl);
      setStatusMessage('success', 'Image uploaded');
    } catch (err) {
      setError(err?.message || 'Upload failed');
      setStatusMessage('error', err?.message || 'Upload failed');
    } finally {
      setBusyStage('idle');
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    if (!allowedMimeTypes.includes(file.type)) {
      setError('Unsupported file type. Use JPG, PNG, or WebP.');
      setStatusMessage('error', 'Unsupported file type.');
      return;
    }

    setStatusMessage('', '');
    setError('');
    let workingFile = file;
    let optimizationMeta = null;

    if (file.size > maxSizeBytes) {
      setBusyStage('optimizing');
      setStatusMessage('info', 'Optimizing image to fit under 2MB…');
      try {
        const result = await compressImage(file, {
          maxSizeBytes,
          maxWidth: 1600,
          maxHeight: 1600,
          quality: 0.82,
          minQuality: 0.55
        });
        workingFile = result.file;
        optimizationMeta = result.meta;
        setMeta(result.meta);
        if (result.exceeded) {
          setBusyStage('idle');
          setStatusMessage('error', 'Still too large after optimization. Try a smaller image (≈1200px).');
          setError(`Optimized to ${formatBytes(result.meta?.compressedSize || workingFile.size)}, still above ${formatBytes(maxSizeBytes)}.`);
          return;
        }
      } catch (err) {
        setBusyStage('idle');
        setStatusMessage('error', 'Could not optimize that image.');
        setError(err?.message || 'Failed to optimize image. Try a smaller file.');
        return;
      }
    } else {
      setMeta({
        originalSize: file.size,
        compressedSize: file.size,
        width: null,
        height: null,
        quality: null
      });
    }

    await handleUpload(workingFile, optimizationMeta);
  };

  const onInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset input so selecting the same file again triggers change
    e.target.value = '';
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || busyStage !== 'idle') return;
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    if (disabled || busyStage !== 'idle') return;
    setIsDragOver(true);
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const triggerFileDialog = () => {
    if (disabled || busyStage !== 'idle') return;
    inputRef.current?.click();
  };

  const clearImage = () => {
    setPreview('');
    setMeta(null);
    onChange?.('');
    setStatusMessage('info', 'Image removed');
  };

  const busy = busyStage !== 'idle';

  return (
    <UploaderShell>
      <HeaderRow>
        <TitleBlock>
          <h4>{label}</h4>
          <p>{hint}</p>
        </TitleBlock>
        <HintRow>
        </HintRow>
      </HeaderRow>

      <UploaderGrid>
        <PreviewPane>
          <PreviewFrame>
            {preview ? (
              <PreviewImage src={preview} alt="Curator profile preview" />
            ) : (
              <Placeholder>Preview</Placeholder>
            )}
          </PreviewFrame>
          <MetaRow>
            {meta?.compressedSize && <Pill>{formatBytes(meta.compressedSize)}</Pill>}
            {formatDimensions(meta) && <Pill>{formatDimensions(meta)}</Pill>}
            {meta?.quality && <Pill>q{Math.round(meta.quality * 100)}</Pill>}
          </MetaRow>
          {preview && (
            <Actions>
              <Button variant="primary" onClick={triggerFileDialog} disabled={disabled || busy}>
                Replace image
              </Button>
              <Button variant="danger" outline onClick={clearImage} disabled={disabled || busy}>
                Remove
              </Button>
            </Actions>
          )}
        </PreviewPane>

        {!preview && (
          <DropPane>
            <DropZone
              isDragOver={isDragOver}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={triggerFileDialog}
              disabled={disabled || busy}
            >
              <DropContent>
                <h5>{busyStage === 'optimizing' ? 'Optimizing…' : busyStage === 'uploading' ? 'Uploading…' : 'Drop or click to upload'}</h5>
                <p>
                  We&apos;ll downscale and compress automatically if your file is over 2MB.
                  Recommended: square, 1200–1500px, JPG/PNG/WebP.
                </p>
                <Button variant="olive" disabled={disabled || busy}>{cta}</Button>
              </DropContent>
              <Overlay show={busy}>{busyStage === 'optimizing' ? 'Optimizing for upload…' : 'Uploading…'}</Overlay>
            </DropZone>
          </DropPane>
        )}
      </UploaderGrid>

      {(status.message || error) && (
        <Status tone={status.tone === 'error' || error ? 'error' : status.tone || 'info'}>
          {error || status.message}
        </Status>
      )}

      <HiddenInput
        ref={inputRef}
        type="file"
        accept={allowedMimeTypes.join(',')}
        onChange={onInputChange}
      />
    </UploaderShell>
  );
}
