import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { theme, DashedBox, Button, TextArea } from '@shared/styles/GlobalStyles';
import PlatformIcon from '@shared/components/PlatformIcon';
import SpotifyImport from './SpotifyImport.jsx';
import AppleImport from './AppleImport.jsx';
import TidalImport from './TidalImport.jsx';
import QobuzImport from './QobuzImport.jsx';

const IMPORT_TAB_STORAGE_KEY = 'flowerpil-import-tools-tab';
const IMPORT_TABS = ['text', 'spotify', 'apple', 'tidal', 'qobuz'];

const ImportContainer = styled(DashedBox)`
  margin-bottom: ${theme.spacing.lg};
`;

const ImportHeader = styled.div`
  margin-bottom: ${theme.spacing.lg};
  color: black;
  
  h3 {
    font-family: ${theme.fonts.mono};
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: black;
    margin-bottom: ${theme.spacing.xs};
  }
  
  .subtitle {
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.black};
    font-family: ${theme.fonts.mono};
  }
`;

const QuickHint = styled.div`
  margin-bottom: ${theme.spacing.md};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border: ${theme.borders.dashedThin} rgba(0, 0, 0, 0.25);
  background: rgba(255, 255, 255, 0.92);
  border-radius: 8px;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  line-height: 1.45;
`;

const ImportTabs = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  margin-bottom: ${theme.spacing.lg};
  border-bottom: ${theme.borders.solidAct} ${theme.colors.blackAct};
`;

const ImportTab = styled.button.withConfig({
  shouldForwardProp: (prop) => prop !== 'active',
})`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border: none;
  background: ${props => props.active ? theme.colors.fpwhite : 'transparent'};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  border-top: ${theme.borders.solid} ${theme.colors.black[300]};
  border-left: ${theme.borders.dashed} ${theme.colors.black[300]};
  border-right: ${theme.borders.dashed} ${theme.colors.black[300]};
  margin-bottom: -1px;
  
  &:hover:not(:disabled) {
    background: ${theme.colors.action};
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ImportContent = styled.div`
  min-height: 200px;
`;

const TextImportForm = styled.div`
  display: grid;
  gap: ${theme.spacing.md};
`;

const ImportInstructions = styled.div`
  padding: ${theme.spacing.sm};
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.dashed} ${theme.colors.black[200]};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black[600]};
  
  .format-example {
    margin-top: ${theme.spacing.sm};
    padding: ${theme.spacing.sm};
    background: ${theme.colors.fpwhite};
    color: ${theme.colors.black};
    border-radius: 0;
    white-space: pre-line;
  }
`;

const ImportActions = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  justify-content: flex-end;
`;


const ImportTools = ({ onTracksImport, onPlaylistImported, disabled = false }) => {
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return 'text';
    const stored = window.sessionStorage.getItem(IMPORT_TAB_STORAGE_KEY);
    return IMPORT_TABS.includes(stored) ? stored : 'text';
  });
  const [textInput, setTextInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(IMPORT_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  const parseTextTracks = (text) => {
    const lines = text.trim().split('\n').filter(line => line.trim());
    const tracks = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Try different parsing patterns
      let track = null;
      
      // Pattern 1: "Artist - Title"
      if (line.includes(' - ')) {
        const [artist, title] = line.split(' - ', 2);
        if (artist && title) {
          track = {
            id: `import_${Date.now()}_${i}`,
            position: tracks.length + 1,
            title: title.trim(),
            artist: artist.trim(),
            album: '',
            year: null,
            duration: ''
          };
        }
      }
      
      // Pattern 2: "Title by Artist"
      else if (line.includes(' by ')) {
        const [title, artist] = line.split(' by ', 2);
        if (artist && title) {
          track = {
            id: `import_${Date.now()}_${i}`,
            position: tracks.length + 1,
            title: title.trim(),
            artist: artist.trim(),
            album: '',
            year: null,
            duration: ''
          };
        }
      }
      
      // Pattern 3: Just the line as title (fallback)
      else {
        track = {
          id: `import_${Date.now()}_${i}`,
          position: tracks.length + 1,
          title: line,
          artist: '',
          album: '',
          year: null,
          duration: ''
        };
      }
      
      if (track) {
        tracks.push(track);
      }
    }
    
    return tracks;
  };

  const handleTextImport = async () => {
    if (!textInput.trim()) return;
    
    setIsProcessing(true);
    try {
      const tracks = parseTextTracks(textInput);
      onTracksImport(tracks);
      setTextInput('');
    } catch (error) {
      console.error('Import error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'text':
        return (
          <TextImportForm>
            <ImportInstructions>
              <div>Paste your tracklist in any of these formats:</div>
              <div className="format-example">
                Artist - Track Title{'\n'}
                Track Title by Artist{'\n'}
                Just Track Title
              </div>
            </ImportInstructions>
            
            <TextArea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Paste your tracklist here...&#10;&#10;Example:&#10;Disclosure - Latch&#10;ODESZA - Say My Name&#10;Flume - Never Be Like You"
              disabled={disabled || isProcessing}
              rows={8}
            />
            
            <ImportActions>
              <Button
                onClick={() => setTextInput('')}
                disabled={disabled || isProcessing || !textInput.trim()}
              >
                Clear
              </Button>
              
              <Button
                onClick={handleTextImport}
                disabled={disabled || isProcessing || !textInput.trim()}
                variant="primary"
              >
                {isProcessing ? 'Processing...' : 'Import Tracks'}
              </Button>
            </ImportActions>
          </TextImportForm>
        );
        
      case 'spotify':
        return (
          <div>
            <SpotifyImport onImportSuccess={(data) => {
              try {
                if (data?.tracks && Array.isArray(data.tracks)) {
                  // Normalize imported tracks with temporary IDs and coerced fields for UI editing
                  const norm = data.tracks.map((t, i) => ({
                    id: t.id || `import_${Date.now()}_${i}`,
                    position: t.position ?? i + 1,
                    title: t.title || '',
                    artist: t.artist || '',
                    album: t.album || '',
                    year: typeof t.year === 'string' ? (t.year ? parseInt(t.year) : null) : (Number.isInteger(t.year) ? t.year : null),
                    duration: t.duration || '',
                    spotify_id: t.spotify_id ?? null,
                    apple_id: t.apple_id ?? null,
                    tidal_id: t.tidal_id ?? null,
                    label: t.label || '',
                    genre: t.genre || '',
                    artwork_url: t.artwork_url || null,
                    album_artwork_url: t.album_artwork_url || '',
                    isrc: t.isrc || '',
                    explicit: !!t.explicit,
                    preview_url: t.preview_url || ''
                  }));
                  onTracksImport?.(norm);
                }
                if (data?.spotifyPlaylist && onPlaylistImported) {
                  onPlaylistImported(data.spotifyPlaylist);
                }
              } catch (e) {
                console.error('Spotify import handling error:', e);
              }
            }} />
          </div>
        );
        
      case 'apple':
        return (
          <AppleImport onImportSuccess={(data) => {
            try {
              if (data?.tracks && Array.isArray(data.tracks)) {
                const norm = data.tracks.map((t, i) => ({
                  id: t.id || `import_${Date.now()}_${i}`,
                  position: t.position ?? i + 1,
                  title: t.title || '',
                  artist: t.artist || '',
                  album: t.album || '',
                  year: typeof t.year === 'string' ? (t.year ? parseInt(t.year) : null) : (Number.isInteger(t.year) ? t.year : null),
                  duration: t.duration || '',
                  spotify_id: t.spotify_id ?? null,
                  apple_id: t.apple_id ?? null,
                  tidal_id: t.tidal_id ?? null,
                  label: t.label || '',
                  genre: t.genre || '',
                  artwork_url: t.artwork_url || null,
                  album_artwork_url: t.album_artwork_url || '',
                  isrc: t.isrc || '',
                  explicit: !!t.explicit,
                  preview_url: t.preview_url || ''
                }));
                onTracksImport?.(norm);
              }
              if (data?.applePlaylist && onPlaylistImported) {
                onPlaylistImported(data.applePlaylist);
              }
            } catch (e) {
              console.error('Apple import handling error:', e);
            }
          }} />
        );
        
      case 'tidal':
        return (
          <TidalImport onImportSuccess={(data) => {
            try {
              if (data?.tracks && Array.isArray(data.tracks)) {
                const norm = data.tracks.map((t, i) => ({
                  id: t.id || `import_${Date.now()}_${i}`,
                  position: t.position ?? i + 1,
                  title: t.title || '',
                  artist: t.artist || '',
                  album: t.album || '',
                  year: typeof t.year === 'string' ? (t.year ? parseInt(t.year) : null) : (Number.isInteger(t.year) ? t.year : null),
                  duration: t.duration || '',
                  spotify_id: t.spotify_id ?? null,
                  apple_id: t.apple_id ?? null,
                  tidal_id: t.tidal_id ?? null,
                  label: t.label || '',
                  genre: t.genre || '',
                  artwork_url: t.artwork_url || null,
                  album_artwork_url: t.album_artwork_url || '',
                  isrc: t.isrc || '',
                  explicit: !!t.explicit,
                  preview_url: t.preview_url || ''
                }));
                onTracksImport?.(norm);
              }
              if (data?.tidalPlaylist && onPlaylistImported) {
                onPlaylistImported(data.tidalPlaylist);
              }
            } catch (e) {
              console.error('Tidal import handling error:', e);
            }
          }} />
        );

      case 'qobuz':
        return (
          <QobuzImport onImportSuccess={(data) => {
            try {
              if (data?.tracks && Array.isArray(data.tracks)) {
                const norm = data.tracks.map((t, i) => ({
                  id: t.id || `import_${Date.now()}_${i}`,
                  position: t.position ?? i + 1,
                  title: t.title || '',
                  artist: t.artist || '',
                  album: t.album || '',
                  year: typeof t.year === 'string' ? (t.year ? parseInt(t.year) : null) : (Number.isInteger(t.year) ? t.year : null),
                  duration: t.duration || '',
                  spotify_id: t.spotify_id ?? null,
                  apple_id: t.apple_id ?? null,
                  tidal_id: t.tidal_id ?? null,
                  qobuz_url: t.qobuz_url || null,
                  label: t.label || '',
                  genre: t.genre || '',
                  artwork_url: t.artwork_url || null,
                  album_artwork_url: t.album_artwork_url || '',
                  isrc: t.isrc || '',
                  explicit: !!t.explicit,
                  preview_url: t.preview_url || ''
                }));
                onTracksImport?.(norm);
              }
            } catch (e) {
              console.error('Qobuz import handling error:', e);
            }
          }} />
        );

      default:
        return null;
    }
  };

  return (
    <ImportContainer>
      <ImportHeader>
        <p className="subtitle">Fastest path: paste a list. Use DSP tabs only when you need platform metadata.</p>
      </ImportHeader>

      <QuickHint>
        Paste or import one batch at a time to avoid duplicates. After import, spot-check 3–5 tracks before moving on.
      </QuickHint>

      <ImportTabs>
        <ImportTab
          active={activeTab === 'text'}
          onClick={() => setActiveTab('text')}
          disabled={disabled}
        >
          Text
        </ImportTab>
        <ImportTab
          active={activeTab === 'spotify'}
          onClick={() => setActiveTab('spotify')}
          disabled={disabled}
        >
          Spotify
        </ImportTab>

        <ImportTab
          active={activeTab === 'apple'}
          onClick={() => setActiveTab('apple')}
          disabled={disabled}
        >
          Apple
        </ImportTab>

        <ImportTab
          active={activeTab === 'tidal'}
          onClick={() => setActiveTab('tidal')}
          disabled={disabled}
        >
          Tidal
        </ImportTab>

        <ImportTab
          active={activeTab === 'qobuz'}
          onClick={() => setActiveTab('qobuz')}
          disabled={disabled}
        >
          Qobuz
        </ImportTab>
      </ImportTabs>

      <ImportContent>
        {renderTabContent()}
      </ImportContent>
    </ImportContainer>
  );
};

export default ImportTools;
