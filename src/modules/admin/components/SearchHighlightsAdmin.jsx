import { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { theme, Button, Input, TextArea } from '@shared/styles/GlobalStyles';
import { adminGet, adminPost, adminUpload } from '../utils/adminApi';

const MAX_EDITORIALS = 4;

const PanelContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const SectionHeader = styled.h3`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h4};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0;
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

const EmptyRow = styled.div`
  padding: ${theme.spacing.md};
  text-align: center;
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
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
  color: rgba(0, 0, 0, 0.6);
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
  color: rgba(0, 0, 0, 0.6);
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
  color: rgba(0, 0, 0, 0.6);
  word-break: break-word;
`;

const EditorialSummaryActions = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
`;

const EditorialControls = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
  justify-content: flex-end;
  margin-top: ${theme.spacing.sm};
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

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
  }
`;

const EditorialPreview = styled.div`
  width: 100%;
  aspect-ratio: 1;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.08);
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
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
  display: flex;
  flex-direction: column;
  gap: 1px;
`;

const LabelText = styled.label`
  display: block;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.black};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 4px;
`;

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

const Message = styled.div`
  padding: ${theme.spacing.md};
  background: ${({ $type }) => ($type === 'error' ? theme.colors.dangerBG : theme.colors.stateSaved)};
  border: ${({ $type }) => ($type === 'error' ? theme.borders.solid : theme.borders.dashed)} ${({ $type }) => ($type === 'error' ? theme.colors.danger : theme.colors.success)};
  border-radius: 8px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${({ $type }) => ($type === 'error' ? theme.colors.danger : theme.colors.success)};
`;

const SearchHighlightsAdmin = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [editorials, setEditorials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingIndex, setEditingIndex] = useState(-1);
  const [uploadBusyIndex, setUploadBusyIndex] = useState(null);
  const [message, setMessage] = useState(null);
  const fileInputRef = useRef(null);

  const editingCard = editingIndex >= 0 && editingIndex < editorials.length
    ? editorials[editingIndex]
    : null;

  useEffect(() => {
    loadEditorials();
  }, []);

  useEffect(() => {
    if (collapsed) {
      setEditingIndex(-1);
    }
  }, [collapsed]);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const loadEditorials = async () => {
    try {
      setLoading(true);
      const data = await adminGet('/api/v1/admin/site-admin/search-editorials');
      const activeItems = (data.items || []).filter(item => item.active !== 0);
      setEditorials(activeItems.slice(0, MAX_EDITORIALS));
      setEditingIndex(-1);
      setUploadBusyIndex(null);
    } catch (error) {
      showMessage('error', `Failed to load search highlights: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (index, field, value) => {
    setEditorials(prev => prev.map((item, idx) => (
      idx === index ? { ...item, [field]: value } : item
    )));
  };

  const handleAdd = () => {
    setCollapsed(false);
    setEditorials(prev => {
      if (prev.length >= MAX_EDITORIALS) {
        showMessage('error', `Maximum of ${MAX_EDITORIALS} highlights`);
        return prev;
      }
      const next = [
        ...prev,
        { id: null, title: '', description: '', image_url: '', preset_query: '', target_url: '' }
      ];
      setEditingIndex(next.length - 1);
      return next;
    });
  };

  const handleRemove = (index) => {
    setEditorials(prev => {
      const next = prev.filter((_, idx) => idx !== index);
      setEditingIndex(prevIndex => {
        if (prevIndex === index) return -1;
        if (prevIndex > index) return prevIndex - 1;
        return prevIndex;
      });
      return next;
    });
    showMessage('success', 'Highlight removed');
  };

  const handleMove = (index, direction) => {
    setEditorials(prev => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const temp = next[index];
      next[index] = next[target];
      next[target] = temp;
      setEditingIndex(prevIndex => {
        if (prevIndex === index) return target;
        if (prevIndex === target) return index;
        return prevIndex;
      });
      return next;
    });
  };

  const handleUploadTrigger = () => {
    if (editingIndex < 0) return;
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file || editingIndex < 0) return;

    const index = editingIndex;
    setUploadBusyIndex(index);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const response = await adminUpload('/api/v1/uploads/image?type=search-editorials', formData);
      const uploadedUrl = response?.data?.primary_url;
      if (uploadedUrl) {
        handleChange(index, 'image_url', uploadedUrl);
        showMessage('success', 'Image uploaded');
      } else {
        showMessage('error', 'Upload succeeded but no URL returned');
      }
    } catch (error) {
      showMessage('error', `Image upload failed: ${error.message || 'Unknown error'}`);
    } finally {
      setUploadBusyIndex(null);
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = editorials
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
      const activeItems = (response.items || []).filter(item => item.active !== 0);
      setEditorials(activeItems.slice(0, MAX_EDITORIALS));
      setUploadBusyIndex(null);
      setEditingIndex(prev => {
        if (!activeItems.length) return -1;
        const bounded = Math.min(prev, activeItems.length - 1);
        return bounded;
      });
      showMessage('success', 'Search highlights updated');
    } catch (error) {
      showMessage('error', `Failed to save highlights: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PanelContainer>
      <SectionHeaderRow>
        <SectionHeader>Search Highlights</SectionHeader>
        <SectionHeaderActions>
          <Button
            size="tiny"
            variant="secondary"
            onClick={() => setCollapsed(prev => !prev)}
            disabled={uploadBusyIndex !== null}
          >
            {collapsed ? '+' : '-'}
          </Button>
        </SectionHeaderActions>
      </SectionHeaderRow>

      {message && (
        <Message $type={message.type}>
          {message.text}
        </Message>
      )}

      {!collapsed && (
        <>
          {loading ? (
            <EmptyRow>Loading highlights...</EmptyRow>
          ) : (
            <>
              {editorials.length > 0 ? (
                <EditorialSummaryGrid>
                  {editorials.map((card, index) => {
                    const isActive = editingIndex === index;
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
                              setCollapsed(false);
                              setEditingIndex(index);
                            }}
                            disabled={uploadBusyIndex !== null && !isActive}
                          >
                            {isActive ? 'Editing' : 'Edit'}
                          </Button>
                          <Button
                            size="tiny"
                            variant="secondary"
                            onClick={() => handleMove(index, -1)}
                            disabled={index === 0 || uploadBusyIndex !== null}
                          >
                            Move Up
                          </Button>
                          <Button
                            size="tiny"
                            variant="secondary"
                            onClick={() => handleMove(index, 1)}
                            disabled={index === editorials.length - 1 || uploadBusyIndex !== null}
                          >
                            Move Down
                          </Button>
                          <Button
                            size="tiny"
                            variant="danger"
                            onClick={() => handleRemove(index)}
                            disabled={uploadBusyIndex !== null}
                          >
                            Remove
                          </Button>
                        </EditorialSummaryActions>
                      </EditorialSummaryCard>
                    );
                  })}
                </EditorialSummaryGrid>
              ) : (
                <EmptyRow>No highlights configured.</EmptyRow>
              )}

              <EditorialControls>
                <Button
                  size="small"
                  variant="secondary"
                  onClick={handleAdd}
                  disabled={editorials.length >= MAX_EDITORIALS || loading || uploadBusyIndex !== null}
                >
                  Add Highlight
                </Button>
                <Button
                  size="small"
                  variant="secondary"
                  onClick={loadEditorials}
                  disabled={loading || uploadBusyIndex !== null}
                >
                  Refresh
                </Button>
                <Button
                  size="small"
                  variant="primary"
                  onClick={handleSave}
                  disabled={saving || loading || uploadBusyIndex !== null}
                >
                  {saving ? 'Saving...' : 'Save Highlights'}
                </Button>
              </EditorialControls>

              {editorials.length > 0 ? (
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
                          onChange={(event) => handleChange(editingIndex, 'image_url', event.target.value)}
                          placeholder="https://cdn.example.com/search.jpg"
                        />
                        <EditorialRowActions>
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            ref={fileInputRef}
                            onChange={handleImageUpload}
                          />
                          <Button
                            size="small"
                            variant="secondary"
                            onClick={handleUploadTrigger}
                            disabled={uploadBusyIndex === editingIndex}
                          >
                            {uploadBusyIndex === editingIndex ? 'Uploading...' : 'Upload Image'}
                          </Button>
                          <Button
                            size="small"
                            variant="secondary"
                            onClick={() => handleChange(editingIndex, 'image_url', '')}
                            disabled={!editingCard.image_url || uploadBusyIndex === editingIndex}
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
                            onChange={(event) => handleChange(editingIndex, 'title', event.target.value)}
                            placeholder="Highlight title"
                          />
                        </InlineInputGroup>
                        <InlineInputGroup>
                          <LabelText>Description</LabelText>
                          <TextArea
                            value={editingCard.description || ''}
                            onChange={(event) => handleChange(editingIndex, 'description', event.target.value)}
                            placeholder="Optional supporting copy"
                            rows={3}
                          />
                        </InlineInputGroup>
                        <InlineInputGroup>
                          <LabelText>Search Query</LabelText>
                          <Input
                            value={editingCard.preset_query || ''}
                            onChange={(event) => handleChange(editingIndex, 'preset_query', event.target.value)}
                            placeholder="Optional keyword prefill"
                          />
                          <HelperText>Prefills the search bar when selected</HelperText>
                        </InlineInputGroup>
                        <InlineInputGroup>
                          <LabelText>Target URL</LabelText>
                          <Input
                            value={editingCard.target_url || ''}
                            onChange={(event) => handleChange(editingIndex, 'target_url', event.target.value)}
                            placeholder="https://flowerpil.io/playlist/123"
                          />
                          <HelperText>Visitors navigate directly to this URL when the highlight is selected.</HelperText>
                        </InlineInputGroup>
                      </EditorialInputs>
                    </EditorialRow>
                  </EditorialGrid>
                ) : (
                  <HelperText>Select a highlight to edit</HelperText>
                )
              ) : null}
            </>
          )}
        </>
      )}
    </PanelContainer>
  );
};

export default SearchHighlightsAdmin;
