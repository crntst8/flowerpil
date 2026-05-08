import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { Section, SectionHeader } from '@shared/components/Blocks.jsx';
import { useAuth } from '@shared/contexts/AuthContext';
import { useSiteSettings } from '@shared/contexts/SiteSettingsContext';
import PlatformIcon from '@shared/components/PlatformIcon';
import PlaylistForm from '../../admin/components/PlaylistForm.jsx';
import ImageUpload from '../../admin/components/ImageUpload.jsx';
import TrackList from '../../admin/components/TrackList.jsx';
import ImportTools from '../../admin/components/ImportTools.jsx';
import PlaylistExportModal from '../../admin/components/PlaylistExportModal.jsx';
import { savePlaylist, publishPlaylist } from '../../admin/services/adminService.js';
import { adminPost, adminFetch, handleJsonResponse } from '../../admin/utils/adminApi.js';
import { safeJson } from '@shared/utils/jsonUtils';
import siteAnalytics from '@shared/utils/siteAnalytics';
import ImportModal from './ImportModal.jsx';
import PlaylistSyncModal from './PlaylistSyncModal.jsx';
import ImportProgressOverlay from './ImportProgressOverlay.jsx';
import { canSyncInPlace, getExportActionLabel, hasSyncableSelection } from '@shared/utils/exportHelpers';
import {
  Button,
  Select,
  PageContainer,
  SectionCard as BaseSectionCard,
  SectionTitle,
  EmptyState,
  StatusBanner,
  StickyActionBar,
  tokens,
  theme,
  mediaQuery,
} from './ui/index.jsx';
import { TextArea } from '@shared/styles/GlobalStyles';

// =============================================================================
// PAGE LAYOUT
// =============================================================================

const PageHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${tokens.spacing[4]};
  margin-bottom: ${tokens.spacing[4]};
  padding: ${tokens.spacing[4]} ${tokens.spacing[6]};
  background: ${theme.colors.black};
  border: ${theme.borders.solid} ${theme.colors.black};

  h1 {
    margin: 0;
    font-family: ${theme.fonts.primary};
    color: ${theme.colors.fpwhite};
    font-weight: ${theme.fontWeights.bold};
    letter-spacing: -0.8px;
    font-size: ${theme.fontSizes.h2};
  }

  ${mediaQuery.mobile} {
    flex-direction: column;
    align-items: flex-start;
    padding: ${tokens.spacing[4]};
    margin-bottom: ${tokens.spacing[2]};
    gap: ${tokens.spacing[2]};

    h1 {
      font-size: ${theme.fontSizes.h3};
    }
  }
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing[2]};

  ${mediaQuery.mobile} {
    width: 100%;
    flex-wrap: wrap;
    gap: ${tokens.spacing[1]};

    button, select {
      flex: 1;
      min-width: 140px;
      min-height: ${tokens.sizing.touchTarget};
      justify-content: center;
      text-align: center;
    }
  }
`;

const PlaylistSelector = styled(Select)`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  font-weight: ${theme.fontWeights.medium};
  padding: ${tokens.spacing[2]} ${tokens.spacing[4]};
  border-radius: 10px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #ffffff;
  color: #0f172a;
  cursor: pointer;
  transition: all ${tokens.transitions.fast};
  min-width: 200px;

  &:hover {
    border-color: ${theme.colors.primary};
  }

  &:focus {
    outline: none;
    border-color: ${theme.colors.primary};
    box-shadow: 0 0 0 3px rgba(49, 130, 206, 0.1);
  }

  ${mediaQuery.mobile} {
    width: 100%;
    min-width: auto;
  }
`;

// =============================================================================
// EDITOR LAYOUT
// =============================================================================

const EditorLayout = styled.div`
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: ${tokens.spacing[4]};
  align-items: start;

  @media (min-width: 1440px) {
    grid-template-columns: 300px 1fr;
    gap: ${tokens.spacing[6]};
  }

  ${mediaQuery.tablet} {
    grid-template-columns: 1fr;
  }
`;

// =============================================================================
// SIDEBAR
// =============================================================================

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
  top: ${tokens.spacing[4]};
  align-self: flex-start;
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.black};
  padding: ${tokens.spacing[4]};
  max-height: calc(100vh - ${tokens.spacing[4]} - ${tokens.spacing[4]});
  overflow: hidden;

  ${mediaQuery.tablet} {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    transform: translateX(${p => (p.$open ? '0' : '-110%')});
    transition: transform ${tokens.transitions.normal};
    max-height: none;
    width: min(85vw, 340px);
    z-index: 1001;
    padding: ${tokens.spacing[4]};
    box-shadow: 4px 0 0 ${theme.colors.black};
  }
`;

const SidebarHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[1]};
`;

const SidebarTitle = styled.h2`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  font-weight: ${theme.fontWeights.bold};
  letter-spacing: -0.5px;
  color: #0f172a;
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
    padding: ${tokens.spacing[1]};
  }
`;

const SidebarTabList = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};
  padding-right: ${tokens.spacing[1]};
`;

const SidebarTab = styled.button.withConfig({ shouldForwardProp: (p) => !['$active'].includes(p) })`
  position: relative;
  display: flex;
  align-items: center;
  gap: ${tokens.spacing[4]};
  padding: ${tokens.spacing[2]} ${tokens.spacing[4]};
  min-height: 48px;
  border-radius: 12px;
  border: 1px solid ${p => (p.$active ? 'rgba(49, 130, 206, 0.25)' : 'rgba(15, 23, 42, 0.06)')};
  background: ${p => (p.$active
    ? 'linear-gradient(135deg, rgba(49, 130, 206, 0.08), rgba(66, 153, 225, 0.05))'
    : '#ffffff')};
  cursor: pointer;
  text-align: left;
  color: #0f172a;
  transition: all ${tokens.transitions.fast};
  box-shadow: ${p => (p.$active
    ? '0 4px 12px rgba(49, 130, 206, 0.1)'
    : '0 1px 3px rgba(15, 23, 42, 0.04)')};

  &:hover {
    border-color: ${p => (p.$active ? 'rgba(49, 130, 206, 0.35)' : 'rgba(15, 23, 42, 0.12)')};
    background: ${p => (p.$active
      ? 'linear-gradient(135deg, rgba(49, 130, 206, 0.12), rgba(66, 153, 225, 0.08))'
      : '#ffffff')};
    transform: translateY(-1px);
    box-shadow: ${p => (p.$active
      ? '0 6px 16px rgba(49, 130, 206, 0.15)'
      : '0 4px 12px rgba(15, 23, 42, 0.08)')};
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
    transition: opacity ${tokens.transitions.fast};
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
  gap: ${tokens.spacing[1]};
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
  padding: ${tokens.spacing[3]};
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};
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
  gap: ${tokens.spacing[2]};
  flex-wrap: wrap;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.8;
`;

const SidebarButtonGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[1]};

  button {
    width: 100%;
    font-size: ${theme.fontSizes.small};
    font-weight: ${theme.fontWeights.semibold};
    padding: ${tokens.spacing[2]} ${tokens.spacing[4]};
    border-radius: 8px;
    transition: all ${tokens.transitions.fast};

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    &:active {
      transform: translateY(0);
    }
  }
`;

const SidebarFooter = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};
  padding-top: ${tokens.spacing[4]};
  border-top: 1px solid rgba(15, 23, 42, 0.08);
`;

const SidebarToggleButton = styled(Button)`
  display: none;

  ${mediaQuery.tablet} {
    display: inline-flex;
  }
`;

// =============================================================================
// EDITOR CONTENT
// =============================================================================

const EditorContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[1]};
  max-width: 100%;

  ${mediaQuery.mobile} {
    gap: ${tokens.spacing[1]};
    width: 100%;
    overflow-x: hidden;
  }
`;

const ContentShell = styled.div`
  display: flex;
  flex-direction: column;
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.black};
  padding: ${tokens.spacing[4]};
  gap: ${tokens.spacing[2]};

  ${mediaQuery.tablet} {
    padding: ${tokens.spacing[2]};
    gap: ${tokens.spacing[1]};
  }

  ${mediaQuery.mobile} {
    padding: ${tokens.spacing[2]};
    gap: ${tokens.spacing[1]};
    max-width: 100%;
    overflow-x: hidden;
    box-sizing: border-box;
  }
`;

const SectionCard = styled(BaseSectionCard)`
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.black};
  padding: 0;
  overflow: hidden;
  margin-bottom: 0;

  ${mediaQuery.mobile} {
    max-width: 100%;
    overflow-x: hidden;
    box-sizing: border-box;
  }
`;

const SectionCardHeader = styled.div`
  padding: ${tokens.spacing[2]} ${tokens.spacing[4]};
  margin: 0;
  display: flex;
  align-items: center;
  gap: ${tokens.spacing[2]};
  background: ${theme.colors.fpwhite};

  .title {
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.body};
    background: ${theme.colors.black};
    color: ${theme.colors.white};
    margin: 0;
    text-transform: capitalize;
    padding: 0.4em 0.6em;
    min-height: ${tokens.sizing.touchTarget};
    display: flex;
    align-items: center;
  }

  ${mediaQuery.tablet} {
    padding: ${tokens.spacing[2]};
  }

  ${mediaQuery.mobile} {
    padding: ${tokens.spacing[2]};
    flex-wrap: nowrap;
    overflow: visible;

    .title {
      font-size: ${theme.fontSizes.small};
      flex: 1;
      min-width: 0;
    }
  }
`;

const SectionCardContent = styled.div`
  padding: ${tokens.spacing[2]};

  ${mediaQuery.tablet} {
    padding: ${tokens.spacing[2]};
  }

  ${mediaQuery.mobile} {
    padding: ${tokens.spacing[2]};
    max-width: 100%;
    overflow-x: hidden;
    box-sizing: border-box;
  }
`;

// =============================================================================
// SAVE ACTION BAR
// =============================================================================

const SaveActionBar = styled(StickyActionBar)`
  position: fixed;
  flex-direction: column;
  gap: ${tokens.spacing[4]};

  ${mediaQuery.mobile} {
    padding: ${tokens.spacing[2]} ${tokens.spacing[4]};
    gap: ${tokens.spacing[2]};
  }
`;

const SaveActionBarButtons = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing[2]};
  flex-wrap: wrap;

  button {
    min-width: 120px;
    min-height: ${tokens.sizing.touchTarget};
    font-weight: ${theme.fontWeights.semibold};
  }

  ${mediaQuery.mobile} {
    width: 100%;
    gap: ${tokens.spacing[1]};

    button {
      flex: 1;
      min-height: ${tokens.sizing.touchTargetComfortable};
    }
  }
`;

const PublishPrimaryButton = styled(Button)`
  min-height: ${tokens.sizing.touchTargetComfortable};
  padding: ${tokens.spacing[2]} ${tokens.spacing[5]};
  font-size: ${theme.fontSizes.small};
  font-weight: ${theme.fontWeights.bold};
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: linear-gradient(135deg, #111827 0%, #1f2937 55%, #374151 100%);
  color: ${theme.colors.fpwhite};
  border-color: ${theme.colors.black};
  box-shadow: 0 14px 28px -20px rgba(15, 23, 42, 0.9);
  transition: transform ${tokens.transitions.fast}, box-shadow ${tokens.transitions.fast}, filter ${tokens.transitions.fast};

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 18px 32px -22px rgba(15, 23, 42, 0.95);
    filter: brightness(1.04);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 0 10px 22px -20px rgba(15, 23, 42, 0.9);
  }
`;

// =============================================================================
// HELPERS
// =============================================================================

const CollapsibleSectionHeader = styled(SectionCardHeader).withConfig({
  shouldForwardProp: (prop) => !['$isOpen'].includes(prop),
})`
  cursor: pointer;
  user-select: none;
  transition: background ${theme.transitions.fast};
  
  &:hover {
    background: ${({ $isOpen }) => $isOpen ? 'rgba(0, 0, 0, 0.95)' : 'rgba(0, 0, 0, 0.85)'};
  }
  
  .title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }
`;

const ToggleIcon = styled.span.withConfig({
  shouldForwardProp: (prop) => !['$isOpen'].includes(prop),
})`
  font-size: 12px;
  transition: transform ${theme.transitions.fast};
  transform: rotate(${({ $isOpen }) => $isOpen ? '180deg' : '0deg'});
  opacity: 0.8;
  margin-left: ${theme.spacing.sm};
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

const ModeSelectionRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.md};
  background: rgba(49, 130, 206, 0.05);
  border: 1px solid rgba(49, 130, 206, 0.15);
  border-radius: 8px;
  margin-bottom: ${theme.spacing.md};
`;

const ModeLabel = styled.label`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  font-weight: ${theme.fontWeights.semibold};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${theme.colors.black};
`;

const ModeOptions = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
`;

const ModeOption = styled.label`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  cursor: pointer;
`;

const ModeRadio = styled.input`
  cursor: pointer;
`;

const AppendPositionSelect = styled.div`
  margin-top: ${theme.spacing.xs};
  
  select {
    padding: ${theme.spacing.xs} ${theme.spacing.sm};
    border: 1px solid rgba(15, 23, 42, 0.14);
    border-radius: 4px;
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.small};
    background: ${theme.colors.fpwhite};
    cursor: pointer;
    
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
`;

const ImportTabs = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  border-bottom: 1px solid rgba(15, 23, 42, 0.1);
  margin-bottom: ${theme.spacing.md};
`;

const ImportTab = styled.button.withConfig({
  shouldForwardProp: (prop) => !['$active'].includes(prop),
})`
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

  &:hover:not(:disabled) {
    color: ${theme.colors.primary};
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ImportTabContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const ImportTextArea = styled(TextArea)`
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
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ImportActionRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
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
  margin-top: ${theme.spacing.sm};
`;

const StatusDot = styled.span.withConfig({
  shouldForwardProp: (prop) => !['$variant'].includes(prop),
})`
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

// =============================================================================
// PUBLISH/EXPORT WORKSPACE STYLED COMPONENTS
// =============================================================================

const SectionHeader1 = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};
  background: ${theme.colors.black};
  padding: 1em;

  .title {
    margin: 0;
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.h3};
    letter-spacing: -0.5px;
    background: ${theme.colors.black};
    text-transform: capitalize;
    color: ${theme.colors.fpwhite};
  }
`;

const WorkspaceTabPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[4]};
`;

const ExportOptions = styled.div`
  display: grid;
  gap: ${tokens.spacing[2]};
`;

const ExportOptionHeader = styled.div`
  font-weight: ${theme.fontWeights.bold};
  color: #0f172a;
  font-size: ${theme.fontSizes.body};
`;

const ExportOptionSubheader = styled.div`
  color: rgba(15, 23, 42, 0.7);
  font-size: ${theme.fontSizes.small};
  line-height: 1.5;
`;

const ExportOption = styled.button.withConfig({ shouldForwardProp: (p) => !['$checked'].includes(p) })`
  display: flex;
  align-items: flex-start;
  gap: ${tokens.spacing[2]};
  padding: ${tokens.spacing[4]};
  border-radius: 10px;
  border: 1px solid ${p => (p.$checked ? theme.colors.primary : 'rgba(15, 23, 42, 0.08)')};
  background: ${p => (p.$checked ? 'rgba(37, 99, 235, 0.05)' : '#ffffff')};
  cursor: pointer;
  transition: all ${tokens.transitions.fast};
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
    font-size: ${theme.fontSizes.body};
    color: #0f172a;
    line-height: 1.5;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
`;

const PlatformDestinationsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: ${tokens.spacing[4]};
  margin-bottom: ${tokens.spacing[4]};
`;

const PlatformDestinationCard = styled.button.withConfig({ shouldForwardProp: (p) => !['$selected', '$disabled', '$ready'].includes(p) })`
  position: relative;
  padding: ${tokens.spacing[4]};
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
  gap: ${tokens.spacing[2]};
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
  gap: ${tokens.spacing[2]};
`;

const DestinationCardIcon = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: ${tokens.spacing[1]};
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.04);
`;

const DestinationCardHeader = styled.div`
  display: grid;
  gap: 6px;
  flex: 1;
`;

const DestinationCardLabel = styled.div`
  font-size: ${theme.fontSizes.body};
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
  gap: ${tokens.spacing[1]};
  color: rgba(15, 23, 42, 0.75);
  font-size: ${theme.fontSizes.small};
  line-height: 1.5;
`;

const DestinationCardCopy = styled.div`
  color: rgba(15, 23, 42, 0.75);
  font-size: ${theme.fontSizes.small};
  line-height: 1.6;
`;

const AccountTypeSelector = styled.div`
  display: flex;
  gap: ${tokens.spacing[1]};
  margin-top: ${tokens.spacing[1]};
  padding-top: ${tokens.spacing[1]};
  border-top: 1px solid rgba(15, 23, 42, 0.08);
`;

const AccountTypeButton = styled.button.withConfig({ shouldForwardProp: (p) => !['$active'].includes(p) })`
  flex: 1;
  padding: ${tokens.spacing[1]} ${tokens.spacing[2]};
  border: 1px solid ${p => (p.$active ? theme.colors.primary : 'rgba(15, 23, 42, 0.16)')};
  background: ${p => (p.$active ? 'rgba(37, 99, 235, 0.1)' : '#ffffff')};
  color: ${p => (p.$active ? theme.colors.primary : 'rgba(15, 23, 42, 0.7)')};
  border-radius: 8px;
  font-size: ${theme.fontSizes.tiny};
  font-weight: ${p => (p.$active ? theme.fontWeights.semibold : theme.fontWeights.medium)};
  cursor: pointer;
  transition: all ${tokens.transitions.fast};
  font-family: ${theme.fonts.primary};

  &:hover {
    border-color: ${theme.colors.primary};
    background: ${p => (p.$active ? 'rgba(37, 99, 235, 0.15)' : 'rgba(37, 99, 235, 0.05)')};
  }
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

const ValidationStatus = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing[1]};
  padding: ${tokens.spacing[1]} ${tokens.spacing[2]};
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

const SelectionBanner = styled.div.withConfig({ shouldForwardProp: (p) => !['$variant'].includes(p) })`
  display: grid;
  gap: 6px;
  align-items: center;
  padding: ${tokens.spacing[2]} ${tokens.spacing[4]};
  border-radius: 12px;
  border: 1px solid ${p => (p.$variant === 'warning' ? theme.colors.warning : theme.colors.primary)};
  background: ${p => (p.$variant === 'warning'
    ? 'linear-gradient(135deg, #fff9e8 0%, #fff3d6 100%)'
    : 'linear-gradient(135deg, #e8f5ff 0%, #f5fbff 100%)')};
  margin-bottom: ${tokens.spacing[2]};
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

const ExportProgressSection = styled.div`
  padding: ${tokens.spacing[4]};
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
  margin-bottom: ${tokens.spacing[2]};
`;

const ExportProgressList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[1]};
`;

const ExportProgressRow = styled.div.withConfig({ shouldForwardProp: (p) => !['$status'].includes(p) })`
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: ${tokens.spacing[2]};
  align-items: center;
  padding: ${tokens.spacing[2]};
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
  gap: ${tokens.spacing[1]};
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

const PublishCardFooter = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${tokens.spacing[1]};
  align-items: center;
`;

const PublishMeta = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing[1]};
  flex-wrap: wrap;
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

// =============================================================================
// REPUBLISH EXPORT WORKSPACE COMPONENT
// =============================================================================

const RepublishExportWorkspace = ({
  playlist,
  curatorId = null,
  onRepublish,
  onExport,
  authenticatedFetch,
  busy,
  isRepublishing,
  isExporting
}) => {
  const [exportChoices, setExportChoices] = useState({ spotify: false, apple: false, tidal: false });
  const [authStatus, setAuthStatus] = useState({});
  const [exportValidation, setExportValidation] = useState({});
  const [accountTypes, setAccountTypes] = useState({ spotify: 'flowerpil', apple: 'flowerpil', tidal: 'flowerpil' });
  const [oauthApproval, setOauthApproval] = useState({ spotify: false, youtube: false });
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [isLoadingValidation, setIsLoadingValidation] = useState(false);
  const [exportProgress, setExportProgress] = useState({});
  const [exportComplete, setExportComplete] = useState(false);
  const [republishComplete, setRepublishComplete] = useState(false);

  const isPublished = playlist?.published;
  const hasTracks = Boolean(playlist?.tracks?.length);
  const platformLabels = { spotify: 'Spotify', apple: 'Apple Music', tidal: 'TIDAL', qobuz: 'Qobuz' };
  const selectedCount = Object.values(exportChoices).filter(Boolean).length;

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

  useEffect(() => {
    if (playlist?.id) {
      loadAuthStatus();
      loadExportValidation();
      loadOauthApproval();
    }
  }, [playlist?.id, loadAuthStatus, loadExportValidation, loadOauthApproval]);

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
    const accountType = accountTypes[platform] || 'curator';
    const selectedAuth = accountType === 'curator'
      ? (auth.contexts?.curator || {})
      : (auth.contexts?.flowerpil || {});
    const currentCuratorId = playlist?.curator_id || curatorId || null;

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

  // Check if any platform will actually sync in-place
  const currentCuratorId = playlist?.curator_id || curatorId || null;
  const hasSyncablePlatforms = hasSyncableSelection(
    ['spotify', 'tidal', 'apple'],
    exportChoices,
    exportValidation,
    accountTypes,
    currentCuratorId,
    'curator'
  );

  const handleExecuteRepublishAndExport = async () => {
    if (!playlist?.id || !playlist?.title?.trim()) return;
    
    setExportProgress({});
    setExportComplete(false);
    setRepublishComplete(false);
    
    try {
      // Refresh export validation and auth status
      const [freshValidation, freshAuthStatus] = await Promise.all([
        loadExportValidation(),
        loadAuthStatus()
      ]);

      let currentValidation = freshValidation || exportValidation;
      const currentAuthStatus = freshAuthStatus || authStatus;
      const selected = ['spotify', 'tidal', 'apple'].filter(k => exportChoices[k]);

      // Publish or re-publish based on current state
      if (isPublished) {
        // Already published - re-publish changes
        try {
          await onRepublish();
          setRepublishComplete(true);
        } catch (publishErr) {
          console.error('Failed to re-publish playlist:', publishErr);
          throw publishErr;
        }
      } else {
        // Draft state - publish for the first time
        try {
          await onRepublish();
          setRepublishComplete(true);
        } catch (publishErr) {
          console.error('Failed to publish playlist:', publishErr);
          throw publishErr;
        }

        // Wait briefly for cross-linking to start populating IDs, then refresh validation
        await new Promise(resolve => setTimeout(resolve, 3000));
        const postPublishValidation = await loadExportValidation();
        if (postPublishValidation) {
          currentValidation = postPublishValidation;
        }
      }

      if (selected.length === 0) {
        setExportComplete(true);
        return;
      }

      // Execute exports for each selected platform
      const exportPromises = selected.map(async (platform) => {
        const accountType = accountTypes[platform];
        const platformAuth = currentAuthStatus[platform];
        const selectedAuth = platformAuth?.contexts?.[accountType];
        const v = currentValidation[platform];

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

        if (!v?.exportable) {
          setExportProgress(p => ({
            ...p,
            [platform]: {
              status: 'error',
              message: 'No tracks available to export',
              accountType
            }
          }));
          return;
        }

        const willSync = canSyncInPlace(platform, v, accountType, currentCuratorId);
        setExportProgress(p => ({
          ...p,
          [platform]: {
            status: 'exporting',
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
                status: 'success',
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
                status: 'error',
                message: json.error || 'Export failed',
                accountType
              }
            }));
          }
        } catch (e) {
          setExportProgress(p => ({
            ...p,
            [platform]: {
              status: 'error',
              message: e.message || 'Export failed',
              accountType
            }
          }));
        }
      });

      await Promise.allSettled(exportPromises);
      setExportComplete(true);
    } catch (err) {
      console.error('Republish/export workflow failed:', err);
    }
  };

  const showSuccessState = (exportComplete || republishComplete) && !isExporting && !isRepublishing;
  const hasAnyExportUrl = exportProgress.spotify?.url || exportProgress.apple?.url || exportProgress.tidal?.url ||
    playlist?.spotify_url || playlist?.apple_url || playlist?.tidal_url;

  return (
    <SectionCard>
      <SectionCardHeader>
        <span className="title">{isPublished ? (hasSyncablePlatforms ? 'Re-publish & Sync' : 'Re-publish & Export') : (hasSyncablePlatforms ? 'Publish & Sync' : 'Publish & Export')}</span>
      </SectionCardHeader>
      <SectionCardContent>
        <WorkspaceTabPanel>
          {/* Platform destinations - always show */}
          <PlatformDestinationsGrid>
            {['spotify', 'apple', 'tidal'].map((platform) => {
              const isSelected = exportChoices[platform];
              const label = platformLabels[platform];
              const status = getPlatformStatus(platform);
              const accountType = accountTypes[platform] || 'curator';
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
                        {/* Hide "My Account" for Spotify/YouTube if not OAuth approved */}
                        {(platform === 'spotify' && !oauthApproval.spotify) || (platform === 'youtube_music' && !oauthApproval.youtube) ? (
                          <>
                            <AccountNote $connected={false}>
                              Exporting via Flowerpil account
                            </AccountNote>
                            <DestinationCardCopy style={{ fontSize: '11px', opacity: 0.7 }}>
                              Due to API limitations, direct account access is restricted.
                              {(platform === 'spotify' || platform === 'youtube_music') && ' Contact dev@flowerpil.com to request access.'}
                            </DestinationCardCopy>
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
                    ) : (
                      <DestinationCardCopy>
                        Tap to include in export
                      </DestinationCardCopy>
                    )}
                  </DestinationCardBody>
                </PlatformDestinationCard>
              );
            })}
          </PlatformDestinationsGrid>

          <SelectionBanner $variant={selectedCount === 0 ? 'warning' : 'success'}>
            <BannerLabel>{selectedCount === 0 ? 'Select Destinations' : `${selectedCount} Platform${selectedCount === 1 ? '' : 's'} Selected`}</BannerLabel>
            <BannerText>
              {selectedCount === 0
                ? `Choose at least one streaming platform above. ${isPublished ? 'Changes will be re-published to Flowerpil and pushed to selected platforms.' : 'Playlist will be published to Flowerpil and pushed to selected platforms.'}`
                : `Click the button below to ${isPublished ? 're-publish changes and' : ''} export`}
            </BannerText>
          </SelectionBanner>

          {/* Export Progress */}
          {(isExporting || isRepublishing || Object.keys(exportProgress).length > 0) && (
            <ExportProgressSection>
              <ExportProgressTitle>
                {isExporting || isRepublishing
                  ? (isPublished
                    ? (hasSyncablePlatforms ? 'Re-publishing & Syncing...' : 'Re-publishing & Exporting...')
                    : (hasSyncablePlatforms ? 'Publishing & Syncing...' : 'Publishing & Exporting...'))
                  : 'Export Results'}
              </ExportProgressTitle>
              <ExportProgressList>
                {Object.entries(exportProgress).map(([platform, result]) => {
                  const label = platformLabels[platform] || platform;
                  return (
                    <ExportProgressRow key={platform} $status={result.status}>
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
              </ExportProgressList>
            </ExportProgressSection>
          )}

          {/* Success State */}
          {showSuccessState && republishComplete && (
            <SelectionBanner $variant="success" style={{ background: 'linear-gradient(135deg, #e8fff0 0%, #f0fff5 100%)', borderColor: '#22c55e' }}>
              <BannerLabel style={{ color: '#166534' }}>
                {playlist?.published ? 'Changes Re-published' : 'Published to Flowerpil'}
              </BannerLabel>
              <BannerText style={{ color: '#166534' }}>
                Your playlist {playlist?.published ? 'changes are' : 'is'} now live on the main page. {playlist?.id && (
                  <a href={`/playlists/${playlist.id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#166534', fontWeight: 600 }}>
                    View playlist →
                  </a>
                )}
              </BannerText>
            </SelectionBanner>
          )}

          {/* Platform URLs after successful export */}
          {showSuccessState && hasAnyExportUrl && (
            <PublishMeta>
              {(exportProgress.spotify?.url || playlist?.spotify_url) && (
                <Pill 
                  as="a" 
                  href={exportProgress.spotify?.url || playlist?.spotify_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ cursor: 'pointer', textDecoration: 'none' }}
                >
                  <PlatformIcon platform="spotify" size={14} />
                  Open in Spotify
                </Pill>
              )}
              {(exportProgress.tidal?.url || playlist?.tidal_url) && (
                <Pill 
                  as="a" 
                  href={exportProgress.tidal?.url || playlist?.tidal_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ cursor: 'pointer', textDecoration: 'none' }}
                >
                  <PlatformIcon platform="tidal" size={14} />
                  Open in TIDAL
                </Pill>
              )}
              {(exportProgress.apple?.url || playlist?.apple_url) && (
                <Pill 
                  as="a" 
                  href={exportProgress.apple?.url || playlist?.apple_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ cursor: 'pointer', textDecoration: 'none' }}
                >
                  <PlatformIcon platform="apple" size={14} />
                  Open in Apple Music
                </Pill>
              )}
            </PublishMeta>
          )}

          <PublishCardFooter>
            {exportComplete && republishComplete ? (
              <>
                <Button
                  variant="action"
                  onClick={() => window.location.href = `/playlists/${playlist?.id}`}
                >
                  View Live
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => window.location.href = `/curator-admin/playlists?select=${playlist?.id}`}
                  style={{ marginLeft: tokens.spacing[1] }}
                >
                  Continue Editing
                </Button>
              </>
            ) : (
              <Button
                variant="action"
                onClick={handleExecuteRepublishAndExport}
                disabled={busy || isExporting || isRepublishing || !playlist?.title?.trim() || !hasTracks || selectedCount === 0}
              >
                {isExporting || isRepublishing
                  ? (isPublished ? (hasSyncablePlatforms ? 'Re-publishing & Syncing...' : 'Re-publishing & Exporting...') : 'Publishing & Exporting...')
                  : isPublished
                  ? `${hasSyncablePlatforms ? 'Re-publish & Sync' : 'Re-publish Changes & Export'}${selectedCount > 0 ? ` (${selectedCount})` : ''}`
                  : `${hasSyncablePlatforms ? 'Publish & Sync' : 'Publish & Export'}${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
              </Button>
            )}
          </PublishCardFooter>
        </WorkspaceTabPanel>
      </SectionCardContent>
    </SectionCard>
  );
};

export default function CuratorPlaylists() {
  const navigate = useNavigate();
  const location = useLocation();
  const { authenticatedFetch } = useAuth();
  const { isInstagramTrackLinkingEnabled } = useSiteSettings();
  const [curator, setCurator] = useState(null);
  const [playlist, setPlaylist] = useState({ title: '', description_short: '' });
  const [playlists, setPlaylists] = useState([]);
  const [instagramLinkState, setInstagramLinkState] = useState({ status: 'idle', message: '', updated: 0, skipped: 0, failed: 0 });
  const [instagramAvailability, setInstagramAvailability] = useState({ ready: false, loading: true, reason: '' });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isRepublishing, setIsRepublishing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [exportOpen, setExportOpen] = useState(false);
  const [showPublishCue, setShowPublishCue] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [activeTab, setActiveTab] = useState('tracks');
  const [isTrackModalOpen, setIsTrackModalOpen] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importPhase, setImportPhase] = useState(null);
  const [importPlatform, setImportPlatform] = useState(null);
  const [importFeedback, setImportFeedback] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importToolsExpanded, setImportToolsExpanded] = useState(false);
  const [importTab, setImportTab] = useState('dsp');
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState('replace');
  const [importAppendPosition, setImportAppendPosition] = useState('top');
  const [pastedUrl, setPastedUrl] = useState('');
  const [pastedUrlError, setPastedUrlError] = useState('');
  const [isImportingUrl, setIsImportingUrl] = useState(false);
  const [importingDspId, setImportingDspId] = useState(null);
  const [linkingState, setLinkingState] = useState({ status: 'idle', processed: 0, total: 0, message: '' });

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
        const json = await safeJson(res, { context: 'Instagram link status (editor)' });
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

  const tabs = useMemo(() => [
    { id: 'tracks', label: 'Tracks', description: 'Import, order, and edit track data', step: 1 },
    { id: 'details', label: 'Details', description: 'Title, description, tags, and links', step: 2 },
    { id: 'cover', label: 'Artwork', description: 'Upload and adjust cover image', step: 3 },
    { id: 'republish', label: 'Publish & Export', description: 'Republish and send to DSPs', step: 4 },
  ], []);

  const isLoadingDetails = Boolean(selectedId && playlist?.id !== selectedId);

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const refreshPlaylistDetails = useCallback(async (playlistId, { attempts = 8, delay = 3000 } = {}) => {
    for (let i = 0; i < attempts; i += 1) {
      try {
        const res = await authenticatedFetch(`/api/v1/playlists/${playlistId}`, { method: 'GET' });
        const data = await safeJson(res, { context: 'Load playlist detail' });
        if (res.ok && data.success) {
          const tracks = data.data?.tracks || [];
          const normalized = normalizeTracks(tracks);
          setPlaylist((prev) => ({ ...prev, ...(data.data || {}), tracks: normalized }));
          if (normalized.length > 0) {
            setStatus(`Import complete. Loaded ${normalized.length} tracks.`);
            return true;
          }
        }
      } catch (err) {
        console.warn('Failed to refresh playlist details', err);
      }
      if (i < attempts - 1) await wait(delay);
    }
    return false;
  }, [authenticatedFetch]);

  const loadPlaylistById = useCallback(
    async (id, { highlightTrack, setSelection = true } = {}) => {
      if (!id) return null;
      try {
        if (setSelection) {
          setSelectedId(id);
          const params = new URLSearchParams(window.location.search);
          params.set('select', id);
          const newUrl = `${window.location.pathname}?${params.toString()}`;
          window.history.replaceState({}, '', newUrl);
        }
        const res = await authenticatedFetch(`/api/v1/playlists/${id}`, { method: 'GET' });
        const data = await safeJson(res, { context: 'Load individual playlist for editing' });
        if (!res.ok || !data.success) throw new Error(data.message || data.error || 'Failed to load playlist');
        const payload = data.data;
        setPlaylist({
          id: payload.id,
          title: payload.title,
          publish_date: payload.publish_date,
          curator_id: payload.curator_id,
          curator_name: payload.curator_name,
          curator_type: payload.curator_type,
          description: payload.description,
          description_short: payload.description_short,
          tags: payload.tags,
          image: payload.image,
          published: payload.published,
          spotify_url: payload.spotify_url,
          apple_url: payload.apple_url,
          tidal_url: payload.tidal_url,
          custom_action_label: payload.custom_action_label,
          custom_action_url: payload.custom_action_url,
          custom_action_icon: payload.custom_action_icon,
          custom_action_icon_source: payload.custom_action_icon_source,
          auto_referral_enabled: payload.auto_referral_enabled,
          tracks: normalizeTracks(payload.tracks || []),
        });
        if (highlightTrack) {
          setTimeout(() => {
            const el = document.getElementById(`track-${highlightTrack}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 300);
        }
        if (setSelection) {
          setSidebarOpen(false);
        }
        return payload;
      } catch (err) {
        setError(err.message || 'Failed to load playlist');
        return null;
      }
    },
    [authenticatedFetch]
  );

  const refreshCuratorPlaylists = useCallback(
    async (curatorIdParam) => {
      const id = curatorIdParam || curator?.id;
      if (!id) return;
      try {
        const listRes = await authenticatedFetch(`/api/v1/playlists?curator_id=${id}`, { method: 'GET' });
        const listData = await safeJson(listRes, { context: 'Load curator playlists' });
        if (listRes.ok && listData.success) {
          const entries = Array.isArray(listData.data) ? listData.data : [];
          setPlaylists(entries);
          if (entries.length === 0) {
            setSelectedId(null);
            return;
          }
          if (selectedId && entries.some((entry) => entry.id === selectedId)) {
            return;
          }
          const params = new URLSearchParams(window.location.search);
          const selectParam = params.get('select');
          if (selectParam) {
            return;
          }
          const firstId = entries[0]?.id;
          if (firstId) {
            await loadPlaylistById(firstId);
          }
        }
      } catch (err) {
        console.warn('Failed to refresh curator playlists', err);
      }
    },
    [authenticatedFetch, curator?.id, loadPlaylistById, selectedId]
  );

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);

  const handleSelectPlaylist = useCallback(
    (id) => {
      if (!id) return;
      siteAnalytics.trackClick('curator_library', 'playlist_click', { playlist_id: String(id) });
      loadPlaylistById(id);
    },
    [loadPlaylistById]
  );

  const handleCopyLiveUrl = useCallback(async () => {
    if (!playlist?.id) return;
    const url = `${window.location.origin}/playlists/${playlist.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Live URL copied to clipboard');
      setTimeout(() => setStatus(''), 3000);
    } catch (err) {
      setError('Failed to copy URL');
    }
  }, [playlist?.id]);

  const handleSaveSuccess = useCallback(async (savedPayload, { fallback = {}, message = 'Saved playlist' } = {}) => {
    const base = fallback || {};
    const persisted = savedPayload || {};
    const fallbackTracks = Array.isArray(base.tracks) ? base.tracks : [];
    const persistedTracks = Array.isArray(persisted.tracks) ? persisted.tracks : fallbackTracks;
    const next = {
      ...base,
      ...persisted,
      tracks: normalizeTracks(persistedTracks)
    };

    const resolvedId = next.id || persisted.id || base.id || null;

    setPlaylist(next);
    if (resolvedId) {
      setSelectedId(resolvedId);
    }

    const statusLabel = `${message}${resolvedId ? ` #${resolvedId}` : ''}`.trim();
    if (statusLabel) {
      setStatus(statusLabel);
    }

    const shouldPromptPublish = !next?.published;
    if (shouldPromptPublish) {
      setShowPublishCue(true);
      setTimeout(() => setShowPublishCue(false), 3000);
    } else {
      setShowPublishCue(false);
    }

    if (curator) {
      await refreshCuratorPlaylists(curator.id);
    }

    return next;
  }, [curator, refreshCuratorPlaylists]);

  const parseTextTracks = useCallback((text) => {
    const lines = text.trim().split('\n').filter(line => line.trim());
    const tracks = [];
    
    for (let i = 0; i < lines.length; i++) {
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
      
      if (track) {
        tracks.push(track);
      }
    }
    
    return tracks;
  }, []);

  // Non-blocking version: triggers cross-linking and returns immediately
  const triggerCrossLinkingBackground = useCallback(async (targetPlaylistId, trackTotal = 0) => {
    if (!targetPlaylistId) return;

    try {
      setLinkingState({ status: 'in_progress', processed: 0, total: trackTotal, message: 'Linking tracks in background...' });

      const res = await authenticatedFetch('/api/v1/cross-platform/link-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistId: targetPlaylistId })
      });

      const json = await safeJson(res, { context: 'Start cross-platform linking' });

      if (res.ok && json.success) {
        setLinkingState(prev => ({ ...prev, message: 'Cross-linking started...' }));
        setTimeout(() => {
          setLinkingState(prev => ({ ...prev, status: 'success', message: 'Cross-linking in progress' }));
        }, 2000);
      } else {
        console.warn('Failed to start cross-linking:', json.error || 'Unknown error');
        setLinkingState({ status: 'error', processed: 0, total: trackTotal, message: json.error || 'Linking failed' });
      }
    } catch (err) {
      console.warn('Cross-linking request failed:', err);
      setLinkingState({ status: 'error', processed: 0, total: trackTotal, message: err.message || 'Linking failed' });
    }
  }, [authenticatedFetch]);

  const handleTextImport = useCallback(async () => {
    const text = importText.trim();
    if (!text || !playlist?.id) return;
    
    setIsImporting(true);
    setImportPhase('saving');
    setImportFeedback('Processing tracks...');
    setError('');
    
    try {
      const parsed = parseTextTracks(text);
      if (parsed.length === 0) {
        throw new Error('No valid tracks found in pasted text');
      }

      const existingTracks = playlist.tracks || [];
      let newTracks;
      
      if (importMode === 'replace') {
        newTracks = normalizeTracks(parsed);
      } else {
        // Append mode
        const combined = [...existingTracks, ...parsed];
        if (importAppendPosition === 'top') {
          newTracks = normalizeTracks([...parsed, ...existingTracks]);
        } else {
          newTracks = normalizeTracks(combined);
        }
      }

      setPlaylist((p) => ({ ...p, tracks: newTracks }));
      // Save the playlist
      setSaving(true);
      try {
        const saved = await savePlaylist({ ...playlist, tracks: newTracks });
        await handleSaveSuccess(saved, { fallback: { ...playlist, tracks: newTracks }, message: `Imported ${parsed.length} track${parsed.length === 1 ? '' : 's'} using ${importMode} mode` });

        // Trigger cross-linking after text import
        const savedPlaylistId = saved?.id || playlist?.id;
        if (savedPlaylistId) {
          triggerCrossLinkingBackground(savedPlaylistId, newTracks?.length || 0);
        }
      } catch (e) {
        setError(e.message || 'Failed to save');
      } finally {
        setSaving(false);
      }
      setImportText('');
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to import tracks');
    } finally {
      setIsImporting(false);
      setImportPhase(null);
      setImportProgress(0);
      setImportPlatform(null);
      setImportFeedback('');
    }
  }, [importText, importMode, importAppendPosition, playlist, parseTextTracks, handleSaveSuccess, savePlaylist, triggerCrossLinkingBackground]);

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
        setPlaylist((prev) => ({
          ...prev,
          tracks: (prev.tracks || []).map((track) => {
            const trackId = String(track?.id);
            if (updateMap.has(trackId)) {
              return { ...track, custom_sources: updateMap.get(trackId) };
            }
            return track;
          })
        }));
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
  }, [authenticatedFetch, instagramAvailability.ready, instagramFeatureEnabled, playlist?.id, playlist?.tracks, setPlaylist]);

  const pollUrlImportJob = useCallback(async (jobId, { timeoutMs = 10 * 60 * 1000, intervalMs = 2000 } = {}) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await authenticatedFetch(`/api/v1/url-import/jobs/${jobId}`, { method: 'GET' });
      const json = await safeJson(res, { context: 'Poll URL import job (editor)' });
      if (res.ok && json.success) {
        const job = json.data || {};
        const total = job?.progress?.total || 0;
        const processed = job?.progress?.processed || 0;
        const status = job?.status || 'pending';
        const pct = total > 0 ? Math.min(95, Math.round((processed / total) * 90) + 5) : 10;
        setImportProgress(pct);
        setImportPhase(status);
        setImportPlatform('url');
        setImportFeedback(status === 'saving'
          ? 'Saving tracks…'
          : status === 'matching'
          ? `Matching tracks… (${processed}/${total})`
          : status === 'resolving'
          ? 'Resolving URL…'
          : 'Importing…');
        if (status === 'completed' || status === 'failed') return job;
      }
      await wait(intervalMs);
    }
    return null;
  }, [authenticatedFetch]);

  const handleUrlImport = useCallback(async (url) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl || !playlist?.id) return;

    setPastedUrlError('');
    setIsImportingUrl(true);
    setIsImporting(true);
    setImportPhase('resolving');
    setImportPlatform('url');
    setImportProgress(5);
    setImportFeedback('Starting URL import…');
    setError('');

    try {
      const resp = await authenticatedFetch('/api/v1/url-import/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: trimmedUrl,
          playlist_id: playlist.id,
          mode: importMode,
          append_position: importAppendPosition,
          update_metadata: true
        })
      });

      const json = await safeJson(resp, { context: 'Create URL import job (editor)' });
      if (!resp.ok || !json.success) throw new Error(json.error || json.message || 'Failed to start URL import');

      const jobId = json.data?.jobId;
      if (!jobId) throw new Error('Import job id missing');

      const final = await pollUrlImportJob(jobId);
      if (!final) throw new Error('Import job timed out');
      if (final.status === 'failed') throw new Error(final.last_error || 'Import failed');

      await refreshPlaylistDetails(playlist.id, { attempts: 10, delay: 1500 });
      setPastedUrl('');
      setStatus(`Imported from URL using ${importMode} mode`);
      setError('');

      // Trigger cross-linking after URL import completes
      if (playlist.id) {
        triggerCrossLinkingBackground(playlist.id, playlist.tracks?.length || 0);
      }
    } catch (err) {
      setPastedUrlError(err.message || 'Failed to import from URL');
      setError(err.message || 'Failed to import from URL');
    } finally {
      setIsImportingUrl(false);
      setIsImporting(false);
      setImportPhase(null);
      setImportProgress(0);
      setImportPlatform(null);
      setImportFeedback('');
    }
  }, [authenticatedFetch, importAppendPosition, importMode, playlist?.id, pollUrlImportJob, refreshPlaylistDetails, triggerCrossLinkingBackground]);

  // Debounced URL validation and import
  useEffect(() => {
    if (isImporting || isImportingUrl) return;
    if (!pastedUrl.trim()) {
      setPastedUrlError('');
      return;
    }

    const timer = setTimeout(async () => {
      const trimmedUrl = pastedUrl.trim();
      try {
        const detectRes = await authenticatedFetch('/api/v1/url-import/detect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: trimmedUrl })
        });
        const detectJson = await safeJson(detectRes, { context: 'Detect URL target (editor)' });
        const detected = detectJson?.data || null;
        if (!detectRes.ok || !detectJson.success || !detected?.platform) {
          throw new Error('Unsupported URL');
        }
        if (detected.kind !== 'playlist' && detected.kind !== 'auto') {
          throw new Error('Paste a playlist URL (not a track URL)');
        }
        handleUrlImport(trimmedUrl);
      } catch (e) {
        setPastedUrlError(e.message || 'Unsupported URL');
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [authenticatedFetch, handleUrlImport, isImporting, isImportingUrl, pastedUrl]);

  const handleDspImportSelection = useCallback(async (selection) => {
    if (!selection || !playlist?.id) return;

    // Qobuz/SoundCloud/YouTube Music tabs are URL-driven; run through the unified URL importer so this
    // stays consistent and keeps working even if platform-specific endpoints change.
    if ((selection.platform === 'qobuz' || selection.platform === 'soundcloud' || selection.platform === 'youtube_music') && selection.url) {
      await handleUrlImport(selection.url);
      return;
    }

    setImportingDspId(selection.id || null);
    setIsImporting(true);
    setImportPhase('fetching');
    setImportPlatform(selection.platform);
    setImportProgress(0);
    setImportFeedback('');
    setError('');
    
    try {
      if (selection.platform === 'spotify') {
        setImportFeedback('Connecting to Spotify...');
        setImportProgress(20);
        
        const resp = await authenticatedFetch('/api/v1/curator/dsp/spotify/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playlist_id: playlist.id,
            spotify_playlist_id: selection.id,
            mode: importMode,
            append_position: importAppendPosition,
            update_metadata: true,
            refresh_publish_date: false
          })
        });
        
        const json = await safeJson(resp, { context: 'Import Spotify playlist' });
        if (!resp.ok || !json.success) {
          if (json.code === 'SPOTIFY_NOT_REGISTERED' || json.message?.includes('developer.spotify.com')) {
            throw new Error(json.message || 'Your Spotify account needs to be registered in the Spotify Developer Dashboard. Please contact support.');
          }
          throw new Error(json.error || json.message || 'Spotify import failed');
        }

        setImportProgress(70);
        setImportPhase('saving');
        setImportFeedback('Processing tracks...');

        // Refresh playlist details
        await refreshPlaylistDetails(playlist.id, { attempts: 8, delay: 2000 });
        setStatus(`Imported from Spotify using ${importMode} mode`);
        setError('');

        // Trigger cross-linking in background (Spotify backend may have started it, but ensure it runs)
        triggerCrossLinkingBackground(playlist.id, json.data?.stats?.total_after || playlist.tracks?.length || 0);
      } else {
        // For other platforms, use existing logic but respect mode
        setImportFeedback(`Importing from ${selection.platform}...`);
        // Note: Other platforms may not support mode yet, so we'll append by default
        const response = await adminFetch(`/api/v1/${selection.platform}/import/${encodeURIComponent(selection.id)}`, { method: 'POST' });
        const payload = await handleJsonResponse(response);
        const platformData = payload.data || {};
        const platformPlaylist = platformData[`${selection.platform}Playlist`] || {};
        const tracks = Array.isArray(platformData.tracks) ? normalizeTracks(platformData.tracks) : [];
        
        const existingTracks = playlist.tracks || [];
        let finalTracks;
        
        if (importMode === 'replace') {
          finalTracks = tracks;
        } else {
          if (importAppendPosition === 'top') {
            finalTracks = normalizeTracks([...tracks, ...existingTracks]);
          } else {
            finalTracks = normalizeTracks([...existingTracks, ...tracks]);
          }
        }

        setPlaylist((p) => ({
          ...p,
          title: p.title || selection.title || platformPlaylist.name || p.title,
          description_short: p.description_short || selection.description || platformPlaylist.description || p.description_short,
          spotify_url: selection.platform === 'spotify' ? (selection.url || p.spotify_url) : p.spotify_url,
          apple_url: selection.platform === 'apple' ? (selection.url || p.apple_url) : p.apple_url,
          tidal_url: selection.platform === 'tidal' ? (selection.url || p.tidal_url) : p.tidal_url,
          image: selection.image || platformPlaylist.image || p.image,
          tracks: finalTracks
        }));
        
        // Save the playlist
        setSaving(true);
        try {
          const saved = await savePlaylist({ ...playlist, tracks: finalTracks });
          await handleSaveSuccess(saved, { fallback: { ...playlist, tracks: finalTracks }, message: `Imported ${tracks.length} track${tracks.length === 1 ? '' : 's'} from ${selection.platform} using ${importMode} mode` });

          // Trigger cross-linking after import completes
          const targetId = saved?.id || playlist?.id;
          if (targetId) {
            triggerCrossLinkingBackground(targetId, finalTracks?.length || 0);
          }
        } catch (e) {
          setError(e.message || 'Failed to save');
        } finally {
          setSaving(false);
        }
        setError('');
      }
    } catch (err) {
      setError(err.message || 'Failed to import playlist');
    } finally {
      setImportingDspId(null);
      setIsImporting(false);
      setImportPhase(null);
      setImportProgress(0);
      setImportPlatform(null);
      setImportFeedback('');
    }
  }, [playlist, handleUrlImport, importMode, importAppendPosition, authenticatedFetch, refreshPlaylistDetails, handleSaveSuccess, savePlaylist, adminFetch, handleJsonResponse, triggerCrossLinkingBackground]);

  const handleSyncComplete = async (result) => {
    if (!result) return;
    const { platform, stats = {}, playlist: syncedPlaylist } = result;
    const platformLabel = platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : 'DSP';

    if (syncedPlaylist) {
      setPlaylist((prev) => ({
        ...prev,
        ...syncedPlaylist,
        tracks: normalizeTracks(syncedPlaylist.tracks || prev?.tracks || [])
      }));
      if (syncedPlaylist.id) {
        setSelectedId(syncedPlaylist.id);
      }
    }

    const added = Number.isFinite(stats.added) ? stats.added : null;
    const removed = Number.isFinite(stats.deleted) ? stats.deleted : null;
    const skipped = Number.isFinite(stats.skipped_duplicates) ? stats.skipped_duplicates : null;
    const total = Number.isFinite(stats.total_after) ? stats.total_after : null;

    const summaryTokens = [];
    if (added !== null) summaryTokens.push(`${added} added`);
    if (removed !== null && removed > 0) summaryTokens.push(`${removed} removed`);
    if (skipped !== null && skipped > 0) summaryTokens.push(`${skipped} skipped`);
    if (summaryTokens.length === 0 && total !== null) summaryTokens.push(`${total} tracks`);

    const statusLine = summaryTokens.length
      ? `Synced from ${platformLabel}: ${summaryTokens.join(', ')}`
      : `Synced from ${platformLabel}`;

    setStatus(statusLine);
    setError('');

    const targetId = syncedPlaylist?.id || playlist?.id || null;
    if (targetId) {
      await refreshPlaylistDetails(targetId, { attempts: 6, delay: 2000 });
    }
    if (curator?.id) {
      await refreshCuratorPlaylists(curator.id);
    }
  };

  useEffect(() => {
    if (!location.state || !location.state.refreshPlaylists) return;
    (async () => {
      try {
        await refreshCuratorPlaylists();
      } finally {
        navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: {} });
      }
    })();
  }, [location, navigate, refreshCuratorPlaylists]);

  useEffect(() => {
    siteAnalytics.trackFeatureStart('curator_library', 'page_load');
    const load = async () => {
      try {
        const res = await authenticatedFetch('/api/v1/curator/profile', { method: 'GET' });
        const data = await safeJson(res, { context: 'Load curator profile' });
        if (!res.ok || !data.success) throw new Error(data.message || data.error || 'Failed to load');
        setCurator(data.curator);
        setPlaylist((p) => ({
          ...p,
          curator_id: data.curator.id,
          curator_name: data.curator.name,
          curator_type: data.curator.profile_type,
        }));
        await refreshCuratorPlaylists(data.curator.id);
      } catch (e) {
        setError(e.message);
      }
    };
    load();
    const onRefresh = () => { load().catch((err) => console.warn('CuratorPlaylists refresh failed', err)); };
    window.addEventListener('flowerpil:refresh', onRefresh);
    return () => window.removeEventListener('flowerpil:refresh', onRefresh);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sel = params.get('select');
    const highlightTrackParam = params.get('highlightTrack');
    const id = sel ? parseInt(sel, 10) : null;
    if (!id) return;
    const exists = playlists.some((p) => p.id === id);
    if (!exists) return;
    if (selectedId !== id) {
      loadPlaylistById(id, { highlightTrack: highlightTrackParam || undefined });
      return;
    }
    if (highlightTrackParam && playlist?.id === id) {
      setTimeout(() => {
        const el = document.getElementById(`track-${highlightTrackParam}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [playlists, selectedId, playlist?.id, loadPlaylistById]);

  const onSave = async () => {
    if (!playlist?.title?.trim()) {
      setFormErrors({ title: 'Title is required' });
      setError('Playlist title is required');
      return;
    }

    setFormErrors({});
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const saved = await savePlaylist(playlist);
      await handleSaveSuccess(saved, { fallback: playlist, message: 'Saved playlist' });
    } catch (e) {
      setError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleRepublish = useCallback(async () => {
    if (!playlist?.id) return;
    const wasPublished = playlist?.published;
    siteAnalytics.trackClick('curator_library', wasPublished ? 'republish_click' : 'publish_click', { playlist_id: String(playlist.id) });
    try {
      setIsRepublishing(true);
      // Save any pending edits before publishing to ensure export uses latest data
      await savePlaylist(playlist);
      await publishPlaylist(playlist.id);
      const statusMessage = wasPublished
        ? `Re-published #${playlist.id}`
        : `Published #${playlist.id}`;
      setStatus(statusMessage);
      setPlaylist((p) => ({ ...p, published: true }));
      await refreshCuratorPlaylists(curator.id);
      try {
        await authenticatedFetch('/api/v1/cross-platform/link-playlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playlistId: playlist.id })
        });
        const linkStatusMessage = wasPublished
          ? `Re-published and started linking for #${playlist.id}`
          : `Published and started linking for #${playlist.id}`;
        setStatus(linkStatusMessage);
      } catch (e) {
        // best-effort
      }
    } catch (e) {
      const errorMessage = wasPublished
        ? (e.message || 'Failed to re-publish')
        : (e.message || 'Failed to publish');
      setError(errorMessage);
      throw e;
    } finally {
      setIsRepublishing(false);
    }
  }, [playlist?.id, playlist?.published, curator?.id, authenticatedFetch, refreshCuratorPlaylists]);

  const handleExport = useCallback(() => {
    setExportOpen(true);
  }, []);

  useEffect(() => {
    if (formErrors.title && playlist?.title?.trim()) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next.title;
        return next;
      });
    }
  }, [formErrors.title, playlist?.title]);

  const forceCurator = useMemo(() => (curator ? {
    id: curator.id,
    name: curator.name,
    profile_type: curator.profile_type,
  } : null), [curator]);

  const instagramLinkReady = instagramFeatureEnabled && instagramAvailability.ready;
  const instagramLinkDisabled = !playlist?.id
    || !playlist?.tracks?.length
    || saving
    || instagramLinkState.status === 'in_progress'
    || !instagramLinkReady;

  return (
    <PageContainer>
      <PageHeader>
        <h1>Playlist Editor</h1>
        <HeaderActions>
          <PlaylistSelector
            value={selectedId || ''}
            onChange={(e) => handleSelectPlaylist(Number(e.target.value))}
            disabled={playlists.length === 0}
          >
            <option value="" disabled>Select a playlist...</option>
            {playlists.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title || 'Untitled Playlist'}
              </option>
            ))}
          </PlaylistSelector>
          <SidebarToggleButton onClick={openSidebar}>
            Workspace
          </SidebarToggleButton>
          <Button onClick={() => { window.location.href = '/curator-admin'; }}>
            Dashboard
          </Button>
        </HeaderActions>
      </PageHeader>

      {curator ? (
        <>
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
                <SidebarContextTitle>
                  {playlist?.title?.trim() || 'No playlist selected'}
                </SidebarContextTitle>
                <SidebarContextMeta>
                  <span>{playlist?.published ? 'Live' : 'Draft'}</span>
                  <span>{(playlist?.tracks || []).length} tracks</span>
                </SidebarContextMeta>
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
                    <SidebarStepBadge $active={tab.id === activeTab}>{tab.step}</SidebarStepBadge>
                    <SidebarTabText>
                      <SidebarTabLabel>{tab.label}</SidebarTabLabel>
                      <SidebarTabDescription>{tab.description}</SidebarTabDescription>
                    </SidebarTabText>
                  </SidebarTab>
                ))}
              </SidebarTabList>
            </Sidebar>

            <EditorContent>
              {selectedId ? (
                isLoadingDetails ? (
                  <EmptyState>
                    <p>Loading playlist...</p>
                  </EmptyState>
                ) : (
                  <>
                    <ContentShell>
                      {activeTab === 'details' && (
                        <SectionCard>
                          <SectionCardHeader>
                            <span className="title">Details</span>
                          </SectionCardHeader>
                          <SectionCardContent>
                            <PlaylistForm
                              playlist={playlist}
                              onChange={setPlaylist}
                              disabled={saving}
                              curatorMode
                              forceCurator={forceCurator}
                              errors={formErrors}
                            />
                          </SectionCardContent>
                        </SectionCard>
                      )}

                      {activeTab === 'tracks' && (
                        <>
                          {/* Import Tools Section - Collapsible at top */}
                          <SectionCard>
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
                              <span className="title">
                                Import Tools
                                <ToggleIcon $isOpen={importToolsExpanded}>▼</ToggleIcon>
                              </span>
                            </CollapsibleSectionHeader>
                            
                            <CollapsibleContent $isOpen={importToolsExpanded}>
                              <SectionCardContent>
                                {isImporting && importPhase ? (
                                  <ImportProgressOverlay
                                    phase={importPhase}
                                    platform={importPlatform}
                                    onCancel={() => {
                                      setIsImporting(false);
                                      setImportPhase(null);
                                      setImportProgress(0);
                                      setImportPlatform(null);
                                      setImportFeedback('');
                                    }}
                                  />
                                ) : (
                                  <>
                                    {/* Import Mode Selection */}
                                    {playlist?.id && playlist?.tracks?.length > 0 && (
                                      <ModeSelectionRow>
                                        <ModeLabel>Import mode:</ModeLabel>
                                        <ModeOptions>
                                          <ModeOption>
                                            <ModeRadio
                                              type="radio"
                                              name="import-mode"
                                              value="replace"
                                              checked={importMode === 'replace'}
                                              onChange={() => setImportMode('replace')}
                                              disabled={saving || isImporting}
                                            />
                                            <ModeLabel>Replace — mirror source order</ModeLabel>
                                          </ModeOption>
                                          <ModeOption>
                                            <ModeRadio
                                              type="radio"
                                              name="import-mode"
                                              value="append"
                                              checked={importMode === 'append'}
                                              onChange={() => setImportMode('append')}
                                              disabled={saving || isImporting}
                                            />
                                            <ModeLabel>Append — add new tracks</ModeLabel>
                                          </ModeOption>
                                        </ModeOptions>
                                        {importMode === 'append' && (
                                          <AppendPositionSelect>
                                            <select
                                              value={importAppendPosition}
                                              onChange={(e) => setImportAppendPosition(e.target.value)}
                                              disabled={saving || isImporting}
                                            >
                                              <option value="top">Add to top</option>
                                              <option value="bottom">Add to bottom</option>
                                            </select>
                                          </AppendPositionSelect>
                                        )}
                                      </ModeSelectionRow>
                                    )}

                                    {/* Import Method Tabs */}
                                    <ImportTabs>
                                      <ImportTab
                                        type="button"
                                        $active={importTab === 'dsp'}
                                        onClick={() => setImportTab('dsp')}
                                        disabled={saving || isImporting}
                                      >
                                        From DSP
                                      </ImportTab>
                                      <ImportTab
                                        type="button"
                                        $active={importTab === 'url'}
                                        onClick={() => setImportTab('url')}
                                        disabled={saving || isImporting}
                                      >
                                        Paste URL
                                      </ImportTab>
                                      <ImportTab
                                        type="button"
                                        $active={importTab === 'paste'}
                                        onClick={() => setImportTab('paste')}
                                        disabled={saving || isImporting}
                                      >
                                        Paste Text
                                      </ImportTab>
                                    </ImportTabs>

                                    {/* DSP Import Tab */}
                                    {importTab === 'dsp' && (
                                      <ImportTabContent>
                                        <ImportModal
                                          inline
                                          isOpen={true}
                                          onImported={handleDspImportSelection}
                                          processingId={importingDspId}
                                          actionLabel="Import"
                                        />
                                      </ImportTabContent>
                                    )}

                                    {/* Paste URL Tab */}
                                    {importTab === 'url' && (
                                      <ImportTabContent>
                                        <ImportTextArea
                                          value={pastedUrl}
                                          onChange={(e) => setPastedUrl(e.target.value)}
                                          placeholder="https://open.spotify.com/playlist/... or https://music.apple.com/.../playlist/... or https://www.youtube.com/playlist?list=..."
                                          disabled={saving || isImportingUrl}
                                          rows={2}
                                          style={{ fontFamily: 'monospace', fontSize: '14px' }}
                                        />
                                        <ImportActionRow>
                                          <Button
                                            variant="fpwhite"
                                            onClick={() => setPastedUrl('')}
                                            disabled={saving || isImportingUrl || !pastedUrl.trim()}
                                          >
                                            Clear
                                          </Button>
                                          <Button
                                            variant="primary"
                                            onClick={() => handleUrlImport(pastedUrl)}
                                            disabled={saving || isImportingUrl || !pastedUrl.trim()}
                                          >
                                            {isImportingUrl ? 'Importing…' : 'Import URL'}
                                          </Button>
                                        </ImportActionRow>
                                        {pastedUrlError && (
                                          <StatusRow>
                                            <StatusDot $variant="error" />
                                            {pastedUrlError}
                                          </StatusRow>
                                        )}
                                        {isImportingUrl && (
                                          <StatusRow>
                                            <StatusDot $variant="active" />
                                            Importing from URL...
                                          </StatusRow>
                                        )}
                                      </ImportTabContent>
                                    )}

                                    {/* Paste Tab */}
                                    {importTab === 'paste' && (
                                      <ImportTabContent>
                                        <ImportTextArea
                                          value={importText}
                                          onChange={(e) => setImportText(e.target.value)}
                                          placeholder="Artist - Track Title&#10;Another Artist - Another Track"
                                          disabled={saving || isImporting}
                                          rows={8}
                                        />
                                        <ImportActionRow>
                                          <Button variant="fpwhite" onClick={() => setImportText('')} disabled={saving || isImporting || !importText.trim()}>
                                            Clear
                                          </Button>
                                          <Button variant="primary" onClick={handleTextImport} disabled={saving || isImporting || !importText.trim()}>
                                            {isImporting ? 'Adding…' : 'Add Tracks'}
                                          </Button>
                                        </ImportActionRow>
                                      </ImportTabContent>
                                    )}

                                    {/* Status Feedback */}
                                    {(importFeedback || error) && (
                                      <StatusRow>
                                        <StatusDot $variant={error ? 'error' : 'active'} />
                                        {error || importFeedback}
                                      </StatusRow>
                                    )}
                                    {/* Cross-linking Status */}
                                    {linkingState.status !== 'idle' && (
                                      <StatusRow>
                                        <StatusDot
                                          $variant={linkingState.status === 'success' ? 'success' : linkingState.status === 'error' ? 'error' : 'active'}
                                        />
                                        {linkingState.message || 'Cross-linking...'}
                                      </StatusRow>
                                    )}
                                  </>
                                )}
                              </SectionCardContent>
                            </CollapsibleContent>
                          </SectionCard>

                          {instagramFeatureEnabled && (
                            <SectionCard>
                              <SectionCardHeader>
                                <span className="title">Track Details Tools</span>
                              </SectionCardHeader>
                              <SectionCardContent>
                                <ImportActionRow>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={linkInstagramProfiles}
                                    disabled={instagramLinkDisabled}
                                  >
                                    {instagramLinkState.status === 'in_progress' ? 'Linking...' : 'Link Instagram Profiles'}
                                  </Button>
                                </ImportActionRow>
                                {instagramLinkState.status !== 'idle' && (
                                  <StatusRow>
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
                              </SectionCardContent>
                            </SectionCard>
                          )}

                          {/* Track List */}
                          <SectionCard data-tracks-section>
                            <TrackList
                              tracks={playlist.tracks || []}
                              onChange={(tracks) => setPlaylist((p) => ({ ...p, tracks: normalizeTracks(tracks) }))}
                              playlistId={playlist.id || null}
                              disabled={saving}
                              onModalStateChange={setIsTrackModalOpen}
                              onClearAll={() => setPlaylist((p) => ({ ...p, tracks: [] }))}
                            />
                          </SectionCard>
                        </>
                      )}

                      {activeTab === 'cover' && (
                        <SectionCard>
                          <SectionCardHeader>
                            <span className="title">Cover Image</span>
                          </SectionCardHeader>
                          <SectionCardContent>
                            <ImageUpload
                              currentImage={playlist.image}
                              onImageUpload={(filenameOrUrl) => setPlaylist((p) => ({ ...p, image: filenameOrUrl }))}
                              disabled={saving}
                              uploadType="playlists"
                            />
                          </SectionCardContent>
                        </SectionCard>
                      )}

                      {activeTab === 'republish' && (
                        <RepublishExportWorkspace
                          playlist={playlist}
                          curatorId={curator?.id || null}
                          onRepublish={handleRepublish}
                          onExport={handleExport}
                          authenticatedFetch={authenticatedFetch}
                          busy={saving || isPublishing}
                          isRepublishing={isRepublishing}
                          isExporting={isExporting}
                        />
                      )}
                    </ContentShell>

                    {!isTrackModalOpen && (
                      <SaveActionBar>
                        {error && (
                          <StatusBanner $variant="error">
                            <p>{error}</p>
                          </StatusBanner>
                        )}
                        {!error && status && (
                          <StatusBanner $variant="success">
                            <p>{status}</p>
                          </StatusBanner>
                        )}
                        {!error && !status && showPublishCue && (
                          <StatusBanner $variant="success">
                            <p>Ready to publish.</p>
                          </StatusBanner>
                        )}
                        <SaveActionBarButtons>
                          <Button onClick={onSave} $variant="success" disabled={saving || !playlist.title}>
                            {saving ? 'Updating...' : 'Update'}
                          </Button>
                          {playlist?.id && !playlist?.published && (
                            <PublishPrimaryButton onClick={handleRepublish} disabled={isRepublishing || !playlist.title}>
                              {isRepublishing ? 'Publishing...' : 'Go Live'}
                            </PublishPrimaryButton>
                          )}
                          {playlist?.id && playlist?.published && (
                            <>
                              <Button onClick={() => (window.location.href = `/playlists/${playlist.id}`)} $variant="secondary">
                                View Live
                              </Button>
                              <Button onClick={handleCopyLiveUrl} $variant="secondary">
                                Copy Live URL
                              </Button>
                            </>
                          )}
                          <Button onClick={() => { navigate('/curator-admin'); }} $variant="secondary">
                            Exit Editor
                          </Button>
                        </SaveActionBarButtons>
                      </SaveActionBar>
                    )}
                  </>
                )
              ) : (
                <EmptyState>
                  <p>Select a playlist from the library or create a new one to get started.</p>
                </EmptyState>
              )}
            </EditorContent>
          </EditorLayout>

          {playlist.id && (
            <PlaylistExportModal isOpen={exportOpen} onClose={() => setExportOpen(false)} playlistId={playlist.id} playlist={playlist} />
          )}

          <ImportModal
            isOpen={showImport}
            onClose={() => setShowImport(false)}
            onImported={async (selection) => {
              if (!selection?.platform) {
                setError('Unsupported import selection');
                setShowImport(false);
                return;
              }
              try {
                if (selection.platform === 'spotify') {
                  const draft = await savePlaylist({
                    title: selection.title || '',
                    description_short: selection.description || '',
                    description: selection.description || '',
                    image: selection.image || '',
                    curator_id: curator.id,
                    curator_name: curator.name,
                    curator_type: curator.profile_type,
                    tracks: []
                  });
                  const newId = draft?.id;
                  if (!newId) throw new Error('Failed to create playlist');
                  const schedRes = await adminPost('/api/v1/playlist-actions/schedules', {
                    playlist_id: newId,
                    source: 'spotify',
                    mode: 'replace',
                    wip_spotify_playlist_id: selection.id,
                    frequency: 'daily',
                    frequency_value: null,
                    time_utc: '09:00'
                  });
                  const schedule = schedRes.data;
                  await adminPost(`/api/v1/playlist-actions/schedules/${schedule.id}/run-now`, {});
                  setSelectedId(newId);
                  setPlaylist({
                    id: newId,
                    title: draft.title,
                    publish_date: draft.publish_date,
                    curator_id: draft.curator_id,
                    curator_name: draft.curator_name,
                    curator_type: draft.curator_type,
                    description: draft.description,
                    description_short: draft.description_short,
                    tags: draft.tags,
                    image: draft.image,
                    published: draft.published,
                    spotify_url: draft.spotify_url,
                    apple_url: draft.apple_url,
                    tidal_url: draft.tidal_url,
                    custom_action_label: draft.custom_action_label,
                    custom_action_url: draft.custom_action_url,
                    custom_action_icon: draft.custom_action_icon,
                    custom_action_icon_source: draft.custom_action_icon_source,
                    auto_referral_enabled: draft.auto_referral_enabled,
                    tracks: normalizeTracks(draft.tracks || [])
                  });
                  setStatus('Import started. Syncing tracks from Spotify...');
                  await refreshCuratorPlaylists(curator.id);
                  await refreshPlaylistDetails(newId, { attempts: 12, delay: 3000 });
                } else if (selection.platform === 'apple') {
                  const response = await adminFetch(`/api/v1/apple/import/${encodeURIComponent(selection.id)}`, { method: 'POST' });
                  const payload = await handleJsonResponse(response);
                  const appleData = payload.data || {};
                  const applePlaylist = appleData.applePlaylist || {};
                  const tracks = Array.isArray(appleData.tracks)
                    ? normalizeTracks(appleData.tracks)
                    : [];
                  const created = await savePlaylist({
                    title: selection.title || applePlaylist.name || '',
                    description: selection.description || applePlaylist.description || '',
                    description_short: selection.description || applePlaylist.description || '',
                    image: applePlaylist.image || selection.image || '',
                    curator_id: curator.id,
                    curator_name: curator.name,
                    curator_type: curator.profile_type,
                    tracks,
                    apple_url: applePlaylist.apple_url || ''
                  });
                  const normalizedTracks = normalizeTracks(created.tracks || tracks);
                  setSelectedId(created.id);
                  setPlaylist({ ...created, tracks: normalizedTracks });
                  setStatus(`Imported ${normalizedTracks.length} tracks from Apple Music.`);
                  await refreshCuratorPlaylists(curator.id);
                  await refreshPlaylistDetails(created.id, { attempts: 3, delay: 2000 });
                } else if (selection.platform === 'tidal') {
                  const response = await adminFetch(`/api/v1/tidal/import/${encodeURIComponent(selection.id)}`, { method: 'POST' });
                  const payload = await handleJsonResponse(response);
                  const tidalData = payload.data || {};
                  const tidalPlaylist = tidalData.tidalPlaylist || {};
                  const tracks = Array.isArray(tidalData.tracks)
                    ? normalizeTracks(tidalData.tracks)
                    : [];
                  const created = await savePlaylist({
                    title: selection.title || tidalPlaylist.name || '',
                    description: selection.description || tidalPlaylist.description || '',
                    description_short: selection.description || tidalPlaylist.description || '',
                    image: tidalPlaylist.image || selection.image || '',
                    curator_id: curator.id,
                    curator_name: curator.name,
                    curator_type: curator.profile_type,
                    tracks,
                    tidal_url: tidalPlaylist.tidal_url || ''
                  });
                  const normalizedTracks = normalizeTracks(created.tracks || tracks);
                  setSelectedId(created.id);
                  setPlaylist({ ...created, tracks: normalizedTracks });
                  setStatus(`Imported ${normalizedTracks.length} tracks from TIDAL.`);
                  await refreshCuratorPlaylists(curator.id);
                  await refreshPlaylistDetails(created.id, { attempts: 3, delay: 2000 });
                } else if (selection.platform === 'qobuz') {
                  setStatus('Importing from Qobuz... This may take a few moments.');
                  const response = await adminFetch(`/api/v1/qobuz/import`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      url: selection.url,
                      curatorId: curator.id
                    })
                  });
                  const payload = await handleJsonResponse(response);
                  const qobuzData = payload.data || {};
                  const tracks = Array.isArray(qobuzData.tracks)
                    ? normalizeTracks(qobuzData.tracks)
                    : [];
                  const skipped = qobuzData.skipped || [];
                  const summary = qobuzData.summary || {};

                  const created = await savePlaylist({
                    title: selection.title || 'Qobuz Playlist',
                    description: selection.description || '',
                    description_short: selection.description || '',
                    image: '',
                    curator_id: curator.id,
                    curator_name: curator.name,
                    curator_type: curator.profile_type,
                    tracks
                  });
                  const normalizedTracks = normalizeTracks(created.tracks || tracks);
                  setSelectedId(created.id);
                  setPlaylist({ ...created, tracks: normalizedTracks });

                  let statusMessage = `Imported ${normalizedTracks.length} tracks from Qobuz.`;
                  if (skipped.length > 0) {
                    statusMessage += ` ${skipped.length} tracks were skipped due to low confidence matches.`;
                  }
                  setStatus(statusMessage);

                  await refreshCuratorPlaylists(curator.id);
                  await refreshPlaylistDetails(created.id, { attempts: 3, delay: 2000 });
                } else {
                  throw new Error('Unsupported DSP import source');
                }
              } catch (e) {
                setError(e.message || 'Failed to start import');
              } finally {
                setShowImport(false);
              }
            }}
          />
          {playlist?.id && (
            <PlaylistSyncModal
              isOpen={showSync}
              onClose={() => setShowSync(false)}
              playlist={playlist}
              onSynced={handleSyncComplete}
              normalizeTracks={normalizeTracks}
            />
          )}
        </>
      ) : (
        <EmptyState>
          <p>Loading curator profile...</p>
        </EmptyState>
      )}
    </PageContainer>
  );
}
