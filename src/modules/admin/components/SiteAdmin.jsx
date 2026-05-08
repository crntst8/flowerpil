import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import styled from 'styled-components';
import { theme, DashedBox, Button, Input, TextArea } from '@shared/styles/GlobalStyles';
import { adminGet, adminPost, adminDelete, adminPut, adminUpload } from '../utils/adminApi';
import RequestsQueue from './RequestsQueue.jsx';
import ScheduledImportsPanel from './ScheduledImportsPanel.jsx';
import AdminDSPConnections from './AdminDSPConnections.jsx';
import LinkOutAdminPanel from './LinkOutAdminPanel.jsx';
import { getCuratorTypeOptions } from '@shared/constants/curatorTypes';

const SiteAdminContainer = styled.div`
  display: grid;
  gap: ${theme.spacing.lg};
  background: ${theme.colors.white};
  color: ${theme.colors.black};
  padding: clamp(${theme.spacing.md}, 1vw, ${theme.spacing.md});
  border-radius: 12px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.18);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.06);

  @media (max-width: ${theme.breakpoints.tablet}) {
    padding: ${theme.spacing.lg};
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    padding: ${theme.spacing.md};
  }
`;

const SectionCard = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  background: ${theme.colors.fpwhite};
  border-radius: 10px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.14);
  padding: clamp(${theme.spacing.sm}, 0.5vw, ${theme.spacing.lg});
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.04);

  @media (max-width: ${theme.breakpoints.mobile}) {
    padding: ${theme.spacing.md};
  }
`;
//******* SITE ADMIN HEADER ********//

const SiteAdminHeader = styled.header`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const SiteAdminTitle = styled.h2`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h3};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const SiteAdminMeta = styled.p`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.65);
  line-height: 1.4;
`;

//******* STATS ********//
const StatGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.sm};
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
`;

const StatTile = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  padding: ${theme.spacing.md};
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.77);
  border: ${theme.borders.dashedThin} rgba(0, 0, 0, 0.15);
`;

const StatLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 1);
`;

const StatValue = styled.span`
  font-family: ${theme.fonts.primary};
  font-size: calc(${theme.fontSizes.h3} * 0.9);
  font-weight: ${theme.fontWeights.bold};
  color: ${theme.colors.success};
`;

const StatMeta = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(51, 255, 0, 0.55);
`;

const HealthSummaryRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
`;

const HealthStatusBadge = styled.span.withConfig({ shouldForwardProp: (prop) => prop !== '$status' })`
  display: inline-flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border-radius: 999px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: ${({ $status }) => {
    if ($status === 'critical') return 'rgba(220, 53, 69, 0.1)';
    if ($status === 'warning') return 'rgba(255, 193, 7, 0.12)';
    return 'rgba(33, 150, 243, 0.12)';
  }};
  color: ${({ $status }) => {
    if ($status === 'critical') return theme.colors.error;
    if ($status === 'warning') return theme.colors.warning;
    return theme.colors.success;
  }};
  border: ${theme.borders.dashedThin} ${({ $status }) => {
    if ($status === 'critical') return theme.colors.error;
    if ($status === 'warning') return theme.colors.warning;
    return theme.colors.success;
  }};
`;

const HealthMeta = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black[500]};
`;

const HealthMetricsGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.sm};
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
`;

const HealthMetricCard = styled.div`
  padding: ${theme.spacing.sm};
  border-radius: 10px;
  border: ${theme.borders.dashedThin} rgba(0, 0, 0, 0.15);
  background: rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const HealthMetricLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  color: ${theme.colors.black[500]};
`;

const HealthMetricValue = styled.span`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h4};
  font-weight: ${theme.fontWeights.bold};
  color: ${theme.colors.black};
`;

const HealthMetricMeta = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black[400]};
`;

const AlertList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const AlertCard = styled.div.withConfig({ shouldForwardProp: (prop) => prop !== '$severity' })`
  border-radius: 12px;
  border: ${theme.borders.solidThin} ${({ $severity }) => {
    if ($severity === 'critical') return 'rgba(220, 53, 69, 0.35)';
    if ($severity === 'warning') return 'rgba(255, 193, 7, 0.45)';
    return 'rgba(76, 175, 80, 0.35)';
  }};
  background: ${({ $severity }) => {
    if ($severity === 'critical') return 'rgba(220, 53, 69, 0.08)';
    if ($severity === 'warning') return 'rgba(255, 193, 7, 0.08)';
    return 'rgba(76, 175, 80, 0.08)';
  }};
  padding: ${theme.spacing.sm};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const AlertTitle = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.large};
  font-weight: ${theme.fontWeights.bold};
  display: flex;
  justify-content: space-between;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
`;

const AlertTimestamp = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black[500]};
`;

const AlertInstructions = styled.ol`
  margin: 0;
  padding-left: 1.2rem;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  li {
    margin-bottom: ${theme.spacing.xs};
  }
`;

const AutomationActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.sm};
  align-items: center;
`;

const AutomationLog = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black[500]};
`;

const HealthLogsTable = styled.div`
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.15);
  border-radius: 10px;
  overflow: hidden;
`;

const HealthLogHeader = styled.div`
  display: grid;
  grid-template-columns: 1fr minmax(80px, 0.5fr) minmax(140px, 1fr) minmax(160px, 1fr);
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm};
  background: rgba(0, 0, 0, 0.04);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;

  @media (max-width: ${theme.breakpoints.tablet}) {
    display: none;
  }
`;

const HealthLogRow = styled.div`
  display: grid;
  grid-template-columns: 1fr minmax(80px, 0.5fr) minmax(140px, 1fr) minmax(160px, 1fr);
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  border-bottom: ${theme.borders.solidThin} rgba(0, 0, 0, 0.06);

  &:nth-child(even) {
    background: rgba(0, 0, 0, 0.02);
  }

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
    gap: ${theme.spacing.xs};
    padding: ${theme.spacing.md};
    border-radius: 8px;
    margin-bottom: ${theme.spacing.xs};
    background: rgba(0, 0, 0, 0.03) !important;
    border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);

    > * {
      display: flex;
      flex-direction: column;
      gap: 2px;

      &::before {
        font-weight: bold;
        text-transform: uppercase;
        font-size: calc(${theme.fontSizes.tiny} * 0.9);
        opacity: 0.7;
      }

      &:nth-child(1)::before { content: "Check"; }
      &:nth-child(2)::before { content: "Status"; }
      &:nth-child(3)::before { content: "Last Run"; }
      &:nth-child(4)::before { content: "Details"; }
    }
  }
`;

const StatusTag = styled.span.withConfig({ shouldForwardProp: (prop) => prop !== '$status' })`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 6px;
  border-radius: 6px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: ${({ $status }) => {
    if ($status === 'fail' || $status === 'error') return 'rgba(220, 53, 69, 0.18)';
    if ($status === 'warn' || $status === 'skipped') return 'rgba(255, 193, 7, 0.2)';
    if ($status === 'applied' || $status === 'pass') return 'rgba(76, 175, 80, 0.18)';
    return 'rgba(33, 150, 243, 0.18)';
  }};
  color: ${({ $status }) => {
    if ($status === 'fail' || $status === 'error') return theme.colors.error;
    if ($status === 'warn' || $status === 'skipped') return theme.colors.warning;
    if ($status === 'applied' || $status === 'pass') return theme.colors.success;
    return theme.colors.black;
  }};
`;

const PrimaryGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.md};
  grid-template-columns: minmax(0, 4fr) ;

  @media (max-width: ${theme.breakpoints.desktop}) {
    grid-template-columns: 1fr;
  }
`;

const UtilityTabBar = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
  border-bottom: ${theme.borders.dashedThin} rgba(0, 0, 0, 0.2);
  padding-bottom: ${theme.spacing.xs};
  overflow-x: auto;
`;

const UtilityTabButton = styled.button.withConfig({
  shouldForwardProp: (prop) => prop !== '$active'
})`
  flex: 0 0 auto;
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border-radius: 8px;
  border: ${theme.borders.dashedThin} ${({ $active }) => ($active ? theme.colors.black : 'rgba(0, 0, 0, 0.2)')};
  background: ${({ $active }) => ($active ? 'rgba(0, 0, 0, 0.06)' : 'transparent')};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
  white-space: nowrap;

  &:hover {
    border-color: ${theme.colors.black};
  }

  &:focus {
    outline: 2px solid ${theme.colors.black};
    outline-offset: 2px;
  }
`;

const UtilityTabPanel = styled.div`
  margin-top: ${theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  min-width: 0;
`;

const UtilityPanelTitle = styled.h3`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${theme.colors.black};
`;

const ResponsiveGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.lg};
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
`;

const SectionDivider = styled.hr`
  border: none;
  border-top: ${theme.borders.solidThin} rgba(0, 0, 0, 0.08);
`;



const GhostButton = styled(Button).withConfig({ shouldForwardProp: (prop) => prop !== '$active' })`
  background: transparent;
  border-color: ${({ $active }) => ($active ? theme.colors.black : 'rgba(0, 0, 0, 0.25)')};
  color: ${theme.colors.black};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
    font-size: ${theme.fontSizes.tiny};


  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.06);
    border-color: ${theme.colors.black};
  }

  ${({ $active }) => $active && `
    background: rgba(0, 0, 0, 0.08);
  `}
`;


// Referrals — cleaner, responsive UX
const ReferralFormGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(160px, 1fr) max-content;
  gap: ${theme.spacing.xs};
  align-items: end;
  margin-bottom: ${theme.spacing.md};
  
  .actions { 
    display: flex; 
    justify-content: flex-end; 
    max-width: 100%;
    overflow: hidden;
    justify-self: end;
    

  }
  .actions > button { max-width: 100%;  }

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr 1fr;
    .actions { grid-column: 1 / -1; }
  }

  @media (max-width: ${theme.breakpoints.mobile}) {
    grid-template-columns: 1fr;
  }
`;

const LabelText = styled.label`
  display: block;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: ${theme.spacing.xs};
`;





//********************* REFERRALS ******************//////

const ReferralList = styled.div`
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.14);
  border-radius: 10px;
  background: ${theme.colors.fpwhite};
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const ReferralHeaderRow = styled.div`
  display: grid;
  grid-template-columns: 1.1fr 1.6fr 1.2fr 1.2fr 0.8fr minmax(80px, max-content);
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: rgba(0, 0, 0, 0.04);
  position: sticky;
  top: 0;
  z-index: 1;

  @media (max-width: ${theme.breakpoints.tablet}) {
    display: none;
  }
`;

const ReferralRows = styled.div`
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

const ReferralRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1.6fr 1.2fr 1.2fr 0.8fr minmax(80px, max-content);
  gap: ${theme.spacing.sm};
  align-items: left;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  border-bottom: ${theme.borders.solidThin} rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.015);

  &:nth-child(even) {
    background: rgba(0, 0, 0, 0.03);
  }

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: rgba(0, 0, 0, 0.05);
  }

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
    gap: ${theme.spacing.sm};
    align-items: flex-start;
    padding: ${theme.spacing.md};
    border-radius: 8px;
    margin-bottom: ${theme.spacing.sm};
    border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  }
`;

const ReferralCell = styled.div`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media (max-width: ${theme.breakpoints.tablet}) {
    white-space: normal;
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing.xxs};

    &[data-label]::before {
      content: attr(data-label);
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-size: ${theme.fontSizes.tiny};
      opacity: 0.7;
      margin-bottom: 2px;
    }
  }
`;

const ReferralActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${theme.spacing.xs};

  @media (max-width: ${theme.breakpoints.tablet}) {
    justify-content: stretch;
    margin-top: ${theme.spacing.xs};

    button {
      flex: 1;
      min-height: 44px;
    }
  }
`;

const CodeBadge = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  border: ${theme.borders.dashed} ${theme.colors.black[300]};
  padding: 5px 5px;
  display: inline-flex;
  max-height: 50%;
  align-items: center;
  gap: ${theme.spacing.s};
  cursor: pointer;
  user-select: all;
`;

const StatusChip = styled.span.withConfig({ shouldForwardProp: (p) => p !== '$status' })`
  display: inline-block;
  padding: 5px 8px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  border: ${theme.borders.dashed} ${props => props.$status === 'used' ? theme.colors.olive : theme.colors.success};
  color: ${props => props.$status === 'used' ? theme.colors.black : theme.colors.success};
  background: ${props => props.$status === 'used' ? 'rgba(31, 189, 86, 0.38)' : 'rgba(76, 175, 80, 0.08)'};
`;

const EmptyRow = styled.div`
  padding: ${theme.spacing.md};
  text-align: center;
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const UTILITY_TABS = [
  { id: 'test-emails', label: 'Test Emails' },
  { id: 'test-slack', label: 'Test Slack' },
  { id: 'cross-link-dry-run', label: 'Cross-Link Dry Run' },
  { id: 'dsp', label: 'DSP Connections' },
  { id: 'exports', label: 'Export Requests' },
];

const DEFAULT_UTILITY_TAB = UTILITY_TABS[0].id;

const HandlesEmpty = styled(EmptyRow)`
  border: none;
  margin: 0;
`;

const PROFILE_HANDLE_COLUMNS = 'minmax(160px, 1fr) minmax(180px, 1.2fr) minmax(90px, 0.7fr) minmax(150px, 0.9fr) minmax(150px, 0.9fr)';
const RESERVATION_HANDLE_COLUMNS = 'minmax(160px, 1fr) minmax(200px, 1.3fr) minmax(110px, 0.7fr) minmax(150px, 0.9fr) minmax(150px, 0.9fr)';

const HandlesControls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.sm};
  align-items: center;
  margin-bottom: ${theme.spacing.md};

  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const HandlesTable = styled.div`
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.14);
  border-radius: 10px;
  background: ${theme.colors.fpwhite};
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const HandlesScroll = styled.div`
  max-height: 360px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

const HandlesHeaderRow = styled.div.withConfig({ shouldForwardProp: (prop) => prop !== '$columns' })`
  display: grid;
  grid-template-columns: ${PROFILE_HANDLE_COLUMNS};
  grid-template-columns: ${({ $columns }) => $columns};
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.xs};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: rgba(0, 0, 0, 0.04);
  border-bottom: ${theme.borders.solidThin} rgba(0, 0, 0, 0.1);
  position: sticky;
  top: 0;
  z-index: 1;

  @media (max-width: ${theme.breakpoints.tablet}) {
    display: none;
  }
`;

const HandlesRow = styled.div.withConfig({ shouldForwardProp: (prop) => prop !== '$columns' })`
  display: grid;
  grid-template-columns: ${({ $columns }) => $columns};
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-bottom: ${theme.borders.solidThin} rgba(0, 0, 0, 0.06);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  align-items: left;
  word-break: break-word;

  &:nth-child(even) {
    background: rgba(0, 0, 0, 0.02);
  }

  &:last-child {
    border-bottom: none;
  }

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr !important;
    gap: ${theme.spacing.sm};
    padding: ${theme.spacing.md};
    border-radius: 8px;
    margin-bottom: ${theme.spacing.sm};
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  }
`;

const HandlesCell = styled.div`
  min-width: 0;
  word-break: break-word;

  @media (max-width: ${theme.breakpoints.tablet}) {
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing.xxs};

    &[data-label]::before {
      content: attr(data-label);
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-size: ${theme.fontSizes.tiny};
      opacity: 0.7;
      margin-bottom: 2px;
    }
  }
`;

const HandleStatusBadge = styled.span.withConfig({ shouldForwardProp: (prop) => prop !== '$variant' })`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  padding: 1px 1px;
  border-radius: 9px;
  text-transform: uppercase;
  
  letter-spacing: 0.08em;
  border: ${theme.borders.solid} ${({ $variant }) => {
    if ($variant === 'draft') return theme.colors.black[500];
    if ($variant === 'reserved') return theme.colors.warning;
    if ($variant === 'expired') return theme.colors.black[400];
    if ($variant === 'released') return theme.colors.black[500];
    return theme.colors.success;
  }};
  color: ${({ $variant }) => {
    if ($variant === 'draft') return theme.colors.danger;
    if ($variant === 'reserved') return theme.colors.warning;
    if ($variant === 'expired') return theme.colors.black[400];
    if ($variant === 'released') return theme.colors.black[400];
    return theme.colors.success;
  }};
  font-size: calc(${theme.fontSizes.tiny}*0.8);
`;

const HandleLinkButton = styled.button`
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  font-weight: bold;
  color: ${theme.colors.primary};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  text-decoration: underline;
  cursor: pointer;
  justify-items: left;
  align-text: left;

  &:hover {
    color: ${theme.colors.black};
  }
`;

//HEADERS

const SectionHeader = styled.h3`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.sm};
  color: ${theme.colors.black};
  text-transform: uppercase;
  letter-spacing: -0.9px;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  margin-bottom: 2px;
  padding-bottom: 2px;
  border-bottom: 1px solid black;
`;

// Curator type layout
const CuratorTypeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.md};
`;

const CuratorTypeSection = styled.div`
  display: flex;
  flex-direction: column;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.2);
  background: ${theme.colors.fpwhite};
`;

const CuratorTypeSectionHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: ${theme.spacing.sm} ${theme.spacing.sm} ${theme.spacing.xs};
  border-bottom: ${theme.borders.dashed} rgba(0, 0, 0, 0.15);
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const CuratorTypeSectionTitle = styled.span`
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
`;

const CuratorTypeSectionMeta = styled.span`
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
`;

const CuratorTypeList = styled.div`
  display: flex;
  flex-direction: column;
  padding: ${theme.spacing.xs} ${theme.spacing.sm} ${theme.spacing.sm};
  gap: ${theme.spacing.xs};
`;

const CuratorTypeRow = styled.div`
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: ${theme.spacing.sm};
  align-items: center;
  padding: ${theme.spacing.xs} 0;
  border-bottom: ${theme.borders.dashed} rgba(0, 0, 0, 0.06);

  &:last-child {
    border-bottom: none;
  }
`;

const ColorPicker = styled.input`
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
  padding: 0;

  &::-webkit-color-swatch-wrapper {
    padding: 0;
    border: none;
  }

  &::-webkit-color-swatch {
    border: none;
    border-radius: 4px;
  }
`;

const CuratorTypeBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const CuratorTypeName = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  letter-spacing: 0.05em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const CuratorTypeId = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  letter-spacing: 0.05em;
  text-transform: uppercase;
`;

const CuratorTypeActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
`;

const InlineInput = styled.input`
  width: 100%;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.25);
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  padding: ${theme.spacing.xs};
  letter-spacing: 0.05em;
  text-transform: uppercase;

  &:focus {
    outline: none;
    border-color: ${theme.colors.black};
  }
`;

const AddCuratorTypeForm = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr auto auto;
  gap: ${theme.spacing.sm};
  align-items: center;
  margin-top: ${theme.spacing.md};
  padding: ${theme.spacing.sm};
  border: ${theme.borders.dashed} ${theme.colors.black};
  background: ${theme.colors.fpwhite};

  @media (max-width: ${theme.breakpoints.mobile}) {
    grid-template-columns: 1fr;
  }
`;

const GenreControls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.sm};
  align-items: center;
`;

const GenreSearchInput = styled(Input)`
  max-width: 260px;
`;

const GenreAddForm = styled.form`
  display: flex;
  align-items: stretch;
  gap: ${theme.spacing.xs};
  position: relative;

  @media (max-width: ${theme.breakpoints.mobile}) {
    width: 100%;
  }
`;

const GenreInput = styled(Input)`
  min-width: 220px;
  text-transform: capitalize;

  @media (max-width: ${theme.breakpoints.mobile}) {
    flex: 1;
    min-width: 0;
  }
`;

const GenreSuggestionList = styled.ul`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 180px;
  overflow-y: auto;
  margin: 0;
  padding: ${theme.spacing.xs};
  list-style: none;
  background: rgba(8, 8, 8, 0.92);
  border: ${theme.borders.dashed} ${theme.colors.black[700]};
  z-index: 5;

  li + li {
    margin-top: ${theme.spacing.xs};
  }

  button {
    width: 100%;
    text-align: left;
    padding: ${theme.spacing.xs};
    background: transparent;
    border: none;
    color: ${theme.colors.black[200]};
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.tiny};
    letter-spacing: 0.05em;
    text-transform: uppercase;
    cursor: pointer;

    &:hover {
      color: ${theme.colors.black};
      background: rgba(0, 0, 0, 0.08);
    }
  }
`;

const GenreList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  margin-top: ${theme.spacing.sm};
`;

const GenreRow = styled.div`
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: ${theme.spacing.sm};
  align-items: center;
  padding: ${theme.spacing.xs};
  border: ${theme.borders.dashed} ${theme.colors.black};
  background: ${theme.colors.fpwhite};

  @media (max-width: ${theme.breakpoints.mobile}) {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
`;

const GenreColorInput = styled.input.attrs({ type: 'color' })`
  width: 42px;
  height: 28px;
  padding: 0;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.3);
  background: transparent;
  cursor: pointer;

  &::-webkit-color-swatch-wrapper {
    padding: 0;
    border: none;
  }

  &::-webkit-color-swatch {
    border: none;
    border-radius: 4px;
  }
`;

const GenreBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const GenreLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const GenreId = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black[400]};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const GenreActions = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  justify-content: flex-end;

  @media (max-width: ${theme.breakpoints.mobile}) {
    justify-content: flex-start;
  }
`;

const BulkAddWrapper = styled.div`
  margin-top: ${theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const BulkTextArea = styled.textarea`
  width: 100%;
  min-height: 120px;
  padding: ${theme.spacing.sm};
  border: ${theme.borders.dashed} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  resize: vertical;

  &:focus {
    border-color: ${theme.colors.black};
    outline: none;
  }
`;

const BulkActionRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
`;

const GenreHint = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black[400]};
`;


//ORDERING
const OrderingContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const OrderItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: 8px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.14);
  background: rgba(0, 0, 0, 0.02);
`;

const OrderControls = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
`;

const ColorControlRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
`;

const CheckboxRow = styled.label`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const CustomFlagForm = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: ${theme.spacing.sm};
  align-items: stretch;
  margin-bottom: ${theme.spacing.md};

  @media (max-width: ${theme.breakpoints.mobile}) {
    grid-template-columns: 1fr;
  }
`;


const StatusMessage = styled.div.withConfig({ shouldForwardProp: (prop) => prop !== '$type' })`
  display: inline-flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: 8px;
  border: ${theme.borders.solidThin} ${({ $type }) => {
    if ($type === 'error') return theme.colors.danger;
    if ($type === 'success') return theme.colors.success;
    return theme.colors.primary;
  }};
  background: ${({ $type }) => {
    if ($type === 'error') return 'rgba(229, 62, 62, 0.1)';
    if ($type === 'success') return 'rgba(76, 175, 80, 0.12)';
    return 'rgba(71, 159, 242, 0.15)';
  }};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${theme.colors.black};
`;

const CustomFlagsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const PlaceholderSection = styled(DashedBox)`
  padding: ${theme.spacing.lg};
  text-align: center;
  background: rgba(0, 0, 0, 0.02);
`;

const PlaceholderText = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black[400]};
  margin: 0;
`;

const PlaylistFlagSection = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${theme.spacing.lg};
  margin-top: ${theme.spacing.lg};
  
  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
  }
`;

const PlaylistList = styled.div`
  max-height: 400px;
  overflow-y: auto;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.14);
  border-radius: 10px;
  padding: ${theme.spacing.sm};
  background: ${theme.colors.fpwhite};
`;

const PlaylistItem = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== '$selected'
})`
  padding: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.xs};
  border-radius: 8px;
  border: ${theme.borders.solidThin} ${({ $selected }) => ($selected ? theme.colors.black : 'transparent')};
  background: ${({ $selected }) => ($selected ? 'rgba(0, 0, 0, 0.05)' : 'transparent')};
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: rgba(0, 0, 0, 0.03);
  }
  
  .title {
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.black};
    margin-bottom: ${theme.spacing.xs};
  }
  
  .meta {
    font-size: ${theme.fontSizes.tiny};
    color: ${theme.colors.black[400]};
  }
`;

const FlagAssignmentPanel = styled.div`
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.14);
  border-radius: 10px;
  padding: ${theme.spacing.md};
  background: ${theme.colors.fpwhite};
`;

const AssignedFlagItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  margin-bottom: ${theme.spacing.xs};
  border-radius: 8px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  background: rgba(0, 0, 0, 0.02);
`;

const FlagIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  
  .flag-color {
    width: 12px;
    height: 12px;
    border: 1px solid rgba(0, 0, 0, 0.3);
    border-radius: 2px;
  }
  
  .flag-text {
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.black};
  }
`;

const AvailableFlags = styled.div`
  margin-top: ${theme.spacing.md};
  
  .header {
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.black};
    margin-bottom: ${theme.spacing.sm};
  }
`;

const AvailableFlagItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.xs};
  border: ${theme.borders.dashed} transparent;
  background: rgba(0, 0, 0, 0.02);

  &:hover {
    border-color: ${theme.colors.black};
  }
`;

const ColorPickerLabel = styled.label`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black[400]};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  min-width: 35px;
`;

const EditorialGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const EditorialRow = styled.div`
  display: grid;
  grid-template-columns: 200px 4fr;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  background: rgba(0, 0, 0, 0.04);
  border-radius: 12px;
  border: ${theme.borders.dashedThin} rgba(0, 0, 0, 0.1);
`;

const EditorialPreview = styled.div`
  width: 100%;
  aspect-ratio: 1;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.08);
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  display: flex;
  align-items: left;
  justify-content: left;
  overflow: hidden;
`;

const EditorialPreviewImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const EditorialInputs = styled.div`
  display: flex;
  
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const EditorialRowActions = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
  margin-top: ${theme.spacing.xs};
`;

const InlineInputGroup = styled.div`
  display: wrap;
  flex-direction: column;
  gap: 1px;
`;

//** SEARCH BAR PREVIEW  **//
const PreviewPlaceholder = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const HelperText = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
`;

const MAX_EDITORIALS = 4;
const TEST_EMAIL_PURPOSE_LABELS = {
  signup: 'Signup confirmation',
  password_reset: 'Password reset',
  referral: 'Referral invite'
};

const SLACK_NOTIFICATION_LABELS = {
  spotify_access_request: 'Spotify Access Request',
  apple_export_success: 'Apple Export Success',
  apple_resolution_failed: 'Apple Resolution Failed',
  system_alert: 'System Alert'
};

const DRY_RUN_PLATFORM_LABELS = {
  spotify: 'Spotify',
  apple: 'Apple Music',
  tidal: 'Tidal',
  youtube: 'YouTube Music'
};

const TestEmailActions = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
`;

const TestSlackActions = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const DryRunFormGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${theme.spacing.sm};
`;

const DryRunActions = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
`;

const DryRunResultsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: ${theme.spacing.sm};
`;

const DryRunResultCard = styled.div`
  border: ${theme.borders.dashedThin} rgba(0, 0, 0, 0.25);
  border-radius: 10px;
  padding: ${theme.spacing.sm};
  background: rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const DryRunResultTitle = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${theme.colors.black};
`;

const DryRunResultRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: ${theme.spacing.xs};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  word-break: break-word;
`;

const DryRunResultLabel = styled.span`
  opacity: 0.7;
`;

const DryRunResultValue = styled.span`
  text-align: right;
`;

const DryRunResultLink = styled.a`
  color: ${theme.colors.black};
  text-decoration: underline;
  word-break: break-all;
`;

const EditorialControls = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
  justify-content: flex-end;
  margin-top: ${theme.spacing.sm};
`;

const SectionHeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
`;

const SectionHeaderActions = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
`;

const EditorialSummaryGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.sm};
  margin-top: ${theme.spacing.sm};
`;

const EditorialSummaryCard = styled.div.withConfig({ shouldForwardProp: (prop) => prop !== '$active' })`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  width: clamp(220px, 24vw, 260px);
  padding: ${theme.spacing.sm};
  border-radius: 12px;
  border: ${({ $active }) => $active ? `${theme.borders.solid} ${theme.colors.black}` : `${theme.borders.dashedThin} rgba(0, 0, 0, 0.15)`};
  background: ${({ $active }) => $active ? 'rgba(0, 0, 0, 0.08)' : 'rgba(0, 0, 0, 0.04)'};
  transition: border ${theme.transitions.fast}, background ${theme.transitions.fast};
`;

const EditorialSummaryImage = styled.img`
  width: 100%;
  aspect-ratio: 1;
  border-radius: 10px;
  object-fit: cover;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
`;

const EditorialSummaryPlaceholder = styled.div`
  width: 100%;
  aspect-ratio: 1;
  border-radius: 10px;
  border: ${theme.borders.dashedThin} rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black[600]};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const EditorialSummaryInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const EditorialSummaryTitle = styled.h4`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: 0.9rem;
  letter-spacing: 0.05em;
`;

const EditorialSummaryDescription = styled.p`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: 0.75rem;
  color: ${theme.colors.black[600]};
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const EditorialSummaryMeta = styled.span`
  display: block;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black[600]};
  word-break: break-word;
`;

const EditorialSummaryActions = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
`;

const SiteAdmin = () => {
  const [status, setStatus] = useState({ type: '', message: '' });
  const [curatorTypes, setCuratorTypes] = useState([]);
  const [curatorTypeColors, setCuratorTypeColors] = useState({});
  const [genreCategories, setGenreCategories] = useState([]);
  const [genreSearch, setGenreSearch] = useState('');
  const [newGenreName, setNewGenreName] = useState('');
  const [bulkGenreInput, setBulkGenreInput] = useState('');
  const [editingGenre, setEditingGenre] = useState(null);
  const [editingGenreDraft, setEditingGenreDraft] = useState('');
  const [referralForm, setReferralForm] = useState({ email: '', curator_name: '' });
  const [referrals, setReferrals] = useState([]);
  const [latestPageOrder, setLatestPageOrder] = useState([]);
  const [customFlags, setCustomFlags] = useState([]);
  const [newFlag, setNewFlag] = useState({ text: '', color: '#ffffff', textColor: '#ffffff', description: '', allowSelfAssign: false });
  const [editingTagId, setEditingTagId] = useState(null);
  const [editingTag, setEditingTag] = useState({ text: '', color: '#ffffff', textColor: '#ffffff', description: '', allowSelfAssign: false });
  const [newCuratorType, setNewCuratorType] = useState({ id: '', label: '', color: '#ffffff' });
  const [editingType, setEditingType] = useState(null);
  const [editingTypeDraft, setEditingTypeDraft] = useState('');
  const [playlistsForFlags, setPlaylistsForFlags] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [playlistFlags, setPlaylistFlags] = useState([]);
  const [selectedPlaylists, setSelectedPlaylists] = useState([]);
  const [bulkSelectedTag, setBulkSelectedTag] = useState('');
  const [genreCategoriesCollapsed, setGenreCategoriesCollapsed] = useState(true);
  const [curatorTypesCollapsed, setCuratorTypesCollapsed] = useState(true);
  const [bioHandles, setBioHandles] = useState({ profiles: [], reservations: [] });
  const [handleSearch, setHandleSearch] = useState('');
  const [handleView, setHandleView] = useState('profiles');
  const [searchHighlightsCollapsed, setSearchHighlightsCollapsed] = useState(false);
  const [searchEditorials, setSearchEditorials] = useState([]);
  const [searchEditorialsLoading, setSearchEditorialsLoading] = useState(false);
  const [searchEditorialsSaving, setSearchEditorialsSaving] = useState(false);
  const [editingEditorialIndex, setEditingEditorialIndex] = useState(-1);
  const [editorialUploadBusyIndex, setEditorialUploadBusyIndex] = useState(null);
  const [testEmailOverride, setTestEmailOverride] = useState('');
  const [testEmailStatus, setTestEmailStatus] = useState({ type: '', message: '', detail: '' });
  const [testEmailBusy, setTestEmailBusy] = useState('');
  const [testSlackStatus, setTestSlackStatus] = useState({ type: '', message: '', detail: '' });
  const [testSlackBusy, setTestSlackBusy] = useState('');
  const [dryRunForm, setDryRunForm] = useState({
    artist: '',
    title: '',
    album: '',
    isrc: '',
    durationMs: ''
  });
  const [dryRunStatus, setDryRunStatus] = useState({ type: '', message: '', detail: '' });
  const [dryRunBusy, setDryRunBusy] = useState(false);
  const [dryRunResult, setDryRunResult] = useState(null);
  const [systemHealth, setSystemHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState('');
  const [healthActionBusy, setHealthActionBusy] = useState(false);
  const [activeUtilityTab, setActiveUtilityTab] = useState(DEFAULT_UTILITY_TAB);
  const editorialFileInputRef = useRef(null);
  const healthIntervalRef = useRef(null);

  const customCuratorTypes = useMemo(
    () => (curatorTypes || []).filter(type => type.custom),
    [curatorTypes]
  );

  const curatorTypeOptions = useMemo(
    () => getCuratorTypeOptions(customCuratorTypes),
    [customCuratorTypes]
  );

  const customTypeMap = useMemo(() => {
    return customCuratorTypes.reduce((acc, type) => {
      acc[type.id] = type;
      return acc;
    }, {});
  }, [customCuratorTypes]);

  // Flattened option list -> grouped sections for the admin picker UI
  const curatorTypeSections = useMemo(() => {
    const sections = [];
    let currentSection = null;

    curatorTypeOptions.forEach(option => {
      if (option.isHeader) {
        currentSection = {
          id: option.value,
          label: option.label,
          options: []
        };
        sections.push(currentSection);
      } else if (currentSection) {
        currentSection.options.push(option);
      }
    });

    return sections.filter(section => section.options.length > 0);
  }, [curatorTypeOptions]);

  const formatCategoryLabel = (rawLabel = '') => {
    const match = rawLabel.match(/—\[(.*)\]—/);
    const base = match ? match[1] : rawLabel;
    return base
      .split('-')
      .join(' ')
      .toLowerCase()
      .replace(/(^|\s)([a-z])/g, (_, prefix, char) => `${prefix}${char.toUpperCase()}`);
  };

  const formatDateTime = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatLatency = useCallback((value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '—';
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}s`;
    }
    return `${Math.round(value)}ms`;
  }, []);

  const formatPercent = useCallback((value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '—';
    return `${(value * 100).toFixed(1)}%`;
  }, []);

  const refreshSystemHealth = useCallback(async () => {
    try {
      const snapshot = await adminGet('/api/v1/admin/site-admin/system-health');
      setSystemHealth(snapshot);
      setHealthError('');
    } catch (error) {
      setHealthError(error.message || 'Unable to load health data');
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSystemHealth();
    const interval = setInterval(() => {
      refreshSystemHealth();
    }, 60000);
    healthIntervalRef.current = interval;
    return () => {
      clearInterval(interval);
    };
  }, [refreshSystemHealth]);

  const filteredGenreCategories = useMemo(() => {
    const term = genreSearch.trim().toLowerCase();
    if (!term) return genreCategories;

    return genreCategories.filter(category => (
      category.label.toLowerCase().includes(term) ||
      category.id.toLowerCase().includes(term)
    ));
  }, [genreCategories, genreSearch]);

  const genreAddSuggestions = useMemo(() => {
    const term = newGenreName.trim().toLowerCase();
    if (!term) return [];

    return genreCategories
      .filter(category => {
        const label = category.label.toLowerCase();
        const id = category.id.toLowerCase();
        const match = label.includes(term) || id.includes(term);
        const exact = label === term || id === term;
        return match && !exact;
      })
      .slice(0, 6);
  }, [genreCategories, newGenreName]);

  const filteredHandleEntries = useMemo(() => {
    const term = handleSearch.trim().toLowerCase();
    if (handleView === 'profiles') {
      return (bioHandles.profiles || []).filter((profile) => {
        if (!term) return true;
        return (
          profile.handle?.toLowerCase().includes(term) ||
          (profile.curator_name || '').toLowerCase().includes(term)
        );
      });
    }

    return (bioHandles.reservations || []).filter((reservation) => {
      if (!term) return true;
      return (
        reservation.handle?.toLowerCase().includes(term) ||
        (reservation.reserved_for || '').toLowerCase().includes(term) ||
        (reservation.status || '').toLowerCase().includes(term)
      );
    });
  }, [bioHandles, handleSearch, handleView]);

  const adminStats = useMemo(() => {
    const profileCount = (bioHandles.profiles || []).length;
    const reservationCount = (bioHandles.reservations || []).length;
    const publishedProfiles = (bioHandles.profiles || []).filter(profile => profile.is_published).length;
    const issuedReferrals = referrals.length;
    const activeReferrals = referrals.filter(ref => (ref.status || '').toLowerCase() !== 'used').length;
    const curatorTypeCount = curatorTypes.length;
    const colorRuleCount = Object.keys(curatorTypeColors || {}).length;
    const tagCount = customFlags.length;
    const playlistCount = playlistsForFlags.length;

    const stats = [
      {
        key: 'handles',
        label: 'Bio Handles',
        value: profileCount + reservationCount,
        meta: `${publishedProfiles} published`
      },
      {
        key: 'referrals',
        label: 'Referrals Issued',
        value: issuedReferrals,
        meta: `${activeReferrals} active`
      },
      {
        key: 'curator-types',
        label: 'Curator Types',
        value: curatorTypeCount,
        meta: `${colorRuleCount} color rules`
      },
      {
        key: 'content-tags',
        label: 'Content Tags',
        value: tagCount,
        meta: `${playlistCount} playlists tracked`
      }
    ];
    const healthWindow = systemHealth?.metrics?.windows?.['5m'];
    if (healthWindow?.public?.requestCount) {
      stats.push({
        key: 'public-latency',
        label: 'Public Latency (5m)',
        value: formatLatency(healthWindow.public.avgLatencyMs),
        meta: `${healthWindow.public.requestCount} req · p95 ${formatLatency(healthWindow.public.p95LatencyMs)}`
      });
      stats.push({
        key: 'public-errors',
        label: 'Public Error Rate',
        value: formatPercent(healthWindow.public.errorRate || 0),
        meta: `${healthWindow.public.errorCount} errors`
      });
    }
    if (healthWindow?.curator?.requestCount) {
      stats.push({
        key: 'curator-latency',
        label: 'Curator Latency (5m)',
        value: formatLatency(healthWindow.curator.avgLatencyMs),
        meta: `${healthWindow.curator.requestCount} req · p95 ${formatLatency(healthWindow.curator.p95LatencyMs)}`
      });
      stats.push({
        key: 'curator-errors',
        label: 'Curator Error Rate',
        value: formatPercent(healthWindow.curator.errorRate || 0),
        meta: `${healthWindow.curator.errorCount} errors`
      });
    }
    return stats;
  }, [bioHandles, referrals, curatorTypes, curatorTypeColors, customFlags, playlistsForFlags, systemHealth]);

  const healthStatusSummary = useMemo(() => {
    if (!systemHealth) {
      return { status: 'warning', label: 'Collecting data' };
    }
    const activeAlerts = systemHealth.activeAlerts || [];
    const hasCritical = activeAlerts.some(alert => alert.severity === 'critical');
    const hasAlerts = activeAlerts.length > 0;
    if (hasCritical) {
      return { status: 'critical', label: 'Immediate attention required' };
    }
    if (hasAlerts) {
      return { status: 'warning', label: 'Degraded, monitor closely' };
    }
    return { status: 'good', label: 'All systems nominal' };
  }, [systemHealth]);

  const healthHighlights = useMemo(() => {
    if (!systemHealth) return [];
    const highlights = [];
    const windows = systemHealth.metrics?.windows || {};
    const win5 = windows['5m'] || {};
    if (win5.public?.requestCount) {
      highlights.push({
        key: 'public-p95',
        label: 'Public p95 latency',
        value: formatLatency(win5.public.p95LatencyMs),
        meta: `${win5.public.requestCount} req in 5m`
      });
    }
    if (win5.curator?.requestCount) {
      highlights.push({
        key: 'curator-p95',
        label: 'Curator p95 latency',
        value: formatLatency(win5.curator.p95LatencyMs),
        meta: `${win5.curator.requestCount} req in 5m`
      });
    }
    const contentQuality = systemHealth.signals?.contentQuality;
    if (contentQuality) {
      const dspCoverage = contentQuality.dspGapRatio !== null && contentQuality.dspGapRatio !== undefined
        ? `${Math.max(0, (1 - contentQuality.dspGapRatio) * 100).toFixed(1)}%`
        : '—';
      highlights.push({
        key: 'dsp-coverage',
        label: 'DSP coverage',
        value: dspCoverage,
        meta: `${contentQuality.tracksMissingDSP || 0} tracks missing links`
      });
      const previewCoverage = contentQuality.previewGapRatio !== null && contentQuality.previewGapRatio !== undefined
        ? `${Math.max(0, (1 - contentQuality.previewGapRatio) * 100).toFixed(1)}%`
        : '—';
      highlights.push({
        key: 'preview-coverage',
        label: 'Preview coverage',
        value: previewCoverage,
        meta: `${contentQuality.tracksMissingPreview || 0} tracks missing previews`
      });
    }
    const backlog = systemHealth.signals?.backlog;
    if (backlog) {
      highlights.push({
        key: 'imports-due',
        label: 'Overdue imports',
        value: backlog.overdueImports ?? 0,
        meta: `${backlog.staleImportLocks || 0} stale lock(s)`
      });
      highlights.push({
        key: 'failed-exports',
        label: 'Export queue issues',
        value: backlog.failedExports ?? 0,
        meta: `${backlog.stuckExports || 0} stuck`
      });
    }
    if (systemHealth.signals?.unresolvedFlags !== null && systemHealth.signals?.unresolvedFlags !== undefined) {
      highlights.push({
        key: 'unresolved-flags',
        label: 'Unresolved user flags',
        value: systemHealth.signals.unresolvedFlags,
        meta: 'Pending moderation'
      });
    }
    return highlights;
  }, [systemHealth, formatLatency]);

  // Load initial data
  useEffect(() => {
    // Load curator types and their current colors
    const loadData = async () => {
      try {
        const data = await adminGet('/api/v1/admin/site-admin/curator-types');
        setCuratorTypes(data.types || []);
        setCuratorTypeColors(data.colors || {});

        const genreData = await adminGet('/api/v1/admin/site-admin/genre-categories');
        setGenreCategories(genreData.categories || []);
        
        const orderData = await adminGet('/api/v1/admin/site-admin/latest-page-order');
        setLatestPageOrder(orderData.order || []);
        
        const flagsData = await adminGet('/api/v1/admin/site-admin/custom-flags');
        setCustomFlags(flagsData.flags || []);
        
        const playlistsData = await adminGet('/api/v1/admin/site-admin/playlists-for-flags');
        setPlaylistsForFlags(playlistsData.playlists || []);

        const editorialData = await adminGet('/api/v1/admin/site-admin/search-editorials');
        const activeEditorials = (editorialData.items || []).filter(item => item.active !== 0);
        setSearchEditorials(activeEditorials.slice(0, MAX_EDITORIALS));
        setEditingEditorialIndex(-1);
        setEditorialUploadBusyIndex(null);

        const handlesData = await adminGet('/api/v1/admin/site-admin/bio-handles');
        setBioHandles({
          profiles: handlesData.profiles || [],
          reservations: handlesData.reservations || []
        });

        // Load recent referrals
        try {
          const refData = await adminGet('/api/v1/admin/referrals?limit=20');
          setReferrals(refData.data || []);
        } catch (_) {}
      } catch (error) {
        showStatus('error', `Failed to load initial data: ${error.message}`);
      }
    };
    
    loadData();
  }, []);

  useEffect(() => {
    if (searchHighlightsCollapsed) {
      setEditingEditorialIndex(-1);
    }
  }, [searchHighlightsCollapsed]);

  useEffect(() => {
    setEditingEditorialIndex(prev => {
      if (searchEditorials.length === 0) {
        return -1;
      }
      if (prev >= searchEditorials.length) {
        return searchEditorials.length - 1;
      }
      return prev;
    });
  }, [searchEditorials.length]);

  const showStatus = (type, message) => {
    setStatus({ type, message });
    setTimeout(() => setStatus({ type: '', message: '' }), 5000);
  };

  const handleRunHealthDiagnostic = async () => {
    setHealthActionBusy(true);
    try {
      const response = await adminPost('/api/v1/admin/site-admin/system-health/run-diagnostic', {});
      if (response?.snapshot) {
        setSystemHealth(response.snapshot);
      }
      showStatus('success', 'Diagnostics completed');
    } catch (error) {
      showStatus('error', `Diagnostics failed: ${error.message}`);
    } finally {
      setHealthActionBusy(false);
    }
  };

  const handleAutomationTrigger = async (actionKey) => {
    if (!actionKey) return;
    setHealthActionBusy(true);
    try {
      const response = await adminPost('/api/v1/admin/site-admin/system-health/automation', { actionKey });
      if (response?.snapshot) {
        setSystemHealth(response.snapshot);
      }
      const detailMessage = response?.result?.detail || 'Automation executed';
      showStatus('success', detailMessage);
    } catch (error) {
      showStatus('error', `Automation failed: ${error.message}`);
    } finally {
      setHealthActionBusy(false);
    }
  };

  const triggerTestEmail = async (purpose) => {
    const label = TEST_EMAIL_PURPOSE_LABELS[purpose] || 'Test email';
    const trimmedOverride = testEmailOverride.trim();

    setTestEmailBusy(purpose);
    setTestEmailStatus({ type: '', message: '', detail: '' });

    try {
      const payload = { purpose };
      if (trimmedOverride) {
        payload.emailOverride = trimmedOverride;
      }

      const response = await adminPost('/api/v1/admin/site-admin/test-email', payload);
      const recipient = response.recipient || trimmedOverride || 'your admin email';
      const detailParts = [];

      if (response.mockMode) {
        detailParts.push('mock mode active - no email sent externally');
      }

      if (purpose === 'password_reset') {
        detailParts.push('reset link is a preview only');
      }

      if (response.details?.confirmationCode) {
        detailParts.push(`code ${response.details.confirmationCode}`);
      }

      if (response.details?.referralCode) {
        detailParts.push(`referral ${response.details.referralCode}`);
      }

      if (response.details?.expiresMinutes) {
        detailParts.push(`expires in ${response.details.expiresMinutes}m`);
      }

      setTestEmailStatus({
        type: 'success',
        message: `${label} test queued for ${recipient}`,
        detail: detailParts.join(' | ')
      });
    } catch (error) {
      const fallbackMessage = 'Failed to send test email';
      const detailMessage = error?.details?.error || error?.details?.message || '';
      setTestEmailStatus({
        type: 'error',
        message: error?.message || fallbackMessage,
        detail: detailMessage
      });
    } finally {
      setTestEmailBusy('');
    }
  };

  const triggerTestSlackNotification = async (notificationType) => {
    const label = SLACK_NOTIFICATION_LABELS[notificationType] || 'Test notification';

    setTestSlackBusy(notificationType);
    setTestSlackStatus({ type: '', message: '', detail: '' });

    try {
      const response = await adminPost('/api/v1/admin/site-admin/test-slack-notification', {
        notificationType
      });

      const detailParts = [];
      if (response.result) {
        if (response.result.channel) {
          detailParts.push(`channel: ${response.result.channel}`);
        }
        if (response.result.ts) {
          detailParts.push(`timestamp: ${response.result.ts}`);
        }
      }

      setTestSlackStatus({
        type: 'success',
        message: `${label} notification sent successfully`,
        detail: detailParts.length > 0 ? detailParts.join(' | ') : 'Check Slack channel for message'
      });
    } catch (error) {
      const fallbackMessage = 'Failed to send test Slack notification';
      const detailMessage = error?.details?.error || error?.details?.message || error?.message || '';
      setTestSlackStatus({
        type: 'error',
        message: error?.message || fallbackMessage,
        detail: detailMessage
      });
    } finally {
      setTestSlackBusy('');
    }
  };

  const triggerDryRunLinker = async () => {
    const artist = dryRunForm.artist.trim();
    const title = dryRunForm.title.trim();
    const album = dryRunForm.album.trim();
    const isrc = dryRunForm.isrc.trim();
    const durationValue = Number.parseInt(dryRunForm.durationMs, 10);

    if (!isrc && !(artist && title)) {
      setDryRunStatus({
        type: 'error',
        message: 'Provide artist + title or ISRC',
        detail: ''
      });
      return;
    }

    const payload = {
      artist,
      title,
      album: album || undefined,
      isrc: isrc || undefined
    };

    if (Number.isFinite(durationValue) && durationValue > 0) {
      payload.duration_ms = durationValue;
    }

    setDryRunBusy(true);
    setDryRunStatus({ type: '', message: '', detail: '' });
    setDryRunResult(null);

    try {
      const response = await adminPost('/api/v1/admin/site-admin/cross-link-dry-run', payload);
      const result = response?.result || null;
      const resultsMap = result?.results || {};
      const matchedCount = Object.keys(DRY_RUN_PLATFORM_LABELS)
        .filter((key) => Boolean(resultsMap[key]))
        .length;

      const detailParts = [];
      if (result?.durationMs) {
        detailParts.push(`duration ${Math.round(result.durationMs)}ms`);
      }
      if (result?.errors?.length) {
        detailParts.push(result.errors.join(' | '));
      }

      setDryRunResult(result);
      setDryRunStatus({
        type: 'success',
        message: `Dry run complete (${matchedCount}/${Object.keys(DRY_RUN_PLATFORM_LABELS).length} matched)`,
        detail: detailParts.join(' | ')
      });
    } catch (error) {
      const fallbackMessage = 'Failed to run dry run';
      const detailMessage = error?.details?.error || error?.details?.message || error?.message || '';
      setDryRunStatus({
        type: 'error',
        message: error?.message || fallbackMessage,
        detail: detailMessage
      });
    } finally {
      setDryRunBusy(false);
    }
  };

  const refreshGenreCategories = async () => {
    try {
      const genreData = await adminGet('/api/v1/admin/site-admin/genre-categories');
      setGenreCategories(genreData.categories || []);
    } catch (error) {
      showStatus('error', `Failed to load genre categories: ${error.message}`);
    }
  };

const refreshBioHandles = async () => {
  try {
    const handlesData = await adminGet('/api/v1/admin/site-admin/bio-handles');
    setBioHandles({
      profiles: handlesData.profiles || [],
      reservations: handlesData.reservations || []
    });
  } catch (error) {
    showStatus('error', `Failed to load handle directory: ${error.message}`);
  }
};

  const loadSearchEditorials = async () => {
    try {
      setSearchEditorialsLoading(true);
      const editorialData = await adminGet('/api/v1/admin/site-admin/search-editorials');
      const activeEditorials = (editorialData.items || []).filter(item => item.active !== 0);
      setSearchEditorials(activeEditorials.slice(0, MAX_EDITORIALS));
      setEditingEditorialIndex(-1);
      setEditorialUploadBusyIndex(null);
      setEditingEditorialIndex(-1);
    } catch (error) {
      showStatus('error', `Failed to load search highlights: ${error.message}`);
    } finally {
      setSearchEditorialsLoading(false);
    }
  };

  const handleEditorialChange = (index, field, value) => {
    setSearchEditorials(prev => prev.map((item, idx) => (
      idx === index ? { ...item, [field]: value } : item
    )));
  };

  const handleEditorialAdd = () => {
    setSearchHighlightsCollapsed(false);
    setSearchEditorials(prev => {
      if (prev.length >= MAX_EDITORIALS) {
        showStatus('error', `Maximum of ${MAX_EDITORIALS} highlights`);
        return prev;
      }
      const next = [
        ...prev,
        { id: null, title: '', description: '', image_url: '', preset_query: '', target_url: '' }
      ];
      setEditingEditorialIndex(next.length - 1);
      return next;
    });
  };

  const handleEditorialRemove = (index) => {
    setSearchEditorials(prev => {
      const next = prev.filter((_, idx) => idx !== index);
      setEditingEditorialIndex(prevIndex => {
        if (prevIndex === index) return -1;
        if (prevIndex > index) return prevIndex - 1;
        return prevIndex;
      });
      return next;
    });
    showStatus('success', 'Highlight removed');
  };

  const handleEditorialMove = (index, direction) => {
    setSearchEditorials(prev => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const temp = next[index];
      next[index] = next[target];
      next[target] = temp;
      setEditingEditorialIndex(prevIndex => {
        if (prevIndex === index) return target;
        if (prevIndex === target) return index;
        return prevIndex;
      });
      return next;
    });
  };

  const handleEditorialUploadTrigger = () => {
    if (editingEditorialIndex < 0) return;
    if (editorialFileInputRef.current) {
      editorialFileInputRef.current.click();
    }
  };

  const handleEditorialImageUpload = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file || editingEditorialIndex < 0) return;

    const index = editingEditorialIndex;
    setEditorialUploadBusyIndex(index);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const response = await adminUpload('/api/v1/uploads/image?type=search-editorials', formData);
      const uploadedUrl = response?.data?.primary_url;
      if (uploadedUrl) {
        handleEditorialChange(index, 'image_url', uploadedUrl);
        showStatus('success', 'Image uploaded');
      } else {
        showStatus('error', 'Upload succeeded but no URL returned');
      }
    } catch (error) {
      showStatus('error', `Image upload failed: ${error.message || 'Unknown error'}`);
    } finally {
      setEditorialUploadBusyIndex(null);
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const handleEditorialSave = async () => {
    try {
      setSearchEditorialsSaving(true);
      const payload = searchEditorials
        .map(item => ({
          ...item,
          title: (item.title || '').trim(),
          description: (item.description || '').trim(),
          image_url: (item.image_url || '').trim(),
          preset_query: (item.preset_query || '').trim(),
          target_url: (item.target_url || '').trim()
        }))
        .filter(item => item.title.length > 0)
        .slice(0, MAX_EDITORIALS)
        .map(({ id, title, description, image_url, preset_query, target_url }) => ({
          id: id ?? undefined,
          title,
          description: description || null,
          image_url: image_url || null,
          preset_query: preset_query || null,
          target_url: target_url || null
        }));

      const response = await adminPost('/api/v1/admin/site-admin/search-editorials', { items: payload });
      const activeEditorials = (response.items || []).filter(item => item.active !== 0);
      setSearchEditorials(activeEditorials.slice(0, MAX_EDITORIALS));
      setEditorialUploadBusyIndex(null);
      setEditingEditorialIndex(prev => {
        if (!activeEditorials.length) return -1;
        const bounded = Math.min(prev, activeEditorials.length - 1);
        return bounded;
      });
      showStatus('success', 'Search highlights updated');
    } catch (error) {
      showStatus('error', `Failed to save highlights: ${error.message}`);
    } finally {
      setSearchEditorialsSaving(false);
    }
  };

  const handleIssueReferral = async () => {
    if (!referralForm.email?.trim()) {
      showStatus('error', 'Email is required');
      return;
    }
    try {
      const payload = { email: referralForm.email.trim() };
      if (referralForm.curator_name?.trim()) payload.curator_name = referralForm.curator_name.trim();
      const result = await adminPost('/api/v1/admin/referrals/issue', payload);
      showStatus('success', `Referral issued: ${result.data.code}`);
      setReferralForm({ email: '', curator_name: '' });
      const refData = await adminGet('/api/v1/admin/referrals?limit=20');
      setReferrals(refData.data || []);
    } catch (error) {
      showStatus('error', `Failed to issue referral: ${error.message}`);
    }
  };

  const handleCuratorTypeColorChange = async (typeId, color) => {
    try {
      await adminPost('/api/v1/admin/site-admin/curator-type-color', { typeId, color });
      setCuratorTypeColors(prev => ({ ...prev, [typeId]: color }));
      showStatus('success', 'Color updated');
    } catch (error) {
      showStatus('error', `Failed to update color: ${error.message}`);
    }
  };

  const handleAddGenreCategory = async (event) => {
    event?.preventDefault();
    const draft = newGenreName.trim();

    if (!draft) {
      showStatus('error', 'Genre name is required');
      return;
    }

    const exists = genreCategories.some(category => category.label.toLowerCase() === draft.toLowerCase());
    if (exists) {
      showStatus('error', 'Genre already exists');
      return;
    }

    try {
      await adminPost('/api/v1/admin/site-admin/genre-categories', { label: draft });
      setNewGenreName('');
      await refreshGenreCategories();
      showStatus('success', 'Genre category added');
    } catch (error) {
      showStatus('error', `Failed to add genre category: ${error.message}`);
    }
  };

  const handleGenreColorUpdate = async (id, color) => {
    try {
      await adminPut(`/api/v1/admin/site-admin/genre-categories/${id}`, { color });
      setGenreCategories(prev => prev.map(category => (
        category.id === id ? { ...category, color } : category
      )));
      showStatus('success', 'Genre color updated');
    } catch (error) {
      showStatus('error', `Failed to update genre color: ${error.message}`);
    }
  };

  const handleEditGenre = (id, label) => {
    setEditingGenre(id);
    setEditingGenreDraft(label);
  };

  const handleSaveGenre = async (id) => {
    const nextLabel = editingGenreDraft.trim();
    if (!nextLabel) {
      showStatus('error', 'Genre label cannot be empty');
      return;
    }

    try {
      await adminPut(`/api/v1/admin/site-admin/genre-categories/${id}`, { label: nextLabel });
      setEditingGenre(null);
      setEditingGenreDraft('');
      await refreshGenreCategories();
      showStatus('success', 'Genre updated');
    } catch (error) {
      showStatus('error', `Failed to update genre: ${error.message}`);
    }
  };

  const handleDeleteGenre = async (id, label) => {
    if (!confirm(`Delete genre category "${label}"?`)) {
      return;
    }

    try {
      await adminDelete(`/api/v1/admin/site-admin/genre-categories/${id}`);
      await refreshGenreCategories();
      showStatus('success', 'Genre removed');
    } catch (error) {
      showStatus('error', `Failed to delete genre: ${error.message}`);
    }
  };

  const handleBulkAddGenres = async () => {
    const text = bulkGenreInput.trim();
    if (!text) {
      showStatus('error', 'Paste at least one genre');
      return;
    }

    try {
      const result = await adminPost('/api/v1/admin/site-admin/genre-categories/bulk', { text });
      setBulkGenreInput('');
      await refreshGenreCategories();

      const added = result.added?.length || 0;
      const skipped = result.skipped?.length || 0;
      const messageParts = [];
      if (added) messageParts.push(`added ${added}`);
      if (skipped) messageParts.push(`skipped ${skipped}`);
      showStatus('success', `Bulk import complete: ${messageParts.join(', ') || 'no changes'}`);
    } catch (error) {
      showStatus('error', `Bulk add failed: ${error.message}`);
    }
  };

  const handleLatestPageReorder = async (fromIndex, toIndex) => {
    const newOrder = [...latestPageOrder];
    const [moved] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, moved);
    
    try {
      await adminPost('/api/v1/admin/site-admin/latest-page-order', { order: newOrder });
      setLatestPageOrder(newOrder);
      showStatus('success', 'Order updated');
    } catch (error) {
      showStatus('error', `Failed to update order: ${error.message}`);
    }
  };

  const handleAddCustomFlag = async () => {
    if (!newFlag.text.trim()) {
      showStatus('error', 'Tag text is required');
      return;
    }

    try {
      const payload = {
        text: newFlag.text,
        color: newFlag.color,
        textColor: newFlag.textColor,
        description: newFlag.description?.trim() || null,
        allow_self_assign: newFlag.allowSelfAssign
      };
      const result = await adminPost('/api/v1/admin/site-admin/custom-flags', payload);
      setCustomFlags(prev => [...prev, result]);
      setNewFlag({ text: '', color: '#ffffff', textColor: '#ffffff', description: '', allowSelfAssign: false });
      showStatus('success', 'Content tag created');
    } catch (error) {
      showStatus('error', `Failed to create content tag: ${error.message}`);
    }
  };

  const handleRemoveCustomFlag = async (flagId) => {
    try {
      await adminDelete(`/api/v1/admin/site-admin/custom-flags/${flagId}`);
      setCustomFlags(prev => prev.filter(flag => flag.id !== flagId));
      showStatus('success', 'Playlist tag removed');
    } catch (error) {
      showStatus('error', `Failed to remove playlist tag: ${error.message}`);
    }
  };

  const startEditTag = (flag) => {
    setEditingTagId(flag.id);
    setEditingTag({
      text: flag.text,
      color: flag.color || '#ffffff',
      textColor: flag.text_color || '#ffffff',
      description: flag.description || '',
      allowSelfAssign: flag.allow_self_assign === 1
    });
  };

  const cancelEditTag = () => {
    setEditingTagId(null);
    setEditingTag({ text: '', color: '#ffffff', textColor: '#ffffff', description: '', allowSelfAssign: false });
  };

  const handleUpdateCustomFlag = async () => {
    if (!editingTag.text.trim()) {
      showStatus('error', 'Tag text is required');
      return;
    }
    try {
      await adminPut(`/api/v1/admin/site-admin/custom-flags/${editingTagId}`, {
        text: editingTag.text,
        color: editingTag.color,
        textColor: editingTag.textColor,
        description: editingTag.description?.trim() || null,
        allow_self_assign: editingTag.allowSelfAssign
      });
      // reload tags
      const flagsData = await adminGet('/api/v1/admin/site-admin/custom-flags');
      setCustomFlags(flagsData.flags || []);
      cancelEditTag();
      showStatus('success', 'Content tag updated');
    } catch (error) {
      showStatus('error', `Failed to update content tag: ${error.message}`);
    }
  };

  const handleResetToDefaultOrder = async () => {
    try {
      await adminPost('/api/v1/admin/site-admin/latest-page-order/reset');
      // Reload the order data to show default ordering
      const orderData = await adminGet('/api/v1/admin/site-admin/latest-page-order');
      setLatestPageOrder(orderData.order || []);
      showStatus('success', 'Order reset to default (by publish date)');
    } catch (error) {
      showStatus('error', `Failed to reset order: ${error.message}`);
    }
  };

  const handleAddCuratorType = async () => {
    if (!newCuratorType.id.trim() || !newCuratorType.label.trim()) {
      showStatus('error', 'Both ID and label are required');
      return;
    }

    try {
      const result = await adminPost('/api/v1/admin/site-admin/curator-types', newCuratorType);
      // Reload curator types
      const data = await adminGet('/api/v1/admin/site-admin/curator-types');
      setCuratorTypes(data.types || []);
      setCuratorTypeColors(data.colors || {});
      setNewCuratorType({ id: '', label: '', color: '#ffffff' });
      showStatus('success', 'Curator type added');
    } catch (error) {
      showStatus('error', `Failed to add curator type: ${error.message}`);
    }
  };

  const handleEditCuratorType = async (typeId, updates) => {
    const nextLabel = updates?.label?.trim();
    if (!nextLabel) {
      showStatus('error', 'Label is required');
      return;
    }

    try {
      await adminPut(`/api/v1/admin/site-admin/curator-types/${typeId}`, { ...updates, label: nextLabel });
      // Reload curator types
      const data = await adminGet('/api/v1/admin/site-admin/curator-types');
      setCuratorTypes(data.types || []);
      setCuratorTypeColors(data.colors || {});
      setEditingType(null);
      setEditingTypeDraft('');
      showStatus('success', 'Curator type updated');
    } catch (error) {
      showStatus('error', `Failed to update curator type: ${error.message}`);
    }
  };

  const handleDeleteCuratorType = async (typeId) => {
    if (!confirm(`Are you sure you want to delete the curator type "${typeId}"?`)) {
      return;
    }

    try {
      if (editingType === typeId) {
        setEditingType(null);
        setEditingTypeDraft('');
      }
      await adminDelete(`/api/v1/admin/site-admin/curator-types/${typeId}`);
      // Reload curator types
      const data = await adminGet('/api/v1/admin/site-admin/curator-types');
      setCuratorTypes(data.types || []);
      setCuratorTypeColors(data.colors || {});
      showStatus('success', 'Curator type deleted');
    } catch (error) {
      showStatus('error', `Failed to delete curator type: ${error.message}`);
    }
  };

  const handleSelectPlaylist = async (playlistId) => {
    try {
      const flagsData = await adminGet(`/api/v1/admin/site-admin/playlist-flags/${playlistId}`);
      setPlaylistFlags(flagsData.assignments || []);
      setSelectedPlaylist(playlistId);
    } catch (error) {
      showStatus('error', `Failed to load playlist flags: ${error.message}`);
    }
  };

  const handleAssignFlag = async (playlistId, flagId) => {
    try {
      await adminPost('/api/v1/admin/site-admin/playlist-flags', { playlistId, flagId });
      // Reload playlist flags
      const flagsData = await adminGet(`/api/v1/admin/site-admin/playlist-flags/${playlistId}`);
      setPlaylistFlags(flagsData.assignments || []);
      showStatus('success', 'Tag assigned to playlist');
    } catch (error) {
      showStatus('error', `Failed to assign tag: ${error.message}`);
    }
  };

  const handleRemoveFlag = async (playlistId, flagId) => {
    try {
      await adminDelete(`/api/v1/admin/site-admin/playlist-flags/${playlistId}/${flagId}`);
      // Reload playlist flags
      const flagsData = await adminGet(`/api/v1/admin/site-admin/playlist-flags/${playlistId}`);
      setPlaylistFlags(flagsData.assignments || []);
      showStatus('success', 'Tag removed from playlist');
    } catch (error) {
      showStatus('error', `Failed to remove tag: ${error.message}`);
    }
  };

  const handleBulkAssignTag = async () => {
    if (selectedPlaylists.length === 0 || !bulkSelectedTag) {
      showStatus('error', 'Select playlists and a tag');
      return;
    }

    if (selectedPlaylists.length > 100) {
      showStatus('error', 'Maximum 100 playlists per bulk operation');
      return;
    }

    try {
      const result = await adminPost('/api/v1/admin/site-admin/playlist-flags/bulk', {
        playlist_ids: selectedPlaylists,
        flag_id: bulkSelectedTag
      });

      showStatus('success', result.message);
      setSelectedPlaylists([]);
      setBulkSelectedTag('');

      // Reload playlists to show updated flag counts
      const playlistsData = await adminGet('/api/v1/admin/site-admin/playlists-for-flags');
      setPlaylistsForFlags(playlistsData.playlists || []);
    } catch (error) {
      showStatus('error', `Bulk assignment failed: ${error.message}`);
    }
  };

  const openBioEditor = (handle) => {
    if (!handle) return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'bio');
    url.searchParams.set('handle', handle);
    window.history.pushState({}, '', url.toString());
    window.dispatchEvent(new CustomEvent('adminTabChange', {
      detail: { tab: 'bio', handle }
    }));
  };

  const editingCard = editingEditorialIndex >= 0 ? searchEditorials[editingEditorialIndex] : null;

  const renderUtilityPanel = () => {
    if (activeUtilityTab === 'dsp') {
      return <AdminDSPConnections />;
    }

    if (activeUtilityTab === 'qr-ctas') {
      return <QRCodeCTAManager />;
    }

    if (activeUtilityTab === 'exports') {
      return (
        <>
          <UtilityPanelTitle>Export Requests</UtilityPanelTitle>
          <RequestsQueue />
        </>
      );
    }
    
    if (activeUtilityTab === 'qr-ctas') {
        return (
            <>
                <UtilityPanelTitle>QR Code CTAs</UtilityPanelTitle>
                <QRCodeCTAManager />
            </>
        );
    }

    if (activeUtilityTab === 'test-slack') {
      return (
        <>
          <UtilityPanelTitle>Test Slack Notifications</UtilityPanelTitle>
          <HelperText as="p">
            Test individual Slack notification types to verify bot configuration and message formatting.
          </HelperText>
          {testSlackStatus.message ? (
            <>
              <StatusMessage $type={testSlackStatus.type} role="status">
                {testSlackStatus.message}
              </StatusMessage>
              {testSlackStatus.detail ? (
                <HelperText as="p">{testSlackStatus.detail}</HelperText>
              ) : null}
            </>
          ) : null}
          <TestSlackActions>
            <Button
              size="small"
              variant="secondary"
              onClick={() => triggerTestSlackNotification('spotify_access_request')}
              disabled={Boolean(testSlackBusy)}
            >
              {testSlackBusy === 'spotify_access_request' ? 'Sending...' : 'Spotify Access Request'}
            </Button>
            <Button
              size="small"
              variant="secondary"
              onClick={() => triggerTestSlackNotification('apple_export_success')}
              disabled={Boolean(testSlackBusy)}
            >
              {testSlackBusy === 'apple_export_success' ? 'Sending...' : 'Apple Export Success'}
            </Button>
            <Button
              size="small"
              variant="secondary"
              onClick={() => triggerTestSlackNotification('apple_resolution_failed')}
              disabled={Boolean(testSlackBusy)}
            >
              {testSlackBusy === 'apple_resolution_failed' ? 'Sending...' : 'Apple Resolution Failed'}
            </Button>
            <Button
              size="small"
              variant="secondary"
              onClick={() => triggerTestSlackNotification('system_alert')}
              disabled={Boolean(testSlackBusy)}
            >
              {testSlackBusy === 'system_alert' ? 'Sending...' : 'System Alert'}
            </Button>
          </TestSlackActions>
        </>
      );
    }

    if (activeUtilityTab === 'cross-link-dry-run') {
      const results = dryRunResult?.results || {};
      return (
        <>
          <UtilityPanelTitle>Cross-Link Dry Run</UtilityPanelTitle>
          <HelperText as="p">
            Simulate cross-platform matching without writing to track records.
          </HelperText>

          <DryRunFormGrid>
            <div>
              <LabelText>Artist</LabelText>
              <Input
                value={dryRunForm.artist}
                onChange={(event) => setDryRunForm(prev => ({ ...prev, artist: event.target.value }))}
                placeholder="Artist name"
              />
            </div>
            <div>
              <LabelText>Title</LabelText>
              <Input
                value={dryRunForm.title}
                onChange={(event) => setDryRunForm(prev => ({ ...prev, title: event.target.value }))}
                placeholder="Track title"
              />
            </div>
            <div>
              <LabelText>Album (optional)</LabelText>
              <Input
                value={dryRunForm.album}
                onChange={(event) => setDryRunForm(prev => ({ ...prev, album: event.target.value }))}
                placeholder="Album name"
              />
            </div>
            <div>
              <LabelText>ISRC (optional)</LabelText>
              <Input
                value={dryRunForm.isrc}
                onChange={(event) => setDryRunForm(prev => ({ ...prev, isrc: event.target.value }))}
                placeholder="USUM71703861"
              />
            </div>
            <div>
              <LabelText>Duration (ms)</LabelText>
              <Input
                value={dryRunForm.durationMs}
                onChange={(event) => setDryRunForm(prev => ({ ...prev, durationMs: event.target.value }))}
                placeholder="210000"
              />
            </div>
          </DryRunFormGrid>

          {dryRunStatus.message ? (
            <>
              <StatusMessage $type={dryRunStatus.type} role="status">
                {dryRunStatus.message}
              </StatusMessage>
              {dryRunStatus.detail ? (
                <HelperText as="p">{dryRunStatus.detail}</HelperText>
              ) : null}
            </>
          ) : null}

          <DryRunActions>
            <Button
              size="small"
              variant="secondary"
              onClick={triggerDryRunLinker}
              disabled={dryRunBusy}
            >
              {dryRunBusy ? 'Running...' : 'Run Dry Run'}
            </Button>
            <Button
              size="small"
              variant="secondary"
              onClick={() => {
                setDryRunForm({ artist: '', title: '', album: '', isrc: '', durationMs: '' });
                setDryRunStatus({ type: '', message: '', detail: '' });
                setDryRunResult(null);
              }}
              disabled={dryRunBusy}
            >
              Clear
            </Button>
          </DryRunActions>

          {dryRunResult ? (
            <DryRunResultsGrid>
              {Object.entries(DRY_RUN_PLATFORM_LABELS).map(([key, label]) => {
                const result = results[key];
                const hasMatch = Boolean(result);
                const resultId = result?.id || result?.videoId || 'N/A';
                const resultUrl = result?.url || '';
                const resultConfidence = result?.confidence ?? 'N/A';
                const resultSource = result?.matchSource || result?.source || 'N/A';
                const resultStrategy = result?.matchStrategy || 'N/A';

                return (
                  <DryRunResultCard key={key}>
                    <DryRunResultTitle>{label}</DryRunResultTitle>
                    <DryRunResultRow>
                      <DryRunResultLabel>Status</DryRunResultLabel>
                      <DryRunResultValue>{hasMatch ? 'Match' : 'No match'}</DryRunResultValue>
                    </DryRunResultRow>
                    <DryRunResultRow>
                      <DryRunResultLabel>ID</DryRunResultLabel>
                      <DryRunResultValue>{resultId}</DryRunResultValue>
                    </DryRunResultRow>
                    <DryRunResultRow>
                      <DryRunResultLabel>Confidence</DryRunResultLabel>
                      <DryRunResultValue>{resultConfidence}</DryRunResultValue>
                    </DryRunResultRow>
                    <DryRunResultRow>
                      <DryRunResultLabel>Source</DryRunResultLabel>
                      <DryRunResultValue>{resultSource}</DryRunResultValue>
                    </DryRunResultRow>
                    <DryRunResultRow>
                      <DryRunResultLabel>Strategy</DryRunResultLabel>
                      <DryRunResultValue>{resultStrategy}</DryRunResultValue>
                    </DryRunResultRow>
                    <DryRunResultRow>
                      <DryRunResultLabel>URL</DryRunResultLabel>
                      <DryRunResultValue>
                        {resultUrl ? (
                          <DryRunResultLink href={resultUrl} target="_blank" rel="noreferrer">
                            Open
                          </DryRunResultLink>
                        ) : (
                          'N/A'
                        )}
                      </DryRunResultValue>
                    </DryRunResultRow>
                  </DryRunResultCard>
                );
              })}
            </DryRunResultsGrid>
          ) : null}
        </>
      );
    }

    return (
      <>
        <UtilityPanelTitle>Test Emails</UtilityPanelTitle>
        <HelperText as="p">
          Dispatch sample transactional copy without touching live accounts.
        </HelperText>
        <LabelText htmlFor="test-email-override">Override Recipient (optional)</LabelText>
        <Input
          id="test-email-override"
          type="email"
          value={testEmailOverride}
          onChange={(event) => setTestEmailOverride(event.target.value)}
          placeholder="you@example.com"
          autoComplete="off"
        />
        <HelperText as="p">Defaults to your admin login email when left blank.</HelperText>
        {testEmailStatus.message ? (
          <>
            <StatusMessage $type={testEmailStatus.type} role="status">
              {testEmailStatus.message}
            </StatusMessage>
            {testEmailStatus.detail ? (
              <HelperText as="p">{testEmailStatus.detail}</HelperText>
            ) : null}
          </>
        ) : null}
        <TestEmailActions>
          <Button
            size="small"
            variant="secondary"
            onClick={() => triggerTestEmail('signup')}
            disabled={Boolean(testEmailBusy)}
          >
            {testEmailBusy === 'signup' ? 'Sending...' : 'Signup'}
          </Button>
          <Button
            size="small"
            variant="secondary"
            onClick={() => triggerTestEmail('password_reset')}
            disabled={Boolean(testEmailBusy)}
          >
            {testEmailBusy === 'password_reset' ? 'Sending...' : 'Password Reset'}
          </Button>
          <Button
            size="small"
            variant="secondary"
            onClick={() => triggerTestEmail('referral')}
            disabled={Boolean(testEmailBusy)}
          >
            {testEmailBusy === 'referral' ? 'Sending...' : 'Referral'}
          </Button>
        </TestEmailActions>
      </>
    );
  };

  return (
    <SiteAdminContainer>
      <SiteAdminHeader>

      </SiteAdminHeader>

      <StatGrid>
        {adminStats.map(stat => (
          <StatTile key={stat.key}>
            <StatLabel>{stat.label}</StatLabel>
            <StatValue>{stat.value}</StatValue>
            {stat.meta ? <StatMeta>{stat.meta}</StatMeta> : null}
          </StatTile>
        ))}
      </StatGrid>

      <SectionCard>
        <SectionHeaderRow>
          <SectionHeader>System Health & Alerts</SectionHeader>
          <SectionHeaderActions>
            <Button
              size="tiny"
              variant="secondary"
              disabled={healthLoading}
              onClick={refreshSystemHealth}
            >
              Refresh
            </Button>
            <Button
              size="tiny"
              onClick={handleRunHealthDiagnostic}
              disabled={healthActionBusy || healthLoading}
            >
              Run Diagnostics
            </Button>
          </SectionHeaderActions>
        </SectionHeaderRow>

        {healthLoading ? (
          <HandlesEmpty>Loading system health…</HandlesEmpty>
        ) : systemHealth ? (
          <>
            {healthError ? (
              <StatusMessage $type="error">{healthError}</StatusMessage>
            ) : null}

            <HealthSummaryRow>
              <HealthStatusBadge $status={healthStatusSummary.status}>
                {healthStatusSummary.label}
              </HealthStatusBadge>
              <HealthMeta>
                Updated {formatDateTime(systemHealth.generatedAt)}
              </HealthMeta>
            </HealthSummaryRow>

            {healthHighlights.length ? (
              <HealthMetricsGrid>
                {healthHighlights.map(highlight => (
                  <HealthMetricCard key={highlight.key}>
                    <HealthMetricLabel>{highlight.label}</HealthMetricLabel>
                    <HealthMetricValue>{highlight.value}</HealthMetricValue>
                    {highlight.meta ? (
                      <HealthMetricMeta>{highlight.meta}</HealthMetricMeta>
                    ) : null}
                  </HealthMetricCard>
                ))}
              </HealthMetricsGrid>
            ) : null}

            <SectionDivider />
            <SectionHeaderRow>
              <SectionHeader>Active Alerts</SectionHeader>
            </SectionHeaderRow>
            <AlertList>
              {(systemHealth.activeAlerts || []).length === 0 ? (
                <HandlesEmpty>All clear – no alerts.</HandlesEmpty>
              ) : (
                (systemHealth.activeAlerts || []).map(alert => (
                  <AlertCard key={alert.id} $severity={alert.severity}>
                    <AlertTitle>
                      <span>{alert.title}</span>
                      <AlertTimestamp>
                        Since {formatDateTime(alert.startedAt)}
                      </AlertTimestamp>
                    </AlertTitle>
                    <div>{alert.message}</div>
                    {alert.instructions?.length ? (
                      <AlertInstructions>
                        {alert.instructions.map((step, index) => (
                          <li key={index}>{step}</li>
                        ))}
                      </AlertInstructions>
                    ) : null}
                  </AlertCard>
                ))
              )}
            </AlertList>

            <SectionDivider />
            <SectionHeaderRow>
              <SectionHeader>First-aid Automation</SectionHeader>
            </SectionHeaderRow>
            <AutomationActions>
              {(systemHealth.automation?.availableActions || []).map(action => (
                <Button
                  key={action.key}
                  size="tiny"
                  variant="secondary"
                  onClick={() => handleAutomationTrigger(action.key)}
                  disabled={healthActionBusy}
                >
                  {action.label}
                </Button>
              ))}
              {healthActionBusy ? <HealthMeta>Working…</HealthMeta> : null}
            </AutomationActions>
            {(systemHealth.automation?.recent || []).length ? (
              <AutomationLog>
                {(systemHealth.automation?.recent || []).map(entry => (
                  <div key={`${entry.actionKey}-${entry.timestamp}`}>
                    <StatusTag $status={entry.status}>
                      {entry.status}
                    </StatusTag>{' '}
                    {entry.actionKey} • {entry.detail} •{' '}
                    {formatDateTime(entry.timestamp)}
                  </div>
                ))}
              </AutomationLog>
            ) : (
              <HealthMeta>No automation runs yet.</HealthMeta>
            )}

            <SectionDivider />
            <SectionHeaderRow>
              <SectionHeader>Diagnostics</SectionHeader>
            </SectionHeaderRow>
            {(systemHealth.diagnostics || []).length ? (
              (systemHealth.diagnostics || []).map(entry => (
                <div key={entry.timestamp} style={{ marginBottom: theme.spacing.sm }}>
                  <HealthMeta>
                    Ran {formatDateTime(entry.timestamp)} via {entry.trigger}
                  </HealthMeta>
                  <AutomationActions style={{ gap: theme.spacing.xs }}>
                    {entry.results.map(result => (
                      <StatusTag key={result.key} $status={result.status}>
                        {result.key}: {result.detail}
                      </StatusTag>
                    ))}
                  </AutomationActions>
                </div>
              ))
            ) : (
              <HealthMeta>No diagnostics have been recorded yet.</HealthMeta>
            )}

            <SectionDivider />
            <SectionHeaderRow>
              <SectionHeader>Recent Signals</SectionHeader>
            </SectionHeaderRow>
            {(systemHealth.recentMetrics || []).length ? (
              <HealthLogsTable>
                <HealthLogHeader>
                  <div>Metric</div>
                  <div>Value</div>
                  <div>Tags</div>
                  <div>Recorded</div>
                </HealthLogHeader>
                {(systemHealth.recentMetrics || []).map(metric => {
                  const tagSummary = metric.tags
                    ? Object.entries(metric.tags)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join(' • ')
                    : '—';
                  return (
                    <HealthLogRow key={metric.id}>
                      <div>{metric.metricName}</div>
                      <div>{metric.metricValue}</div>
                      <div>{tagSummary}</div>
                      <div>{formatDateTime(metric.timestamp)}</div>
                    </HealthLogRow>
                  );
                })}
              </HealthLogsTable>
            ) : (
              <HealthMeta>No recent metric entries.</HealthMeta>
            )}
          </>
        ) : (
          <HandlesEmpty>Health snapshot unavailable.</HandlesEmpty>
        )}
      </SectionCard>

      {status.message ? (
        <StatusMessage $type={status.type} role="status">
          {status.message}
        </StatusMessage>
      ) : null}

      <SectionCard>
        <SectionHeaderRow>
          <SectionHeader>Scheduled Imports Oversight</SectionHeader>
        </SectionHeaderRow>
        <ScheduledImportsPanel />
      </SectionCard>

      <SectionCard>
        <LinkOutAdminPanel />
      </SectionCard>

      <PrimaryGrid>
        <SectionCard>
        <SectionHeaderRow>
          <SectionHeader>Search Highlights</SectionHeader>
          <SectionHeaderActions>
            <Button
              size="tiny"
              variant="secondary"
              onClick={() => setSearchHighlightsCollapsed(prev => !prev)}
              disabled={editorialUploadBusyIndex !== null}
            >
              {searchHighlightsCollapsed ? '+' : '-'}
            </Button>
          </SectionHeaderActions>
        </SectionHeaderRow>

        {!searchHighlightsCollapsed && (
          <>


            {searchEditorialsLoading ? (
              <HandlesEmpty>Loading highlights…</HandlesEmpty>
            ) : (
              <>
                {searchEditorials.length > 0 ? (
                  <EditorialSummaryGrid>
                    {searchEditorials.map((card, index) => {
                      const isActive = editingEditorialIndex === index;
                      const summaryUrl = card.target_url || '';
                      return (
                        <EditorialSummaryCard key={card.id ?? `editorial-${index}`} $active={isActive}>
                          {card.image_url ? (
                            <EditorialSummaryImage src={card.image_url} alt="" />
                          ) : (
                            <EditorialSummaryPlaceholder>No Image</EditorialSummaryPlaceholder>
                          )}
                          <EditorialSummaryInfo>
                            <EditorialSummaryTitle>{card.title || 'Untitled'}</EditorialSummaryTitle>
                            {card.description ? (
                              <EditorialSummaryDescription>{card.description}</EditorialSummaryDescription>
                            ) : null}
                            {card.preset_query ? (
                              <EditorialSummaryMeta>Query: {card.preset_query}</EditorialSummaryMeta>
                            ) : null}
                            {summaryUrl ? (
                              <EditorialSummaryMeta>URL: {summaryUrl}</EditorialSummaryMeta>
                            ) : null}
                          </EditorialSummaryInfo>
                          <EditorialSummaryActions>
                            <Button
                              size="tiny"
                              variant={isActive ? 'primary' : 'secondary'}
                              onClick={() => {
                                setSearchHighlightsCollapsed(false);
                                setEditingEditorialIndex(index);
                              }}
                              disabled={editorialUploadBusyIndex !== null && !isActive}
                            >
                              {isActive ? 'Editing' : 'Edit'}
                            </Button>
                            <Button
                              size="tiny"
                              variant="secondary"
                              onClick={() => handleEditorialMove(index, -1)}
                              disabled={index === 0 || editorialUploadBusyIndex !== null}
                            >
                              Move Up
                            </Button>
                            <Button
                              size="tiny"
                              variant="secondary"
                              onClick={() => handleEditorialMove(index, 1)}
                              disabled={index === searchEditorials.length - 1 || editorialUploadBusyIndex !== null}
                            >
                              Move Down
                            </Button>
                            <Button
                              size="tiny"
                              variant="danger"
                              onClick={() => handleEditorialRemove(index)}
                              disabled={editorialUploadBusyIndex !== null}
                            >
                              Remove
                            </Button>
                          </EditorialSummaryActions>
                        </EditorialSummaryCard>
                      );
                    })}
                  </EditorialSummaryGrid>
                ) : (
                  <HandlesEmpty>No highlights configured.</HandlesEmpty>
                )}

                <EditorialControls>
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={handleEditorialAdd}
                    disabled={searchEditorials.length >= MAX_EDITORIALS || searchEditorialsLoading || editorialUploadBusyIndex !== null}
                  >
                    Add Highlight
                  </Button>
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={loadSearchEditorials}
                    disabled={searchEditorialsLoading || editorialUploadBusyIndex !== null}
                  >
                    Refresh
                  </Button>
                  <Button
                    size="small"
                    variant="primary"
                    onClick={handleEditorialSave}
                    disabled={searchEditorialsSaving || searchEditorialsLoading || editorialUploadBusyIndex !== null}
                  >
                    {searchEditorialsSaving ? 'Saving…' : 'Save Highlights'}
                  </Button>
                </EditorialControls>

                {searchEditorials.length > 0 ? (
                  editingCard ? (
                    <EditorialGrid>
                      
                      <EditorialRow>
                                              <InlineInputGroup>

                        <EditorialPreview>
                          {editingCard.image_url ? (
                            <EditorialPreviewImage src={editingCard.image_url} alt="" />
                          ) : (
                            <PreviewPlaceholder>No Image</PreviewPlaceholder>
                        )}
                      </EditorialPreview>
                          <LabelText>Image</LabelText>
                          <Input
                            value={editingCard.image_url || ''}
                            onChange={(event) => handleEditorialChange(editingEditorialIndex, 'image_url', event.target.value)}
                            placeholder="https://cdn.example.com/search.jpg"
                          />
                          <EditorialRowActions>
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              ref={editorialFileInputRef}
                              onChange={handleEditorialImageUpload}
                            />
                            <Button
                              size="small"
                              variant="secondary"
                              onClick={handleEditorialUploadTrigger}
                              disabled={editorialUploadBusyIndex === editingEditorialIndex}
                            >
                              {editorialUploadBusyIndex === editingEditorialIndex ? 'Uploading…' : 'Upload Image'}
                            </Button>
                            <Button
                              size="small"
                              variant="secondary"
                              onClick={() => handleEditorialChange(editingEditorialIndex, 'image_url', '')}
                              disabled={!editingCard.image_url || editorialUploadBusyIndex === editingEditorialIndex}
                            >
                              Clear Image
                            </Button>
                          </EditorialRowActions>
                        </InlineInputGroup>
                      <EditorialInputs>
                        <InlineInputGroup>
                          <LabelText>Title</LabelText>
                          <Input
                            value={editingCard.title || ''}
                            onChange={(event) => handleEditorialChange(editingEditorialIndex, 'title', event.target.value)}
                            placeholder="Highlight title"
                          />
                        </InlineInputGroup>
                        <InlineInputGroup>
                          <LabelText>Description</LabelText>
                          <TextArea
                            value={editingCard.description || ''}
                            onChange={(event) => handleEditorialChange(editingEditorialIndex, 'description', event.target.value)}
                            placeholder="Optional supporting copy"
                            rows={3}
                          />
                        </InlineInputGroup>
                        
                        <InlineInputGroup>
                          <LabelText>Search Query</LabelText>
                          <Input
                            value={editingCard.preset_query || ''}
                            onChange={(event) => handleEditorialChange(editingEditorialIndex, 'preset_query', event.target.value)}
                            placeholder="Optional keyword prefill"
                          />
                          <HelperText>Prefills the search bar when selected</HelperText>
                        </InlineInputGroup>
                        <InlineInputGroup>
                          <LabelText>Target URL</LabelText>
                          <Input
                            value={editingCard.target_url || ''}
                            onChange={(event) => handleEditorialChange(editingEditorialIndex, 'target_url', event.target.value)}
                            placeholder="https://flowerpil.io/playlist/123"
                          />
                          <HelperText>Visitors navigate directly to this URL when the highlight is selected.</HelperText>
                        </InlineInputGroup>
                      </EditorialInputs>
                    </EditorialRow>
                  </EditorialGrid>
                  ) : (
                    <HelperText></HelperText>
                  )
                ) : null}
              </>
            )}
          </>
        )}
        </SectionCard>
      </PrimaryGrid>

      <SectionCard>
        <SectionHeaderRow>
          <SectionHeader>Operational Tools</SectionHeader>
        </SectionHeaderRow>

        <UtilityTabBar role="tablist" aria-label="Operational tools">
          {UTILITY_TABS.map(tab => (
            <UtilityTabButton
              key={tab.id}
              id={`site-admin-utility-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeUtilityTab === tab.id}
              aria-controls="site-admin-utility-panel"
              $active={activeUtilityTab === tab.id}
              onClick={() => setActiveUtilityTab(tab.id)}
            >
              {tab.label}
            </UtilityTabButton>
          ))}
        </UtilityTabBar>

        <UtilityTabPanel
          role="tabpanel"
          id="site-admin-utility-panel"
          aria-labelledby={`site-admin-utility-tab-${activeUtilityTab}`}
        >
          {renderUtilityPanel()}
        </UtilityTabPanel>
      </SectionCard>

      <ResponsiveGrid>
        <SectionCard>
          <SectionHeader>Bio Handles</SectionHeader>
          <HandlesControls>
            <Input
              value={handleSearch}
              onChange={(e) => setHandleSearch(e.target.value)}
              placeholder={handleView === 'profiles' ? 'Search handles or curators' : 'Search reservations'}
              style={{ flex: '1 1 240px', minWidth: '200px' }}
            />
            <div style={{ display: 'flex', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
              <GhostButton
                type="button"
                $active={handleView === 'profiles'}
                onClick={() => setHandleView('profiles')}
              >
                Profiles
              </GhostButton>
              <GhostButton
                type="button"
                $active={handleView === 'reservations'}
                onClick={() => setHandleView('reservations')}
              >
                Reservations
              </GhostButton>
              <GhostButton type="button" onClick={refreshBioHandles}>
                Refresh
              </GhostButton>
            </div>
          </HandlesControls>
          <HandlesTable>
            <HandlesScroll>
              <HandlesHeaderRow $columns={handleView === 'profiles' ? PROFILE_HANDLE_COLUMNS : RESERVATION_HANDLE_COLUMNS}>
                {handleView === 'profiles' ? (
                  <>
                    <span>Handle</span>
                    <span>Curator</span>
                    <span>Status</span>
                    <span>Updated</span>
                    <span>Next Change</span>
                  </>
                ) : (
                  <>
                    <span>Handle</span>
                    <span>Reserved For</span>
                    <span>Status</span>
                    <span>Reserved</span>
                    <span>Expires</span>
                  </>
                )}
              </HandlesHeaderRow>
              {filteredHandleEntries.length === 0 ? (
                <HandlesEmpty>No handles found.</HandlesEmpty>
              ) : (
                filteredHandleEntries.map((entry) => {
                  if (handleView === 'profiles') {
                    return (
                      <HandlesRow key={`profile-${entry.id}`} $columns={PROFILE_HANDLE_COLUMNS}>
                        <HandleLinkButton
                          type="button"
                          onClick={() => openBioEditor(entry.handle)}
                          title="Open in Bio Editor"
                        >
                          {entry.handle}
                        </HandleLinkButton>
                        <span>{entry.curator_name || '—'}</span>
                        <HandleStatusBadge $variant={entry.is_published ? 'published' : 'draft'}>
                          {entry.is_published ? 'Published' : 'Draft'}
                        </HandleStatusBadge>
                        <span>{formatDateTime(entry.updated_at)}</span>
                        <span>{formatDateTime(entry.next_handle_change_at)}</span>
                      </HandlesRow>
                    );
                  }

                  const expiresAt = entry.expires_at ? new Date(entry.expires_at) : null;
                  const isExpired = expiresAt ? expiresAt.getTime() < Date.now() : false;
                  const reservationVariant = isExpired
                    ? 'expired'
                    : entry.status === 'released'
                      ? 'released'
                      : entry.status === 'reserved'
                        ? 'reserved'
                        : 'published';

                  return (
                    <HandlesRow key={`reservation-${entry.id}`} $columns={RESERVATION_HANDLE_COLUMNS}>
                      <span>{entry.handle}</span>
                      <span>{entry.reserved_for || '—'}</span>
                      <HandleStatusBadge $variant={reservationVariant}>
                        {entry.status || 'reserved'}
                      </HandleStatusBadge>
                      <span>{formatDateTime(entry.reserved_at)}</span>
                      <span>{formatDateTime(entry.expires_at)}</span>
                    </HandlesRow>
                  );
                })
              )}
            </HandlesScroll>
          </HandlesTable>
        </SectionCard>
      </ResponsiveGrid>
      <ResponsiveGrid>

        <SectionCard>
          <SectionHeader>Referrals</SectionHeader>

          <ReferralFormGrid>
            <div>
              <LabelText>Email</LabelText>
              <Input
                type="email"
                value={referralForm.email}
                onChange={(e) => setReferralForm(f => ({ ...f, email: e.target.value }))}
                placeholder="invitee@example.com"
              />
            </div>
            <div>
              <LabelText>Name (optional)</LabelText>
              <Input
                value={referralForm.curator_name}
                onChange={(e) => setReferralForm(f => ({ ...f, curator_name: e.target.value }))}
                placeholder="Curator Name"
              />
            </div>
            <div className="actions">
              <Button variant="primary" onClick={handleIssueReferral}>Issue</Button>
            </div>
          </ReferralFormGrid>

          <ReferralList>
            <ReferralRows>
              <ReferralHeaderRow>
                <span>Code</span>
                <span>Email</span>
                <span>Name</span>
                <span>Issued By</span>
                <span>Status</span>
                <span className="sr-only">Actions</span>
              </ReferralHeaderRow>
              {referrals.length === 0 ? (
                <EmptyRow as="div">No referrals yet.</EmptyRow>
              ) : (
                referrals.map((r) => (
                  <ReferralRow key={r.id}>
                    <CodeBadge
                      title={r.code}
                      onClick={() => navigator.clipboard?.writeText(r.code)}
                    >
                      {r.code}
                    </CodeBadge>
                    <ReferralCell title={r.email}>{r.email}</ReferralCell>
                    <ReferralCell title={r.curator_name || ''}>{r.curator_name || '—'}</ReferralCell>
                    <ReferralCell title={r.issued_by_label || ''}>{r.issued_by_label || '—'}</ReferralCell>
                    <StatusChip $status={r.status}>{r.status}</StatusChip>
                    <ReferralActions>
                      <GhostButton
                        type="button"
                        onClick={async () => {
                          if (!confirm(`Delete referral ${r.code}?`)) return;
                          try {
                            await adminDelete(`/api/v1/admin/referrals/${r.code}`);
                            const data = await adminGet('/api/v1/admin/referrals');
                            setReferrals(data.data || []);
                            showStatus('success', 'Referral deleted');
                          } catch (error) {
                            showStatus('error', `Failed to delete referral: ${error.message}`);
                          }
                        }}
                      >
                        Clear
                      </GhostButton>
                    </ReferralActions>
                  </ReferralRow>
                ))
              )}
            </ReferralRows>
          </ReferralList>
        </SectionCard>
      </ResponsiveGrid>

      <SectionDivider />

      <ResponsiveGrid>
        <SectionCard>
          <SectionHeaderRow>
            <SectionHeader>Curator Types</SectionHeader>
            <SectionHeaderActions>
              <GhostButton
                type="button"
                onClick={() => setCuratorTypesCollapsed(prev => !prev)}
              >
                {curatorTypesCollapsed ? '+' : '-'}
              </GhostButton>
            </SectionHeaderActions>
          </SectionHeaderRow>
          <HelperText>Keep curator segments and their colours aligned across dashboards and automations.</HelperText>

          <AddCuratorTypeForm>
            <Input
              type="text"
              placeholder="Type ID (e.g., 'record-store')"
              value={newCuratorType.id}
              onChange={(e) => setNewCuratorType(prev => ({ ...prev, id: e.target.value }))}
            />
            <Input
              type="text"
              placeholder="Type Label (e.g., 'Record Store')"
              value={newCuratorType.label}
              onChange={(e) => setNewCuratorType(prev => ({ ...prev, label: e.target.value }))}
            />
            <ColorPicker
              type="color"
              value={newCuratorType.color}
              onChange={(e) => setNewCuratorType(prev => ({ ...prev, color: e.target.value }))}
              title="Set color for new curator type"
              aria-label="Set color for new curator type"
            />
            <Button onClick={handleAddCuratorType} size="small">
              Add Type
            </Button>
          </AddCuratorTypeForm>

          {!curatorTypesCollapsed && (
            <CuratorTypeGrid>
              {curatorTypeSections.map(section => (
                <CuratorTypeSection key={section.id}>
                  <CuratorTypeSectionHeader>
                    <CuratorTypeSectionTitle>{formatCategoryLabel(section.label)}</CuratorTypeSectionTitle>
                    <CuratorTypeSectionMeta>
                      {section.options.length} {section.options.length === 1 ? 'type' : 'types'}
                    </CuratorTypeSectionMeta>
                  </CuratorTypeSectionHeader>
                  <CuratorTypeList>
                    {section.options.map(option => {
                      const assignedColor = curatorTypeColors[option.value] || '#ffffff';
                      const isCustom = Boolean(customTypeMap[option.value]);
                      const isEditing = editingType === option.value && isCustom;
                      const currentLabel = isCustom
                        ? (editingType === option.value ? editingTypeDraft : customTypeMap[option.value]?.label)
                        : option.label;

                      return (
                        <CuratorTypeRow key={option.value}>
                          <ColorPicker
                            type="color"
                            value={assignedColor}
                            onChange={(e) => handleCuratorTypeColorChange(option.value, e.target.value)}
                            title={`Set color for ${option.label}`}
                            aria-label={`Set color for ${option.label}`}
                          />
                          <CuratorTypeBody>
                            {isEditing && isCustom ? (
                              <InlineInput
                                value={editingTypeDraft}
                                onChange={(e) => setEditingTypeDraft(e.target.value)}
                                placeholder="Type label"
                              />
                            ) : (
                              <>
                                <CuratorTypeName>{currentLabel}</CuratorTypeName>
                                <CuratorTypeId>{option.value}</CuratorTypeId>
                              </>
                            )}
                          </CuratorTypeBody>
                          <CuratorTypeActions>
                            {isCustom && (
                              isEditing ? (
                                <>
                                  <Button
                                    size="tiny"
                                    onClick={() => handleEditCuratorType(option.value, { label: editingTypeDraft })}
                                  >
                                    Save
                                  </Button>
                                  <GhostButton
                                    type="button"
                                    onClick={() => {
                                      setEditingType(null);
                                      setEditingTypeDraft('');
                                    }}
                                  >
                                    Cancel
                                  </GhostButton>
                                </>
                              ) : (
                                <>
                                  <GhostButton
                                    type="button"
                                    onClick={() => {
                                      const existingLabel = customTypeMap[option.value]?.label || option.label;
                                      setEditingType(option.value);
                                      setEditingTypeDraft(existingLabel);
                                    }}
                                  >
                                    Edit
                                  </GhostButton>
                                  <Button
                                    size="tiny"
                                    variant="danger"
                                    onClick={() => handleDeleteCuratorType(option.value)}
                                  >
                                    Delete
                                  </Button>
                                </>
                              )
                            )}
                          </CuratorTypeActions>
                        </CuratorTypeRow>
                      );
                    })}
                  </CuratorTypeList>
                </CuratorTypeSection>
              ))}
            </CuratorTypeGrid>
          )}
        </SectionCard>

        <SectionCard>
          <SectionHeaderRow>
            <SectionHeader>Genre Categories</SectionHeader>
            <SectionHeaderActions>
              <GhostButton
                type="button"
                onClick={() => setGenreCategoriesCollapsed(prev => !prev)}
              >
                {genreCategoriesCollapsed ? '+' : '-'}
              </GhostButton>
            </SectionHeaderActions>
          </SectionHeaderRow>
          <HelperText>Curate genre groupings that power search filters and editorial copy.</HelperText>

          <GenreAddForm onSubmit={handleAddGenreCategory}>
            <GenreInput
              type="text"
              placeholder="Add new genre"
              value={newGenreName}
              onChange={(e) => setNewGenreName(e.target.value)}
              aria-label="New genre name"
              autoComplete="off"
              list="genre-category-suggestions"
            />
            <Button type="submit" size="small">Add Genre</Button>
            {genreAddSuggestions.length > 0 && (
              <GenreSuggestionList role="listbox">
                {genreAddSuggestions.map(suggestion => (
                  <li key={suggestion.id}>
                    <button
                      type="button"
                      onMouseDown={(event) => { event.preventDefault(); setNewGenreName(suggestion.label); }}
                    >
                      {suggestion.label} ({suggestion.id})
                    </button>
                  </li>
                ))}
              </GenreSuggestionList>
            )}
          </GenreAddForm>

          {!genreCategoriesCollapsed && (
            <>
              <GenreControls>
                <GenreSearchInput
                  type="search"
                  placeholder="Search genres"
                  value={genreSearch}
                  onChange={(e) => setGenreSearch(e.target.value)}
                  aria-label="Search genres"
                />
              </GenreControls>
              <datalist id="genre-category-suggestions">
                {genreCategories.map(category => (
                  <option key={category.id} value={category.label} />
                ))}
              </datalist>
              <GenreList>
                {filteredGenreCategories.length === 0 ? (
                  <EmptyRow>No matching genres.</EmptyRow>
                ) : (
                  filteredGenreCategories.map(category => {
                    const isEditing = editingGenre === category.id;
                    return (
                      <GenreRow key={category.id}>
                        <GenreColorInput
                          value={category.color || '#000000'}
                          onChange={(e) => handleGenreColorUpdate(category.id, e.target.value)}
                          title={`Set color for ${category.label}`}
                          aria-label={`Set color for ${category.label}`}
                        />
                        <GenreBody>
                          {isEditing ? (
                            <InlineInput
                              value={editingGenreDraft}
                              onChange={(e) => setEditingGenreDraft(e.target.value)}
                              placeholder="Genre label"
                              autoFocus
                            />
                          ) : (
                            <>
                              <GenreLabel>{category.label}</GenreLabel>
                              <GenreId>{category.id}</GenreId>
                            </>
                          )}
                        </GenreBody>
                        <GenreActions>
                          {isEditing ? (
                            <>
                              <Button size="tiny" onClick={() => handleSaveGenre(category.id)}>Save</Button>
                              <GhostButton
                                type="button"
                                onClick={() => {
                                  setEditingGenre(null);
                                  setEditingGenreDraft('');
                                }}
                              >
                                Cancel
                              </GhostButton>
                            </>
                          ) : (
                            <>
                              <GhostButton type="button" onClick={() => handleEditGenre(category.id, category.label)}>Edit</GhostButton>
                              <Button size="tiny" variant="danger" onClick={() => handleDeleteGenre(category.id, category.label)}>Delete</Button>
                            </>
                          )}
                        </GenreActions>
                      </GenreRow>
                    );
                  })
                )}
              </GenreList>
              <BulkAddWrapper>
                <LabelText htmlFor="genre-bulk-input">Bulk Add Genres</LabelText>
                <BulkTextArea
                  id="genre-bulk-input"
                  placeholder="Paste one genre per line"
                  value={bulkGenreInput}
                  onChange={(e) => setBulkGenreInput(e.target.value)}
                />
                <BulkActionRow>
                  <Button type="button" size="small" onClick={handleBulkAddGenres}>Add From List</Button>
                  <GenreHint>Each new line creates a category. Existing ids are skipped automatically.</GenreHint>
                </BulkActionRow>
              </BulkAddWrapper>
            </>
          )}
        </SectionCard>
      </ResponsiveGrid>

      {/* Latest Page Ordering */}
      <SectionCard>
        <SectionHeader>Post Order</SectionHeader>
        <div style={{ marginBottom: theme.spacing.md }}>
          <Button 
            variant="secondary" 
            size="small"
            onClick={handleResetToDefaultOrder}
          >
            Reset
          </Button>
        </div>
        <OrderingContainer>
          {latestPageOrder.map((item, index) => (
            <OrderItem key={item.id}>
              <span>{item.title}</span>
              <OrderControls>
                <Button 
                  size="tiny" 
                  disabled={index === 0}
                  onClick={() => handleLatestPageReorder(index, index - 1)}
                >
                  ↑
                </Button>
                <Button 
                  size="tiny"
                  disabled={index === latestPageOrder.length - 1}
                  onClick={() => handleLatestPageReorder(index, index + 1)}
                >
                  ↓
                </Button>
              </OrderControls>
            </OrderItem>
          ))}
        </OrderingContainer>
      </SectionCard>

      {/* Content Tags System */}
      <SectionCard>
        <SectionHeader>Content Tags</SectionHeader>
        <div style={{
          marginBottom: theme.spacing.sm,
          fontFamily: theme.fonts.mono,
          fontSize: theme.fontSizes.tiny,
          color: theme.colors.black
        }}>
          Create tags, then select a published playlist and apply a tag.
        </div>
        <CustomFlagForm style={{ gridTemplateColumns: '1fr', gap: theme.spacing.md }}>
          <Input
            type="text"
            placeholder="Tag text"
            value={newFlag.text}
            onChange={(e) => setNewFlag(prev => ({ ...prev, text: e.target.value }))}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: theme.spacing.sm, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: theme.spacing.xs, alignItems: 'center' }}>
              <ColorPickerLabel>BG:</ColorPickerLabel>
              <ColorPicker
                type="color"
                value={newFlag.color}
                onChange={(e) => setNewFlag(prev => ({ ...prev, color: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', gap: theme.spacing.xs, alignItems: 'center' }}>
              <ColorPickerLabel>Text:</ColorPickerLabel>
              <ColorPicker
                type="color"
                value={newFlag.textColor}
                onChange={(e) => setNewFlag(prev => ({ ...prev, textColor: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <LabelText>Description (for public tag page)</LabelText>
            <textarea
              style={{
                width: '100%',
                minHeight: '80px',
                padding: theme.spacing.sm,
                fontFamily: theme.fonts.mono,
                fontSize: theme.fontSizes.small,
                border: theme.borders.solid + ' ' + theme.colors.black,
                background: theme.colors.fpwhite,
                color: theme.colors.black
              }}
              placeholder="Describe this tag for visitors on the public content tag page"
              value={newFlag.description || ''}
              onChange={(e) => setNewFlag(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
            <input
              type="checkbox"
              id="allow-self-assign"
              checked={newFlag.allowSelfAssign || false}
              onChange={(e) => setNewFlag(prev => ({ ...prev, allowSelfAssign: e.target.checked }))}
            />
            <label htmlFor="allow-self-assign" style={{ fontFamily: theme.fonts.mono, fontSize: theme.fontSizes.small }}>
              Allow curators to self-assign
            </label>
          </div>

          <Button onClick={handleAddCustomFlag} size="small">
            Add Tag
          </Button>
        </CustomFlagForm>
        
        <CustomFlagsList>
          {customFlags.map(flag => (
            <OrderItem key={flag.id}>
              {editingTagId === flag.id ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, width: '100%' }}>
                  <Input
                    type="text"
                    placeholder="Tag text"
                    value={editingTag.text}
                    onChange={(e) => setEditingTag(prev => ({ ...prev, text: e.target.value }))}
                  />
                  <div style={{ display: 'flex', gap: theme.spacing.xs, alignItems: 'center' }}>
                    <ColorPickerLabel>BG:</ColorPickerLabel>
                    <ColorPicker
                      type="color"
                      value={editingTag.color}
                      onChange={(e) => setEditingTag(prev => ({ ...prev, color: e.target.value }))}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: theme.spacing.xs, alignItems: 'center' }}>
                    <ColorPickerLabel>Text:</ColorPickerLabel>
                    <ColorPicker
                      type="color"
                      value={editingTag.textColor}
                      onChange={(e) => setEditingTag(prev => ({ ...prev, textColor: e.target.value }))}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: theme.spacing.xs }}>
                    <Button size="tiny" onClick={handleUpdateCustomFlag}>Save</Button>
                    <Button size="tiny" variant="secondary" onClick={cancelEditTag}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
                    <div 
                      style={{ 
                        padding: '2px 6px',
                        fontSize: '10px',
                        backgroundColor: flag.color,
                        color: flag.text_color || '#000000ff',
                        border: '1px solid rgba(0, 0, 0, 0.3)',
                        borderRadius: '2px',
                        fontFamily: theme.fonts.mono,
                        fontWeight: 'bold',
                        textTransform: 'uppercase'
                      }} 
                    >
                      {flag.text}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: theme.spacing.xs }}>
                    <Button size="tiny" variant="secondary" onClick={() => startEditTag(flag)}>Edit</Button>
                    <Button 
                      variant="danger" 
                      size="tiny"
                      onClick={() => handleRemoveCustomFlag(flag.id)}
                    >
                      Remove Tag
                    </Button>
                  </div>
                </>
              )}
            </OrderItem>
          ))}
        </CustomFlagsList>
        
        <PlaylistFlagSection>
          <div>
            <SectionHeader style={{ marginBottom: theme.spacing.md }}>
              Playlists
            </SectionHeader>
            <PlaylistList>
              {playlistsForFlags.map(playlist => (
                <PlaylistItem 
                  key={playlist.id}
                  $selected={selectedPlaylist === playlist.id}
                  onClick={() => handleSelectPlaylist(playlist.id)}
                >
                  <div className="title">{playlist.title}</div>
                  <div className="meta">
                    {playlist.curator_name} • {playlist.flag_count} tag{playlist.flag_count !== 1 ? 's' : ''}
                  </div>
                </PlaylistItem>
              ))}
            </PlaylistList>
          </div>
          
          <div>
            <SectionHeader style={{ marginBottom: theme.spacing.md }}>
              {selectedPlaylist ? 'Tag Assignment' : 'Select a playlist'}
            </SectionHeader>
            {selectedPlaylist && (
              <div style={{
                margin: `-${theme.spacing.sm} 0 ${theme.spacing.md} 0`,
                fontFamily: theme.fonts.mono,
                fontSize: theme.fontSizes.tiny,
                color: theme.colors.black
              }}>
                Choose a tag below and click “Apply Tag”.
              </div>
            )}
            <FlagAssignmentPanel>
              {selectedPlaylist ? (
                <>
                  <div>
                    <h4 style={{ 
                      margin: `0 0 ${theme.spacing.sm} 0`, 
                      fontFamily: theme.fonts.mono,
                      fontSize: theme.fontSizes.small,
                      color: theme.colors.black
                    }}>
                      Assigned Tags
                    </h4>
                    {playlistFlags.length > 0 ? (
                      playlistFlags.map(assignment => (
                        <AssignedFlagItem key={assignment.id}>
                          <FlagIndicator>
                            <div 
                              className="flag-color" 
                              style={{ backgroundColor: assignment.color }}
                            />
                            <div className="flag-text">{assignment.text}</div>
                          </FlagIndicator>
                          <Button 
                            size="tiny" 
                            variant="danger"
                            onClick={() => handleRemoveFlag(selectedPlaylist, assignment.flag_id)}
                          >
                            Remove
                          </Button>
                        </AssignedFlagItem>
                      ))
                    ) : (
                      <div style={{ 
                        padding: theme.spacing.md, 
                        textAlign: 'center',
                        color: theme.colors.black[400],
                        fontFamily: theme.fonts.mono,
                        fontSize: theme.fontSizes.small
                      }}>
                        No tags assigned
                      </div>
                    )}
                  </div>
                  
                  <AvailableFlags>
                    <div className="header">Available Tags</div>
                    {customFlags
                      .filter(flag => !playlistFlags.find(pf => pf.flag_id === flag.id))
                      .map(flag => (
                      <AvailableFlagItem key={flag.id}>
                        <FlagIndicator>
                          <div 
                            className="flag-color" 
                            style={{ backgroundColor: flag.color }}
                          />
                          <div className="flag-text">{flag.text}</div>
                        </FlagIndicator>
                        <Button 
                          size="tiny"
                          onClick={() => handleAssignFlag(selectedPlaylist, flag.id)}
                        >
                          Apply Tag
                        </Button>
                      </AvailableFlagItem>
                    ))}
                    {customFlags.filter(flag => !playlistFlags.find(pf => pf.flag_id === flag.id)).length === 0 && (
                      <div style={{ 
                        padding: theme.spacing.md, 
                        textAlign: 'center',
                        color: theme.colors.black[400],
                        fontFamily: theme.fonts.mono,
                        fontSize: theme.fontSizes.small
                      }}>
                        All tags assigned
                      </div>
                    )}
                  </AvailableFlags>
                </>
              ) : (
                <div style={{ 
                  padding: theme.spacing.lg, 
                  textAlign: 'center',
                  color: theme.colors.black[400],
                  fontFamily: theme.fonts.mono,
                  fontSize: theme.fontSizes.small
                }}>
                  Select a playlist from the left to manage its tags
                </div>
              )}
            </FlagAssignmentPanel>
          </div>
        </PlaylistFlagSection>
      </SectionCard>

      {/* Bulk Tag Operations */}
      <SectionCard>
        <SectionHeader>Bulk Tag Operations</SectionHeader>
        <div style={{
          marginBottom: theme.spacing.md,
          fontFamily: theme.fonts.mono,
          fontSize: theme.fontSizes.small,
          color: theme.colors.black
        }}>
          Select multiple playlists and assign a tag to all of them at once (max 100 per operation).
        </div>

        <div style={{ display: 'flex', gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
          <Button
            size="small"
            variant="secondary"
            onClick={() => setSelectedPlaylists(playlistsForFlags.map(p => p.id))}
          >
            Select All
          </Button>
          <Button
            size="small"
            variant="secondary"
            onClick={() => setSelectedPlaylists([])}
          >
            Clear Selection
          </Button>
          <div style={{
            marginLeft: 'auto',
            fontFamily: theme.fonts.mono,
            fontSize: theme.fontSizes.small,
            color: theme.colors.black,
            display: 'flex',
            alignItems: 'center'
          }}>
            {selectedPlaylists.length} selected
          </div>
        </div>

        <PlaylistList style={{ marginBottom: theme.spacing.md, maxHeight: '300px' }}>
          {playlistsForFlags.map(playlist => (
            <div
              key={playlist.id}
              style={{
                padding: theme.spacing.sm,
                marginBottom: theme.spacing.xs,
                border: theme.borders.dashed + ' ' + (selectedPlaylists.includes(playlist.id) ? theme.colors.black : 'transparent'),
                background: selectedPlaylists.includes(playlist.id) ? 'rgba(0, 0, 0, 0.05)' : 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing.sm
              }}
              onClick={() => {
                setSelectedPlaylists(prev =>
                  prev.includes(playlist.id)
                    ? prev.filter(id => id !== playlist.id)
                    : [...prev, playlist.id]
                );
              }}
            >
              <input
                type="checkbox"
                checked={selectedPlaylists.includes(playlist.id)}
                onChange={() => {}}
                style={{ cursor: 'pointer' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: theme.fonts.mono,
                  fontSize: theme.fontSizes.small,
                  color: theme.colors.black,
                  marginBottom: theme.spacing.xs
                }}>
                  {playlist.title}
                </div>
                <div style={{
                  fontSize: theme.fontSizes.tiny,
                  color: theme.colors.black[400]
                }}>
                  {playlist.curator_name} • {playlist.flag_count} tag{playlist.flag_count !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          ))}
        </PlaylistList>

        <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <LabelText>Tag to Apply</LabelText>
            <select
              value={bulkSelectedTag}
              onChange={(e) => setBulkSelectedTag(e.target.value)}
              style={{
                width: '100%',
                padding: theme.spacing.sm,
                fontFamily: theme.fonts.mono,
                fontSize: theme.fontSizes.small,
                border: theme.borders.solid + ' ' + theme.colors.black,
                background: theme.colors.fpwhite,
                color: theme.colors.black
              }}
            >
              <option value="">-- Select a tag --</option>
              {customFlags.map(flag => (
                <option key={flag.id} value={flag.id}>
                  {flag.text}
                </option>
              ))}
            </select>
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <Button
              variant="primary"
              size="small"
              onClick={handleBulkAssignTag}
              disabled={selectedPlaylists.length === 0 || !bulkSelectedTag}
            >
              Apply Tag to Selected
            </Button>
          </div>
        </div>
      </SectionCard>

    </SiteAdminContainer>
  );
};

export default SiteAdmin;
