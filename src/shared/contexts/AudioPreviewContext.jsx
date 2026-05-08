import React, { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

const AudioPreviewContext = createContext({
  currentTrack: null,
  isPlaying: false,
  isLoading: false,
  error: null,
  playPreview: () => Promise.resolve(),
  stopPreview: () => {},
  isCurrentTrack: () => false
});

export const useAudioPreview = () => {
  const context = useContext(AudioPreviewContext);
  if (!context) {
    throw new Error('useAudioPreview must be used within AudioPreviewProvider');
  }
  return context;
};

export const AudioPreviewProvider = ({ children }) => {
  // NOTE: Deezer previews are always enabled regardless of VITE_ENABLE_AUDIO_FEATURES
  // The audio features flag is for disabling music/audio file functionality (releases module),
  // but Deezer previews are core playlist functionality and should always work

  const location = useLocation();
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const audioRef = useRef(null);
  const timeoutRef = useRef(null);
  const timeUpdateListenerRef = useRef(null);

  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio();
    // NOTE: crossOrigin NOT set for same-origin requests
    // Setting crossOrigin='anonymous' for same-origin resources can cause CORS issues
    // Only set crossOrigin if we were loading from external domains (which we're not - we proxy through our API)
    audioRef.current.preload = 'none';
    audioRef.current.volume = 1.0; // Ensure volume is at max
    audioRef.current.muted = false; // Ensure not muted

    const handleEnded = () => {
      console.log('Audio ended');
      setIsPlaying(false);
      setCurrentTrack(null);
      setIsLoading(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };

    const handleError = (e) => {
      console.error('Audio playback error event:', e);
      // Log the actual MediaError details
      if (audioRef.current?.error) {
        const mediaError = audioRef.current.error;
        console.error('MediaError details:', {
          code: mediaError.code,
          message: mediaError.message,
          MEDIA_ERR_ABORTED: mediaError.code === 1,
          MEDIA_ERR_NETWORK: mediaError.code === 2,
          MEDIA_ERR_DECODE: mediaError.code === 3,
          MEDIA_ERR_SRC_NOT_SUPPORTED: mediaError.code === 4
        });
        console.error('Audio src:', audioRef.current.src);
      }
      setIsPlaying(false);
      setError('Playback failed');
      setIsLoading(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };

    const handleCanPlay = () => {
      console.log('Audio can play');
      // Don't automatically set loading to false here - let the play function handle it
    };

    const handlePlay = () => {
      console.log('Audio started playing');
      setIsPlaying(true);
      setIsLoading(false);
    };

    const handlePause = () => {
      console.log('Audio paused');
      setIsPlaying(false);
    };

    audioRef.current.addEventListener('ended', handleEnded);
    audioRef.current.addEventListener('error', handleError);
    audioRef.current.addEventListener('canplay', handleCanPlay);
    audioRef.current.addEventListener('play', handlePlay);
    audioRef.current.addEventListener('pause', handlePause);
    
    return () => {
      if (audioRef.current) {
        if (timeUpdateListenerRef.current) {
          audioRef.current.removeEventListener('timeupdate', timeUpdateListenerRef.current);
          timeUpdateListenerRef.current = null;
        }
        audioRef.current.removeEventListener('ended', handleEnded);
        audioRef.current.removeEventListener('error', handleError);
        audioRef.current.removeEventListener('canplay', handleCanPlay);
        audioRef.current.removeEventListener('play', handlePlay);
        audioRef.current.removeEventListener('pause', handlePause);
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Stop audio when navigating to a different page
  useEffect(() => {
    // Stop preview when route changes
    return () => {
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        setIsPlaying(false);
        setCurrentTrack(null);
        setError(null);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      }
    };
  }, [location.pathname]); // Only depend on pathname

  const stopPreview = useCallback(() => {
    // Clean up timeupdate listener
    if (timeUpdateListenerRef.current && audioRef.current) {
      audioRef.current.removeEventListener('timeupdate', timeUpdateListenerRef.current);
      timeUpdateListenerRef.current = null;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentTrack(null);
    setError(null);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  const playPreview = useCallback(async (track, apiEndpoint) => {
    console.log('[AudioPreviewContext] playPreview FUNCTION CALLED', { trackId: track?.id, apiEndpoint });

    // For inline tracks (Top 10), we need artist+title at minimum
    if (!track?.id && !apiEndpoint && (!track?.artist || !track?.title)) {
      console.log('[AudioPreviewContext] NO track.id/apiEndpoint AND no artist/title, returning early');
      return;
    }

    // If same track is playing, stop it
    if (currentTrack?.id === track.id && isPlaying) {
      stopPreview();
      return;
    }

    // Stop any currently playing track
    if (isPlaying) {
      stopPreview();
    }

    // Immediately set the current track and loading state for instant feedback
    setCurrentTrack(track);
    setIsLoading(true);
    setError(null);
    setIsPlaying(false); // Ensure we start with playing false

    try {
      console.log('Preview playback - Track:', { id: track.id, title: track.title, artist: track.artist });

      // Check if we have cached preview data that's still fresh (< 30 minutes old)
      // Deezer URLs typically expire after a few hours, so 30 min cache is safe
      const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
      let previewData = null;

      if (track.preview_data?.url && track.preview_data?.cached_at) {
        const age = Date.now() - track.preview_data.cached_at;
        if (age < CACHE_TTL_MS) {
          console.log(`Using cached preview URL (age: ${Math.round(age / 1000)}s)`);
          previewData = track.preview_data;
        } else {
          console.log(`Cached preview URL expired (age: ${Math.round(age / 1000)}s), fetching fresh`);
        }
      }

      // Fetch fresh metadata if cache is stale or missing
      if (!previewData) {
        let endpoint, method, body;

        if (track.id) {
          // Track has ID - use standard endpoint
          endpoint = apiEndpoint || `/api/v1/preview/${track.id}`;
          method = 'GET';
          body = null;
        } else {
          // Inline track (Top 10) - use inline endpoint
          endpoint = '/api/v1/preview/inline';
          method = 'POST';
          body = JSON.stringify({
            artist: track.artist,
            title: track.title,
            isrc: track.isrc || null
          });
        }

        console.log('Fetching fresh preview metadata from:', endpoint, method);

        // Read CSRF token from cookie for POST requests (double-submit pattern)
        const getCsrfFromCookie = () => {
          try {
            const m = document.cookie.match(/(?:^|; )csrf_token=([^;]+)/);
            return m ? decodeURIComponent(m[1]) : '';
          } catch (_) { return ''; }
        };

        const shouldSendCsrf = method === 'POST';
        const csrfHeader = shouldSendCsrf ? { 'X-CSRF-Token': getCsrfFromCookie() } : {};

        const response = await fetch(endpoint, {
          method,
          credentials: 'same-origin', // Ensure cookies are sent
          headers: {
            'Accept': 'application/json',
            ...csrfHeader,
            ...(body && { 'Content-Type': 'application/json' })
          },
          ...(body && { body })
        });

        // Check for HTTP errors before parsing JSON
        if (!response.ok) {
          console.error(`Preview metadata fetch failed: ${response.status} ${response.statusText}`);
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          setError(errorData.error || `Server error: ${response.status}`);
          setIsLoading(false);
          setCurrentTrack(null);
          return;
        }

        const data = await response.json();

        if (!data.success || !data.data?.url) {
          console.warn('Preview metadata missing or invalid:', data);
          setError(data.message || 'No preview available');
          setIsLoading(false);
          setCurrentTrack(null);
          return;
        }

        // Cache the fresh data with timestamp
        previewData = {
          ...data.data,
          cached_at: Date.now()
        };
        track.preview_data = previewData;
      }

      if (!previewData?.url || !audioRef.current) {
        setError('Preview not available');
        setIsLoading(false);
        setCurrentTrack(null);
        return;
      }

      // Use the URL as-is (relative URLs work fine with Audio element)
      const streamUrl = previewData.url;
      console.log('🎵 Preview playback - Stream URL:', streamUrl);
      console.log('🎵 Preview playback - Full URL:', new URL(streamUrl, window.location.origin).href);

      // Always set the source fresh to ensure we're not using a cached/expired URL
      console.log('🎵 Setting audio source...');

      // Set the source and play
      audioRef.current.src = streamUrl;

      try {
        const playPromise = audioRef.current.play();

        if (playPromise !== undefined) {
          await playPromise;
          // Play promise resolved - update state immediately
          setIsPlaying(true);
          setIsLoading(false);
        }
      } catch (playError) {
        // Play failed
        throw new Error(playError.message || 'Playback failed');
      }

      // Auto-stop after 30 seconds (for all previews including SoundCloud)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        stopPreview();
      }, 30000);

      // Additional safety: Set up timeupdate listener to enforce 30-second limit
      // This ensures we stop playback at exactly 30 seconds even if timeout doesn't fire perfectly
      // Clean up any existing listener first
      if (timeUpdateListenerRef.current && audioRef.current) {
        audioRef.current.removeEventListener('timeupdate', timeUpdateListenerRef.current);
      }
      
      const handleTimeUpdate = () => {
        if (audioRef.current && audioRef.current.currentTime >= 30) {
          audioRef.current.pause();
          stopPreview();
        }
      };

      if (audioRef.current) {
        audioRef.current.addEventListener('timeupdate', handleTimeUpdate);
        timeUpdateListenerRef.current = handleTimeUpdate;
      }

    } catch (err) {
      console.error('Failed to play preview:', err);
      setError('Playback failed');
      setIsPlaying(false);
      setIsLoading(false);
      setCurrentTrack(null);
    }
  }, [currentTrack, isPlaying, stopPreview]);

  const isCurrentTrack = useCallback((track) => {
    if (!currentTrack || !track) return false;

    // If both have IDs, compare by ID
    if (currentTrack.id && track.id) {
      return currentTrack.id === track.id;
    }

    // For inline tracks without IDs (like Top 10), compare by artist + title
    // This ensures unique identification even when tracks lack database IDs
    if (currentTrack.artist && currentTrack.title && track.artist && track.title) {
      return (
        currentTrack.artist.toLowerCase() === track.artist.toLowerCase() &&
        currentTrack.title.toLowerCase() === track.title.toLowerCase()
      );
    }

    return false;
  }, [currentTrack]);

  const hasPreviewAvailable = useCallback((track) => {
       // Return true if track already has preview data or if it's worth checking
       // Also check for SoundCloud preview URLs
       const hasSoundcloudPreview = track?.soundcloud_url && track?.preview_url && 
         (track.preview_url.includes('soundcloud.com') || 
          track.preview_url.includes('soundcloud') ||
          track.preview_url.startsWith('https://api.soundcloud.com'));
       // Also allow tracks with artist+title (for Top 10 inline tracks)
       const hasMetadata = !!(track?.artist && track?.title);
       return !!(track?.preview_data?.url || track?.id || hasSoundcloudPreview || hasMetadata);
  }, []);

  const value = useMemo(() => ({
    currentTrack,
    isPlaying,
    isLoading,
    error,
    playPreview,
    stopPreview,
    isCurrentTrack,
    hasPreviewAvailable
  }), [currentTrack, isPlaying, isLoading, error, playPreview, stopPreview, isCurrentTrack, hasPreviewAvailable]);

  return (
    <AudioPreviewContext.Provider value={value}>
      {children}
    </AudioPreviewContext.Provider>
  );
};

export default AudioPreviewContext;
