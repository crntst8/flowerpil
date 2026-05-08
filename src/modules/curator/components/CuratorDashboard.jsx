import React, { useCallback, useEffect, useMemo, useState, lazy } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import EmbedsPanel from '../../embeds/EmbedsPanel.jsx';
import styled from 'styled-components';
import { Container } from '@shared/styles/GlobalStyles';
import { useAuth } from '@shared/contexts/AuthContext';
import { safeJson } from '@shared/utils/jsonUtils';
import CuratorProfilePage from './CuratorProfilePage.jsx';
import CuratorBioPage from './CuratorBioPage.jsx';
import CuratorDSPConnections from './CuratorDSPConnections.jsx';
import CuratorFlagsModal from './CuratorFlagsModal.jsx';
import CuratorAccountSettings from './CuratorAccountSettings.jsx';
import CuratorReleasesPanel from './CuratorReleasesPanel.jsx';
import CuratorWritingPanel from './CuratorWritingPanel.jsx';
import { adminGet } from '@modules/admin/utils/adminApi';
import PlaylistExportModal from '../../admin/components/PlaylistExportModal.jsx';
import SchedulesTab from './SchedulesTab.jsx';
import ScheduleIndicator from './ScheduleIndicator.jsx';
import ScheduleModal from './ScheduleModal.jsx';
import { listSchedules } from '../services/scheduleService.js';
import PlaylistAnalysisModal from './PlaylistAnalysis/PlaylistAnalysisModal.jsx';
import TextExportModal from './PlaylistTools/TextExportModal.jsx';
import ArtworkDownloadModal from './PlaylistTools/ArtworkDownloadModal.jsx';
import ReleaseYearFilterModal from './PlaylistTools/ReleaseYearFilterModal.jsx';
import FirstVisitDSPModal from './FirstVisitDSPModal.jsx';
import FirstVisitBioModal from './FirstVisitBioModal.jsx';
import CuratorModalShell from './ui/CuratorModalShell.jsx';
import {
  Button,
  SectionCard as BaseSectionCard,
  StatusDot,
  EmptyState,
  Toolbar,
  ToolbarGroup,
  FilterPill,
  SearchInput,
  MenuGroup,
  MenuLabel,
  MenuItem,
  Tab,
  TabList,
  tokens,
  theme,
  mediaQuery,
} from './ui/index.jsx';

const QRCodeModal = lazy(() => import('@shared/components/QRCode/QRCodeModal'));

const VALID_TABS = new Set(['home', 'saved', 'profile', 'releases', 'writing', 'bio', 'embeds', 'schedules', 'dsp', 'account', 'tools']);
const TAB_LABELS = {
  home: 'Playlists',
  saved: 'Saved',
  profile: 'Profile',
  releases: 'Releases',
  writing: 'Writing',
  bio: 'Pil.Bio',
  embeds: 'Embeds',
  schedules: 'Schedules',
  dsp: 'DSP',
  account: 'Account',
  tools: 'Tools',
};

const DASHBOARD_TAB_COLLAPSE_BREAKPOINT = '1024px';

// Profile types that have access to releases feature
const RELEASE_PROFILE_TYPES = new Set([
  'label',
  'label-ar',
  'label-services',
  'artist',
  'band',
  'artist-manager',
  'artist-management',
  'artist-booker',
  'musician',
  'dj'
]);

// =============================================================================
// HEADER COMPONENTS
// =============================================================================

const Header = styled.div`
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  background: black;
  gap: ${tokens.spacing[4]};
  padding: ${tokens.spacing[6]} clamp(1rem, 4vw, 2rem) ${tokens.spacing[2]};
  position: relative;
  min-height: 80px;

  ${mediaQuery.mobile} {
    padding: ${tokens.spacing[4]} ${tokens.spacing[4]} ${tokens.spacing[2]};
    z-index: 1002;
  }
`;

const HeaderLeft = styled.div`
  display: none;
`;

const HeaderCenter = styled.div`
  position: absolute;
  left: clamp(1rem, 4vw, 2rem);
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: flex-start;

  ${mediaQuery.mobile} {
    left: ${tokens.spacing[4]};
  }
`;

const HeaderRight = styled.div`
  position: absolute;
  right: clamp(1rem, 4vw, 2rem);
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: ${tokens.spacing[2]};

  ${mediaQuery.mobile} {
    right: ${tokens.spacing[4]};
  }
`;

const ActiveTabPill = styled.span`
  display: none;

  @media (max-width: ${DASHBOARD_TAB_COLLAPSE_BREAKPOINT}) {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: center;
    min-height: ${tokens.sizing.touchTargetComfortable};
    padding: 0;
    border: none;
    font-family: ${theme.fonts.mono};
    color: ${theme.colors.fpwhite};
    background: transparent;
    line-height: 1.15;
    pointer-events: none;

    .label {
      font-size: calc(${theme.fontSizes.tiny} * 0.92);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      opacity: 0.62;
    }

    .value {
      font-size: ${theme.fontSizes.small};
      text-transform: none;
      letter-spacing: 0;
      font-family: ${theme.fonts.primary};
      font-weight: ${theme.fontWeights.semibold};
      opacity: 0.94;
    }
  }
`;

const HeaderDivider = styled.div`
  border-bottom: 0.5px solid ${theme.colors.blackAct};
  margin: 0;
  padding: 0 clamp(1rem, 4vw, 2rem);
  margin-bottom: ${tokens.spacing[4]};

  ${mediaQuery.mobile} {
    padding: 0 ${tokens.spacing[4]};
  }
`;

const Logo = styled.img`
  width: 44px;
  height: 44px;
  object-fit: contain;
`;

// =============================================================================
// TABS (Desktop)
// =============================================================================

const Tabs = styled(TabList)`
  box-shadow: 0 4px 12px -4px rgb(15, 14, 23);

  @media (max-width: ${DASHBOARD_TAB_COLLAPSE_BREAKPOINT}) {
    display: none;
  }
`;

// =============================================================================
// HAMBURGER MENU
// =============================================================================

const HamburgerButton = styled.button`
  background: none;
  border: none;
  font-size: 50px;
  color: ${theme.colors.fpwhite};
  opacity: 0.4;
  cursor: pointer;
  padding: 0;
  margin: 0;
  font-family: ${theme.fonts.primary};
  transition: all ${tokens.transitions.fast};
  height: 74px;
  width: 60px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  line-height: 1;

  ${mediaQuery.mobile} {
    font-size: 36px;
    height: 56px;
    width: 40px;
    opacity: 0.4;
  }

  &:hover {
    opacity: 0.7;
    transform: scale(1.1);
  }
`;

const HamburgerMenu = styled.div.withConfig({ shouldForwardProp: (p) => !['$isOpen'].includes(p) })`
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  width: 300px;
  background: ${theme.colors.black};
  border-left: ${theme.borders.solid} ${theme.colors.fpwhite};
  transform: translateX(${p => p.$isOpen ? '0' : '100%'});
  transition: transform ${tokens.transitions.normal};
  z-index: 1001;
  display: flex;
  flex-direction: column;

  ${mediaQuery.mobile} {
    width: 280px;
  }
`;

const HamburgerOverlay = styled.div.withConfig({ shouldForwardProp: (p) => !['$isOpen'].includes(p) })`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(2px);
  opacity: ${p => p.$isOpen ? 1 : 0};
  visibility: ${p => p.$isOpen ? 'visible' : 'hidden'};
  transition: all ${tokens.transitions.normal};
  z-index: 999;
`;

const MenuHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${tokens.spacing[6]};
  border-bottom: ${theme.borders.solidThin} ${theme.colors.gray[300]};
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 32px;
  color: ${theme.colors.fpwhite};
  cursor: pointer;
  padding: 0;
  line-height: 1;
  transition: all ${tokens.transitions.fast};

  &:hover {
    opacity: 0.7;
    transform: scale(1.1);
  }
`;

const MenuContent = styled.nav`
  flex: 1;
  padding: ${tokens.spacing[4]} 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
`;

const MenuItemStyled = styled(MenuItem)`
  display: block;
  padding: ${tokens.spacing[4]} ${tokens.spacing[6]};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.hx};
  text-transform: uppercase;
  letter-spacing: -0.9px;
  color: ${theme.colors.white};
  text-decoration: none;
  transition: all ${tokens.transitions.fast};
  cursor: pointer;
  position: relative;
  min-height: 48px;
  display: flex;
  align-items: center;
  border-bottom: ${theme.borders.solidThin} ${theme.colors.gray[800]};

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: ${theme.colors.blackLess[900]};
    transform: translateX(8px);
  }
`;

const SectionLabel = styled(MenuLabel)`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.gray[500]};
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 0 ${tokens.spacing[6]};
  margin: 0 0 ${tokens.spacing[2]};
  border-bottom: ${theme.borders.solidThin} ${theme.colors.gray[800]};
  padding-bottom: ${tokens.spacing[4]};
`;

// =============================================================================
// PLAYLIST ROW COMPONENTS
// =============================================================================

const PlaylistTable = styled.div`
  display: grid;
  gap: ${tokens.spacing[4]};

  ${mediaQuery.mobile} {
    gap: ${tokens.spacing[3]};
  }
`;

const PlaylistRow = styled.div`
  display: grid;
  grid-template-columns: 4px minmax(0, 1fr) auto;
  gap: 0;
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solidThin} ${theme.colors.blackAct};
  border-radius: 0;
  padding: 0;
  align-items: stretch;
  box-shadow: 0 12px 24px -18px rgba(15, 14, 23, 0.35);
  transition: transform ${tokens.transitions.fast}, box-shadow ${tokens.transitions.fast};
  position: relative;
  overflow: hidden;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 16px 32px -20px rgba(15, 14, 23, 0.4);
  }

  /* Half-width windows (768px - 1024px) */
  @media (max-width: 1024px) and (min-width: 769px) {
    grid-template-columns: 4px minmax(0, 1fr) auto;
  }

  /* Narrow screens (600px - 768px) */
  @media (max-width: 768px) and (min-width: 601px) {
    grid-template-columns: 4px minmax(0, 1fr);
  }

  /* Mobile and small screens (< 600px) */
  @media (max-width: 600px) {
    grid-template-columns: 4px 1fr;
    gap: 0;
    align-items: stretch;
  }
`;

const StatusIndicator = styled.div.withConfig({ shouldForwardProp: (p) => !['$active', '$scheduled'].includes(p) })`
  width: 4px;
  background: ${p => p.$scheduled ? '#facc15' : p.$active ? '#4ade80' : '#fb923c'};
  box-shadow: ${p => p.$scheduled
    ? '0 0 8px rgba(250, 204, 21, 0.6), 0 0 16px rgba(250, 204, 21, 0.4)'
    : p.$active
    ? '0 0 8px rgba(74, 222, 128, 0.6), 0 0 16px rgba(74, 222, 128, 0.4)'
    : '0 0 8px rgba(251, 146, 60, 0.6), 0 0 16px rgba(251, 146, 60, 0.4)'};
  transition: all ${tokens.transitions.fast};
`;

const PlaylistCell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: ${tokens.spacing[3]} ${tokens.spacing[4]};

  /* Narrow screens - hide issues column, show in details */
  @media (max-width: 768px) and (min-width: 601px) {
    padding: ${tokens.spacing[2]} ${tokens.spacing[3]};
    padding-right: ${tokens.spacing[2]};
  }

  /* Desktop and half-width */
  @media (min-width: 769px) {
    padding-right: ${tokens.spacing[2]};
  }

  /* Mobile - stack with dividers */
  @media (max-width: 600px) {
    padding: ${tokens.spacing[3]};

    &:not(:last-child) {
      border-bottom: 1px dashed rgba(20, 19, 29, 0.08);
      padding-bottom: ${tokens.spacing[3]};
      margin-bottom: 0;
    }
  }
`;

const PlaylistTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing[2]};
  min-width: 0;

  @media (max-width: 600px) {
    gap: ${tokens.spacing[1]};
  }
`;

const PlaylistTitle = styled.span`
  font-family: ${theme.fonts.primary};
  font-weight: ${theme.fontWeights.bold};
  font-size: clamp(${theme.fontSizes.body}, 2.5vw, calc(${theme.fontSizes.body} * 1.4));
  color: ${theme.colors.black};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
  letter-spacing: -0.3px;
  text-align: left;

  /* Responsive sizing to prevent overlap with actions */
  @media (max-width: 1024px) and (min-width: 769px) {
    font-size: clamp(${theme.fontSizes.body}, 2vw, calc(${theme.fontSizes.body} * 1.2));
  }

  @media (max-width: 768px) and (min-width: 601px) {
    font-size: clamp(${theme.fontSizes.small}, 2vw, ${theme.fontSizes.body});
  }

  /* Allow wrapping on very narrow screens */
  @media (max-width: 420px) {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    line-height: 1.3;
    font-size: ${theme.fontSizes.small};
  }

  @media (max-width: 600px) {
    font-size: clamp(${theme.fontSizes.small}, 3vw, calc(${theme.fontSizes.small} * 1.2));
  }
`;

const PlaylistMeta = styled.div`
  display: flex;
  flex-direction: row;
  gap: ${tokens.spacing[3]};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  opacity: 0.7;
  margin-bottom: ${tokens.spacing[2]};
  flex-wrap: wrap;
  align-items: center;

  @media (max-width: 600px) {
    display: none;
  }
`;

const MetaItem = styled.span`
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: ${tokens.spacing[1]};

  @media (max-width: 600px) {
    font-size: ${theme.fontSizes.tiny};
  }
`;

const MobileOnlyMeta = styled.div`
  display: none;

  @media (max-width: 600px) {
    display: flex;
    flex-direction: row;
    gap: ${tokens.spacing[2]};
    align-items: center;
    margin-top: ${tokens.spacing[1]};
  }
`;

const MetricFlag = styled.div.withConfig({ shouldForwardProp: (p) => !['$danger'].includes(p) })`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: ${tokens.spacing[1]} ${tokens.spacing[2]};
  background: ${p => (p.$danger ? '#ffe5e5' : '#e5ffe9')};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  font-weight: ${theme.fontWeights.bold};
  text-transform: capitalize;
  border-radius: 7px;
  white-space: nowrap;

  @media (max-width: 600px) {
    font-size: ${theme.fontSizes.tiny};
    padding: ${tokens.spacing[1]} ${tokens.spacing[2]};
  }
`;

const RowActions = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};
  background: rgba(20, 19, 29, 0.08);
  padding: ${tokens.spacing[3]} ${tokens.spacing[4]};
  border-radius: 0;
  min-width: 0;
  justify-content: center;
  border-left: 1px dashed rgba(20, 19, 29, 0.14);
  align-self: stretch;

  @media (max-width: 768px) {
    grid-column: 2 / -1;
    width: 100%;
  }

  button {
    font-size: ${theme.fontSizes.tiny};
    padding: ${tokens.spacing[1]} ${tokens.spacing[3]};
    white-space: nowrap;
    min-width: 0;
    font-size: ${theme.fontSizes.tiny};
  }

  /* Half-width windows (769px - 1024px) - tighter spacing, allow wrapping */
  @media (max-width: 1024px) and (min-width: 769px) {
    padding: ${tokens.spacing[2]} ${tokens.spacing[3]};
    
    > div {
      gap: ${tokens.spacing[1]};
    }
    
    button {
      font-size: clamp(0.6rem, 1.2vw, ${theme.fontSizes.tiny});
      padding: ${tokens.spacing[1]} ${tokens.spacing[2]};
      flex: 0 1 auto;
    }
  }

  /* Narrow screens (601px - 768px) - wrap more aggressively, smaller buttons */
  @media (max-width: 768px) and (min-width: 601px) {
    padding: ${tokens.spacing[2]} ${tokens.spacing[3]};
    border-left: none;
    border-top: 1px dashed rgba(20, 19, 29, 0.12);
    
    > div {
      gap: ${tokens.spacing[1]};
      justify-content: flex-start;
    }
    
    button {
      font-size: clamp(0.6rem, 1.2vw, ${theme.fontSizes.tiny});
      padding: ${tokens.spacing[1]} ${tokens.spacing[2]};
      flex: 1 1 auto;
      min-width: fit-content;
      max-width: 100%;
    }
  }

  /* Mobile (< 600px) - single row with evenly sized buttons, no label */
  @media (max-width: 600px) {
    flex-direction: column;
    gap: ${tokens.spacing[2]};
    padding: ${tokens.spacing[2]};
    border-radius: 0;
    border-top: 1px dashed rgba(20, 19, 29, 0.12);
    border-left: none;
    width: 100%;

    button {
      flex: 1 1 0;
      min-width: 0;
      min-height: ${tokens.sizing.touchTarget};
      justify-content: center;
      font-size: ${theme.fontSizes.tiny};
      padding: ${tokens.spacing[1]} ${tokens.spacing[2]};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
`;

const RowActionPrimary = styled.div`
  display: flex;
  gap: ${tokens.spacing[1]};
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;

  @media (max-width: 600px) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: 100%;
  }
`;

const RowActionSecondary = styled.div`
  display: flex;
  gap: ${tokens.spacing[1]};
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;

  @media (max-width: 600px) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: 100%;
  }
`;

// =============================================================================
// STATS & INFO
// =============================================================================

const StatHighlights = styled.div`
  display: grid;
  gap: ${tokens.spacing[2]};
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  margin-bottom: ${tokens.spacing[4]};
  max-width: 100%;

  ${mediaQuery.mobile} {
    grid-template-columns: 1fr;
    gap: ${tokens.spacing[1]};
    margin-bottom: ${tokens.spacing[4]};
  }
`;

const StatCard = styled.div`
  padding: ${tokens.spacing[4]};
  border: 1px solid ${theme.colors.black};
  border-radius: 0;
  background: ${theme.colors.fpwhiteIn};
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: ${tokens.spacing[1]};
  min-height: 72px;
  box-shadow: 3px 3px 0 ${theme.colors.black};

  .label {
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.tiny};
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: ${theme.colors.black};
    font-weight: ${theme.fontWeights.bold};
  }

  .value {
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.h3};
    font-weight: ${theme.fontWeights.bold};
    color: ${theme.colors.black};
    line-height: 1;
  }

  .meta {
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.tiny};
    color: ${theme.colors.black};
    opacity: 0.7;
  }

  ${mediaQuery.mobile} {
    padding: ${tokens.spacing[1]} ${tokens.spacing[2]};
    flex-wrap: wrap;
  }
`;

// =============================================================================
// LAYOUT
// =============================================================================

const ButtonsBar = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: ${tokens.spacing[1]};
  margin-bottom: ${tokens.spacing[4]};
  padding: 0;
  max-width: 100%;

  button {
    white-space: nowrap;
  }

  ${mediaQuery.mobile} {
    grid-template-columns: 1fr;
    gap: ${tokens.spacing[1]};
    margin-bottom: ${tokens.spacing[4]};
  }
`;

const ContentShell = styled.div`
  display: grid;
  gap: ${tokens.spacing[6]};
  background: transparent;
  border: none;
  box-shadow: none;
  padding: 0;
  max-width: 100%;
  overflow: visible;
  margin-top: ${tokens.spacing[4]};

  ${mediaQuery.mobile} {
    padding: ${tokens.spacing[2]};
    gap: ${tokens.spacing[4]};
  }
`;

const SectionCard = styled(BaseSectionCard)`
  background: ${theme.colors.fpwhite};
  border: 1px solid ${theme.colors.black};
  box-shadow: 4px 4px 0 ${theme.colors.black};
  padding: ${tokens.spacing[6]};
  transition: transform ${tokens.transitions.fast}, box-shadow ${tokens.transitions.fast};
  max-width: 100%;
  overflow: visible;

  ${mediaQuery.mobile} {
    padding: ${tokens.spacing[1]};
  }
`;

const StatusMessage = styled.div.withConfig({ shouldForwardProp: (p) => !['$error'].includes(p) })`
  margin-bottom: ${tokens.spacing[4]};
  padding: ${tokens.spacing[2]} ${tokens.spacing[3]};
  border: 1px solid ${({ $error }) => ($error ? theme.colors.danger : theme.colors.black)};
  background: ${({ $error }) => ($error ? theme.colors.dangerBG : 'rgba(0, 0, 0, 0.04)')};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const PageHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};
  margin-bottom: ${tokens.spacing[8]};
  background: ${theme.colors.black};
  box-shadow: 0 24px 48px -30px rgba(15, 14, 23, 0.5);
  padding: ${tokens.spacing[6]} ${tokens.spacing[8]};
  max-width: 100%;

  h1 {
    margin: 0;
    font-family: ${theme.fonts.primary};
    color: ${theme.colors.fpwhite};
    text-transform: capitalize;
    letter-spacing: -0.9px;
  }

  p {
    margin: 0;
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.body};
    color: ${theme.colors.fpwhite};
    opacity: 0.9;
  }

  ${mediaQuery.mobile} {
    padding: ${tokens.spacing[4]};
    margin-bottom: ${tokens.spacing[4]};
  }
`;

const ToolGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: ${tokens.spacing[3]};

  ${mediaQuery.mobile} {
    grid-template-columns: 1fr;
  }
`;

const ToolCard = styled.div`
  border: 1px solid ${theme.colors.black};
  background: rgba(0, 0, 0, 0.03);
  padding: ${tokens.spacing[3]};
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};

  h3 {
    margin: 0;
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.body};
  }

  p {
    margin: 0;
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.small};
    line-height: 1.5;
  }
`;

const formatShortDate = (input) => {
  if (!input) return null;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export default function CuratorDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { authenticatedFetch } = useAuth();
  const [activeTab, setActiveTab] = useState('home');
  const [curator, setCurator] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [savedPlaylists, setSavedPlaylists] = useState([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState('');
  const [unsavingPlaylistId, setUnsavingPlaylistId] = useState(null);
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [playlistStats, setPlaylistStats] = useState({});
  const [crossStats, setCrossStats] = useState({});
  const [flagsSummary, setFlagsSummary] = useState([]);
  const [flagsOpen, setFlagsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPlaylistId, setExportPlaylistId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [schedules, setSchedules] = useState([]);
  const [scheduleRefreshSignal, setScheduleRefreshSignal] = useState(0);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleModalPlaylist, setScheduleModalPlaylist] = useState(null);
  const [scheduleModalRecord, setScheduleModalRecord] = useState(null);
  const [scheduleModalMode, setScheduleModalMode] = useState('import');
  const [clearingDrafts, setClearingDrafts] = useState(false);
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [textExportModalOpen, setTextExportModalOpen] = useState(false);
  const [artworkDownloadModalOpen, setArtworkDownloadModalOpen] = useState(false);
  const [releaseYearFilterOpen, setReleaseYearFilterOpen] = useState(false);
  const [firstVisitDSPModalOpen, setFirstVisitDSPModalOpen] = useState(false);
  const [firstVisitBioModalOpen, setFirstVisitBioModalOpen] = useState(false);
  const [qrCodeModalOpen, setQrCodeModalOpen] = useState(false);
  const [qrCodePlaylist, setQrCodePlaylist] = useState(null);
  const [canAccessWriting, setCanAccessWriting] = useState(false);
  const [confirmDeletePlaylist, setConfirmDeletePlaylist] = useState(null);
  const [confirmClearDraftsOpen, setConfirmClearDraftsOpen] = useState(false);

  const scheduleMap = useMemo(() => {
    const map = new Map();
    (schedules || []).forEach((record) => {
      if (record?.playlist_id) {
        map.set(record.playlist_id, record);
      }
    });
    return map;
  }, [schedules]);

  // Check if curator has access to releases feature (disabled by default)
  const hasReleasesAccess = useMemo(() => {
    if (!curator) return false;
    if (curator.upcoming_releases_enabled !== true) return false;
    const profileType = curator.profile_type || curator.type;
    return RELEASE_PROFILE_TYPES.has(profileType);
  }, [curator]);

  const refreshFlagsSummary = useCallback(async () => {
    try {
      const s = await adminGet('/api/v1/curator/flags/summary');
      if (s?.success) setFlagsSummary(s.summary || []);
    } catch (err) {
      console.warn('Failed to refresh playlists', err);
    }
  }, []);

  const refreshPlaylists = useCallback(async (curatorIdParam) => {
    const id = curatorIdParam || curator?.id;
    if (!id) return;
    try {
      const listRes = await authenticatedFetch(`/api/v1/playlists?curator_id=${id}`, { method: 'GET' });
      const listData = await safeJson(listRes, { context: 'Load curator playlists' });
      if (listRes.ok && listData.success) {
        const entries = listData.data || [];
        setPlaylists(entries);
        setPlaylistStats(prev => {
          const next = {};
          for (const pl of entries) {
            if (prev[pl.id]) next[pl.id] = prev[pl.id];
          }
          return next;
        });
        setCrossStats(prev => {
          const next = {};
          for (const pl of entries) {
            if (prev[pl.id]) next[pl.id] = prev[pl.id];
          }
          return next;
        });
      }
    } catch (err) {
      console.warn('Failed to refresh flags summary', err);
    }
  }, [authenticatedFetch, curator?.id]);

  const loadSavedPlaylists = useCallback(async () => {
    setSavedLoading(true);
    setSavedError('');
    try {
      const response = await authenticatedFetch('/api/v1/playlist-engagement/saved/playlists', { method: 'GET' });
      const data = await safeJson(response, { context: 'Load saved playlists' });
      if (!response.ok || !data.success) {
        throw new Error(data?.error || 'Failed to load saved playlists');
      }
      setSavedPlaylists(Array.isArray(data.data) ? data.data : []);
    } catch (error) {
      console.warn('Failed to load saved playlists', error);
      setSavedError(error?.message || 'Failed to load saved playlists');
      setSavedPlaylists([]);
    } finally {
      setSavedLoading(false);
    }
  }, [authenticatedFetch]);

  const loadSchedules = useCallback(async () => {
    try {
      const data = await listSchedules(authenticatedFetch);
      setSchedules(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Failed to load schedules', err);
    }
  }, [authenticatedFetch]);

  const closeScheduleModal = useCallback(() => {
    setScheduleModalOpen(false);
    setScheduleModalPlaylist(null);
    setScheduleModalRecord(null);
  }, []);

  const openScheduleModal = useCallback(
    (playlistRecord, scheduleRecord = null, mode = 'import') => {
      if (!playlistRecord) return;
      setScheduleModalPlaylist(playlistRecord);
      setScheduleModalRecord(scheduleRecord);
      setScheduleModalMode(mode);
      setScheduleModalOpen(true);
    },
    []
  );

  const handleScheduleSaved = useCallback((updated) => {
    if (!updated) return;
    setSchedules((prev) => {
      const exists = prev.some((item) => item.id === updated.id);
      if (exists) {
        return prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item));
      }
      return [...prev, updated];
    });
    setScheduleModalRecord(updated);
    setScheduleRefreshSignal((value) => value + 1);
    loadSchedules();
  }, [loadSchedules]);

  const handleScheduleDeleted = useCallback((deletedId) => {
    if (!deletedId) return;
    setSchedules((prev) => prev.filter((item) => item.id !== deletedId));
    setScheduleRefreshSignal((value) => value + 1);
    loadSchedules();
    closeScheduleModal();
  }, [loadSchedules, closeScheduleModal]);

  const handleTabChange = useCallback((tab) => {
    if (!VALID_TABS.has(tab)) return;
    if (tab === 'writing' && !canAccessWriting) return;
    setHamburgerOpen(false);
    setActiveTab(tab);
    const params = new URLSearchParams(location.search || '');
    params.set('tab', tab);
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });

    // Check if this is the first visit to the bio tab
    if (tab === 'bio') {
      const hasSeenBioModal = localStorage.getItem('fp:curator:hasSeenBioModal');
      if (!hasSeenBioModal) {
        setFirstVisitBioModalOpen(true);
        localStorage.setItem('fp:curator:hasSeenBioModal', 'true');
      }
    }
  }, [location.pathname, location.search, navigate, canAccessWriting]);

  const loadWritingAccess = useCallback(async () => {
    try {
      const response = await authenticatedFetch('/api/v1/feature-pieces/access', { method: 'GET' });
      const data = await safeJson(response, { context: 'Load writing access' });
      if (response.ok && data.success) {
        setCanAccessWriting(Boolean(data?.data?.can_access_dashboard));
      } else {
        setCanAccessWriting(false);
      }
    } catch (error) {
      console.warn('Failed to load writing access', error);
      setCanAccessWriting(false);
    }
  }, [authenticatedFetch]);

  // Close with ESC key
  useEffect(() => {
    if (!hamburgerOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setHamburgerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hamburgerOpen]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await authenticatedFetch('/api/v1/curator/profile', { method: 'GET' });
        const data = await safeJson(res, { context: 'Load curator profile' });
        if (res.ok && data.success) {
          setCurator(data.curator);
          const shouldShowDSPModal = localStorage.getItem('fp:curator:showFirstVisitDSPModal') === 'true';
          if (shouldShowDSPModal) {
            setFirstVisitDSPModalOpen(true);
            localStorage.removeItem('fp:curator:showFirstVisitDSPModal');
          }

          await Promise.allSettled([
            refreshPlaylists(data.curator.id),
            refreshFlagsSummary(),
            loadSchedules(),
            loadWritingAccess()
          ]);

        }
      } catch (e) {
        console.warn('[CuratorDashboard] Load error:', e?.message);
      }
    };
    load();
    const onRefresh = () => { load().catch((err) => console.warn('CuratorDashboard refresh failed', err)); };
    window.addEventListener('flowerpil:refresh', onRefresh);
    return () => window.removeEventListener('flowerpil:refresh', onRefresh);
  }, [authenticatedFetch, refreshFlagsSummary, refreshPlaylists, loadSchedules, loadWritingAccess]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const tabParam = params.get('tab');
    if (tabParam && VALID_TABS.has(tabParam)) {
      if (tabParam === 'writing' && !canAccessWriting) return;
      setActiveTab((prev) => (prev === tabParam ? prev : tabParam));
    }
  }, [location.search, canAccessWriting]);

  useEffect(() => {
    if (!location.state || !location.state.refreshPlaylists) return;
    (async () => {
      try {
        await refreshPlaylists();
      } finally {
        navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: {} });
      }
    })();
  }, [location, navigate, refreshPlaylists]);

  useEffect(() => {
    if (activeTab !== 'saved') return;
    loadSavedPlaylists();
  }, [activeTab, loadSavedPlaylists]);

  // Close hamburger menu when switching back to desktop view
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 1024 && hamburgerOpen) {
        setHamburgerOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [hamburgerOpen]);

  const published = useMemo(() => (playlists || []).filter(p => p.published), [playlists]);
  const orderedPlaylists = useMemo(() => playlists || [], [playlists]);
  const flagsByPlaylist = useMemo(() => {
    const map = new Map();
    (flagsSummary || []).forEach((entry) => {
      map.set(entry.playlist_id, entry.unresolved || 0);
    });
    return map;
  }, [flagsSummary]);

  const filteredPlaylists = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return orderedPlaylists.filter((playlist) => {
      if (statusFilter === 'live' && !playlist.published) return false;
      if (statusFilter === 'draft' && playlist.published) return false;
      if (!query) return true;
      const haystack = [
        playlist.title,
        playlist.description,
        playlist.spotify_url,
        playlist.apple_url,
        playlist.tidal_url,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [orderedPlaylists, searchTerm, statusFilter]);

  const totalPlaylists = orderedPlaylists.length;
  const liveCount = published.length;
  const draftCount = Math.max(totalPlaylists - liveCount, 0);
  const flaggedTotal = useMemo(
    () => (flagsSummary || []).reduce((sum, entry) => sum + (entry.unresolved || 0), 0),
    [flagsSummary]
  );

  const handleDeletePlaylist = useCallback(async (playlist) => {
    if (!playlist) return;
    setDeletingId(playlist.id);
    try {
      const res = await authenticatedFetch(`/api/v1/playlists/${playlist.id}`, { method: 'DELETE' });
      const data = await safeJson(res, { context: 'Delete playlist' });
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete playlist');
      }
      await refreshPlaylists();
      setPlaylistStats(prev => {
        const next = { ...prev };
        delete next[playlist.id];
        return next;
      });
      setCrossStats(prev => {
        const next = { ...prev };
        delete next[playlist.id];
        return next;
      });
    } catch (e) {
      alert(e.message || 'Failed to delete playlist');
    } finally {
      setDeletingId(null);
    }
  }, [authenticatedFetch, refreshPlaylists]);

  const handleClearAllDrafts = useCallback(async () => {
    const drafts = orderedPlaylists.filter(p => !p.published);
    if (drafts.length === 0) return;

    setClearingDrafts(true);
    try {
      const deletePromises = drafts.map(async (playlist) => {
        try {
          const res = await authenticatedFetch(`/api/v1/playlists/${playlist.id}`, { method: 'DELETE' });
          const data = await safeJson(res, { context: 'Delete draft playlist' });
          if (!res.ok || !data.success) {
            throw new Error(data.error || `Failed to delete "${playlist.title}"`);
          }
        } catch (e) {
          console.error(`Failed to delete draft "${playlist.title}":`, e);
          throw e;
        }
      });
      
      await Promise.all(deletePromises);
      
      // Clean up stats for deleted playlists
      const draftIds = drafts.map(p => p.id);
      setPlaylistStats(prev => {
        const next = { ...prev };
        draftIds.forEach(id => delete next[id]);
        return next;
      });
      setCrossStats(prev => {
        const next = { ...prev };
        draftIds.forEach(id => delete next[id]);
        return next;
      });
      
      await refreshPlaylists();
    } catch (e) {
      alert(e.message || 'Failed to delete some drafts. Please try again.');
    } finally {
      setClearingDrafts(false);
    }
  }, [authenticatedFetch, orderedPlaylists, refreshPlaylists]);

  const requestDeletePlaylist = useCallback((playlist) => {
    if (!playlist || deletingId === playlist.id) return;
    setConfirmDeletePlaylist(playlist);
  }, [deletingId]);

  const confirmDeletePlaylistAction = useCallback(async () => {
    if (!confirmDeletePlaylist) return;
    await handleDeletePlaylist(confirmDeletePlaylist);
    setConfirmDeletePlaylist(null);
  }, [confirmDeletePlaylist, handleDeletePlaylist]);

  const requestClearAllDrafts = useCallback(() => {
    if (draftCount <= 0 || clearingDrafts) return;
    setConfirmClearDraftsOpen(true);
  }, [draftCount, clearingDrafts]);

  const confirmClearDraftsAction = useCallback(async () => {
    await handleClearAllDrafts();
    setConfirmClearDraftsOpen(false);
  }, [handleClearAllDrafts]);

  const handleUnsavePlaylist = useCallback(async (playlistId) => {
    if (!playlistId) return;
    setUnsavingPlaylistId(playlistId);
    setSavedError('');
    try {
      const response = await authenticatedFetch(`/api/v1/playlist-engagement/${playlistId}/love`, {
        method: 'DELETE'
      });
      const data = await safeJson(response, { context: 'Unsave playlist' });
      if (!response.ok || !data.success) {
        throw new Error(data?.error || 'Failed to unsave playlist');
      }
      await loadSavedPlaylists();
    } catch (error) {
      console.warn('Failed to unsave playlist', error);
      setSavedError(error?.message || 'Failed to unsave playlist');
    } finally {
      setUnsavingPlaylistId(null);
    }
  }, [authenticatedFetch, loadSavedPlaylists]);

  // Fetch per-playlist detail to compute link coverage counts
  useEffect(() => {
    (async () => {
      const toFetch = published.filter((p) => {
        const stats = playlistStats[p.id];
        return !stats || typeof stats.linked !== 'number';
      });
      if (toFetch.length === 0) return;
      const entries = await Promise.all(toFetch.map(async (pl) => {
        try {
          const res = await authenticatedFetch(`/api/v1/playlists/${pl.id}`, { method: 'GET' });
          const data = await safeJson(res, { context: 'Fetch playlist detail' });
          if (!res.ok || !data.success) throw new Error();
          const tracks = data.data?.tracks || [];
          const total = tracks.length;
          const spotify = tracks.filter((t) => t?.spotify_id && String(t.spotify_id).trim() !== '').length;
          const apple = tracks.filter((t) => {
            const hasId = t?.apple_id && String(t.apple_id).trim() !== '';
            const hasUrl = t?.apple_music_url && String(t.apple_music_url).trim() !== '';
            return hasId || hasUrl;
          }).length;
          const tidal = tracks.filter((t) => {
            const hasId = t?.tidal_id && String(t.tidal_id).trim() !== '';
            const hasUrl = t?.tidal_url && String(t.tidal_url).trim() !== '';
            return hasId || hasUrl;
          }).length;
          const linked = tracks.filter((t) => {
            const hasSpotify = t?.spotify_id && String(t.spotify_id).trim() !== '';
            const hasApple = t?.apple_id && String(t.apple_id).trim() !== '';
            const hasAppleUrl = t?.apple_music_url && String(t.apple_music_url).trim() !== '';
            const hasTidal = t?.tidal_id && String(t.tidal_id).trim() !== '';
            const hasTidalUrl = t?.tidal_url && String(t.tidal_url).trim() !== '';
            return hasSpotify || hasApple || hasAppleUrl || hasTidal || hasTidalUrl;
          }).length;
          return [pl.id, { total, spotify, apple, tidal, linked }];
        } catch (err) {
          console.warn('Failed to pull playlist detail for stats', err);
          return [pl.id, { total: pl.tracks_count || 0, spotify: 0, apple: 0, tidal: 0, linked: 0 }];
        }
      }));
      if (entries.length > 0) {
        setPlaylistStats(prev => ({ ...prev, ...Object.fromEntries(entries) }));
      }
    })();
  }, [authenticatedFetch, published, playlistStats]);

  // Periodically fetch DB-driven linking stats for published playlists
  useEffect(() => {
    let timer;
    const fetchStats = async () => {
      if (document.hidden) return;

      for (const pl of published) {
        try {
          const res = await authenticatedFetch(`/api/v1/cross-platform/stats/${pl.id}`, { method: 'GET' });
          const data = await safeJson(res, { context: 'Fetch cross-platform stats' });
          if (res.ok && data.success) {
            setCrossStats(prev => ({ ...prev, [pl.id]: data.data }));
          }
        } catch (err) {
          console.warn('Failed to fetch cross-platform stats', err);
        }
      }
    };

    if (published.length > 0) {
      fetchStats();
      timer = setInterval(fetchStats, 30000);

      const handleVisibilityChange = () => {
        if (!document.hidden && published.length > 0) {
          fetchStats();
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        if (timer) clearInterval(timer);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [published, authenticatedFetch]);

  return (
    <Container>
      <Header>
        <HeaderLeft>
          <Button onClick={() => (window.location.href = '/home')}>Home</Button>
          {curator?.name && (
            <Button onClick={() => (window.location.href = `/curator/${encodeURIComponent(curator.name)}`)}>See Profile</Button>
          )}
        </HeaderLeft>
        <HeaderCenter>
          <a href="/home" aria-label="Go to homepage">
            <Logo src="/logo-bg.png" alt="Logo" />
          </a>
        </HeaderCenter>
        <HeaderRight>
          <ActiveTabPill aria-hidden="true">
            <span className="label">Workspace</span>
            <span className="value">{TAB_LABELS[activeTab] || 'Playlists'}</span>
          </ActiveTabPill>
          <HamburgerButton onClick={() => setHamburgerOpen(true)} aria-label="Open menu">
            ☰
          </HamburgerButton>
        </HeaderRight>
      </Header>
      <HeaderDivider />

      <Tabs>
        <Tab $active={activeTab === 'home'} onClick={() => handleTabChange('home')}>Playlists</Tab>
        <Tab $active={activeTab === 'saved'} onClick={() => handleTabChange('saved')}>Saved</Tab>
        <Tab $active={activeTab === 'profile'} onClick={() => handleTabChange('profile')}>Profile</Tab>
        {hasReleasesAccess && (
          <Tab $active={activeTab === 'releases'} onClick={() => handleTabChange('releases')}>Releases</Tab>
        )}
        {canAccessWriting && (
          <Tab $active={activeTab === 'writing'} onClick={() => handleTabChange('writing')}>Writing</Tab>
        )}
        <Tab $active={activeTab === 'schedules'} onClick={() => handleTabChange('schedules')}>Schedules</Tab>
        <Tab $active={activeTab === 'bio'} onClick={() => handleTabChange('bio')}>Pil.Bio</Tab>
        <Tab $active={activeTab === 'tools'} onClick={() => handleTabChange('tools')}>Tools</Tab>
       {/*} <Tab $active={activeTab === 'embeds'} onClick={() => handleTabChange('embeds')}>Embed</Tab>*/}
        <Tab $active={activeTab === 'account'} onClick={() => handleTabChange('account')}>Account</Tab>
      </Tabs>

      {activeTab === 'home' && (
        <ContentShell>
          <SectionCard>
            <StatHighlights>
              <StatCard>
                <span className="label">Playlists</span>
                <span className="value">{totalPlaylists}</span>
                <span className="meta">Total in workspace</span>
              </StatCard>
              <StatCard>
                <span className="label">Live</span>
                <span className="value">{liveCount}</span>
                <span className="meta">Published and visible</span>
              </StatCard>
              <StatCard>
                <span className="label">Drafts</span>
                <span className="value">{draftCount}</span>
                <span className="meta">Needs publish</span>
              </StatCard>
              <StatCard>
                <span className="label">Open Issues</span>
                <span className="value">{flaggedTotal}</span>
                <span className="meta">Track/report flags</span>
              </StatCard>
            </StatHighlights>

            <ButtonsBar>
              <Button
                $variant="success"
                disabled={!curator}
                onClick={() => {
                  if (!curator) return;
                  window.location.href = '/curator-admin/playlists/new';
                }}
              >
                CREATE PLAYLIST
              </Button>

              <Button $variant="primary" onClick={() => handleTabChange('dsp')}>
                DSP Settings
              </Button>
              {draftCount > 0 && (
                <Button
                  $variant="danger"
                  disabled={clearingDrafts}
                  onClick={requestClearAllDrafts}
                >
                  {clearingDrafts ? 'Clearing...' : `Clear All Drafts (${draftCount})`}
                </Button>
              )}
              <Button $variant="secondary" onClick={() => setFlagsOpen(true)}>
                Review Issues
              </Button>
            </ButtonsBar>

            <Toolbar>
              <ToolbarGroup role="group" aria-label="Filter playlists by status">
                <FilterPill
                  type="button"
                  $active={statusFilter === 'all'}
                  onClick={() => setStatusFilter('all')}
                >
                  All
                </FilterPill>
                <FilterPill
                  type="button"
                  $active={statusFilter === 'live'}
                  onClick={() => setStatusFilter('live')}
                  disabled={totalPlaylists === 0}
                >
                  Live
                </FilterPill>
                <FilterPill
                  type="button"
                  $active={statusFilter === 'draft'}
                  onClick={() => setStatusFilter('draft')}
                  disabled={totalPlaylists === 0}
                >
                  Draft
                </FilterPill>
              </ToolbarGroup>
              <ToolbarGroup>
                <SearchInput
                  type="search"
                  placeholder="Search playlists..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  aria-label="Search playlists"
                />
              </ToolbarGroup>
            </Toolbar>

            {filteredPlaylists.length === 0 ? (
              <EmptyState>
                <p>
                  {totalPlaylists === 0
                    ? 'No playlists yet. Create your first playlist to get started.'
                    : 'No playlists match your filters. Try adjusting the status or search term.'}
                </p>
              </EmptyState>
            ) : (
              <PlaylistTable>
                {filteredPlaylists.map((pl) => {
                  const scheduleRecord = scheduleMap.get(pl.id);
                  const stats = playlistStats[pl.id] || { total: pl.tracks_count || 0, spotify: 0, apple: 0, tidal: 0 };
                  const linkStats = crossStats[pl.id] || {};
                  const total = Number.isFinite(linkStats.total_tracks)
                    ? linkStats.total_tracks
                    : (stats.total || pl.tracks_count || 0);
                  const unresolved = flagsByPlaylist.get(pl.id) || 0;
                  const isPublished = Boolean(pl.published);
                  const isScheduled = Boolean(pl.scheduled_publish_at) && !isPublished;
                  const isDeleting = deletingId === pl.id;
                  const updatedLabel = formatShortDate(pl.updated_at || pl.publish_date);
                  const scheduledLabel = isScheduled ? new Date(pl.scheduled_publish_at).toLocaleString(undefined, {
                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
                  }) : null;

                  return (
                    <PlaylistRow key={pl.id}>
                      <StatusIndicator $active={isPublished} $scheduled={isScheduled} aria-label={isScheduled ? 'Scheduled' : isPublished ? 'Live' : 'Draft'} />
                      <PlaylistCell>
                        {/* Desktop: Show metadata above title */}
                        <PlaylistMeta className="playlist-meta-desktop">
                          {updatedLabel && <MetaItem>Updated {updatedLabel}</MetaItem>}
                          <MetaItem>{total} tracks</MetaItem>
                          {isScheduled && (
                            <MetaItem style={{ color: '#a16207', fontWeight: 600 }}>Posting {scheduledLabel}</MetaItem>
                          )}
                          {scheduleRecord && (
                            <MetaItem>
                              <ScheduleIndicator schedule={scheduleRecord} />
                            </MetaItem>
                          )}
                        </PlaylistMeta>
                        {/* Mobile: Show date and status indicator above title */}
                        <MobileOnlyMeta>
                          {isScheduled
                            ? <MetaItem style={{ color: '#a16207', fontWeight: 600 }}>Posting {scheduledLabel}</MetaItem>
                            : updatedLabel && <MetaItem>Updated {updatedLabel}</MetaItem>
                          }
                          <StatusDot $active={isPublished} style={isScheduled ? { background: '#facc15' } : undefined} aria-label={isScheduled ? 'Scheduled' : isPublished ? 'Live' : 'Draft'} />
                        </MobileOnlyMeta>
                        <PlaylistTitleRow>
                          <PlaylistTitle>{pl.title}</PlaylistTitle>
                          {unresolved > 0 && (
                            <MetricFlag $danger>
                              {`${unresolved} issue${unresolved === 1 ? '' : 's'}`}
                            </MetricFlag>
                          )}
                        </PlaylistTitleRow>
                      </PlaylistCell>
                      <RowActions>
                        <RowActionPrimary>
                          <Button $size="sm" onClick={() => window.location.href = `/curator-admin/playlists?select=${pl.id}`}>
                            Edit
                          </Button>
                          <Button $size="sm" onClick={() => openScheduleModal(pl, scheduleRecord || null, isPublished ? 'import' : 'publish')}>
                            Schedule
                          </Button>
                          {isPublished && (
                            <Button $size="sm" onClick={() => window.location.href = `/playlists/${pl.id}`}>
                              View
                            </Button>
                          )}
                        </RowActionPrimary>
                        <RowActionSecondary>
                          {isPublished && (
                            <Button $size="sm" onClick={() => {
                              setExportPlaylistId(pl.id);
                              setExportOpen(true);
                            }}>
                              Export
                            </Button>
                          )}
                          {isPublished && (
                            <Button
                              $size="sm"
                              onClick={() => {
                                setQrCodePlaylist(pl);
                                setQrCodeModalOpen(true);
                              }}
                            >
                              QR Code
                            </Button>
                          )}
                          <Button
                            $variant="danger"
                            $size="sm"
                            disabled={isDeleting}
                            onClick={() => requestDeletePlaylist(pl)}
                          >
                            {isDeleting ? 'Deleting...' : 'Delete'}
                          </Button>
                        </RowActionSecondary>
                      </RowActions>
                    </PlaylistRow>
                  );
                })}
              </PlaylistTable>
            )}
          </SectionCard>
        </ContentShell>
      )}

      {activeTab === 'saved' && (
        <ContentShell>
          <SectionCard>
            <PageHeader>
              <h1>Saved Playlists</h1>
              <p>Playlists you have loved on the public site appear here.</p>
            </PageHeader>

            {savedError && (
              <StatusMessage $error role="alert">
                {savedError}
              </StatusMessage>
            )}

            {savedLoading ? (
              <EmptyState>
                <p>Loading saved playlists...</p>
              </EmptyState>
            ) : savedPlaylists.length === 0 ? (
              <EmptyState>
                <p>No saved playlists yet. Love a playlist to add it here.</p>
              </EmptyState>
            ) : (
              <PlaylistTable>
                {savedPlaylists.map((playlist) => (
                  <PlaylistRow key={playlist.id}>
                    <StatusIndicator $active={true} aria-label="Saved" />
                    <PlaylistCell>
                      <PlaylistMeta className="playlist-meta-desktop">
                        {playlist.loved_at && <MetaItem>Saved {formatShortDate(playlist.loved_at)}</MetaItem>}
                        <MetaItem>{playlist.tracks_count || 0} tracks</MetaItem>
                        {playlist.curator_name && <MetaItem>{playlist.curator_name}</MetaItem>}
                      </PlaylistMeta>
                      <MobileOnlyMeta>
                        {playlist.loved_at && <MetaItem>Saved {formatShortDate(playlist.loved_at)}</MetaItem>}
                        <StatusDot $active={true} aria-label="Saved" />
                      </MobileOnlyMeta>
                      <PlaylistTitleRow>
                        <PlaylistTitle>{playlist.title}</PlaylistTitle>
                        <MetricFlag>{playlist.curator_name || 'Curator'}</MetricFlag>
                      </PlaylistTitleRow>
                    </PlaylistCell>
                    <RowActions>
                      <RowActionPrimary>
                        <Button $size="sm" onClick={() => window.location.href = `/playlists/${playlist.id}`}>
                          View
                        </Button>
                      </RowActionPrimary>
                      <RowActionSecondary>
                        <Button
                          $variant="danger"
                          $size="sm"
                          disabled={unsavingPlaylistId === playlist.id}
                          onClick={() => handleUnsavePlaylist(playlist.id)}
                        >
                          {unsavingPlaylistId === playlist.id ? 'Removing...' : 'Remove'}
                        </Button>
                      </RowActionSecondary>
                    </RowActions>
                  </PlaylistRow>
                ))}
              </PlaylistTable>
            )}
          </SectionCard>
        </ContentShell>
      )}

      {activeTab === 'embeds' && (
        <ContentShell>
          <EmbedsPanel curatorId={curator?.id} publishedPlaylists={published} />
        </ContentShell>
      )}

      {activeTab === 'schedules' && (
        <ContentShell>
          <SchedulesTab
            playlists={playlists}
            authenticatedFetch={authenticatedFetch}
            onSchedulesChange={setSchedules}
            refreshSignal={scheduleRefreshSignal}
          />
        </ContentShell>
      )}

      {activeTab === 'profile' && (
        <ContentShell>
          <CuratorProfilePage />
        </ContentShell>
      )}

      {activeTab === 'releases' && (
        <ContentShell>
          <CuratorReleasesPanel curator={curator} />
        </ContentShell>
      )}

      {activeTab === 'writing' && canAccessWriting && (
        <ContentShell>
          <SectionCard>
            <CuratorWritingPanel />
          </SectionCard>
        </ContentShell>
      )}

      {activeTab === 'bio' && (
        <ContentShell>
          <CuratorBioPage />
        </ContentShell>
      )}

      {activeTab === 'dsp' && (
        <ContentShell>
          <CuratorDSPConnections />
        </ContentShell>
      )}

      {activeTab === 'account' && (
        <ContentShell>
          <CuratorAccountSettings />
        </ContentShell>
      )}

      {activeTab === 'tools' && (
        <ContentShell>
          <SectionCard>
            <PageHeader>
              <h1>Playlist Tools</h1>
              <p>Utility workflows for exports, filtering, artwork packaging, and analysis.</p>
            </PageHeader>

            <ToolGrid>
              <ToolCard>
                <h3>Text Export</h3>
                <p>Generate a text file with artists, titles, and platform links from any selected playlist.</p>
                <Button $variant="primary" onClick={() => setTextExportModalOpen(true)}>
                  Open Text Export
                </Button>
              </ToolCard>

              <ToolCard>
                <h3>Release Year Filter</h3>
                <p>Filter a playlist by release year and optionally save the filtered result back to Spotify.</p>
                <Button $variant="primary" onClick={() => setReleaseYearFilterOpen(true)}>
                  Open Year Filter
                </Button>
              </ToolCard>

              <ToolCard>
                <h3>Artwork Download</h3>
                <p>Download a ZIP containing artwork assets for tracks in your selected playlist.</p>
                <Button $variant="primary" onClick={() => setArtworkDownloadModalOpen(true)}>
                  Open Artwork Download
                </Button>
              </ToolCard>

              <ToolCard>
                <h3>Playlist Analysis</h3>
                <p>Analyze track-level attributes such as genre spread, top artists, and audio-feature averages.</p>
                <Button $variant="primary" onClick={() => setAnalysisModalOpen(true)}>
                  Open Analysis
                </Button>
              </ToolCard>
            </ToolGrid>
          </SectionCard>
        </ContentShell>
      )}

      <CuratorModalShell
        isOpen={Boolean(confirmDeletePlaylist)}
        onClose={() => setConfirmDeletePlaylist(null)}
        title="Delete playlist"
        size="sm"
        footer={(
          <>
            <Button $variant="default" onClick={() => setConfirmDeletePlaylist(null)}>
              Cancel
            </Button>
            <Button
              $variant="danger"
              onClick={confirmDeletePlaylistAction}
              disabled={Boolean(confirmDeletePlaylist?.id && deletingId === confirmDeletePlaylist.id)}
            >
              {confirmDeletePlaylist?.id && deletingId === confirmDeletePlaylist.id ? 'Deleting...' : 'Delete'}
            </Button>
          </>
        )}
      >
        <p style={{ margin: 0, fontFamily: theme.fonts.primary, lineHeight: 1.5 }}>
          Delete &quot;{confirmDeletePlaylist?.title || 'this playlist'}&quot;? This cannot be undone.
        </p>
      </CuratorModalShell>

      <CuratorModalShell
        isOpen={confirmClearDraftsOpen}
        onClose={() => setConfirmClearDraftsOpen(false)}
        title="Clear drafts"
        size="sm"
        footer={(
          <>
            <Button $variant="default" onClick={() => setConfirmClearDraftsOpen(false)}>
              Keep drafts
            </Button>
            <Button $variant="danger" onClick={confirmClearDraftsAction} disabled={clearingDrafts}>
              {clearingDrafts ? 'Deleting...' : `Delete ${draftCount} draft${draftCount === 1 ? '' : 's'}`}
            </Button>
          </>
        )}
      >
        <p style={{ margin: 0, fontFamily: theme.fonts.primary, lineHeight: 1.5 }}>
          This removes every draft playlist in your workspace. Published playlists are not affected.
        </p>
      </CuratorModalShell>

      {/* Flags review modal */}
      <CuratorFlagsModal isOpen={flagsOpen} onClose={async () => { setFlagsOpen(false); await refreshFlagsSummary(); }} />
      
      {exportOpen && exportPlaylistId && (
        <PlaylistExportModal
          isOpen={exportOpen}
          onClose={() => { setExportOpen(false); setExportPlaylistId(null); }}
          playlistId={exportPlaylistId}
          playlist={playlists.find(p => p.id === exportPlaylistId)}
        />
      )}

      {qrCodeModalOpen && qrCodePlaylist && (
        <React.Suspense fallback={<div>Loading...</div>}>
            <QRCodeModal
                url={`${window.location.origin}/playlists/${qrCodePlaylist.id}?ref=qr`}
                onClose={() => setQrCodeModalOpen(false)}
                title={qrCodePlaylist.title}
            />
        </React.Suspense>
      )}

      {/* Mobile hamburger menu */}
      <HamburgerOverlay $isOpen={hamburgerOpen} onClick={() => setHamburgerOpen(false)} />
      <HamburgerMenu $isOpen={hamburgerOpen}>
        <MenuHeader>
          <CloseButton onClick={() => setHamburgerOpen(false)} aria-label="Close menu">
            &times;
          </CloseButton>
        </MenuHeader>

        <MenuContent>
          <MenuGroup>
            <SectionLabel>CURATOR TOOLS</SectionLabel>
            <MenuItemStyled onClick={() => { handleTabChange('home'); setHamburgerOpen(false); }}>
              PLAYLISTS HOME
            </MenuItemStyled>
            <MenuItemStyled onClick={() => { handleTabChange('saved'); setHamburgerOpen(false); }}>
              SAVED PLAYLISTS
            </MenuItemStyled>
            <MenuItemStyled onClick={() => { handleTabChange('schedules'); setHamburgerOpen(false); }}>
              SCHEDULED IMPORTS
            </MenuItemStyled>
            <MenuItemStyled onClick={() => { handleTabChange('profile'); setHamburgerOpen(false); }}>
              PROFILE EDITOR
            </MenuItemStyled>
            {hasReleasesAccess && (
              <MenuItemStyled onClick={() => { handleTabChange('releases'); setHamburgerOpen(false); }}>
                RELEASES
              </MenuItemStyled>
            )}
            {canAccessWriting && (
              <MenuItemStyled onClick={() => { handleTabChange('writing'); setHamburgerOpen(false); }}>
                WRITING
              </MenuItemStyled>
            )}
            <MenuItemStyled onClick={() => { handleTabChange('bio'); setHamburgerOpen(false); }}>
              Pil.Bio
            </MenuItemStyled>
            <MenuItemStyled onClick={() => { handleTabChange('tools'); setHamburgerOpen(false); }}>
              PLAYLIST TOOLS
            </MenuItemStyled>
            <MenuItemStyled onClick={() => { handleTabChange('dsp'); setHamburgerOpen(false); }}>
              CONFIGURE DSP
            </MenuItemStyled>
            <MenuItemStyled onClick={() => { handleTabChange('account'); setHamburgerOpen(false); }}>
              Account Actions
            </MenuItemStyled>
          </MenuGroup>

          <MenuGroup>
            <SectionLabel>PUBLIC PAGES</SectionLabel>
            {curator?.name && (
              <MenuItemStyled onClick={() => { window.location.href = `/curator/${encodeURIComponent(curator.name)}`; }}>
                VIEW YOUR Profile
              </MenuItemStyled>
            )}

            <MenuItemStyled onClick={() => { window.open('https://docs.fpil.xyz', '_blank', 'noopener,noreferrer'); }}>
              DOCS SITE
            </MenuItemStyled>
          </MenuGroup>
        </MenuContent>
      </HamburgerMenu>

      {scheduleModalOpen && (
        <ScheduleModal
          isOpen={scheduleModalOpen}
          onClose={closeScheduleModal}
          playlist={scheduleModalPlaylist}
          schedule={scheduleModalRecord}
          mode={scheduleModalMode}
          authenticatedFetch={authenticatedFetch}
          onSaved={handleScheduleSaved}
          onDeleted={handleScheduleDeleted}
          onPlaylistUpdated={() => refreshPlaylists()}
          onRequestConnectSpotify={() => {
            closeScheduleModal();
            handleTabChange('dsp');
          }}
        />
      )}

      {analysisModalOpen && (
        <PlaylistAnalysisModal
          isOpen={analysisModalOpen}
          onClose={() => setAnalysisModalOpen(false)}
        />
      )}

      <TextExportModal
        isOpen={textExportModalOpen}
        onClose={() => setTextExportModalOpen(false)}
      />

      <ReleaseYearFilterModal
        isOpen={releaseYearFilterOpen}
        onClose={() => setReleaseYearFilterOpen(false)}
      />

      <ArtworkDownloadModal
        isOpen={artworkDownloadModalOpen}
        onClose={() => setArtworkDownloadModalOpen(false)}
      />

      {/* First Visit DSP Configuration Modal */}
      <FirstVisitDSPModal
        isOpen={firstVisitDSPModalOpen}
        onClose={() => setFirstVisitDSPModalOpen(false)}
        onNavigateToDSP={() => handleTabChange('dsp')}
      />

      {/* First Visit Bio Modal */}
      <FirstVisitBioModal
        isOpen={firstVisitBioModalOpen}
        onClose={() => setFirstVisitBioModalOpen(false)}
      />
    </Container>
  );
}
