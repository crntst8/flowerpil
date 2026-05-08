import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import styled from 'styled-components';
import { Container, Button, theme, mediaQuery } from '@shared/styles/GlobalStyles';
import { Section, SectionHeader } from '@shared/components/Blocks.jsx';
import { useAuth } from '@shared/contexts/AuthContext';
import { useSiteSettings } from '@shared/contexts/SiteSettingsContext';
import PlatformIcon from '@shared/components/PlatformIcon';
import PlaylistForm from '../../admin/components/PlaylistForm.jsx';
import TrackList from '../../admin/components/TrackList.jsx';
import ImageUpload from '../../admin/components/ImageUpload.jsx';
import PlaylistExportModal from '../../admin/components/PlaylistExportModal.jsx';
import { savePlaylist, publishPlaylist } from '../../admin/services/adminService.js';
import { safeJson } from '@shared/utils/jsonUtils';
import { cacheService } from '@shared/services/cacheService.js';
import ImportModal from './ImportModal.jsx';
import siteAnalytics from '@shared/utils/siteAnalytics';
import ImportProgressOverlay from './ImportProgressOverlay.jsx';
import LibraryImportSection from './LibraryImportSection.jsx';
import { canSyncInPlace, getExportActionLabel, hasSyncableSelection } from '@shared/utils/exportHelpers';

const INITIAL_IMPORT_STATE = {
  phase: 'idle',
  platform: null,
  progress: 0,
  message: '',
  selectionId: null,
  error: null
};

const SESSION_KEY = 'curator-playlist-create';
const PROFILE_CACHE_KEY = `${SESSION_KEY}-profile-loaded`;
const EXPORT_INTENT_KEY = `${SESSION_KEY}-export-intent`;
const CURATOR_DASHBOARD_HOME = '/curator-admin?tab=home';

const PageContainer = styled(Container)`
  max-width: 1600px;
  margin: 0 auto;
  padding: ${theme.spacing.xs} ${theme.spacing.xs} 100px;
  background: ${theme.colors.fpwhite};
  min-height: 100vh;

  ${mediaQuery.tablet} {
    padding: ${theme.spacing.xs} ${theme.spacing.xs} 100px;
  }

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.xs} ${theme.spacing.xs} 160px;
    max-width: 100vw;
    width: 100vw;
    margin: 0;
    overflow-x: hidden;
    box-sizing: border-box;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
  }
`;
const PageHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background: ${theme.colors.black};
  border: ${theme.borders.solid} ${theme.colors.black};

  h1 {
    margin: 0;
    font-family: ${theme.fonts.primary};
    color: ${theme.colors.fpwhite};
    font-weight: ${theme.fontWeights.bold};
    letter-spacing: -0.6px;
    font-size: 24px;
  }

  ${mediaQuery.mobile} {
    flex-direction: column;
    align-items: flex-start;
    padding: ${theme.spacing.sm};
    margin-bottom: ${theme.spacing.xs};
    gap: ${theme.spacing.sm};

    h1 {
      font-size: ${theme.fontSizes.h3};
    }
  }
`;

const PageTitleBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const PageSubtitle = styled.p`
  margin: 0;
  color: rgba(255, 255, 255, 0.84);
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  line-height: 1.5;
`;

const HeaderMetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
  
`;

const HeaderBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${theme.colors.fpwhite};
`;


const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;

  ${mediaQuery.mobile} {
    width: 100%;

    button {
      flex: 1;
      min-width: 140px;
      justify-content: center;
      text-align: center;
    }
  }
`;

const SidebarToggleButton = styled(Button)`
  display: none;

  ${mediaQuery.tablet} {
    display: inline-flex;
  }
`;

const EditorLayout = styled.div`
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: ${theme.spacing.md};
  align-items: start;

  @media (min-width: 1440px) {
    grid-template-columns: 300px 1fr;
    gap: ${theme.spacing.lg};
  }

  ${mediaQuery.tablet} {
    grid-template-columns: 1fr;
  }
`;

const SidebarOverlay = styled.div.withConfig({ shouldForwardProp: (p) => !['$open'].includes(p) })`
  display: none;

  ${mediaQuery.tablet} {
    display: ${p => (p.$open ? 'block' : 'none')};
    position: fixed;
    inset: 0;
    background: rgba(179, 179, 179, 0.25);
    backdrop-filter: blur(2px);
    z-index: 1000;
  }
`;

const Sidebar = styled.aside.withConfig({ shouldForwardProp: (p) => !['$open'].includes(p) })`
  position: sticky;
  top: ${theme.spacing.md};
  align-self: flex-start;
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.black};
  padding: ${theme.spacing.md};
  max-height: calc(100vh - ${theme.spacing.md} - ${theme.spacing.md});
  overflow: hidden;

  ${mediaQuery.tablet} {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    transform: translateX(${p => (p.$open ? '0' : '-110%')});
    transition: transform ${theme.transitions.normal};
    max-height: none;
    width: min(85vw, 340px);
    z-index: 1001;
    padding: ${theme.spacing.lg};
    box-shadow: 4px 0 0 ${theme.colors.black};
  }
`;

const SidebarHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const SidebarTitle = styled.h2`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  font-weight: ${theme.fontWeights.bold};
  letter-spacing: -0.5px;
  color: ${theme.colors.black};
`;

const SidebarCloseButton = styled.button`
  display: none;

  ${mediaQuery.tablet} {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: flex-end;
    background: transparent;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: ${theme.colors.black};
    padding: ${theme.spacing.xs};
  }
`;

const SidebarTabList = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  padding-right: ${theme.spacing.xs};
`;

const SidebarTab = styled.button.withConfig({ shouldForwardProp: (p) => !['$active'].includes(p) })`
  position: relative;
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border: 1px solid ${p => (p.$active ? 'rgba(49, 130, 206, 0.25)' : 'rgba(15, 23, 42, 0.06)')};
  background: ${p => (p.$active ? 'rgba(49, 130, 206, 0.08)' : '#ffffff')};
  cursor: pointer;
  text-align: left;
  color: #0f172a;
  transition: all ${theme.transitions.fast};
  min-height: 48px;

  &:hover {
    border-color: rgba(15, 23, 42, 0.12);
    background: ${p => (p.$active ? 'rgba(49, 130, 206, 0.12)' : '#ffffff')};
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
  }

  &:active {
    transform: translateY(0);
  }

  &:focus-visible {
    outline: 2px solid ${theme.colors.primary};
    outline-offset: 2px;
  }

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    height: 60%;
    width: 3px;
    border-radius: 0 999px 999px 0;
    background: ${theme.colors.primary};
    opacity: ${p => (p.$active ? 1 : 0)};
    transition: opacity ${theme.transitions.fast};
  }
`;

const SidebarStepBadge = styled.span.withConfig({ shouldForwardProp: (prop) => !['$active'].includes(prop) })`
  width: 28px;
  height: 28px;
  border: 1px solid ${theme.colors.black};
  background: ${({ $active }) => ($active ? theme.colors.black : theme.colors.fpwhite)};
  color: ${({ $active }) => ($active ? theme.colors.fpwhite : theme.colors.black)};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  font-weight: ${theme.fontWeights.bold};
  flex-shrink: 0;
`;

const SidebarTabText = styled.span`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  min-width: 0;
`;

const SidebarTabLabel = styled.span`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  font-weight: ${theme.fontWeights.semibold};
  letter-spacing: -0.3px;
  color: #0f172a;
`;

const SidebarTabDescription = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(15, 23, 42, 0.65);
  line-height: 1.4;
`;

const SidebarContextCard = styled.div`
  border: ${theme.borders.solidThin} ${theme.colors.black};
  background: rgba(0, 0, 0, 0.03);
  padding: ${theme.spacing.sm};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const SidebarContextTitle = styled.p`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  font-weight: ${theme.fontWeights.semibold};
  line-height: 1.4;
`;

const SidebarContextMeta = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.8;
`;

const SidebarFooter = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  padding-top: ${theme.spacing.md};
  border-top: 1px solid rgba(15, 23, 42, 0.08);
`;

const EditorContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  max-width: 100%;

  ${mediaQuery.mobile} {
    gap: ${theme.spacing.xs};
    width: 100%;
    overflow-x: hidden;
  }
`;

const ContentShell = styled.div`
  display: flex;
  flex-direction: column;
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.black};
  padding: ${theme.spacing.sm};
  gap: ${theme.spacing.xs};

  ${mediaQuery.tablet} {
    padding: ${theme.spacing.sm};
    gap: ${theme.spacing.xs};
  }

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.xs};
    gap: ${theme.spacing.xs};
    max-width: 100%;
    overflow-x: hidden;
    box-sizing: border-box;
  }
`;

const SectionCard = styled(Section)`
  background: #ffffff;
  border: ${theme.borders.solid} ${theme.colors.black};
  padding: 0;
  overflow: hidden;
  transition: transform ${theme.transitions.fast};

  ${SectionHeader} {
    border-bottom: ${theme.borders.solidThin} rgba(15, 23, 42, 0.16);
    padding: ${theme.spacing.md} ${theme.spacing.lg};
    margin: 0;
    display: flex;

    align-items: center;
    gap: ${theme.spacing.sm};
    background: ${theme.colors.fpwhite};

    .title {
      font-family: ${theme.fonts.primary};
      font-size: ${theme.fontSizes.md};
      color: rgba(15, 23, 42, 0.8);
      margin: 0;
      text-transform: uppercase;
      padding: 2px;
      letter-spacing: 0.08em;
    }
    .subtitle {
      font-family: ${theme.fonts.primary};
      font-size: ${theme.fontSizes.md};
      color: white;
      margin: 0;
      text-transform: uppercase;
      padding: 12px;
      letter-spacing: 0.08em;
    }
  }

  > *:not(${SectionHeader}) {
    padding: ${theme.spacing.sm};
  }

  ${mediaQuery.tablet} {
    ${SectionHeader} {
      padding: ${theme.spacing.md};
    }

    > *:not(${SectionHeader}) {
      padding: ${theme.spacing.sm};
    }
  }

  ${mediaQuery.mobile} {
    max-width: 100%;
    overflow-x: hidden;
    box-sizing: border-box;

    ${SectionHeader} {
      padding: ${theme.spacing.sm} ${theme.spacing.md};
      flex-wrap: nowrap;
      overflow: visible;

      .title {
        font-size: ${theme.fontSizes.small};
        flex: 1;
        min-width: 0;
      }
    }

    > *:not(${SectionHeader}) {
      padding: ${theme.spacing.sm};
      max-width: 100%;
      box-sizing: border-box;
    }
  }
`;

const SaveActionBar = styled.div`
  position: sticky;
  bottom: 0;
  left: 0;
  right: 0;
  background: ${theme.colors.fpwhite};
  border-top: ${theme.borders.solid} ${theme.colors.black};
  padding: ${theme.spacing.sm};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  z-index: 20;
`;

const MobileWorkspaceSlider = styled.div`
  display: none;

  ${mediaQuery.mobile} {
    display: flex;
    align-items: center;
    gap: ${theme.spacing.xs};
    overflow-x: auto;
    padding: ${theme.spacing.xs} 0;
    margin: 0 -${theme.spacing.xs};
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    scroll-snap-type: x mandatory;

    &::-webkit-scrollbar {
      display: none;
    }
  }
`;

const MobileWorkspaceChip = styled.button.withConfig({ shouldForwardProp: (p) => !['$active'].includes(p) })`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${theme.spacing.xs};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: 12px;
  border: 1px solid ${p => (p.$active ? theme.colors.primary : 'rgba(15, 23, 42, 0.12)')};
  background: ${p => (p.$active
    ? 'linear-gradient(135deg, rgba(49, 130, 206, 0.12), rgba(66, 153, 225, 0.08))'
    : '#ffffff')};
  color: #0f172a;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  font-weight: ${theme.fontWeights.semibold};
  letter-spacing: -0.2px;
  box-shadow: ${p => (p.$active ? '0 8px 20px rgba(49, 130, 206, 0.18)' : '0 4px 10px rgba(15, 23, 42, 0.06)')};
  cursor: pointer;
  flex-shrink: 0;
  scroll-snap-align: start;
  transition: all ${theme.transitions.fast};
  white-space: nowrap;

  &:active {
    transform: scale(0.98);
  }
`;

const MobileWorkspaceIcon = styled.span`
  font-size: 14px;
  line-height: 1;
`;

const SaveActionBarButtons = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: ${theme.spacing.xs};
  width: 100%;

  button {
    width: 100%;
    min-width: 0;
    font-weight: ${theme.fontWeights.semibold};
  }
`;

const TrackNextStepRow = styled.div`
  padding: ${theme.spacing.md} ${theme.spacing.sm} ${theme.spacing.sm};
`;

const TrackNextStepButton = styled(Button)`
  width: 100%;
  min-height: 56px;
  font-weight: ${theme.fontWeights.bold};
  letter-spacing: 0.02em;
`;

const SaveActionBarStatus = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  font-weight: ${theme.fontWeights.medium};
  padding: ${theme.spacing.md};
  border-radius: 12px;
  background: ${props => props.$variant === 'error'
    ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(220, 38, 38, 0.06))'
    : 'linear-gradient(135deg, rgba(34, 197, 94, 0.08), rgba(22, 163, 74, 0.06))'};
  border: 1px solid ${props => props.$variant === 'error'
    ? 'rgba(239, 68, 68, 0.2)'
    : 'rgba(34, 197, 94, 0.2)'};
  min-height: 40px;
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};

  p {
    margin: 0;
    line-height: 1.5;
    color: ${props => props.$variant === 'error' ? '#991b1b' : '#166534'};
  }

  &::before {
    content: '';
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: ${props => props.$variant === 'error'
      ? '#ef4444'
      : '#22c55e'};
    box-shadow: 0 0 0 3px ${props => props.$variant === 'error'
      ? 'rgba(239, 68, 68, 0.15)'
      : 'rgba(34, 197, 94, 0.15)'};
  }

  ${mediaQuery.mobile} {
    font-size: ${theme.fontSizes.small};
    padding: ${theme.spacing.sm} ${theme.spacing.md};
  }
`;

const DesktopStatusBanner = styled(SaveActionBarStatus)`
  display: flex;
  position: sticky;
  top: ${theme.spacing.sm};
  z-index: 5;
  ${mediaQuery.mobile} {
    display: none;
  }
`;

const Panel = styled.div`
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 0px;
  background: linear-gradient(160deg, #ffffff 0%, #f8fafc 100%);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.1);
  overflow: hidden;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.md} ${theme.spacing.lg};
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
  background: linear-gradient(90deg, rgba(45, 23, 42, 0.7), rgba(35, 23, 22, 0.9));

  ${mediaQuery.mobile} {
    flex-direction: column;
    align-items: flex-start;
    padding: ${theme.spacing.md};
  }
`;

const PanelTitleBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;

  h3 {
    margin: 0;
    font-family: ${theme.fonts.primary};
    letter-spacing: -0.3px;
    color: ${theme.colors.white};
  }

  p {
    margin: 0;
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.tiny};
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: white;
  }
`;

const PanelToggle = styled(Button)`
  min-width: 140px;
`;

const PanelBody = styled.div`
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.lg};

  ${mediaQuery.tablet} {
    grid-template-columns: 1fr;
    padding: ${theme.spacing.md};
  }

  ${mediaQuery.mobile} {
    padding: ${theme.spacing.md} ${theme.spacing.sm} ${theme.spacing.sm};
  }
`;

const ImportTabs = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  border-bottom: 1px solid rgba(15, 23, 42, 0.1);
  margin-bottom: ${theme.spacing.md};
`;

const ImportTab = styled.button.withConfig({ shouldForwardProp: (p) => !['$active'].includes(p) })`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background: transparent;
  border: none;
  border-bottom: 2px solid ${p => p.$active ? theme.colors.primary : 'transparent'};
  color: ${p => p.$active ? theme.colors.primary : 'rgba(15, 23, 42, 0.6)'};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  font-weight: ${p => p.$active ? theme.fontWeights.bold : theme.fontWeights.medium};
  cursor: pointer;
  transition: all ${theme.transitions.fast};
  margin-bottom: -1px;

  &:hover {
    color: ${theme.colors.primary};
  }
`;

const ImportTabContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const ImportToolsShell = styled.div`
  position: relative;
`;

const ImportToolsLayer = styled.div.withConfig({
  shouldForwardProp: (prop) => !['$hidden'].includes(prop),
})`
  visibility: ${({ $hidden }) => ($hidden ? 'hidden' : 'visible')};
`;

const ImportToolsOverlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${theme.spacing.md};
  background: rgba(15, 23, 42, 0.08);
`;

const LinkingStatusBar = styled.div`
  margin-top: ${theme.spacing.md};
  padding-top: ${theme.spacing.md};
  border-top: 1px solid rgba(15, 23, 42, 0.1);
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const LinkingStatusRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
`;

const LinkingStatusText = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(15, 23, 42, 0.75);
  flex: 1;
`;

const LinkingStats = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
`;

const InlineCard = styled.div`
  border: 1px dashed rgba(15, 23, 42, 0.12);
  border-radius: 12px;
  padding: ${theme.spacing.md};
  background: #ffffff;
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const InlineCardTitle = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  font-family: ${theme.fonts.primary};
  font-weight: ${theme.fontWeights.bold};
  letter-spacing: -0.2px;
  color: #0f172a;
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 160px;
  border-radius: 5px;
  border: 1px solid rgba(15, 23, 42, 0.14);
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  resize: vertical;
  background: #f8fafc;
  color: #0f172a;

  &:focus {
    outline: 2px solid ${theme.colors.primary};
    outline-offset: 2px;
    background: #ffffff;
  }
`;

const ActionRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
`;

const ProgressBar = styled.div.withConfig({ shouldForwardProp: (p) => !['$percent'].includes(p) })`
  width: 100%;
  height: 10px;
  background: rgba(15, 23, 42, 0.06);
  border-radius: 999px;
  overflow: hidden;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: ${p => Math.min(Math.max(p.$percent || 0, 0), 100)}%;
    background: linear-gradient(90deg, ${theme.colors.primary} 0%, #60a5fa 100%);
    transition: width ${theme.transitions.normal};
  }
`;

const StatusRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(15, 23, 42, 0.75);
`;

const StatusDot = styled.span.withConfig({ shouldForwardProp: (p) => !['$variant'].includes(p) })`
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: ${p => {
    if (p.$variant === 'error') return '#ef4444';
    if (p.$variant === 'success') return '#22c55e';
    if (p.$variant === 'active') return theme.colors.primary;
    return 'rgba(15, 23, 42, 0.4)';
  }};
  box-shadow: 0 0 0 4px rgba(15, 23, 42, 0.06);
`;

const LinkStatPill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(15, 23, 42, 0.04);
  border: 1px solid rgba(15, 23, 42, 0.1);
  padding: 6px 10px;
  border-radius: 999px;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  color: #0f172a;
`;

const IconBubble = styled.span`
  width: 20px;
  height: 20px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.08);
  font-size: 12px;
`;

const ProgressShell = styled.div`
  display: grid;
  gap: ${theme.spacing.xs};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(49, 130, 206, 0.08), rgba(15, 23, 42, 0.05));
  border: 1px solid rgba(15, 23, 42, 0.08);
`;

const PublishGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: ${theme.spacing.sm};
`;

const PublishCard = styled.div.withConfig({ shouldForwardProp: (p) => !['$accent'].includes(p) })`
  border: 1px solid ${p => (p.$accent ? 'rgba(49, 130, 206, 0.25)' : 'rgba(15, 23, 42, 0.08)')};
  border-radius: 16px;
  padding: ${theme.spacing.md};
  background: ${p => (p.$accent
    ? 'linear-gradient(145deg, rgba(49, 130, 206, 0.08), rgba(15, 23, 42, 0.03))'
    : 'linear-gradient(145deg, #ffffff, rgba(248, 250, 252, 0.7))')};
  box-shadow: ${p => (p.$accent ? '0 14px 40px rgba(49, 130, 206, 0.18)' : '0 10px 32px rgba(15, 23, 42, 0.08)')};
  display: grid;
  gap: ${theme.spacing.sm};
`;

const PublishCardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;

  h3 {
    margin: 0;
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.md};
    letter-spacing: -0.3px;
    color: #0f172a;
  }
`;

const SectionHeader1 = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
      background: black;
      padding: 1em;


  .title {
    margin: 0;
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.h3};
    letter-spacing: -0.5px;
    background: black;
    text-transform: Capitalize;
    color: ${theme.colors.white};
  }


`;
const SectionHeader2 = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
      background: #2E2F31;
      padding: 0.5em;


  .title {
    margin: 0;
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.body};
    letter-spacing: -0.5px;
    text-transform: Capitalize;
    color: ${theme.colors.white};
  }


`;

const CollapsibleSectionHeader = styled(SectionHeader2).withConfig({
  shouldForwardProp: (prop) => !['$isOpen'].includes(prop),
})`
  cursor: pointer;
  user-select: none;
  transition: all ${theme.transitions.fast};
  border: 1px solid ${({ $isOpen }) => $isOpen ? '#4A4B4D' : '#3A3B3D'};
  border-radius: 4px;
  background: ${({ $isOpen }) => $isOpen ? '#2E2F31' : '#2A2B2D'};
  position: relative;

  
  &:hover {
    background: ${({ $isOpen }) => $isOpen ? '#3A3B3D' : '#353637'};
    border-color: ${({ $isOpen }) => $isOpen ? '#5A5B5D' : '#4A4B4D'};
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
  
  &:active {
    transform: scale(0.98);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  }
  
  &:focus {
    outline: 2px solid ${theme.colors.primary || '#007AFF'};
    outline-offset: 2px;
  }
  
  .title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    font-weight: 500;
    padding: 1em;
    background: #616366;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.61);
        border: 1px solid #f9fbff;

  }
`;

const ToggleIcon = styled.span.withConfig({
  shouldForwardProp: (prop) => !['$isOpen'].includes(prop),
})`
  font-size: 14px;
  transition: all ${theme.transitions.fast};
  transform: rotate(${({ $isOpen }) => $isOpen ? '180deg' : '0deg'});
  opacity: ${({ $isOpen }) => $isOpen ? '1' : '0.7'};
  margin-left: ${theme.spacing.sm};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 3px;
  background: ${({ $isOpen }) => $isOpen ? 'rgba(255, 255, 255, 0.1)' : 'transparent'};
  
  &:hover {
    background: rgba(255, 255, 255, 0.15);
    opacity: 1;
  }
`;

const CollapsibleContent = styled.div.withConfig({
  shouldForwardProp: (prop) => !['$isOpen'].includes(prop),
})`
  max-height: ${({ $isOpen }) => $isOpen ? '2000px' : '0'};
  overflow: hidden;
  transition: max-height ${theme.transitions.normal} ease-in-out;
  opacity: ${({ $isOpen }) => $isOpen ? '1' : '0'};
  transition: 
    max-height ${theme.transitions.normal} ease-in-out,
    opacity ${theme.transitions.fast} ease-in-out;
`;
const AccentPill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(49, 130, 206, 0.12);
  border: 1px solid rgba(49, 130, 206, 0.2);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #0f172a;
`;

const PublishCardBody = styled.div`
  display: grid;
  gap: ${theme.spacing.xs};
`;

const PublishOptions = styled.div`
  display: grid;
  gap: ${theme.spacing.xs};
`;

const PublishOption = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${theme.spacing.xs};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  color: rgba(15, 23, 42, 0.75);

  &::before {
    content: '•';
    color: ${theme.colors.primary};
    margin-top: 2px;
  }
`;

const PublishMeta = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
`;

const PublishCardFooter = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
  align-items: center;
`;

const Pill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.05);
  border: 1px solid rgba(15, 23, 42, 0.08);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #0f172a;
`;

const WorkspaceTabs = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  border-bottom: 1px solid rgba(15, 23, 42, 0.1);
  margin-bottom: ${theme.spacing.md};
  padding-bottom: ${theme.spacing.xs};
`;

const WorkspaceTab = styled.button.withConfig({ shouldForwardProp: (p) => !['$active'].includes(p) })`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border: none;
  border-bottom: 2px solid ${p => (p.$active ? theme.colors.primary : 'transparent')};
  background: transparent;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  font-weight: ${p => (p.$active ? theme.fontWeights.semibold : theme.fontWeights.medium)};
  color: ${p => (p.$active ? theme.colors.primary : 'rgba(15, 23, 42, 0.7)')};
  cursor: pointer;
  transition: all ${theme.transitions.fast};

  &:hover {
    color: ${theme.colors.primary};
  }
`;

const WorkspaceTabPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const ExportCard = styled(PublishCard)`
  border-color: ${p => (p.$accent ? 'rgba(37, 99, 235, 0.3)' : 'rgba(15, 23, 42, 0.08)')};
  background: ${p => (p.$accent
    ? 'linear-gradient(145deg, rgba(37, 99, 235, 0.1), rgba(15, 23, 42, 0.03))'
    : 'linear-gradient(145deg, #ffffff, rgba(248, 250, 252, 0.7))')};
`;

const ExportOptions = styled.div`
  display: grid;
  gap: ${theme.spacing.sm};
`;

const ExportOptionHeader = styled.div`
  font-weight: ${theme.fontWeights.bold};
  color: #0f172a;
  font-size: ${theme.fontSizes.md};
`;

const ExportOptionSubheader = styled.div`
  color: rgba(15, 23, 42, 0.7);
  font-size: ${theme.fontSizes.small};
  line-height: 1.5;
`;

const ExportOption = styled.button.withConfig({ shouldForwardProp: (p) => !['$checked'].includes(p) })`
  display: flex;
  align-items: flex-start;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.md};
  border-radius: 10px;
  border: 1px solid ${p => (p.$checked ? theme.colors.primary : 'rgba(15, 23, 42, 0.08)')};
  background: ${p => (p.$checked ? 'rgba(37, 99, 235, 0.05)' : '#ffffff')};
  cursor: pointer;
  transition: all ${theme.transitions.fast};
  text-align: left;
  width: 100%;

  &:hover {
    border-color: ${theme.colors.primary};
    background: ${p => (p.$checked ? 'rgba(37, 99, 235, 0.08)' : 'rgba(37, 99, 235, 0.03)')};
  }

  &:focus-visible {
    outline: 2px solid ${theme.colors.primary};
    outline-offset: 2px;
  }

  input[type="radio"] {
    margin-top: 2px;
    cursor: pointer;
    pointer-events: none;
  }

  label {
    flex: 1;
    cursor: pointer;
    pointer-events: none;
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.md};
    color: #0f172a;
    line-height: 1.5;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
`;

const PlatformDestinationCard = styled.button.withConfig({ shouldForwardProp: (p) => !['$selected', '$disabled', '$ready'].includes(p) })`
  position: relative;
  padding: ${theme.spacing.md};
  border: 1px solid ${p => 
    p.$disabled ? 'rgba(15, 23, 42, 0.1)' :
    p.$selected ? theme.colors.primary : 'rgba(15, 23, 42, 0.16)'
  };
  border-radius: 14px;
  background: ${p =>
    p.$disabled ? 'linear-gradient(135deg, #f2f2f2 0%, #e8e8e8 100%)' :
    p.$selected ? 'linear-gradient(145deg, #fefefe 0%, #e9f6ff 100%)' : 'linear-gradient(145deg, #ffffff 0%, #f4f4f4 100%)'
  };
  cursor: ${p => p.$disabled ? 'not-allowed' : 'pointer'};
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  text-align: left;
  opacity: ${p => p.$disabled ? 0.72 : 1};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.65);
  color: ${theme.colors.black};
  font-family: ${theme.fonts.primary};

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    border-color: ${theme.colors.primary};
    box-shadow: 0 14px 28px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.75);
  }

  &:focus-visible {
    outline: 2px solid ${theme.colors.primary};
    outline-offset: 2px;
  }
`;

const DestinationCardTop = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
`;

const DestinationCardIcon = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: ${theme.spacing.xs};
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.04);
`;

const DestinationCardHeader = styled.div`
  display: grid;
  gap: 6px;
  flex: 1;
`;

const DestinationCardLabel = styled.div`
  font-size: ${theme.fontSizes.md};
  font-weight: ${theme.fontWeights.bold};
  color: #0f172a;
`;

const DestinationCardTag = styled.span.withConfig({ shouldForwardProp: (p) => !['$muted', '$ready'].includes(p) })`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid ${theme.colors.black};
  background: ${p => (p.$muted ? 'rgba(15, 23, 42, 0.04)' : p.$ready ? '#22c55e' : theme.colors.black)};
  color: ${p => (p.$muted ? theme.colors.black : p.$ready ? '#ffffff' : theme.colors.fpwhite)};
`;

const DestinationCardBody = styled.div`
  display: grid;
  gap: ${theme.spacing.xs};
  color: rgba(15, 23, 42, 0.75);
  font-size: ${theme.fontSizes.small};
  line-height: 1.5;
`;

const DestinationCardCopy = styled.div`
  color: rgba(15, 23, 42, 0.75);
  font-size: ${theme.fontSizes.small};
  line-height: 1.6;
`;

const AccountNote = styled.div.withConfig({ shouldForwardProp: (p) => !['$connected'].includes(p) })`
  margin-top: 4px;
  font-size: ${theme.fontSizes.small};
  color: ${p => (p.$connected ? 'rgba(15, 23, 42, 0.8)' : 'rgba(15, 23, 42, 0.6)')};
  font-weight: ${theme.fontWeights.semibold};
  display: inline-flex;
  gap: 6px;
  align-items: center;
`;

const ApiLimitNote = styled.div`
  margin-top: 6px;
  font-size: ${theme.fontSizes.tiny};
  color: rgba(15, 23, 42, 0.5);
  font-style: italic;
  line-height: 1.4;
`;

const ValidationStatus = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border-radius: 8px;
  background: ${p => {
    if (p.$coverage >= 0.8) return 'rgba(34, 197, 94, 0.1)';
    if (p.$coverage >= 0.5) return 'rgba(251, 191, 36, 0.1)';
    return 'rgba(239, 68, 68, 0.1)';
  }};
  font-size: ${theme.fontSizes.tiny};
  font-family: ${theme.fonts.mono};
  color: rgba(15, 23, 42, 0.8);
`;

const AccountTypeSelector = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  margin-top: ${theme.spacing.xs};
  padding-top: ${theme.spacing.xs};
  border-top: 1px solid rgba(15, 23, 42, 0.08);
`;

const AccountTypeButton = styled.button.withConfig({ shouldForwardProp: (p) => !['$active'].includes(p) })`
  flex: 1;
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border: 1px solid ${p => (p.$active ? theme.colors.primary : 'rgba(15, 23, 42, 0.16)')};
  background: ${p => (p.$active ? 'rgba(37, 99, 235, 0.1)' : '#ffffff')};
  color: ${p => (p.$active ? theme.colors.primary : 'rgba(15, 23, 42, 0.7)')};
  border-radius: 8px;
  font-size: ${theme.fontSizes.tiny};
  font-weight: ${p => (p.$active ? theme.fontWeights.semibold : theme.fontWeights.medium)};
  cursor: pointer;
  transition: all ${theme.transitions.fast};
  font-family: ${theme.fonts.primary};

  &:hover {
    border-color: ${theme.colors.primary};
    background: ${p => (p.$active ? 'rgba(37, 99, 235, 0.15)' : 'rgba(37, 99, 235, 0.05)')};
  }
`;

const SelectionBanner = styled.div.withConfig({ shouldForwardProp: (p) => !['$variant'].includes(p) })`
  display: grid;
  gap: 6px;
  align-items: center;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: 12px;
  border: 1px solid ${p => (p.$variant === 'warning' ? theme.colors.warning : theme.colors.primary)};
  background: ${p => (p.$variant === 'warning'
    ? 'linear-gradient(135deg, #fff9e8 0%, #fff3d6 100%)'
    : 'linear-gradient(135deg, #e8f5ff 0%, #f5fbff 100%)')};
  margin-bottom: ${theme.spacing.sm};
`;

const BannerLabel = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${theme.colors.black};
`;

const BannerText = styled.div`
  font-size: ${theme.fontSizes.small};
  color: rgba(15, 23, 42, 0.8);
`;

const PlatformDestinationsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.md};
`;

const ExportProgressSection = styled.div`
  padding: ${theme.spacing.md};
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.02);
`;

const ExportProgressTitle = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${theme.colors.black};
  font-weight: ${theme.fontWeights.bold};
  margin-bottom: ${theme.spacing.sm};
`;

const ExportProgressList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const ExportProgressRow = styled.div.withConfig({ shouldForwardProp: (p) => !['$status'].includes(p) })`
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: ${theme.spacing.sm};
  align-items: center;
  padding: ${theme.spacing.sm};
  border-radius: 8px;
  border: 1px solid ${p => {
    switch (p.$status) {
      case 'completed': return 'rgba(34, 197, 94, 0.3)';
      case 'in_progress': return 'rgba(37, 99, 235, 0.3)';
      case 'auth_required': return 'rgba(251, 191, 36, 0.3)';
      case 'failed': return 'rgba(239, 68, 68, 0.3)';
      default: return 'rgba(15, 23, 42, 0.12)';
    }
  }};
  background: ${p => {
    switch (p.$status) {
      case 'completed': return 'rgba(34, 197, 94, 0.05)';
      case 'in_progress': return 'rgba(37, 99, 235, 0.05)';
      case 'auth_required': return 'rgba(251, 191, 36, 0.05)';
      case 'failed': return 'rgba(239, 68, 68, 0.05)';
      default: return 'rgba(15, 23, 42, 0.02)';
    }
  }};
`;

const ExportProgressPlatform = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  font-size: ${theme.fontSizes.small};
  font-weight: ${theme.fontWeights.semibold};
  color: ${theme.colors.black};
`;

const ExportProgressStatus = styled.div.withConfig({ shouldForwardProp: (p) => !['$status'].includes(p) })`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: ${p => {
    switch (p.$status) {
      case 'completed': return '#22c55e';
      case 'in_progress': return '#2563eb';
      case 'auth_required': return '#fbbf24';
      case 'failed': return '#ef4444';
      default: return 'rgba(15, 23, 42, 0.7)';
    }
  }};
  font-weight: ${theme.fontWeights.semibold};
`;

const ExportProgressLink = styled.a`
  font-size: ${theme.fontSizes.tiny};
  font-weight: ${theme.fontWeights.semibold};
  color: ${theme.colors.primary};
  text-decoration: none;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-family: ${theme.fonts.mono};
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }
`;

const SuccessOverlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${theme.spacing.lg};
  background: rgba(255, 255, 255, 0.97);
  backdrop-filter: blur(4px);
  border-radius: 12px;
  text-align: center;
  gap: ${theme.spacing.md};
`;

const SuccessCheck = styled.div`
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 28px;
  line-height: 1;
`;

const SuccessTitle = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.base};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: ${theme.fontWeights.bold};
  color: ${theme.colors.black};
`;

const SuccessSubtitle = styled.div`
  font-size: ${theme.fontSizes.small};
  color: rgba(15, 23, 42, 0.65);
  max-width: 320px;
`;

const SuccessPlatformList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  width: 100%;
  max-width: 340px;
`;

const SuccessPlatformRow = styled.div.withConfig({ shouldForwardProp: (p) => !['$ok'].includes(p) })`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border-radius: 8px;
  background: ${p => p.$ok ? 'rgba(34, 197, 94, 0.06)' : 'rgba(239, 68, 68, 0.06)'};
  border: 1px solid ${p => p.$ok ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'};
`;

const SuccessPlatformLabel = styled.span`
  flex: 1;
  font-size: ${theme.fontSizes.small};
  font-weight: ${theme.fontWeights.semibold};
  color: ${theme.colors.black};
  text-align: left;
`;

const SuccessPlatformStatus = styled.span.withConfig({ shouldForwardProp: (p) => !['$ok'].includes(p) })`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.05em;
  text-transform: uppercase;
  font-weight: ${theme.fontWeights.semibold};
  color: ${p => p.$ok ? '#22c55e' : '#ef4444'};
`;

const SuccessActions = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  margin-top: ${theme.spacing.xs};
`;

const PublishExportWorkspace = ({
  playlist,
  curatorId = null,
  onPublish,
  onPublishAndView,
  onExport,
  onSchedulePublish,
  exportIntent,
  onExportIntentChange,
  busy,
  actionInFlight,
  publishingNow,
  exportingNow,
  schedulingNow,
  workspaceTab,
  onWorkspaceTabChange,
  authenticatedFetch
}) => {
  const [exportChoices, setExportChoices] = useState({ spotify: false, apple: false, tidal: false });
  const [authStatus, setAuthStatus] = useState({});
  const [exportValidation, setExportValidation] = useState({});
  const [accountTypes, setAccountTypes] = useState({ spotify: 'flowerpil', apple: 'flowerpil', tidal: 'flowerpil' });
  const [oauthApproval, setOauthApproval] = useState({ spotify: false, youtube: false });
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [isLoadingValidation, setIsLoadingValidation] = useState(false);
  const [exportRequests, setExportRequests] = useState([]);
  const [isLoadingExportRequests, setIsLoadingExportRequests] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({});
  const [exportComplete, setExportComplete] = useState(false);
  const [publishComplete, setPublishComplete] = useState(false);
  const [publishedPlaylistId, setPublishedPlaylistId] = useState(null);
  const [publishTiming, setPublishTiming] = useState('now');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('12:00');
  const [scheduleSuccess, setScheduleSuccess] = useState('');

  const isPublished = playlist?.published;
  const hasTracks = Boolean(playlist?.tracks?.length);
  const platformLabels = { spotify: 'Spotify', apple: 'Apple Music', tidal: 'TIDAL', youtube_music: 'YouTube Music', qobuz: 'Qobuz' };

  const selectedCount = Object.values(exportChoices).filter(Boolean).length;

  // Check if any selected platform will actually sync in-place (for sync vs export labeling)
  const currentCuratorId = playlist?.curator_id || curatorId || null;
  const hasSyncablePlatforms = useMemo(() => {
    return hasSyncableSelection(
      ['spotify', 'tidal', 'apple'],
      exportChoices,
      exportValidation,
      accountTypes,
      currentCuratorId,
      'flowerpil'
    );
  }, [accountTypes, currentCuratorId, exportChoices, exportValidation]);

  // Track playlist ID when it becomes available
  useEffect(() => {
    if (playlist?.id && !publishedPlaylistId) {
      setPublishedPlaylistId(playlist.id);
    }
  }, [playlist?.id, publishedPlaylistId]);

  // Auto-select export destinations based on imported platform URLs.
  // If a platform URL already exists (from URL paste or library import) and was NOT
  // set by our export flow, that platform is skipped (the imported URL is the link).
  // All other platforms are pre-selected for export.
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (autoSelectedRef.current || !playlist) return;
    autoSelectedRef.current = true;

    const platformUrlFields = {
      spotify: { url: 'spotify_url', exported: 'exported_spotify_url' },
      apple:   { url: 'apple_url',   exported: 'exported_apple_url' },
      tidal:   { url: 'tidal_url',   exported: 'exported_tidal_url' },
    };

    const choices = {};
    for (const [platform, fields] of Object.entries(platformUrlFields)) {
      const hasImportedUrl = !!playlist[fields.url] && !playlist[fields.exported];
      choices[platform] = !hasImportedUrl;
    }
    setExportChoices(choices);
  }, [playlist]);

  // Active export statuses
  const ACTIVE_EXPORT_STATUSES = new Set(['pending', 'in_progress', 'auth_required']);
  
  // Check if there are active export requests
  const hasActiveExports = useMemo(() => {
    return exportRequests.some(req => ACTIVE_EXPORT_STATUSES.has(req.status));
  }, [exportRequests]);

  // Get per-platform export status
  const platformExportStatus = useMemo(() => {
    const status = {};
    for (const request of exportRequests) {
      // Include active statuses and completed/failed for visibility
      if (!ACTIVE_EXPORT_STATUSES.has(request.status) && request.status !== 'completed' && request.status !== 'failed') continue;
      
      const destinations = request.destinations || [];
      const results = request.results || {};
      const jobMetadata = request.job_metadata || {};
      
      for (const platform of destinations) {
        const platformResult = results[platform];
        // Get per-platform progress from job_metadata.platforms
        const platformProgress = jobMetadata?.platforms?.[platform] || null;
        
        // Determine platform-specific status from progress or result
        let platformStatus = request.status;
        if (platformProgress?.status) {
          platformStatus = platformProgress.status;
        } else if (platformResult?.status) {
          platformStatus = platformResult.status;
        } else if (platformResult?.success === false) {
          platformStatus = 'failed';
        } else if (platformResult?.success === true) {
          platformStatus = 'completed';
        }
        
        // Prefer active statuses or more recent requests
        if (!status[platform] || ACTIVE_EXPORT_STATUSES.has(platformStatus)) {
          status[platform] = {
            status: platformStatus,
            requestId: request.id,
            result: platformResult || null,
            progress: platformProgress,
            // Include progress details for display
            tracksAdded: platformProgress?.tracks_added || platformResult?.tracks_added || 0,
            totalTracks: platformProgress?.total_tracks || 0,
            playlistUrl: platformProgress?.playlist_url || platformResult?.url || null
          };
        }
      }
    }
    return status;
  }, [exportRequests]);

  // Check if all exports are complete
  const allExportsComplete = useMemo(() => {
    const selectedPlatforms = Object.entries(exportChoices).filter(([, v]) => v).map(([k]) => k);
    if (selectedPlatforms.length === 0) return false;
    return selectedPlatforms.every(platform => {
      const status = platformExportStatus[platform];
      return status?.status === 'completed' || exportProgress[platform]?.status === 'success';
    });
  }, [exportChoices, platformExportStatus, exportProgress]);

  // Update exportComplete when all exports are done
  useEffect(() => {
    if (allExportsComplete && selectedCount > 0) {
      setExportComplete(true);
    }
  }, [allExportsComplete, selectedCount]);

  const loadAuthStatus = useCallback(async () => {
    if (!authenticatedFetch) return null;
    setIsLoadingAuth(true);
    try {
      const res = await authenticatedFetch('/api/v1/export/auth/status', { method: 'GET' });
      const data = await safeJson(res, { context: 'Load export auth status' });
      if (res.ok && data.success) {
        const authData = data.data || {};
        setAuthStatus(authData);
        return authData;
      }
      return null;
    } catch (err) {
      console.warn('Failed to load auth status', err);
      return null;
    } finally {
      setIsLoadingAuth(false);
    }
  }, [authenticatedFetch]);

  const loadOauthApproval = useCallback(async () => {
    if (!authenticatedFetch) return null;
    try {
      const res = await authenticatedFetch('/api/v1/curator/oauth-approval-status', { method: 'GET' });
      const data = await safeJson(res, { context: 'Load OAuth approval status' });
      if (res.ok && data.success) {
        setOauthApproval({
          spotify: data.data.spotify_oauth_approved,
          youtube: data.data.youtube_oauth_approved
        });
        return data.data;
      }
      return null;
    } catch (err) {
      console.warn('Failed to load OAuth approval status', err);
      return null;
    }
  }, [authenticatedFetch]);

  const loadExportValidation = useCallback(async () => {
    if (!playlist?.id || !authenticatedFetch) return null;
    setIsLoadingValidation(true);
    try {
      const res = await authenticatedFetch(`/api/v1/export/playlists/${playlist.id}/export/validate`, { method: 'GET' });
      const data = await safeJson(res, { context: 'Load export validation' });
      if (res.ok && data.success) {
        const validationData = data.data || {};
        setExportValidation(validationData);
        return validationData;
      }
      return null;
    } catch (err) {
      console.warn('Failed to load export validation', err);
      return null;
    } finally {
      setIsLoadingValidation(false);
    }
  }, [playlist?.id, authenticatedFetch]);

  const loadExportRequests = useCallback(async () => {
    if (!playlist?.id || !authenticatedFetch) return;
    setIsLoadingExportRequests(true);
    try {
      const res = await authenticatedFetch(`/api/v1/export-requests/playlist/${playlist.id}`, { method: 'GET' });
      const data = await safeJson(res, { context: 'Load export requests' });
      if (res.ok && data.success) {
        setExportRequests(data.data || []);
      }
    } catch (err) {
      console.warn('Failed to load export requests', err);
    } finally {
      setIsLoadingExportRequests(false);
    }
  }, [playlist?.id, authenticatedFetch]);

  useEffect(() => {
    if (playlist?.id && workspaceTab === 'export') {
      loadAuthStatus();
      loadOauthApproval();
      if (loadExportValidation) loadExportValidation();
      loadExportRequests();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist?.id, workspaceTab]);

  // Poll export requests when there are active exports
  useEffect(() => {
    if (!playlist?.id || !hasActiveExports || workspaceTab !== 'export') return;

    const interval = setInterval(() => {
      loadExportRequests();
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist?.id, hasActiveExports, workspaceTab]);

  const toggleExportChoice = (platform) => {
    setExportChoices(prev => ({
      ...prev,
      [platform]: !prev[platform]
    }));
  };

  const handleAccountTypeChange = (platform, accountType) => {
    setAccountTypes(prev => ({
      ...prev,
      [platform]: accountType
    }));
  };

  const getPlatformStatus = (platform) => {
    const validation = exportValidation[platform] || {};
    const auth = authStatus[platform] || {};
    const accountType = accountTypes[platform] || 'flowerpil';
    const selectedAuth = accountType === 'curator'
      ? (auth.contexts?.curator || {})
      : (auth.contexts?.flowerpil || {});

    return {
      isConnected: selectedAuth.connected || false,
      isExportable: validation.exportable || false,
      readyTracks: validation.readyTracks || 0,
      totalTracks: validation.totalTracks || 0,
      coverage: validation.coverage || 0,
      hasExistingExport: validation.alreadyExported || false,
      willSyncInPlace: canSyncInPlace(platform, validation, accountType, currentCuratorId),
      actionLabel: getExportActionLabel(platform, validation, accountType, currentCuratorId)
    };
  };

  // Execute exports directly inline
  const handleExecuteExport = async () => {
    if (!playlist?.id || !playlist?.title?.trim()) return;

    setIsExporting(true);
    setExportProgress({});
    setExportComplete(false);

    // Track publish success locally to avoid stale closure on publishComplete state
    let didPublish = false;

    try {
      const selected = ['spotify', 'tidal', 'apple'].filter(k => exportChoices[k]);

      // Always publish to flowerpil site first (even if export fails)
      if (!playlist.published) {
        setPublishComplete(false);
        try {
          await onPublish();
          setPublishComplete(true);
          didPublish = true;
        } catch (publishErr) {
          console.error('Failed to publish playlist:', publishErr);
          setPublishComplete(false); // Ensure it stays false on error
          // Don't continue silently - show error to user
          throw new Error('Cannot complete - playlist publish failed: ' + publishErr.message);
        }
      } else {
        setPublishComplete(true);
        didPublish = true;
      }

      if (selected.length === 0 && exportIntent === 'publish-only') {
        // Just publish, no export
        setExportComplete(true);
        setIsExporting(false);
        return;
      }

      // Refresh validation and auth status AFTER publish to ensure latest data
      const [freshValidation, freshAuthStatus] = await Promise.all([
        loadExportValidation(),
        loadAuthStatus()
      ]);

      // Use fresh validation data, fallback to state if needed
      const currentValidation = freshValidation || exportValidation;
      const currentAuthStatus = freshAuthStatus || authStatus;

      // Execute exports for each selected platform (start all immediately)
      const exportPromises = selected.map(async (platform) => {
        const accountType = accountTypes[platform];
        const platformAuth = currentAuthStatus[platform];
        const selectedAuth = platformAuth?.contexts?.[accountType];
        // Use fresh validation data
        const v = currentValidation[platform];

        // Check authentication
        if (!selectedAuth?.connected) {
          setExportProgress(p => ({
            ...p,
            [platform]: {
              status: 'auth_required',
              message: `${accountType === 'flowerpil' ? 'Flowerpil' : 'Your'} account not connected`,
              accountType
            }
          }));
          return;
        }

        // Check validation
        if (!v?.exportable) {
          setExportProgress(p => ({
            ...p,
            [platform]: {
              status: 'failed',
              message: 'No tracks available to export',
              accountType
            }
          }));
          return;
        }

        // Perform export - start immediately
        const platformValidation = currentValidation[platform] || {};
        const willSync = canSyncInPlace(platform, platformValidation, accountType, currentCuratorId);
        setExportProgress(p => ({
          ...p,
          [platform]: {
            status: 'in_progress',
            message: willSync ? 'Syncing playlist...' : 'Creating playlist...',
            accountType
          }
        }));

        try {
          const response = await authenticatedFetch(`/api/v1/export/playlists/${playlist.id}/export/${platform}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              isPublic: true,
              account_type: accountType
            })
          });

          const json = await safeJson(response, { context: `Export to ${platform}` });

          if (response.ok && json.success) {
            setExportProgress(p => ({
              ...p,
              [platform]: {
                status: 'completed',
                message: `${willSync ? 'Synced' : 'Exported'} ${json.data?.tracksAdded || 0}/${json.data?.totalTracks || 0} tracks`,
                url: json.data?.playlistUrl,
                accountType
              }
            }));
          } else if (json.code === 'AUTH_REQUIRED') {
            setExportProgress(p => ({
              ...p,
              [platform]: {
                status: 'auth_required',
                message: 'Authentication required',
                accountType
              }
            }));
          } else {
            setExportProgress(p => ({
              ...p,
              [platform]: {
                status: 'failed',
                message: json.error || 'Export failed',
                accountType
              }
            }));
          }
        } catch (e) {
          setExportProgress(p => ({
            ...p,
            [platform]: {
              status: 'failed',
              message: e.message || 'Export failed',
              accountType
            }
          }));
        }
      });

      // Wait for all exports to start and complete
      await Promise.allSettled(exportPromises);

      // Mark export as complete if we've published (even if some exports failed)
      // This ensures we always show the "View live" and "Edit" buttons after publishing
      // Use local didPublish flag since publishComplete state is stale in this closure
      if (didPublish) {
        setExportComplete(true);
      }
      
      // Reload export requests to reflect new state
      await loadExportRequests();
      
    } catch (err) {
      console.error('Export workflow failed:', err);
    } finally {
      setIsExporting(false);
    }
  };
  const handleScheduleClick = async () => {
    if (!playlist?.id || !scheduledDate || !scheduledTime) return;
    const utcTimestamp = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
    const displayDate = new Date(`${scheduledDate}T${scheduledTime}`).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
    try {
      await onSchedulePublish(utcTimestamp);
      setScheduleSuccess(`Scheduled for ${displayDate}`);
    } catch (err) {
      setScheduleSuccess('');
    }
  };

  // Computed success state
  const showSuccessState = (exportComplete || publishComplete) && !isExporting && !hasActiveExports;
  const hasAnyExportUrl = exportProgress.spotify?.url
    || exportProgress.apple?.url
    || exportProgress.tidal?.url
    || exportProgress.youtube_music?.url
    || playlist?.spotify_url
    || playlist?.apple_url
    || playlist?.tidal_url
    || playlist?.youtube_music_url;

  // Build export results summary for success overlay
  const exportResults = Object.entries(exportProgress).map(([platform, result]) => ({
    platform,
    label: platformLabels[platform] || platform,
    ok: result.status === 'completed',
    message: result.message,
    url: result.url
  }));

  return (
    <SectionCard>
      <Panel>
        <SectionHeader1>
          <h3 className="title">Publish & Export</h3>
        </SectionHeader1>
      </Panel>
      <div style={{ padding: theme.spacing.md, position: 'relative', minHeight: showSuccessState ? 320 : undefined }}>
        {/* Success Overlay */}
        {showSuccessState && publishComplete && (
          <SuccessOverlay>
            <SuccessCheck>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </SuccessCheck>
            <SuccessTitle>Published</SuccessTitle>
            <SuccessSubtitle>
              Your playlist is live on Flowerpil{exportResults.some(r => r.ok) ? ' and exported to streaming platforms' : exportResults.length > 0 ? '. Some exports need attention below' : ''}.
            </SuccessSubtitle>

            {exportResults.length > 0 && (
              <SuccessPlatformList>
                {exportResults.map(({ platform, label, ok, message, url }) => (
                  <SuccessPlatformRow key={platform} $ok={ok}>
                    <PlatformIcon platform={platform} size={18} />
                    <SuccessPlatformLabel>{label}</SuccessPlatformLabel>
                    {ok && url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: theme.fonts.mono, fontSize: theme.fontSizes.tiny, letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600, color: theme.colors.primary, textDecoration: 'none' }}>
                        Open
                      </a>
                    ) : (
                      <SuccessPlatformStatus $ok={ok}>{ok ? 'Done' : message || 'Failed'}</SuccessPlatformStatus>
                    )}
                  </SuccessPlatformRow>
                ))}
              </SuccessPlatformList>
            )}

            {/* Apple Music URL Notice inside overlay */}
            {(exportProgress.apple?.status === 'completed') && !exportProgress.apple?.url && (
              <SuccessSubtitle style={{ color: '#b45309', fontSize: theme.fontSizes.tiny, fontFamily: theme.fonts.mono, letterSpacing: '0.04em' }}>
                Apple Music share URL pending — our team has been notified
              </SuccessSubtitle>
            )}

            <SuccessActions>
              <Button
                variant="action"
                onClick={() => window.location.href = `/playlists/${playlist?.id || publishedPlaylistId}`}
              >
                View Live
              </Button>
              <Button
                variant="secondary"
                onClick={() => window.location.href = `/curator-admin/playlists?select=${playlist?.id || publishedPlaylistId}`}
              >
                Edit
              </Button>
            </SuccessActions>
          </SuccessOverlay>
        )}
        <WorkspaceTabPanel>
            {/* Publish timing selection */}
            {!isPublished && (
              <ExportOptions style={{ marginBottom: theme.spacing.md }}>
                <ExportOption
                  type="button"
                  $checked={publishTiming === 'now'}
                  onClick={() => { setPublishTiming('now'); setScheduleSuccess(''); }}
                  disabled={busy}
                >
                  <input type="radio" name="publish-timing" value="now" checked={publishTiming === 'now'} readOnly disabled={busy} />
                  <label>
                    <ExportOptionHeader>Post Now</ExportOptionHeader>
                    <ExportOptionSubheader>Publish immediately when you click the button</ExportOptionSubheader>
                  </label>
                </ExportOption>
                <ExportOption
                  type="button"
                  $checked={publishTiming === 'scheduled'}
                  onClick={() => { setPublishTiming('scheduled'); setScheduleSuccess(''); }}
                  disabled={busy}
                >
                  <input type="radio" name="publish-timing" value="scheduled" checked={publishTiming === 'scheduled'} readOnly disabled={busy} />
                  <label>
                    <ExportOptionHeader>Scheduled Post</ExportOptionHeader>
                    <ExportOptionSubheader>Choose a future date and time to auto-publish</ExportOptionSubheader>
                  </label>
                </ExportOption>
              </ExportOptions>
            )}

            {/* Schedule date/time picker */}
            {publishTiming === 'scheduled' && !isPublished && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.spacing.sm, marginBottom: theme.spacing.md, maxWidth: '400px' }}>
                <div>
                  <label style={{ display: 'block', fontFamily: theme.fonts.mono, fontSize: theme.fontSizes.tiny, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Date</label>
                  <input
                    type="date"
                    value={scheduledDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    style={{ width: '100%', padding: '8px', fontFamily: theme.fonts.primary, fontSize: theme.fontSizes.small, border: '1px solid #ccc', borderRadius: '4px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontFamily: theme.fonts.mono, fontSize: theme.fontSizes.tiny, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Time</label>
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    style={{ width: '100%', padding: '8px', fontFamily: theme.fonts.primary, fontSize: theme.fontSizes.small, border: '1px solid #ccc', borderRadius: '4px' }}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={{ fontFamily: theme.fonts.mono, fontSize: theme.fontSizes.tiny, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Times are in {Intl.DateTimeFormat().resolvedOptions().timeZone}
                  </span>
                </div>
              </div>
            )}

            {/* Schedule success banner */}
            {scheduleSuccess && (
              <SelectionBanner $variant="success" style={{ marginBottom: theme.spacing.md }}>
                <BannerLabel>{scheduleSuccess}</BannerLabel>
                <BannerText>Your playlist will be automatically published at the scheduled time.</BannerText>
              </SelectionBanner>
            )}

            {/* Simplified from 3 → 2 options to reduce cognitive load */}
            {publishTiming === 'now' && (
            <>
            <ExportOptions style={{ marginBottom: theme.spacing.md }}>
              <ExportOption
                type="button"
                $checked={exportIntent === 'publish-then-export' || exportIntent === 'export-only'}
                onClick={() => onExportIntentChange('publish-then-export')}
                disabled={busy}
              >
                <input
                  type="radio"
                  id="publish-then-export"
                  name="export-intent"
                  value="publish-then-export"
                  checked={exportIntent === 'publish-then-export' || exportIntent === 'export-only'}
                  readOnly
                  disabled={busy}
                />
                <label htmlFor="publish-then-export">
                  <ExportOptionHeader>{hasSyncablePlatforms ? 'Publish & Sync' : 'Publish & Export'}</ExportOptionHeader>
                  <ExportOptionSubheader>{hasSyncablePlatforms ? 'Publish to Flowerpil and sync to streaming platforms' : 'Publish to Flowerpil and push to streaming platforms'}</ExportOptionSubheader>
                </label>
              </ExportOption>

              <ExportOption
                type="button"
                $checked={exportIntent === 'publish-only'}
                onClick={() => onExportIntentChange('publish-only')}
                disabled={busy}
              >
                <input
                  type="radio"
                  id="publish-only"
                  name="export-intent"
                  value="publish-only"
                  checked={exportIntent === 'publish-only'}
                  readOnly
                  disabled={busy}
                />
                <label htmlFor="publish-only">
                  <ExportOptionHeader>Publish Only</ExportOptionHeader>
                  <ExportOptionSubheader>Make visible on Flowerpil, skip streaming platforms</ExportOptionSubheader>
                </label>
              </ExportOption>
            </ExportOptions>

            {/* Show platform destinations for any export intent */}
            {(exportIntent === 'publish-then-export' || exportIntent === 'export-only') && (
              <>
                <PlatformDestinationsGrid>
                  {['spotify', 'apple', 'tidal'].map((platform) => {
                    const isSelected = exportChoices[platform];
                    const label = platformLabels[platform];
                    const status = getPlatformStatus(platform);
                    const accountType = accountTypes[platform] || 'flowerpil';
                    const isReady = status.coverage >= 0.5;

                    return (
                      <PlatformDestinationCard
                        key={platform}
                        $selected={isSelected}
                        $ready={isReady && isSelected}
                        onClick={() => toggleExportChoice(platform)}
                        disabled={busy}
                      >
                        <DestinationCardTop>
                          <DestinationCardIcon>
                            <PlatformIcon platform={platform} size={48} />
                          </DestinationCardIcon>
                          <DestinationCardHeader>
                            <DestinationCardLabel>{label}</DestinationCardLabel>
                            <DestinationCardTag $muted={!isSelected} $ready={isReady && isSelected}>
                              {isSelected ? (isReady ? 'Ready' : 'Selected') : 'Tap to include'}
                            </DestinationCardTag>
                          </DestinationCardHeader>
                        </DestinationCardTop>

                        <DestinationCardBody>
                          {isSelected ? (
                            <>
                              <DestinationCardCopy>
                                {status.actionLabel}
                              </DestinationCardCopy>
                              {status.totalTracks > 0 && (
                                <ValidationStatus $coverage={status.coverage}>
                                  {status.readyTracks}/{status.totalTracks} tracks ready
                                  {status.coverage > 0 && ` • ${Math.round(status.coverage * 100)}% coverage`}
                                </ValidationStatus>
                              )}
                              {/* Show account type selector - hide "My Account" for Spotify/YouTube if not approved */}
                              {(platform === 'spotify' && !oauthApproval.spotify) || (platform === 'youtube_music' && !oauthApproval.youtube) ? (
                                <>
                                  <AccountNote $connected={false}>
                                    Exporting via Flowerpil account
                                  </AccountNote>
                                  <ApiLimitNote>
                                    Due to API limitations, direct account access is restricted.
                                    {(platform === 'spotify' || platform === 'youtube_music') && ' Contact dev@flowerpil.com to request access.'}
                                  </ApiLimitNote>
                                </>
                              ) : (
                                <>
                                  <AccountTypeSelector>
                                    <AccountTypeButton
                                      $active={accountType === 'flowerpil'}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleAccountTypeChange(platform, 'flowerpil');
                                      }}
                                    >
                                      Flowerpil
                                    </AccountTypeButton>
                                    <AccountTypeButton
                                      $active={accountType === 'curator'}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleAccountTypeChange(platform, 'curator');
                                      }}
                                    >
                                      {status.isConnected ? 'My Account' : 'My Account (Connect)'}
                                    </AccountTypeButton>
                                  </AccountTypeSelector>
                                  <AccountNote $connected={status.isConnected && accountType === 'curator'}>
                                    {accountType === 'curator' && status.isConnected
                                      ? 'Publishing with your account'
                                      : accountType === 'curator' && !status.isConnected
                                      ? 'Connect your account to export'
                                      : 'Flowerpil will publish for you'}
                                  </AccountNote>
                                </>
                              )}
                            </>
                          ) : (() => {
                            const urlField = { spotify: 'spotify_url', apple: 'apple_url', tidal: 'tidal_url' }[platform];
                            const exportedField = { spotify: 'exported_spotify_url', apple: 'exported_apple_url', tidal: 'exported_tidal_url' }[platform];
                            const isOriginPlatform = !!playlist[urlField] && !playlist[exportedField];
                            return isOriginPlatform ? (
                              <>
                                <DestinationCardCopy style={{ fontStyle: 'italic' }}>
                                  Skipping re-export — this playlist was imported from {label}
                                </DestinationCardCopy>
                                <DestinationCardCopy style={{ opacity: 0.6, fontSize: '0.85em', marginTop: '4px' }}>
                                  Tap to include anyway
                                </DestinationCardCopy>
                              </>
                            ) : (
                              <DestinationCardCopy>
                                Tap to include in export
                              </DestinationCardCopy>
                            );
                          })()}
                        </DestinationCardBody>
                      </PlatformDestinationCard>
                    );
                  })}
                </PlatformDestinationsGrid>

                <SelectionBanner $variant={selectedCount === 0 ? 'warning' : 'success'}>
                  <BannerLabel>{selectedCount === 0 ? 'Select Destinations' : `${selectedCount} Platform${selectedCount === 1 ? '' : 's'} Selected`}</BannerLabel>
                  <BannerText>
                    {selectedCount === 0
                      ? 'Choose at least one streaming platform above'
                      : 'Click the button below to publish and export'}
                  </BannerText>
                </SelectionBanner>
              </>
            )}
            </>
            )}

            {/* Export Progress - show when exporting or has active exports */}
            {(isExporting || hasActiveExports || Object.keys(exportProgress).length > 0) && (
              <ExportProgressSection style={{ marginBottom: theme.spacing.md }}>
                <ExportProgressTitle>
                  {isExporting
                    ? (exportIntent === 'publish-only' ? 'Publishing...' : (hasSyncablePlatforms ? 'Syncing...' : 'Exporting...'))
                    : hasActiveExports ? 'Export Progress' : 'Export Results'}
                </ExportProgressTitle>
                <ExportProgressList>
                  {/* Show inline export progress */}
                  {Object.entries(exportProgress).map(([platform, result]) => {
                    const label = platformLabels[platform] || platform;
                    return (
                      <ExportProgressRow key={`inline-${platform}`} $status={result.status}>
                        <ExportProgressPlatform>
                          <PlatformIcon platform={platform} size={20} />
                          <span>{label}</span>
                        </ExportProgressPlatform>
                        <ExportProgressStatus $status={result.status}>
                          {result.message}
                        </ExportProgressStatus>
                        {result.url && (
                          <ExportProgressLink href={result.url} target="_blank" rel="noopener noreferrer">
                            Open →
                          </ExportProgressLink>
                        )}
                      </ExportProgressRow>
                    );
                  })}
                  {/* Show server-side export progress */}
                  {hasActiveExports && Object.entries(platformExportStatus).map(([platform, status]) => {
                    // Skip if we already have inline progress for this platform
                    if (exportProgress[platform]) return null;
                    const label = platformLabels[platform] || platform;
                    const statusLabel = status.status === 'pending' 
                      ? 'Queued' 
                      : status.status === 'in_progress' 
                      ? 'Exporting…' 
                      : status.status === 'auth_required'
                      ? 'Auth Required'
                      : status.status === 'completed'
                      ? 'Completed'
                      : status.status === 'skipped'
                      ? 'Skipped'
                      : 'Failed';
                    
                    let statusMessage = statusLabel;
                    if (status.status === 'in_progress' && status.totalTracks > 0) {
                      statusMessage = `Exporting… ${status.tracksAdded || 0}/${status.totalTracks}`;
                    } else if (status.status === 'completed' && status.tracksAdded > 0) {
                      statusMessage = `Completed (${status.tracksAdded} tracks)`;
                    }
                    
                    return (
                      <ExportProgressRow key={platform} $status={status.status}>
                        <ExportProgressPlatform>
                          <PlatformIcon platform={platform} size={20} />
                          <span>{label}</span>
                        </ExportProgressPlatform>
                        <ExportProgressStatus $status={status.status}>
                          {statusMessage}
                        </ExportProgressStatus>
                        {(status.playlistUrl || status.result?.url) && (
                          <ExportProgressLink href={status.playlistUrl || status.result.url} target="_blank" rel="noopener noreferrer">
                            View →
                          </ExportProgressLink>
                        )}
                      </ExportProgressRow>
                    );
                  })}
                </ExportProgressList>
              </ExportProgressSection>
            )}

            <PublishCardFooter>
              {publishTiming === 'scheduled' ? (
                <Button
                  variant="action"
                  onClick={handleScheduleClick}
                  disabled={busy || !playlist?.id || !scheduledDate || !scheduledTime}
                >
                  {schedulingNow ? 'Scheduling...' : 'Schedule Publish'}
                </Button>
              ) : (
                <>
                  <Button
                    variant="action"
                    onClick={handleExecuteExport}
                    disabled={busy || isExporting || !playlist?.title?.trim() || !hasTracks || (exportIntent !== 'publish-only' && selectedCount === 0)}
                  >
                    {isExporting
                      ? (exportIntent === 'publish-only' ? 'Publishing...' : (hasSyncablePlatforms ? 'Syncing...' : 'Exporting...'))
                      : exportIntent === 'publish-only'
                      ? (playlist?.published ? 'Already Published' : 'Publish to Flowerpil')
                      : `${hasSyncablePlatforms ? 'Publish & Sync' : 'Publish & Export'}${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
                  </Button>
                </>
              )}
            </PublishCardFooter>
          </WorkspaceTabPanel>
      </div>
    </SectionCard>
  );
};

const normalizeTracks = (tracks = []) => {
  const stamp = Date.now();
  return tracks.map((track, index) => {
    const fallbackId = track?.id
      || track?.spotify_id
      || track?.apple_id
      || track?.tidal_id
      || `fp-import-${stamp}-${index}`;
    return {
      ...track,
      id: String(fallbackId),
      position: track?.position ? track.position : index + 1,
    };
  });
};

export default function CuratorPlaylistCreate() {
  const { authenticatedFetch } = useAuth();
  const { isInstagramTrackLinkingEnabled } = useSiteSettings();

  const [importState, setImportState] = useState({ ...INITIAL_IMPORT_STATE });

  const [curator, setCurator] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('tracks');
  const [importToolsExpanded, setImportToolsExpanded] = useState(false); // Closed initially
  const [importTab, setImportTab] = useState('dsp'); // 'paste' | 'dsp' | 'url'
  const [importText, setImportText] = useState('');
  const [pastedUrl, setPastedUrl] = useState('');
  const [importResetKey, setImportResetKey] = useState(0);
  const [lastImportResult, setLastImportResult] = useState(null);
  const importAbortControllerRef = useRef(null);
  const [linkingState, setLinkingState] = useState({ status: 'idle', processed: 0, total: 0, message: '' });
  const [linkStats, setLinkStats] = useState(null);
  const [instagramLinkState, setInstagramLinkState] = useState({ status: 'idle', message: '', updated: 0, skipped: 0, failed: 0 });
  const [instagramAvailability, setInstagramAvailability] = useState({ ready: false, loading: true, reason: '' });
  const linkingJobRef = useRef(null);
  const urlImportJobRef = useRef(null);
  const draftPromiseRef = useRef(null);
  const draftSessionIdRef = useRef(crypto.randomUUID());
  const [linkStatsCooldown, setLinkStatsCooldown] = useState(0);
  const [detailsErrors, setDetailsErrors] = useState({});
  const [exportIntent, setExportIntent] = useState('publish-then-export');
  const [workspaceTab, setWorkspaceTab] = useState('export');
  const restoredSessionRef = useRef(false);
  const allowSessionRestoreRef = useRef(false);
  const autoSaveTimerRef = useRef(null);
  const lastPersistedRef = useRef(null);

  const resetImportState = useCallback(() => {
    setImportState({ ...INITIAL_IMPORT_STATE });
  }, []);

  const patchImportState = useCallback((updates = {}) => {
    setImportState((prev) => {
      const next = { ...prev };

      if (updates.phase !== undefined) {
        next.phase = updates.phase;
        if (updates.phase === 'idle') {
          next.progress = 0;
        }
      }

      if (updates.platform !== undefined) {
        next.platform = updates.platform;
      }

      if (updates.selectionId !== undefined) {
        next.selectionId = updates.selectionId;
      }

      if (updates.message !== undefined) {
        next.message = updates.message;
      }

      if (updates.error !== undefined) {
        next.error = updates.error;
      }

      if (updates.progress !== undefined) {
        const target = Math.max(0, Math.min(100, updates.progress));
        if (target < prev.progress) {
          next.progress = prev.progress;
        } else if (Math.abs(target - prev.progress) < 5) {
          next.progress = target;
        } else {
          next.progress = prev.progress + (target - prev.progress) * 0.3;
        }
      }

      return next;
    });
  }, []);

  const updateImportProgress = useCallback((progress, phase = null, platform = null, message = null) => {
    patchImportState({
      progress,
      phase: phase ?? undefined,
      platform: platform ?? undefined,
      message: message ?? undefined,
      error: phase === 'error' ? (message || null) : undefined
    });
  }, [patchImportState]);

  const initialState = {
    playlist: null,
    status: 'idle',
    actionInFlight: null,
    error: null,
    message: ''
  };

  const reducer = (state, action) => {
    switch (action.type) {
      case 'setPlaylist':
        return {
          ...state,
          playlist: action.playlist,
          status: state.actionInFlight ? state.status : 'editing'
        };
      case 'startAction':
        return { ...state, actionInFlight: action.actionKey, status: action.status || state.status, error: null };
      case 'endAction':
        return { ...state, actionInFlight: null, status: action.status || state.status };
      case 'setStatus':
        return { ...state, status: action.status, message: action.message ?? state.message };
      case 'setError':
        return { ...state, status: 'error', error: action.error };
      case 'clearError':
        return { ...state, error: null };
      case 'setMessage':
        return { ...state, message: action.message };
      default:
        return state;
    }
  };

  const [state, dispatch] = useReducer(reducer, initialState);
  const { playlist, actionInFlight, error, message } = state;
  const linkedTracks = useMemo(() => {
    if (!playlist?.tracks?.length) return 0;
    return playlist.tracks.reduce((sum, track) => {
      const count = ['spotify_id', 'apple_music_url', 'tidal_url'].reduce((acc, key) => (track?.[key] ? acc + 1 : acc), 0);
      return sum + (count > 0 ? 1 : 0);
    }, 0);
  }, [playlist?.tracks]);
  const linkingPercent = useMemo(() => {
    if (linkingState.total > 0) {
      return Math.round((linkingState.processed / linkingState.total) * 100);
    }
    if (linkStats?.total_tracks > 0) {
      const completed = linkStats.completed || linkStats.with_links || 0;
      return Math.round((completed / linkStats.total_tracks) * 100);
    }
    return 0;
  }, [linkingState.processed, linkingState.total, linkStats]);

  const tabs = useMemo(() => [
    { id: 'tracks', label: 'Track List', description: 'Import and organize tracks', icon: '1', step: 1 },
    { id: 'details', label: 'Details', description: 'Title, description, and tags', icon: '2', step: 2 },
    { id: 'cover', label: 'Cover Image', description: 'Upload playlist artwork', icon: '3', step: 3 },
    { id: 'publish', label: 'Publish & Export', description: 'Publish, export, and schedule', icon: '4', step: 4 },
  ], []);

  const statusFromAction = (actionKey) => {
    if (actionKey === 'publish') return 'publishing';
    if (actionKey === 'export') return 'exporting';
    if (actionKey === 'link') return 'linking';
    if (actionKey === 'schedule') return 'scheduling';
    if (actionKey === 'discard') return 'saving';
    if (actionKey === 'saveDraft' || actionKey === 'saveAndReturn' || actionKey === 'import') return 'saving';
    return 'editing';
  };

  const playlistFingerprint = useCallback((p) => {
    if (!p) return null;
    return JSON.stringify({
      id: p.id || null,
      title: p.title || '',
      description: p.description || '',
      description_short: p.description_short || '',
      tags: p.tags || '',
      image: p.image || '',
      tracks: (p.tracks || []).map(t => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        position: t.position
      }))
    });
  }, []);

  const runAction = useCallback(async (actionKey, fn, { successMessage } = {}) => {
    if (actionInFlight && actionInFlight !== actionKey) {
      throw new Error('Another action is in progress. Please wait.');
    }
    dispatch({ type: 'startAction', actionKey, status: statusFromAction(actionKey) });
    try {
      const result = await fn();
      dispatch({ type: 'setStatus', status: 'success', message: successMessage || message });
      return result;
    } catch (err) {
      dispatch({
        type: 'setError',
        error: { action: actionKey, message: err.message || 'Something went wrong' }
      });
      throw err;
    } finally {
      dispatch({ type: 'endAction' });
    }
  }, [actionInFlight, dispatch, message]);

  const updatePlaylist = useCallback((updates) => {
    dispatch({
      type: 'setPlaylist',
      playlist: {
        ...(playlist || {}),
        ...updates,
        tracks: updates.tracks && Array.isArray(updates.tracks) 
          ? normalizeTracks(updates.tracks) 
          : (Array.isArray(playlist?.tracks) ? playlist.tracks : [])
      }
    });
    if (updates.title !== undefined) {
      setDetailsErrors((prev) => {
        if (!prev.title) return prev;
        if (updates.title && updates.title.trim()) {
          const next = { ...prev };
          delete next.title;
          return next;
        }
        return prev;
      });
    }
    dispatch({ type: 'clearError' });
    dispatch({ type: 'setMessage', message: '' });
  }, [dispatch, playlist, setDetailsErrors]);

  const validatePlaylist = useCallback((target) => {
    const nextErrors = {};
    if (!target?.title?.trim()) {
      nextErrors.title = 'Title is required';
    }
    setDetailsErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      throw new Error(nextErrors.title || 'Add a playlist title before continuing.');
    }
  }, [setDetailsErrors]);

  const persistPlaylist = useCallback(async (payload) => {
    const saved = await savePlaylist(payload);
    const merged = {
      ...payload,
      ...saved,
      tracks: normalizeTracks(saved?.tracks || payload.tracks || []),
    };
    dispatch({ type: 'setPlaylist', playlist: merged });
    lastPersistedRef.current = playlistFingerprint(merged);
    return merged;
  }, [dispatch, playlistFingerprint]);

  const readExportIntent = useCallback((playlistId) => {
    if (!playlistId || typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(EXPORT_INTENT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const entry = parsed?.[playlistId];
      if (!entry) return null;
      return typeof entry === 'string' ? entry : entry.intent || null;
    } catch (err) {
      console.warn('Failed to read export intent', err);
      return null;
    }
  }, []);

  const persistExportIntent = useCallback((playlistId, intent) => {
    if (!playlistId || !intent || typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(EXPORT_INTENT_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed[playlistId] = { intent, updated: Date.now() };
      localStorage.setItem(EXPORT_INTENT_KEY, JSON.stringify(parsed));
      setExportIntent(intent);
    } catch (err) {
      console.warn('Failed to persist export intent', err);
    }
  }, []);

  const clearExportIntent = useCallback((playlistId) => {
    if (!playlistId || typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(EXPORT_INTENT_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed[playlistId]) {
        delete parsed[playlistId];
        localStorage.setItem(EXPORT_INTENT_KEY, JSON.stringify(parsed));
      }
    } catch (err) {
      console.warn('Failed to clear export intent', err);
    }
  }, []);

  useEffect(() => {
    if (detailsErrors.title && playlist?.title?.trim()) {
      setDetailsErrors((prev) => {
        const next = { ...prev };
        delete next.title;
        return next;
      });
    }
  }, [detailsErrors.title, playlist?.title]);

  const profileLoadedRef = useRef(false);
  useEffect(() => {
    if (curator) return;
    if (profileLoadedRef.current) return;

    // If a stale flag exists but we have no curator, clear it and fetch
    const alreadyLoaded = sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (alreadyLoaded && !curator) {
      sessionStorage.removeItem(PROFILE_CACHE_KEY);
    }

    profileLoadedRef.current = true;
    siteAnalytics.trackFeatureStart('curator_create', 'page_load');
    const load = async () => {
      try {
        const res = await authenticatedFetch('/api/v1/curator/profile', { method: 'GET' });
        const data = await safeJson(res, { context: 'Load curator profile' });
        if (!res.ok || !data.success) throw new Error(data.message || data.error || 'Failed to load curator');

        const base = {
          title: '',
          description: '',
          description_short: '',
          tags: '',
          image: '',
          tracks: [],
          curator_id: data.curator.id,
          curator_name: data.curator.name,
          curator_type: data.curator.profile_type,
          publish_date: new Date().toISOString().split('T')[0],
          spotify_url: '',
          apple_url: '',
          tidal_url: '',
          youtube_music_url: ''
        };
        sessionStorage.setItem(PROFILE_CACHE_KEY, '1');
        setCurator(data.curator);
        dispatch({ type: 'setPlaylist', playlist: base });
      } catch (e) {
        // Allow retry on next navigation/refresh
        sessionStorage.removeItem(PROFILE_CACHE_KEY);
        profileLoadedRef.current = false;
        dispatch({
          type: 'setError',
          error: { action: 'profile', message: e.message || 'Failed to load curator' }
        });
      }
    };

    load();
  }, [authenticatedFetch, curator]);

  const forceCurator = useMemo(() => (curator ? {
    id: curator.id,
    name: curator.name,
    profile_type: curator.profile_type,
  } : null), [curator]);

  const handleTracksChange = (tracks) => {
    updatePlaylist({ tracks: normalizeTracks(tracks) });
  };

  const instagramFeatureEnabled = isInstagramTrackLinkingEnabled?.() === true;

  useEffect(() => {
    let active = true;
    if (!authenticatedFetch) return undefined;
    if (!instagramFeatureEnabled) {
      setInstagramAvailability({ ready: false, loading: false, reason: 'disabled' });
      return undefined;
    }

    const loadStatus = async () => {
      try {
        setInstagramAvailability((prev) => ({ ...prev, loading: true }));
        const res = await authenticatedFetch('/api/v1/tracks/instagram-link/status', { method: 'GET' });
        const json = await safeJson(res, { context: 'Instagram link status' });
        if (!active) return;
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || 'Status unavailable');
        }
        const data = json.data || {};
        setInstagramAvailability({
          ready: data.ready === true,
          loading: false,
          reason: data.reason || ''
        });
      } catch (error) {
        if (!active) return;
        setInstagramAvailability({ ready: false, loading: false, reason: 'unavailable' });
      }
    };

    loadStatus();
    return () => { active = false; };
  }, [authenticatedFetch, instagramFeatureEnabled]);

  const linkInstagramProfiles = useCallback(async () => {
    if (!playlist?.id || !authenticatedFetch) return;
    if (!playlist?.tracks?.length) return;
    if (!instagramFeatureEnabled || !instagramAvailability.ready) return;

    const confirmed = window.confirm('Link Instagram profiles for all tracks in this playlist?');
    if (!confirmed) return;

    setInstagramLinkState({
      status: 'in_progress',
      message: 'Searching for Instagram profiles...',
      updated: 0,
      skipped: 0,
      failed: 0
    });

    try {
      const res = await authenticatedFetch(`/api/v1/tracks/playlist/${playlist.id}/link-instagram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const json = await safeJson(res, { context: 'Link Instagram profiles' });
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to link Instagram profiles');
      }

      const data = json.data || {};
      const updatedTracks = Array.isArray(data.updated_tracks) ? data.updated_tracks : [];
      if (updatedTracks.length && Array.isArray(playlist?.tracks)) {
        const updateMap = new Map(updatedTracks.map((item) => [String(item.id), item.custom_sources]));
        const nextTracks = playlist.tracks.map((track) => {
          const trackId = String(track?.id);
          if (updateMap.has(trackId)) {
            return { ...track, custom_sources: updateMap.get(trackId) };
          }
          return track;
        });
        updatePlaylist({ tracks: nextTracks });
      }

      const updatedCount = Number(data.updated) || 0;
      const skippedCount = Number(data.skipped) || 0;
      const failedCount = Number(data.failed) || 0;
      const statusMessage = `Linked ${updatedCount} track${updatedCount === 1 ? '' : 's'}, skipped ${skippedCount}, failed ${failedCount}.`;

      setInstagramLinkState({
        status: 'success',
        message: statusMessage,
        updated: updatedCount,
        skipped: skippedCount,
        failed: failedCount
      });
    } catch (error) {
      setInstagramLinkState({
        status: 'error',
        message: error?.message || 'Failed to link Instagram profiles',
        updated: 0,
        skipped: 0,
        failed: 0
      });
    }
  }, [authenticatedFetch, instagramAvailability.ready, instagramFeatureEnabled, playlist?.id, playlist?.tracks, updatePlaylist]);

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const fetchLinkStats = useCallback(async (playlistId) => {
    if (!playlistId) return;
    if (Date.now() < linkStatsCooldown) return null;
    try {
      const res = await authenticatedFetch(`/api/v1/cross-platform/stats/${playlistId}`, { method: 'GET' });
      if (res.status === 429) {
        setLinkStatsCooldown(Date.now() + 15_000);
        setLinkingState((prev) => ({ ...prev, message: 'Linking throttled, retrying shortly' }));
        return null;
      }
      const json = await safeJson(res, { context: 'Load cross-platform stats' });
      if (res.ok && json.success) {
        const stats = json.data || null;
        setLinkStats(stats);
        
        // Update linking state from backend stats
        if (stats) {
          const total = stats.total_tracks || 0;
          const completed = stats.completed || stats.with_links || 0;
          const pending = stats.pending || 0;
          const processing = stats.processing || 0;
          
          // Determine status based on stats
          let status = 'idle';
          if (processing > 0 || pending > 0) {
            status = 'in_progress';
          } else if (total > 0 && completed >= total) {
            status = 'success';
          } else if (stats.failed > 0 && completed === 0) {
            status = 'error';
          }
          
          setLinkingState({
            status,
            processed: completed,
            total,
            message: status === 'in_progress' 
              ? `Linking tracks… (${completed}/${total} complete)`
              : status === 'success'
              ? 'Cross-linking complete'
              : 'Cross-linking'
          });
        }
        
        return stats;
      }
    } catch (err) {
      console.warn('Failed to load cross-platform stats', err);
    }
    return null;
  }, [authenticatedFetch]);

  useEffect(() => {
    if (playlist?.id) {
      fetchLinkStats(playlist.id);
    }
  }, [playlist?.id, fetchLinkStats]);

  useEffect(() => {
    const navEntry = window.performance?.getEntriesByType?.('navigation')?.[0];
    const navType = navEntry?.type || '';
    const isResumeNavigation = navType === 'reload' || navType === 'back_forward';
    allowSessionRestoreRef.current = isResumeNavigation;
    if (!isResumeNavigation) {
      sessionStorage.removeItem(SESSION_KEY);
      restoredSessionRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!playlist || restoredSessionRef.current || !allowSessionRestoreRef.current) return;
    const cached = sessionStorage.getItem(SESSION_KEY);
    if (!cached) return;
    try {
      const parsed = JSON.parse(cached);
      if (parsed && !playlist.id) {
        dispatch({
          type: 'setPlaylist',
          playlist: {
            ...(playlist || {}),
            ...parsed,
            tracks: normalizeTracks(parsed.tracks || playlist?.tracks || []),
          }
        });
        restoredSessionRef.current = true;
      }
    } catch (err) {
      console.warn('Failed to restore playlist draft', err);
    }
  }, [playlist]);

  useEffect(() => {
    if (!playlist) return;
    if (playlist?.published) {
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }
    const payload = {
      title: playlist.title || '',
      description: playlist.description || '',
      description_short: playlist.description_short || '',
      tags: playlist.tags || '',
      image: playlist.image || '',
      tracks: normalizeTracks(playlist.tracks || []),
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  }, [playlist]);

  useEffect(() => {
    if (activeTab === 'publish') {
      setWorkspaceTab('export');
    }
  }, [activeTab]);

  useEffect(() => {
    // Always default to publish-then-export — stored intent no longer overrides.
    // The user can still switch to publish-only via the radio buttons within the session.
    setExportIntent('publish-then-export');
  }, [playlist?.id]);

  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (!playlist) return undefined;
    if (!playlist.title?.trim()) return undefined;
    if (playlist.published) return undefined;
    if (actionInFlight) return undefined;

    const fingerprint = playlistFingerprint(playlist);
    if (fingerprint && fingerprint === lastPersistedRef.current) return undefined;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        // Save silently without dispatching setPlaylist — avoids overwriting in-progress edits
        const saved = await savePlaylist({ ...playlist, published: false });
        lastPersistedRef.current = playlistFingerprint({ ...playlist, ...saved, tracks: playlist.tracks });
      } catch (err) {
        dispatch({ type: 'setError', error: { action: 'autosave', message: err.message || 'Autosave failed' } });
      }
    }, 1200);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [playlist, actionInFlight, playlistFingerprint, dispatch]);

  const pollLinkingJob = useCallback(async (jobId, playlistId, { timeoutMs = 5 * 60 * 1000, intervalMs = 2500 } = {}) => {
    const start = Date.now();
    let lastStats = null;
    while (Date.now() - start < timeoutMs) {
      try {
        const jr = await authenticatedFetch(`/api/v1/cross-platform/job-status/${jobId}`, { method: 'GET' });
        const jj = await safeJson(jr, { context: 'Poll cross-linking job' });
        if (jr.ok && jj.success) {
          const job = jj.data || {};
          const processed = job?.progress?.processed || 0;
          const total = job?.progress?.total || 0;
          const status = job?.status || 'processing';
          setLinkingState({ status: status === 'completed' ? 'success' : status === 'failed' ? 'error' : 'in_progress', processed, total, message: 'Linking tracks…' });
          if (status === 'completed' || status === 'failed') {
            try {
              const sr = await authenticatedFetch(`/api/v1/cross-platform/stats/${playlistId}`, { method: 'GET' });
              const sj = await safeJson(sr, { context: 'Poll cross-platform stats' });
              if (sr.ok && sj.success) setLinkStats(sj.data);
            } catch (err) {
              console.warn('Failed to load stats after job complete', err);
            }
            return status;
          }
        }
      } catch (err) {
        console.warn('Failed to poll job status', err);
      }
      try {
        const sr = await authenticatedFetch(`/api/v1/cross-platform/stats/${playlistId}`, { method: 'GET' });
        const sj = await safeJson(sr, { context: 'Poll cross-platform stats tick' });
        if (sr.ok && sj.success) {
          lastStats = sj.data;
          setLinkStats(sj.data);
          setLinkingState((prev) => ({
            ...prev,
            processed: sj.data?.completed || prev.processed || 0,
            total: sj.data?.total_tracks || prev.total || 0,
          }));
        }
      } catch (err) {
        console.warn('Failed to refresh stats', err);
      }
      await wait(intervalMs);
    }
    if (lastStats && typeof lastStats.completed === 'number' && typeof lastStats.total_tracks === 'number') {
      const done = lastStats.completed >= lastStats.total_tracks && lastStats.total_tracks > 0;
      setLinkingState((prev) => ({ ...prev, status: done ? 'success' : 'error', processed: lastStats.completed, total: lastStats.total_tracks }));
      return done ? 'completed' : 'failed';
    }
    setLinkingState((prev) => ({ ...prev, status: 'error' }));
    return 'failed';
  }, [authenticatedFetch]);

  // Non-blocking version: triggers cross-linking and returns immediately
  const triggerCrossLinkingBackground = useCallback(async (targetPlaylistId, trackTotal = 0) => {
    if (!targetPlaylistId) return;

    try {
      setLinkingState({ status: 'in_progress', processed: 0, total: trackTotal, message: 'Linking tracks in background…' });

      const res = await authenticatedFetch('/api/v1/cross-platform/link-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistId: targetPlaylistId })
      });

      const json = await safeJson(res, { context: 'Start cross-platform linking' });

      if (res.ok && json.success) {
        // Linking job started successfully - it will run in background via worker
        setLinkingState((prev) => ({ ...prev, status: 'in_progress', message: 'Cross-linking in progress…' }));

        // Refresh export validation after a short delay to pick up any quick completions
        setTimeout(() => {
          if (typeof loadExportValidation === 'function') {
            loadExportValidation();
          }
        }, 3000);
      }
    } catch (err) {
      console.warn('Failed to trigger cross-linking (non-blocking):', err);
      // Don't throw - this is best-effort background linking
      setLinkingState({ status: 'idle', processed: 0, total: 0, message: '' });
    }
  }, [authenticatedFetch]);

  // Blocking version: waits for cross-linking to complete (used when user explicitly requests it)
  const startCrossLinking = useCallback(async (targetPlaylistId = playlist?.id, trackTotal = playlist?.tracks?.length || 0) => {
    return runAction('link', async () => {
      if (!targetPlaylistId) {
        setLinkingState({ status: 'blocked', processed: 0, total: 0, message: 'Save draft to link DSPs' });
        throw new Error('Save this playlist first to link DSPs.');
      }
      setLinkingState({ status: 'in_progress', processed: 0, total: trackTotal, message: 'Linking tracks…' });
      try {
        const res = await authenticatedFetch('/api/v1/cross-platform/link-playlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playlistId: targetPlaylistId })
        });
        const json = await safeJson(res, { context: 'Start cross-platform linking' });
        if (!res.ok || !json.success) throw new Error(json.error || json.message || 'Failed to start linking');
        const jobId = json?.data?.jobId || null;
        const mode = json?.data?.mode;
        if (json?.data?.status === 'completed' && !jobId) {
          setLinkingState({ status: 'success', processed: trackTotal, total: trackTotal, message: 'Linked' });
          await fetchLinkStats(targetPlaylistId);
          // Refresh export validation after cross-linking completes
          if (typeof loadExportValidation === 'function') {
            loadExportValidation();
          }
          return;
        }
        if (jobId) {
          linkingJobRef.current = jobId;
          const result = await pollLinkingJob(jobId, targetPlaylistId);
          if (result === 'completed') {
            setLinkingState((prev) => ({ ...prev, status: 'success', message: 'Cross-linking complete' }));
            await fetchLinkStats(targetPlaylistId);
            // Refresh export validation after cross-linking completes
            if (typeof loadExportValidation === 'function') {
              loadExportValidation();
            }
            return;
          }
        } else if (mode === 'distributed') {
          const start = Date.now();
          const timeoutMs = 5 * 60 * 1000;
          while (Date.now() - start < timeoutMs) {
            const stats = await fetchLinkStats(targetPlaylistId);
            const totalTracks = stats?.total_tracks || linkStats?.total_tracks || trackTotal || 0;
            const completedTracks = stats?.completed || stats?.with_links || linkStats?.completed || 0;
            setLinkingState((prev) => ({
              ...prev,
              status: 'in_progress',
              processed: completedTracks,
              total: totalTracks || prev.total,
              message: 'Linking tracks…'
            }));
            if (totalTracks > 0 && completedTracks >= totalTracks) {
              setLinkingState((prev) => ({ ...prev, status: 'success', message: 'Cross-linking complete' }));
              // Refresh export validation after cross-linking completes
              if (typeof loadExportValidation === 'function') {
                loadExportValidation();
              }
              return;
            }
            await wait(Math.max(4000, linkStatsCooldown ? linkStatsCooldown - Date.now() : 0));
          }
        }
        setLinkingState((prev) => ({ ...prev, status: 'error', message: 'Linking stalled' }));
      } catch (err) {
        setLinkingState({ status: 'error', processed: 0, total: trackTotal, message: err.message || 'Failed to link' });
        throw err;
      }
    }, { successMessage: 'Cross-linking complete' });
  }, [authenticatedFetch, fetchLinkStats, linkStats?.completed, linkStats?.total_tracks, playlist?.id, playlist?.tracks?.length, pollLinkingJob, runAction]);

  const syncPlaylistFromServer = useCallback(async (playlistId, { attempts = 8, delay = 500, signal } = {}) => {
    if (!playlistId) return [];
    // First attempt is immediate (no delay)
    for (let i = 0; i < attempts; i += 1) {
      if (signal?.aborted) {
        throw new Error('Import cancelled');
      }
      try {
        const res = await authenticatedFetch(`/api/v1/playlists/${playlistId}`, { 
          method: 'GET',
          signal 
        });
        const json = await safeJson(res, { context: 'Sync playlist from server' });
        if (res.ok && json.success) {
          const tracks = normalizeTracks(json.data?.tracks || []);
          const fullPlaylist = {
            ...(json.data || {}),
            tracks
          };
          dispatch({
            type: 'setPlaylist',
            playlist: fullPlaylist
          });
          if (tracks.length) {
            // Got tracks immediately, return
            return tracks;
          }
        }
      } catch (err) {
        if (signal?.aborted || err.name === 'AbortError') {
          throw new Error('Import cancelled');
        }
        console.warn('Failed to sync playlist', err);
      }
      // Only delay if not the first attempt and not the last attempt
      if (i < attempts - 1) {
        await wait(delay);
      }
    }
    return [];
  }, [authenticatedFetch, dispatch]);

  const ensureDraft = useCallback(async (prefill = {}) => {
    if (playlist?.id) return playlist;
    // Promise-ref lock: if a draft creation is already in flight, reuse it
    if (draftPromiseRef.current) return draftPromiseRef.current;
    const promise = (async () => {
      const payload = {
        ...playlist,
        ...prefill,
        curator_id: curator?.id,
        curator_name: curator?.name,
        curator_type: curator?.profile_type,
        tracks: normalizeTracks(prefill.tracks || playlist?.tracks || []),
        published: false,
      };
      const draft = await persistPlaylist(payload);
      return draft;
    })();
    draftPromiseRef.current = promise;
    try {
      const result = await promise;
      return result;
    } finally {
      draftPromiseRef.current = null;
    }
  }, [curator?.id, curator?.name, curator?.profile_type, persistPlaylist, playlist]);

  const parseTextTracks = useCallback((text) => {
    const lines = text.trim().split('\n').filter(line => line.trim());
    const tracks = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (!line) continue;
      let track = null;
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
      } else if (line.includes(' by ')) {
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
      } else {
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
      if (track) tracks.push(track);
    }
    return tracks;
  }, []);

  const handleTextImport = async () => {
    const text = importText.trim();
    if (!text) return;
    patchImportState({
      phase: 'saving',
      platform: 'paste',
      progress: 10,
      message: 'Parsing tracks…',
      selectionId: null,
      error: null
    });
    let nextTrackTotal = playlist?.tracks?.length || 0;
    try {
      const importResult = await runAction('import', async () => {
        const baseDraft = playlist?.id ? playlist : await ensureDraft();
        const parsed = parseTextTracks(text);
        const nextTracks = normalizeTracks([...(baseDraft?.tracks || playlist?.tracks || []), ...parsed]);
        nextTrackTotal = nextTracks.length;
        updatePlaylist({ ...(baseDraft || playlist), tracks: nextTracks });
        return { parsed, playlistId: baseDraft?.id || playlist?.id };
      }, { successMessage: `Added tracks` });
      setImportText('');
      patchImportState({
        phase: 'complete',
        platform: 'paste',
        progress: 100,
        message: `Added ${importResult.parsed.length} track${importResult.parsed.length === 1 ? '' : 's'} from paste. Cross-linking in background...`,
        error: null,
        selectionId: null
      });
      const targetId = importResult.playlistId || playlist?.id;
      if (targetId) {
        triggerCrossLinkingBackground(targetId, nextTrackTotal);
      }
    } catch (err) {
      // error handled by runAction -> banner
      patchImportState({
        phase: 'error',
        platform: 'paste',
        progress: 0,
        message: '',
        error: err.message || 'Import failed',
        selectionId: null
      });
    }
  };

  const pollUrlImportJob = useCallback(async (jobId, { timeoutMs = 10 * 60 * 1000, intervalMs = 2000 } = {}) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await authenticatedFetch(`/api/v1/url-import/jobs/${jobId}`, { method: 'GET' });
      const json = await safeJson(res, { context: 'Poll URL import job' });
      if (res.ok && json.success) {
        const job = json.data || {};
        const total = job?.progress?.total || 0;
        const processed = job?.progress?.processed || 0;
        const status = job?.status || 'pending';
        const pct = total > 0 ? Math.min(95, Math.round((processed / total) * 90) + 5) : 10;

        patchImportState({
          phase: status === 'completed' ? 'complete' : status === 'failed' ? 'error' : 'fetching',
          platform: 'url',
          progress: pct,
          message: status === 'saving'
            ? 'Saving tracks…'
            : status === 'matching'
            ? `Matching tracks… (${processed}/${total})`
            : status === 'resolving'
            ? 'Resolving URL…'
            : 'Importing…',
          selectionId: jobId,
          error: status === 'failed' ? (job?.last_error || 'Import failed') : null
        });

        if (status === 'completed' || status === 'failed') return job;
      }
      await wait(intervalMs);
    }
    return null;
  }, [authenticatedFetch, patchImportState, wait]);

  const handleUrlImport = useCallback(async (url, { mergeMode = 'append' } = {}) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    siteAnalytics.trackFeatureStart('curator_create', 'import_submit', { url: trimmedUrl.substring(0, 64) });

    patchImportState({
      phase: 'fetching',
      platform: 'url',
      progress: 5,
      message: 'Starting URL import…',
      selectionId: trimmedUrl,
      error: null
    });

    try {
      const resp = await authenticatedFetch('/api/v1/url-import/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: trimmedUrl,
          playlist_id: playlist?.id || null,
          mode: mergeMode,
          append_position: 'bottom',
          update_metadata: true,
          draft_session_id: playlist?.id ? null : draftSessionIdRef.current
        })
      });
      const json = await safeJson(resp, { context: 'Create URL import job' });
      if (!resp.ok || !json.success) throw new Error(json.error || json.message || 'Failed to start URL import');

      const jobId = json.data?.jobId;
      if (!jobId) throw new Error('Import job id missing');

      urlImportJobRef.current = jobId;
      patchImportState({
        phase: 'fetching',
        platform: 'url',
        progress: 10,
        message: 'Resolving URL…',
        selectionId: jobId,
        error: null
      });

      const final = await pollUrlImportJob(jobId);
      if (!final) throw new Error('Import job timed out');
      if (final.status === 'failed') throw new Error(final.last_error || 'Import failed');

      const playlistId = final?.result?.playlist_id || final?.target_playlist_id || null;
      if (playlistId) {
        await syncPlaylistFromServer(playlistId, { attempts: 10, delay: 1000 });
        triggerCrossLinkingBackground(playlistId);
      }

      setPastedUrl('');
      siteAnalytics.trackFeatureComplete('curator_create', 'import_success');

      // Derive import result counts for ImportModal result panel
      const importedCount = final?.result?.imported_tracks || final?.progress?.processed || 0;
      const totalCount = final?.result?.total_tracks || final?.progress?.total || 0;
      setLastImportResult({
        added: importedCount,
        skipped: totalCount - importedCount,
        unmatched: 0
      });

      patchImportState({
        phase: 'complete',
        platform: 'url',
        progress: 100,
        message: 'Import complete',
        selectionId: jobId,
        error: null
      });
    } catch (err) {
      siteAnalytics.trackFeatureError('curator_create', 'import_error', { error: (err.message || '').substring(0, 100) });
      patchImportState({
        phase: 'error',
        platform: 'url',
        progress: 0,
        message: '',
        error: err.message || 'URL import failed',
        selectionId: trimmedUrl
      });
    }
  }, [authenticatedFetch, patchImportState, playlist?.id, pollUrlImportJob, syncPlaylistFromServer, triggerCrossLinkingBackground]);

  // Debounced URL validation - single track auto-resolve only, playlists go through ImportModal confirm flow
  useEffect(() => {
    const trimmed = pastedUrl.trim();

    // Do not override another in-flight import
    if (importState.platform && importState.platform !== 'url' && importState.phase !== 'idle') {
      return;
    }

    // If a URL import is already running, avoid re-triggering
    if (importState.platform === 'url' && ['fetching', 'saving', 'linking'].includes(importState.phase)) {
      return;
    }

    if (!trimmed) {
      resetImportState();
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const detectRes = await authenticatedFetch('/api/v1/url-import/detect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: trimmed })
        });
        const detectJson = await safeJson(detectRes, { context: 'Detect URL import target' });
        const detected = detectJson?.data || null;
        if (!detectRes.ok || !detectJson.success || !detected?.platform) {
          throw new Error('Unsupported URL');
        }
        if (detected.kind === 'track') {
          // Single track URL — resolve and append immediately (lightweight)
          patchImportState({ phase: 'fetching', platform: 'url', progress: 20, message: 'Resolving track...', selectionId: trimmed, error: null });
          const trackRes = await authenticatedFetch('/api/v1/url-import/resolve-track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: trimmed, match: true })
          });
          const trackJson = await safeJson(trackRes, { context: 'Resolve track URL' });
          if (!trackRes.ok || !trackJson.success || !trackJson.data) {
            throw new Error(trackJson.error || 'Failed to resolve track');
          }
          const resolved = trackJson.data;
          const existingTracks = playlist?.tracks || [];
          const newTrack = {
            ...resolved,
            position: existingTracks.length + 1,
          };
          updatePlaylist({ tracks: [...existingTracks, newTrack] });
          setPastedUrl('');
          patchImportState({ phase: 'complete', platform: 'url', progress: 100, message: 'Track added', selectionId: trimmed, error: null });
          if (playlist?.id) {
            try { await persistPlaylist({ ...playlist, tracks: [...existingTracks, newTrack] }); } catch (_) { /* silent */ }
          }
          return;
        }
        // Playlist URLs: do NOT auto-import. User must confirm via ImportModal.
        // Just clear the pasted URL field so ImportModal can handle it through the DSP tab.
      } catch (e) {
        patchImportState({
          platform: 'url',
          phase: 'error',
          progress: 0,
          message: '',
          error: e.message || 'Unsupported URL',
          selectionId: trimmed
        });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [pastedUrl, importState.platform, importState.phase, patchImportState, resetImportState, authenticatedFetch, updatePlaylist, persistPlaylist, playlist]);

  const handleDspImportSelection = async (selection) => {
    if (!selection) return;
    const platformLabel = {
      spotify: 'Spotify',
      apple: 'Apple Music',
      tidal: 'TIDAL',
      qobuz: 'Qobuz',
      soundcloud: 'SoundCloud',
      youtube_music: 'YouTube Music'
    }[selection.platform] || selection.platform;
    patchImportState({
      phase: 'fetching',
      platform: selection.platform,
      progress: 5,
      message: 'Starting import...',
      selectionId: selection.id || null,
      error: null
    });
    
    // Create abort controller for this import
    const abortController = new AbortController();
    importAbortControllerRef.current = abortController;
    
    let linkTargetId = playlist?.id;
    let linkTrackTotal = playlist?.tracks?.length || 0;
    try {
      const result = await runAction('import', async () => {
        let targetId = playlist?.id;
        let targetTracks = playlist?.tracks || [];
        
        if (selection.platform === 'spotify') {
          // If URL-paste mode (no id), delegate to the generic URL import handler
          if (!selection.id && selection.url) {
            resetImportState();
            return handleUrlImport(selection.url, { mergeMode: selection.mergeMode || 'append' });
          }

          // Initialize progress tracking
          updateImportProgress(5, 'fetching', 'spotify', 'Initializing Spotify import...');

          // Start import API call immediately, ensureDraft can happen in parallel if needed
          await new Promise(resolve => setTimeout(resolve, 200));
          updateImportProgress(15, 'fetching', 'spotify', 'Connecting to Spotify...');

          const draftPromise = ensureDraft({
            title: selection.title || playlist?.title,
            description_short: selection.description || playlist?.description_short,
            image: selection.image || playlist?.image,
            spotify_url: selection.url || playlist?.spotify_url,
          });

          updateImportProgress(30, 'fetching', 'spotify', 'Fetching tracks from Spotify...');

          // Wait for draft, then immediately start import
          const draft = await draftPromise;
          updateImportProgress(50, 'saving', 'spotify', 'Processing tracks...');

          const resp = await authenticatedFetch('/api/v1/curator/dsp/spotify/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              playlist_id: draft.id,
              spotify_playlist_id: selection.id,
              mode: (playlist?.tracks?.length > 0) ? 'append' : 'replace',
              append_position: (playlist?.tracks?.length > 0) ? 'bottom' : 'top',
              update_metadata: !(playlist?.tracks?.length > 0),
              refresh_publish_date: false
            }),
            signal: abortController.signal
          });
          const json = await safeJson(resp, { context: 'Import Spotify playlist' });
          if (!resp.ok || !json.success) {
            // Handle specific Spotify Developer Dashboard error
            if (json.code === 'SPOTIFY_NOT_REGISTERED' || json.message?.includes('developer.spotify.com')) {
              const error = new Error(json.message || 'Your Spotify account needs to be registered in the Spotify Developer Dashboard. Please contact support.');
              error.code = 'SPOTIFY_NOT_REGISTERED';
              throw error;
            }
            throw new Error(json.error || json.message || 'Spotify import failed');
          }

          updateImportProgress(75, 'saving', 'spotify', 'Processing tracks...');

          // Try immediate fetch first, then poll with shorter delays if needed
          const synced = await syncPlaylistFromServer(draft.id, {
            attempts: 8,
            delay: 500, // Reduced delay for faster response
            signal: abortController.signal
          });
          if (!synced.length) throw new Error('Spotify import returned no tracks.');
          targetId = draft.id;
          targetTracks = synced;
        } else if (selection.platform === 'apple') {
          // If URL-paste mode (no id), delegate to the generic URL import handler
          if (!selection.id && selection.url) {
            resetImportState();
            return handleUrlImport(selection.url, { mergeMode: selection.mergeMode || 'append' });
          }

          // Initialize progress tracking
          updateImportProgress(10, 'fetching', 'apple', 'Connecting to Apple Music...');

          await new Promise(resolve => setTimeout(resolve, 300));
          updateImportProgress(25, 'fetching', 'apple', 'Fetching tracks from Apple Music...');

          const resp = await authenticatedFetch(`/api/v1/apple/import/${encodeURIComponent(selection.id)}`, {
            method: 'POST',
            signal: abortController.signal
          });
          const json = await safeJson(resp, { context: 'Import Apple playlist' });
          if (!resp.ok || !json.success) throw new Error(json.error || 'Apple import failed');
          const apple = json.data.applePlaylist || {};
          const tracks = json.data.tracks || [];

          updateImportProgress(50, 'saving', 'apple', 'Processing tracks...');

          await new Promise(resolve => setTimeout(resolve, 200));
          updateImportProgress(70, 'saving', 'apple', 'Creating playlist draft...');

          const draft = await ensureDraft({
            title: selection.title || apple.name || playlist?.title,
            description_short: selection.description || apple.description || playlist?.description_short,
            image: apple.image || selection.image || playlist?.image,
            apple_url: selection.url || playlist?.apple_url,
          });

          updateImportProgress(85, 'saving', 'apple', 'Saving tracks...');
          const existingTracks = (playlist?.tracks?.length > 0) ? playlist.tracks : [];
          const mergedTracks = existingTracks.length > 0
            ? normalizeTracks([...existingTracks, ...tracks])
            : normalizeTracks(tracks);
          const updated = await persistPlaylist({
            ...draft,
            id: draft.id,
            title: existingTracks.length > 0 ? draft.title : (selection.title || apple.name || draft.title),
            description_short: existingTracks.length > 0 ? draft.description_short : (selection.description || apple.description || draft.description_short),
            image: existingTracks.length > 0 ? draft.image : (apple.image || selection.image || draft.image),
            apple_url: selection.url || draft.apple_url || '',
            tracks: mergedTracks,
          });
          targetId = updated?.id || draft.id;
          targetTracks = normalizeTracks(updated?.tracks || tracks);
        } else if (selection.platform === 'tidal') {
          // If URL-paste mode (no id), delegate to the generic URL import handler
          if (!selection.id && selection.url) {
            resetImportState();
            return handleUrlImport(selection.url, { mergeMode: selection.mergeMode || 'append' });
          }

          // Initialize progress tracking
          updateImportProgress(10, 'fetching', 'tidal', 'Connecting to TIDAL...');

          await new Promise(resolve => setTimeout(resolve, 300));
          updateImportProgress(25, 'fetching', 'tidal', 'Fetching tracks from TIDAL...');

          const resp = await authenticatedFetch(`/api/v1/tidal/import/${encodeURIComponent(selection.id)}`, {
            method: 'POST',
            signal: abortController.signal
          });
          const json = await safeJson(resp, { context: 'Import TIDAL playlist' });
          if (!resp.ok || !json.success) throw new Error(json.error || 'TIDAL import failed');
          const tidal = json.data.tidalPlaylist || {};
          const tracks = json.data.tracks || [];

          updateImportProgress(50, 'saving', 'tidal', 'Processing tracks...');

          await new Promise(resolve => setTimeout(resolve, 200));
          updateImportProgress(70, 'saving', 'tidal', 'Creating playlist draft...');

          const draft = await ensureDraft({
            title: selection.title || tidal.name || playlist?.title,
            description_short: selection.description || tidal.description || playlist?.description_short,
            image: tidal.image || selection.image || playlist?.image,
            tidal_url: selection.url || playlist?.tidal_url,
          });

          updateImportProgress(85, 'saving', 'tidal', 'Saving tracks...');
          const existingTidalTracks = (playlist?.tracks?.length > 0) ? playlist.tracks : [];
          const mergedTidalTracks = existingTidalTracks.length > 0
            ? normalizeTracks([...existingTidalTracks, ...tracks])
            : normalizeTracks(tracks);
          const updated = await persistPlaylist({
            ...draft,
            id: draft.id,
            title: existingTidalTracks.length > 0 ? draft.title : (selection.title || tidal.name || draft.title),
            description_short: existingTidalTracks.length > 0 ? draft.description_short : (selection.description || tidal.description || draft.description_short),
            image: existingTidalTracks.length > 0 ? draft.image : (tidal.image || selection.image || draft.image),
            tidal_url: selection.url || draft.tidal_url || '',
            tracks: mergedTidalTracks,
          });
          targetId = updated?.id || draft.id;
          targetTracks = normalizeTracks(updated?.tracks || tracks);
        } else if (selection.platform === 'youtube_music') {
          updateImportProgress(10, 'fetching', 'youtube_music', 'Connecting to YouTube Music...');

          await new Promise(resolve => setTimeout(resolve, 300));
          updateImportProgress(30, 'fetching', 'youtube_music', 'Fetching tracks from YouTube Music...');

          const endpoint = selection.id
            ? `/api/v1/youtube-music/import/${encodeURIComponent(selection.id)}`
            : '/api/v1/youtube-music/import-url';

          const resp = await authenticatedFetch(endpoint, {
            method: 'POST',
            headers: selection.id ? undefined : { 'Content-Type': 'application/json' },
            body: selection.id ? undefined : JSON.stringify({ url: selection.url }),
            signal: abortController.signal
          });
          const json = await safeJson(resp, { context: 'Import YouTube Music playlist' });
          if (!resp.ok || !json.success) throw new Error(json.error || json.message || 'YouTube Music import failed');
          const yt = json.data?.playlist || {};
          const tracks = json.data?.tracks || [];

          updateImportProgress(55, 'saving', 'youtube_music', 'Creating playlist draft...');

          const draft = await ensureDraft({
            title: selection.title || yt.name || playlist?.title,
            description_short: selection.description || yt.description || playlist?.description_short,
            image: selection.image || yt.image || playlist?.image,
            youtube_music_url: yt.youtube_music_url || selection.url || playlist?.youtube_music_url,
          });

          updateImportProgress(80, 'saving', 'youtube_music', 'Saving tracks...');
          const existingYtTracks = (playlist?.tracks?.length > 0) ? playlist.tracks : [];
          const mergedYtTracks = existingYtTracks.length > 0
            ? normalizeTracks([...existingYtTracks, ...tracks])
            : normalizeTracks(tracks);
          const updated = await persistPlaylist({
            ...draft,
            id: draft.id,
            title: existingYtTracks.length > 0 ? draft.title : (selection.title || yt.name || draft.title),
            description_short: existingYtTracks.length > 0 ? draft.description_short : (selection.description || yt.description || draft.description_short),
            image: existingYtTracks.length > 0 ? draft.image : (selection.image || yt.image || draft.image),
            youtube_music_url: yt.youtube_music_url || selection.url || draft.youtube_music_url || '',
            tracks: mergedYtTracks,
          });
          targetId = updated?.id || draft.id;
          targetTracks = normalizeTracks(updated?.tracks || tracks);
        } else if (selection.platform === 'qobuz') {
          // Use unified URL import job approach (same as site admin)
          updateImportProgress(5, 'fetching', 'qobuz');
          patchImportState({ message: 'Starting Qobuz import...' });

          // Ensure we have a draft playlist to import into
          const draft = await ensureDraft({
            title: selection.title || playlist?.title,
            description_short: selection.description || playlist?.description_short,
            image: selection.image || playlist?.image,
          });

          updateImportProgress(10, 'fetching', 'qobuz');
          patchImportState({ message: 'Resolving Qobuz playlist...' });

          // Create URL import job via unified endpoint
          const hasExistingQobuzTracks = (playlist?.tracks?.length > 0);
          const jobResp = await authenticatedFetch('/api/v1/url-import/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: selection.url,
              playlist_id: draft.id,
              mode: hasExistingQobuzTracks ? 'append' : 'replace',
              append_position: 'bottom',
              update_metadata: !hasExistingQobuzTracks
            }),
            signal: abortController.signal
          });

          const jobJson = await safeJson(jobResp, { context: 'Create Qobuz URL import job' });
          if (!jobResp.ok || !jobJson.success) {
            throw new Error(jobJson.error || jobJson.message || 'Failed to start Qobuz import');
          }

          const jobId = jobJson.data?.jobId;
          if (!jobId) throw new Error('Import job id missing');

          urlImportJobRef.current = jobId;
          updateImportProgress(20, 'fetching', 'qobuz');
          patchImportState({ message: 'Fetching and matching tracks...' });

          // Poll for job completion
          const finalJob = await pollUrlImportJob(jobId);
          if (!finalJob) throw new Error('Import job timed out');
          if (finalJob.status === 'failed') throw new Error(finalJob.last_error || 'Qobuz import failed');

          const importedCount = finalJob.result?.imported_tracks || 0;
          updateImportProgress(90, 'saving', 'qobuz');
          patchImportState({ message: `Imported ${importedCount} track${importedCount === 1 ? '' : 's'}` });

          targetId = finalJob.result?.playlist_id || draft.id;

          // Sync playlist from server to get the updated tracks
          const synced = await syncPlaylistFromServer(targetId, {
            attempts: 8,
            delay: 500,
            signal: abortController.signal
          });

          updateImportProgress(95, 'saving', 'qobuz');
          targetTracks = synced?.length ? synced : [];
        } else if (selection.platform === 'soundcloud') {
          // Use unified URL import job approach (same as site admin)
          updateImportProgress(5, 'fetching', 'soundcloud');
          patchImportState({ message: 'Starting SoundCloud import...' });

          // Ensure we have a draft playlist to import into
          const draft = await ensureDraft({
            title: selection.title || playlist?.title,
            description_short: selection.description || playlist?.description_short,
            image: selection.image || playlist?.image,
            soundcloud_url: selection.url || playlist?.soundcloud_url,
          });

          updateImportProgress(10, 'fetching', 'soundcloud');
          patchImportState({ message: 'Resolving SoundCloud URL...' });

          // Create URL import job via unified endpoint
          const hasExistingScTracks = (playlist?.tracks?.length > 0);
          const jobResp = await authenticatedFetch('/api/v1/url-import/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: selection.url,
              playlist_id: draft.id,
              mode: hasExistingScTracks ? 'append' : 'replace',
              append_position: 'bottom',
              update_metadata: !hasExistingScTracks
            }),
            signal: abortController.signal
          });

          const jobJson = await safeJson(jobResp, { context: 'Create SoundCloud URL import job' });
          if (!jobResp.ok || !jobJson.success) {
            throw new Error(jobJson.error || jobJson.message || 'Failed to start SoundCloud import');
          }

          const jobId = jobJson.data?.jobId;
          if (!jobId) throw new Error('Import job id missing');

          urlImportJobRef.current = jobId;
          updateImportProgress(20, 'fetching', 'soundcloud');
          patchImportState({ message: 'Fetching and matching tracks...' });

          // Poll for job completion
          const finalJob = await pollUrlImportJob(jobId);
          if (!finalJob) throw new Error('Import job timed out');
          if (finalJob.status === 'failed') throw new Error(finalJob.last_error || 'SoundCloud import failed');

          const importedCount = finalJob.result?.imported_tracks || 0;
          updateImportProgress(90, 'saving', 'soundcloud');
          patchImportState({ message: `Imported ${importedCount} track${importedCount === 1 ? '' : 's'}` });

          targetId = finalJob.result?.playlist_id || draft.id;

          // Sync playlist from server to get the updated tracks
          const synced = await syncPlaylistFromServer(targetId, {
            attempts: 8,
            delay: 500,
            signal: abortController.signal
          });

          updateImportProgress(95, 'saving', 'soundcloud');
          targetTracks = synced?.length ? synced : [];
        }

        // For Spotify, syncPlaylistFromServer already updated the state
        // For Apple/TIDAL/Qobuz, sync with server to get real database IDs
        if (selection.platform !== 'spotify' && targetId) {
          const synced = await syncPlaylistFromServer(targetId, {
            attempts: 8,
            delay: 500,
            signal: abortController.signal
          });
          if (synced?.length) {
            targetTracks = synced;
          }
        }
        
        linkTargetId = targetId;
        linkTrackTotal = targetTracks?.length || linkTrackTotal;

        // Refresh export validation after import completes (tracks are now in playlist)
        if (typeof loadExportValidation === 'function') {
          loadExportValidation();
        }

        return { targetId, total: targetTracks?.length || 0 };
      }, { successMessage: 'Import complete' });

      // Start cross-linking in background (non-blocking) after import completes
      if (result?.targetId) {
        triggerCrossLinkingBackground(result.targetId, result?.total || linkTrackTotal);
      }

      // Immediate feedback update
      patchImportState({
        phase: 'complete',
        platform: selection.platform,
        progress: 100,
        message: `Imported ${result?.total || linkTrackTotal} tracks from ${platformLabel}. Cross-linking tracks in background...`,
        error: null,
        selectionId: null
      });
      // Keep import tools open so user can add more tracks from other sources
      setImportResetKey(k => k + 1);
    } catch (err) {
      // Show error feedback to user instead of clearing it
      const message = err.message === 'Import cancelled'
        ? 'Import cancelled'
        : `Import failed: ${err.message || 'Unknown error'}`;
      patchImportState({
        phase: 'error',
        platform: selection.platform,
        progress: 0,
        message,
        error: message,
        selectionId: null
      });
      console.error('Import error:', err);
    } finally {
      patchImportState({ selectionId: null });
      importAbortControllerRef.current = null;
    }
  };

  const handleCancelImport = useCallback(() => {
    if (importAbortControllerRef.current) {
      importAbortControllerRef.current.abort();
      importAbortControllerRef.current = null;
    }
    patchImportState({
      phase: 'idle',
      platform: null,
      progress: 0,
      message: 'Import cancelled',
      error: null,
      selectionId: null
    });
  }, [patchImportState]);


  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);

  const handleDiscardAndExit = useCallback(async () => {
    const hasSavedDraft = Boolean(playlist?.id) && !playlist?.published;
    const confirmed = window.confirm(
      hasSavedDraft
        ? 'Discard this draft and delete it from your playlists? This cannot be undone.'
        : 'Discard changes and return to your playlist dashboard? Unsaved edits on this page will be cleared.'
    );
    if (!confirmed) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    try {
      if (hasSavedDraft) {
        await runAction('discard', async () => {
          const res = await authenticatedFetch(`/api/v1/playlists/${playlist.id}`, { method: 'DELETE' });
          const json = await safeJson(res, { context: 'Discard playlist draft' });
          if (!res.ok || !json?.success) {
            throw new Error(json?.error || json?.message || 'Failed to discard draft playlist');
          }
        }, { successMessage: 'Draft discarded' });
        cacheService.invalidatePlaylist(playlist.id);
      }

      if (playlist?.id) {
        clearExportIntent(playlist.id);
      }
      sessionStorage.removeItem(SESSION_KEY);
      window.location.href = CURATOR_DASHBOARD_HOME;
    } catch (_) {
      // handled by runAction error state
    }
  }, [playlist?.id, playlist?.published, runAction, authenticatedFetch, clearExportIntent]);

  const handleSaveAndReturn = async () => {
    try {
      await runAction('saveAndReturn', async () => {
        validatePlaylist(playlist);
        const saved = await persistPlaylist({ ...playlist, published: false });
        if (saved?.id) {
          persistExportIntent(saved.id, exportIntent || 'publish-then-export');
        }
      }, { successMessage: 'Draft saved' });
      window.location.href = '/curator-admin';
    } catch (_) {
      // handled globally
    }
  };

  // Helper to check if cross-platform linking is needed and trigger it if so
  const triggerLinkingIfNeeded = useCallback(async (playlistId) => {
    if (!playlistId || !authenticatedFetch) return;
    
    try {
      // Check if linking has already been completed
      const statsRes = await authenticatedFetch(`/api/v1/cross-platform/stats/${playlistId}`, { method: 'GET' });
      const statsData = await safeJson(statsRes, { context: 'Check linking status' });
      
      if (statsRes.ok && statsData.success) {
        const stats = statsData.data || {};
        const totalTracks = stats.total_tracks || 0;
        const completed = stats.completed || 0;
        
        // If all tracks are already linked, skip
        if (totalTracks > 0 && completed >= totalTracks) {
          return; // Already linked
        }
      }
      
      // If we get here, linking is needed - trigger it
      await authenticatedFetch('/api/v1/cross-platform/link-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistId })
      });
    } catch (e) {
      // best-effort - if check fails, try linking anyway
      try {
        await authenticatedFetch('/api/v1/cross-platform/link-playlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playlistId })
        });
      } catch (linkErr) {
        // Silently fail - linking is not required for publishing
      }
    }
  }, [authenticatedFetch]);

  const handlePublish = async () => {
    if (playlist?.published) return;
    siteAnalytics.trackClick('curator_create', 'publish_click');
    validatePlaylist(playlist);
    const saved = await persistPlaylist({ ...playlist, published: false });
    if (!saved?.id) throw new Error('Save this playlist before publishing.');
    const publishResponse = await publishPlaylist(saved.id);
    if (!publishResponse?.published) {
      siteAnalytics.trackFeatureError('curator_create', 'publish_error', { playlist_id: String(saved.id) });
      throw new Error('Playlist publish failed - server did not confirm publication');
    }
    siteAnalytics.trackFeatureComplete('curator_create', 'publish_success', { playlist_id: String(saved.id) });
    cacheService.invalidatePlaylist(saved.id);
    dispatch({ type: 'setPlaylist', playlist: { ...saved, ...publishResponse, published: true } });
    triggerCrossLinkingBackground(saved.id, saved.tracks?.length || 0);
    setTimeout(() => cacheService.preloadPlaylistData(saved.id), 500);
  };

  const handlePublishAndView = async () => {
    if (playlist?.published) {
      window.location.href = `/playlists/${playlist.id}`;
      return;
    }
    try {
      await runAction('publish', async () => {
        validatePlaylist(playlist);
        const saved = await persistPlaylist({ ...playlist, published: false });
        if (!saved?.id) throw new Error('Save this playlist before publishing.');
        const publishResponse = await publishPlaylist(saved.id);
        if (!publishResponse?.published) {
          throw new Error('Playlist publish failed - server did not confirm publication');
        }
        // Invalidate cache so the published playlist is immediately visible
        cacheService.invalidatePlaylist(saved.id);
        dispatch({ type: 'setPlaylist', playlist: { ...saved, ...publishResponse, published: true } });
        // Trigger cross-platform linking in background (non-blocking)
        triggerCrossLinkingBackground(saved.id, saved.tracks?.length || 0);
        // Pre-warm cache for public view (non-blocking)
        setTimeout(() => cacheService.preloadPlaylistData(saved.id), 500);
      }, { successMessage: 'Playlist published' });
      if (playlist?.id || state.playlist?.id) {
        const targetId = playlist?.id || state.playlist?.id;
        window.location.href = `/playlists/${targetId}`;
      }
    } catch (_) {
      // handled globally
    }
  };

  const handleExport = async (intentOverride = null) => {
    const effectiveIntent = intentOverride || exportIntent || 'publish-only';
    try {
      await runAction('export', async () => {
        const needsPublish = effectiveIntent === 'publish-then-export' || (effectiveIntent === 'export-only' && !playlist?.published);

        if (needsPublish && !playlist?.published) {
          validatePlaylist(playlist);
          const saved = await persistPlaylist({ ...playlist, published: false });
          if (!saved?.id) throw new Error('Save this playlist before publishing.');
          const publishResponse = await publishPlaylist(saved.id);
          if (!publishResponse?.published) {
            throw new Error('Playlist publish failed - server did not confirm publication');
          }
          // Invalidate cache so the published playlist is immediately visible
          cacheService.invalidatePlaylist(saved.id);
          dispatch({ type: 'setPlaylist', playlist: { ...saved, ...publishResponse, published: true } });
          // Trigger cross-platform linking in background (non-blocking)
          triggerCrossLinkingBackground(saved.id, saved.tracks?.length || 0);
          // Pre-warm cache for public view (non-blocking)
          setTimeout(() => cacheService.preloadPlaylistData(saved.id), 500);
          if (effectiveIntent === 'publish-then-export') {
            persistExportIntent(saved.id, 'publish-then-export');
          }
        }

        if (effectiveIntent === 'export-only' && !playlist?.published) {
          persistExportIntent(playlist?.id, 'export-only');
        }

        setExportOpen(true);
      }, { successMessage: effectiveIntent === 'publish-then-export' ? 'Published and ready to export' : 'Ready to export' });
    } catch (_) {
      // handled globally
    }
  };

  const handleSchedulePublish = async (utcTimestamp) => {
    if (!playlist?.id) throw new Error('Save this playlist before scheduling.');
    await runAction('schedule', async () => {
      const res = await authenticatedFetch(`/api/v1/playlists/${playlist.id}/schedule-publish`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_publish_at: utcTimestamp })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to schedule publish');
      // Redirect to dashboard after brief delay
      setTimeout(() => {
        window.location.href = CURATOR_DASHBOARD_HOME;
      }, 2000);
    }, { successMessage: 'Publish scheduled' });
  };

  const trackCount = playlist?.tracks?.length || 0;
  const statusLabel = playlist?.published ? 'Published' : playlist?.id ? 'Draft' : 'Unsaved draft';
  const actionStatus = actionInFlight ? statusFromAction(actionInFlight) : null;
  const statusTone = actionStatus
    ? `${actionStatus.charAt(0).toUpperCase()}${actionStatus.slice(1)}…`
    : statusLabel;
  const savingNow = actionInFlight === 'saveAndReturn';
  const publishingNow = actionInFlight === 'publish';
  const importingNow = actionInFlight === 'import';
  const linkingNow = actionInFlight === 'link';
  const exportingNow = actionInFlight === 'export';
  const schedulingNow = actionInFlight === 'schedule';
  const discardingNow = actionInFlight === 'discard';
  const busy = !!actionInFlight;
  const instagramLinkReady = instagramFeatureEnabled && instagramAvailability.ready;
  const instagramLinkDisabled = !playlist?.id
    || !playlist?.tracks?.length
    || busy
    || instagramLinkState.status === 'in_progress'
    || !instagramLinkReady;
  const actionMessage = (() => {
    if (savingNow) return 'Saving draft…';
    if (publishingNow) return 'Publishing playlist…';
    if (schedulingNow) return 'Scheduling publish…';
    if (discardingNow) return 'Discarding draft…';
    if (importingNow) return 'Importing tracks…';
    if (linkingNow) return 'Linking tracks across DSPs…';
    if (exportingNow) return 'Opening export tools…';
    return message;
  })();
  const showImportOverlay = importState.platform
    && !['url', 'paste'].includes(importState.platform)
    && ['fetching', 'saving', 'linking'].includes(importState.phase);
  const isUrlImporting = importState.platform === 'url'
    && ['fetching', 'saving', 'linking'].includes(importState.phase);
  const dspImportMessage = importState.platform && !['url', 'paste'].includes(importState.platform || '')
    ? importState.message
    : '';
  const dspImportError = importState.platform && !['url', 'paste'].includes(importState.platform || '')
    ? importState.error
    : null;
  const urlImportMessage = importState.platform === 'url' ? importState.message : '';
  const urlImportError = importState.platform === 'url' ? importState.error : null;
  const pasteImportMessage = importState.platform === 'paste' ? importState.message : '';
  const pasteImportError = importState.platform === 'paste' ? importState.error : null;

  const hasTracks = Boolean(playlist?.tracks?.length);
  const exportIntentLabel = useMemo(() => {
    if (exportIntent === 'publish-then-export') return 'Publish + DSP export';
    if (exportIntent === 'export-only') return 'Export-only draft';
    if (playlist?.published) return 'Live on Flowerpil';
    return 'Flowerpil default';
  }, [exportIntent, playlist?.published]);

  if (!playlist) {
    return (
      <PageContainer>
        <PageHeader>
          <h1>New Playlist</h1>
          <HeaderActions>
            <Button variant='danger' onClick={handleDiscardAndExit} disabled={busy}>
              {discardingNow ? 'Discarding…' : 'Discard'}
            </Button>
            <Button variant='fpwhite' onClick={handleSaveAndReturn} disabled={busy}>
              {actionInFlight === 'saveAndReturn' ? 'Saving…' : 'Save & Close'}
            </Button>
          </HeaderActions>
        </PageHeader>
        <EditorContent>
          <ContentShell>
            <p style={{ textAlign: 'center', padding: theme.spacing.xl }}>Loading editor…</p>
          </ContentShell>
        </EditorContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader>
        <PageTitleBlock>
          <h1>New Playlist</h1>
          <PageSubtitle>
            {curator?.name ? `Curated by ${curator.name}` : 'Curator workspace'} · {statusLabel} · {trackCount} tracks
          </PageSubtitle>
          <HeaderMetaRow>
            <HeaderBadge>{statusTone}</HeaderBadge>
            <HeaderBadge>{trackCount} track{trackCount === 1 ? '' : 's'}</HeaderBadge>
          </HeaderMetaRow>
        </PageTitleBlock>
        <HeaderActions>
          <SidebarToggleButton variant="fpwhite" onClick={openSidebar}>
            Workspace
          </SidebarToggleButton>
          <Button variant='danger' onClick={handleDiscardAndExit} disabled={busy}>
            {discardingNow ? 'Discarding…' : 'Discard'}
          </Button>
          <Button variant='fpwhite' onClick={handleSaveAndReturn} disabled={busy || !playlist?.title?.trim()}>
            {actionInFlight === 'saveAndReturn' ? 'Saving…' : 'Save & Close'}
          </Button>
        </HeaderActions>
      </PageHeader>

      <EditorLayout>
        
        <SidebarOverlay $open={sidebarOpen} onClick={closeSidebar} />
        <Sidebar $open={sidebarOpen} aria-label="Workspace tabs">
          <SidebarCloseButton onClick={closeSidebar} aria-label="Close workspace tabs">
            &times;
          </SidebarCloseButton>
          <SidebarHeader>
            <SidebarTitle>Workspace</SidebarTitle>
          </SidebarHeader>
          <SidebarContextCard>
            <SidebarContextTitle>{playlist?.title?.trim() || 'Untitled playlist'}</SidebarContextTitle>
            <SidebarContextMeta>{statusLabel} · {trackCount} track{trackCount === 1 ? '' : 's'}</SidebarContextMeta>
          </SidebarContextCard>
          <SidebarTabList>
            {tabs.map((tab) => (
              <SidebarTab
                key={tab.id}
                type="button"
                $active={tab.id === activeTab}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSidebarOpen(false);
                }}
              >
                <SidebarStepBadge $active={tab.id === activeTab}>{tab.icon}</SidebarStepBadge>
                <SidebarTabText>
                  <SidebarTabLabel>{tab.label}</SidebarTabLabel>
                  <SidebarTabDescription>{tab.description}</SidebarTabDescription>
                </SidebarTabText>
              </SidebarTab>
            ))}
          </SidebarTabList>
          <SidebarFooter>
            <Button variant='fpwhite' onClick={() => { window.location.href = CURATOR_DASHBOARD_HOME; }}>
              All Playlists
            </Button>
          </SidebarFooter>
        </Sidebar>

        <EditorContent>
          {error?.message && (
            <DesktopStatusBanner $variant="error">
              <p>{error.message}</p>
            </DesktopStatusBanner>
          )}
          {!error?.message && actionMessage && !showImportOverlay && (
            <DesktopStatusBanner $variant="success">
              <p>{actionMessage}</p>
            </DesktopStatusBanner>
          )}
          <ContentShell>
            {activeTab === 'details' && (
              <SectionCard>
                <PlaylistForm
                  playlist={playlist || { title: '', description: '', description_short: '', tags: '', tracks: [] }}
                  onChange={updatePlaylist}
                  disabled={busy}
                  curatorMode={true}
                  forceCurator={forceCurator}
                  errors={detailsErrors}
                  hideScheduleBlock
                />
                {playlist?.title?.trim() && (
                  <TrackNextStepRow>
                    <TrackNextStepButton
                      variant="primary"
                      onClick={() => setActiveTab('cover')}
                      disabled={busy}
                    >
                      Next Step: Add Cover Image
                    </TrackNextStepButton>
                  </TrackNextStepRow>
                )}
              </SectionCard>
            )}

            {activeTab === 'tracks' && (
              <SectionCard>
                <>
                  <Panel>
<SectionHeader1>
  <h3 className="title">Tracklist Editor</h3>
  </SectionHeader1>
  
  </Panel>
  <Panel>
                        <CollapsibleSectionHeader
                          $isOpen={importToolsExpanded}
                          onClick={() => setImportToolsExpanded(!importToolsExpanded)}
                          role="button"
                          aria-expanded={importToolsExpanded}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setImportToolsExpanded(!importToolsExpanded);
                            }
                          }}
                        >
                          <h3 className="title">
                            Import Tools
                            <ToggleIcon $isOpen={importToolsExpanded}>▼</ToggleIcon>
                          </h3>
                        </CollapsibleSectionHeader>
                        
                        <CollapsibleContent $isOpen={importToolsExpanded}>
                          <div style={{ padding: theme.spacing.md }}>
                            {showImportOverlay ? (
                              <ImportProgressOverlay
                                phase={importState.phase}
                                platform={importState.platform}
                                progress={importState.progress}
                                onCancel={handleCancelImport}
                                trackCount={playlist?.tracks?.length || 0}
                              />
                            ) : (
                              <>
                                {/* Import Method Tabs */}
                                <ImportTabs>
                                  <ImportTab
                                    type="button"
                                    $active={importTab === 'dsp'}
                                    onClick={() => setImportTab('dsp')}
                                  >
                                    From URL
                                  </ImportTab>
                                  <ImportTab
                                    type="button"
                                    $active={importTab === 'library'}
                                    onClick={() => setImportTab('library')}
                                  >
                                    From Library
                                  </ImportTab>
                                  <ImportTab
                                    type="button"
                                    $active={importTab === 'paste'}
                                    onClick={() => setImportTab('paste')}
                                  >
                                    Paste Text
                                  </ImportTab>
                                </ImportTabs>

                                {/* From URL Tab Content */}
                                {importTab === 'dsp' && (
                                  <ImportTabContent>
                                    <ImportModal
                                      isOpen={true}
                                      onImported={handleDspImportSelection}
                                      processingId={importState.selectionId}
                                      actionLabel="Import"
                                      resetKey={importResetKey}
                                      authenticatedFetch={authenticatedFetch}
                                      importResult={lastImportResult}
                                    />
                                    {(dspImportMessage || dspImportError || error?.action === 'import') && (
                                      <StatusRow>
                                        <StatusDot $variant={(error?.action === 'import' || dspImportError) ? 'error' : 'active'} />
                                        {error?.action === 'import' ? error.message : (dspImportError || dspImportMessage)}
                                      </StatusRow>
                                    )}
                                  </ImportTabContent>
                                )}

                                {/* From Library Tab Content */}
                                {importTab === 'library' && (
                                  <ImportTabContent>
                                    <LibraryImportSection
                                      onImported={handleDspImportSelection}
                                      processingId={importState.selectionId}
                                    />
                                    {(dspImportMessage || dspImportError || error?.action === 'import') && (
                                      <StatusRow>
                                        <StatusDot $variant={(error?.action === 'import' || dspImportError) ? 'error' : 'active'} />
                                        {error?.action === 'import' ? error.message : (dspImportError || dspImportMessage)}
                                      </StatusRow>
                                    )}
                                  </ImportTabContent>
                                )}

                                {/* Paste Tab Content - Third */}
                                {importTab === 'paste' && (
                                  <ImportTabContent>
                                    <TextArea
                                      value={importText}
                                      onChange={(e) => setImportText(e.target.value)}
                                      placeholder="Artist - Track Title&#10;Another Artist - Another Track"
                                      disabled={importingNow || busy}
                                    />
                                    <ActionRow>
                                      <Button variant="fpwhite" onClick={() => setImportText('')} disabled={importingNow || busy || !importText.trim()}>
                                        Clear
                                      </Button>
                                      <Button variant="primary" onClick={handleTextImport} disabled={importingNow || busy || !importText.trim()}>
                                        {importingNow ? 'Adding…' : 'Add Tracks'}
                                      </Button>
                                    </ActionRow>
                                    {(pasteImportMessage || pasteImportError || error?.action === 'import') && (
                                      <StatusRow>
                                        <StatusDot $variant={(error?.action === 'import' || pasteImportError) ? 'error' : 'active'} />
                                        {error?.action === 'import' ? error.message : (pasteImportError || pasteImportMessage)}
                                      </StatusRow>
                                    )}
                                  </ImportTabContent>
                                )}

                                {/* Cross-linking Status Bar - Compact */}
                                {(linkingState.status !== 'idle' || linkStats || linkingState.total > 0) && (
                                  <LinkingStatusBar>
                                    <LinkingStatusRow>
                                      <StatusDot $variant={linkingState.status === 'success' ? 'success' : linkingState.status === 'error' ? 'error' : linkingState.status === 'in_progress' ? 'active' : 'muted'} />
                                      <LinkingStatusText>
                                        {linkingState.status === 'in_progress'
                                          ? `Linking ${linkingState.processed}/${linkingState.total} tracks…`
                                          : linkingState.status === 'success'
                                          ? 'Cross-linking complete'
                                          : linkStats
                                          ? `${linkStats.completed || linkStats.with_links || 0} tracks linked`
                                          : 'Cross-linking'}
                                      </LinkingStatusText>
                                      {linkStats && (
                                        <LinkingStats>
                                          {linkStats.spotify_links > 0 && (
                                            <LinkStatPill>
                                              <PlatformIcon platform="spotify" size={14} />
                                              {linkStats.spotify_links}
                                            </LinkStatPill>
                                          )}
                                          {linkStats.apple_links > 0 && (
                                            <LinkStatPill>
                                              <PlatformIcon platform="apple" size={14} />
                                              {linkStats.apple_links}
                                            </LinkStatPill>
                                          )}
                                          {linkStats.tidal_links > 0 && (
                                            <LinkStatPill>
                                              <PlatformIcon platform="tidal" size={14} />
                                              {linkStats.tidal_links}
                                            </LinkStatPill>
                                          )}
                                          {linkStats.youtube_links > 0 && (
                                            <LinkStatPill>
                                              <PlatformIcon platform="youtube_music" size={14} />
                                              {linkStats.youtube_links}
                                            </LinkStatPill>
                                          )}
                                        </LinkingStats>
                                      )}
                                    </LinkingStatusRow>
                                    {linkingState.status === 'in_progress' && (
                                      <ProgressBar $percent={linkingPercent} />
                                    )}
                                    {linkingState.status !== 'in_progress' && playlist?.tracks?.length > 0 && (
                                      <ActionRow style={{ marginTop: theme.spacing.xs }}>
                                        <Button
                                          variant="fpwhite"
                                          size="sm"
                                          onClick={() => fetchLinkStats(playlist?.id)}
                                          disabled={!playlist?.id || busy}
                                        >
                                          Refresh
                                        </Button>
                                        <Button
                                          variant="secondary"
                                          size="sm"
                                          onClick={() => startCrossLinking()}
                                          disabled={linkingState.status === 'in_progress' || !playlist?.tracks?.length || busy}
                                        >
                                          Link Now
                                        </Button>
                                      </ActionRow>
                                    )}
                                  </LinkingStatusBar>
                                )}
                              </>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Panel>

                    {instagramFeatureEnabled && (
                      <InlineCard style={{ margin: `0 ${theme.spacing.sm} ${theme.spacing.sm}` }}>
                        <InlineCardTitle>Instagram Profiles</InlineCardTitle>
                        <ActionRow style={{ marginTop: theme.spacing.sm }}>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={linkInstagramProfiles}
                            disabled={instagramLinkDisabled}
                          >
                            {instagramLinkState.status === 'in_progress' ? 'Linking...' : 'Link Instagram Profiles'}
                          </Button>
                        </ActionRow>
                        {instagramLinkState.status !== 'idle' && (
                          <StatusRow style={{ marginTop: theme.spacing.sm }}>
                            <StatusDot
                              $variant={instagramLinkState.status === 'success'
                                ? 'success'
                                : instagramLinkState.status === 'error'
                                ? 'error'
                                : 'active'}
                            />
                            {instagramLinkState.message}
                          </StatusRow>
                        )}
                      </InlineCard>
                    )}

                    <TrackList
                      tracks={playlist.tracks || []}
                      onChange={handleTracksChange}
                      onReorderTracks={handleTracksChange}
                      playlistId={playlist.id || null}
                      disabled={busy}
                      showLinkingStatus
                      onClearAll={() => handleTracksChange([])}
                    />
                    {playlist?.tracks?.length > 0 && (
                      <TrackNextStepRow>
                        <TrackNextStepButton
                          variant="primary"
                          onClick={() => setActiveTab('details')}
                          disabled={busy}
                        >
                          Next Step: Add Title & Description
                        </TrackNextStepButton>
                      </TrackNextStepRow>
                    )}
                </>
              </SectionCard>
            )}

            {activeTab === 'cover' && (
              <SectionCard>
                <Panel>
                  <SectionHeader1>
                    <h3 className="title">Cover Image</h3>
                  </SectionHeader1>
                </Panel>
                <div style={{ padding: theme.spacing.md }}>
                  <ImageUpload
                    currentImage={playlist?.image}
                    onImageUpload={(filenameOrUrl) => updatePlaylist({ image: filenameOrUrl })}
                    disabled={busy}
                    uploadType="playlists"
                    hideHeader
                  />
                  {/* Artwork suggestions from track artwork */}
                  {(() => {
                    const trackArtwork = (playlist?.tracks || [])
                      .map(t => t.artwork_url || t.album_artwork_url)
                      .filter(Boolean)
                      .filter((url, i, arr) => arr.indexOf(url) === i)
                      .slice(0, 6);
                    if (!trackArtwork.length) return null;
                    return (
                      <div style={{ marginTop: theme.spacing.md }}>
                        <div style={{
                          fontFamily: theme.fonts.mono,
                          fontSize: theme.fontSizes.tiny,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: theme.colors.black[600],
                          marginBottom: theme.spacing.sm
                        }}>
                          {playlist?.image ? 'Replace with track artwork' : 'Use track artwork'}
                        </div>
                        <div style={{ display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
                          {trackArtwork.map((url, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => updatePlaylist({ image: url })}
                              disabled={busy}
                              style={{
                                width: 80,
                                height: 80,
                                padding: 0,
                                border: `1px solid ${theme.colors.black[300]}`,
                                borderRadius: 4,
                                cursor: 'pointer',
                                overflow: 'hidden',
                                background: 'none',
                                transition: 'transform 0.15s ease, border-color 0.15s ease',
                              }}
                              onMouseOver={e => { e.currentTarget.style.borderColor = theme.colors.black; e.currentTarget.style.transform = 'scale(1.05)'; }}
                              onMouseOut={e => { e.currentTarget.style.borderColor = theme.colors.black[300]; e.currentTarget.style.transform = 'scale(1)'; }}
                            >
                              <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <TrackNextStepRow>
                  <TrackNextStepButton
                    variant="primary"
                    onClick={() => setActiveTab('publish')}
                    disabled={busy}
                  >
                    Next Step: Publish
                  </TrackNextStepButton>
                </TrackNextStepRow>
              </SectionCard>
            )}

            {activeTab === 'publish' && (
              <PublishExportWorkspace
                playlist={playlist}
                curatorId={curator?.id || null}
                onPublish={handlePublish}
                onPublishAndView={handlePublishAndView}
                onExport={handleExport}
                onSchedulePublish={handleSchedulePublish}
                exportIntent={exportIntent}
                onExportIntentChange={(intent) => {
                  setExportIntent(intent);
                  if (playlist?.id) {
                    persistExportIntent(playlist.id, intent);
                  }
                }}
                busy={busy}
                actionInFlight={actionInFlight}
                publishingNow={publishingNow}
                exportingNow={exportingNow}
                schedulingNow={schedulingNow}
                workspaceTab={workspaceTab}
                onWorkspaceTabChange={setWorkspaceTab}
                authenticatedFetch={authenticatedFetch}
              />
            )}
          </ContentShell>

          <SaveActionBar>
            {error?.message && (
              <SaveActionBarStatus $variant="error">
                <p>{error.message}</p>
              </SaveActionBarStatus>
            )}
            {!error?.message && actionMessage && !showImportOverlay && (
              <SaveActionBarStatus $variant="success">
                <p>{actionMessage}</p>
              </SaveActionBarStatus>
            )}
            <MobileWorkspaceSlider>
              {tabs.map((tab) => (
                <MobileWorkspaceChip
                  key={tab.id}
                  $active={activeTab === tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSidebarOpen(false);
                    if (tab.id === 'publish') {
                      setWorkspaceTab('export');
                    }
                  }}
                >
                  <MobileWorkspaceIcon>{tab.icon}</MobileWorkspaceIcon>
                  {tab.label}
                </MobileWorkspaceChip>
              ))}
            </MobileWorkspaceSlider>
            <SaveActionBarButtons>
              {!!playlist?.published && (
                <Button onClick={() => (window.location.href = `/playlists/${playlist.id}`)} variant="secondary">View live</Button>
              )}
            </SaveActionBarButtons>
          </SaveActionBar>
        </EditorContent>
      </EditorLayout>

      {playlist?.id && (
        <PlaylistExportModal
          isOpen={exportOpen}
          onClose={() => setExportOpen(false)}
          playlistId={playlist.id}
          playlist={playlist}
        />
      )}
    </PageContainer>
  );
}
