import { useState, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { theme, Button, Input, TextArea } from '@shared/styles/GlobalStyles';
import { adminGet, adminPost, adminPut, adminDelete } from '../../utils/adminApi';
import { CollapsibleSection, SearchFilter, EmptyState } from '../shared';

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
`;

const HelperText = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
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
  border: ${theme.borders.dashed} ${theme.colors.black};
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
    color: ${theme.colors.black};
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
  color: ${theme.colors.black};
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
  color: ${theme.colors.black};
`;

const GhostButton = styled(Button)`
  background: transparent;
  border-color: rgba(0, 0, 0, 0.25);
  color: ${theme.colors.black};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  font-size: ${theme.fontSizes.tiny};

  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.06);
    border-color: ${theme.colors.black};
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

const GenreCategoryManager = ({ onStatusChange }) => {
  const [genreCategories, setGenreCategories] = useState([]);
  const [genreSearch, setGenreSearch] = useState('');
  const [newGenreName, setNewGenreName] = useState('');
  const [bulkGenreInput, setBulkGenreInput] = useState('');
  const [editingGenre, setEditingGenre] = useState(null);
  const [editingGenreDraft, setEditingGenreDraft] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    refreshGenreCategories();
  }, []);

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

  const refreshGenreCategories = async () => {
    try {
      const genreData = await adminGet('/api/v1/admin/site-admin/genre-categories');
      setGenreCategories(genreData.categories || []);
    } catch (error) {
      onStatusChange?.('error', `Failed to load genre categories: ${error.message}`);
    }
  };

  const handleAddGenreCategory = async (event) => {
    event?.preventDefault();
    const draft = newGenreName.trim();

    if (!draft) {
      onStatusChange?.('error', 'Genre name is required');
      return;
    }

    const exists = genreCategories.some(category => category.label.toLowerCase() === draft.toLowerCase());
    if (exists) {
      onStatusChange?.('error', 'Genre already exists');
      return;
    }

    try {
      await adminPost('/api/v1/admin/site-admin/genre-categories', { label: draft });
      setNewGenreName('');
      await refreshGenreCategories();
      onStatusChange?.('success', 'Genre category added');
    } catch (error) {
      onStatusChange?.('error', `Failed to add genre category: ${error.message}`);
    }
  };

  const handleGenreColorUpdate = async (id, color) => {
    try {
      await adminPut(`/api/v1/admin/site-admin/genre-categories/${id}`, { color });
      setGenreCategories(prev => prev.map(category => (
        category.id === id ? { ...category, color } : category
      )));
      onStatusChange?.('success', 'Genre color updated');
    } catch (error) {
      onStatusChange?.('error', `Failed to update genre color: ${error.message}`);
    }
  };

  const handleEditGenre = (id, label) => {
    setEditingGenre(id);
    setEditingGenreDraft(label);
  };

  const handleSaveGenre = async (id) => {
    const nextLabel = editingGenreDraft.trim();
    if (!nextLabel) {
      onStatusChange?.('error', 'Genre label cannot be empty');
      return;
    }

    try {
      await adminPut(`/api/v1/admin/site-admin/genre-categories/${id}`, { label: nextLabel });
      setEditingGenre(null);
      setEditingGenreDraft('');
      await refreshGenreCategories();
      onStatusChange?.('success', 'Genre updated');
    } catch (error) {
      onStatusChange?.('error', `Failed to update genre: ${error.message}`);
    }
  };

  const handleDeleteGenre = async (id, label) => {
    if (!confirm(`Delete genre category "${label}"?`)) {
      return;
    }

    try {
      await adminDelete(`/api/v1/admin/site-admin/genre-categories/${id}`);
      await refreshGenreCategories();
      onStatusChange?.('success', 'Genre removed');
    } catch (error) {
      onStatusChange?.('error', `Failed to delete genre: ${error.message}`);
    }
  };

  const handleBulkAddGenres = async () => {
    const text = bulkGenreInput.trim();
    if (!text) {
      onStatusChange?.('error', 'Paste at least one genre');
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
      if (skipped) messageParts.push(`skipped ${skipped} existing`);
      onStatusChange?.('success', messageParts.join(', '));
    } catch (error) {
      onStatusChange?.('error', `Bulk add failed: ${error.message}`);
    }
  };

  return (
    <CollapsibleSection
      title={`Genre Categories (${genreCategories.length})`}
      collapsed={collapsed}
      onToggle={setCollapsed}
    >
      <HelperText>Curate genre groupings that power search filters and editorial copy.</HelperText>

      <GenreAddForm onSubmit={handleAddGenreCategory}>
        <GenreInput
          type="text"
          placeholder="Add new genre"
          value={newGenreName}
          onChange={(e) => setNewGenreName(e.target.value)}
          aria-label="New genre name"
          autoComplete="off"
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

      <SearchFilter
        value={genreSearch}
        onChange={setGenreSearch}
        placeholder="Search genres..."
      />

      <GenreList>
        {filteredGenreCategories.length === 0 ? (
          <EmptyState message="No matching genres" />
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
    </CollapsibleSection>
  );
};

export default GenreCategoryManager;
