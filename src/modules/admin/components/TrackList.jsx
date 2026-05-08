import React, { useState } from 'react';
import styled from 'styled-components';
import { theme, MainBox, Button, Input } from '@shared/styles/GlobalStyles';
import TrackMetadataEditor from './TrackMetadataEditor';
import TrackQuoteEditor from './TrackQuoteEditor.jsx';
import PreviewButton from '@modules/playlists/components/PreviewButton';
import PlatformIcon from '@shared/components/PlatformIcon';
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

const TrackListContainer = styled(MainBox).withConfig({ shouldForwardProp: (p) => !['$isCollapsed'].includes(p) })`
  margin-bottom: ${theme.spacing.sm};
  width: 100%;
  box-sizing: border-box;
  overflow-x: hidden;
  transition: padding ${theme.transitions.normal};
  overscroll-behavior: contain;

  @media (max-width: ${theme.breakpoints.tablet}) {
    padding: ${p => p.$isCollapsed ? `${theme.spacing.sm} ${theme.spacing.md}` : `${theme.spacing.md}`};
    margin-bottom: ${theme.spacing.xs};
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    width: 100%;
  }
`;

const TrackListHeader = styled.div.withConfig({ shouldForwardProp: (p) => !['$isCollapsed'].includes(p) })`
  display: none;
`;

const TrackHint = styled.div`
  margin: 0 0 ${theme.spacing.md};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background: #0b1220;
  color: #e5e7eb;
  border-radius: 12px;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  line-height: 1.5;
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.15), 0 2px 4px rgba(15, 23, 42, 0.1);

  strong {
    font-weight: ${theme.fontWeights.bold};
    color: #ffffff;
  }
`;

const TrackCount = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  font-weight: ${theme.fontWeights.semibold};
  color: #0f172a;
  padding: ${theme.spacing.xs} ${theme.spacing.md};
  border: ${theme.borders.solidThin} rgba(15, 23, 42, 0.15);
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
`;

const TrackListCollapseToggle = styled.button.withConfig({ shouldForwardProp: (p) => !['$collapsed'].includes(p) })`
  display: none;
`;

const TrackGrid = styled.div`
  display: grid;
  gap: 6px;
  margin-bottom: ${theme.spacing.sm};
  overflow-x: hidden;
  max-width: 100%;
  box-sizing: border-box;
  grid-auto-rows: minmax(52px, auto);
  touch-action: pan-y;

  @media (max-width: ${theme.breakpoints.mobile}) {
    gap: 4px;
    width: 100%;
    margin-bottom: ${theme.spacing.xs};
  }
`;

const TrackItem = styled.div.withConfig({ shouldForwardProp: (p) => !['$highlight'].includes(p) })`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto minmax(210px, auto);
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  position: relative;
  overflow: hidden;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
  border: ${theme.borders.solidThin} ${p =>
    p.$highlight ? theme.colors.primary : 'rgba(15, 23, 42, 0.12)'
  };
  border-radius: 6px;
  transition: all 0.15s ease;
  touch-action: pan-y;
  box-sizing: border-box;

  &:hover {
    box-shadow: 0 2px 4px rgba(15, 23, 42, 0.1);
    border-color: rgba(15, 23, 42, 0.2);
  }

  @media (max-width: 1180px) {
    grid-template-columns: auto minmax(0, 1fr) auto minmax(210px, auto);
    gap: 6px;
    padding: 6px 8px;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    grid-template-columns: auto 1fr auto;
    grid-template-areas: "header info actions";
    grid-auto-rows: auto;
    padding: 6px;
    column-gap: 6px;
    row-gap: 4px;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
    touch-action: pan-y;
  }
`;

const TrackHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  min-width: 120px;
  grid-column: 1;
  grid-row: 1;

  @media (max-width: 1180px) {
    gap: 6px;
    min-width: 110px;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    width: auto;
    justify-content: flex-start;
    gap: 6px;
    min-width: auto;
    grid-area: header;
  }
`;

const PositionBadge = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  border: none;
  border-radius: 5px;
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  font-weight: ${theme.fontWeights.bold};
  color: #ffffff;
  padding: 0;
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.2);

  @media (max-width: ${theme.breakpoints.mobile}) {
    min-width: 20px;
    height: 20px;
    font-size: 10px;
    border-radius: 4px;
  }
`;

const ArtworkThumb = styled.div`
  width: 56px;
  height: 56px;
  overflow: hidden;
  border: 1px solid rgba(15, 23, 42, 0.15);
  border-radius: 6px;
  box-shadow: 0 2px 4px rgba(15, 23, 42, 0.08);
  flex-shrink: 0;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.02), rgba(15, 23, 42, 0.05));

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  @media (max-width: 1180px) {
    width: 48px;
    height: 48px;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    display: none;
  }
`;

const ArtworkPlaceholder = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.04), rgba(15, 23, 42, 0.08));
  color: rgba(15, 23, 42, 0.3);
  font-size: 14px;

  svg {
    width: 16px;
    height: 16px;
    opacity: 0.4;
    stroke-width: 1.5;
  }
`;

const DragHandle = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  cursor: grab;
  color: rgba(15, 23, 42, 0.5);
  transition: all 0.15s ease;
  flex-shrink: 0;
  border-radius: 4px;
  background: rgba(15, 23, 42, 0.04);
  border: 1px solid rgba(15, 23, 42, 0.1);

  &:hover {
    color: rgba(15, 23, 42, 0.9);
    background: rgba(15, 23, 42, 0.08);
    border-color: rgba(15, 23, 42, 0.2);
  }

  &:active {
    cursor: grabbing;
    background: rgba(15, 23, 42, 0.14);
  }

  svg {
    width: 14px;
    height: 14px;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;
    border-radius: 8px;
    touch-action: none;

    svg {
      width: 18px;
      height: 18px;
    }
  }
`;

const TrackInfo = styled.div`
  flex: 1;
  min-width: 0;
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  grid-column: 2;
  grid-row: 1;
  overflow: hidden;
  box-sizing: border-box;

  .info-text {
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
  }

  .title {
    font-family: ${theme.fonts.primary};
    font-size: 13px;
    font-weight: 600;
    color: #000000;
    margin: 0;
    line-height: 1.2;
    letter-spacing: -0.01em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    font-family: ${theme.fonts.mono};
    font-size: 9px;
    color: rgba(0, 0, 0, 0.5);
    line-height: 1.2;
    letter-spacing: 0.01em;
    text-transform: uppercase;
    margin-top: 1px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .artist-row {
    font-family: ${theme.fonts.primary};
    font-size: 11px;
    font-weight: 500;
    color: rgba(15, 23, 42, 0.7);
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .quote-inline {
    font-family: ${theme.fonts.primary};
    font-size: 10px;
    color: rgba(71, 159, 242, 0.85);
    font-style: italic;
    white-space: nowrap;
    overflow: hidden;
    position: relative;
    flex: 1;
    min-width: 0;
    padding-left: 8px;
    border-left: 2px solid ${theme.colors.primary};

    /* Fade out effect */
    &::after {
      content: '';
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      width: 40px;
      background: linear-gradient(to right, transparent, #ffffff);
    }
  }

  @media (max-width: 1180px) {
    .meta {
      display: none;
    }
    .artist-row {
      display: block;
    }
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    flex: 1;
    min-width: 0;
    grid-area: info;
    flex-direction: column;
    gap: 4px;

    .info-text {
      flex: 1 1 auto;
      min-width: 0;
      max-width: none;
    }

    .title {
      font-size: 12px;
      line-height: 1.35;
      white-space: normal;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .meta {
      display: none;
    }

    .artist-row {
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      color: #0f172a;
      letter-spacing: 0.01em;
      white-space: normal;
      line-height: 1.25;
    }

    .quote-inline {
      display: none;
    }
  }
`;

const LinkBadge = styled.span.withConfig({ shouldForwardProp: (p) => !['$state'].includes(p) })`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 8px;
  background: ${p => {
    if (p.$state === 'error') return 'rgba(229, 62, 62, 0.1)';
    if (p.$state === 'linked') return 'rgba(34, 197, 94, 0.1)';
    return 'rgba(15, 23, 42, 0.05)';
  }};
  border: 1px solid ${p => {
    if (p.$state === 'error') return 'rgba(229, 62, 62, 0.4)';
    if (p.$state === 'linked') return 'rgba(34, 197, 94, 0.4)';
    return 'rgba(15, 23, 42, 0.12)';
  }};
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${p => {
    if (p.$state === 'error') return '#b91c1c';
    if (p.$state === 'linked') return '#065f46';
    return 'rgba(15, 23, 42, 0.7)';
  }};
  white-space: nowrap;

  @media (max-width: ${theme.breakpoints.mobile}) {
    display: none;
  }
`;

const LinkDot = styled.span.withConfig({ shouldForwardProp: (p) => !['$state'].includes(p) })`
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: ${p => {
    if (p.$state === 'error') return '#dc2626';
    if (p.$state === 'linked') return '#16a34a';
    return 'rgba(15, 23, 42, 0.35)';
  }};
  box-shadow: 0 0 0 3px ${p => {
    if (p.$state === 'error') return 'rgba(220, 38, 38, 0.22)';
    if (p.$state === 'linked') return 'rgba(22, 163, 74, 0.22)';
    return 'rgba(15, 23, 42, 0.08)';
  }};
`;

const TrackStatus = styled.div.withConfig({ shouldForwardProp: (p) => !['$hasError'].includes(p) })`
  grid-column: 3;
  grid-row: 1;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;

  @media (max-width: 1180px) {
    display: ${p => p.$hasError ? 'flex' : 'none'};
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    display: none;
  }
`;

const PlatformIconsRow = styled.div.withConfig({ shouldForwardProp: (p) => !['$hasLinks'].includes(p) })`
  grid-column: 4;
  grid-row: 1;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  min-width: 0;

  @media (max-width: 1180px) {
    display: none;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    display: none;
  }
`;

const PlatformIconWrapper = styled.div.withConfig({ shouldForwardProp: (p) => !['$linked'].includes(p) })`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: ${p => p.$linked ? 'rgba(34, 197, 94, 0.1)' : 'rgba(15, 23, 42, 0.05)'};
  border: 1px solid ${p => p.$linked ? 'rgba(34, 197, 94, 0.3)' : 'rgba(15, 23, 42, 0.12)'};
  opacity: ${p => p.$linked ? 1 : 0.5};
  transition: all 0.15s ease;
  
  &:hover {
    opacity: 1;
    transform: scale(1.1);
  }
`;

const QuoteButton = styled.button.withConfig({ shouldForwardProp: (p) => !['$hasQuote'].includes(p) })`
  display: ${p => p.$hasQuote ? 'none' : 'flex'};
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  background: rgba(15, 23, 42, 0.03);
  border: 1px dashed rgba(15, 23, 42, 0.15);
  border-radius: 4px;
  font-family: ${theme.fonts.mono};
  font-size: 9px;
  color: rgba(15, 23, 42, 0.5);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
  height: 26px;
  min-width: 60px;

  &:hover {
    background: rgba(15, 23, 42, 0.06);
    border-color: rgba(15, 23, 42, 0.25);
    color: rgba(15, 23, 42, 0.8);
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    display: none;
  }
`;

const TrackActions = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  grid-column: 5;
  grid-row: 1;

  /* Ensure PreviewButton matches height */
  button {
    height: 26px;
  }

  @media (max-width: 1180px) {
    grid-column: 4;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    gap: 8px;
    width: auto;
    justify-content: flex-end;
    background: transparent;
    padding: 0;
    border-radius: 0;
    grid-area: actions;
    flex-wrap: nowrap;

    /* Ensure all buttons meet 44px touch target */
    button {
      height: 44px;
      min-width: 44px;
      min-height: 44px;
      padding: 0;
      border-radius: 8px;
    }
  }
`;

const ActionButton = styled.button.withConfig({ shouldForwardProp: (p) => !['$variant', '$mobileIcon'].includes(p) })`
  padding: 4px 10px;
  font-family: ${theme.fonts.mono};
  font-size: 9px;
  font-weight: ${theme.fontWeights.semibold};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: ${p => p.$variant === 'danger'
    ? 'linear-gradient(135deg, rgba(229, 62, 62, 0.06) 0%, rgba(229, 62, 62, 0.08) 100%)'
    : 'linear-gradient(135deg, rgba(15, 23, 42, 0.04) 0%, rgba(15, 23, 42, 0.06) 100%)'};
  border: 1px solid ${p => p.$variant === 'danger'
    ? 'rgba(229, 62, 62, 0.2)'
    : 'rgba(15, 23, 42, 0.15)'};
  border-radius: 4px;
  color: ${p => p.$variant === 'danger' ? theme.colors.danger : '#0f172a'};
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
  height: 26px;
  min-width: 62px;
  box-shadow: none;

  .mobile-icon {
    display: none;
  }

  &:hover:not(:disabled) {
    background: ${p => p.$variant === 'danger'
      ? 'linear-gradient(135deg, rgba(229, 62, 62, 0.12) 0%, rgba(229, 62, 62, 0.16) 100%)'
      : 'linear-gradient(135deg, rgba(15, 23, 42, 0.08) 0%, rgba(15, 23, 42, 0.12) 100%)'};
    border-color: ${p => p.$variant === 'danger'
      ? 'rgba(229, 62, 62, 0.3)'
      : 'rgba(15, 23, 42, 0.25)'};
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    min-width: 44px;
    width: 44px;
    height: 44px;
    padding: 0;
    font-size: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${p => p.$variant === 'danger' ? '#b91c1c' : '#0f172a'};
    border-radius: 8px;

    .desktop-text {
      display: none;
    }

    .mobile-icon {
      display: block;
      font-size: 18px;
    }
  }
`;

const PreviewButtonWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-family: ${theme.fonts.mono};
  font-size: 9px;
  font-weight: ${theme.fontWeights.semibold};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.04) 0%, rgba(15, 23, 42, 0.06) 100%);
  border: 1px solid rgba(15, 23, 42, 0.15);
  border-radius: 4px;
  color: #0f172a;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
  height: 26px;
  min-width: 62px;
  box-shadow: none;

  &:hover {
    background: linear-gradient(135deg, rgba(15, 23, 42, 0.08) 0%, rgba(15, 23, 42, 0.12) 100%);
    border-color: rgba(15, 23, 42, 0.25);
  }

  &:active {
    transform: scale(0.98);
  }

  /* Override nested button styles to fit within wrapper */
  button {
    all: unset;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px !important;
    height: 16px !important;
    min-width: 16px !important;
    min-height: 16px !important;
    padding: 0 !important;
    background: transparent !important;
    border: none !important;
    cursor: pointer;
    font-size: 11px;
  }

  .preview-label {
    display: inline;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    min-width: 44px;
    width: 44px;
    height: 44px;
    padding: 0;
    font-size: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;

    .preview-label {
      display: none;
    }

    button {
      width: 18px !important;
      height: 18px !important;
      min-width: 18px !important;
      min-height: 18px !important;
      font-size: 14px;
    }
  }
`;

const AddTrackButton = styled.button.withConfig({ shouldForwardProp: (p) => !['$expanded'].includes(p) })`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 5em;
  background: linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%);
  border: 2px solid green;
  border-radius: 10px;
  color: black;
  font-size: 0.8em;
  font-family: ${theme.fonts.mono};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
  padding: 0 14px;
  gap: 8px;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.2);

  .icon {
    width: 26px;
    height: 26px;
    border-radius: 50%;
      color: black;

    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 1000;

  }

  .label {
    flex: 1;
      margin-left: 1em;

    text-align: left;
    font-weight: 1000;
  }

  .hint {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.7);
  }

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 14px rgba(15, 23, 42, 0.25);
  }

  &:active {
    transform: scale(0.98);
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    height: 44px;
    font-size: 13px;
    border-radius: 12px;
    padding: 0 12px;
  }
`;

const AddTrackRow = styled.div.withConfig({ shouldForwardProp: (p) => !['$expanded'].includes(p) })`
  display: flex;
  align-items: ${p => p.$expanded ? 'flex-start' : 'center'};
  flex-wrap: wrap;
  gap: 6px;
  padding: ${p => p.$expanded ? '10px' : '8px'};
  background: ${p => p.$expanded ? 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)' : 'rgba(16, 185, 129, 0.3)'};
  border: ${theme.borders.solidThin} ${p => p.$expanded ? '#10b981' : 'rgba(15, 23, 42, 0.12)'};
  border-radius: 10px;
  transition: all 0.2s ease;
  margin-bottom: 6px;
  box-shadow: ${p => p.$expanded ? '0 2px 8px rgba(16, 185, 129, 0.15)' : '0 1px 2px rgba(15, 23, 42, 0.06)'};
  min-height: ${p => p.$expanded ? 'auto' : '5em'};
  height: ${p => p.$expanded ? 'auto' : '5em'};

  &:hover {
    border-color: ${p => p.$expanded ? '#10b981' : 'rgba(15, 23, 42, 0.2)'};
  }

  @media (max-width: 1180px) {
    flex-wrap: wrap;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-wrap: ${p => p.$expanded ? 'wrap' : 'nowrap'};
    padding: ${p => p.$expanded ? '8px' : '8px'};
  }
`;

const InlineInput = styled(Input)`
  flex: 1;
  min-width: 100px;
  height: 32px;
  padding: 4px 8px;
  font-size: 12px;
  border-color: rgba(16, 185, 129, 0.3);
  max-width: 240px;

  &:focus {
    border-color: #10b981;
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.1);
  }

  @media (max-width: 1180px) {
    flex: 1 1 calc(50% - 6px);
    max-width: none;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    flex: 0 0 calc(50% - 3px);
    min-width: 0;
  }
`;

const UrlImportRow = styled.div`
  display: flex;
  gap: 6px;
  width: 100%;
  align-items: center;
  flex-wrap: wrap;
`;

const UrlInput = styled(Input)`
  flex: 1 1 320px;
  min-width: 220px;
  height: 32px;
  padding: 4px 10px;
  font-size: 12px;
  border-color: rgba(15, 23, 42, 0.12);

  &:focus {
    border-color: #0ea5e9;
    box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.15);
  }
`;

const UrlHint = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  color: rgba(15, 23, 42, 0.65);
  letter-spacing: 0.04em;
  text-transform: uppercase;
`;

const UrlError = styled.div`
  color: #b91c1c;
  font-size: 12px;
  width: 100%;
  font-family: ${theme.fonts.primary};
`;

const InlineButton = styled.button.withConfig({ shouldForwardProp: (p) => !['$variant'].includes(p) })`
  padding: 6px 12px;
  height: 32px;
  font-family: ${theme.fonts.mono};
  font-size: 9px;
  font-weight: ${theme.fontWeights.semibold};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: ${p => {
    if (p.$variant === 'success') return 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    if (p.$variant === 'danger') return 'linear-gradient(135deg, rgba(229, 62, 62, 0.9) 0%, rgba(220, 38, 38, 0.9) 100%)';
    return 'linear-gradient(135deg, rgba(15, 23, 42, 0.06) 0%, rgba(15, 23, 42, 0.08) 100%)';
  }};
  border: 1px solid ${p => {
    if (p.$variant === 'success') return '#059669';
    if (p.$variant === 'danger') return 'rgba(229, 62, 62, 0.5)';
    return 'rgba(15, 23, 42, 0.2)';
  }};
  border-radius: 4px;
  color: ${p => (p.$variant === 'success' || p.$variant === 'danger') ? '#ffffff' : '#0f172a'};
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
  white-space: nowrap;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    flex: ${p => p.$variant ? '0 0 auto' : '1'};
    padding: 8px 10px;
  }
`;

const InlineButtonGroup = styled.div`
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  align-items: center;
  margin-left: auto;

  @media (max-width: ${theme.breakpoints.mobile}) {
    width: 100%;
    margin-left: 0;
  }
`;

const BottomAddButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: ${theme.spacing.sm};
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(16, 185, 129, 0.08) 100%);
  border: 2px dashed rgba(16, 185, 129, 0.3);
  border-radius: 8px;
  color: #059669;
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  font-weight: ${theme.fontWeights.semibold};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-top: ${theme.spacing.xs};

  &:hover {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.15) 100%);
    border-color: rgba(16, 185, 129, 0.5);
    transform: translateY(-1px);
  }

  &:active {
    transform: scale(0.99);
  }

  svg {
    margin-right: 6px;
  }
`;
const EmptyState = styled.div`
  text-align: center;
  padding: ${theme.spacing.lg} ${theme.spacing.md};
  color: rgba(15, 23, 42, 0.5);
  font-family: ${theme.fonts.primary};
  border: ${theme.borders.dashedThin} rgba(15, 23, 42, 0.15);
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.01) 0%, rgba(15, 23, 42, 0.03) 100%);

  .empty-icon {
    font-size: 48px;
    margin-bottom: ${theme.spacing.md};
    opacity: 0.2;
  }

  .empty-title {
    font-size: ${theme.fontSizes.body};
    font-weight: ${theme.fontWeights.semibold};
    color: rgba(15, 23, 42, 0.7);
    margin-bottom: ${theme.spacing.xs};
  }

  .empty-description {
    font-size: ${theme.fontSizes.small};
    font-family: ${theme.fonts.mono};
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: rgba(15, 23, 42, 0.45);
  }
`;

// Sortable Track Item Component
const SortableTrackItem = ({
  track,
  index,
  disabled,
  onEdit,
  onQuote,
  onRemove,
  formatDuration,
  showLinkingStatus = false
}) => {
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: track.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleRemoveClick = () => {
    if (confirmingRemove) {
      onRemove(track.id);
      setConfirmingRemove(false);
    } else {
      setConfirmingRemove(true);
      setTimeout(() => setConfirmingRemove(false), 3000);
    }
  };

  // Detect errors/blockages
  const hasError = !track.title || !track.artist;
  const hasLinks = !!(track.apple_music_url || track.tidal_url || track.spotify_id);
  const statusState = hasError ? 'error' : (hasLinks ? 'linked' : 'pending');
  const statusText = hasError ? 'Missing info' : (hasLinks ? 'Linked' : 'Needs link');

  return (
    <TrackItem
      ref={setNodeRef}
      style={style}
      id={`track-${track.id}`}
      $highlight={track.id && String(track.id) === new URLSearchParams(window.location.search).get('highlightTrack')}
    >
      <TrackHeader>
        <DragHandle {...attributes} {...listeners}>
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
          </svg>
        </DragHandle>

        <PositionBadge>{track.position}</PositionBadge>

        <ArtworkThumb>
          {(track.artwork_url || track.album_artwork_url) ? (
            <img
              src={
                track.artwork_url
                  ? (track.artwork_url.startsWith('http') || track.artwork_url.startsWith('/uploads/') || track.artwork_url.startsWith('uploads/')
                      ? track.artwork_url.replace(/^uploads\//, '/uploads/')
                      : `/uploads/${track.artwork_url}`)
                  : track.album_artwork_url?.startsWith('http')
                    ? track.album_artwork_url
                    : (track.album_artwork_url.startsWith('/uploads/') || track.album_artwork_url.startsWith('uploads/')
                        ? track.album_artwork_url.replace(/^uploads\//, '/uploads/')
                        : `/uploads/${track.album_artwork_url}`)
              }
              alt={`${track.artist} - ${track.title}`}
              loading="lazy"
              crossOrigin="anonymous"
              onError={(e) => {
                console.log('[TrackList] Image load error:', {
                  track: track.title,
                  artwork_url: track.artwork_url,
                  album_artwork_url: track.album_artwork_url,
                  attempted_src: e.target.src
                });
                e.target.style.display = 'none';
                e.target.parentElement.innerHTML = `
                  <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.1)); color: rgba(0, 0, 0, 0.3);">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                  </div>
                `;
              }}
            />
          ) : (
            <ArtworkPlaceholder>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="2"></circle>
                <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"></path>
              </svg>
            </ArtworkPlaceholder>
          )}
        </ArtworkThumb>
      </TrackHeader>

      <TrackInfo>
        <div className="info-text">
          <div className="title">{track.title}</div>
          <div className="artist-row">{track.artist}</div>
          <div className="meta">
            {track.album && `${track.album}`}
            {track.album && track.year && ` • `}
            {track.year && `${track.year}`}
            {(track.album || track.year) && track.duration && ` • `}
            {track.duration && formatDuration(track.duration)}
          </div>
        </div>
        {track.quote && (
          <div
            className="quote-inline"
            onClick={() => onQuote(track)}
            title="Click to edit quote"
            style={{ cursor: 'pointer' }}
          >
            {String(track.quote).replace(/<[^>]*>/g, '')}
          </div>
        )}
      </TrackInfo>

      {showLinkingStatus && (
        <TrackStatus $hasError={hasError}>
          <LinkBadge $state={statusState}>
            <LinkDot $state={statusState} />
            {statusText}
          </LinkBadge>
        </TrackStatus>
      )}

      {showLinkingStatus && (
        <PlatformIconsRow $hasLinks={hasLinks}>
          {track.apple_music_url && (
            <PlatformIconWrapper $linked={true} title="Apple Music">
              <PlatformIcon platform="apple" size={14} />
            </PlatformIconWrapper>
          )}
          {track.tidal_url && (
            <PlatformIconWrapper $linked={true} title="TIDAL">
              <PlatformIcon platform="tidal" size={14} />
            </PlatformIconWrapper>
          )}
          {track.spotify_id && (
            <PlatformIconWrapper $linked={true} title="Spotify">
              <PlatformIcon platform="spotify" size={14} />
            </PlatformIconWrapper>
          )}
        </PlatformIconsRow>
      )}

      <TrackActions>
        <QuoteButton
          $hasQuote={!!track.quote}
          onClick={() => onQuote(track)}
          disabled={disabled}
          type="button"
          title="Add quote or note"
        >
          + Quote
        </QuoteButton>

        <PreviewButtonWrapper>
          <PreviewButton track={track} />
          <span className="preview-label">PREVIEW</span>
        </PreviewButtonWrapper>

        <ActionButton
          onClick={() => onEdit(track)}
          disabled={disabled}
          title="Edit track metadata"
          type="button"
        >
          <span className="desktop-text">Metadata</span>
          <span className="mobile-icon">⚙</span>
        </ActionButton>

        <ActionButton
          onClick={handleRemoveClick}
          disabled={disabled}
          $variant="danger"
          title={confirmingRemove ? "Click again to confirm" : "Remove track"}
          type="button"
          style={{
            background: confirmingRemove
              ? 'linear-gradient(135deg, rgba(229, 62, 62, 0.15) 0%, rgba(229, 62, 62, 0.2) 100%)'
              : undefined
          }}
        >
          <span className="desktop-text">{confirmingRemove ? 'Confirm?' : 'Remove'}</span>
          <span className="mobile-icon">{confirmingRemove ? '✓' : '×'}</span>
        </ActionButton>
      </TrackActions>
    </TrackItem>
  );
};

const ClearAllButton = styled.button.withConfig({ shouldForwardProp: (p) => !['$confirming'].includes(p) })`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  font-weight: ${theme.fontWeights.semibold};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: ${p => p.$confirming
    ? 'linear-gradient(135deg, rgba(229, 62, 62, 0.15) 0%, rgba(229, 62, 62, 0.2) 100%)'
    : 'linear-gradient(135deg, rgba(229, 62, 62, 0.06) 0%, rgba(229, 62, 62, 0.08) 100%)'};
  border: 1px solid ${p => p.$confirming
    ? 'rgba(229, 62, 62, 0.4)'
    : 'rgba(229, 62, 62, 0.2)'};
  border-radius: 6px;
  color: ${p => p.$confirming ? '#b91c1c' : '#dc2626'};
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;

  &:hover:not(:disabled) {
    background: linear-gradient(135deg, rgba(229, 62, 62, 0.12) 0%, rgba(229, 62, 62, 0.16) 100%);
    border-color: rgba(229, 62, 62, 0.35);
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  svg {
    width: 12px;
    height: 12px;
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    padding: 8px 12px;
    font-size: 9px;
  }
`;

const TrackListHeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${theme.spacing.sm};
  gap: ${theme.spacing.sm};

  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-wrap: wrap;
  }
`;

const TrackList = ({
  tracks = [],
  onChange,
  onReorderTracks = null,
  disabled = false,
  playlistId: _playlistId = null,
  onModalStateChange = null,
  showLinkingStatus = false,
  onClearAll = null,
}) => {
  const [editingTrack, setEditingTrack] = useState(null);
  const [quotingTrack, setQuotingTrack] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isAddRowExpanded, setIsAddRowExpanded] = useState(false);
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);
  const [isUrlResolverExpanded, setIsUrlResolverExpanded] = useState(false);
  const [draftTrack, setDraftTrack] = useState(null); // Holds track being created with metadata
  const [newTrack, setNewTrack] = useState({
    title: '',
    artist: '',
    album: '',
    year: ''
  });
  const [pastedUrl, setPastedUrl] = useState('');
  const [urlImporting, setUrlImporting] = useState(false);
  const [urlImportError, setUrlImportError] = useState('');

  // dnd-kit sensors with improved mobile touch support
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
        delay: 140,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end
  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      const oldIndex = tracks.findIndex((track) => track.id === active.id);
      const newIndex = tracks.findIndex((track) => track.id === over.id);

      const reorderedTracks = arrayMove(tracks, oldIndex, newIndex).map((track, index) => ({
        ...track,
        position: index + 1
      }));

      if (onReorderTracks) {
        onReorderTracks(reorderedTracks);
      } else {
        onChange(reorderedTracks);
      }
    }
  };

  const handleAddTrack = () => {
    if (!newTrack.title.trim() || !newTrack.artist.trim()) {
      return;
    }

    // Use draft track if available (user opened metadata), otherwise create basic track
    let track;
    if (draftTrack) {
      track = { ...draftTrack };
      // Replace draft ID with proper ID
      track.id = Date.now().toString();
    } else {
      track = {
        id: Date.now().toString(),
        position: tracks.length + 1,
        title: newTrack.title.trim(),
        artist: newTrack.artist.trim(),
        album: newTrack.album.trim(),
        year: newTrack.year ? parseInt(newTrack.year) : null,
        duration: null,
        spotify_id: null,
        apple_id: null,
        tidal_id: null,
        apple_music_url: null,
        tidal_url: null,
        bandcamp_url: null,
        soundcloud_url: null,
        custom_sources: []
      };
    }

    // Ensure position is correct
    track.position = tracks.length + 1;

    onChange([...tracks, track]);

    // Reset form
    setNewTrack({
      title: '',
      artist: '',
      album: '',
      year: ''
    });
    setPastedUrl('');
    setUrlImportError('');
    setDraftTrack(null);
    setIsAddRowExpanded(false);
    setIsUrlResolverExpanded(false);
  };

  const handleCancelForm = () => {
    setNewTrack({
      title: '',
      artist: '',
      album: '',
      year: ''
    });
    setPastedUrl('');
    setUrlImportError('');
    setDraftTrack(null);
    setIsAddRowExpanded(false);
    setIsUrlResolverExpanded(false);
  };

  const handleOpenMetadataModal = () => {
    if (!newTrack.title.trim() || !newTrack.artist.trim()) {
      return;
    }

    // Create or update draft track
    const track = draftTrack || {
      id: `draft-${Date.now()}`,
      position: tracks.length + 1,
      title: newTrack.title.trim(),
      artist: newTrack.artist.trim(),
      album: newTrack.album.trim(),
      year: newTrack.year ? parseInt(newTrack.year) : null,
      duration: null,
      spotify_id: null,
      apple_id: null,
      tidal_id: null,
      apple_music_url: null,
      tidal_url: null,
      bandcamp_url: null,
      soundcloud_url: null,
      custom_sources: []
    };

    // Update draft with current form values
    track.title = newTrack.title.trim();
    track.artist = newTrack.artist.trim();
    track.album = newTrack.album.trim();
    track.year = newTrack.year ? parseInt(newTrack.year) : null;

    setDraftTrack(track);
    setEditingTrack(track);
    if (onModalStateChange) onModalStateChange(true);
  };

  const handleImportFromUrl = async () => {
    const url = pastedUrl.trim();
    setUrlImportError('');
    if (!url) return;

    setUrlImporting(true);
    try {
      const resp = await fetch('/api/v1/url-import/resolve-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const json = await resp.json();
      if (!resp.ok || !json.success) {
        throw new Error(json.error || 'Failed to resolve track from URL');
      }

      const resolved = json.data || {};
      const nextDraft = {
        id: `draft-${Date.now()}`,
        position: tracks.length + 1,
        title: resolved.title || '',
        artist: resolved.artist || '',
        album: resolved.album || '',
        year: resolved.year || null,
        duration: resolved.duration || '',
        spotify_id: resolved.spotify_id || null,
        apple_id: resolved.apple_id || null,
        tidal_id: resolved.tidal_id || null,
        apple_music_url: resolved.apple_music_url || null,
        tidal_url: resolved.tidal_url || null,
        bandcamp_url: resolved.bandcamp_url || null,
        soundcloud_url: resolved.soundcloud_url || null,
        preview_url: resolved.preview_url || null,
        artwork_url: resolved.artwork_url || resolved.album_artwork_url || null,
        album_artwork_url: resolved.album_artwork_url || resolved.artwork_url || null,
        custom_sources: Array.isArray(resolved.custom_sources) ? resolved.custom_sources : []
      };

      const hasAutoAddMetadata = (() => {
        const title = (nextDraft.title || '').trim();
        const artist = (nextDraft.artist || '').trim();
        const album = (nextDraft.album || '').trim();
        const year = Number.parseInt(nextDraft.year, 10);
        const currentYear = new Date().getFullYear();
        const hasYear = Number.isFinite(year) && year >= 1900 && year <= currentYear;
        const hasArtwork = Boolean((nextDraft.artwork_url || '').trim());
        return Boolean(title && artist && album && hasYear && hasArtwork);
      })();

      if (hasAutoAddMetadata) {
        const year = Number.parseInt(nextDraft.year, 10);
        const trackToAdd = {
          ...nextDraft,
          id: Date.now().toString(),
          position: tracks.length + 1,
          title: (nextDraft.title || '').trim(),
          artist: (nextDraft.artist || '').trim(),
          album: (nextDraft.album || '').trim(),
          year: Number.isFinite(year) ? year : null
        };

        onChange([...tracks, trackToAdd]);

        setNewTrack({ title: '', artist: '', album: '', year: '' });
        setPastedUrl('');
        setUrlImportError('');
        setDraftTrack(null);
        setIsAddRowExpanded(false);
        setIsUrlResolverExpanded(false);
        return;
      }

      setNewTrack({
        title: nextDraft.title,
        artist: nextDraft.artist,
        album: nextDraft.album,
        year: nextDraft.year ? String(nextDraft.year) : ''
      });
      setDraftTrack(nextDraft);
      setIsAddRowExpanded(true);
      setIsUrlResolverExpanded(true);
      // Make the next step obvious: review/edit and hit Save in the metadata modal
      setEditingTrack(nextDraft);
      if (onModalStateChange) onModalStateChange(true);
    } catch (e) {
      setUrlImportError(e.message || 'Unable to import track from URL');
    } finally {
      setUrlImporting(false);
    }
  };

  const handleRemoveTrack = (trackId) => {
    const updatedTracks = tracks
      .filter(track => track.id !== trackId)
      .map((track, index) => ({ ...track, position: index + 1 }));
    onChange(updatedTracks);
  };

  const handleEditTrack = (track) => {
    setEditingTrack(track);
    if (onModalStateChange) onModalStateChange(true);
  };

  const handleUpdateTrack = (updatedTrack) => {
    // Check if this is a draft track (being created, not yet added to list)
    if (draftTrack && String(updatedTrack.id) === String(draftTrack.id)) {
      // Update draft track state, don't add to tracks list yet
      setDraftTrack(updatedTrack);

      // Also update the form fields to match
      setNewTrack({
        title: updatedTrack.title || '',
        artist: updatedTrack.artist || '',
        album: updatedTrack.album || '',
        year: updatedTrack.year || ''
      });
    } else {
      // Normal track update
      const updatedTracks = tracks.map(track =>
        String(track.id) === String(updatedTrack.id) ? { ...track, ...updatedTrack } : track
      );
      onChange(updatedTracks);
    }

    setEditingTrack(null);
    if (onModalStateChange) onModalStateChange(false);
  };

  const handleUpdateQuote = (updatedTrack) => {
    const updatedTracks = tracks.map(track =>
      String(track.id) === String(updatedTrack.id) ? { ...track, ...updatedTrack } : track
    );
    onChange(updatedTracks);
    setQuotingTrack(null);
    if (onModalStateChange) onModalStateChange(false);
  };

  const handleCloseEditor = () => {
    // Don't clear draft track when closing - preserve it for when user clicks [+]
    setEditingTrack(null);
    if (onModalStateChange) onModalStateChange(false);
  };

  const formatDuration = (duration) => {
    if (!duration) return '';

    // If it's already in MM:SS format, return as is
    if (typeof duration === 'string' && duration.includes(':')) return duration;

    // Convert to number and handle milliseconds vs seconds
    const numDuration = Number(duration);
    if (isNaN(numDuration)) return '';

    // If it's milliseconds (likely from Spotify API), convert to seconds
    const seconds = numDuration > 10000 ? Math.floor(numDuration / 1000) : numDuration;

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleClearAllClick = () => {
    if (confirmingClearAll) {
      if (onClearAll) {
        onClearAll();
      }
      setConfirmingClearAll(false);
    } else {
      setConfirmingClearAll(true);
      setTimeout(() => setConfirmingClearAll(false), 3000);
    }
  };

  return (
    
    <TrackListContainer $isCollapsed={isCollapsed}>
      {!isCollapsed && (
        <AddTrackRow $expanded={isAddRowExpanded}>
          {!isAddRowExpanded ? (
            <AddTrackButton
              onClick={() => setIsAddRowExpanded(true)}
              disabled={disabled}
              type="button"
              title="Add new track"
            >
              <span className="icon">+</span>
              <span className="label">Add Track</span>
              <span className="hint"></span>
            </AddTrackButton>
          ) : (
            <>
              <UrlImportRow>
                <InlineButton
                  type="button"
                  onClick={() => setIsUrlResolverExpanded((prev) => !prev)}
                  disabled={disabled}
                  title={isUrlResolverExpanded ? 'Hide URL importer' : 'Import track details from a URL'}
                  style={{ background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(15, 23, 42, 0.8) 100%)', color: '#fff' }}
                >
                  {isUrlResolverExpanded ? 'Hide Import' : 'Import from URL'}
                </InlineButton>
                {isUrlResolverExpanded && (
                  <>
                    <UrlInput
                      type="url"
                      placeholder="Paste a track URL (Spotify, Apple Music, TIDAL, Qobuz, SoundCloud, YouTube, Bandcamp)"
                      value={pastedUrl}
                      onChange={(e) => {
                        setPastedUrl(e.target.value);
                        if (urlImportError) setUrlImportError('');
                      }}
                      disabled={disabled || urlImporting}
                      aria-label="Paste track URL to import"
                    />
                    <InlineButton
                      onClick={handleImportFromUrl}
                      disabled={disabled || urlImporting || !pastedUrl.trim()}
                      title="Import metadata from this URL"
                      $variant="success"
                    >
                      {urlImporting ? 'Importing…' : 'Import'}
                    </InlineButton>
                    <UrlHint>Imports title/artist/album/year/artwork. Next: click Metadata → Save, then +.</UrlHint>
                    {urlImportError && <UrlError>{urlImportError}</UrlError>}
                  </>
                )}
              </UrlImportRow>
              <InlineInput
                type="text"
                placeholder="Title *"
                value={newTrack.title}
                onChange={(e) => setNewTrack({ ...newTrack, title: e.target.value })}
                disabled={disabled}
                autoFocus
              />
              <InlineInput
                type="text"
                placeholder="Artist *"
                value={newTrack.artist}
                onChange={(e) => setNewTrack({ ...newTrack, artist: e.target.value })}
                disabled={disabled}
              />
              <InlineInput
                type="text"
                placeholder="Album"
                value={newTrack.album}
                onChange={(e) => setNewTrack({ ...newTrack, album: e.target.value })}
                disabled={disabled}
              />
              <InlineInput
                type="number"
                placeholder="Year"
                value={newTrack.year}
                onChange={(e) => setNewTrack({ ...newTrack, year: e.target.value })}
                disabled={disabled}
                min="1900"
                max={new Date().getFullYear()}
                style={{ maxWidth: '100px' }}
              />
              <InlineButtonGroup>
                <InlineButton
                  onClick={handleOpenMetadataModal}
                  disabled={disabled || !newTrack.title.trim() || !newTrack.artist.trim()}
                  type="button"
                  title="Edit metadata (quotes, links, duration, etc.)"
                >
                  Metadata
                </InlineButton>
                <InlineButton
                  onClick={handleAddTrack}
                  disabled={disabled || !newTrack.title.trim() || !newTrack.artist.trim()}
                  $variant="success"
                  type="button"
                  title="Add track to playlist"
                >
                  +
                </InlineButton>
                <InlineButton
                  onClick={handleCancelForm}
                  $variant="danger"
                  type="button"
                  title="Cancel and close"
                >
                  ×
                </InlineButton>
              </InlineButtonGroup>
            </>
          )}
        </AddTrackRow>
      )}

      {!isCollapsed && tracks.length > 0 && onClearAll && (
        <TrackListHeaderRow>
          <TrackCount>{tracks.length} track{tracks.length !== 1 ? 's' : ''}</TrackCount>
          <ClearAllButton
            onClick={handleClearAllClick}
            disabled={disabled}
            $confirming={confirmingClearAll}
            type="button"
            title={confirmingClearAll ? "Click again to confirm clearing all tracks" : "Clear all tracks"}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            {confirmingClearAll ? 'Confirm Clear?' : 'Clear All'}
          </ClearAllButton>
        </TrackListHeaderRow>
      )}

      {!isCollapsed && (tracks.length === 0 ? (
        <EmptyState>
          <div className="empty-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 6v6l4 2"></path>
            </svg>
          </div>
          <div className="empty-title">No tracks added yet</div>
          <div className="empty-description">Add tracks manually or use import tools above</div>
        </EmptyState>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={tracks.map(track => track.id)}
            strategy={verticalListSortingStrategy}
          >
            <TrackGrid>
              {tracks.map((track, index) => (
                <SortableTrackItem
                  key={track.id}
                  track={track}
                  index={index}
                  disabled={disabled}
                  onEdit={handleEditTrack}
                  onQuote={(track) => {
                    setQuotingTrack(track);
                    if (onModalStateChange) onModalStateChange(true);
                  }}
                  onRemove={handleRemoveTrack}
                  formatDuration={formatDuration}
                  showLinkingStatus={showLinkingStatus}
                />
              ))}
            </TrackGrid>
          </SortableContext>
        </DndContext>
      ))}

      {!isCollapsed && tracks.length > 0 && (
        <BottomAddButton
          onClick={() => {
            setIsAddRowExpanded(true);
            setTimeout(() => {
              document.querySelector('input[placeholder="Title *"]')?.focus();
            }, 100);
          }}
          disabled={disabled}
          type="button"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Add Track
        </BottomAddButton>
      )}

      {/* Track Metadata Editor Modal */}
      {editingTrack && (
        <TrackMetadataEditor
          track={editingTrack}
          onUpdate={handleUpdateTrack}
          onClose={handleCloseEditor}
        />
      )}
      {quotingTrack && (
        <TrackQuoteEditor
          track={quotingTrack}
          onUpdate={handleUpdateQuote}
          onClose={() => {
            setQuotingTrack(null);
            if (onModalStateChange) onModalStateChange(false);
          }}
        />
      )}
    </TrackListContainer>
  );
};

export default TrackList;
