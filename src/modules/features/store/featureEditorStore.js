/**
 * Feature Editor Store
 *
 * Manages state for the feature piece editor:
 * - Feature piece data (title, subtitle, metadata, hero, etc.)
 * - Content blocks (add, remove, reorder, update)
 * - UI state (loading, saving, errors)
 * - Preview mode
 */

import { create } from 'zustand';
import { generateBlockId } from '../services/featurePiecesService.js';

const useFeatureEditorStore = create((set, get) => ({
  // Feature piece data
  featurePiece: null,

  // Header fields
  title: '',
  subtitle: '',
  authorName: '',
  metadataType: 'Feature',
  metadataDate: '',
  heroImage: '',
  heroImageCaption: '',
  excerpt: '',
  seoTitle: '',
  seoDescription: '',
  canonicalUrl: '',
  newsletterCtaLabel: '',
  newsletterCtaUrl: '',
  featuredOnHomepage: false,
  homepageDisplayOrder: 0,
  slug: '',

  // Content blocks
  contentBlocks: [],

  // UI state
  isLoading: false,
  isSaving: false,
  error: null,
  successMessage: null,
  isDirty: false,

  // Preview mode
  isPreviewMode: false,

  // Cursor position for inserting blocks
  insertPosition: null,

  // ============================================
  // Initialization
  // ============================================

  /**
   * Initialize editor with existing feature piece
   */
  initializeFromPiece: (piece) => set({
    featurePiece: piece,
    title: piece.title || '',
    subtitle: piece.subtitle || '',
    authorName: piece.author_name || '',
    metadataType: piece.metadata_type || 'Feature',
    metadataDate: piece.metadata_date || '',
    heroImage: piece.hero_image || '',
    heroImageCaption: piece.hero_image_caption || '',
    excerpt: piece.excerpt || '',
    seoTitle: piece.seo_title || '',
    seoDescription: piece.seo_description || '',
    canonicalUrl: piece.canonical_url || '',
    newsletterCtaLabel: piece.newsletter_cta_label || '',
    newsletterCtaUrl: piece.newsletter_cta_url || '',
    featuredOnHomepage: Boolean(piece.featured_on_homepage),
    homepageDisplayOrder: Number.isFinite(Number(piece.homepage_display_order))
      ? Number(piece.homepage_display_order)
      : 0,
    slug: piece.slug || '',
    contentBlocks: piece.content_blocks || [],
    isDirty: false,
    error: null,
    successMessage: null
  }),

  /**
   * Reset editor to blank state
   */
  reset: () => set({
    featurePiece: null,
    title: '',
    subtitle: '',
    authorName: '',
    metadataType: 'Feature',
    metadataDate: '',
    heroImage: '',
    heroImageCaption: '',
    excerpt: '',
    seoTitle: '',
    seoDescription: '',
    canonicalUrl: '',
    newsletterCtaLabel: '',
    newsletterCtaUrl: '',
    featuredOnHomepage: false,
    homepageDisplayOrder: 0,
    slug: '',
    contentBlocks: [],
    isLoading: false,
    isSaving: false,
    error: null,
    successMessage: null,
    isDirty: false,
    isPreviewMode: false,
    insertPosition: null
  }),

  // ============================================
  // Header field updates
  // ============================================

  setTitle: (title) => set({ title, isDirty: true }),
  setSubtitle: (subtitle) => set({ subtitle, isDirty: true }),
  setAuthorName: (authorName) => set({ authorName, isDirty: true }),
  setMetadataType: (metadataType) => set({ metadataType, isDirty: true }),
  setMetadataDate: (metadataDate) => set({ metadataDate, isDirty: true }),
  setHeroImage: (heroImage) => set({ heroImage, isDirty: true }),
  setHeroImageCaption: (heroImageCaption) => set({ heroImageCaption, isDirty: true }),
  setExcerpt: (excerpt) => set({ excerpt, isDirty: true }),
  setSeoTitle: (seoTitle) => set({ seoTitle, isDirty: true }),
  setSeoDescription: (seoDescription) => set({ seoDescription, isDirty: true }),
  setCanonicalUrl: (canonicalUrl) => set({ canonicalUrl, isDirty: true }),
  setNewsletterCtaLabel: (newsletterCtaLabel) => set({ newsletterCtaLabel, isDirty: true }),
  setNewsletterCtaUrl: (newsletterCtaUrl) => set({ newsletterCtaUrl, isDirty: true }),
  setFeaturedOnHomepage: (featuredOnHomepage) => set({ featuredOnHomepage: Boolean(featuredOnHomepage), isDirty: true }),
  setHomepageDisplayOrder: (homepageDisplayOrder) => set({
    homepageDisplayOrder: Number.isFinite(Number(homepageDisplayOrder)) ? Number(homepageDisplayOrder) : 0,
    isDirty: true
  }),
  setSlug: (slug) => set({ slug, isDirty: true }),

  // ============================================
  // Block operations
  // ============================================

  /**
   * Add a new block at the end or at insert position
   */
  addBlock: (type, initialContent = {}) => set((state) => {
    const newBlock = {
      id: generateBlockId(),
      type,
      ...getDefaultBlockContent(type),
      ...initialContent
    };

    let newBlocks;
    if (state.insertPosition !== null) {
      // Insert at specified position
      newBlocks = [
        ...state.contentBlocks.slice(0, state.insertPosition),
        newBlock,
        ...state.contentBlocks.slice(state.insertPosition)
      ];
    } else {
      // Add at end
      newBlocks = [...state.contentBlocks, newBlock];
    }

    return {
      contentBlocks: newBlocks,
      insertPosition: null,
      isDirty: true
    };
  }),

  /**
   * Remove a block by ID
   */
  removeBlock: (blockId) => set((state) => ({
    contentBlocks: state.contentBlocks.filter(b => b.id !== blockId),
    isDirty: true
  })),

  /**
   * Update a block's content
   */
  updateBlock: (blockId, updates) => set((state) => ({
    contentBlocks: state.contentBlocks.map(block =>
      block.id === blockId ? { ...block, ...updates } : block
    ),
    isDirty: true
  })),

  /**
   * Move a block to a new position
   */
  moveBlock: (blockId, newIndex) => set((state) => {
    const currentIndex = state.contentBlocks.findIndex(b => b.id === blockId);
    if (currentIndex === -1 || currentIndex === newIndex) return state;

    const newBlocks = [...state.contentBlocks];
    const [removed] = newBlocks.splice(currentIndex, 1);
    newBlocks.splice(newIndex, 0, removed);

    return {
      contentBlocks: newBlocks,
      isDirty: true
    };
  }),

  /**
   * Reorder all blocks (for drag-and-drop)
   */
  reorderBlocks: (newOrder) => set({
    contentBlocks: newOrder,
    isDirty: true
  }),

  /**
   * Set the insert position for the next block
   */
  setInsertPosition: (position) => set({ insertPosition: position }),

  /**
   * Clear the insert position
   */
  clearInsertPosition: () => set({ insertPosition: null }),

  // ============================================
  // UI state updates
  // ============================================

  setLoading: (isLoading) => set({ isLoading }),
  setSaving: (isSaving) => set({ isSaving }),
  setError: (error) => set({ error, successMessage: null }),
  setSuccess: (successMessage) => set({ successMessage, error: null }),
  clearMessages: () => set({ error: null, successMessage: null }),
  setDirty: (isDirty) => set({ isDirty }),

  togglePreview: () => set((state) => ({ isPreviewMode: !state.isPreviewMode })),
  setPreviewMode: (isPreviewMode) => set({ isPreviewMode }),

  // ============================================
  // Get data for saving
  // ============================================

  /**
   * Get the current editor state as a data object for saving
   */
  getDataForSave: () => {
    const state = get();
    return {
      title: state.title,
      subtitle: state.subtitle,
      author_name: state.authorName,
      metadata_type: state.metadataType,
      metadata_date: state.metadataDate,
      hero_image: state.heroImage,
      hero_image_caption: state.heroImageCaption,
      excerpt: state.excerpt,
      seo_title: state.seoTitle,
      seo_description: state.seoDescription,
      canonical_url: state.canonicalUrl,
      newsletter_cta_label: state.newsletterCtaLabel,
      newsletter_cta_url: state.newsletterCtaUrl,
      featured_on_homepage: state.featuredOnHomepage,
      homepage_display_order: state.homepageDisplayOrder,
      slug: state.slug,
      content_blocks: state.contentBlocks
    };
  }
}));

/**
 * Get default content for a block type
 */
function getDefaultBlockContent(type) {
  switch (type) {
    case 'section_heading':
      return { content: '' };
    case 'body':
      return { content: '' };
    case 'pull_quote':
      return { content: '', attribution: '' };
    case 'image':
      return { url: '', caption: '' };
    case 'divider':
      return {};
    default:
      return {};
  }
}

export default useFeatureEditorStore;
