import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import styled from 'styled-components';
import { theme, Button, Input } from '@shared/styles/GlobalStyles';
import { adminGet, adminPost, adminPut, adminDelete } from '../../admin/utils/adminApi.js';
import Toast from './shared/Toast.jsx';
import ConfirmationDialog from './shared/ConfirmationDialog.jsx';

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xl};
`;

const SectionCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  padding: clamp(${theme.spacing.md}, 3vw, ${theme.spacing.xl});
  border-radius: 14px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  background: ${theme.colors.fpwhite};
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.06);
`;

const SectionHeader = styled.h3`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.medium};
  color: ${theme.colors.black};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const SubSectionHeader = styled.h4`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

const HelperText = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  margin-bottom: ${theme.spacing.sm};
  line-height: 1.5;
`;

const StepIndicator = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  margin-bottom: ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const Step = styled.div.withConfig({ shouldForwardProp: (prop) => prop !== '$active' && prop !== '$completed' })`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border-radius: 4px;
  background: ${({ $active, $completed }) => {
    if ($active) return theme.colors.black;
    if ($completed) return 'rgba(0, 0, 0, 0.1)';
    return 'transparent';
  }};
  color: ${({ $active }) => ($active ? theme.colors.fpwhite : theme.colors.black)};
  border: 1px solid ${({ $active }) => ($active ? theme.colors.black : 'rgba(0, 0, 0, 0.2)')};
`;

const CustomFlagForm = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.md};
`;

const ColorPickerLabel = styled.label`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  min-width: 120px;
  display: block;
`;

const ColorPicker = styled.input.attrs({ type: 'color' })`
  width: 56px;
  height: 40px;
  padding: 0;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.3);
  background: transparent;
  cursor: pointer;
  border-radius: 6px;

  &::-webkit-color-swatch-wrapper {
    padding: 0;
    border: none;
  }

  &::-webkit-color-swatch {
    border: none;
    border-radius: 4px;
  }
`;

const ColorRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
`;

const TagPreview = styled.div.withConfig({ shouldForwardProp: (prop) => prop !== '$bgColor' && prop !== '$textColor' })`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background: ${({ $bgColor }) => $bgColor || '#ffffff'};
  color: ${({ $textColor }) => $textColor || '#000000'};
  border: 1px solid rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  display: inline-block;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const ContrastWarning = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.warning};
  margin-top: ${theme.spacing.xs};
`;

const LabelText = styled.label`
  display: block;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${theme.colors.black};
  margin-bottom: ${theme.spacing.xs};
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 80px;
  padding: ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  border: ${theme.borders.solidThin} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  border-radius: 6px;
  min-height: ${theme.touchTarget.min};

  &:focus {
    outline: 2px solid ${theme.colors.primary};
    outline-offset: 2px;
  }
`;

const CustomFlagsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const OrderItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${theme.spacing.md};
  border-radius: 8px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.14);
  background: rgba(0, 0, 0, 0.02);
  min-height: ${theme.touchTarget.min};
`;

const TagBadge = styled.div.withConfig({ shouldForwardProp: (prop) => prop !== '$bgColor' && prop !== '$textColor' })`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background: ${({ $bgColor }) => $bgColor || '#ffffff'};
  color: ${({ $textColor }) => $textColor || '#000000'};
  border: 1px solid rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  min-height: 32px;
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: transform 0.2s ease;

  &:hover {
    transform: scale(1.05);
  }
`;

const UsageCount = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black[400]};
  margin-left: ${theme.spacing.sm};
`;

const SearchInput = styled(Input)`
  margin-bottom: ${theme.spacing.md};
  min-height: ${theme.touchTarget.min};
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
  max-height: 500px;
  overflow-y: auto;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.14);
  border-radius: 10px;
  padding: ${theme.spacing.sm};
  background: ${theme.colors.fpwhite};
`;

const PlaylistItem = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== '$selected'
})`
  padding: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.xs};
  border-radius: 8px;
  border: ${theme.borders.solidThin} ${({ $selected }) => ($selected ? theme.colors.black : 'transparent')};
  background: ${({ $selected }) => ($selected ? 'rgba(0, 0, 0, 0.05)' : 'transparent')};
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: ${theme.touchTarget.comfortable};
  display: flex;
  flex-direction: column;
  justify-content: center;
  
  &:hover {
    background: rgba(0, 0, 0, 0.03);
    border-color: ${({ $selected }) => ($selected ? theme.colors.black : 'rgba(0, 0, 0, 0.2)')};
  }
  
  &:focus {
    outline: 2px solid ${theme.colors.primary};
    outline-offset: 2px;
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
  padding: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.xs};
  border-radius: 8px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  background: rgba(0, 0, 0, 0.02);
  min-height: ${theme.touchTarget.min};
`;

const FlagIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  
  .flag-color {
    width: 16px;
    height: 16px;
    border: 1px solid rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    flex-shrink: 0;
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
  padding: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.xs};
  border: ${theme.borders.dashed} transparent;
  background: rgba(0, 0, 0, 0.02);
  min-height: ${theme.touchTarget.min};
  border-radius: 4px;

  &:hover {
    border-color: ${theme.colors.black};
    background: rgba(0, 0, 0, 0.04);
  }
`;

const BulkOperationsSection = styled.div`
  margin-top: ${theme.spacing.lg};
  padding-top: ${theme.spacing.lg};
  border-top: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
`;

const BulkControls = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.md};
  flex-wrap: wrap;
  align-items: center;
`;

const BulkSelectionCount = styled.div`
  margin-left: auto;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
`;

const BulkTagSelector = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  align-items: flex-end;
  flex-wrap: wrap;
`;

const Select = styled.select`
  flex: 1;
  min-width: 200px;
  padding: ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  border: ${theme.borders.solidThin} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  border-radius: 6px;
  min-height: ${theme.touchTarget.min};

  &:focus {
    outline: 2px solid ${theme.colors.primary};
    outline-offset: 2px;
  }
`;

const InlineInput = styled.input`
  flex: 1;
  padding: ${theme.spacing.sm};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.25);
  background: ${theme.colors.fpwhite};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  border-radius: 6px;
  min-height: ${theme.touchTarget.min};

  &:focus {
    border-color: ${theme.colors.black};
    outline: 2px solid ${theme.colors.primary};
    outline-offset: 2px;
  }
`;

const TemplateButton = styled.button`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border: ${theme.borders.dashed} rgba(0, 0, 0, 0.3);
  background: transparent;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${theme.colors.black};
  cursor: pointer;
  border-radius: 6px;
  min-height: ${theme.touchTarget.min};
  transition: all 0.2s ease;

  &:hover {
    border-color: ${theme.colors.black};
    background: rgba(0, 0, 0, 0.05);
  }
`;

const TemplateGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.md};
`;

const CollapsibleSection = styled.div`
  margin-top: ${theme.spacing.md};
`;

const CollapseToggle = styled.button`
  width: 100%;
  padding: ${theme.spacing.sm};
  border: ${theme.borders.dashed} rgba(0, 0, 0, 0.2);
  background: transparent;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${theme.colors.black};
  cursor: pointer;
  border-radius: 6px;
  min-height: ${theme.touchTarget.min};
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${theme.colors.black};
    background: rgba(0, 0, 0, 0.02);
  }
`;

const EmptyState = styled.div`
  padding: ${theme.spacing.xl};
  text-align: center;
  color: ${theme.colors.black[400]};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const KeyboardHint = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black[400]};
  margin-top: ${theme.spacing.xs};
  text-transform: none;
  letter-spacing: 0;
`;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Calculate contrast ratio for WCAG compliance
const getContrastRatio = (color1, color2) => {
  const getLuminance = (hex) => {
    const rgb = hex.match(/\w\w/g).map(x => parseInt(x, 16) / 255);
    const [r, g, b] = rgb.map(val => {
      return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  
  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
};

// Smart color defaults - high contrast pairs
const COLOR_PRESETS = [
  { bg: '#000000', text: '#ffffff', name: 'Black/White' },
  { bg: '#ffffff', text: '#000000', name: 'White/Black' },
  { bg: '#479ff2', text: '#ffffff', name: 'Blue/White' },
  { bg: '#4caf50', text: '#ffffff', name: 'Green/White' },
  { bg: '#ff3b30', text: '#ffffff', name: 'Red/White' },
  { bg: '#ff9800', text: '#000000', name: 'Orange/Black' },
];

const TAG_TEMPLATES = [
  { text: 'Featured', color: '#000000', textColor: '#ffffff', description: 'Featured playlists' },
  { text: 'New', color: '#479ff2', textColor: '#ffffff', description: 'Recently added playlists' },
  { text: 'Editor\'s Pick', color: '#4caf50', textColor: '#ffffff', description: 'Curator selected playlists' },
  { text: 'Trending', color: '#ff3b30', textColor: '#ffffff', description: 'Popular playlists' },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ContentTagManager = ({ onStatusChange }) => {
  // Tag editor state
  const [customFlags, setCustomFlags] = useState([]);
  const [newFlag, setNewFlag] = useState({ 
    text: '', 
    color: '#000000', 
    textColor: '#ffffff', 
    description: '', 
    allowSelfAssign: false 
  });
  const [editingTagId, setEditingTagId] = useState(null);
  const [editingTag, setEditingTag] = useState({ 
    text: '', 
    color: '#000000', 
    textColor: '#ffffff', 
    description: '', 
    allowSelfAssign: false 
  });
  const [creationStep, setCreationStep] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Playlist flag manager state
  const [playlistsForFlags, setPlaylistsForFlags] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [playlistFlags, setPlaylistFlags] = useState([]);
  const [playlistSearch, setPlaylistSearch] = useState('');

  // Bulk operations state
  const [selectedPlaylists, setSelectedPlaylists] = useState([]);
  const [bulkSelectedTag, setBulkSelectedTag] = useState('');

  // UI state
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [undoStack, setUndoStack] = useState([]);

  // Refs for keyboard shortcuts
  const searchInputRef = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Cmd/Ctrl + K for search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // Escape to cancel
      if (e.key === 'Escape') {
        if (editingTagId) {
          cancelEditTag();
        }
        if (confirmDialog) {
          setConfirmDialog(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingTagId, confirmDialog]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [flagsData, playlistsData] = await Promise.all([
        adminGet('/api/v1/admin/site-admin/custom-flags'),
        adminGet('/api/v1/admin/site-admin/playlists-for-flags')
      ]);
      setCustomFlags(flagsData.flags || []);
      setPlaylistsForFlags(playlistsData.playlists || []);
    } catch (error) {
      showToast('error', `Failed to load data: ${error.message}`);
      if (onStatusChange) {
        onStatusChange('error', `Failed to load data: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const showToast = (type, message, onUndo = null) => {
    setToast({ type, message, onUndo });
    setTimeout(() => setToast(null), 3000);
  };

  const getTagUsageCount = useCallback((flagId) => {
    return playlistsForFlags.filter(p => p.flag_count > 0).length; // Simplified - would need API
  }, [playlistsForFlags]);

  const filteredPlaylists = useMemo(() => {
    if (!playlistSearch.trim()) return playlistsForFlags;
    const search = playlistSearch.toLowerCase();
    return playlistsForFlags.filter(p => 
      p.title.toLowerCase().includes(search) ||
      p.curator_name.toLowerCase().includes(search)
    );
  }, [playlistsForFlags, playlistSearch]);

  // Tag editor handlers with optimistic updates
  const handleAddCustomFlag = async () => {
    if (!newFlag.text.trim()) {
      showToast('error', 'Tag text is required');
      return;
    }

    const contrast = getContrastRatio(newFlag.color, newFlag.textColor);
    if (contrast < 4.5) {
      const proceed = window.confirm('Low contrast detected. This may not meet accessibility standards. Continue anyway?');
      if (!proceed) return;
    }

    const tempId = `temp-${Date.now()}`;
    const optimisticFlag = {
      id: tempId,
      text: newFlag.text,
      color: newFlag.color,
      text_color: newFlag.textColor,
      description: newFlag.description?.trim() || null,
      allow_self_assign: newFlag.allowSelfAssign ? 1 : 0
    };

    // Optimistic update
    setCustomFlags(prev => [...prev, optimisticFlag]);
    const flagToReset = { ...newFlag };
    
    setNewFlag({ 
      text: '', 
      color: '#000000', 
      textColor: '#ffffff', 
      description: '', 
      allowSelfAssign: false 
    });
    setCreationStep(1);
    setShowAdvanced(false);

    try {
      const payload = {
        text: flagToReset.text,
        color: flagToReset.color,
        textColor: flagToReset.textColor,
        description: flagToReset.description?.trim() || null,
        allow_self_assign: flagToReset.allowSelfAssign
      };
      const result = await adminPost('/api/v1/admin/site-admin/custom-flags', payload);
      
      // Replace optimistic with real
      setCustomFlags(prev => prev.filter(f => f.id !== tempId).concat(result));
      showToast('success', 'Content tag created');
      if (onStatusChange) {
        onStatusChange('success', 'Content tag created');
      }
    } catch (error) {
      // Revert optimistic update
      setCustomFlags(prev => prev.filter(f => f.id !== tempId));
      showToast('error', `Failed to create content tag: ${error.message}`);
      if (onStatusChange) {
        onStatusChange('error', `Failed to create content tag: ${error.message}`);
      }
    }
  };

  const handleRemoveCustomFlag = async (flagId) => {
    const flag = customFlags.find(f => f.id === flagId);
    if (!flag) return;

    setConfirmDialog({
      isOpen: true,
      title: 'Delete Content Tag',
      message: `Are you sure you want to delete "${flag.text}"? This action cannot be undone.`,
      onConfirm: async () => {
        // Optimistic update
        const removedFlag = flag;
        setCustomFlags(prev => prev.filter(f => f.id !== flagId));
        setConfirmDialog(null);

        // Add to undo stack
        setUndoStack(prev => [...prev, { action: 'delete', flag: removedFlag }]);

        try {
          await adminDelete(`/api/v1/admin/site-admin/custom-flags/${flagId}`);
          showToast('success', 'Content tag removed', () => {
            // Undo
            setCustomFlags(prev => [...prev, removedFlag]);
            setUndoStack(prev => prev.slice(0, -1));
          });
          if (onStatusChange) {
            onStatusChange('success', 'Content tag removed');
          }
        } catch (error) {
          // Revert
          setCustomFlags(prev => [...prev, removedFlag]);
          showToast('error', `Failed to remove content tag: ${error.message}`);
          if (onStatusChange) {
            onStatusChange('error', `Failed to remove content tag: ${error.message}`);
          }
        }
      },
      onClose: () => setConfirmDialog(null)
    });
  };

  const startEditTag = (flag) => {
    setEditingTagId(flag.id);
    setEditingTag({
      text: flag.text,
      color: flag.color || '#000000',
      textColor: flag.text_color || '#ffffff',
      description: flag.description || '',
      allowSelfAssign: flag.allow_self_assign === 1
    });
  };

  const cancelEditTag = () => {
    setEditingTagId(null);
    setEditingTag({ 
      text: '', 
      color: '#000000', 
      textColor: '#ffffff', 
      description: '', 
      allowSelfAssign: false 
    });
  };

  const handleUpdateCustomFlag = async () => {
    if (!editingTag.text.trim()) {
      showToast('error', 'Tag text is required');
      return;
    }

    const originalFlag = customFlags.find(f => f.id === editingTagId);
    if (!originalFlag) return;

    // Optimistic update
    setCustomFlags(prev => prev.map(f => 
      f.id === editingTagId 
        ? { ...f, text: editingTag.text, color: editingTag.color, text_color: editingTag.textColor, description: editingTag.description, allow_self_assign: editingTag.allowSelfAssign ? 1 : 0 }
        : f
    ));
    cancelEditTag();

    try {
      await adminPut(`/api/v1/admin/site-admin/custom-flags/${editingTagId}`, {
        text: editingTag.text,
        color: editingTag.color,
        textColor: editingTag.textColor,
        description: editingTag.description?.trim() || null,
        allow_self_assign: editingTag.allowSelfAssign
      });
      const flagsData = await adminGet('/api/v1/admin/site-admin/custom-flags');
      setCustomFlags(flagsData.flags || []);
      showToast('success', 'Content tag updated');
      if (onStatusChange) {
        onStatusChange('success', 'Content tag updated');
      }
    } catch (error) {
      // Revert
      setCustomFlags(prev => prev.map(f => f.id === editingTagId ? originalFlag : f));
      showToast('error', `Failed to update content tag: ${error.message}`);
      if (onStatusChange) {
        onStatusChange('error', `Failed to update content tag: ${error.message}`);
      }
    }
  };

  const handleTemplateSelect = (template) => {
    setNewFlag({
      text: template.text,
      color: template.color,
      textColor: template.textColor,
      description: template.description || '',
      allowSelfAssign: false
    });
    setCreationStep(2);
  };

  const handleColorPreset = (preset) => {
    setNewFlag(prev => ({
      ...prev,
      color: preset.bg,
      textColor: preset.text
    }));
  };

  // Playlist flag manager handlers with optimistic updates
  const handleSelectPlaylist = async (playlistId) => {
    try {
      const flagsData = await adminGet(`/api/v1/admin/site-admin/playlist-flags/${playlistId}`);
      setPlaylistFlags(flagsData.assignments || []);
      setSelectedPlaylist(playlistId);
    } catch (error) {
      showToast('error', `Failed to load playlist flags: ${error.message}`);
      if (onStatusChange) {
        onStatusChange('error', `Failed to load playlist flags: ${error.message}`);
      }
    }
  };

  const handleAssignFlag = async (playlistId, flagId) => {
    const flag = customFlags.find(f => f.id === flagId);
    if (!flag) return;

    // Optimistic update
    const optimisticAssignment = {
      id: `temp-${Date.now()}`,
      flag_id: flagId,
      text: flag.text,
      color: flag.color
    };
    setPlaylistFlags(prev => [...prev, optimisticAssignment]);
    await loadData(); // Update counts

    try {
      await adminPost('/api/v1/admin/site-admin/playlist-flags', { playlistId, flagId });
      const flagsData = await adminGet(`/api/v1/admin/site-admin/playlist-flags/${playlistId}`);
      setPlaylistFlags(flagsData.assignments || []);
      await loadData();
      showToast('success', 'Tag assigned to playlist');
      if (onStatusChange) {
        onStatusChange('success', 'Tag assigned to playlist');
      }
    } catch (error) {
      // Revert
      setPlaylistFlags(prev => prev.filter(a => a.id !== optimisticAssignment.id));
      showToast('error', `Failed to assign tag: ${error.message}`);
      if (onStatusChange) {
        onStatusChange('error', `Failed to assign tag: ${error.message}`);
      }
    }
  };

  const handleRemoveFlag = async (playlistId, flagId) => {
    const assignment = playlistFlags.find(a => a.flag_id === flagId);
    if (!assignment) return;

    // Optimistic update
    setPlaylistFlags(prev => prev.filter(a => a.flag_id !== flagId));
    await loadData();

    try {
      await adminDelete(`/api/v1/admin/site-admin/playlist-flags/${playlistId}/${flagId}`);
      const flagsData = await adminGet(`/api/v1/admin/site-admin/playlist-flags/${playlistId}`);
      setPlaylistFlags(flagsData.assignments || []);
      await loadData();
      showToast('success', 'Tag removed from playlist');
      if (onStatusChange) {
        onStatusChange('success', 'Tag removed from playlist');
      }
    } catch (error) {
      // Revert
      setPlaylistFlags(prev => [...prev, assignment]);
      showToast('error', `Failed to remove tag: ${error.message}`);
      if (onStatusChange) {
        onStatusChange('error', `Failed to remove tag: ${error.message}`);
      }
    }
  };

  // Bulk operations handlers
  const handleBulkAssignTag = async () => {
    if (selectedPlaylists.length === 0 || !bulkSelectedTag) {
      showToast('error', 'Select playlists and a tag');
      return;
    }

    if (selectedPlaylists.length > 100) {
      showToast('error', 'Maximum 100 playlists per bulk operation');
      return;
    }

    try {
      const result = await adminPost('/api/v1/admin/site-admin/playlist-flags/bulk', {
        playlist_ids: selectedPlaylists,
        flag_id: bulkSelectedTag
      });

      showToast('success', result.message || 'Tags assigned successfully');
      if (onStatusChange) {
        onStatusChange('success', result.message || 'Tags assigned successfully');
      }
      setSelectedPlaylists([]);
      setBulkSelectedTag('');
      await loadData();
    } catch (error) {
      showToast('error', `Bulk assignment failed: ${error.message}`);
      if (onStatusChange) {
        onStatusChange('error', `Bulk assignment failed: ${error.message}`);
      }
    }
  };

  const contrastRatio = useMemo(() => {
    if (!newFlag.color || !newFlag.textColor) return null;
    return getContrastRatio(newFlag.color, newFlag.textColor);
  }, [newFlag.color, newFlag.textColor]);

  if (loading) {
    return <div style={{ padding: theme.spacing.md, fontFamily: theme.fonts.mono }}>Loading...</div>;
  }

  return (
    <>
      <Container>
        {/* Tag Editor Section */}
        <SectionCard role="region" aria-labelledby="tag-editor-header">
          <SectionHeader id="tag-editor-header">Content Tags</SectionHeader>
          <HelperText>
            Create and manage content tags. Tags can be assigned to playlists to help categorize and feature them.
          </HelperText>

          {/* Progressive Disclosure - Step Indicator */}
          {creationStep > 1 && (
            <StepIndicator>
              <Step $completed={creationStep > 1}>1. Text</Step>
              <Step $active={creationStep === 2} $completed={creationStep > 2}>2. Colors</Step>
              <Step $active={creationStep === 3}>3. Details</Step>
            </StepIndicator>
          )}

          {/* Step 1: Tag Templates & Text */}
          {creationStep === 1 && (
            <>
              <LabelText htmlFor="tag-text">Tag Text</LabelText>
              <Input
                id="tag-text"
                type="text"
                placeholder="Enter tag text"
                value={newFlag.text}
                onChange={(e) => setNewFlag(prev => ({ ...prev, text: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newFlag.text.trim()) {
                    setCreationStep(2);
                  }
                }}
                aria-label="Tag text input"
                autoFocus
              />
              
              <HelperText>Or choose a template:</HelperText>
              <TemplateGrid>
                {TAG_TEMPLATES.map((template, idx) => (
                  <TemplateButton
                    key={idx}
                    onClick={() => handleTemplateSelect(template)}
                    aria-label={`Use template: ${template.text}`}
                  >
                    {template.text}
                  </TemplateButton>
                ))}
              </TemplateGrid>

              {newFlag.text.trim() && (
                <Button onClick={() => setCreationStep(2)} size="small" variant="primary">
                  Next: Choose Colors
                </Button>
              )}
            </>
          )}

          {/* Step 2: Colors */}
          {creationStep === 2 && (
            <>
              <LabelText>Tag Preview</LabelText>
              <TagPreview $bgColor={newFlag.color} $textColor={newFlag.textColor}>
                {newFlag.text || 'Preview'}
              </TagPreview>
              {contrastRatio && contrastRatio < 4.5 && (
                <ContrastWarning>
                  ⚠ Low contrast ratio ({contrastRatio.toFixed(2)}). WCAG AA requires at least 4.5:1.
                </ContrastWarning>
              )}

              <ColorRow>
                <div style={{ flex: 1 }}>
                  <ColorPickerLabel htmlFor="tag-bg-color">Background Color</ColorPickerLabel>
                  <ColorPicker
                    id="tag-bg-color"
                    value={newFlag.color}
                    onChange={(e) => setNewFlag(prev => ({ ...prev, color: e.target.value }))}
                    aria-label="Background color picker"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <ColorPickerLabel htmlFor="tag-text-color">Text Color</ColorPickerLabel>
                  <ColorPicker
                    id="tag-text-color"
                    value={newFlag.textColor}
                    onChange={(e) => setNewFlag(prev => ({ ...prev, textColor: e.target.value }))}
                    aria-label="Text color picker"
                  />
                </div>
              </ColorRow>

              <HelperText>Quick presets:</HelperText>
              <TemplateGrid>
                {COLOR_PRESETS.map((preset, idx) => (
                  <TemplateButton
                    key={idx}
                    onClick={() => handleColorPreset(preset)}
                    style={{
                      background: preset.bg,
                      color: preset.text,
                      borderColor: preset.bg
                    }}
                    aria-label={`Use color preset: ${preset.name}`}
                  >
                    {preset.name}
                  </TemplateButton>
                ))}
              </TemplateGrid>

              <div style={{ display: 'flex', gap: theme.spacing.sm }}>
                <Button onClick={() => setCreationStep(1)} size="small" variant="secondary">
                  Back
                </Button>
                <Button onClick={() => setCreationStep(3)} size="small" variant="primary">
                  Next: Details
                </Button>
              </div>
            </>
          )}

          {/* Step 3: Description & Advanced */}
          {creationStep === 3 && (
            <>
              <LabelText htmlFor="tag-description">Description (for public tag page)</LabelText>
              <TextArea
                id="tag-description"
                placeholder="Describe this tag for visitors on the public content tag page"
                value={newFlag.description || ''}
                onChange={(e) => setNewFlag(prev => ({ ...prev, description: e.target.value }))}
                aria-label="Tag description"
              />

              <CollapsibleSection>
                <CollapseToggle onClick={() => setShowAdvanced(!showAdvanced)} aria-expanded={showAdvanced}>
                  <span>Advanced Options</span>
                  <span>{showAdvanced ? '−' : '+'}</span>
                </CollapseToggle>
                {showAdvanced && (
                  <div style={{ marginTop: theme.spacing.md, padding: theme.spacing.md, border: theme.borders.dashed + ' rgba(0, 0, 0, 0.2)', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
                      <input
                        type="checkbox"
                        id="allow-self-assign"
                        checked={newFlag.allowSelfAssign || false}
                        onChange={(e) => setNewFlag(prev => ({ ...prev, allowSelfAssign: e.target.checked }))}
                        style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                        aria-label="Allow curators to self-assign"
                      />
                      <LabelText as="label" htmlFor="allow-self-assign" style={{ margin: 0, cursor: 'pointer' }}>
                        Allow curators to self-assign
                      </LabelText>
                    </div>
                  </div>
                )}
              </CollapsibleSection>

              <div style={{ display: 'flex', gap: theme.spacing.sm }}>
                <Button onClick={() => setCreationStep(2)} size="small" variant="secondary">
                  Back
                </Button>
                <Button onClick={handleAddCustomFlag} size="small" variant="primary">
                  Create Tag
                </Button>
              </div>
            </>
          )}

          {/* Tag List */}
          <CustomFlagsList role="list" aria-label="Content tags list">
            {customFlags.map(flag => (
              <OrderItem key={flag.id} role="listitem">
                {editingTagId === flag.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm, width: '100%' }}>
                    <InlineInput
                      type="text"
                      placeholder="Tag text"
                      value={editingTag.text}
                      onChange={(e) => setEditingTag(prev => ({ ...prev, text: e.target.value }))}
                      aria-label="Edit tag text"
                      autoFocus
                    />
                    <ColorRow>
                      <div style={{ display: 'flex', gap: theme.spacing.xs, alignItems: 'center', flex: 1 }}>
                        <ColorPickerLabel style={{ minWidth: 'auto' }}>BG:</ColorPickerLabel>
                        <ColorPicker
                          value={editingTag.color}
                          onChange={(e) => setEditingTag(prev => ({ ...prev, color: e.target.value }))}
                          aria-label="Edit background color"
                        />
                      </div>
                      <div style={{ display: 'flex', gap: theme.spacing.xs, alignItems: 'center', flex: 1 }}>
                        <ColorPickerLabel style={{ minWidth: 'auto' }}>Text:</ColorPickerLabel>
                        <ColorPicker
                          value={editingTag.textColor}
                          onChange={(e) => setEditingTag(prev => ({ ...prev, textColor: e.target.value }))}
                          aria-label="Edit text color"
                        />
                      </div>
                    </ColorRow>
                    <div style={{ display: 'flex', gap: theme.spacing.xs }}>
                      <Button size="small" onClick={handleUpdateCustomFlag}>Save</Button>
                      <Button size="small" variant="secondary" onClick={cancelEditTag}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, flex: 1 }}>
                      <TagBadge 
                        $bgColor={flag.color} 
                        $textColor={flag.text_color || '#000000'}
                        onClick={() => startEditTag(flag)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            startEditTag(flag);
                          }
                        }}
                        aria-label={`Edit tag: ${flag.text}`}
                      >
                        {flag.text}
                      </TagBadge>
                      {flag.allow_self_assign === 1 && (
                        <span style={{ 
                          fontSize: theme.fontSizes.tiny, 
                          color: theme.colors.black[400],
                          fontFamily: theme.fonts.mono
                        }}>
                          (self-assignable)
                        </span>
                      )}
                      <UsageCount>
                        {getTagUsageCount(flag.id)} uses
                      </UsageCount>
                    </div>
                    <div style={{ display: 'flex', gap: theme.spacing.xs }}>
                      <Button size="small" variant="secondary" onClick={() => startEditTag(flag)} aria-label={`Edit ${flag.text}`}>
                        Edit
                      </Button>
                      <Button 
                        variant="danger" 
                        size="small"
                        onClick={() => handleRemoveCustomFlag(flag.id)}
                        aria-label={`Delete ${flag.text}`}
                      >
                        Remove
                      </Button>
                    </div>
                  </>
                )}
              </OrderItem>
            ))}
          </CustomFlagsList>
        </SectionCard>

        {/* Playlist Flag Manager Section */}
        <SectionCard role="region" aria-labelledby="playlist-assignment-header">
          <SectionHeader id="playlist-assignment-header">Assign Tags to Playlists</SectionHeader>
          <HelperText>
            Select a playlist and assign content tags to it.
          </HelperText>

          <PlaylistFlagSection>
            <div>
              <SubSectionHeader>Playlists</SubSectionHeader>
              <SearchInput
                ref={searchInputRef}
                type="text"
                placeholder="Search playlists (Cmd/Ctrl+K)"
                value={playlistSearch}
                onChange={(e) => setPlaylistSearch(e.target.value)}
                aria-label="Search playlists"
              />
              <KeyboardHint>Press Cmd/Ctrl+K to focus search</KeyboardHint>
              <PlaylistList role="list" aria-label="Playlists list">
                {filteredPlaylists.length === 0 ? (
                  <EmptyState>No playlists found</EmptyState>
                ) : (
                  filteredPlaylists.map(playlist => (
                    <PlaylistItem 
                      key={playlist.id}
                      $selected={selectedPlaylist === playlist.id}
                      onClick={() => handleSelectPlaylist(playlist.id)}
                      role="listitem"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelectPlaylist(playlist.id);
                        }
                      }}
                      aria-label={`Select playlist: ${playlist.title}`}
                      aria-selected={selectedPlaylist === playlist.id}
                    >
                      <div className="title">{playlist.title}</div>
                      <div className="meta">
                        {playlist.curator_name} • {playlist.flag_count} tag{playlist.flag_count !== 1 ? 's' : ''}
                      </div>
                    </PlaylistItem>
                  ))
                )}
              </PlaylistList>
            </div>
            
            <div>
              <SubSectionHeader>
                {selectedPlaylist ? 'Tag Assignment' : 'Select a playlist'}
              </SubSectionHeader>
              {selectedPlaylist && (
                <HelperText style={{ marginBottom: theme.spacing.md }}>
                  Choose a tag below and click "Apply Tag".
                </HelperText>
              )}
              <FlagAssignmentPanel>
                {selectedPlaylist ? (
                  <>
                    <div>
                      <SubSectionHeader style={{ marginBottom: theme.spacing.sm }}>
                        Assigned Tags
                      </SubSectionHeader>
                      {playlistFlags.length > 0 ? (
                        <div role="list" aria-label="Assigned tags">
                          {playlistFlags.map(assignment => (
                            <AssignedFlagItem key={assignment.id} role="listitem">
                              <FlagIndicator>
                                <div 
                                  className="flag-color" 
                                  style={{ backgroundColor: assignment.color }}
                                  aria-hidden="true"
                                />
                                <div className="flag-text">{assignment.text}</div>
                              </FlagIndicator>
                              <Button 
                                size="small" 
                                variant="danger"
                                onClick={() => handleRemoveFlag(selectedPlaylist, assignment.flag_id)}
                                aria-label={`Remove tag ${assignment.text}`}
                              >
                                Remove
                              </Button>
                            </AssignedFlagItem>
                          ))}
                        </div>
                      ) : (
                        <EmptyState>No tags assigned</EmptyState>
                      )}
                    </div>
                    
                    <AvailableFlags>
                      <div className="header">Available Tags</div>
                      {customFlags
                        .filter(flag => !playlistFlags.find(pf => pf.flag_id === flag.id))
                        .length > 0 ? (
                        <div role="list" aria-label="Available tags">
                          {customFlags
                            .filter(flag => !playlistFlags.find(pf => pf.flag_id === flag.id))
                            .map(flag => (
                              <AvailableFlagItem key={flag.id} role="listitem">
                                <FlagIndicator>
                                  <div 
                                    className="flag-color" 
                                    style={{ backgroundColor: flag.color }}
                                    aria-hidden="true"
                                  />
                                  <div className="flag-text">{flag.text}</div>
                                </FlagIndicator>
                                <Button 
                                  size="small"
                                  onClick={() => handleAssignFlag(selectedPlaylist, flag.id)}
                                  aria-label={`Apply tag ${flag.text}`}
                                >
                                  Apply Tag
                                </Button>
                              </AvailableFlagItem>
                            ))}
                        </div>
                      ) : (
                        <EmptyState>All tags assigned</EmptyState>
                      )}
                    </AvailableFlags>
                  </>
                ) : (
                  <EmptyState>Select a playlist from the left to manage its tags</EmptyState>
                )}
              </FlagAssignmentPanel>
            </div>
          </PlaylistFlagSection>

          {/* Bulk Tag Operations */}
          <BulkOperationsSection>
            <SubSectionHeader>Bulk Tag Operations</SubSectionHeader>
            <HelperText>
              Select multiple playlists and assign a tag to all of them at once (max 100 per operation).
            </HelperText>

            <BulkControls>
              <Button
                size="small"
                variant="secondary"
                onClick={() => setSelectedPlaylists(filteredPlaylists.map(p => p.id))}
                aria-label="Select all playlists"
              >
                Select All
              </Button>
              <Button
                size="small"
                variant="secondary"
                onClick={() => setSelectedPlaylists([])}
                aria-label="Clear selection"
              >
                Clear Selection
              </Button>
              <BulkSelectionCount aria-live="polite">
                {selectedPlaylists.length} selected
              </BulkSelectionCount>
            </BulkControls>

            <PlaylistList style={{ marginBottom: theme.spacing.md, maxHeight: '300px' }} role="list" aria-label="Bulk selection playlists">
              {filteredPlaylists.map(playlist => (
                <div
                  key={playlist.id}
                  role="listitem"
                  style={{
                    padding: theme.spacing.md,
                    marginBottom: theme.spacing.xs,
                    border: theme.borders.dashed + ' ' + (selectedPlaylists.includes(playlist.id) ? theme.colors.black : 'transparent'),
                    background: selectedPlaylists.includes(playlist.id) ? 'rgba(0, 0, 0, 0.05)' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: theme.spacing.sm,
                    minHeight: theme.touchTarget.min,
                    borderRadius: '8px'
                  }}
                  onClick={() => {
                    setSelectedPlaylists(prev =>
                      prev.includes(playlist.id)
                        ? prev.filter(id => id !== playlist.id)
                        : [...prev, playlist.id]
                    );
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedPlaylists(prev =>
                        prev.includes(playlist.id)
                          ? prev.filter(id => id !== playlist.id)
                          : [...prev, playlist.id]
                      );
                    }
                  }}
                  tabIndex={0}
                  aria-label={`${selectedPlaylists.includes(playlist.id) ? 'Deselect' : 'Select'} playlist: ${playlist.title}`}
                  aria-checked={selectedPlaylists.includes(playlist.id)}
                >
                  <input
                    type="checkbox"
                    checked={selectedPlaylists.includes(playlist.id)}
                    onChange={() => {}}
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                    aria-label={`${selectedPlaylists.includes(playlist.id) ? 'Deselect' : 'Select'} ${playlist.title}`}
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

            <BulkTagSelector>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <LabelText htmlFor="bulk-tag-select">Tag to Apply</LabelText>
                <Select
                  id="bulk-tag-select"
                  value={bulkSelectedTag}
                  onChange={(e) => setBulkSelectedTag(e.target.value)}
                  aria-label="Select tag to apply"
                >
                  <option value="">-- Select a tag --</option>
                  {customFlags.map(flag => (
                    <option key={flag.id} value={flag.id}>
                      {flag.text}
                    </option>
                  ))}
                </Select>
              </div>
              <div style={{ alignSelf: 'flex-end' }}>
                <Button
                  variant="primary"
                  size="small"
                  onClick={handleBulkAssignTag}
                  disabled={selectedPlaylists.length === 0 || !bulkSelectedTag}
                  aria-label={`Apply tag to ${selectedPlaylists.length} selected playlists`}
                >
                  Apply Tag to Selected
                </Button>
              </div>
            </BulkTagSelector>
          </BulkOperationsSection>
        </SectionCard>
      </Container>

      {/* Toast Notification */}
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onUndo={toast.onUndo}
          onClose={() => setToast(null)}
        />
      )}

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <ConfirmationDialog
          isOpen={confirmDialog.isOpen}
          onClose={confirmDialog.onClose}
          onConfirm={confirmDialog.onConfirm}
          title={confirmDialog.title}
          message={confirmDialog.message}
        />
      )}
    </>
  );
};

export default ContentTagManager;
