import { create } from 'zustand';

const usePlaylistStore = create((set) => ({
  // Public playlists state
  playlists: [],
  isLoadingPlaylists: false,
  playlistsError: null,
  
  // Single playlist state
  currentPlaylist: null,
  currentTracks: [],
  isLoadingPlaylist: false,
  playlistError: null,
  
  // Actions for playlists list
  setPlaylists: (playlists) => set({ playlists }),
  setLoadingPlaylists: (loading) => set({ isLoadingPlaylists: loading }),
  setPlaylistsError: (error) => set({ playlistsError: error }),
  clearPlaylistsError: () => set({ playlistsError: null }),
  
  // Actions for single playlist
  setCurrentPlaylist: (playlist) => set({ currentPlaylist: playlist }),
  setCurrentTracks: (tracks) => set({ currentTracks: tracks }),
  setLoadingPlaylist: (loading) => set({ isLoadingPlaylist: loading }),
  setPlaylistError: (error) => set({ playlistError: error }),
  clearPlaylistError: () => set({ playlistError: null }),
  
  // Clear all state
  clearAll: () => set({
    playlists: [],
    isLoadingPlaylists: false,
    playlistsError: null,
    currentPlaylist: null,
    currentTracks: [],
    isLoadingPlaylist: false,
    playlistError: null,
  }),
}));

export default usePlaylistStore;
