import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { theme, Input, Button } from '@shared/styles/GlobalStyles';
import {
  PlaylistDetailsLayout,
  DetailsSection,
  DetailsSectionHeader,
  DetailsSectionTitle,
  DetailsSectionSubtitle,
  DetailsSectionBody,
  DetailsFieldRow,
  DetailsField,
  FieldLabel,
  FieldHint,
  FieldError,
  FieldMeta,
  FieldSelect,
  ChipRow,
  Chip,
  ChipButton,
  ChipRemove,
  DetailsNote,
} from '@shared/components/PlaylistDetailsLayout.jsx';
import { adminGet, adminPost, adminPut, adminDelete } from '../../admin/utils/adminApi.js';
import { useGenreCatalog } from '@shared/hooks/useGenreCatalog';
import { createGenreLookup, parseGenreTags } from '@shared/utils/genreUtils';
import { useAuth } from '@shared/contexts/AuthContext';
import { safeJson } from '@shared/utils/jsonUtils';
import RichTextEditor from '../../curator/components/RichTextEditor.jsx';
import PlaylistCustomActionEditor from './PlaylistCustomActionEditor.jsx';
import ImportModal from '../../curator/components/ImportModal.jsx';

const CharacterCount = styled(FieldMeta)`
  text-align: right;
`;

const SelectionPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm};
  background: ${theme.colors.white};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.08);
  border-radius: 12px;
`;

const GenreInputRow = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  align-items: center;
  flex-wrap: wrap;
`;

const GenreInput = styled.input`
  flex: 1;
  min-width: 200px;
  padding: 10px 12px;
  border: ${theme.borders.solidThin} ${theme.colors.black};
  background: ${theme.colors.white};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  border-radius: 10px;
  transition: border-color ${theme.transitions.fast}, box-shadow ${theme.transitions.fast};

  &:focus {
    border-color: ${theme.colors.primary};
    box-shadow: 0 0 0 2px rgba(49, 130, 206, 0.15);
    outline: none;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const AddGenreButton = styled(Button)`
  padding: 10px 14px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const MetaLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${theme.colors.black[600]};
`;

const ScheduleActionRow = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  align-items: center;
  flex-wrap: wrap;
`;

const ToggleRow = styled.label`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: 10px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  background: rgba(0, 0, 0, 0.03);
  min-height: ${theme.touchTarget.min};
`;

const ToggleText = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${theme.colors.black};
`;

const ToggleInput = styled.input.attrs({ type: 'checkbox' })`
  width: 20px;
  height: 20px;
  cursor: pointer;
`;

const ScheduleMeta = styled(FieldMeta)`
  color: ${theme.colors.black[600]};
`;

const ScheduleHistory = styled.div`
  margin-top: ${theme.spacing.lg};
  border-top: ${theme.borders.dashedThin} ${theme.colors.gray[300]};
  padding-top: ${theme.spacing.md};
  display: grid;
  gap: ${theme.spacing.sm};
`;

const HistoryList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  
  display: grid;
  gap: ${theme.spacing.xs};
`;

const HistoryItem = styled.li.withConfig({ shouldForwardProp: (prop) => !['$status'].includes(prop) })`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xxs};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border: ${theme.borders.dashedThin} ${theme.colors.black[300]};
  background: ${({ $status }) => ($status === 'failed' ? 'rgba(229, 62, 62, 0.12)' : 'rgba(15, 14, 23, 0.05)')};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
`;

const HistoryMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xxs};
  color: ${theme.colors.black[600]};
`;

const HistoryError = styled(HistoryMeta)`
  color: ${theme.colors.danger};
`;

const ScheduleModal = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${theme.spacing.md};

  @media (max-width: ${theme.breakpoints.mobile}) {
    padding: ${theme.spacing.sm};
    align-items: flex-start;
    padding-top: ${theme.spacing.xl};
  }
`;

const ScheduleModalContent = styled.div`
  background: ${theme.colors.white};
  color: ${theme.colors.black};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  width: 95%;
  max-width: 720px;
  max-height: 90vh;
  overflow: auto;
  padding: ${theme.spacing.lg};
  border-radius: 12px;
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.16);

  @media (max-width: ${theme.breakpoints.mobile}) {
    width: 100%;
    max-width: 100%;
    padding: ${theme.spacing.md};
    max-height: calc(100vh - ${theme.spacing.xl} * 2);
    border-radius: 8px;
  }
`;

const ScheduleModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${theme.spacing.md};
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;

  h3 {
    margin: 0;
    font-family: ${theme.fonts.mono};
    text-transform: uppercase;
    font-size: ${theme.fontSizes.medium};

    @media (max-width: ${theme.breakpoints.mobile}) {
      font-size: ${theme.fontSizes.small};
    }
  }
`;

const ScheduleModalActions = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  margin-top: ${theme.spacing.sm};
  flex-wrap: wrap;

  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column;

    button {
      width: 100%;
      min-height: 44px;
    }
  }
`;

const ScheduleSourcePicker = styled.div`
  border: ${theme.borders.dashedThin} ${theme.colors.black[300]};
  padding: ${theme.spacing.sm};
  margin-top: ${theme.spacing.sm};
  border-radius: 8px;
  background: rgba(15, 14, 23, 0.04);
  display: grid;
  gap: ${theme.spacing.xs};
`;

const PickerHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${theme.spacing.sm};
`;

const PlaylistForm = ({ 
  playlist, 
  onChange, 
  disabled = false,
  curatorMode = false,
  forceCurator = null,
  hideStreamingUrls = false,
  hideScheduleBlock = false,
  errors = {},
}) => {
  const [curators, setCurators] = useState([]);
  const [isLoadingCurators, setIsLoadingCurators] = useState(false);
  const [schedule, setSchedule] = useState(null);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleStatus, setScheduleStatus] = useState('');
  const [scheduleRuns, setScheduleRuns] = useState([]);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);
  const [scheduleRunsError, setScheduleRunsError] = useState(null);
  const [showScheduleSourcePicker, setShowScheduleSourcePicker] = useState(false);

  // Genre-related state
  const [selectedTags, setSelectedTags] = useState([]);
  const [customTagInput, setCustomTagInput] = useState('');

  // Ref to prevent circular updates between selectedTags and playlist.tags
  const isUpdatingFromPlaylist = useRef(false);

  // Content flags state
  const [availableFlags, setAvailableFlags] = useState([]);
  const [selectedFlags, setSelectedFlags] = useState([]);
  const [isLoadingFlags, setIsLoadingFlags] = useState(false);

  // Genre catalog integration
  const { catalog: genreCatalog } = useGenreCatalog();
  const genreLookup = useMemo(() => createGenreLookup(genreCatalog || []), [genreCatalog]);

  // Available genres from catalog
  const availableGenres = useMemo(() => {
    return (genreCatalog || []).map(category => ({
      value: category.id || '',
      label: category.label || category.id,
      color: category.color || '#8a8a8a',
      source: 'catalog'
    }));
  }, [genreCatalog]);

  // Helper function to find genre info
  const findGenreInfo = useCallback((tag) => {
    const genre = (availableGenres || []).find(g => g && (g.value === tag || g.label === tag));
    return genre || {
      value: tag,
      label: tag,
      color: '#8a8a8a'
    };
  }, [availableGenres]);

  // Compute genre suggestions based on input
  const genreSuggestions = useMemo(() => {
    const normalizedInput = (customTagInput || '').trim().toLowerCase();
    if (!normalizedInput || selectedTags.length >= 3) return [];

    return (availableGenres || [])
      .filter(option => {
        if (!option) return false;
        const value = (option.value || '').toLowerCase();
        const label = (option.label || value).toLowerCase();
        const matches = label.includes(normalizedInput) || value.includes(normalizedInput);
        const alreadySelected = (selectedTags || []).some(selected =>
          selected && (selected === option.value || selected === option.label)
        );
        return matches && !alreadySelected;
      })
      .slice(0, 6);
  }, [availableGenres, customTagInput, selectedTags]);

  // Handle adding a genre
  const handleAddGenre = useCallback(() => {
    const input = customTagInput?.trim();
    if (!input || selectedTags.length >= 3) return;

    // Check if it's already selected
    const alreadySelected = selectedTags.some(tag =>
      tag && tag.toLowerCase() === input.toLowerCase()
    );
    if (alreadySelected) {
      setCustomTagInput('');
      return;
    }

    setSelectedTags(prev => [...prev, input]);
    setCustomTagInput('');
  }, [customTagInput, selectedTags]);

  // Handle selecting a suggested genre
  const handleSelectSuggestion = useCallback((genreValue) => {
    if (selectedTags.length >= 3) return;

    const alreadySelected = selectedTags.some(tag =>
      tag && tag.toLowerCase() === genreValue.toLowerCase()
    );
    if (alreadySelected) return;

    setSelectedTags(prev => [...prev, genreValue]);
    setCustomTagInput('');
  }, [selectedTags]);

  // Sync selectedTags with playlist.tags when playlist changes
  useEffect(() => {
    const tags = parseGenreTags(playlist?.tags);
    // Only update selectedTags if they're actually different to prevent circular updates
    if (JSON.stringify(tags) !== JSON.stringify(selectedTags)) {
      isUpdatingFromPlaylist.current = true;
      setSelectedTags(tags);
      // Reset the flag after state update completes
      setTimeout(() => {
        isUpdatingFromPlaylist.current = false;
      }, 0);
    }
  }, [playlist?.tags]); // Removed selectedTags from dependency to prevent circular updates

  // Update playlist.tags when selectedTags change (but not when updating from playlist)
  useEffect(() => {
    // Skip update if we're currently syncing from playlist.tags to avoid circular updates
    if (isUpdatingFromPlaylist.current) return;

    const tagsString = selectedTags.join(',');
    if (tagsString !== (playlist?.tags || '')) {
      onChange({
        ...playlist,
        tags: tagsString
      });
    }
  }, [selectedTags, playlist, onChange]);

  const handleInputChange = (field, value) => {
    onChange({
      ...playlist,
      [field]: value
    });
  };

  const handleCustomActionChange = useCallback((updates) => {
    onChange({
      ...playlist,
      ...updates
    });
  }, [onChange, playlist]);

  const handleCuratorChange = (curatorId) => {
    const selectedCurator = curators.find(c => c.id === parseInt(curatorId, 10));
    if (selectedCurator) {
      onChange({
        ...playlist,
        curator_id: selectedCurator.id,
        curator_name: selectedCurator.name,
        curator_type: selectedCurator.profile_type
      });
    }
  };

  // Load curators on component mount (skip when curatorMode is true)
  useEffect(() => {
    if (curatorMode) {
      if (forceCurator) {
        onChange({
          ...playlist,
          curator_id: forceCurator.id,
          curator_name: forceCurator.name,
          curator_type: forceCurator.profile_type || forceCurator.curator_type || 'artist',
        });
      }
      return;
    }

    const fetchCurators = async () => {
      setIsLoadingCurators(true);
      try {
        const response = await fetch('/api/v1/curators', { credentials: 'include' });
        if (response.ok) {
          const data = await response.json();
          setCurators(data.success ? data.data : []);
        } else {
          console.error('Failed to fetch curators');
        }
      } catch (error) {
        console.error('Error fetching curators:', error);
      } finally {
        setIsLoadingCurators(false);
      }
    };

    fetchCurators();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curatorMode, forceCurator?.id]);

  // Get authenticatedFetch for curator mode
  const { authenticatedFetch } = useAuth();

  // Load available content flags on mount
  useEffect(() => {
    const fetchAvailableFlags = async () => {
      setIsLoadingFlags(true);
      try {
        if (curatorMode) {
          // Use curator API endpoint for self-assignable tags
          const response = await authenticatedFetch('/api/v1/curator/available-tags', { method: 'GET' });
          const json = await safeJson(response, { context: 'Load available content tags' });
          if (response.ok && json.success) {
            const tags = Array.isArray(json.tags) ? json.tags : [];
            setAvailableFlags(tags);
            if (tags.length === 0) {
              console.warn('[PlaylistForm] No content tags available for self-assignment');
            }
          } else {
            console.error('[PlaylistForm] Failed to load content tags:', json.error || json.message || 'Unknown error');
            setAvailableFlags([]);
          }
        } else {
          // Use admin API endpoint for all tags
          const response = await adminGet('/api/v1/admin/site-admin/custom-flags');
          const flags = Array.isArray(response.flags) ? response.flags : [];
          setAvailableFlags(flags);
        }
      } catch (error) {
        console.error('[PlaylistForm] Error fetching available flags:', error);
        setAvailableFlags([]);
      } finally {
        setIsLoadingFlags(false);
      }
    };

    fetchAvailableFlags();
  }, [curatorMode, authenticatedFetch]);

  // Load playlist's current content flags
  useEffect(() => {
    const fetchPlaylistFlags = async () => {
      if (!playlist?.id) {
        setSelectedFlags([]);
        return;
      }

      try {
        if (curatorMode) {
          // For curators, use flags from playlist object if available, otherwise fetch
          if (Array.isArray(playlist.flags) && playlist.flags.length > 0) {
            // Use flags from playlist object (already loaded)
            setSelectedFlags(playlist.flags.map(flag => ({
              id: flag.id,
              flag_id: flag.id,
              text: flag.text,
              color: flag.color,
              text_color: flag.text_color
            })));
          } else {
            // If no flags in playlist object, try to get them from available tags
            // We'll only show tags that are in the available list (self-assignable)
            setSelectedFlags([]);
          }
        } else {
          // Use admin API endpoint
          const response = await adminGet(`/api/v1/admin/site-admin/playlist-flags/${playlist.id}`);
          setSelectedFlags(response.assignments || []);
        }
      } catch (error) {
        console.error('Error fetching playlist flags:', error);
        setSelectedFlags([]);
      }
    };

    fetchPlaylistFlags();
  }, [playlist?.id, playlist?.flags, curatorMode, authenticatedFetch]);

  // Load existing scheduled import for this playlist
  useEffect(() => {
    const loadSchedule = async () => {
      if (!playlist?.id) return;
      setIsLoadingSchedule(true);
      setScheduleError(null);
      try {
        const data = await adminGet(`/api/v1/playlist-actions/schedules?playlistId=${playlist.id}`);
        const rows = Array.isArray(data.data) ? data.data : [];
        setSchedule(prev => {
          const next = rows[0] || null;
          if (!next) return null;
          if (prev?.source_title && !next.source_title) {
            return { ...next, source_title: prev.source_title };
          }
          return next;
        });
      } catch (e) {
        setScheduleError(e.message || 'Failed to load schedule');
      } finally {
        setIsLoadingSchedule(false);
      }
    };
    loadSchedule();
  }, [playlist?.id]);

  const loadScheduleRuns = useCallback(async (targetId = schedule?.id, { showSpinner = true } = {}) => {
    if (!targetId) return;
    if (showSpinner) setIsLoadingRuns(true);
    setScheduleRunsError(null);
    try {
      const res = await adminGet(`/api/v1/playlist-actions/schedules/${targetId}/runs?limit=5`);
      const rows = Array.isArray(res.data) ? res.data : [];
      setScheduleRuns(rows);
    } catch (e) {
      setScheduleRunsError(e.message || 'Failed to load run history');
      if (!showSpinner) throw e;
    } finally {
      if (showSpinner) setIsLoadingRuns(false);
    }
  }, [schedule?.id]);

  useEffect(() => {
    if (showScheduleModal && schedule?.id) {
      loadScheduleRuns(schedule.id);
    }
  }, [showScheduleModal, schedule?.id, loadScheduleRuns]);

  useEffect(() => {
    if (!showScheduleModal) {
      setScheduleStatus('');
      setScheduleRunsError(null);
      setShowScheduleSourcePicker(false);
    }
  }, [showScheduleModal]);

  const defaultSched = (pid) => ({
    playlist_id: pid,
    source: 'spotify',
    mode: 'append',
    wip_spotify_playlist_id: '',
    frequency: 'daily',
    frequency_value: '',
    time_utc: '09:00',
    status: 'active'
  });

  const updateLocalSchedule = (field, value) => {
    setSchedule(prev => ({ ...(prev || defaultSched(playlist.id)), [field]: value }));
    setScheduleStatus('');
    setScheduleRunsError(null);
  };

  const saveSchedule = async () => {
    if (!playlist?.id) return;
    setIsLoadingSchedule(true);
    setScheduleError(null);
    setScheduleStatus('');
    try {
      if (!schedule?.id) {
        const payload = {
          ...(schedule || defaultSched(playlist.id)),
          playlist_id: playlist.id,
          wip_spotify_playlist_id: schedule?.wip_spotify_playlist_id || null,
          frequency_value: schedule?.frequency_value || null
        };
        const res = await adminPost('/api/v1/playlist-actions/schedules', payload);
        const created = res.data;
        setSchedule(created);
        setScheduleRuns([]);
        setScheduleStatus('Schedule created');
        if (created?.id) {
          loadScheduleRuns(created.id, { showSpinner: false }).catch(() => {});
        }
      } else {
        const payload = {
          mode: schedule.mode,
          wip_spotify_playlist_id: schedule.wip_spotify_playlist_id || null,
          frequency: schedule.frequency,
          frequency_value: schedule.frequency_value || null,
          time_utc: schedule.time_utc,
          status: schedule.status
        };
        const res = await adminPut(`/api/v1/playlist-actions/schedules/${schedule.id}`, payload);
        setSchedule(res.data);
        setScheduleStatus('Schedule updated');
        loadScheduleRuns(schedule.id, { showSpinner: false }).catch(() => {});
      }
    } catch (e) {
      setScheduleError(e.message || 'Failed to save schedule');
    } finally {
      setIsLoadingSchedule(false);
    }
  };

  const deleteSchedule = async () => {
    if (!schedule?.id) return setSchedule(null);
    if (!confirm('Delete scheduled import for this playlist?')) return;
    setIsLoadingSchedule(true);
    setScheduleError(null);
    setScheduleStatus('');
    try {
      await adminDelete(`/api/v1/playlist-actions/schedules/${schedule.id}`);
      setSchedule(null);
      setScheduleRuns([]);
      setScheduleStatus('Schedule removed');
    } catch (e) {
      setScheduleError(e.message || 'Failed to delete schedule');
    } finally {
      setIsLoadingSchedule(false);
    }
  };

  const runNow = async () => {
    if (!schedule?.id) return;
    setIsLoadingSchedule(true);
    setScheduleError(null);
    setScheduleStatus('');
    try {
      await adminPost(`/api/v1/playlist-actions/schedules/${schedule.id}/run-now`, {});
      setScheduleStatus('Import started. Refresh run history after a moment.');
      setTimeout(() => {
        loadScheduleRuns(schedule.id, { showSpinner: false }).catch(() => {});
      }, 1500);
    } catch (e) {
      setScheduleError(e.message || 'Failed to start run');
    } finally {
      setIsLoadingSchedule(false);
    }
  };

  // Content flag handlers
  const handleToggleFlag = async (flag) => {
    if (!playlist?.id) return;

    const isSelected = selectedFlags.some(f => f.id === flag.id || f.flag_id === flag.id);

    try {
      if (isSelected) {
        // Remove flag
        if (curatorMode) {
          const response = await authenticatedFetch(`/api/v1/curator/playlist-tags/${playlist.id}/${flag.id}`, {
            method: 'DELETE'
          });
          if (!response.ok) {
            const json = await response.json();
            throw new Error(json.error || 'Failed to remove tag');
          }
        } else {
          await adminDelete(`/api/v1/admin/site-admin/playlist-flags/${playlist.id}/${flag.id}`);
        }
        setSelectedFlags(prev => prev.filter(f => f.id !== flag.id && f.flag_id !== flag.id));
      } else {
        // Assign flag
        if (curatorMode) {
          const response = await authenticatedFetch('/api/v1/curator/playlist-tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playlist_id: playlist.id, tag_id: flag.id })
          });
          const json = await response.json();
          if (!response.ok || !json.success) {
            throw new Error(json.error || 'Failed to assign tag');
          }
        } else {
          await adminPost('/api/v1/admin/site-admin/playlist-flags', {
            playlistId: playlist.id,
            flagId: flag.id
          });
        }
        // Add the full flag object to selectedFlags
        setSelectedFlags(prev => [...prev, { ...flag, flag_id: flag.id, id: flag.id }]);
      }
    } catch (error) {
      console.error('Error toggling flag:', error);
      // Optionally show error to user
    }
  };

  return (
    <PlaylistDetailsLayout>
    {/*  <DetailsNote>
        Remember you can edit this or come back to it later.
      </DetailsNote> */}

      <DetailsSection>
        <DetailsSectionHeader>
          <DetailsSectionTitle>Playlist Basics</DetailsSectionTitle>
          <DetailsSectionSubtitle>Core metadata shown to listeners and curators.</DetailsSectionSubtitle>
        </DetailsSectionHeader>
        <DetailsSectionBody>
          <DetailsFieldRow>
            <DetailsField>
              <FieldLabel htmlFor="title" $required>Title</FieldLabel>
              <Input
                id="title"
                type="text"
                value={playlist.title || ''}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Enter playlist title"
                disabled={disabled}
                maxLength={200}
              />
              {errors?.title && <FieldError>{errors.title}</FieldError>}
              <CharacterCount>
                {(playlist.title || '').length}/200
              </CharacterCount>
            </DetailsField>
            <DetailsField>
              <FieldLabel htmlFor="description_short">Short Description</FieldLabel>
              <Input
                id="description_short"
                type="text"
                value={playlist.description_short || ''}
                onChange={(e) => handleInputChange('description_short', e.target.value)}
                placeholder="Brief one-line description"
                disabled={disabled}
                maxLength={200}
              />
              <FieldHint>One line teaser used in cards and exports.</FieldHint>
              <CharacterCount>
                {(playlist.description_short || '').length}/200
              </CharacterCount>
            </DetailsField>
          </DetailsFieldRow>
        </DetailsSectionBody>
      </DetailsSection>

      <DetailsSection>
        <DetailsSectionHeader>
          <DetailsSectionTitle>Genres &amp; Content Tags</DetailsSectionTitle>
          <DetailsSectionSubtitle>Use tight tags so discovery stays consistent.</DetailsSectionSubtitle>
        </DetailsSectionHeader>
        <DetailsSectionBody>
          <DetailsFieldRow>
            <DetailsField>
              <FieldLabel htmlFor="genres">Genres (max 3)</FieldLabel>
              <SelectionPanel>
                <GenreInputRow>
                  <GenreInput
                    type="text"
                    placeholder="Search or add genre"
                    value={customTagInput}
                    onChange={(e) => setCustomTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddGenre();
                      }
                    }}
                    disabled={disabled || selectedTags.length >= 3}
                  />
                  <AddGenreButton
                    type="button"
                    onClick={handleAddGenre}
                    disabled={disabled || !customTagInput.trim() || selectedTags.length >= 3}
                    variant="secondary"
                  >
                    Add
                  </AddGenreButton>
                </GenreInputRow>

                {genreSuggestions.length > 0 && (
                  <ChipRow>
                    <MetaLabel>Suggestions</MetaLabel>
                    {genreSuggestions.map((option, index) => (
                      <ChipButton
                        key={option.value || index}
                        type="button"
                        onClick={() => handleSelectSuggestion(option.value)}
                        $tone={option.color || theme.colors.black[600]}
                        $variant="outline"
                      >
                        {option.label}
                      </ChipButton>
                    ))}
                  </ChipRow>
                )}

                {selectedTags.length > 0 ? (
                  <ChipRow>
                    {selectedTags.map((tag, index) => {
                      if (!tag) return null;
                      const genreInfo = findGenreInfo(tag);
                      return (
                        <Chip
                          key={tag || index}
                          $tone={genreInfo?.color || theme.colors.primary}
                          $variant="outline"
                        >
                          {genreInfo?.label || tag}
                          <ChipRemove
                            type="button"
                            onClick={() => setSelectedTags(prev => prev.filter(t => t !== tag))}
                            aria-label={`Remove ${genreInfo?.label || tag}`}
                            disabled={disabled}
                          >
                            ×
                          </ChipRemove>
                        </Chip>
                      );
                    })}
                  </ChipRow>
                ) : (
                  <FieldHint>
                    Add up to 3 genre tags to help users discover this playlist. Type to search existing genres or create new ones.
                  </FieldHint>
                )}
              </SelectionPanel>
            </DetailsField>

            <DetailsField>
              <FieldLabel htmlFor="content_flags">Content Tags / Flags</FieldLabel>
              <SelectionPanel>
                {isLoadingFlags ? (
                  <FieldHint>Loading content tags...</FieldHint>
                ) : availableFlags.length === 0 ? (
                  <FieldHint>
                    {curatorMode 
                      ? 'No content tags available for self-assignment. Contact admin to enable tags.' 
                      : 'No content tags available. Contact admin to create tags.'}
                  </FieldHint>
                ) : (
                  <>
                    <ChipRow>
                      {availableFlags.map((flag) => {
                        const isSelected = selectedFlags.some(f => f.id === flag.id || f.flag_id === flag.id);
                        return (
                          <ChipButton
                            key={flag.id}
                            type="button"
                            onClick={() => handleToggleFlag(flag)}
                            disabled={disabled || !playlist?.id}
                            $tone={flag.color || theme.colors.primary}
                            $textTone={flag.text_color || theme.colors.white}
                            $selected={isSelected}
                            $variant="outline"
                          >
                            {flag.text}
                          </ChipButton>
                        );
                      })}
                    </ChipRow>

                    {selectedFlags.length > 0 && (
                      <>
                        <MetaLabel>Selected</MetaLabel>
                        <ChipRow>
                          {selectedFlags.map((flag) => (
                            <Chip
                              key={flag.id}
                              $tone={flag.color || theme.colors.primary}
                              $variant="solid"
                            >
                              {flag.text}
                              <ChipRemove
                                type="button"
                                onClick={() => handleToggleFlag(flag)}
                                aria-label={`Remove ${flag.text}`}
                                disabled={disabled}
                              >
                                ×
                              </ChipRemove>
                            </Chip>
                          ))}
                        </ChipRow>
                      </>
                    )}

                    {selectedFlags.length === 0 && (
                      <FieldHint>
                        Click tags above to assign them to this playlist. Content tags help categorize and feature playlists.
                      </FieldHint>
                    )}
                  </>
                )}
                {!playlist?.id && (
                  <FieldError>Save the playlist first to assign content tags.</FieldError>
                )}
              </SelectionPanel>
            </DetailsField>
          </DetailsFieldRow>
        </DetailsSectionBody>
      </DetailsSection>

      <DetailsSection>
        <DetailsSectionHeader>
          <DetailsSectionTitle>Full Description</DetailsSectionTitle>
          <DetailsSectionSubtitle>Use a longer narrative to explain the playlist and context.</DetailsSectionSubtitle>
        </DetailsSectionHeader>
        <DetailsSectionBody>
          <DetailsField>
            <FieldLabel htmlFor="description">Full Description</FieldLabel>
            <RichTextEditor
              value={playlist.description || ''}
              onChange={(html) => handleInputChange('description', html)}
              placeholder="Detailed description of the playlist, its inspiration, and context..."
            />
            <CharacterCount>
              {(playlist.description || '').length}/2000 characters
            </CharacterCount>
          </DetailsField>
        </DetailsSectionBody>
      </DetailsSection>

      <DetailsSection>
        <DetailsSectionHeader>
          <DetailsSectionTitle>Content Context CTA</DetailsSectionTitle>
          <DetailsSectionSubtitle>Create a button with your own branding that links back to related content.</DetailsSectionSubtitle>
        </DetailsSectionHeader>
        <PlaylistCustomActionEditor
          value={{
            label: playlist.custom_action_label || '',
            url: playlist.custom_action_url || '',
            icon: playlist.custom_action_icon || '',
            iconSource: playlist.custom_action_icon_source || ''
          }}
          onChange={handleCustomActionChange}
          disabled={disabled}
        />
      </DetailsSection>

      {!curatorMode && (
        <DetailsSection>
          <DetailsSectionHeader>
            <DetailsSectionTitle>Curator Applications</DetailsSectionTitle>
            <DetailsSectionSubtitle>Allow listeners to apply to curate through this playlist.</DetailsSectionSubtitle>
          </DetailsSectionHeader>
          <DetailsSectionBody>
            <DetailsField>
              <ToggleRow>
                <ToggleText>Enable auto-referral CTA</ToggleText>
                <ToggleInput
                  checked={Boolean(playlist.auto_referral_enabled)}
                  onChange={(e) => handleInputChange('auto_referral_enabled', e.target.checked)}
                  disabled={disabled}
                />
              </ToggleRow>
              <FieldHint>
                When enabled, the link-out banner will send listeners to curator signup and skip manual referral entry.
              </FieldHint>
            </DetailsField>
          </DetailsSectionBody>
        </DetailsSection>
      )}

      {!hideStreamingUrls && (
        <DetailsSection>
          <DetailsSectionHeader>
            <DetailsSectionTitle>Playlist DSP Links</DetailsSectionTitle>
            <DetailsSectionSubtitle>You can leave these empty and/or export later.</DetailsSectionSubtitle>
          </DetailsSectionHeader>

          <DetailsSectionBody>
            <DetailsFieldRow>
              <DetailsField>
                <FieldLabel htmlFor="spotify_url">Spotify Playlist URL</FieldLabel>
                <Input
                  id="spotify_url"
                  type="url"
                  value={playlist.spotify_url || ''}
                  onChange={(e) => handleInputChange('spotify_url', e.target.value)}
                  placeholder="https://open.spotify.com/playlist/..."
                  disabled={disabled}
                />
              </DetailsField>

              <DetailsField>
                <FieldLabel htmlFor="apple_url">Apple Music Playlist URL</FieldLabel>
                <Input
                  id="apple_url"
                  type="url"
                  value={playlist.apple_url || ''}
                  onChange={(e) => handleInputChange('apple_url', e.target.value)}
                  placeholder="https://music.apple.com/playlist/..."
                  disabled={disabled}
                />
              </DetailsField>

              <DetailsField>
                <FieldLabel htmlFor="tidal_url">Tidal Playlist URL</FieldLabel>
                <Input
                  id="tidal_url"
                  type="url"
                  value={playlist.tidal_url || ''}
                  onChange={(e) => handleInputChange('tidal_url', e.target.value)}
                  placeholder="https://tidal.com/browse/playlist/..."
                  disabled={disabled}
                />
              </DetailsField>

              <DetailsField>
                <FieldLabel htmlFor="soundcloud_url">SoundCloud Playlist URL</FieldLabel>
                <Input
                  id="soundcloud_url"
                  type="url"
                  value={playlist.soundcloud_url || ''}
                  onChange={(e) => handleInputChange('soundcloud_url', e.target.value)}
                  placeholder="https://soundcloud.com/..."
                  disabled={disabled}
                />
              </DetailsField>
            </DetailsFieldRow>
          </DetailsSectionBody>
        </DetailsSection>
      )}

      {!hideScheduleBlock && (
        <DetailsSection>
          <DetailsSectionHeader>
            <DetailsSectionTitle>Automation / Schedule</DetailsSectionTitle>
            <DetailsSectionSubtitle>Import tracks from Spotify on a schedule.</DetailsSectionSubtitle>
          </DetailsSectionHeader>
          <DetailsSectionBody>
            {scheduleError && (
              <FieldError>{scheduleError}</FieldError>
            )}
            <ScheduleActionRow>
              <Button onClick={() => setShowScheduleModal(true)} disabled={!playlist?.id}>Configure</Button>
              {schedule?.next_run_at && (
                <ScheduleMeta>
                  Next run: {new Date(schedule.next_run_at).toLocaleString()}
                </ScheduleMeta>
              )}
            </ScheduleActionRow>

            {showScheduleModal && (
              <ScheduleModal onClick={() => setShowScheduleModal(false)}>
                <ScheduleModalContent onClick={(e)=>e.stopPropagation()}>
                  <ScheduleModalHeader>
                    <h3>Scheduled Import</h3>
                    <Button onClick={() => setShowScheduleModal(false)} variant="fpwhite">Close</Button>
                  </ScheduleModalHeader>

                  <DetailsSectionBody>
                    <DetailsFieldRow>
                      <DetailsField>
                        <FieldLabel>Source</FieldLabel>
                        <FieldSelect value={(schedule?.source) || 'spotify'} disabled>
                          <option value="spotify">Spotify</option>
                        </FieldSelect>
                      </DetailsField>
                      <DetailsField>
                        <FieldLabel>Status</FieldLabel>
                        <FieldSelect
                          value={(schedule?.status) || 'active'}
                          onChange={(e) => updateLocalSchedule('status', e.target.value)}
                          disabled={disabled || isLoadingSchedule}
                        >
                          <option value="active">Active</option>
                          <option value="paused">Paused</option>
                        </FieldSelect>
                      </DetailsField>
                    </DetailsFieldRow>

                    <DetailsFieldRow>
                      <DetailsField>
                        <FieldLabel>Mode</FieldLabel>
                        <FieldSelect
                          value={(schedule?.mode) || 'append'}
                          onChange={(e) => updateLocalSchedule('mode', e.target.value)}
                          disabled={disabled || isLoadingSchedule}
                        >
                          <option value="append">Append (new on top)</option>
                          <option value="replace">Replace</option>
                        </FieldSelect>
                      </DetailsField>
                      <DetailsField>
                        <FieldLabel>Time (UTC)</FieldLabel>
                        <Input
                          type="time"
                          value={(schedule?.time_utc) || '09:00'}
                          onChange={(e) => updateLocalSchedule('time_utc', e.target.value)}
                          disabled={disabled || isLoadingSchedule}
                        />
                      </DetailsField>
                    </DetailsFieldRow>

                    <DetailsFieldRow>
                      <DetailsField>
                        <FieldLabel>Frequency</FieldLabel>
                        <FieldSelect
                          value={(schedule?.frequency) || 'daily'}
                          onChange={(e) => updateLocalSchedule('frequency', e.target.value)}
                          disabled={disabled || isLoadingSchedule}
                        >
                          <option value="daily">Daily</option>
                          <option value="monthly">Monthly</option>
                          <option value="every_x_date">Every X Date</option>
                          <option value="every_x_dow">Every X DOW</option>
                        </FieldSelect>
                      </DetailsField>
                      <DetailsField>
                        <FieldLabel>{(schedule?.frequency === 'every_x_dow') ? 'Days (mon,tue,...)' : 'X Value'}</FieldLabel>
                        <Input
                          type="text"
                          placeholder={schedule?.frequency === 'every_x_dow' ? 'e.g., mon,thu' : '1..31'}
                          value={schedule?.frequency_value || ''}
                          onChange={(e) => updateLocalSchedule('frequency_value', e.target.value)}
                          disabled={disabled || isLoadingSchedule || (schedule?.frequency === 'daily')}
                        />
                        <FieldHint>Leave blank for defaults where applicable.</FieldHint>
                      </DetailsField>
                    </DetailsFieldRow>

                    <DetailsField>
                      <FieldLabel>Spotify Playlist</FieldLabel>
                      <GenreInputRow>
                        <Input
                          type="text"
                          placeholder="37i9dQZF1DX..."
                          value={schedule?.wip_spotify_playlist_id || ''}
                          onChange={(e) => updateLocalSchedule('wip_spotify_playlist_id', e.target.value)}
                          disabled={disabled || isLoadingSchedule}
                        />
                        <Button
                          type="button"
                          onClick={() => setShowScheduleSourcePicker(true)}
                          disabled={disabled || isLoadingSchedule}
                          variant="secondary"
                        >
                          Select
                        </Button>
                      </GenreInputRow>
                      {schedule?.source_title && (
                        <ScheduleMeta>
                          Selected: {schedule.source_title}
                        </ScheduleMeta>
                      )}
                    </DetailsField>

                    {showScheduleSourcePicker && (
                      <ScheduleSourcePicker>
                        <PickerHeader>
                          <MetaLabel>Select Spotify Playlist</MetaLabel>
                          <Button type="button" onClick={() => setShowScheduleSourcePicker(false)} variant="fpwhite">
                            Close
                          </Button>
                        </PickerHeader>
                        <ImportModal
                          inline
                          isOpen={showScheduleSourcePicker}
                          onImported={(selection) => {
                            if (!selection) return;
                            updateLocalSchedule('wip_spotify_playlist_id', selection.id);
                            setSchedule(prev => ({
                              ...(prev || defaultSched(playlist.id)),
                              source_title: selection.title
                            }));
                            setShowScheduleSourcePicker(false);
                          }}
                          actionLabel="Select Source"
                        />
                      </ScheduleSourcePicker>
                    )}

                    {!!schedule?.next_run_at && (
                      <ScheduleMeta>
                        Next run: {new Date(schedule.next_run_at).toLocaleString()}
                        {schedule.last_run_at ? ` • Last run: ${new Date(schedule.last_run_at).toLocaleString()}` : ''}
                      </ScheduleMeta>
                    )}

                    <ScheduleModalActions>
                      <Button onClick={saveSchedule} disabled={disabled || isLoadingSchedule || !playlist?.id} variant="primary">
                        {schedule?.id ? 'Save Schedule' : 'Create Schedule'}
                      </Button>
                      <Button onClick={runNow} disabled={disabled || isLoadingSchedule || !schedule?.id}>
                        Run Now
                      </Button>
                      <Button onClick={deleteSchedule} disabled={disabled || isLoadingSchedule || (!schedule?.id && !schedule)} variant="secondary">
                        {schedule?.id ? 'Delete Schedule' : 'Clear'}
                      </Button>
                    </ScheduleModalActions>
                    {scheduleRunsError && <FieldError>{scheduleRunsError}</FieldError>}
                    {scheduleStatus && !scheduleRunsError && (
                      <DetailsNote>{scheduleStatus}</DetailsNote>
                    )}

                    <ScheduleHistory>
                      <MetaLabel>Run History</MetaLabel>
                      {(!schedule?.id) ? (
                        <FieldHint>Save a schedule to start tracking imports.</FieldHint>
                      ) : isLoadingRuns ? (
                        <FieldHint>Loading...</FieldHint>
                      ) : scheduleRuns.length === 0 ? (
                        <FieldHint>No imports have run yet.</FieldHint>
                      ) : (
                        <HistoryList>
                          {scheduleRuns.map((run) => {
                            const stats = run.stats || {};
                            const summaryParts = [
                              typeof stats.added === 'number' ? `+${stats.added}` : null,
                              typeof stats.deleted === 'number' && stats.deleted > 0 ? `-${stats.deleted}` : null,
                              typeof stats.skipped_duplicates === 'number' && stats.skipped_duplicates > 0 ? `${stats.skipped_duplicates} skipped` : null
                            ].filter(Boolean);
                            return (
                              <HistoryItem key={run.id} $status={run.status}>
                                <span>
                                  {new Date(run.started_at).toLocaleString()} • Status: {run.status}
                                </span>
                                {summaryParts.length > 0 && (
                                  <HistoryMeta>{summaryParts.join(' • ')}</HistoryMeta>
                                )}
                                {run.error && (
                                  <HistoryError>
                                    {run.error}
                                  </HistoryError>
                                )}
                              </HistoryItem>
                            );
                          })}
                        </HistoryList>
                      )}
                    </ScheduleHistory>
                  </DetailsSectionBody>
                </ScheduleModalContent>
              </ScheduleModal>
            )}
          </DetailsSectionBody>
        </DetailsSection>
      )}
    </PlaylistDetailsLayout>
  );
};

export default PlaylistForm;
