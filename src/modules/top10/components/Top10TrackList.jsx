/**
 * Top10TrackList Component
 *
 * Sortable track list for Top10 editor with:
 * - Drag-and-drop reordering
 * - Track thumbnails and metadata
 * - Blurb editing
 * - Remove track functionality
 *
 * Design: Follows brutalist Top10 aesthetic with drag handle bars
 *
 * Security: Blurbs are rendered with dangerouslySetInnerHTML. The backend
 * MUST sanitize HTML before storage (whitelist: p/strong/em/br/a tags only).
 * See server/api/top10.js for sanitization implementation.
 */

import React, { useState } from 'react';
import styled from 'styled-components';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const TrackListContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  padding: 0;
`;

const TrackGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
  touch-action: pan-y;
  gap: 1em;
  
`;

const TrackItemContainer = styled.div`
  display: flex;
  flex-direction: column;
  background: #e1e1e1;
  border-bottom: 2px solid #000;
  transition: all 0.2s ease;
  box-shadow: 3px 3px 0 #000000;

  &:hover {
    background: #f9f9f9;
  }

  @media (max-width: 375px) {
    border-bottom: 1px solid #000;
  }
`;

const PositionBar = styled.div`
  background: #000;
  color: #fff;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: grab;
  user-select: none;
  min-height: 56px;

  &:active {
    cursor: grabbing;
  }

  @media (max-width: 375px) {
    min-height: 52px;
  }
`;

const DragHandle = styled.div`
  width: 56px;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  opacity: 0.4;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.7;
  }

  @media (max-width: 375px) {
    width: 52px;
  }
`;

const DragDot = styled.div`
  width: 4px;
  height: 4px;
  background: #fff;
  border-radius: 50%;
`;

const TrackContent = styled.div`
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.75rem;
  padding: 0.75rem;
  align-items: center;

  @media (max-width: 768px) {
    gap: 0.65rem;
    padding: 0.65rem;
  }

  @media (max-width: 375px) {
    gap: 0.5rem;
    padding: 0.5rem;
  }
`;

const Thumbnail = styled.div`
  width: 60px;
  height: 60px;
  background: #eee;
  border-radius: 0;
  overflow: hidden;
  box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.12);
  flex-shrink: 0;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  @media (max-width: 768px) {
    width: 55px;
    height: 55px;
  }

  @media (max-width: 375px) {
    width: 50px;
    height: 50px;
  }
`;

const TrackInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;
`;

const TrackTitle = styled.div`
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-size: 0.95rem;
  font-weight: 700;
  color: #000;
  line-height: 1.3;
  letter-spacing: -0.3px;

  @media (max-width: 375px) {
    font-size: 0.85rem;
  }
`;

const TrackArtist = styled.div`
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-size: 0.85rem;
  color: #323030;
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: -0.2px;

  @media (max-width: 375px) {
    font-size: 0.75rem;
  }
`;

const TrackMeta = styled.div`
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.8rem;
  color: #666;
  line-height: 1.5;
  text-transform: uppercase;
  letter-spacing: 0.3px;

  @media (max-width: 375px) {
    font-size: 0.75rem;
  }
`;

const RemoveButton = styled.button`
  background: #cc0000;
  border: none;
  border-right: 2px solid #000;
  color: #fff;
  font-size: 1.25rem;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
  width: 56px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  line-height: 1;

  &:hover {
    background: #ff0000;
  }

  &:active {
    background: #aa0000;
  }

  @media (max-width: 375px) {
    font-size: 1.1rem;
  }
`;


const QuoteButton = styled.button`
  padding: 0.5rem 0.75rem;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: lowercase;
  background: ${props => props.$hasQuote ? '#fff' : '#000'};
  color: ${props => props.$hasQuote ? '#000' : '#fff'};
  border: 1.5px solid #000;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  align-self: center;

  &:hover {
    background: ${props => props.$hasQuote ? '#f0f0f0' : '#333'};
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }

  @media (max-width: 375px) {
    padding: 0.4rem 0.6rem;
    font-size: 0.65rem;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 3rem 2rem;
  color: #666;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-size: 0.875rem;
  background: #f9f9f9;
  border: 2px dashed #ddd;

  @media (max-width: 375px) {
    padding: 2rem 1rem;
    font-size: 0.8rem;
  }
`;

const SortableTrackItem = ({ track, onEditBlurb, onRemove }) => {
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: track.id || track.position });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleRemoveClick = () => {
    if (confirmingRemove) {
      onRemove(track.position);
      setConfirmingRemove(false);
    } else {
      setConfirmingRemove(true);
      setTimeout(() => setConfirmingRemove(false), 3000);
    }
  };

  return (
    <TrackItemContainer ref={setNodeRef} style={style}>
      <PositionBar {...attributes} {...listeners}>
        <RemoveButton
          onClick={(e) => {
            e.stopPropagation();
            handleRemoveClick();
          }}
          title={confirmingRemove ? 'Click again to confirm' : 'Remove track'}
        >
          {confirmingRemove ? '?' : 'x'}
        </RemoveButton>
        <DragHandle>
          <DragDot />
          <DragDot />
          <DragDot />
        </DragHandle>
      </PositionBar>

      <TrackContent>
        <Thumbnail>
          {track.artwork_url ? (
            <img src={track.artwork_url} alt={track.title} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: '#ddd' }} />
          )}
        </Thumbnail>

        <TrackInfo>
          <TrackTitle>{track.title || 'Untitled'}</TrackTitle>
          <TrackArtist>{track.artist || 'Unknown Artist'}</TrackArtist>
          {(track.album || track.year) && (
            <TrackMeta>
              {track.album}
              {track.album && track.year && ' • '}
              {track.year}
            </TrackMeta>
          )}
        </TrackInfo>

        <QuoteButton
          $hasQuote={!!track.blurb}
          onClick={() => onEditBlurb(track)}
          title={track.blurb ? 'Edit quote' : 'Add quote'}
        >
          {track.blurb ? '✎ quote' : '+ quote'}
        </QuoteButton>
      </TrackContent>
    </TrackItemContainer>
  );
};

const Top10TrackList = ({ tracks = [], onReorder, onEditBlurb, onRemove }) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = tracks.findIndex(t => (t.id || t.position) === active.id);
      const newIndex = tracks.findIndex(t => (t.id || t.position) === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newTracks = arrayMove(tracks, oldIndex, newIndex);
        onReorder(newTracks);
      }
    }
  };

  if (!tracks || tracks.length === 0) {
    return (
      <TrackListContainer>
        <EmptyState>
          no tracks yet. import from a dsp or add manually.
        </EmptyState>
      </TrackListContainer>
    );
  }

  // Sort tracks in ascending order (1 -> 10) to match published view
  const sortedTracks = [...tracks].sort((a, b) => a.position - b.position);

  return (
    <TrackListContainer>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortedTracks.map(t => t.id || t.position)}
          strategy={verticalListSortingStrategy}
        >
          <TrackGrid>
            {sortedTracks.map((track) => (
              <SortableTrackItem
                key={track.id || track.position}
                track={track}
                onEditBlurb={onEditBlurb}
                onRemove={onRemove}
              />
            ))}
          </TrackGrid>
        </SortableContext>
      </DndContext>
    </TrackListContainer>
  );
};

export default Top10TrackList;
