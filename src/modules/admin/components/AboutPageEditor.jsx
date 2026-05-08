import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { adminGet, adminPost } from '../utils/adminApi';
import TipTapEditor from '@modules/curator/components/TipTapEditor';
import MediaUpload from './MediaUpload';
import { theme, DashedBox, Button, Input } from '@shared/styles/GlobalStyles';
import { clearAboutContentCache } from '../../about/components/AboutPage';

// Sortable Item Component
const SortableItem = ({ id, item, onUpdate, onRemove }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <ItemCard ref={setNodeRef} style={style}>
      <ItemHeader>
        <DragHandle {...attributes} {...listeners} title="Drag to reorder">
          ⋮⋮
        </DragHandle>
        <ItemTitle>
          <Input
            type="text"
            value={item.title}
            onChange={(e) => onUpdate(id, { ...item, title: e.target.value })}
            placeholder="Section title"
          />
        </ItemTitle>
        <ItemActions>
          <ToggleButton
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            variant="action"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </ToggleButton>
          <Button type="button" onClick={() => onRemove(id)} variant="danger">
            Remove
          </Button>
        </ItemActions>
      </ItemHeader>

      {isExpanded && (
        <ItemBody>
          {/* Media Upload Section */}
          <MediaSection>
            <MediaSectionTitle>Media (Optional)</MediaSectionTitle>
            <MediaUpload
              currentMediaUrl={item.mediaUrl || ''}
              currentFallbackUrl={item.mediaFallbackUrl || ''}
              onMediaUpload={(mediaData) => {
                onUpdate(id, {
                  ...item,
                  mediaUrl: mediaData.mediaUrl,
                  mediaType: mediaData.mediaType,
                  mediaFallbackUrl: mediaData.fallbackUrl || ''
                });
              }}
              uploadType="general"
              hideHeader={true}
              compact={false}
              acceptedTypes="both"
            />

            {item.mediaUrl && (
              <MediaControls>
                <ControlGroup>
                  <Label>Position</Label>
                  <Select
                    value={item.mediaPosition || 'top'}
                    onChange={(e) => onUpdate(id, { ...item, mediaPosition: e.target.value })}
                  >
                    <option value="top">Top (above text)</option>
                    <option value="bottom">Bottom (below text)</option>
                    <option value="left">Left (beside text)</option>
                    <option value="right">Right (beside text)</option>
                  </Select>
                </ControlGroup>

                <ControlGroup>
                  <Label>Aspect Ratio</Label>
                  <Select
                    value={item.mediaAspectRatio || '16/9'}
                    onChange={(e) => onUpdate(id, { ...item, mediaAspectRatio: e.target.value })}
                  >
                    <option value="16/9">16:9 (Widescreen)</option>
                    <option value="4/3">4:3 (Standard)</option>
                    <option value="1/1">1:1 (Square)</option>
                    <option value="21/9">21:9 (Ultra-wide)</option>
                    <option value="auto">Auto (Original)</option>
                  </Select>
                </ControlGroup>
              </MediaControls>
            )}
          </MediaSection>

          {/* Content Editor */}
          <ContentSection>
            <MediaSectionTitle>Content</MediaSectionTitle>
            <TipTapEditor
              value={item.bodyHtml}
              onChange={(value) => onUpdate(id, { ...item, bodyHtml: value })}
              placeholder="Enter content for this section..."
            />
          </ContentSection>

          {/* Spacing Controls */}
          <SpacingSection>
            <MediaSectionTitle>Spacing Controls (Optional)</MediaSectionTitle>
            <SpacingGrid>
              <SpacingControl>
                <Label>Padding Top</Label>
                <SpacingInput
                  type="text"
                  value={item.paddingTop || ''}
                  onChange={(e) => onUpdate(id, { ...item, paddingTop: e.target.value })}
                  placeholder="e.g., 20px, 1rem"
                />
              </SpacingControl>

              <SpacingControl>
                <Label>Padding Bottom</Label>
                <SpacingInput
                  type="text"
                  value={item.paddingBottom || ''}
                  onChange={(e) => onUpdate(id, { ...item, paddingBottom: e.target.value })}
                  placeholder="e.g., 20px, 1rem"
                />
              </SpacingControl>

              <SpacingControl>
                <Label>Padding Left</Label>
                <SpacingInput
                  type="text"
                  value={item.paddingLeft || ''}
                  onChange={(e) => onUpdate(id, { ...item, paddingLeft: e.target.value })}
                  placeholder="e.g., 20px, 1rem"
                />
              </SpacingControl>

              <SpacingControl>
                <Label>Padding Right</Label>
                <SpacingInput
                  type="text"
                  value={item.paddingRight || ''}
                  onChange={(e) => onUpdate(id, { ...item, paddingRight: e.target.value })}
                  placeholder="e.g., 20px, 1rem"
                />
              </SpacingControl>

              <SpacingControl>
                <Label>Line Height</Label>
                <SpacingInput
                  type="text"
                  value={item.lineHeight || ''}
                  onChange={(e) => onUpdate(id, { ...item, lineHeight: e.target.value })}
                  placeholder="e.g., 1.6, 24px"
                />
              </SpacingControl>
            </SpacingGrid>
            <SpacingHint>
              Leave blank to use default values. CSS units supported (px, rem, em, %).
            </SpacingHint>
          </SpacingSection>
        </ItemBody>
      )}
    </ItemCard>
  );
};

const AboutPageEditor = () => {
  const [topText, setTopText] = useState('');
  const [items, setItems] = useState([]);
  const [headerConfig, setHeaderConfig] = useState({
    showHeader: false,
    title: '',
    subtitle: '',
    backgroundColor: '#667eea'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load content on mount
  useEffect(() => {
    const loadContent = async () => {
      try {
        const data = await adminGet('/api/v1/admin/site-admin/about-content');
        setTopText(data.topText || '');
        setItems(data.items || []);
        setHeaderConfig(data.headerConfig || {
          showHeader: false,
          title: '',
          subtitle: '',
          backgroundColor: '#667eea'
        });
      } catch (error) {
        console.error('Error loading about content:', error);
        setMessage({ type: 'error', text: 'Failed to load content' });
      } finally {
        setLoading(false);
      }
    };

    loadContent();
  }, []);

  // Add new item
  const handleAddItem = useCallback(() => {
    const newItem = {
      id: `item-${Date.now()}`,
      title: '',
      bodyHtml: '<p>New section content...</p>',
      order: items.length
    };
    setItems([...items, newItem]);
  }, [items]);

  // Update item
  const handleUpdateItem = useCallback((itemId, updatedItem) => {
    setItems(items.map(item => item.id === itemId ? updatedItem : item));
  }, [items]);

  // Remove item
  const handleRemoveItem = useCallback((itemId) => {
    if (confirm('Are you sure you want to remove this section?')) {
      setItems(items.filter(item => item.id !== itemId));
    }
  }, [items]);

  // Handle drag end
  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setItems((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }, []);

  // Save content
  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      // Validate
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.title.trim()) {
          setMessage({ type: 'error', text: `Section ${i + 1} is missing a title` });
          setSaving(false);
          return;
        }
      }

      const payload = {
        topText,
        headerConfig,
        items: items.map((item, index) => ({
          ...item,
          order: index
        }))
      };

      await adminPost('/api/v1/admin/site-admin/about-content', payload);

      // Clear public page cache so changes are visible immediately
      clearAboutContentCache();

      setMessage({ type: 'success', text: 'About page content saved successfully!' });
    } catch (error) {
      console.error('Error saving about content:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to save content' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingMessage>Loading editor...</LoadingMessage>;
  }

  return (
    <EditorContainer>
      <EditorHeader>

      </EditorHeader>

      {/* Header Customization Section */}
      

      <Section>
        <SectionTitle>TOPLINE</SectionTitle>
        <TipTapEditor
          value={topText}
          onChange={setTopText}
          placeholder="Enter introductory text for the About page..."
        />
      </Section>

      <Section>
        <SectionHeader>
          <SectionTitle>ACCORDIANS</SectionTitle>
          <Button type="button" onClick={handleAddItem} variant="primary">
            + Add Section
          </Button>
        </SectionHeader>


        {items.length === 0 ? (
          <EmptyState>
            <p>No sections yet. Click "Add Section" to create your first accordion section.</p>
          </EmptyState>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map(item => item.id)}
              strategy={verticalListSortingStrategy}
            >
              <ItemsList>
                {items.map((item) => (
                  <SortableItem
                    key={item.id}
                    id={item.id}
                    item={item}
                    onUpdate={handleUpdateItem}
                    onRemove={handleRemoveItem}
                  />
                ))}
              </ItemsList>
            </SortableContext>
          </DndContext>
        )}
      </Section>
      <Section>
        <SectionTitle>Custom Page Header (Optional)</SectionTitle>
        <SectionDescription>
          Add a beautiful custom header banner to your About page with title and subtitle.
        </SectionDescription>
        <HeaderConfigGrid>
          <CheckboxWrapper>
            <Checkbox
              type="checkbox"
              id="showHeader"
              checked={headerConfig.showHeader}
              onChange={(e) => setHeaderConfig({ ...headerConfig, showHeader: e.target.checked })}
            />
            <CheckboxLabel htmlFor="showHeader">Enable Custom Header</CheckboxLabel>
          </CheckboxWrapper>

          {headerConfig.showHeader && (
            <>
              <InputGroup>
                <Label>Header Title</Label>
                <Input
                  type="text"
                  value={headerConfig.title}
                  onChange={(e) => setHeaderConfig({ ...headerConfig, title: e.target.value })}
                  placeholder="e.g., Welcome to Our Story"
                />
              </InputGroup>

              <InputGroup>
                <Label>Header Subtitle</Label>
                <Input
                  type="text"
                  value={headerConfig.subtitle}
                  onChange={(e) => setHeaderConfig({ ...headerConfig, subtitle: e.target.value })}
                  placeholder="e.g., Learn more about who we are and what we do"
                />
              </InputGroup>

              <InputGroup>
                <Label>Background Color/Gradient</Label>
                <ColorPreview>
                  <ColorInputLarge
                    type="color"
                    value={headerConfig.backgroundColor?.split(' ')[0] || '#667eea'}
                    onChange={(e) => setHeaderConfig({ ...headerConfig, backgroundColor: e.target.value })}
                  />
                  <ColorHint>Click to choose a primary color. You can also enter a gradient:</ColorHint>
                  <Input
                    type="text"
                    value={headerConfig.backgroundColor}
                    onChange={(e) => setHeaderConfig({ ...headerConfig, backgroundColor: e.target.value })}
                    placeholder="e.g., linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                  />
                </ColorPreview>
              </InputGroup>
            </>
          )}
        </HeaderConfigGrid>
      </Section>
      <ActionBar>
        {message && (
          <Message type={message.type}>
            {message.text}
          </Message>
        )}
        <Button
          type="button"
          onClick={handleSave}
          variant="primary"
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </ActionBar>
    </EditorContainer>
  );
};

const EditorContainer = styled.div`
  padding: ${theme.spacing.sm};
  max-width: 1920px;
  margin: 0 auto;
`;

const EditorHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${theme.spacing.xl};

  h2 {
    margin: 0;
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.h2};
  }
`;



const Section = styled.div`
  margin-bottom: ${theme.spacing.xxl};
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${theme.spacing.md};
`;

const SectionTitle = styled.h3`
  margin: 0 0 ${theme.spacing.sm} 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h3};
  font-weight: 600;
`;

const SectionDescription = styled.p`
  margin: 0 0 ${theme.spacing.md} 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  opacity: 0.7;
`;

const ItemsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const ItemCard = styled(DashedBox)`
  padding: ${theme.spacing.md};
  background: ${theme.colors.white};
`;

const ItemHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
`;

const DragHandle = styled.div`
  cursor: grab;
  user-select: none;
  padding: ${theme.spacing.sm};
  font-size: 18px;
  color: ${theme.colors.black};
  opacity: 0.4;
  display: flex;
  align-items: center;

  &:active {
    cursor: grabbing;
  }

  &:hover {
    opacity: 0.7;
  }
`;

const ItemTitle = styled.div`
  flex: 1;

  input {
    width: 100%;
  }
`;

const ItemActions = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
`;

const ToggleButton = styled(Button)`
  min-width: 90px;
`;

const ItemBody = styled.div`
  margin-top: ${theme.spacing.md};
  padding-top: ${theme.spacing.md};
  border-top: ${theme.borders.dashed} rgba(0, 0, 0, 0.1);
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${theme.spacing.xxl};
  color: ${theme.colors.black};
  opacity: 0.6;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};

  p {
    margin: 0;
  }
`;

const ActionBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: ${theme.spacing.xl};
  border-top: ${theme.borders.solid} rgba(0, 0, 0, 0.1);
`;

const Message = styled.div`
  padding: ${theme.spacing.md};
  border-radius: 4px;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  background: ${props => props.type === 'success' ? theme.colors.success : theme.colors.danger};
  color: ${theme.colors.white};
`;

const LoadingMessage = styled.div`
  text-align: center;
  padding: ${theme.spacing.xxl};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
`;

const MediaSection = styled.div`
  margin-bottom: ${theme.spacing.xl};
  padding-bottom: ${theme.spacing.lg};
  border-bottom: ${theme.borders.dashed} rgba(0, 0, 0, 0.1);
`;

const ContentSection = styled.div`
  margin-bottom: ${theme.spacing.xl};
  padding-bottom: ${theme.spacing.lg};
  border-bottom: ${theme.borders.dashed} rgba(0, 0, 0, 0.1);
`;

const SpacingSection = styled.div`
  margin-bottom: ${theme.spacing.md};
`;

const MediaSectionTitle = styled.h4`
  margin: 0 0 ${theme.spacing.md} 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(15, 23, 42, 0.7);
  font-weight: ${theme.fontWeights.semibold};
`;

const MediaControls = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: ${theme.spacing.md};
  margin-top: ${theme.spacing.lg};
  padding: ${theme.spacing.md};
  background: rgba(15, 23, 42, 0.02);
  border-radius: 8px;
`;

const ControlGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const Label = styled.label`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(15, 23, 42, 0.7);
  font-weight: ${theme.fontWeights.medium};
`;

const Select = styled.select`
  padding: 10px 12px;
  border: ${theme.borders.solidThin} rgba(15, 23, 42, 0.15);
  border-radius: 6px;
  background: white;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  color: ${theme.colors.black};
  cursor: pointer;
  transition: all ${theme.transitions.normal};

  &:hover {
    border-color: ${theme.colors.primary};
  }

  &:focus {
    outline: none;
    border-color: ${theme.colors.primary};
    box-shadow: 0 0 0 3px rgba(71, 159, 242, 0.1);
  }
`;

const SpacingGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.sm};
`;

const SpacingControl = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const SpacingInput = styled.input`
  padding: 8px 12px;
  border: ${theme.borders.solidThin} rgba(15, 23, 42, 0.15);
  border-radius: 6px;
  background: white;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  transition: all ${theme.transitions.normal};

  &:hover {
    border-color: ${theme.colors.primary};
  }

  &:focus {
    outline: none;
    border-color: ${theme.colors.primary};
    box-shadow: 0 0 0 3px rgba(71, 159, 242, 0.1);
  }

  &::placeholder {
    color: rgba(15, 23, 42, 0.4);
    font-size: ${theme.fontSizes.tiny};
  }
`;

const SpacingHint = styled.p`
  margin: ${theme.spacing.sm} 0 0 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(15, 23, 42, 0.5);
  font-style: italic;
`;

const HeaderConfigGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
  padding: ${theme.spacing.lg};
  background: rgba(15, 23, 42, 0.02);
  border-radius: 8px;
  border: 1px solid rgba(15, 23, 42, 0.08);
`;

const CheckboxWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
`;

const Checkbox = styled.input`
  width: 20px;
  height: 20px;
  cursor: pointer;
  accent-color: ${theme.colors.fpblue};
`;

const CheckboxLabel = styled.label`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  font-weight: 600;
  color: ${theme.colors.black};
  cursor: pointer;
  user-select: none;
`;

const InputGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const ColorPreview = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const ColorInputLarge = styled.input`
  width: 80px;
  height: 80px;
  border: 2px solid rgba(15, 23, 42, 0.15);
  border-radius: 12px;
  cursor: pointer;
  transition: all ${theme.transitions.fast};
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

  &:hover {
    border-color: ${theme.colors.fpblue};
    transform: scale(1.05);
  }
`;

const ColorHint = styled.p`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(15, 23, 42, 0.6);
`;

export default AboutPageEditor;
