import React, { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { theme, Button, Input } from '@shared/styles/GlobalStyles';
import { StatusMessage } from './shared';
import useAuthenticatedApi from '../hooks/useAuthenticatedApi';
import {
  getAllLandingPageLinks,
  createLandingPageLink,
  updateLandingPageLink,
  deleteLandingPageLink,
  pruneStaleTop10Links
} from '../services/landingPageLinksService';
import ImageUpload from './ImageUpload';

const Surface = styled.div`
  background: ${theme.colors.background};
  border-radius: 12px;
  padding: 32px;
  margin-bottom: 24px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid ${theme.colors.border};
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const Title = styled.h2`
  font-size: 24px;
  font-weight: 600;
  color: ${theme.colors.text};
  margin: 0;
`;

const Section = styled.div`
  margin-bottom: 32px;
`;

const SectionHeader = styled.div`
  margin-bottom: 16px;
`;

const SectionTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: ${theme.colors.text};
  margin: 0 0 4px 0;
`;

const SectionHint = styled.p`
  font-size: 14px;
  color: ${theme.colors.textSecondary};
  margin: 0;
`;

const LinkCard = styled.div`
  background: ${theme.colors.surface};
  border: 1px solid ${theme.colors.border};
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
`;

const LinkCardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
`;

const LinkCardTitle = styled.div`
  flex: 1;
`;

const LinkCardH4 = styled.h4`
  font-size: 16px;
  font-weight: 600;
  color: ${theme.colors.text};
  margin: 0 0 4px 0;
`;

const LinkCardSubtitle = styled.div`
  font-size: 14px;
  color: ${theme.colors.textSecondary};
`;

const LinkCardActions = styled.div`
  display: flex;
  gap: 8px;
`;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
`;

const Label = styled.label`
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: ${theme.colors.text};
  margin-bottom: 6px;
`;

const ColorInput = styled.input`
  width: 100%;
  height: 40px;
  border: 1px solid ${theme.colors.border};
  border-radius: 6px;
  cursor: pointer;
`;

const ImagePreview = styled.div`
  margin-top: 8px;
  img {
    max-width: 200px;
    max-height: 200px;
    border-radius: 8px;
  }
`;

const Badge = styled.span`
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  background: ${props => props.published ? theme.colors.success : theme.colors.textSecondary};
  color: white;
`;

const LandingPageLinksAdmin = () => {
  const { isAuthenticated } = useAuthenticatedApi();
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [editingId, setEditingId] = useState(null);
  const [pruningTop10, setPruningTop10] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    subtitle: '',
    url: '',
    image: '',
    tags: '',
    content_tag: '',
    content_tag_color: '#667eea',
    published: false,
    priority: 0
  });

  const loadLinks = useCallback(async () => {
    setLoading(true);
    try {
      const fetchedLinks = await getAllLandingPageLinks();
      setLinks(fetchedLinks);
    } catch (error) {
      console.error('[LandingPageLinksAdmin] Failed to load links', error);
      setStatus({ type: 'error', message: 'Failed to load landing page links' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadLinks();
    }
  }, [isAuthenticated, loadLinks]);

  const resetForm = useCallback(() => {
    setFormData({
      title: '',
      subtitle: '',
      url: '',
      image: '',
      tags: '',
      content_tag: '',
      content_tag_color: '#667eea',
      published: false,
      priority: 0
    });
    setEditingId(null);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!formData.title || !formData.url) {
      setStatus({ type: 'error', message: 'Title and URL are required' });
      return;
    }

    try {
      const newLink = await createLandingPageLink(formData);
      if (newLink) {
        setLinks(prev => [...prev, newLink]);
        resetForm();
        setStatus({ type: 'success', message: 'Landing page link created successfully' });
      }
    } catch (error) {
      console.error('[LandingPageLinksAdmin] Failed to create link', error);
      setStatus({ type: 'error', message: 'Failed to create landing page link' });
    }
  }, [formData, resetForm]);

  const handleUpdate = useCallback(async () => {
    if (!editingId || !formData.title || !formData.url) {
      setStatus({ type: 'error', message: 'Title and URL are required' });
      return;
    }

    try {
      const updatedLink = await updateLandingPageLink(editingId, formData);
      if (updatedLink) {
        setLinks(prev => prev.map(link => link.id === editingId ? updatedLink : link));
        resetForm();
        setStatus({ type: 'success', message: 'Landing page link updated successfully' });
      }
    } catch (error) {
      console.error('[LandingPageLinksAdmin] Failed to update link', error);
      setStatus({ type: 'error', message: 'Failed to update landing page link' });
    }
  }, [editingId, formData, resetForm]);

  const handleDelete = useCallback(async (id) => {
    if (!confirm('Are you sure you want to delete this landing page link?')) {
      return;
    }

    try {
      const success = await deleteLandingPageLink(id);
      if (success) {
        setLinks(prev => prev.filter(link => link.id !== id));
        setStatus({ type: 'success', message: 'Landing page link deleted successfully' });
      }
    } catch (error) {
      console.error('[LandingPageLinksAdmin] Failed to delete link', error);
      setStatus({ type: 'error', message: 'Failed to delete landing page link' });
    }
  }, []);

  const handlePruneTop10 = useCallback(async () => {
    if (pruningTop10) return;
    const ok = confirm('Prune stale Top 10 links? This will unpublish cards whose Top 10 no longer exists.');
    if (!ok) return;

    setPruningTop10(true);
    try {
      const result = await pruneStaleTop10Links();
      await loadLinks();

      const staleCount = Number(result?.stale ?? 0);
      const unpublishedCount = Number(result?.unpublished ?? 0);

      if (!staleCount) {
        setStatus({ type: 'info', message: 'No stale Top 10 links found.' });
      } else if (!unpublishedCount) {
        setStatus({ type: 'info', message: `${staleCount} stale Top 10 link(s) already unpublished.` });
      } else {
        setStatus({ type: 'success', message: `Unpublished ${unpublishedCount} stale Top 10 link(s).` });
      }
    } catch (error) {
      console.error('[LandingPageLinksAdmin] Failed to prune Top 10 links', error);
      setStatus({ type: 'error', message: 'Failed to prune stale Top 10 links' });
    } finally {
      setPruningTop10(false);
    }
  }, [loadLinks, pruningTop10]);

  const handleEdit = useCallback((link) => {
    setEditingId(link.id);
    setFormData({
      title: link.title || '',
      subtitle: link.subtitle || '',
      url: link.url || '',
      image: link.image || '',
      tags: link.tags || '',
      content_tag: link.content_tag || '',
      content_tag_color: link.content_tag_color || '#667eea',
      published: Boolean(link.published),
      priority: link.priority || 0
    });
  }, []);

  const handleImageUpload = useCallback((imageUrl) => {
    setFormData(prev => ({ ...prev, image: imageUrl || '' }));
    if (imageUrl) {
      setStatus({ type: 'success', message: 'Image uploaded successfully' });
      return;
    }
    setStatus({ type: 'info', message: 'Image removed' });
  }, []);

  if (!isAuthenticated) {
    return <div>Authenticate to manage landing page links.</div>;
  }

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <Surface>
      <Header>
        <Title>Landing Page Link Cards</Title>
        <HeaderActions>
          <Button onClick={handlePruneTop10} variant="secondary" disabled={pruningTop10}>
            {pruningTop10 ? 'Pruning...' : 'Prune stale Top 10 links'}
          </Button>
        </HeaderActions>
      </Header>

      {status.message && <StatusMessage type={status.type} message={status.message} />}

      <Section>
        <SectionHeader>
          <SectionTitle>{editingId ? 'Edit Link Card' : 'Create New Link Card'}</SectionTitle>
          <SectionHint>Create custom link cards that appear on the landing page</SectionHint>
        </SectionHeader>

        <FieldGrid>
          <div>
            <Label>Title *</Label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Card title"
            />
          </div>
          <div>
            <Label>Subtitle (appears like curator name)</Label>
            <Input
              value={formData.subtitle}
              onChange={(e) => setFormData(prev => ({ ...prev, subtitle: e.target.value }))}
              placeholder="Subtitle text"
            />
          </div>
        </FieldGrid>

        <FieldGrid>
          <div>
            <Label>URL *</Label>
            <Input
              value={formData.url}
              onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
              placeholder="https://example.com"
            />
          </div>
          <div>
            <Label>Tags (comma separated)</Label>
            <Input
              value={formData.tags}
              onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
              placeholder="Electronic, Ambient"
            />
          </div>
        </FieldGrid>

        <FieldGrid>
          <div>
            <Label>Content Tag Label</Label>
            <Input
              value={formData.content_tag}
              onChange={(e) => setFormData(prev => ({ ...prev, content_tag: e.target.value }))}
              placeholder="Featured, Special, etc."
            />
          </div>
          <div>
            <Label>Content Tag Color</Label>
            <ColorInput
              type="color"
              value={formData.content_tag_color}
              onChange={(e) => setFormData(prev => ({ ...prev, content_tag_color: e.target.value }))}
            />
          </div>
        </FieldGrid>

        <FieldGrid>
          <div>
            <Label>Priority (higher = appears first)</Label>
            <Input
              type="number"
              value={formData.priority}
              onChange={(e) => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
              placeholder="0"
            />
          </div>
          <div>
            <Label>Published</Label>
            <Input
              type="checkbox"
              checked={formData.published}
              onChange={(e) => setFormData(prev => ({ ...prev, published: e.target.checked }))}
              style={{ width: 'auto', height: 'auto' }}
            />
          </div>
        </FieldGrid>

        <div>
          <Label>Cover Image</Label>
          <ImageUpload
            currentImage={formData.image}
            onImageUpload={handleImageUpload}
            uploadType="playlists"
            hideHeader
            frameless
            compact
            uploadHint="JPEG, PNG, WebP • Max 10MB • 1200px square recommended"
          />
        </div>

        <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
          <Button onClick={editingId ? handleUpdate : handleCreate} variant="primary">
            {editingId ? 'Update Link Card' : 'Create Link Card'}
          </Button>
          {editingId && (
            <Button onClick={resetForm} variant="secondary">
              Cancel Edit
            </Button>
          )}
        </div>
      </Section>

      <Section>
        <SectionHeader>
          <SectionTitle>Existing Link Cards ({links.length})</SectionTitle>
          <SectionHint>Manage your landing page link cards</SectionHint>
        </SectionHeader>

        {links.map(link => (
          <LinkCard key={link.id}>
            <LinkCardHeader>
              <LinkCardTitle>
                <LinkCardH4>{link.title}</LinkCardH4>
                {link.subtitle && <LinkCardSubtitle>{link.subtitle}</LinkCardSubtitle>}
                <LinkCardSubtitle>{link.url}</LinkCardSubtitle>
                <div style={{ marginTop: '8px' }}>
                  <Badge published={link.published}>
                    {link.published ? 'Published' : 'Draft'}
                  </Badge>
                  {link.content_tag && (
                    <span style={{
                      marginLeft: '8px',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: link.content_tag_color || '#667eea',
                      color: 'white'
                    }}>
                      {link.content_tag}
                    </span>
                  )}
                </div>
              </LinkCardTitle>
              <LinkCardActions>
                <Button onClick={() => handleEdit(link)} variant="secondary">
                  Edit
                </Button>
                <Button onClick={() => handleDelete(link.id)} variant="secondary">
                  Delete
                </Button>
              </LinkCardActions>
            </LinkCardHeader>
            {link.image && (
              <ImagePreview>
                <img src={link.image} alt={link.title} />
              </ImagePreview>
            )}
          </LinkCard>
        ))}
      </Section>
    </Surface>
  );
};

export default LandingPageLinksAdmin;
