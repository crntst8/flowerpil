/**
 * Top10Editor Component
 *
 * Post-onboarding editor for managing top 10 playlist:
 * - View and reorder tracks (drag-drop)
 * - Add tracks manually
 * - Edit track blurbs
 * - Publish/unpublish (validation: exactly 10 tracks)
 * - Export to DSPs
 * - Edit title and description
 *
 * Design: Brutalist black/white aesthetic with lowercase typography
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import useEditorStore from '../store/editorStore';
import useOnboardingStore from '../store/onboardingStore';
import Top10Header from './Top10Header';
import Top10TrackList from './Top10TrackList';
import ManualTrackEntry from './ManualTrackEntry';
import Top10BlurbEditor from './Top10BlurbEditor';
import Top10PublishSuccessModal from './Top10PublishSuccessModal';
import Top10InstagramShareModal from './Top10InstagramShareModal';
import Top10PublishSuccessAnimation from './Top10PublishSuccessAnimation';

// Container - Full viewport
const EditorContainer = styled.div`
  min-height: 100vh;
  background: #f1ebef;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
`;

// Main content area
const ContentSection = styled.main`
  max-width: 900px;
  margin: 0 auto;
  padding: 1.5rem 1.25rem;

  @media (max-width: 375px) {
    padding: 1rem;
  }
`;

// Title editor
const TitleSection = styled.div`
  margin-bottom: 1.25rem;
  padding: 1.25rem;
  background: #fff;
  border: 2px solid #000;
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.1);

  @media (max-width: 375px) {
    padding: 0.9rem;
    margin-bottom: 1rem;
  }
`;

const Label = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: 700;
  color: #000;
  margin-bottom: 0.5rem;
  text-transform: lowercase;

  @media (max-width: 375px) {
    font-size: 0.8rem;
  }
`;

const Input = styled.input`
  width: 100%;
  padding: 0.75rem;
  font-size: 1rem;
  border: 2px solid #000;
  background: #fff;
  font-family: inherit;
  box-sizing: border-box;
  min-height: 48px;

  &:focus {
    outline: none;
    background: #f9f9f9;
  }

  &::placeholder {
    color: #999;
  }

  @media (max-width: 375px) {
    font-size: 0.9rem;
    padding: 0.65rem;
  }
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: 0.75rem;
  font-size: 0.875rem;
  border: 2px solid #000;
  background: #fff;
  font-family: inherit;
  resize: vertical;
  min-height: 80px;
  box-sizing: border-box;

  &:focus {
    outline: none;
    background: #f9f9f9;
  }

  &::placeholder {
    color: #999;
  }

  @media (max-width: 375px) {
    font-size: 0.8rem;
    padding: 0.65rem;
  }
`;

// Actions section
const ActionsBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  padding: 1.25rem;
  background: #fff;
  border: 2px solid #000;
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.1);
  position: sticky;
  top: calc(env(safe-area-inset-top) + 0.5rem);
  z-index: 5;

  @media (max-width: 375px) {
    padding: 0.9rem;
    margin-bottom: 1rem;
    gap: 0.5rem;
  }
`;

const ResetSection = styled.div`
  max-width: 900px;
  margin: 0 auto;
  padding: 0 1.25rem 2rem;
  display: flex;
  justify-content: center;

  @media (max-width: 375px) {
    padding: 0 1rem 1.5rem;
  }
`;

const ResetButton = styled.button`
  padding: 0.75rem 1.5rem;
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: lowercase;
  background: transparent;
  color: #000;
  border: 2px dashed #000;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;
  min-height: 48px;

  &:hover:not(:disabled) {
    background: #fff;
    transform: translateY(-1px);
    box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.15);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: none;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Button = styled.button`
  padding: 0.75rem 1.5rem;
  font-size: 0.875rem;
  font-weight: 700;
  text-transform: lowercase;
  background: ${props => {
    if (props.$variant === 'primary') return '#000';
    if (props.$variant === 'success') return '#22c55e';
    if (props.$variant === 'danger') return '#ff0000';
    return '#fff';
  }};
  color: ${props => (props.$variant === 'primary' || props.$variant === 'success' || props.$variant === 'danger') ? '#fff' : '#000'};
  border: 2px solid #000;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;
  min-height: 48px;

  &:hover:not(:disabled) {
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

  @media (max-width: 768px) {
    flex: 1 1 calc(50% - 0.375rem);
    min-width: 0;
  }

  @media (max-width: 375px) {
    font-size: 0.8rem;
    padding: 0.65rem 1rem;
  }
`;

const TrackCount = styled.div`
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  font-weight: 700;
  color: ${props => props.$valid ? '#22c55e' : '#ff0000'};
  border: 2px solid ${props => props.$valid ? '#22c55e' : '#ff0000'};
  background: ${props => props.$valid ? 'rgba(34, 197, 94, 0.05)' : 'rgba(255, 0, 0, 0.05)'};
  display: flex;
  align-items: center;
  justify-content: center;
  text-transform: lowercase;
  min-height: 48px;

  @media (max-width: 768px) {
    flex: 1 1 100%;
  }

  @media (max-width: 375px) {
    font-size: 0.9rem;
    padding: 0.65rem 1rem;
  }
`;

const ExplainerText = styled.p`
  font-size: 0.8rem;
  color: #666;
  margin: 0 0 1.25rem;
  padding: 0.75rem 1rem;
  background: rgba(0, 0, 0, 0.03);
  border-left: 3px solid #000;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', 'Droid Sans Mono', 'Source Code Pro', monospace;
  line-height: 1.5;

  @media (max-width: 375px) {
    font-size: 0.75rem;
    padding: 0.6rem 0.8rem;
  }
`;

// Messages
const MessageBox = styled.div`
  padding: 1rem 1.5rem;
  margin-bottom: 1.5rem;
  border: 2px solid ${props => props.$variant === 'error' ? '#ff0000' : '#22c55e'};
  background: ${props => props.$variant === 'error' ? 'rgba(255, 0, 0, 0.05)' : 'rgba(34, 197, 94, 0.05)'};
  color: ${props => props.$variant === 'error' ? '#ff0000' : '#22c55e'};
  font-weight: 600;
  font-size: 0.875rem;

  @media (max-width: 375px) {
    padding: 0.75rem 1rem;
    font-size: 0.8rem;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  font-size: 1.25rem;
  color: #666;
`;

const Top10Editor = () => {
  const navigate = useNavigate();
  const {
    top10,
    tracks,
    error,
    successMessage,
    showManualEntry,
    showBlurbEditor,
    editingTrack,
    setTop10,
    setTracks,
    addTrack,
    removeTrack,
    reorderTracks,
    updateBlurb,
    setError,
    setSuccess,
    clearMessages,
    openManualEntry,
    closeManualEntry,
    openBlurbEditor,
    closeBlurbEditor,
  } = useEditorStore();
  const { reset: resetOnboarding, attemptedDspImport } = useOnboardingStore();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showInstagramModal, setShowInstagramModal] = useState(false);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [publishedSlug, setPublishedSlug] = useState(null);
  const resetTouchRef = useRef(0);

  const handleUnauthorized = () => {
    resetOnboarding();
    navigate('/top10/start');
  };

  // Fetch user's Top10 on mount
  useEffect(() => {
    fetchTop10();
  }, []);

  const fetchTop10 = async () => {
    setIsLoading(true);
    clearMessages();

    try {
      const response = await fetch('/api/v1/top10/me', {
        method: 'GET',
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          handleUnauthorized();
          return;
        }
        if (response.status === 404) {
          // No Top10 yet - redirect to onboarding to import
          navigate('/top10/start?step=3');
          return;
        }
        throw new Error(data.message || 'Failed to load Top10');
      }

      // Load Top10 data
      const top10Data = data.top10;
      setTop10(top10Data);
      setTitle(top10Data.title || 'My Top 10 of 2025');
      setDescription(top10Data.description || '');
      setDisplayName(data.user?.display_name || 'Anonymous');

    } catch (err) {
      setError(err.message || 'Failed to load your Top10');
    } finally {
      setIsLoading(false);
    }
  };

  const createTop10 = async () => {
    try {
      const response = await fetch('/api/v1/top10', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: 'My Top 10 of 2025',
          description: '',
          tracks: [],
        }),
      });

      const data = await response.json();

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create Top10');
      }

      setTop10(data.top10);
      setTitle(data.top10.title || 'My Top 10 of 2025');
      setDescription(data.top10.description || '');
    } catch (err) {
      setError(err.message || 'Failed to create your Top10');
    } finally {
      setIsLoading(false);
    }
  };

  const saveMetadata = async () => {
    if (!top10?.id) return;

    setIsSaving(true);
    clearMessages();

    try {
      const response = await fetch(`/api/v1/top10/${top10.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: title.trim() || 'My Top 10 of 2025',
          description: description.trim() || null,
        }),
      });

      const data = await response.json();

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) {
        throw new Error(data.message || 'Failed to save changes');
      }

      setTop10({ ...top10, title, description });
      setSuccess('changes saved');
    } catch (err) {
      setError(err.message || 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const normalizeTracksForSave = (tracksToSave) =>
    tracksToSave.map(({ id, ...rest }) => rest);

  const saveTracks = async (updatedTracks) => {
    if (!top10?.id) return false;

    try {
      const response = await fetch(`/api/v1/top10/${top10.id}/tracks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tracks: normalizeTracksForSave(updatedTracks),
        }),
      });

      const data = await response.json();

      if (response.status === 401) {
        handleUnauthorized();
        return false;
      }

      if (!response.ok) {
        throw new Error(data.message || 'Failed to save tracks');
      }

      setSuccess('tracks updated');
      return true;
    } catch (err) {
      setError(err.message || 'Failed to save tracks');
      return false;
    }
  };

  const handleAddManualTrack = async (track) => {
    // Add to local state with proper position
    const newTrack = { ...track, position: tracks.length + 1 };
    const updatedTracks = [...tracks, newTrack];
    setTracks(updatedTracks);

    // Save to server
    await saveTracks(updatedTracks);
  };

  const handleRemoveTrack = async (position) => {
    // Remove and reposition
    const updatedTracks = tracks
      .filter(t => t.position !== position)
      .map((t, idx) => ({ ...t, position: idx + 1 }));

    setTracks(updatedTracks);
    await saveTracks(updatedTracks);
  };

  const handleReorderTracks = async (reorderedTracks) => {
    // Update positions
    const updatedTracks = reorderedTracks.map((t, idx) => ({ ...t, position: idx + 1 }));
    setTracks(updatedTracks);
    await saveTracks(updatedTracks);
  };

  const handleUpdateBlurb = async (position, blurb) => {
    // Update local state
    const updatedTracks = tracks.map(t =>
      t.position === position ? { ...t, blurb } : t
    );
    setTracks(updatedTracks);

    // Save to server
    await saveTracks(updatedTracks);
  };

  const handlePublish = async () => {
    if (!top10?.id) return;

    // Validate exactly 10 tracks
    if (tracks.length !== 10) {
      setError('You need exactly 10 tracks to publish');
      return;
    }

    setIsSaving(true);
    clearMessages();

    try {
      const didSave = await saveTracks(tracks);
      if (!didSave) {
        setIsSaving(false);
        return;
      }

      const response = await fetch(`/api/v1/top10/${top10.id}/publish`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptedDspImport }),
      });

      const data = await response.json();

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) {
        throw new Error(data.message || 'Failed to publish');
      }

      setTop10(data.top10);
      setPublishedSlug(data.top10.slug);
      setShowSuccessAnimation(true);
      clearMessages(); // Clear any existing messages
    } catch (err) {
      setError(err.message || 'Failed to publish');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnpublish = async () => {
    if (!top10?.id) return;

    setIsSaving(true);
    clearMessages();

    try {
      const response = await fetch(`/api/v1/top10/${top10.id}/unpublish`, {
        method: 'POST',
        credentials: 'include',
      });

      const data = await response.json();

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) {
        throw new Error(data.message || 'Failed to unpublish');
      }

      setTop10(data.top10);
      setSuccess('unpublished');
    } catch (err) {
      setError(err.message || 'Failed to unpublish');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartAgain = async () => {
    if (!top10?.id) return;

    const confirmReset = window.confirm('Start again? This will clear your playlist and return you to the import step.');
    if (!confirmReset) {
      return;
    }

    setIsSaving(true);
    clearMessages();

    try {
      const response = await fetch(`/api/v1/top10/${top10.id}/tracks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tracks: [] }),
      });

      const data = await response.json();

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to clear playlist');
      }

      setTracks([]);
      setSuccess('playlist cleared');
      navigate('/top10/start?step=3');
    } catch (err) {
      setError(err.message || 'Failed to clear playlist');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartAgainPress = async (event) => {
    if (event.type === 'touchend') {
      resetTouchRef.current = Date.now();
      await handleStartAgain();
      return;
    }

    if (event.type === 'click') {
      if (Date.now() - resetTouchRef.current < 700) {
        return;
      }
      await handleStartAgain();
    }
  };

  if (isLoading) {
    return (
      <EditorContainer>
        <Top10Header curatorName={displayName} showCurator={false} />
        <LoadingContainer>loading your top 10...</LoadingContainer>
      </EditorContainer>
    );
  }

  const isPublished = top10?.is_published === 1;
  const trackCount = tracks.length;
  const isValid = trackCount === 10;

  const currentSlug = publishedSlug || top10?.slug;

  return (
    <EditorContainer>
      <Top10Header curatorName={displayName} />

      <ContentSection>
        {error && <MessageBox $variant="error">{error}</MessageBox>}
        {successMessage && <MessageBox $variant="success">{successMessage}</MessageBox>}

        <TitleSection>
          <div style={{ marginBottom: '1rem' }}>
            <Label>title</Label>
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Top 10 of 2025"
              onBlur={saveMetadata}
            />
          </div>

          <div>
            <Label>description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="add a short description..."
              onBlur={saveMetadata}
            />
          </div>
        </TitleSection>

        <ExplainerText>
          drag to reorder · add thoughts to each track · replace or remove tracks anytime
        </ExplainerText>

        <ActionsBar>
          <TrackCount $valid={isValid}>
            {trackCount} / 10 tracks
          </TrackCount>

          <Button onClick={openManualEntry} disabled={isSaving}>
            + add track
          </Button>

          {!isPublished ? (
            <Button
              $variant="success"
              onClick={handlePublish}
              disabled={!isValid || isSaving}
            >
              {isSaving ? 'publishing...' : 'publish'}
            </Button>
          ) : (
            <>
              <Button
                $variant="danger"
                onClick={handleUnpublish}
                disabled={isSaving}
              >
                unpublish
              </Button>
              <Button
                onClick={() => setShowInstagramModal(true)}
                disabled={isSaving}
              >
                share to instagram
              </Button>
              <Button
                onClick={() => navigate(`/top10/${top10.slug}`)}
              >
                view public page
              </Button>
            </>
          )}
        </ActionsBar>

        <Top10TrackList
          tracks={tracks}
          onReorder={handleReorderTracks}
          onEditBlurb={(track) => openBlurbEditor(track)}
          onRemove={handleRemoveTrack}
        />
      </ContentSection>

      {showManualEntry && (
        <ManualTrackEntry
          onAdd={handleAddManualTrack}
          onClose={closeManualEntry}
        />
      )}

      {showBlurbEditor && editingTrack && (
        <Top10BlurbEditor
          track={editingTrack}
          onUpdate={handleUpdateBlurb}
          onClose={closeBlurbEditor}
        />
      )}

      {showSuccessAnimation && (
        <Top10PublishSuccessAnimation
          onComplete={() => {
            setShowSuccessAnimation(false);
            // Redirect to public page with published flag
            window.location.href = `/top10/${publishedSlug}?published=true`;
          }}
        />
      )}

      <Top10PublishSuccessModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        slug={currentSlug}
        onShareToInstagram={() => {
          setShowSuccessModal(false);
          setShowInstagramModal(true);
        }}
      />

      <Top10InstagramShareModal
        isOpen={showInstagramModal}
        onClose={() => setShowInstagramModal(false)}
        slug={currentSlug}
        tracks={tracks}
        curatorName={displayName}
      />

        <ResetSection>
          <ResetButton
            type="button"
            onClick={handleStartAgainPress}
            onTouchEnd={handleStartAgainPress}
            disabled={isSaving}
          >
            start again
          </ResetButton>
        </ResetSection>
    </EditorContainer>
    
  );
};

export default Top10Editor;
