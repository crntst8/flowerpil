import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { useAuth } from '@shared/contexts/AuthContext';
import { theme, DashedBox, Button, Input } from '@shared/styles/GlobalStyles';
import ImageUpload from './ImageUpload';

const ArtworkManager = ({ track, onArtworkUpdate }) => {
  const { authenticatedFetch } = useAuth();
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const successTimeoutRef = useRef(null);
  const hasAutoSearched = useRef(false);

  const handleSearch = async () => {
    if (!track.artist || !track.title) {
      setError('Track must have artist and title to search for artwork');
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        artist: track.artist,
        track: track.title,
        limit: 10
      });

      const response = await authenticatedFetch(`/api/v1/artwork/search?${params}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      setSearchResults(data.data || []);
    } catch (error) {
      setError('Failed to search for artwork: ' + error.message);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Auto-search on mount if we have artist and title
  useEffect(() => {
    if (track.artist && track.title && !hasAutoSearched.current && searchResults.length === 0) {
      hasAutoSearched.current = true;
      handleSearch();
    }
  }, [track.artist, track.title]);

  // Cleanup success timeout on unmount
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  const handleDownloadArtwork = async (result) => {
    setIsDownloading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await authenticatedFetch('/api/v1/artwork/download', {
        method: 'POST',
        body: JSON.stringify({
          artworkUrl: result.artwork,
          trackId: track.id,
          size: 'large'
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      // Update the track with new artwork
      if (onArtworkUpdate) {
        onArtworkUpdate(track.id, data.data.filename);
      }

      // Show success message and clear search results
      setSuccess('Artwork downloaded and applied successfully');
      setSearchResults([]);

      // Auto-clear success message after 4 seconds with cleanup
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
      successTimeoutRef.current = setTimeout(() => setSuccess(null), 4000);

    } catch (error) {
      setError('Failed to download artwork: ' + error.message);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleImageUpload = (filename) => {
    // Update the track with uploaded image
    if (onArtworkUpdate) {
      onArtworkUpdate(track.id, filename);
    }

    // Show success feedback with cleanup
    setSuccess('Artwork uploaded successfully');
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
    }
    successTimeoutRef.current = setTimeout(() => setSuccess(null), 4000);
  };

  const clearError = () => setError(null);
  const clearSuccess = () => {
    setSuccess(null);
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
    }
  };

  return (
    <ArtworkManagerContainer>
      <Header>
        <h4>Artwork Manager</h4>
        <p>{track.artist} - {track.title}</p>
      </Header>

      {error && (
        <StatusMessage type="error">
          {error}
          <Button onClick={clearError} variant="text">×</Button>
        </StatusMessage>
      )}

      {success && (
        <StatusMessage type="success">
          {success}
          <Button onClick={clearSuccess} variant="text">×</Button>
        </StatusMessage>
      )}

      {/* Upload Section - Always visible */}
      <UploadSection>
        <SectionHeader>Quick Upload</SectionHeader>
        <ImageUpload
          currentImage={track.artwork_url}
          onImageUpload={handleImageUpload}
          disabled={false}
          frameless={true}
          hideHeader={true}
          compact={false}
        />
      </UploadSection>

      {/* Divider */}
      <SectionDivider>OR</SectionDivider>

      {/* Search Section - Always visible */}
      <SearchSection>
        <SectionHeader>Search iTunes</SectionHeader>
        <Button
          onClick={handleSearch}
          disabled={isSearching || !track.artist || !track.title}
          variant="secondary"
        >
          {isSearching ? 'Searching iTunes...' : 'Search Again'}
        </Button>

        {searchResults.length > 0 && (
          <SearchResults>
            <ResultsHeader>
              <h5>Search Results ({searchResults.length})</h5>
            </ResultsHeader>

            <ResultsGrid>
              {searchResults.map((result, index) => (
                <ArtworkResult key={result.id || index}>
                  <ArtworkPreview>
                    {result.artwork?.medium ? (
                      <img
                        src={result.artwork.medium}
                        alt={`${result.artist} - ${result.title}`}
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <NoArtworkPlaceholder style={{ display: result.artwork?.medium ? 'none' : 'flex' }}>
                      NO ARTWORK
                    </NoArtworkPlaceholder>
                  </ArtworkPreview>

                  <ResultInfo>
                    <ResultTitle>{result.title}</ResultTitle>
                    <ResultArtist>{result.artist}</ResultArtist>
                    {result.album && <ResultAlbum>{result.album}</ResultAlbum>}
                    {result.genre && <ResultGenre>{result.genre}</ResultGenre>}
                    <RelevanceScore>Match: {result.relevanceScore}%</RelevanceScore>
                  </ResultInfo>

                  <ResultActions>
                    <Button
                      onClick={() => handleDownloadArtwork(result)}
                      disabled={isDownloading || !result.artwork}
                      variant="success"
                      size="small"
                    >
                      {isDownloading ? 'Downloading...' : 'Use This'}
                    </Button>

                    {result.previewUrl && (
                      <PreviewButton
                        href={result.previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Preview
                      </PreviewButton>
                    )}
                  </ResultActions>
                </ArtworkResult>
              ))}
            </ResultsGrid>
          </SearchResults>
        )}
      </SearchSection>
    </ArtworkManagerContainer>
  );
};

// Styled Components
const ArtworkManagerContainer = styled(DashedBox)`
  margin-bottom: ${theme.spacing.lg};
  padding: ${theme.spacing.md};
`;

const Header = styled.div`
  margin-bottom: ${theme.spacing.lg};

  h4 {
    font-family: ${theme.fonts.mono};
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: ${theme.spacing.xs};
    font-size: ${theme.fontSizes.medium};
  }

  p {
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.gray[600]};
  }
`;

const StatusMessage = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'type'
})`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${theme.spacing.md};
  background: ${props =>
    props.type === 'error' ? 'rgba(220, 38, 127, 0.1)' :
    props.type === 'success' ? 'rgba(76, 175, 80, 0.1)' :
    'rgba(49, 130, 206, 0.1)'
  };
  border: ${theme.borders.dashed} ${props =>
    props.type === 'error' ? theme.colors.red :
    props.type === 'success' ? theme.colors.success :
    theme.colors.primary
  };
  color: ${props =>
    props.type === 'error' ? theme.colors.red :
    props.type === 'success' ? theme.colors.success :
    theme.colors.primary
  };
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  margin-bottom: ${theme.spacing.md};
`;

const UploadSection = styled.div`
  margin-bottom: ${theme.spacing.lg};
  padding: ${theme.spacing.md};
  border: ${theme.borders.dashed} ${theme.colors.gray[200]};
  background: ${theme.colors.gray[50]};
`;

const SectionHeader = styled.h5`
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: ${theme.spacing.md};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[700]};
`;

const SectionDivider = styled.div`
  text-align: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[500]};
  margin: ${theme.spacing.lg} 0;
  position: relative;

  &::before,
  &::after {
    content: '';
    position: absolute;
    top: 50%;
    width: 40%;
    height: 1px;
    background: ${theme.colors.gray[300]};
  }

  &::before {
    left: 0;
  }

  &::after {
    right: 0;
  }
`;

const SearchSection = styled.div`
  margin-bottom: ${theme.spacing.lg};
  padding: ${theme.spacing.md};
  border: ${theme.borders.dashed} ${theme.colors.gray[200]};
  background: ${theme.colors.gray[50]};
`;

const SearchResults = styled.div`
  margin-top: ${theme.spacing.lg};
`;

const ResultsHeader = styled.div`
  margin-bottom: ${theme.spacing.md};
  
  h5 {
    font-family: ${theme.fonts.mono};
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
`;

const ResultsGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.md};
  max-height: min(500px, 60vh);
  overflow-y: auto;
`;

const ArtworkResult = styled.div`
  display: grid;
  grid-template-columns: 80px 1fr auto;
  gap: ${theme.spacing.md};
  align-items: start;
  padding: ${theme.spacing.md};
  border: ${theme.borders.dashed} ${theme.colors.gray[200]};
  background: ${theme.colors.gray[50]};

  @media (max-width: ${theme.breakpoints.mobile}) {
    grid-template-columns: 1fr;
    gap: ${theme.spacing.sm};

    /* Stack elements vertically on mobile */
  }
`;

const ArtworkPreview = styled.div`
  width: 80px;
  height: 80px;
  border: ${theme.borders.dashed} ${theme.colors.gray[300]};
  overflow: hidden;
  
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const NoArtworkPlaceholder = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.gray[500]};
  text-transform: uppercase;
  text-align: center;
  line-height: 1.2;
`;

const ResultInfo = styled.div`
  min-width: 0;
`;

const ResultTitle = styled.div`
  font-weight: ${theme.fontWeights.medium};
  margin-bottom: ${theme.spacing.xs};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ResultArtist = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[600]};
  margin-bottom: ${theme.spacing.xs};
`;

const ResultAlbum = styled.div`
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[700]};
  margin-bottom: ${theme.spacing.xs};
`;

const ResultGenre = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray[500]};
  margin-bottom: ${theme.spacing.xs};
`;

const RelevanceScore = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.primary};
  font-weight: ${theme.fontWeights.medium};
`;

const ResultActions = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const PreviewButton = styled.a`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: ${theme.borders.dashed} ${theme.colors.gray[400]};
  background: transparent;
  color: ${theme.colors.gray[700]};
  text-decoration: none;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-align: center;
  transition: all 0.2s ease;
  
  &:hover {
    border-color: ${theme.colors.primary};
    color: ${theme.colors.primary};
  }
`;

export default ArtworkManager;