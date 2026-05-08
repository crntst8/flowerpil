import { create } from 'zustand';

const useAdminStore = create((set, get) => ({
  // State
  currentPlaylist: {
    title: '',
    curator_name: '',
    curator_type: 'artist',
    description: '',
    description_short: '',
    tags: '',
    image: '',
    publish_date: new Date().toISOString().split('T')[0],
    published: false,
    spotify_url: '',
    apple_url: '',
    tidal_url: '',
    custom_action_label: '',
    custom_action_url: '',
    custom_action_icon: '',
    custom_action_icon_source: ''
  },
  
  tracks: [],
  
  // Playlist browser state
  playlists: [],
  isLoadingPlaylists: false,
  playlistsError: null,
  
  isLoading: false,
  error: null,
  
  // Actions
  setCurrentPlaylist: (playlist) => set({
    currentPlaylist: {
      // Ensure all required fields have defaults
      title: playlist?.title || '',
      curator_name: playlist?.curator_name || '',
      curator_type: playlist?.curator_type || 'artist',
      description: playlist?.description || '',
      description_short: playlist?.description_short || '',
      tags: playlist?.tags || '',
      image: playlist?.image || '',
      publish_date: playlist?.publish_date || new Date().toISOString().split('T')[0],
      published: playlist?.published || false,
      spotify_url: playlist?.spotify_url || '',
      apple_url: playlist?.apple_url || '',
      tidal_url: playlist?.tidal_url || '',
      custom_action_label: playlist?.custom_action_label || '',
      custom_action_url: playlist?.custom_action_url || '',
      custom_action_icon: playlist?.custom_action_icon || '',
      custom_action_icon_source: playlist?.custom_action_icon_source || '',
      // Pass through any other fields (like id, created_at, etc.)
      ...playlist,
    }
  }),
  
  setTracks: (tracks) => set({ tracks }),
  
  setLoading: (isLoading) => set({ isLoading }),
  
  setError: (error) => set({ error }),
  
  clearError: () => set({ error: null }),
  
  // Playlist browser actions
  setPlaylists: (playlists) => set({ playlists }),
  
  setLoadingPlaylists: (isLoadingPlaylists) => set({ isLoadingPlaylists }),
  
  setPlaylistsError: (playlistsError) => set({ playlistsError }),
  
  clearPlaylistsError: () => set({ playlistsError: null }),
  
  // Helper methods
  addTrack: (track) => set((state) => ({
    tracks: [...state.tracks, {
      ...track,
      id: track.id || Date.now().toString(),
      position: state.tracks.length + 1
    }]
  })),
  
  removeTrack: (trackId) => set((state) => ({
    tracks: state.tracks
      .filter(track => track.id !== trackId)
      .map((track, index) => ({ ...track, position: index + 1 }))
  })),
  
  updateTrack: (trackId, updates) => set((state) => ({
    tracks: state.tracks.map(track => 
      track.id === trackId 
        ? { ...track, ...updates }
        : track
    )
  })),
  
  moveTrack: (trackId, direction) => set((state) => {
    const currentIndex = state.tracks.findIndex(track => track.id === trackId);
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    if (newIndex < 0 || newIndex >= state.tracks.length) {
      return state;
    }
    
    const updatedTracks = [...state.tracks];
    [updatedTracks[currentIndex], updatedTracks[newIndex]] = 
    [updatedTracks[newIndex], updatedTracks[currentIndex]];
    
    return {
      tracks: updatedTracks.map((track, index) => ({
        ...track,
        position: index + 1
      }))
    };
  }),
  
  resetPlaylist: () => set({
    currentPlaylist: {
      title: '',
      curator_name: '',
      curator_type: 'artist',
      description: '',
      description_short: '',
      tags: '',
      image: '',
      publish_date: new Date().toISOString().split('T')[0],
      published: false,
      spotify_url: '',
      apple_url: '',
      tidal_url: '',
      custom_action_label: '',
      custom_action_url: '',
      custom_action_icon: '',
      custom_action_icon_source: ''
    },
    tracks: [],
    error: null
  }),
  
  // Computed getters
  getPlaylistWithTracks: () => {
    const state = get();
    return {
      ...state.currentPlaylist,
      tracks: state.tracks
    };
  },
  
  getTrackCount: () => get().tracks.length,
  
  getTotalDuration: () => {
    const tracks = get().tracks;
    return tracks.reduce((total, track) => {
      if (!track.duration) return total;
      
      // Parse duration (supports both "MM:SS" and seconds)
      let seconds = 0;
      if (track.duration.includes(':')) {
        const [minutes, secs] = track.duration.split(':').map(Number);
        seconds = (minutes * 60) + secs;
      } else {
        seconds = parseInt(track.duration) || 0;
      }
      
      return total + seconds;
    }, 0);
  },
  
  getFormattedDuration: () => {
    const totalSeconds = get().getTotalDuration();
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  },
  
  isValidForSave: () => {
    const { currentPlaylist } = get();
    return currentPlaylist.title.trim() && currentPlaylist.curator_name.trim();
  },
  
  isValidForPublish: () => {
    const state = get();
    return state.isValidForSave() &&
           state.currentPlaylist.id &&
           state.tracks.length > 0;
  },

  // Inline editor state and actions
  editingPlaylistId: null,
  previousPlaylistStates: new Map(),
  warnings: [],

  setEditingPlaylistId: (id) => set({ editingPlaylistId: id }),

  optimisticUpdatePlaylist: (id, changes) => set((state) => {
    const playlist = state.playlists.find(p => p.id === id);
    if (!playlist) return state;

    // Store previous state for potential rollback
    if (!state.previousPlaylistStates.has(id)) {
      const newMap = new Map(state.previousPlaylistStates);
      newMap.set(id, { ...playlist });
      state.previousPlaylistStates = newMap;
    }

    // Apply optimistic update
    return {
      playlists: state.playlists.map(p =>
        p.id === id
          ? { ...p, ...changes, _optimistic: true }
          : p
      )
    };
  }),

  rollbackPlaylistUpdate: (id) => set((state) => {
    const previousState = state.previousPlaylistStates.get(id);
    if (!previousState) return state;

    const newMap = new Map(state.previousPlaylistStates);
    newMap.delete(id);

    return {
      playlists: state.playlists.map(p =>
        p.id === id ? previousState : p
      ),
      previousPlaylistStates: newMap
    };
  }),

  confirmPlaylistUpdate: (id, serverData) => set((state) => {
    const newMap = new Map(state.previousPlaylistStates);
    newMap.delete(id);

    return {
      playlists: state.playlists.map(p =>
        p.id === id
          ? { ...p, ...serverData, _optimistic: false }
          : p
      ),
      previousPlaylistStates: newMap
    };
  }),

  setWarnings: (warnings) => set({ warnings }),

  clearWarnings: () => set({ warnings: [] }),

  addWarning: (warning) => set((state) => ({
    warnings: [...state.warnings, warning]
  })),

  removeWarning: (index) => set((state) => ({
    warnings: state.warnings.filter((_, i) => i !== index)
  }))
}));

export { useAdminStore };
export default { useAdminStore };