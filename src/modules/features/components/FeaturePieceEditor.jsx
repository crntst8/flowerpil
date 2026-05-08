/**
 * FeaturePieceEditor Component
 *
 * Full-featured editor for creating and editing premium feature pieces.
 * Routes: /features/new, /features/:id/edit
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { theme, mediaQuery } from '@shared/styles/GlobalStyles';
import useFeatureEditorStore from '../store/featureEditorStore.js';
import {
  fetchById,
  create,
  update,
  publish as publishPiece,
  unpublish as unpublishPiece,
  uploadImage,
  getImageUrl
} from '../services/featurePiecesService.js';
import { typography, visuals } from '../styles/featureStyles.js';
import BlockRenderer from './editor/BlockRenderer.jsx';
import InsertButton from './editor/InsertButton.jsx';

const FeaturePieceEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = Boolean(id);
  const heroInputRef = useRef(null);
  const titleRef = useRef(null);
  const subtitleRef = useRef(null);
  const [metaPanelOpen, setMetaPanelOpen] = useState(false);

  // Store state
  const {
    featurePiece,
    title,
    subtitle,
    authorName,
    metadataType,
    metadataDate,
    heroImage,
    heroImageCaption,
    excerpt,
    seoTitle,
    seoDescription,
    canonicalUrl,
    newsletterCtaLabel,
    newsletterCtaUrl,
    featuredOnHomepage,
    homepageDisplayOrder,
    contentBlocks,
    isLoading,
    isSaving,
    error,
    successMessage,
    isDirty,
    initializeFromPiece,
    reset,
    setTitle,
    setSubtitle,
    setAuthorName,
    setMetadataType,
    setMetadataDate,
    setHeroImage,
    setHeroImageCaption,
    setExcerpt,
    setSeoTitle,
    setSeoDescription,
    setCanonicalUrl,
    setNewsletterCtaLabel,
    setNewsletterCtaUrl,
    setFeaturedOnHomepage,
    setHomepageDisplayOrder,
    addBlock,
    removeBlock,
    updateBlock,
    setInsertPosition,
    setLoading,
    setSaving,
    setError,
    setSuccess,
    clearMessages,
    setDirty,
    getDataForSave
  } = useFeatureEditorStore();

  const [heroUploading, setHeroUploading] = useState(false);

  // Load existing piece for editing
  useEffect(() => {
    const loadPiece = async () => {
      if (!isEditMode) {
        reset();
        return;
      }

      try {
        setLoading(true);
        const response = await fetchById(id);
        initializeFromPiece(response.data);
      } catch (err) {
        console.error('Failed to load feature piece:', err);
        setError('Failed to load feature piece');
      } finally {
        setLoading(false);
      }
    };

    loadPiece();

    return () => {
      reset();
    };
  }, [id, isEditMode]);

  // Auto-resize title textarea
  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.style.height = 'auto';
      titleRef.current.style.height = `${titleRef.current.scrollHeight}px`;
    }
  }, [title]);

  // Auto-resize subtitle textarea
  useEffect(() => {
    if (subtitleRef.current) {
      subtitleRef.current.style.height = 'auto';
      subtitleRef.current.style.height = `${subtitleRef.current.scrollHeight}px`;
    }
  }, [subtitle]);

  // Hero image upload handler
  const handleHeroUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    try {
      setHeroUploading(true);
      clearMessages();
      const response = await uploadImage(file);
      setHeroImage(response.data.url);
    } catch (err) {
      console.error('Hero image upload failed:', err);
      setError('Failed to upload hero image');
    } finally {
      setHeroUploading(false);
    }
  };

  // Save handler
  const handleSave = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    try {
      setSaving(true);
      clearMessages();

      const data = getDataForSave();

      if (isEditMode) {
        await update(id, data);
        setSuccess('Saved successfully');
      } else {
        const response = await create(data);
        navigate(`/features/${response.data.id}/edit`, { replace: true });
        setSuccess('Created successfully');
      }

      setDirty(false);
    } catch (err) {
      console.error('Save failed:', err);
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Publish handler
  const handlePublish = async () => {
    if (!isEditMode || !featurePiece) return;

    // Save first if dirty
    if (isDirty) {
      await handleSave();
    }

    try {
      setSaving(true);
      clearMessages();
      await publishPiece(id);
      initializeFromPiece({ ...featurePiece, status: 'published' });
      setSuccess('Published successfully');
    } catch (err) {
      console.error('Publish failed:', err);
      setError('Failed to publish');
    } finally {
      setSaving(false);
    }
  };

  // Unpublish handler
  const handleUnpublish = async () => {
    if (!isEditMode || !featurePiece) return;

    try {
      setSaving(true);
      clearMessages();
      await unpublishPiece(id);
      initializeFromPiece({ ...featurePiece, status: 'draft' });
      setSuccess('Unpublished successfully');
    } catch (err) {
      console.error('Unpublish failed:', err);
      setError('Failed to unpublish');
    } finally {
      setSaving(false);
    }
  };

  // Preview handler
  const handlePreview = () => {
    if (featurePiece?.slug) {
      window.open(`/features/${featurePiece.slug}`, '_blank');
    }
  };

  // Back handler
  const handleBack = () => {
    if (isDirty) {
      if (window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
        navigate('/features');
      }
    } else {
      navigate('/features');
    }
  };

  // Insert block at position handler
  const handleInsertBlock = useCallback((position) => (type) => {
    setInsertPosition(position);
    addBlock(type);
  }, [setInsertPosition, addBlock]);

  // Update block handler
  const handleUpdateBlock = useCallback((blockId, updates) => {
    updateBlock(blockId, updates);
  }, [updateBlock]);

  // Delete block handler
  const handleDeleteBlock = useCallback((blockId) => {
    removeBlock(blockId);
  }, [removeBlock]);

  // Insert inline quote next to a body block.
  // Insert before the body block so floated quote can wrap its text.
  const handleInsertInlineQuote = useCallback((blockIndex) => (alignment) => {
    setInsertPosition(blockIndex);
    addBlock('pull_quote', { alignment, inline: true });
  }, [setInsertPosition, addBlock]);

  if (isLoading) {
    return (
      <PageContainer>
        <LoadingContainer>
          <LoadingText>Loading...</LoadingText>
        </LoadingContainer>
      </PageContainer>
    );
  }

  const isPublished = featurePiece?.status === 'published';

  return (
    <PageContainer>
      {/* Header Bar */}
      <HeaderBar>
        <HeaderLeft>
          <BackButton onClick={handleBack}>Back</BackButton>
        </HeaderLeft>
        <HeaderCenter>
          <StatusBadge $published={isPublished}>
            {isPublished ? 'Published' : 'Draft'}
          </StatusBadge>
          {isDirty && <DirtyIndicator>Unsaved</DirtyIndicator>}
        </HeaderCenter>
        <HeaderRight>
          {isEditMode && isPublished && (
            <ActionButton onClick={handlePreview}>Preview</ActionButton>
          )}
          <ActionButton onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </ActionButton>
          {isEditMode && !isPublished && (
            <PublishButton onClick={handlePublish} disabled={isSaving}>
              Publish
            </PublishButton>
          )}
          {isEditMode && isPublished && (
            <UnpublishButton onClick={handleUnpublish} disabled={isSaving}>
              Unpublish
            </UnpublishButton>
          )}
        </HeaderRight>
      </HeaderBar>

      {/* Messages */}
      {(error || successMessage) && (
        <MessageBar $error={!!error}>
          {error || successMessage}
          <CloseMessageButton onClick={clearMessages}>x</CloseMessageButton>
        </MessageBar>
      )}

      {/* Hero Image Section */}
      <HeroSection>
        {heroImage ? (
          <HeroPreview>
            <HeroImage
              src={getImageUrl(heroImage, 'large')}
              alt="Hero"
            />
            <HeroOverlay>
              <HeroReplaceButton onClick={() => heroInputRef.current?.click()}>
                {heroUploading ? 'Uploading...' : 'Replace Hero Image'}
              </HeroReplaceButton>
            </HeroOverlay>
          </HeroPreview>
        ) : (
          <HeroUploadArea onClick={() => heroInputRef.current?.click()}>
            {heroUploading ? (
              <HeroUploadText>Uploading...</HeroUploadText>
            ) : (
              <>
                <HeroUploadIcon>+</HeroUploadIcon>
                <HeroUploadText>Click to upload hero image</HeroUploadText>
              </>
            )}
          </HeroUploadArea>
        )}
        <input
          ref={heroInputRef}
          type="file"
          accept="image/*"
          onChange={handleHeroUpload}
          style={{ display: 'none' }}
        />
        <HeroCaptionInput
          value={heroImageCaption}
          onChange={(e) => setHeroImageCaption(e.target.value)}
          placeholder="Hero image caption (optional)"
        />
      </HeroSection>

      {/* Title/Subtitle/Metadata Section */}
      <HeaderInputsSection>
        <TitleInput
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Feature Title"
          rows={1}
        />
        <SubtitleInput
          ref={subtitleRef}
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          placeholder="Subtitle (optional)"
          rows={1}
        />
        <MetadataRow>
          <MetadataInput
            value={metadataType}
            onChange={(e) => setMetadataType(e.target.value)}
            placeholder="Type (e.g., Feature)"
          />
          <MetadataSeparator>/</MetadataSeparator>
          <MetadataInput
            type="date"
            value={metadataDate}
            onChange={(e) => setMetadataDate(e.target.value)}
            placeholder="Date"
          />
        </MetadataRow>

        <MetaPanelToggle onClick={() => setMetaPanelOpen(!metaPanelOpen)}>
          <MetaPanelToggleLabel>Article Settings</MetaPanelToggleLabel>
          <MetaPanelToggleIcon $open={metaPanelOpen}>{metaPanelOpen ? '\u2013' : '+'}</MetaPanelToggleIcon>
        </MetaPanelToggle>

        <MetaPanelContainer $open={metaPanelOpen}>
          <MetaGroup>
            <MetaGroupHeader>Details</MetaGroupHeader>
            <MetaGroupGrid>
              <MetaField>
                <MetaLabel>Author</MetaLabel>
                <MetaTextInput
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Author name"
                />
              </MetaField>
              <MetaField $span>
                <MetaLabel>Excerpt</MetaLabel>
                <MetaTextArea
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  placeholder="Short summary for cards and previews"
                  rows={2}
                />
              </MetaField>
            </MetaGroupGrid>
          </MetaGroup>

          <MetaGroupDivider />

          <MetaGroup>
            <MetaGroupHeader>SEO</MetaGroupHeader>
            <MetaGroupGrid>
              <MetaField>
                <MetaLabel>Title Override</MetaLabel>
                <MetaTextInput
                  value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                  placeholder="Custom search title"
                />
              </MetaField>
              <MetaField>
                <MetaLabel>Canonical URL</MetaLabel>
                <MetaTextInput
                  value={canonicalUrl}
                  onChange={(e) => setCanonicalUrl(e.target.value)}
                  placeholder="https://original-source.com/post"
                />
              </MetaField>
              <MetaField $span>
                <MetaLabel>Description</MetaLabel>
                <MetaTextArea
                  value={seoDescription}
                  onChange={(e) => setSeoDescription(e.target.value)}
                  placeholder="Search engine description"
                  rows={2}
                />
              </MetaField>
            </MetaGroupGrid>
          </MetaGroup>

          <MetaGroupDivider />

          <MetaGroup>
            <MetaGroupHeader>Distribution</MetaGroupHeader>
            <MetaGroupGrid>
              <MetaField>
                <MetaLabel>Newsletter CTA Label</MetaLabel>
                <MetaTextInput
                  value={newsletterCtaLabel}
                  onChange={(e) => setNewsletterCtaLabel(e.target.value)}
                  placeholder="Subscribe on newsletter"
                />
              </MetaField>
              <MetaField>
                <MetaLabel>Newsletter CTA URL</MetaLabel>
                <MetaTextInput
                  value={newsletterCtaUrl}
                  onChange={(e) => setNewsletterCtaUrl(e.target.value)}
                  placeholder="https://newsletter.example.com"
                />
              </MetaField>
              <MetaField>
                <MetaLabel>Homepage Order</MetaLabel>
                <MetaTextInput
                  type="number"
                  value={homepageDisplayOrder}
                  onChange={(e) => setHomepageDisplayOrder(e.target.value)}
                  placeholder="0"
                />
              </MetaField>
              <MetaField>
                <MetaCheckbox>
                  <input
                    type="checkbox"
                    checked={Boolean(featuredOnHomepage)}
                    onChange={(e) => setFeaturedOnHomepage(e.target.checked)}
                  />
                  <span>Feature on landing feed</span>
                </MetaCheckbox>
              </MetaField>
            </MetaGroupGrid>
          </MetaGroup>
        </MetaPanelContainer>
      </HeaderInputsSection>

      {/* Content Blocks */}
      <ContentSection>
        <ContentInner>
          {/* Insert button at top */}
          <InsertButton onInsert={handleInsertBlock(0)} />

          {contentBlocks.map((block, index) => {
            const previousBlock = contentBlocks[index - 1];
            const nextBlock = contentBlocks[index + 1];
            const isInlineQuote = block.type === 'pull_quote' && Boolean(block.inline);
            const isBodyFollowingInlineQuote =
              block.type === 'body' &&
              previousBlock?.type === 'pull_quote' &&
              Boolean(previousBlock?.inline);
            const shouldHideInsertAfterBlock = isInlineQuote && nextBlock?.type === 'body';

            return (
              <React.Fragment key={block.id}>
                <BlockRenderer
                  block={block}
                  onUpdate={handleUpdateBlock}
                  onDelete={handleDeleteBlock}
                  onInsertInlineQuote={handleInsertInlineQuote(index)}
                  inlineWrapAlignment={isBodyFollowingInlineQuote ? (previousBlock?.alignment || 'left') : null}
                />
                {isBodyFollowingInlineQuote && <InlineFlowClear />}
                {!shouldHideInsertAfterBlock && <InsertButton onInsert={handleInsertBlock(index + 1)} />}
              </React.Fragment>
            );
          })}

          {contentBlocks.length === 0 && (
            <EmptyState>
              <EmptyText>Click + to add content blocks</EmptyText>
            </EmptyState>
          )}
        </ContentInner>
      </ContentSection>
    </PageContainer>
  );
};

// ============================================
// Styled Components
// ============================================

const PageContainer = styled.div`
  min-height: 100vh;
  background: ${visuals.background};
`;

const LoadingContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
`;

const LoadingText = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.1em;
`;

// Header Bar
const HeaderBar = styled.header`
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: ${theme.colors.black};
  color: ${theme.colors.fpwhite};
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const HeaderCenter = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const BackButton = styled.button`
  padding: 8px 16px;
  background: transparent;
  border: 1px solid ${theme.colors.fpwhite};
  color: ${theme.colors.fpwhite};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: all ${theme.transitions.fast};

  &:hover {
    background: ${theme.colors.fpwhite};
    color: ${theme.colors.black};
  }
`;

const StatusBadge = styled.span`
  padding: 4px 12px;
  background: ${({ $published }) => $published ? theme.colors.success : 'transparent'};
  border: 1px solid ${({ $published }) => $published ? theme.colors.success : theme.colors.fpwhite};
  color: ${({ $published }) => $published ? theme.colors.black : theme.colors.fpwhite};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

const DirtyIndicator = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.warning};
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

const ActionButton = styled.button`
  padding: 8px 16px;
  background: ${theme.colors.fpwhite};
  border: none;
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: all ${theme.transitions.fast};

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.9);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const PublishButton = styled(ActionButton)`
  background: ${theme.colors.success};
  color: ${theme.colors.black};

  &:hover:not(:disabled) {
    background: #3d8b40;
  }
`;

const UnpublishButton = styled(ActionButton)`
  background: transparent;
  border: 1px solid ${theme.colors.fpwhite};
  color: ${theme.colors.fpwhite};

  &:hover:not(:disabled) {
    background: ${theme.colors.fpwhite};
    color: ${theme.colors.black};
  }
`;

// Message Bar
const MessageBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 12px 20px;
  background: ${({ $error }) => $error ? 'rgba(229, 62, 62, 0.1)' : 'rgba(76, 175, 80, 0.1)'};
  color: ${({ $error }) => $error ? theme.colors.danger : theme.colors.success};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

const CloseMessageButton = styled.button`
  background: transparent;
  border: none;
  color: inherit;
  font-family: ${theme.fonts.mono};
  font-size: 14px;
  cursor: pointer;
  opacity: 0.7;

  &:hover {
    opacity: 1;
  }
`;

// Hero Section
const HeroSection = styled.section`
  padding: 0 20px 0;
  position: relative;
`;

const HeroUploadArea = styled.div`
  max-width: 900px;
  margin: 0 auto;
  min-height: 240px;
  border: 2px dashed rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  cursor: pointer;
  transition: all ${theme.transitions.fast};

  ${mediaQuery.mobile} {
    max-width: 100%;
    min-height: 200px;
  }

  &:hover {
    border-color: ${theme.colors.black};
    background: rgba(0, 0, 0, 0.02);
  }
`;

const HeroUploadIcon = styled.span`
  font-size: 48px;
  color: rgba(0, 0, 0, 0.4);
`;

const HeroUploadText = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(0, 0, 0, 0.5);
`;

const HeroPreview = styled.div`
  position: relative;
  max-width: 900px;
  margin: 0 auto;

  ${mediaQuery.mobile} {
    max-width: 100%;
  }

  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 80px;
    background: linear-gradient(to bottom, transparent, ${visuals.background});
    pointer-events: none;
  }
`;

const HeroImage = styled.img`
  width: 100%;
  height: auto;
  display: block;
`;

const HeroOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity ${theme.transitions.fast};

  ${HeroPreview}:hover & {
    opacity: 1;
  }
`;

const HeroReplaceButton = styled.button`
  padding: 12px 24px;
  background: ${theme.colors.fpwhite};
  border: none;
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.9);
  }
`;

const HeroCaptionInput = styled.input`
  display: block;
  max-width: 720px;
  margin: 8px auto 0;
  width: 100%;
  padding: 6px 0;
  background: transparent;
  border: none;
  border-bottom: 1px dashed rgba(0, 0, 0, 0.2);
  font-family: ${typography.imageCaption.fontFamily};
  font-style: ${typography.imageCaption.fontStyle};
  font-size: ${typography.imageCaption.fontSize};
  color: rgba(0, 0, 0, 0.7);
  text-align: center;

  &:focus {
    outline: none;
    border-bottom-color: ${theme.colors.black};
  }

  &::placeholder {
    color: rgba(0, 0, 0, 0.3);
  }
`;

// Header Inputs Section
const HeaderInputsSection = styled.section`
  max-width: 720px;
  margin: 24px auto 36px;
  padding: 0 20px;
  text-align: center;
`;

const TitleInput = styled.textarea`
  display: block;
  width: 100%;
  padding: 8px 0;
  background: transparent;
  border: none;
  text-align: center;
  resize: none;
  overflow: hidden;
  font-family: ${typography.pageTitle.fontFamily};
  font-weight: ${typography.pageTitle.fontWeight};
  font-size: ${typography.pageTitle.fontSize};
  line-height: ${typography.pageTitle.lineHeight};
  letter-spacing: ${typography.pageTitle.letterSpacing};
  color: ${theme.colors.black};

  &:focus {
    outline: none;
    background: rgba(0, 0, 0, 0.02);
  }

  &::placeholder {
    color: rgba(0, 0, 0, 0.3);
  }
`;

const SubtitleInput = styled.textarea`
  display: block;
  width: 100%;
  padding: 6px 0;
  margin-top: 8px;
  background: transparent;
  border: none;
  text-align: center;
  resize: none;
  overflow: hidden;
  font-family: ${typography.subtitle.fontFamily};
  font-weight: ${typography.subtitle.fontWeight};
  font-style: ${typography.subtitle.fontStyle};
  font-size: ${typography.subtitle.fontSize};
  line-height: ${typography.subtitle.lineHeight};
  color: rgba(0, 0, 0, 0.7);

  &:focus {
    outline: none;
    background: rgba(0, 0, 0, 0.02);
  }

  &::placeholder {
    color: rgba(0, 0, 0, 0.3);
  }
`;

const MetadataRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 12px;
`;

const MetadataInput = styled.input`
  padding: 4px 8px;
  background: transparent;
  border: none;
  border-bottom: 1px dashed rgba(0, 0, 0, 0.2);
  font-family: ${typography.metadata.fontFamily};
  font-size: ${typography.metadata.fontSize};
  letter-spacing: ${typography.metadata.letterSpacing};
  text-transform: uppercase;
  text-align: center;
  color: rgba(0, 0, 0, 0.7);
  width: 120px;

  &:focus {
    outline: none;
    border-bottom-color: ${theme.colors.black};
  }

  &::placeholder {
    color: rgba(0, 0, 0, 0.3);
  }
`;

const MetadataSeparator = styled.span`
  font-family: ${typography.metadata.fontFamily};
  font-size: ${typography.metadata.fontSize};
  color: rgba(0, 0, 0, 0.5);
`;

const MetaPanelToggle = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  margin-top: 24px;
  padding: 10px 0;
  background: transparent;
  border: none;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: all ${theme.transitions.fast};

  &:hover {
    background: rgba(0, 0, 0, 0.02);
  }
`;

const MetaPanelToggleLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgba(0, 0, 0, 0.5);
`;

const MetaPanelToggleIcon = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: 14px;
  color: rgba(0, 0, 0, 0.4);
  transition: transform ${theme.transitions.fast};
`;

const MetaPanelContainer = styled.div`
  max-height: ${({ $open }) => $open ? '800px' : '0'};
  opacity: ${({ $open }) => $open ? 1 : 0};
  overflow: hidden;
  transition: max-height 0.35s ease, opacity 0.25s ease;
  margin-top: ${({ $open }) => $open ? '20px' : '0'};
  text-align: left;
`;

const MetaGroup = styled.div`
  margin-bottom: 0;
`;

const MetaGroupHeader = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: rgba(0, 0, 0, 0.4);
  margin-bottom: 12px;
`;

const MetaGroupGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;

  ${mediaQuery.mobile} {
    grid-template-columns: 1fr;
  }
`;

const MetaGroupDivider = styled.div`
  height: 1px;
  background: rgba(0, 0, 0, 0.08);
  margin: 18px 0;
`;

const MetaField = styled.label`
  display: flex;
  flex-direction: column;
  gap: 5px;
  ${({ $span }) => $span && 'grid-column: 1 / -1;'}
`;

const MetaLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(0, 0, 0, 0.52);
`;

const MetaTextInput = styled.input`
  padding: 9px 12px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 0;
  font-family: ${theme.fonts.primary};
  font-size: 13px;
  background: rgba(255, 255, 255, 0.7);
  transition: all ${theme.transitions.fast};

  &:focus {
    outline: none;
    border-color: rgba(0, 0, 0, 0.4);
    background: #ffffff;
  }

  &::placeholder {
    color: rgba(0, 0, 0, 0.25);
  }
`;

const MetaTextArea = styled.textarea`
  padding: 9px 12px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 0;
  font-family: ${theme.fonts.primary};
  font-size: 13px;
  background: rgba(255, 255, 255, 0.7);
  resize: vertical;
  transition: all ${theme.transitions.fast};

  &:focus {
    outline: none;
    border-color: rgba(0, 0, 0, 0.4);
    background: #ffffff;
  }

  &::placeholder {
    color: rgba(0, 0, 0, 0.25);
  }
`;

const MetaCheckbox = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(0, 0, 0, 0.6);
  cursor: pointer;

  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: ${theme.colors.black};
    cursor: pointer;
  }
`;

// Content Section
const ContentSection = styled.section`
  padding: 24px 20px 120px;
`;

const ContentInner = styled.div`
  max-width: 720px;
  margin: 0 auto;
  padding-left: 40px;
  padding-right: 40px;
`;

const InlineFlowClear = styled.div`
  clear: both;
`;

const EmptyState = styled.div`
  padding: 60px 20px;
  text-align: center;
`;

const EmptyText = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

export default FeaturePieceEditor;
