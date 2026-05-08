/**
 * ManualTrackEntry Component
 *
 * Modal for manually adding tracks to Top10 that aren't on DSPs.
 * Allows entering:
 * - Title (required)
 * - Artist (required)
 * - Album (optional)
 * - Year (optional)
 * - Custom URL (optional)
 * - Custom platform name (optional)
 *
 * Design: Follows brutalist Top10 aesthetic with black/white contrast
 */

import React, { useState } from 'react';
import styled from 'styled-components';
import {
  ModalRoot,
  ModalSurface,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
} from '@shared/components/Modal';

const StyledModalSurface = styled(ModalSurface)`
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  background: #fff;
  border: 3px solid #000;
  border-radius: 0;
  box-shadow: 8px 8px 0 rgba(0, 0, 0, 0.2);
  max-width: 600px;
  width: 100%;

  @media (max-width: 375px) {
    max-width: 95vw;
    border: 2px solid #000;
    box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.2);
  }
`;

const StyledModalHeader = styled(ModalHeader)`
  padding: 1.5rem;
  border-bottom: 2px solid #000;
  background: #000;
  color: #fff;

  h2 {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    font-size: 1.5rem;
    font-weight: 900;
    text-transform: lowercase;
    letter-spacing: -0.02em;
  }

  @media (max-width: 375px) {
    padding: 1rem;

    h2 {
      font-size: 1.25rem;
    }
  }
`;

const StyledModalBody = styled(ModalBody)`
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;

  @media (max-width: 375px) {
    padding: 1rem;
    gap: 1rem;
  }
`;

const StyledModalFooter = styled(ModalFooter)`
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  padding: 1.5rem;
  border-top: 2px solid #000;

  @media (max-width: 375px) {
    padding: 1rem;
    flex-direction: column-reverse;

    button {
      width: 100%;
    }
  }
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const Label = styled.label`
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-size: 0.875rem;
  font-weight: 700;
  color: #000;
  text-transform: lowercase;

  span.required {
    color: #ff0000;
    margin-left: 0.25rem;
  }

  @media (max-width: 375px) {
    font-size: 0.8rem;
  }
`;

const Input = styled.input`
  padding: 0.75rem;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-size: 1rem;
  border: 2px solid #000;
  border-radius: 0;
  background: #fff;
  transition: all 0.2s ease;
  min-height: 48px;

  &:focus {
    outline: none;
    background: #f9f9f9;
    border-color: #000;
    box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.1);
  }

  &::placeholder {
    color: #999;
  }

  @media (max-width: 375px) {
    font-size: 0.9rem;
    padding: 0.65rem;
  }
`;

const Button = styled.button`
  padding: 0.75rem 1.5rem;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-size: 0.875rem;
  font-weight: 700;
  text-transform: lowercase;
  background: ${props => props.$variant === 'primary' ? '#000' : '#fff'};
  color: ${props => props.$variant === 'primary' ? '#fff' : '#000'};
  border: 2px solid #000;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 48px;

  &:hover:not(:disabled) {
    background: ${props => props.$variant === 'primary' ? '#333' : '#f9f9f9'};
    transform: translateY(-2px);
    box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.2);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: none;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 375px) {
    font-size: 0.8rem;
    padding: 0.65rem 1.25rem;
  }
`;

const ErrorBox = styled.div`
  padding: 0.75rem;
  border: 2px solid #ff0000;
  background: rgba(255, 0, 0, 0.05);
  color: #ff0000;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-size: 0.875rem;
  font-weight: 600;

  @media (max-width: 375px) {
    font-size: 0.8rem;
    padding: 0.65rem;
  }
`;

const HelpText = styled.div`
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-size: 0.75rem;
  color: #666;
  line-height: 1.4;

  @media (max-width: 375px) {
    font-size: 0.7rem;
  }
`;

const ResolverRow = styled.div`
  display: flex;
  gap: 0.75rem;
  align-items: center;

  @media (max-width: 375px) {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
  }
`;

const ResolverButton = styled(Button)`
  min-width: 140px;
  white-space: nowrap;
`;

const ManualTrackEntry = ({ onAdd, onClose }) => {
  const [resolveUrl, setResolveUrl] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState('');

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [year, setYear] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customPlatformName, setCustomPlatformName] = useState('');
  const [bandcampUrl, setBandcampUrl] = useState('');
  const [soundcloudUrl, setSoundcloudUrl] = useState('');
  const [artworkUrl, setArtworkUrl] = useState('');
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [appleMusicUrl, setAppleMusicUrl] = useState('');
  const [tidalUrl, setTidalUrl] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [qobuzUrl, setQobuzUrl] = useState('');
  const [error, setError] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleResolveFromUrl = async () => {
    setResolveError('');
    setError('');

    const url = resolveUrl.trim();
    if (!url) {
      setResolveError('Paste a URL to resolve');
      return;
    }

    try {
      setIsResolving(true);
      const response = await fetch('/api/v1/url-import/resolve-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to resolve URL');
      }

      const resolved = data.data || {};
      setTitle(resolved.title || '');
      setArtist(resolved.artist || '');
      setAlbum(resolved.album || '');
      setYear(resolved.year ? String(resolved.year) : '');

      const resolvedArtwork = resolved.artwork_url || resolved.album_artwork_url || '';
      setArtworkUrl(resolvedArtwork || '');
      const nextSpotifyUrl = resolved.spotify_url
        || (resolved.spotify_id ? `https://open.spotify.com/track/${resolved.spotify_id}` : '');
      setSpotifyUrl(nextSpotifyUrl || '');

      setBandcampUrl(resolved.bandcamp_url || '');
      setSoundcloudUrl(resolved.soundcloud_url || '');
      setAppleMusicUrl(resolved.apple_music_url || '');
      setTidalUrl(resolved.tidal_url || '');
      setYoutubeUrl(resolved.youtube_url || '');
      setQobuzUrl(resolved.qobuz_url || '');
    } catch (err) {
      setResolveError(err.message || 'Failed to resolve URL');
    } finally {
      setIsResolving(false);
    }
  };

  const handleAdd = async () => {
    setError('');
    setResolveError('');

    // Validation
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    if (!artist.trim()) {
      setError('Artist is required');
      return;
    }

    // Validate year if provided
    if (year && (!/^\d{4}$/.test(year) || parseInt(year) < 1900 || parseInt(year) > new Date().getFullYear() + 1)) {
      setError('Year must be a valid 4-digit year');
      return;
    }

    // Build track object
    const track = {
      id: `manual_${Date.now()}`,
      position: 0, // Will be set by parent
      title: title.trim(),
      artist: artist.trim(),
      album: album.trim() || null,
      year: year ? parseInt(year) : null,
      duration: null,
      artwork_url: artworkUrl.trim() || null,
      blurb: null,
      spotify_url: spotifyUrl.trim() || null,
      apple_music_url: appleMusicUrl.trim() || null,
      tidal_url: tidalUrl.trim() || null,
      youtube_url: youtubeUrl.trim() || null,
      soundcloud_url: soundcloudUrl.trim() || null,
      bandcamp_url: bandcampUrl.trim() || null,
      qobuz_url: qobuzUrl.trim() || null,
      custom_url: customUrl.trim() || null,
      custom_platform_name: customPlatformName.trim() || null,
    };

    try {
      setIsAdding(true);
      await onAdd(track);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add track');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <ModalRoot
      isOpen={true}
      onClose={onClose}
      labelledBy="manual-track-modal-title"
      closeOnBackdrop={!isAdding}
    >
      <StyledModalSurface>
        <StyledModalHeader>
          <ModalTitle id="manual-track-modal-title">add track manually</ModalTitle>
          <ModalCloseButton />
        </StyledModalHeader>

        <StyledModalBody>
          {error && <ErrorBox>{error}</ErrorBox>}
          {resolveError && <ErrorBox>{resolveError}</ErrorBox>}

          <FormGroup>
            <Label>import from url</Label>
            <ResolverRow>
              <Input
                type="url"
                value={resolveUrl}
                onChange={(e) => setResolveUrl(e.target.value)}
                placeholder="spotify, apple music, tidal, youtube, soundcloud, bandcamp, qobuz..."
                disabled={isAdding || isResolving}
              />
              <ResolverButton
                $variant="primary"
                type="button"
                onClick={handleResolveFromUrl}
                disabled={isAdding || isResolving || !resolveUrl.trim()}
              >
                {isResolving ? 'resolving...' : 'resolve url'}
              </ResolverButton>
            </ResolverRow>
            <HelpText>
              imports title, artist, album, year, and artwork when available. review edits below, then click add track
            </HelpText>
          </FormGroup>

          <FormGroup>
            <Label>
              title<span className="required">*</span>
            </Label>
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter track title"
              disabled={isAdding}
              maxLength={200}
            />
          </FormGroup>

          <FormGroup>
            <Label>
              artist<span className="required">*</span>
            </Label>
            <Input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="Enter artist name"
              disabled={isAdding}
              maxLength={200}
            />
          </FormGroup>

          <FormGroup>
            <Label>album</Label>
            <Input
              type="text"
              value={album}
              onChange={(e) => setAlbum(e.target.value)}
              placeholder="Enter album name (optional)"
              disabled={isAdding}
              maxLength={200}
            />
          </FormGroup>

          <FormGroup>
            <Label>year</Label>
            <Input
              type="text"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="e.g., 2025"
              disabled={isAdding}
              maxLength={4}
            />
          </FormGroup>

          <FormGroup>
            <Label>custom link</Label>
            <Input
              type="url"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="https://..."
              disabled={isAdding || isResolving}
            />
            <HelpText>
              optional link to track on bandcamp, soundcloud, or other platform
            </HelpText>
          </FormGroup>

          {customUrl && (
            <FormGroup>
              <Label>platform name</Label>
              <Input
                type="text"
                value={customPlatformName}
                onChange={(e) => setCustomPlatformName(e.target.value)}
                placeholder="e.g., bandcamp, soundcloud"
                disabled={isAdding || isResolving}
                maxLength={50}
              />
            </FormGroup>
          )}
        </StyledModalBody>

        <StyledModalFooter>
          <Button onClick={onClose} disabled={isAdding || isResolving}>
            cancel
          </Button>
          <Button $variant="primary" onClick={handleAdd} disabled={isAdding || isResolving}>
            {isAdding ? 'adding...' : 'add track'}
          </Button>
        </StyledModalFooter>
      </StyledModalSurface>
    </ModalRoot>
  );
};

export default ManualTrackEntry;
