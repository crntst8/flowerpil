/**
 * Top10 Editor Store
 *
 * Manages state for the Top10 editor:
 * - Track management (add, remove, reorder)
 * - Blurb editing
 * - Publish/unpublish
 * - Export tracking
 */

import { create } from 'zustand';

const useEditorStore = create((set) => ({
  // Top10 playlist data
  top10: null,
  tracks: [],

  // UI state
  isLoading: false,
  isSaving: false,
  error: null,
  successMessage: null,

  // Modal state
  showManualEntry: false,
  showBlurbEditor: false,
  editingTrack: null,

  // Export state
  isExporting: false,
  exportProgress: {},

  // Actions
  setTop10: (top10) => set({
    top10,
    tracks: top10?.tracks || [],
    error: null
  }),

  setTracks: (tracks) => set({ tracks }),

  addTrack: (track) => set((state) => ({
    tracks: [...state.tracks, { ...track, position: state.tracks.length + 1 }]
  })),

  removeTrack: (position) => set((state) => ({
    tracks: state.tracks
      .filter(t => t.position !== position)
      .map((t, idx) => ({ ...t, position: idx + 1 }))
  })),

  reorderTracks: (tracks) => set({
    tracks: tracks.map((t, idx) => ({ ...t, position: idx + 1 }))
  }),

  updateTrack: (position, updates) => set((state) => ({
    tracks: state.tracks.map(t =>
      t.position === position ? { ...t, ...updates } : t
    )
  })),

  updateBlurb: (position, blurb) => set((state) => ({
    tracks: state.tracks.map(t =>
      t.position === position ? { ...t, blurb } : t
    )
  })),

  // UI actions
  setLoading: (isLoading) => set({ isLoading }),
  setSaving: (isSaving) => set({ isSaving }),
  setError: (error) => set({ error, successMessage: null }),
  setSuccess: (successMessage) => set({ successMessage, error: null }),
  clearMessages: () => set({ error: null, successMessage: null }),

  // Modal actions
  openManualEntry: () => set({ showManualEntry: true }),
  closeManualEntry: () => set({ showManualEntry: false }),

  openBlurbEditor: (track) => set({
    showBlurbEditor: true,
    editingTrack: track
  }),
  closeBlurbEditor: () => set({
    showBlurbEditor: false,
    editingTrack: null
  }),

  // Export actions
  setExporting: (isExporting) => set({ isExporting }),
  setExportProgress: (platform, progress) => set((state) => ({
    exportProgress: { ...state.exportProgress, [platform]: progress }
  })),
  clearExportProgress: () => set({ exportProgress: {} }),

  // Reset
  reset: () => set({
    top10: null,
    tracks: [],
    isLoading: false,
    isSaving: false,
    error: null,
    successMessage: null,
    showManualEntry: false,
    showBlurbEditor: false,
    editingTrack: null,
    isExporting: false,
    exportProgress: {}
  })
}));

export default useEditorStore;
