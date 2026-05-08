import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { adminGet, adminPost, adminPut, adminDelete, adminUpload } from '../utils/adminApi';
import { theme, Button, Input, Select } from '@shared/styles/GlobalStyles';
import AnnouncementRenderer from '@modules/shared/components/announcements/AnnouncementRenderer';

const FORMAT_OPTIONS = [
  { value: 'modal', label: 'Modal' },
  { value: 'banner_top', label: 'Banner (Top)' },
  { value: 'banner_bottom', label: 'Banner (Bottom)' },
];

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'archived', label: 'Archived' },
];

const PLACEMENT_OPTIONS = [
  { value: 'global', label: 'Global (All Pages)' },
  { value: 'page_specific', label: 'Page Specific' },
];

const PAGE_OPTIONS = [
  { value: 'dashboard', label: 'Curator Dashboard' },
  { value: 'playlist_editor', label: 'Playlist Editor' },
  { value: 'dsp_settings', label: 'DSP Settings' },
  { value: 'bio_editor', label: 'Bio Editor' },
];

const USER_TYPE_OPTIONS = [
  { value: 'unauthenticated', label: 'Unauthenticated' },
  { value: 'listener', label: 'Listeners' },
  { value: 'curator', label: 'Curators' },
  { value: 'admin', label: 'Admins' },
];

const SHOW_MODE_OPTIONS = [
  { value: 'once', label: 'Show once', description: 'After dismissal, never show again' },
  { value: 'until_cta', label: 'Show until action', description: 'Keep showing until user clicks a CTA button' },
  { value: 'cooldown', label: 'Show with cooldown', description: 'After dismissal, hide for X days then show again' },
];

const BLOCK_TEMPLATES = {
  heading: { type: 'heading', content: 'Your Heading Here', size: 'h2', alignment: 'center' },
  paragraph: { type: 'paragraph', content: 'Your paragraph text here.', alignment: 'center' },
  button: { type: 'button', label: 'Click Me', action: 'dismiss', variant: 'primary' },
  button_group: {
    type: 'button_group',
    buttons: [
      { label: 'Skip', action: 'dismiss', variant: 'secondary' },
      { label: 'Continue', action: 'navigate', url: '/', variant: 'primary' },
    ],
  },
  image: {
    type: 'image',
    src: '',
    width: 300,
    height: 200,
    alt: '',
    alignment: 'center',
  },
  info_box: { type: 'info_box', content: 'Important information here.', style: 'info' },
  flow_diagram: {
    type: 'flow_diagram',
    steps: [
      { platform: 'spotify' },
      { icon: 'flowerpil' },
      { platform: 'apple' },
    ],
    animated: true,
  },
  icon_grid: {
    type: 'icon_grid',
    icons: [
      { platform: 'spotify' },
      { platform: 'apple' },
      { platform: 'tidal' },
    ],
    columns: 3,
  },
  divider: { type: 'divider', style: 'solid' },
  spacer: { type: 'spacer', height: 'md' },
};

export default function AnnouncementsManager() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(getEmptyForm());

  function getEmptyForm() {
    return {
      title: '',
      status: 'draft',
      format: 'modal',
      placement: 'page_specific',
      target_pages: [],
      priority: 5,
      display_delay: 0,
      variants: [{ variant: null, blocks: [], header_style: null }],
      schedule: { manual_override: 1 },
      persistence: { show_mode: 'once' },
      targets: [],
      user_types: [], // For UI convenience, maps to targets
    };
  }

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const response = await adminGet('/api/v1/admin/announcements');
      setAnnouncements(response.data || []);
    } catch (error) {
      showMessage('error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const handleCreate = () => {
    setEditingId('new');
    setFormData(getEmptyForm());
  };

  const handleEdit = (announcement) => {
    setEditingId(announcement.id);
    // Extract user_types from targets for UI convenience
    const userTypes = (announcement.targets || [])
      .filter(t => t.type === 'user_type')
      .map(t => t.value);
    const otherTargets = (announcement.targets || [])
      .filter(t => t.type !== 'user_type');

    setFormData({
      title: announcement.title,
      status: announcement.status,
      format: announcement.format,
      placement: announcement.placement,
      target_pages: announcement.target_pages || [],
      priority: announcement.priority,
      display_delay: announcement.display_delay || 0,
      variants: announcement.variants?.length > 0 ? announcement.variants : [{ variant: null, blocks: [], header_style: null }],
      schedule: announcement.schedule || { manual_override: 1 },
      persistence: announcement.persistence || { show_mode: 'once' },
      targets: otherTargets,
      user_types: userTypes,
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData(getEmptyForm());
  };

  const handleSave = async () => {
    try {
      // Merge user_types back into targets
      const userTypeTargets = formData.user_types.map(value => ({
        type: 'user_type',
        value,
      }));
      const allTargets = [...userTypeTargets, ...formData.targets];

      const payload = {
        ...formData,
        targets: allTargets,
      };
      delete payload.user_types; // Remove UI-only field

      if (editingId === 'new') {
        await adminPost('/api/v1/admin/announcements', payload);
        showMessage('success', 'Announcement created');
      } else {
        await adminPut(`/api/v1/admin/announcements/${editingId}`, payload);
        showMessage('success', 'Announcement updated');
      }
      setEditingId(null);
      fetchAnnouncements();
    } catch (error) {
      showMessage('error', error.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this announcement?')) return;
    try {
      await adminDelete(`/api/v1/admin/announcements/${id}`);
      showMessage('success', 'Announcement deleted');
      fetchAnnouncements();
    } catch (error) {
      showMessage('error', error.message);
    }
  };

  const handleDuplicate = async (announcement) => {
    const duplicate = {
      ...announcement,
      title: `${announcement.title} (Copy)`,
      status: 'draft',
    };
    delete duplicate.id;
    delete duplicate.stats;
    delete duplicate.created_at;
    delete duplicate.updated_at;

    try {
      await adminPost('/api/v1/admin/announcements', duplicate);
      showMessage('success', 'Announcement duplicated');
      fetchAnnouncements();
    } catch (error) {
      showMessage('error', error.message);
    }
  };

  const handleToggleStatus = async (announcement) => {
    const newStatus = announcement.status === 'active' ? 'paused' : 'active';
    try {
      await adminPut(`/api/v1/admin/announcements/${announcement.id}`, { status: newStatus });
      showMessage('success', `Announcement ${newStatus}`);
      fetchAnnouncements();
    } catch (error) {
      showMessage('error', error.message);
    }
  };

  const handlePushNow = async (announcement) => {
    if (!confirm('Push this announcement to all connected users now?')) return;
    try {
      const response = await adminPost(`/api/v1/admin/announcements/${announcement.id}/push`);
      showMessage('success', response.data?.message || 'Announcement pushed');
    } catch (error) {
      showMessage('error', error.message);
    }
  };

  const handleTriggerNextVisit = async (announcement) => {
    if (!confirm('Show this announcement to all users on their next visit?')) return;
    try {
      const response = await adminPost(`/api/v1/admin/announcements/${announcement.id}/trigger-next-visit`);
      showMessage('success', response.data?.message || 'Next visit trigger set');
      fetchAnnouncements();
    } catch (error) {
      showMessage('error', error.message);
    }
  };

  const addBlock = (type) => {
    const newBlock = { ...BLOCK_TEMPLATES[type], id: `block_${Date.now()}` };
    setFormData((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) =>
        i === 0 ? { ...v, blocks: [...v.blocks, newBlock] } : v
      ),
    }));
  };

  const updateBlock = (blockIndex, updates) => {
    setFormData((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) =>
        i === 0
          ? {
              ...v,
              blocks: v.blocks.map((b, bi) => (bi === blockIndex ? { ...b, ...updates } : b)),
            }
          : v
      ),
    }));
  };

  const removeBlock = (blockIndex) => {
    setFormData((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) =>
        i === 0 ? { ...v, blocks: v.blocks.filter((_, bi) => bi !== blockIndex) } : v
      ),
    }));
  };

  const moveBlock = (blockIndex, direction) => {
    const newIndex = blockIndex + direction;
    if (newIndex < 0 || newIndex >= formData.variants[0].blocks.length) return;

    setFormData((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) => {
        if (i !== 0) return v;
        const blocks = [...v.blocks];
        [blocks[blockIndex], blocks[newIndex]] = [blocks[newIndex], blocks[blockIndex]];
        return { ...v, blocks };
      }),
    }));
  };

  if (loading) {
    return <LoadingText>Loading announcements...</LoadingText>;
  }

  // Editor view
  if (editingId) {
    return (
      <PanelContainer>
        <Header>
          <BackButton onClick={handleCancel}>&larr; Back to List</BackButton>
          <HeaderTitle>{editingId === 'new' ? 'Create Announcement' : 'Edit Announcement'}</HeaderTitle>
        </Header>

        {message.text && <Message $type={message.type}>{message.text}</Message>}

        <EditorLayout>
          <EditorMain>
            <Section>
              <SectionTitle>Basic Info</SectionTitle>
              <FormGrid>
                <FormGroup>
                  <Label>Title (Admin Reference)</Label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                    placeholder="e.g., Welcome Modal for New Curators"
                  />
                </FormGroup>
                <FormGroup>
                  <Label>Format</Label>
                  <Select
                    value={formData.format}
                    onChange={(e) => setFormData((p) => ({ ...p, format: e.target.value }))}
                  >
                    {FORMAT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </FormGroup>
                <FormGroup>
                  <Label>Status</Label>
                  <Select
                    value={formData.status}
                    onChange={(e) => setFormData((p) => ({ ...p, status: e.target.value }))}
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </FormGroup>
                <FormGroup>
                  <Label>Priority (1-10)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={formData.priority}
                    onChange={(e) => setFormData((p) => ({ ...p, priority: parseInt(e.target.value) || 5 }))}
                  />
                </FormGroup>
                <FormGroup>
                  <Label>Display Delay (seconds)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="60"
                    value={formData.display_delay}
                    onChange={(e) => setFormData((p) => ({ ...p, display_delay: parseInt(e.target.value) || 0 }))}
                    placeholder="0"
                  />
                  <HelpText>Wait this many seconds before showing</HelpText>
                </FormGroup>
              </FormGrid>
            </Section>

            <Section>
              <SectionTitle>Targeting</SectionTitle>
              <FormGrid>
                <FormGroup>
                  <Label>Placement</Label>
                  <Select
                    value={formData.placement}
                    onChange={(e) => setFormData((p) => ({ ...p, placement: e.target.value }))}
                  >
                    {PLACEMENT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </FormGroup>
                {formData.placement === 'page_specific' && (
                  <FormGroup>
                    <Label>Target Pages</Label>
                    <CheckboxList>
                      {PAGE_OPTIONS.map((page) => (
                        <CheckboxItem key={page.value}>
                          <input
                            type="checkbox"
                            checked={formData.target_pages.includes(page.value)}
                            onChange={(e) => {
                              const pages = e.target.checked
                                ? [...formData.target_pages, page.value]
                                : formData.target_pages.filter((p) => p !== page.value);
                              setFormData((p) => ({ ...p, target_pages: pages }));
                            }}
                          />
                          {page.label}
                        </CheckboxItem>
                      ))}
                    </CheckboxList>
                  </FormGroup>
                )}
                <FormGroup>
                  <Label>User Types <HelpText>(empty = all)</HelpText></Label>
                  <CheckboxRow>
                    {USER_TYPE_OPTIONS.map((userType) => (
                      <CheckboxItem key={userType.value}>
                        <input
                          type="checkbox"
                          checked={formData.user_types.includes(userType.value)}
                          onChange={(e) => {
                            const types = e.target.checked
                              ? [...formData.user_types, userType.value]
                              : formData.user_types.filter((t) => t !== userType.value);
                            setFormData((p) => ({ ...p, user_types: types }));
                          }}
                        />
                        {userType.label}
                      </CheckboxItem>
                    ))}
                  </CheckboxRow>
                </FormGroup>
              </FormGrid>
            </Section>

            <Section>
              <SectionTitle>Display Frequency</SectionTitle>
              <FormGrid>
                <FormGroup>
                  <Label>When dismissed</Label>
                  <Select
                    value={formData.persistence?.show_mode || 'once'}
                    onChange={(e) => {
                      const newMode = e.target.value;
                      setFormData((p) => ({
                        ...p,
                        persistence: {
                          ...p.persistence,
                          show_mode: newMode,
                          // Set default gap_hours when switching to cooldown mode
                          gap_hours: newMode === 'cooldown' && !p.persistence?.gap_hours
                            ? 7 * 24  // 7 days default
                            : p.persistence?.gap_hours
                        }
                      }));
                    }}
                  >
                    {SHOW_MODE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                  <HelpText>
                    {SHOW_MODE_OPTIONS.find(o => o.value === (formData.persistence?.show_mode || 'once'))?.description}
                  </HelpText>
                </FormGroup>
                {formData.persistence?.show_mode === 'cooldown' && (
                  <FormGroup>
                    <Label>Cooldown (days)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="365"
                      value={formData.persistence?.gap_hours ? Math.round(formData.persistence.gap_hours / 24) : 7}
                      onChange={(e) => {
                        const days = parseInt(e.target.value) || 7;
                        setFormData((p) => ({
                          ...p,
                          persistence: { ...p.persistence, gap_hours: days * 24 }
                        }));
                      }}
                    />
                    <HelpText>Wait this many days before showing again</HelpText>
                  </FormGroup>
                )}
              </FormGrid>
            </Section>

            <Section>
              <SectionTitle>Content Blocks</SectionTitle>
              <BlockPalette>
                {Object.keys(BLOCK_TEMPLATES).map((type) => (
                  <PaletteButton key={type} onClick={() => addBlock(type)}>
                    + {type.replace('_', ' ')}
                  </PaletteButton>
                ))}
              </BlockPalette>

              <BlocksList>
                {formData.variants[0]?.blocks.map((block, index) => (
                  <BlockItem key={block.id || index}>
                    <BlockHeader>
                      <BlockType>{block.type}</BlockType>
                      <BlockActions>
                        <SmallButton onClick={() => moveBlock(index, -1)} disabled={index === 0}>
                          &uarr;
                        </SmallButton>
                        <SmallButton
                          onClick={() => moveBlock(index, 1)}
                          disabled={index === formData.variants[0].blocks.length - 1}
                        >
                          &darr;
                        </SmallButton>
                        <SmallButton $danger onClick={() => removeBlock(index)}>
                          &times;
                        </SmallButton>
                      </BlockActions>
                    </BlockHeader>
                    <BlockEditor block={block} onChange={(updates) => updateBlock(index, updates)} />
                  </BlockItem>
                ))}
                {formData.variants[0]?.blocks.length === 0 && (
                  <EmptyBlocks>No blocks yet. Add blocks from the palette above.</EmptyBlocks>
                )}
              </BlocksList>
            </Section>
          </EditorMain>

          <EditorPreview>
            <PreviewTitle>Live Preview</PreviewTitle>
            <PreviewContainer $format={formData.format}>
              <AnnouncementRenderer
                blocks={formData.variants[0]?.blocks || []}
                onAction={(action) => console.log('Preview action:', action)}
              />
            </PreviewContainer>
          </EditorPreview>
        </EditorLayout>

        <ButtonGroup>
          <Button onClick={handleCancel}>Cancel</Button>
          <Button variant="primary" onClick={handleSave}>
            {editingId === 'new' ? 'Create' : 'Save Changes'}
          </Button>
        </ButtonGroup>
      </PanelContainer>
    );
  }

  // List view
  return (
    <PanelContainer>
      <Header>
        <HeaderTitle>Announcements</HeaderTitle>
        <Button variant="primary" onClick={handleCreate}>
          + New Announcement
        </Button>
      </Header>

      {message.text && <Message $type={message.type}>{message.text}</Message>}

      {announcements.length === 0 ? (
        <EmptyState>
          <EmptyTitle>No announcements yet</EmptyTitle>
          <EmptyText>Create your first announcement to get started.</EmptyText>
        </EmptyState>
      ) : (
        <AnnouncementList>
          {announcements.map((announcement) => (
            <AnnouncementCard key={announcement.id}>
              <CardHeader>
                <CardTitle>{announcement.title}</CardTitle>
                <StatusBadge $status={announcement.status}>{announcement.status}</StatusBadge>
              </CardHeader>
              <CardMeta>
                <MetaItem>Format: {announcement.format}</MetaItem>
                <MetaItem>Priority: {announcement.priority}</MetaItem>
                {announcement.stats && (
                  <>
                    <MetaItem>Views: {announcement.stats.views || 0}</MetaItem>
                    <MetaItem>Clicks: {announcement.stats.cta_clicks || 0}</MetaItem>
                  </>
                )}
              </CardMeta>
              <CardActions>
                <Button onClick={() => handleEdit(announcement)}>Edit</Button>
                <Button onClick={() => handleDuplicate(announcement)}>Duplicate</Button>
                <Button onClick={() => handleToggleStatus(announcement)}>
                  {announcement.status === 'active' ? 'Pause' : 'Activate'}
                </Button>
                <Button onClick={() => handlePushNow(announcement)} title="Push to all connected users now">
                  Push Now
                </Button>
                <Button onClick={() => handleTriggerNextVisit(announcement)} title="Show to all users on next visit">
                  Next Visit
                </Button>
                <Button variant="danger" onClick={() => handleDelete(announcement.id)}>
                  Delete
                </Button>
              </CardActions>
            </AnnouncementCard>
          ))}
        </AnnouncementList>
      )}
    </PanelContainer>
  );
}

// Reusable style fields for per-block styling - compact inline row
function StyleFields({ block, onChange }) {
  const style = block.style || {};
  const updateStyle = (updates) => {
    onChange({ style: { ...style, ...updates } });
  };

  return (
    <StyleFieldsRow>
      <StyleFieldLabel>bg</StyleFieldLabel>
      <ColorInput
        type="color"
        value={style.backgroundColor || '#ffffff'}
        onChange={(e) => updateStyle({ backgroundColor: e.target.value })}
      />
      {style.backgroundColor && (
        <ClearButton onClick={() => updateStyle({ backgroundColor: undefined })}>x</ClearButton>
      )}
      <StyleFieldLabel>text</StyleFieldLabel>
      <ColorInput
        type="color"
        value={style.textColor || '#000000'}
        onChange={(e) => updateStyle({ textColor: e.target.value })}
      />
      {style.textColor && (
        <ClearButton onClick={() => updateStyle({ textColor: undefined })}>x</ClearButton>
      )}
    </StyleFieldsRow>
  );
}

// Image block editor with upload support
function ImageBlockEditor({ block, onChange }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Invalid file type. Use JPEG, PNG, or WebP.');
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File too large. Maximum 10MB.');
      return;
    }

    setUploading(true);
    setUploadError('');

    try {
      const formData = new FormData();
      formData.append('image', file);

      const result = await adminUpload('/api/v1/uploads/image?type=general', formData);

      if (result.success && result.data?.primary_url) {
        onChange({ src: result.data.primary_url });
      } else {
        setUploadError('Upload failed. Please try again.');
      }
    } catch (err) {
      console.error('Image upload error:', err);
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      // Reset input so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <BlockFields>
      <FormGroup>
        <Label>Image</Label>
        <ImageInputRow>
          <Input
            value={block.src || ''}
            onChange={(e) => onChange({ src: e.target.value })}
            placeholder="https://... or upload"
            style={{ flex: 1 }}
          />
          <UploadButton
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? '...' : 'Upload'}
          </UploadButton>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={handleUpload}
            style={{ display: 'none' }}
          />
        </ImageInputRow>
        {uploadError && <UploadErrorText>{uploadError}</UploadErrorText>}
      </FormGroup>
      <FormGroup>
        <Label>Alt Text</Label>
        <Input
          value={block.alt || ''}
          onChange={(e) => onChange({ alt: e.target.value })}
          placeholder="Image description"
        />
      </FormGroup>
      <FormGroup>
        <Label>Width (px)</Label>
        <Input
          type="number"
          value={block.width ?? ''}
          onChange={(e) => onChange({ width: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
        />
      </FormGroup>
      <FormGroup>
        <Label>Height (px)</Label>
        <Input
          type="number"
          value={block.height ?? ''}
          onChange={(e) => onChange({ height: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
        />
      </FormGroup>
      <FormGroup>
        <Label>Alignment</Label>
        <Select value={block.alignment || 'center'} onChange={(e) => onChange({ alignment: e.target.value })}>
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </Select>
      </FormGroup>
      <StyleFields block={block} onChange={onChange} />
    </BlockFields>
  );
}

// Simple block editor for each block type
function BlockEditor({ block, onChange }) {
  switch (block.type) {
    case 'heading':
      return (
        <BlockFields>
          <FormGroup>
            <Label>Text</Label>
            <Input value={block.content || ''} onChange={(e) => onChange({ content: e.target.value })} />
          </FormGroup>
          <FormGroup>
            <Label>Size</Label>
            <Select value={block.size || 'h2'} onChange={(e) => onChange({ size: e.target.value })}>
              <option value="h1">H1 (Large)</option>
              <option value="h2">H2 (Medium)</option>
              <option value="h3">H3 (Small)</option>
            </Select>
          </FormGroup>
          <StyleFields block={block} onChange={onChange} />
        </BlockFields>
      );

    case 'paragraph':
      return (
        <BlockFields>
          <FormGroup>
            <Label>Text (HTML allowed)</Label>
            <TextArea
              value={block.content || ''}
              onChange={(e) => onChange({ content: e.target.value })}
              rows={3}
            />
          </FormGroup>
          <StyleFields block={block} onChange={onChange} />
        </BlockFields>
      );

    case 'button':
      return (
        <BlockFields>
          <FormGroup>
            <Label>Label</Label>
            <Input value={block.label || ''} onChange={(e) => onChange({ label: e.target.value })} />
          </FormGroup>
          <FormGroup>
            <Label>Action</Label>
            <Select value={block.action || 'dismiss'} onChange={(e) => onChange({ action: e.target.value })}>
              <option value="dismiss">Dismiss</option>
              <option value="navigate">Navigate</option>
              <option value="external_link">External Link</option>
            </Select>
          </FormGroup>
          {(block.action === 'navigate' || block.action === 'external_link') && (
            <FormGroup>
              <Label>URL</Label>
              <Input value={block.url || ''} onChange={(e) => onChange({ url: e.target.value })} />
            </FormGroup>
          )}
          <FormGroup>
            <Label>Variant</Label>
            <Select value={block.variant || 'primary'} onChange={(e) => onChange({ variant: e.target.value })}>
              <option value="primary">Primary</option>
              <option value="secondary">Secondary</option>
              <option value="danger">Danger</option>
            </Select>
          </FormGroup>
        </BlockFields>
      );

    case 'button_group':
      return (
        <BlockFields>
          <Label>Buttons (edit JSON)</Label>
          <TextArea
            value={JSON.stringify(block.buttons || [], null, 2)}
            onChange={(e) => {
              try {
                const buttons = JSON.parse(e.target.value);
                onChange({ buttons });
              } catch {}
            }}
            rows={6}
          />
          <StyleFields block={block} onChange={onChange} />
        </BlockFields>
      );

    case 'image':
      return (
        <ImageBlockEditor block={block} onChange={onChange} />
      );

    case 'info_box':
      return (
        <BlockFields>
          <FormGroup>
            <Label>Content</Label>
            <TextArea
              value={block.content || ''}
              onChange={(e) => onChange({ content: e.target.value })}
              rows={2}
            />
          </FormGroup>
          <FormGroup>
            <Label>Box Style</Label>
            <Select value={block.boxStyle || 'info'} onChange={(e) => onChange({ boxStyle: e.target.value })}>
              <option value="info">Info (Blue)</option>
              <option value="success">Success (Green)</option>
              <option value="warning">Warning (Orange)</option>
              <option value="danger">Danger (Red)</option>
            </Select>
          </FormGroup>
          <StyleFields block={block} onChange={onChange} />
        </BlockFields>
      );

    case 'flow_diagram':
    case 'icon_grid':
      return (
        <BlockFields>
          <Label>Configuration (edit JSON)</Label>
          <TextArea
            value={JSON.stringify(block, null, 2)}
            onChange={(e) => {
              try {
                const updated = JSON.parse(e.target.value);
                onChange(updated);
              } catch {}
            }}
            rows={8}
          />
          <StyleFields block={block} onChange={onChange} />
        </BlockFields>
      );

    case 'divider':
      return (
        <BlockFields>
          <FormGroup>
            <Label>Line Style</Label>
            <Select value={block.lineStyle || 'solid'} onChange={(e) => onChange({ lineStyle: e.target.value })}>
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
            </Select>
          </FormGroup>
          <StyleFields block={block} onChange={onChange} />
        </BlockFields>
      );

    case 'spacer':
      return (
        <BlockFields>
          <FormGroup>
            <Label>Height</Label>
            <Select value={block.height || 'md'} onChange={(e) => onChange({ height: e.target.value })}>
              <option value="sm">Small</option>
              <option value="md">Medium</option>
              <option value="lg">Large</option>
              <option value="xl">Extra Large</option>
            </Select>
          </FormGroup>
          <StyleFields block={block} onChange={onChange} />
        </BlockFields>
      );

    default:
      return <BlockFields>No editor for {block.type}</BlockFields>;
  }
}

// Styled components
const PanelContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: ${theme.spacing.xl};
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: ${theme.spacing.md};
`;

const HeaderTitle = styled.h2`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h3};
  text-transform: uppercase;
  letter-spacing: -0.5px;
`;

const BackButton = styled.button`
  background: none;
  border: none;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  cursor: pointer;
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  opacity: 0.7;
  &:hover { opacity: 1; }
`;

const LoadingText = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.6);
  padding: ${theme.spacing.xl};
  text-align: center;
`;

const Message = styled.div`
  padding: ${theme.spacing.md};
  border: 1px solid ${(props) => (props.$type === 'error' ? theme.colors.danger : theme.colors.success)};
  background: ${(props) => (props.$type === 'error' ? 'rgba(229, 62, 62, 0.1)' : 'rgba(76, 175, 80, 0.1)')};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl};
  background: rgba(0, 0, 0, 0.02);
  border: ${theme.borders.dashed} rgba(0, 0, 0, 0.1);
`;

const EmptyTitle = styled.h3`
  margin: 0 0 ${theme.spacing.sm} 0;
  font-family: ${theme.fonts.primary};
`;

const EmptyText = styled.p`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  opacity: 0.6;
`;

const AnnouncementList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const AnnouncementCard = styled.div`
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  padding: ${theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const CardTitle = styled.h3`
  margin: 0;
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
`;

const StatusBadge = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  padding: 2px 8px;
  background: ${(props) => {
    switch (props.$status) {
      case 'active': return 'rgba(76, 175, 80, 0.2)';
      case 'paused': return 'rgba(221, 107, 32, 0.2)';
      case 'archived': return 'rgba(0, 0, 0, 0.1)';
      default: return 'rgba(71, 159, 242, 0.2)';
    }
  }};
`;

const CardMeta = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
`;

const MetaItem = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  opacity: 0.6;
`;

const CardActions = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
`;

// Editor styles
const EditorLayout = styled.div`
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: ${theme.spacing.lg};

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
`;

const EditorMain = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const EditorPreview = styled.div`
  position: sticky;
  top: ${theme.spacing.md};
  height: fit-content;
`;

const PreviewTitle = styled.h4`
  margin: 0 0 ${theme.spacing.sm} 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const PreviewContainer = styled.div`
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solid} ${theme.colors.black};
  padding: ${theme.spacing.lg};
  max-height: 600px;
  overflow-y: auto;
`;

const Section = styled.div`
  background: rgba(0, 0, 0, 0.02);
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.08);
  padding: ${theme.spacing.md};
`;

const SectionTitle = styled.h3`
  margin: 0 0 ${theme.spacing.md} 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${theme.spacing.md};
`;

const FormGroup = styled.label`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const Label = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.7;
`;

const CheckboxList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const CheckboxRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.sm} ${theme.spacing.md};
`;

const CheckboxItem = styled.label`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  cursor: pointer;
`;

const BlockPalette = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
  margin-bottom: ${theme.spacing.md};
`;

const PaletteButton = styled.button`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: capitalize;
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.2);
  cursor: pointer;
  &:hover {
    background: rgba(0, 0, 0, 0.05);
  }
`;

const BlocksList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const BlockItem = styled.div`
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  padding: ${theme.spacing.sm};
`;

const BlockHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${theme.spacing.sm};
  padding-bottom: ${theme.spacing.xs};
  border-bottom: 1px dashed rgba(0, 0, 0, 0.1);
`;

const BlockType = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: bold;
`;

const BlockActions = styled.div`
  display: flex;
  gap: 4px;
`;

const SmallButton = styled.button`
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(props) => (props.$danger ? 'rgba(229, 62, 62, 0.1)' : 'rgba(0, 0, 0, 0.05)')};
  border: none;
  cursor: pointer;
  font-size: 14px;
  &:hover {
    background: ${(props) => (props.$danger ? 'rgba(229, 62, 62, 0.2)' : 'rgba(0, 0, 0, 0.1)')};
  }
  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
`;

const BlockFields = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const TextArea = styled.textarea`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  padding: ${theme.spacing.sm};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.2);
  resize: vertical;
  min-height: 60px;
`;

const EmptyBlocks = styled.div`
  text-align: center;
  padding: ${theme.spacing.lg};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  opacity: 0.5;
  border: ${theme.borders.dashed} rgba(0, 0, 0, 0.1);
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  justify-content: flex-end;
  padding-top: ${theme.spacing.md};
  border-top: ${theme.borders.solidThin} rgba(0, 0, 0, 0.1);
`;

const HelpText = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  opacity: 0.5;
  font-style: italic;
`;

const StyleFieldsRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: ${theme.spacing.xs};
  padding-top: ${theme.spacing.xs};
  border-top: 1px dashed rgba(0, 0, 0, 0.08);
`;

const StyleFieldLabel = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  text-transform: uppercase;
  opacity: 0.5;
`;

const ColorInput = styled.input`
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid rgba(0, 0, 0, 0.2);
  cursor: pointer;
  &::-webkit-color-swatch-wrapper {
    padding: 1px;
  }
  &::-webkit-color-swatch {
    border: none;
  }
`;

const ClearButton = styled.button`
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  width: 16px;
  height: 16px;
  padding: 0;
  background: rgba(0, 0, 0, 0.1);
  border: none;
  border-radius: 2px;
  cursor: pointer;
  opacity: 0.5;
  line-height: 1;
  &:hover {
    background: rgba(0, 0, 0, 0.2);
    opacity: 1;
  }
`;

const ImageInputRow = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  align-items: center;
`;

const UploadButton = styled.button`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  background: ${theme.colors.fpwhite};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.2);
  cursor: pointer;
  white-space: nowrap;
  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.05);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const UploadErrorText = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.danger};
`;
