import PropTypes from 'prop-types';
import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { useAuth } from '@shared/contexts/AuthContext';
import { formatDateForDisplay } from '../../../utils/curatorValidation';
import {
  Button,
  FormField,
  Input,
  Select,
  TextArea,
  SectionCard,
  SectionHeader,
  SectionTitle,
  SectionSubtitle,
  Stack,
  Badge,
  List,
  ListItem,
  EmptyState,
  tokens
} from './ui';

const RELEASE_TYPES = [
  { value: 'single', label: 'Single' },
  { value: 'double-single', label: 'Double Single' },
  { value: 'EP', label: 'EP' },
  { value: 'album', label: 'Album' },
  { value: 'live album', label: 'Live Album' },
  { value: 'remix', label: 'Remix' },
  { value: 'remaster', label: 'Remaster' }
];

const PLATFORM_OPTIONS = [
  { value: 'spotify', label: 'Spotify' },
  { value: 'apple_music', label: 'Apple Music' },
  { value: 'tidal', label: 'Tidal' },
  { value: 'bandcamp', label: 'Bandcamp' },
  { value: 'youtube_music', label: 'YouTube Music' },
  { value: 'amazon_music', label: 'Amazon Music' },
  { value: 'deezer', label: 'Deezer' },
  { value: 'website', label: 'Website' },
  { value: 'custom', label: 'Custom' }
];

const SEARCHABLE_PLATFORMS = ['spotify', 'apple_music', 'tidal', 'youtube_music', 'deezer'];

const ASSET_TYPES = [
  { value: 'press_image', label: 'Press Image' },
  { value: 'hero_image', label: 'Hero Image' },
  { value: 'clip', label: 'Video Clip' }
];

const EDITOR_TABS = [
  { key: 'core', label: 'Core Details' },
  { key: 'epk', label: 'EPK Assets' },
  { key: 'distribution', label: 'Links & Publishing' }
];

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

const createClientId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now()}`;

const blankForm = {
  artist_name: '',
  title: '',
  release_type: 'single',
  release_date: '',
  post_date: '',
  genres: '',
  description: '',
  video_url: '',
  artwork_url: '',
  is_published: false,
  artist_bio_topline: '',
  artist_bio_subtext: '',
  artist_bio_image_url: '',
  show_video: true,
  show_images: true,
  show_about: true,
  show_shows: true,
  sort_order: ''
};

const blankShow = {
  show_date: '',
  venue: '',
  city: '',
  country: '',
  ticket_url: '',
  notes: ''
};

const parseGenres = (value) => {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const normalizeActions = (actions) => actions
  .map((action, index) => ({
    platform_key: action.platform_key || 'custom',
    label: action.label ? String(action.label).trim() : null,
    url: action.url ? String(action.url).trim() : '',
    icon_mode: action.icon_mode || 'platform',
    sort_order: index
  }))
  .filter((action) => action.url);

const normalizeAssets = (assets) => assets
  .map((asset, index) => ({
    asset_type: asset.asset_type || 'press_image',
    url: asset.url ? String(asset.url).trim() : '',
    attribution: asset.attribution ? String(asset.attribution).trim() : null,
    allow_download: asset.allow_download !== false,
    sort_order: index
  }))
  .filter((asset) => asset.url);

const reorderList = (list, fromIndex, toIndex) => {
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
};

const CuratorReleasesPanel = ({ curator, adminOverride }) => {
  const { authenticatedFetch } = useAuth();
  const [releases, setReleases] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingReleaseId, setEditingReleaseId] = useState(null);
  const [formData, setFormData] = useState(blankForm);
  const [actions, setActions] = useState([]);
  const [assets, setAssets] = useState([]);
  const [shows, setShows] = useState([]);
  const [passwordValue, setPasswordValue] = useState('');
  const [removePassword, setRemovePassword] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [draggingAssetIndex, setDraggingAssetIndex] = useState(null);
  const [draggingShowIndex, setDraggingShowIndex] = useState(null);
  const [uploadingArtwork, setUploadingArtwork] = useState(false);
  const [uploadingBioImage, setUploadingBioImage] = useState(false);
  const [uploadingAssetIndex, setUploadingAssetIndex] = useState(null);
  const [findingLinks, setFindingLinks] = useState(false);
  const [linkStatus, setLinkStatus] = useState({});
  const [activeEditorTab, setActiveEditorTab] = useState('core');

  const hasAccess = useMemo(() => {
    if (!curator) return false;
    if (adminOverride) return true;
    if (curator.upcoming_releases_enabled !== true) return false;
    const profileType = curator.profile_type || curator.type;
    return RELEASE_PROFILE_TYPES.has(profileType);
  }, [adminOverride, curator]);

  const epkChecklist = useMemo(() => {
    const hasArtwork = Boolean(formData.artwork_url?.trim());
    const hasDescription = Boolean(formData.description?.trim());
    const hasLinks = actions.some((action) => action.url?.trim());
    const hasPressAssets = assets.some((asset) => asset.url?.trim());
    const hasVideo = !formData.show_video || Boolean(formData.video_url?.trim());
    const hasBio = !formData.show_about || Boolean(
      formData.artist_bio_topline?.trim() ||
      formData.artist_bio_subtext?.trim() ||
      formData.artist_bio_image_url?.trim()
    );
    const hasShows = !formData.show_shows || shows.some((show) => show.show_date?.trim());

    return [
      { key: 'artwork', label: 'Artwork', complete: hasArtwork },
      { key: 'description', label: 'Description', complete: hasDescription },
      { key: 'links', label: 'Streaming Links', complete: hasLinks },
      { key: 'assets', label: 'Press Assets', complete: hasPressAssets },
      { key: 'video', label: 'Video', complete: hasVideo },
      { key: 'bio', label: 'Artist Bio', complete: hasBio },
      { key: 'shows', label: 'Tour Dates', complete: hasShows }
    ];
  }, [actions, assets, formData, shows]);

  const epkReadyCount = useMemo(
    () => epkChecklist.filter((item) => item.complete).length,
    [epkChecklist]
  );

  useEffect(() => {
    if (!curator?.id || !hasAccess) {
      setReleases([]);
      return;
    }

    const loadReleases = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await authenticatedFetch(`/api/v1/curators/${curator.id}/releases`);
        const data = await response.json();
        if (data.success) {
          setReleases(data.data || []);
        } else {
          setError(data.error || 'Failed to load releases');
        }
      } catch (err) {
        console.error('Failed to load releases', err);
        setError(err.message || 'Failed to load releases');
      } finally {
        setLoading(false);
      }
    };

    loadReleases();
  }, [authenticatedFetch, curator?.id, hasAccess]);

  const resetForm = () => {
    setFormData(blankForm);
    setActions([]);
    setAssets([]);
    setShows([]);
    setEditingReleaseId(null);
    setPasswordValue('');
    setRemovePassword(false);
    setImportUrl('');
    setUploadingArtwork(false);
    setUploadingBioImage(false);
    setUploadingAssetIndex(null);
    setFindingLinks(false);
    setLinkStatus({});
    setActiveEditorTab('core');
    setFormOpen(false);
  };

  const openCreateForm = () => {
    setFormData(blankForm);
    setActions([]);
    setAssets([]);
    setShows([]);
    setEditingReleaseId(null);
    setPasswordValue('');
    setRemovePassword(false);
    setImportUrl('');
    setUploadingArtwork(false);
    setUploadingBioImage(false);
    setUploadingAssetIndex(null);
    setFindingLinks(false);
    setLinkStatus({});
    setActiveEditorTab('core');
    setFormOpen(true);
  };

  const loadReleaseDetails = async (releaseId) => {
    setLoading(true);
    setError('');
    try {
      const response = await authenticatedFetch(`/api/v1/releases/${releaseId}`);
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to load release');
      }
      const release = data.data;
      setEditingReleaseId(release.id);
      setFormData({
        artist_name: release.artist_name || '',
        title: release.title || '',
        release_type: release.release_type || 'single',
        release_date: release.release_date || '',
        post_date: release.post_date || '',
        genres: Array.isArray(release.genres) ? release.genres.join(', ') : '',
        description: release.description || '',
        video_url: release.video_url || '',
        artwork_url: release.artwork_url || '',
        is_published: Boolean(release.is_published),
        artist_bio_topline: release.artist_bio_topline || '',
        artist_bio_subtext: release.artist_bio_subtext || '',
        artist_bio_image_url: release.artist_bio_image_url || '',
        show_video: release.show_video !== false,
        show_images: release.show_images !== false,
        show_about: release.show_about !== false,
        show_shows: release.show_shows !== false,
        sort_order: release.sort_order ?? ''
      });
      setActions((release.actions || []).map((action) => ({
        ...action,
        client_id: action.id || createClientId('action')
      })));
      setAssets((release.assets || []).map((asset) => ({
        ...asset,
        client_id: asset.id || createClientId('asset')
      })));
      setShows((release.shows || []).map((show) => ({
        ...show,
        client_id: show.id || createClientId('show')
      })));
      setPasswordValue('');
      setRemovePassword(false);
      setActiveEditorTab('core');
      setFormOpen(true);
    } catch (err) {
      console.error('Failed to load release details', err);
      setError(err.message || 'Failed to load release');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRelease = async (releaseId) => {
    if (!window.confirm('Delete this release? This cannot be undone.')) return;
    try {
      const response = await authenticatedFetch(`/api/v1/releases/${releaseId}`, { method: 'DELETE' });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to delete release');
      }
      setStatus('Release deleted.');
      setReleases((prev) => prev.filter((release) => release.id !== releaseId));
      if (editingReleaseId === releaseId) {
        resetForm();
      }
    } catch (err) {
      console.error('Failed to delete release', err);
      setError(err.message || 'Failed to delete release');
    }
  };

  const handleTogglePublish = async (release) => {
    const newState = !release.is_published;
    const action = newState ? 'publish' : 'unpublish';
    if (!window.confirm(`${newState ? 'Publish' : 'Unpublish'} "${release.title}"?`)) return;
    try {
      const response = await authenticatedFetch(`/api/v1/releases/${release.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_published: newState })
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || `Failed to ${action} release`);
      }
      setStatus(`Release ${newState ? 'published' : 'unpublished'}.`);
      setReleases((prev) => prev.map((r) => (r.id === release.id ? { ...r, is_published: newState } : r)));
    } catch (err) {
      console.error(`Failed to ${action} release`, err);
      setError(err.message || `Failed to ${action} release`);
    }
  };

  const handleUploadArtwork = async (file) => {
    if (!file) return;
    setUploadingArtwork(true);
    setError('');
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('image', file);
      const response = await authenticatedFetch('/api/v1/uploads/image?type=releases', {
        method: 'POST',
        body: formDataUpload
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Upload failed');
      }
      setFormData((prev) => ({ ...prev, artwork_url: data.data?.primary_url || '' }));
    } catch (err) {
      console.error('Artwork upload failed', err);
      setError(err.message || 'Artwork upload failed');
    } finally {
      setUploadingArtwork(false);
    }
  };

  const handleUploadBioImage = async (file) => {
    if (!file) return;
    setUploadingBioImage(true);
    setError('');
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('image', file);
      const response = await authenticatedFetch('/api/v1/uploads/image?type=releases', {
        method: 'POST',
        body: formDataUpload
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Upload failed');
      }
      setFormData((prev) => ({ ...prev, artist_bio_image_url: data.data?.primary_url || '' }));
    } catch (err) {
      console.error('Bio image upload failed', err);
      setError(err.message || 'Bio image upload failed');
    } finally {
      setUploadingBioImage(false);
    }
  };

  const handleAssetUpload = async (index, file) => {
    if (!file) return;
    setUploadingAssetIndex(index);
    setError('');
    try {
      const isVideo = file.type.startsWith('video/');
      const formDataUpload = new FormData();
      formDataUpload.append(isVideo ? 'video' : 'image', file);
      const endpoint = isVideo ? '/api/v1/uploads/video?type=releases' : '/api/v1/uploads/image?type=releases';
      const response = await authenticatedFetch(endpoint, {
        method: 'POST',
        body: formDataUpload
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Upload failed');
      }
      const url = isVideo ? data.data?.url : data.data?.primary_url;
      setAssets((prev) => prev.map((asset, assetIndex) => (
        assetIndex === index ? { ...asset, url } : asset
      )));
    } catch (err) {
      console.error('Asset upload failed', err);
      setError(err.message || 'Asset upload failed');
    } finally {
      setUploadingAssetIndex(null);
    }
  };

  const handleImportFromUrl = async () => {
    if (!importUrl.trim()) return;
    setError('');
    try {
      const response = await authenticatedFetch('/api/v1/releases/import/url', {
        method: 'POST',
        body: JSON.stringify({ url: importUrl.trim() })
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Import failed');
      }
      const payload = data.data || {};
      setFormData((prev) => ({
        ...prev,
        title: payload.title || prev.title,
        artist_name: payload.artist_name || prev.artist_name,
        release_date: payload.release_date || prev.release_date,
        release_type: payload.release_type || prev.release_type,
        artwork_url: payload.artwork_url || prev.artwork_url,
        video_url: payload.video_url || prev.video_url,
        genres: Array.isArray(payload.genres) && payload.genres.length ? payload.genres.join(', ') : prev.genres
      }));
      if (payload.suggested_actions?.length) {
        setActions((prev) => {
          const existingUrls = new Set(prev.map((action) => action.url));
          const next = [...prev];
          payload.suggested_actions.forEach((action) => {
            if (action.url && !existingUrls.has(action.url)) {
              next.push({
                ...action,
                client_id: createClientId('action')
              });
            }
          });
          return next;
        });
      }
      setImportUrl('');
      setStatus('Import applied with cross-platform links.');
    } catch (err) {
      console.error('Import failed', err);
      setError(err.message || 'Import failed');
    }
  };

  const handleFindLinks = async () => {
    if (!formData.artist_name.trim() || !formData.title.trim()) {
      setError('Enter artist name and title first to find platform links.');
      return;
    }

    setFindingLinks(true);
    setError('');
    setLinkStatus({});

    try {
      const existingPlatforms = actions
        .filter((a) => a.url?.trim())
        .map((a) => a.platform_key);

      const response = await authenticatedFetch('/api/v1/releases/find-links', {
        method: 'POST',
        body: JSON.stringify({
          artist_name: formData.artist_name.trim(),
          title: formData.title.trim(),
          existing_platforms: existingPlatforms
        })
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to find links');
      }

      setLinkStatus(data.data.status || {});

      if (data.data.found_links?.length) {
        setActions((prev) => {
          const existingUrls = new Set(prev.map((action) => action.url));
          const next = [...prev];
          data.data.found_links.forEach((link) => {
            if (link.url && !existingUrls.has(link.url)) {
              next.push({
                ...link,
                client_id: createClientId('action')
              });
            }
          });
          return next;
        });
        setStatus(`Found ${data.data.found_links.length} platform link(s).`);
      } else {
        setStatus('No additional platform links found.');
      }
    } catch (err) {
      console.error('Find links failed', err);
      setError(err.message || 'Failed to find platform links');
    } finally {
      setFindingLinks(false);
    }
  };

  const handleSaveRelease = async () => {
    if (!curator?.id) return;
    setSaving(true);
    setError('');
    setStatus('');

    const releasePayload = {
      artist_name: formData.artist_name,
      title: formData.title,
      release_type: formData.release_type,
      release_date: formData.release_date || null,
      post_date: formData.post_date || null,
      genres: parseGenres(formData.genres),
      description: formData.description || null,
      video_url: formData.video_url || null,
      artwork_url: formData.artwork_url || null,
      is_published: formData.is_published,
      artist_bio_topline: formData.artist_bio_topline || null,
      artist_bio_subtext: formData.artist_bio_subtext || null,
      artist_bio_image_url: formData.artist_bio_image_url || null,
      show_video: formData.show_video,
      show_images: formData.show_images,
      show_about: formData.show_about,
      show_shows: formData.show_shows
    };

    if (formData.sort_order !== '') {
      releasePayload.sort_order = Number(formData.sort_order);
    }

    const actionsPayload = normalizeActions(actions);
    const assetsPayload = normalizeAssets(assets);
    const showsPayload = shows
      .filter((show) => show.show_date)
      .map((show, index) => ({
        show_date: show.show_date,
        venue: show.venue || null,
        city: show.city || null,
        country: show.country || null,
        ticket_url: show.ticket_url || null,
        notes: show.notes || null,
        sort_order: index
      }));

    try {
      if (editingReleaseId) {
        const updateResponse = await authenticatedFetch(`/api/v1/releases/${editingReleaseId}`, {
          method: 'PUT',
          body: JSON.stringify(releasePayload)
        });
        const updateData = await updateResponse.json();
        if (!updateData.success) {
          throw new Error(updateData.error || 'Failed to update release');
        }

        await Promise.all([
          authenticatedFetch(`/api/v1/releases/${editingReleaseId}/actions`, {
            method: 'POST',
            body: JSON.stringify({ actions: actionsPayload })
          }),
          authenticatedFetch(`/api/v1/releases/${editingReleaseId}/assets`, {
            method: 'POST',
            body: JSON.stringify({ assets: assetsPayload })
          }),
          authenticatedFetch(`/api/v1/releases/${editingReleaseId}/shows`, {
            method: 'POST',
            body: JSON.stringify({ shows: showsPayload })
          })
        ]);

        if (removePassword) {
          await authenticatedFetch(`/api/v1/releases/${editingReleaseId}/password`, {
            method: 'PUT',
            body: JSON.stringify({ password: null })
          });
        } else if (passwordValue.trim()) {
          await authenticatedFetch(`/api/v1/releases/${editingReleaseId}/password`, {
            method: 'PUT',
            body: JSON.stringify({ password: passwordValue.trim() })
          });
        }

        setStatus('Release updated.');
      } else {
        const createResponse = await authenticatedFetch(`/api/v1/curators/${curator.id}/releases`, {
          method: 'POST',
          body: JSON.stringify({
            ...releasePayload,
            actions: actionsPayload,
            assets: assetsPayload,
            shows: showsPayload,
            password: passwordValue.trim() ? passwordValue.trim() : undefined
          })
        });
        const createData = await createResponse.json();
        if (!createData.success) {
          throw new Error(createData.error || 'Failed to create release');
        }
        setStatus('Release created.');
      }

      const refreshed = await authenticatedFetch(`/api/v1/curators/${curator.id}/releases`);
      const refreshedData = await refreshed.json();
      if (refreshedData.success) {
        setReleases(refreshedData.data || []);
      }
      resetForm();
    } catch (err) {
      console.error('Failed to save release', err);
      setError(err.message || 'Failed to save release');
    } finally {
      setSaving(false);
    }
  };

  if (!hasAccess) {
    return (
      <SectionCard>
        <SectionHeader>
          <SectionTitle>Releases</SectionTitle>
          <SectionSubtitle>Release pages are currently disabled for this curator.</SectionSubtitle>
        </SectionHeader>
      </SectionCard>
    );
  }

  return (
    <SectionCard>
      <SectionHeader>
        <div>
          <SectionTitle>Releases</SectionTitle>
          <SectionSubtitle>Build curated release pages with actions, assets, and show visibility.</SectionSubtitle>
        </div>
        <Button $variant="primary" $size="md" onClick={openCreateForm}>New Release</Button>
      </SectionHeader>

      <Stack $gap={tokens.componentSpacing.formGap}>
        {adminOverride && curator?.upcoming_releases_enabled !== true && (
          <StatusBanner $variant="warning">
            Admin override active. Release posts can be created and edited even while this curator gate is disabled.
          </StatusBanner>
        )}
        {error && <StatusBanner $variant="error" role="alert">{error}</StatusBanner>}
        {status && <StatusBanner $variant="success">{status}</StatusBanner>}

        {loading && <StatusBanner>Loading releases…</StatusBanner>}

        {!loading && releases.length === 0 && (
          <EmptyState>
            <p>No releases yet. Create your first release to get started.</p>
          </EmptyState>
        )}

        {!loading && releases.length > 0 && (
          <List>
            {releases.map((release) => (
              <ListItem key={release.id}>
                <ReleaseHeader>
                  <div>
                    <h4>{release.title}</h4>
                    <span>{release.artist_name}</span>
                  </div>
                  <Badge $variant={release.is_published ? 'success' : 'warning'}>
                    {release.is_published ? 'Published' : 'Draft'}
                  </Badge>
                </ReleaseHeader>
                <ReleaseMeta>
                  {release.release_date && (
                    <span>{formatDateForDisplay(release.release_date, false)}</span>
                  )}
                  <span>{release.release_type}</span>
                </ReleaseMeta>
                <ActionRow>
                  <Button $size="sm" onClick={() => loadReleaseDetails(release.id)}>Edit</Button>
                  <Button $size="sm" onClick={() => window.open(`/r/${release.id}`, '_blank')}>View</Button>
                  <Button $size="sm" $variant={release.is_published ? 'secondary' : 'success'} onClick={() => handleTogglePublish(release)}>
                    {release.is_published ? 'Unpublish' : 'Publish'}
                  </Button>
                  <Button $size="sm" $variant="danger" onClick={() => handleDeleteRelease(release.id)}>Delete</Button>
                </ActionRow>
              </ListItem>
            ))}
          </List>
        )}

        {formOpen && (
          <FormContainer>
            <FormHeader>
              <SectionTitle>{editingReleaseId ? 'Edit Release' : 'New Release'}</SectionTitle>
              <Button $size="sm" $variant="ghost" onClick={resetForm}>Cancel</Button>
            </FormHeader>

            <FormIntro>
              <span>
                Build one release hub for streaming links, press assets, and tour updates.
              </span>
              {editingReleaseId && (
                <Button $size="sm" $variant="secondary" onClick={() => window.open(`/r/${editingReleaseId}`, '_blank')}>
                  Open Public Page
                </Button>
              )}
            </FormIntro>

            <CompletionCard>
              <CompletionHeader>
                <SectionLabel>EPK Completeness</SectionLabel>
                <CompletionCount>{epkReadyCount}/{epkChecklist.length} ready</CompletionCount>
              </CompletionHeader>
              <CompletionGrid>
                {epkChecklist.map((item) => (
                  <CompletionItem key={item.key} $complete={item.complete}>
                    <span>{item.complete ? 'Ready' : 'Missing'}</span>
                    <strong>{item.label}</strong>
                  </CompletionItem>
                ))}
              </CompletionGrid>
            </CompletionCard>

            <EditorTabRow role="tablist" aria-label="Release editor sections">
              {EDITOR_TABS.map((tab) => (
                <EditorTabButton
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeEditorTab === tab.key}
                  $active={activeEditorTab === tab.key}
                  onClick={() => setActiveEditorTab(tab.key)}
                >
                  {tab.label}
                </EditorTabButton>
              ))}
            </EditorTabRow>

            {activeEditorTab === 'core' && (
              <>
                <ImportSection>
                  <Input
                    value={importUrl}
                    placeholder="Import from Spotify, Apple Music, Tidal, or Bandcamp URL"
                    onChange={(event) => setImportUrl(event.target.value)}
                  />
                  <Button $size="sm" $variant="secondary" onClick={handleImportFromUrl}>Import</Button>
                </ImportSection>
                <SectionHint>
                  Import pre-fills core metadata and suggested DSP links. You can fine tune all fields before publish.
                </SectionHint>

                <FormSection>
                  <SectionLabel>Release Details</SectionLabel>
                  <FormGrid>
                    <FormField label="Artist" required>
                      <Input
                        value={formData.artist_name}
                        placeholder="Artist or band name"
                        onChange={(event) => setFormData((prev) => ({ ...prev, artist_name: event.target.value }))}
                      />
                    </FormField>
                    <FormField label="Title" required>
                      <Input
                        value={formData.title}
                        placeholder="Release title"
                        onChange={(event) => setFormData((prev) => ({ ...prev, title: event.target.value }))}
                      />
                    </FormField>
                    <FormField label="Type">
                      <Select
                        value={formData.release_type}
                        onChange={(event) => setFormData((prev) => ({ ...prev, release_type: event.target.value }))}
                      >
                        {RELEASE_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </Select>
                    </FormField>
                    <FormField label="Genres">
                      <Input
                        placeholder="Electronic, Ambient, etc."
                        value={formData.genres}
                        onChange={(event) => setFormData((prev) => ({ ...prev, genres: event.target.value }))}
                      />
                    </FormField>
                    <FormField label="Release Date">
                      <Input
                        type="date"
                        value={formData.release_date}
                        onChange={(event) => setFormData((prev) => ({ ...prev, release_date: event.target.value }))}
                      />
                    </FormField>
                    <FormField label="Post Date">
                      <Input
                        type="date"
                        value={formData.post_date}
                        onChange={(event) => setFormData((prev) => ({ ...prev, post_date: event.target.value }))}
                      />
                    </FormField>
                  </FormGrid>
                  <FormField label="Description">
                    <TextArea
                      rows={3}
                      placeholder="About this release..."
                      value={formData.description}
                      onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
                    />
                  </FormField>
                </FormSection>

                <FormSection>
                  <SectionLabel>Public Sections</SectionLabel>
                  <SectionHint>These toggles control both editor inputs and public page tabs.</SectionHint>
                  <ToggleGrid>
                    <ToggleItem $active={formData.show_video}>
                      <input
                        type="checkbox"
                        checked={formData.show_video}
                        onChange={(event) => setFormData((prev) => ({ ...prev, show_video: event.target.checked }))}
                      />
                      <span>Video</span>
                    </ToggleItem>
                    <ToggleItem $active={formData.show_images}>
                      <input
                        type="checkbox"
                        checked={formData.show_images}
                        onChange={(event) => setFormData((prev) => ({ ...prev, show_images: event.target.checked }))}
                      />
                      <span>Press Assets</span>
                    </ToggleItem>
                    <ToggleItem $active={formData.show_about}>
                      <input
                        type="checkbox"
                        checked={formData.show_about}
                        onChange={(event) => setFormData((prev) => ({ ...prev, show_about: event.target.checked }))}
                      />
                      <span>Artist Bio</span>
                    </ToggleItem>
                    <ToggleItem $active={formData.show_shows}>
                      <input
                        type="checkbox"
                        checked={formData.show_shows}
                        onChange={(event) => setFormData((prev) => ({ ...prev, show_shows: event.target.checked }))}
                      />
                      <span>Tour Dates</span>
                    </ToggleItem>
                  </ToggleGrid>
                </FormSection>
              </>
            )}

            {activeEditorTab === 'epk' && (
              <>
                <QuickActions>
                  <Button
                    $size="sm"
                    $variant="secondary"
                    onClick={() => setAssets((prev) => ([
                      ...prev,
                      { client_id: createClientId('asset'), asset_type: 'press_image', url: '', attribution: '', allow_download: true }
                    ]))}
                  >
                    Add Press Asset
                  </Button>
                  <Button
                    $size="sm"
                    $variant="secondary"
                    onClick={() => setShows((prev) => ([
                      ...prev,
                      { client_id: createClientId('show'), ...blankShow }
                    ]))}
                  >
                    Add Show Date
                  </Button>
                </QuickActions>

                <FormSection>
                  <SectionLabel>Artwork</SectionLabel>
                  <ArtworkRow>
                    {formData.artwork_url && (
                      <ArtworkPreview>
                        <img src={formData.artwork_url} alt="Release artwork" />
                      </ArtworkPreview>
                    )}
                    <ArtworkUpload>
                      <Input
                        value={formData.artwork_url}
                        placeholder="Artwork URL"
                        onChange={(event) => setFormData((prev) => ({ ...prev, artwork_url: event.target.value }))}
                      />
                      <FileInput
                        type="file"
                        accept="image/*"
                        onChange={(event) => handleUploadArtwork(event.target.files?.[0])}
                        disabled={uploadingArtwork}
                      />
                      {uploadingArtwork && <UploadStatus>Uploading…</UploadStatus>}
                    </ArtworkUpload>
                  </ArtworkRow>
                </FormSection>

                {!formData.show_video && (
                  <SectionHint>Video is disabled. Enable it in Core Details to show a video tab.</SectionHint>
                )}
                {formData.show_video && (
                  <FormSection>
                    <SectionLabel>Video</SectionLabel>
                    <FormField label="Video URL">
                      <Input
                        value={formData.video_url}
                        placeholder="https://youtube.com/watch?v=... or https://vimeo.com/..."
                        onChange={(event) => setFormData((prev) => ({ ...prev, video_url: event.target.value }))}
                      />
                    </FormField>
                  </FormSection>
                )}

                {!formData.show_about && (
                  <SectionHint>Artist bio is disabled. Enable it in Core Details to include bio content on public page.</SectionHint>
                )}
                {formData.show_about && (
                  <FormSection>
                    <SectionLabel>Artist Bio</SectionLabel>
                    <FormGrid>
                      <FormField label="Headline">
                        <Input
                          value={formData.artist_bio_topline}
                          placeholder="Short tagline about the artist"
                          onChange={(event) => setFormData((prev) => ({ ...prev, artist_bio_topline: event.target.value }))}
                        />
                      </FormField>
                      <FormField label="Bio Image">
                        <Input
                          value={formData.artist_bio_image_url}
                          placeholder="Image URL"
                          onChange={(event) => setFormData((prev) => ({ ...prev, artist_bio_image_url: event.target.value }))}
                        />
                        <FileInput
                          type="file"
                          accept="image/*"
                          onChange={(event) => handleUploadBioImage(event.target.files?.[0])}
                          disabled={uploadingBioImage}
                        />
                        {uploadingBioImage && <UploadStatus>Uploading…</UploadStatus>}
                      </FormField>
                    </FormGrid>
                    <FormField label="Bio Text">
                      <TextArea
                        rows={3}
                        placeholder="Longer description about the artist"
                        value={formData.artist_bio_subtext}
                        onChange={(event) => setFormData((prev) => ({ ...prev, artist_bio_subtext: event.target.value }))}
                      />
                    </FormField>
                  </FormSection>
                )}

                {!formData.show_images && (
                  <SectionHint>Press assets are disabled. Enable them in Core Details to publish image/video assets.</SectionHint>
                )}
                {formData.show_images && (
                  <FormSection>
                    <SectionLabel>Press Assets ({assets.length})</SectionLabel>
                    {assets.length > 0 && (
                      <ItemList>
                        {assets.map((asset, index) => (
                          <ItemRow
                            key={asset.client_id || asset.id || index}
                            draggable
                            onDragStart={() => setDraggingAssetIndex(index)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => {
                              if (draggingAssetIndex === null || draggingAssetIndex === index) return;
                              setAssets((prev) => reorderList(prev, draggingAssetIndex, index));
                              setDraggingAssetIndex(null);
                            }}
                          >
                            <DragHandle>⋮⋮</DragHandle>
                            <Select
                              value={asset.asset_type || 'press_image'}
                              onChange={(event) => setAssets((prev) => prev.map((item, i) => (
                                i === index ? { ...item, asset_type: event.target.value } : item
                              )))}
                            >
                              {ASSET_TYPES.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </Select>
                            <Input
                              placeholder="URL"
                              value={asset.url || ''}
                              onChange={(event) => setAssets((prev) => prev.map((item, i) => (
                                i === index ? { ...item, url: event.target.value } : item
                              )))}
                            />
                            <Input
                              placeholder="Attribution"
                              value={asset.attribution || ''}
                              onChange={(event) => setAssets((prev) => prev.map((item, i) => (
                                i === index ? { ...item, attribution: event.target.value } : item
                              )))}
                            />
                            <SmallToggle>
                              <input
                                type="checkbox"
                                checked={asset.allow_download !== false}
                                onChange={(event) => setAssets((prev) => prev.map((item, i) => (
                                  i === index ? { ...item, allow_download: event.target.checked } : item
                                )))}
                              />
                              <span>Download</span>
                            </SmallToggle>
                            <FileInput
                              type="file"
                              accept="image/*,video/*"
                              onChange={(event) => handleAssetUpload(index, event.target.files?.[0])}
                              disabled={uploadingAssetIndex === index}
                            />
                            {uploadingAssetIndex === index && <UploadStatus>Uploading…</UploadStatus>}
                            <RemoveButton onClick={() => setAssets((prev) => prev.filter((_, i) => i !== index))}>×</RemoveButton>
                          </ItemRow>
                        ))}
                      </ItemList>
                    )}
                    <Button
                      $size="sm"
                      $variant="secondary"
                      onClick={() => setAssets((prev) => ([
                        ...prev,
                        { client_id: createClientId('asset'), asset_type: 'press_image', url: '', attribution: '', allow_download: true }
                      ]))}
                    >
                      Add Asset
                    </Button>
                  </FormSection>
                )}

                {!formData.show_shows && (
                  <SectionHint>Tour dates are disabled. Enable them in Core Details to publish show information.</SectionHint>
                )}
                {formData.show_shows && (
                  <FormSection>
                    <SectionLabel>Tour Dates ({shows.length})</SectionLabel>
                    {shows.length > 0 && (
                      <ItemList>
                        {shows.map((show, index) => (
                          <ItemRow
                            key={show.client_id || show.id || index}
                            draggable
                            onDragStart={() => setDraggingShowIndex(index)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => {
                              if (draggingShowIndex === null || draggingShowIndex === index) return;
                              setShows((prev) => reorderList(prev, draggingShowIndex, index));
                              setDraggingShowIndex(null);
                            }}
                          >
                            <DragHandle>⋮⋮</DragHandle>
                            <Input
                              type="date"
                              value={show.show_date || ''}
                              onChange={(event) => setShows((prev) => prev.map((item, i) => (
                                i === index ? { ...item, show_date: event.target.value } : item
                              )))}
                            />
                            <Input
                              placeholder="Venue"
                              value={show.venue || ''}
                              onChange={(event) => setShows((prev) => prev.map((item, i) => (
                                i === index ? { ...item, venue: event.target.value } : item
                              )))}
                            />
                            <Input
                              placeholder="City"
                              value={show.city || ''}
                              onChange={(event) => setShows((prev) => prev.map((item, i) => (
                                i === index ? { ...item, city: event.target.value } : item
                              )))}
                            />
                            <Input
                              placeholder="Country"
                              value={show.country || ''}
                              onChange={(event) => setShows((prev) => prev.map((item, i) => (
                                i === index ? { ...item, country: event.target.value } : item
                              )))}
                            />
                            <Input
                              placeholder="Ticket URL"
                              value={show.ticket_url || ''}
                              onChange={(event) => setShows((prev) => prev.map((item, i) => (
                                i === index ? { ...item, ticket_url: event.target.value } : item
                              )))}
                            />
                            <RemoveButton onClick={() => setShows((prev) => prev.filter((_, i) => i !== index))}>×</RemoveButton>
                          </ItemRow>
                        ))}
                      </ItemList>
                    )}
                    <Button
                      $size="sm"
                      $variant="secondary"
                      onClick={() => setShows((prev) => ([
                        ...prev,
                        { client_id: createClientId('show'), ...blankShow }
                      ]))}
                    >
                      Add Show
                    </Button>
                  </FormSection>
                )}
              </>
            )}

            {activeEditorTab === 'distribution' && (
              <>
                <FormSection>
                  <SectionLabel>Streaming Links ({actions.length})</SectionLabel>

                  <LinkFinderSection>
                    <LinkFinderHeader>
                      <span>Find links on other platforms</span>
                      <Button
                        $size="sm"
                        $variant="primary"
                        onClick={handleFindLinks}
                        disabled={findingLinks || !formData.artist_name.trim() || !formData.title.trim()}
                      >
                        {findingLinks ? 'Searching...' : 'Find Platform Links'}
                      </Button>
                    </LinkFinderHeader>
                    {(Object.keys(linkStatus).length > 0 || findingLinks) && (
                      <PlatformStatusGrid>
                        {SEARCHABLE_PLATFORMS.map((platform) => {
                          const existingAction = actions.find((a) => a.platform_key === platform && a.url?.trim());
                          const platformLabel = PLATFORM_OPTIONS.find((p) => p.value === platform)?.label || platform;
                          let statusText = '';
                          let statusType = 'pending';

                          if (existingAction) {
                            statusText = 'Added';
                            statusType = 'exists';
                          } else if (findingLinks) {
                            statusText = 'Searching...';
                            statusType = 'searching';
                          } else if (linkStatus[platform] === 'found') {
                            statusText = 'Found';
                            statusType = 'found';
                          } else if (linkStatus[platform] === 'not_found') {
                            statusText = 'Not found';
                            statusType = 'not_found';
                          } else if (linkStatus[platform] === 'exists') {
                            statusText = 'Already added';
                            statusType = 'exists';
                          }

                          return (
                            <PlatformStatus key={platform} $status={statusType}>
                              <span className="platform">{platformLabel}</span>
                              {statusText && <span className="status">{statusText}</span>}
                            </PlatformStatus>
                          );
                        })}
                      </PlatformStatusGrid>
                    )}
                    {!formData.artist_name.trim() || !formData.title.trim() ? (
                      <LinkFinderHint>Enter artist name and title in Core Details before running link search.</LinkFinderHint>
                    ) : null}
                  </LinkFinderSection>

                  {actions.length > 0 && (
                    <ItemList>
                      {actions.map((action, index) => (
                        <ItemRow
                          key={action.client_id || action.id || index}
                          draggable
                          onDragStart={() => setDraggingIndex(index)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => {
                            if (draggingIndex === null || draggingIndex === index) return;
                            setActions((prev) => reorderList(prev, draggingIndex, index));
                            setDraggingIndex(null);
                          }}
                        >
                          <DragHandle>⋮⋮</DragHandle>
                          <Select
                            value={action.platform_key || 'custom'}
                            onChange={(event) => setActions((prev) => prev.map((item, i) => (
                              i === index ? { ...item, platform_key: event.target.value } : item
                            )))}
                          >
                            {PLATFORM_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </Select>
                          <Input
                            placeholder="Label (optional)"
                            value={action.label || ''}
                            onChange={(event) => setActions((prev) => prev.map((item, i) => (
                              i === index ? { ...item, label: event.target.value } : item
                            )))}
                          />
                          <Input
                            placeholder="URL"
                            value={action.url || ''}
                            onChange={(event) => setActions((prev) => prev.map((item, i) => (
                              i === index ? { ...item, url: event.target.value } : item
                            )))}
                          />
                          <RemoveButton onClick={() => setActions((prev) => prev.filter((_, i) => i !== index))}>×</RemoveButton>
                        </ItemRow>
                      ))}
                    </ItemList>
                  )}
                  <Button
                    $size="sm"
                    $variant="secondary"
                    onClick={() => setActions((prev) => ([
                      ...prev,
                      { client_id: createClientId('action'), platform_key: 'spotify', label: '', url: '', icon_mode: 'platform' }
                    ]))}
                  >
                    Add Link
                  </Button>
                </FormSection>

                <FormSection $highlight>
                  <SectionLabel>Publishing</SectionLabel>
                  <PublishRow>
                    <PublishToggle $active={formData.is_published}>
                      <input
                        type="checkbox"
                        checked={formData.is_published}
                        onChange={(event) => setFormData((prev) => ({ ...prev, is_published: event.target.checked }))}
                      />
                      <span>{formData.is_published ? 'Published' : 'Draft'}</span>
                    </PublishToggle>
                    <PasswordField>
                      <Input
                        type="password"
                        value={passwordValue}
                        placeholder="Password (optional)"
                        onChange={(event) => setPasswordValue(event.target.value)}
                      />
                      {editingReleaseId && (
                        <SmallToggle>
                          <input
                            type="checkbox"
                            checked={removePassword}
                            onChange={(event) => setRemovePassword(event.target.checked)}
                          />
                          <span>Remove password</span>
                        </SmallToggle>
                      )}
                    </PasswordField>
                    <FormField label="Sort Order">
                      <Input
                        type="number"
                        value={formData.sort_order}
                        placeholder="0"
                        onChange={(event) => setFormData((prev) => ({ ...prev, sort_order: event.target.value }))}
                      />
                    </FormField>
                  </PublishRow>
                </FormSection>
              </>
            )}

            {/* Save Actions */}
            <FormActions>
              <Button $variant="ghost" onClick={resetForm}>Cancel</Button>
              <Button $variant="success" onClick={handleSaveRelease} disabled={saving}>
                {saving ? 'Saving...' : (editingReleaseId ? 'Update Release' : 'Create Release')}
              </Button>
            </FormActions>
          </FormContainer>
        )}
      </Stack>
    </SectionCard>
  );
};

const StatusBanner = styled.div`
  border: 1px solid ${props => {
    if (props.$variant === 'success') return '#26b846';
    if (props.$variant === 'error') return '#ff4d4f';
    if (props.$variant === 'warning') return '#d97706';
    return '#000';
  }};
  background: ${props => {
    if (props.$variant === 'success') return 'rgba(38, 184, 70, 0.08)';
    if (props.$variant === 'error') return 'rgba(255, 77, 79, 0.08)';
    if (props.$variant === 'warning') return 'rgba(217, 119, 6, 0.1)';
    return 'rgba(0, 0, 0, 0.04)';
  }};
  padding: ${tokens.spacing[3]};
  font-family: ${props => props.theme.fonts.mono};
`;

const ReleaseHeader = styled.div`
  display: flex;
  justify-content: space-between;
  gap: ${tokens.spacing[3]};

  h4 {
    margin: 0 0 4px 0;
    font-size: ${props => props.theme.fontSizes.h3};
  }

  span {
    font-size: ${props => props.theme.fontSizes.small};
    color: rgba(0, 0, 0, 0.6);
  }
`;

const ReleaseMeta = styled.div`
  display: flex;
  gap: ${tokens.spacing[2]};
  font-family: ${props => props.theme.fonts.mono};
  font-size: ${props => props.theme.fontSizes.tiny};
  text-transform: uppercase;
`;

const ActionRow = styled.div`
  display: flex;
  gap: ${tokens.spacing[2]};
  flex-wrap: wrap;
`;

const UploadStatus = styled.span`
  font-family: ${props => props.theme.fonts.mono};
  font-size: ${props => props.theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.7;
`;

const FileInput = styled.input`
  width: 100%;
  min-height: 36px;
  border: 1px solid ${props => props.theme.colors.black};
  background: ${props => props.theme.colors.fpwhite};
  padding: ${tokens.spacing[2]} ${tokens.spacing[3]};
  font-family: ${props => props.theme.fonts.primary};
  font-size: ${props => props.theme.fontSizes.small};

  &::-webkit-file-upload-button {
    border: 1px solid ${props => props.theme.colors.black};
    background: ${props => props.theme.colors.fpwhite};
    padding: 4px 12px;
    font-family: ${props => props.theme.fonts.mono};
    font-size: ${props => props.theme.fontSizes.tiny};
    text-transform: uppercase;
    cursor: pointer;
    margin-right: ${tokens.spacing[2]};
  }
`;

// New form styles
const FormContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[4]};
  padding: ${tokens.spacing[4]};
  border: 1px solid ${props => props.theme.colors.black};
  background: ${props => props.theme.colors.fpwhite};
`;

const FormHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: ${tokens.spacing[3]};
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
`;

const FormIntro = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${tokens.spacing[3]};
  flex-wrap: wrap;

  span {
    font-family: ${props => props.theme.fonts.mono};
    font-size: ${props => props.theme.fontSizes.tiny};
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: rgba(0, 0, 0, 0.7);
  }
`;

const CompletionCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[3]};
  padding: ${tokens.spacing[3]};
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: rgba(0, 0, 0, 0.02);
`;

const CompletionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${tokens.spacing[2]};
  flex-wrap: wrap;
`;

const CompletionCount = styled.span`
  font-family: ${props => props.theme.fonts.mono};
  font-size: ${props => props.theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(0, 0, 0, 0.7);
`;

const CompletionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: ${tokens.spacing[2]};
`;

const CompletionItem = styled.div.withConfig({
  shouldForwardProp: prop => prop !== '$complete'
})`
  border: 1px solid ${props => props.$complete ? 'rgba(38, 184, 70, 0.6)' : 'rgba(0, 0, 0, 0.15)'};
  background: ${props => props.$complete ? 'rgba(38, 184, 70, 0.08)' : 'rgba(255, 255, 255, 0.8)'};
  padding: ${tokens.spacing[2]};
  display: flex;
  flex-direction: column;
  gap: 2px;

  span {
    font-family: ${props => props.theme.fonts.mono};
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: ${props => props.$complete ? '#15803d' : 'rgba(0, 0, 0, 0.5)'};
  }

  strong {
    font-family: ${props => props.theme.fonts.primary};
    font-size: ${props => props.theme.fontSizes.small};
    color: rgba(0, 0, 0, 0.85);
  }
`;

const EditorTabRow = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: ${tokens.spacing[2]};

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const EditorTabButton = styled.button.withConfig({
  shouldForwardProp: prop => prop !== '$active'
})`
  min-height: ${tokens.sizing.touchTarget};
  border: 1px solid ${props => props.$active ? props.theme.colors.black : 'rgba(0, 0, 0, 0.2)'};
  background: ${props => props.$active ? 'rgba(0, 0, 0, 0.08)' : 'transparent'};
  color: ${props => props.theme.colors.black};
  font-family: ${props => props.theme.fonts.mono};
  font-size: ${props => props.theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: ${props => props.theme.colors.black};
  }
`;

const ImportSection = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: ${tokens.spacing[2]};
  padding: ${tokens.spacing[3]};
  background: rgba(0, 0, 0, 0.02);
  border: 1px dashed rgba(0, 0, 0, 0.15);
`;

const QuickActions = styled.div`
  display: flex;
  gap: ${tokens.spacing[2]};
  flex-wrap: wrap;
`;

const FormSection = styled.div.withConfig({
  shouldForwardProp: prop => prop !== '$highlight'
})`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[3]};
  padding: ${tokens.spacing[3]};
  background: ${props => props.$highlight ? 'rgba(38, 184, 70, 0.04)' : 'transparent'};
  border: 1px solid ${props => props.$highlight ? 'rgba(38, 184, 70, 0.2)' : 'rgba(0, 0, 0, 0.08)'};
`;

const SectionLabel = styled.h4`
  margin: 0;
  text-transform: uppercase;
  font-family: ${props => props.theme.fonts.mono};
  font-size: ${props => props.theme.fontSizes.tiny};
  letter-spacing: 0.1em;
  color: rgba(0, 0, 0, 0.6);
`;

const SectionHint = styled.p`
  margin: 0;
  font-family: ${props => props.theme.fonts.mono};
  font-size: ${props => props.theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.55);
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: ${tokens.spacing[3]};

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

const ArtworkRow = styled.div`
  display: flex;
  gap: ${tokens.spacing[3]};
  align-items: flex-start;
`;

const ArtworkPreview = styled.div`
  width: 120px;
  height: 120px;
  flex-shrink: 0;
  border: 1px solid ${props => props.theme.colors.black};
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const ArtworkUpload = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};
`;

const ToggleGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: ${tokens.spacing[2]};

  @media (max-width: 600px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

const ToggleItem = styled.label.withConfig({
  shouldForwardProp: prop => prop !== '$active'
})`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing[2]};
  padding: ${tokens.spacing[2]} ${tokens.spacing[3]};
  border: 1px solid ${props => props.$active ? props.theme.colors.black : 'rgba(0, 0, 0, 0.2)'};
  background: ${props => props.$active ? 'rgba(0, 0, 0, 0.04)' : 'transparent'};
  cursor: pointer;
  transition: all 0.15s ease;

  span {
    font-family: ${props => props.theme.fonts.mono};
    font-size: ${props => props.theme.fontSizes.tiny};
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  &:hover {
    border-color: ${props => props.theme.colors.black};
  }
`;

const ItemList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};
`;

const ItemRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing[2]};
  padding: ${tokens.spacing[2]};
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid rgba(0, 0, 0, 0.08);
  flex-wrap: wrap;

  > * {
    flex-shrink: 0;
  }

  input[type="text"],
  input[type="date"],
  input[type="url"],
  select {
    flex: 1;
    min-width: 100px;
  }
`;

const DragHandle = styled.span`
  cursor: grab;
  color: rgba(0, 0, 0, 0.3);
  font-size: 14px;
  padding: 0 4px;
  user-select: none;

  &:active {
    cursor: grabbing;
  }
`;

const RemoveButton = styled.button`
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(0, 0, 0, 0.2);
  background: transparent;
  cursor: pointer;
  font-size: 18px;
  color: rgba(0, 0, 0, 0.5);
  transition: all 0.15s ease;

  &:hover {
    border-color: #ff4d4f;
    color: #ff4d4f;
    background: rgba(255, 77, 79, 0.08);
  }
`;

const SmallToggle = styled.label`
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  white-space: nowrap;

  span {
    font-family: ${props => props.theme.fonts.mono};
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
`;

const PublishRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${tokens.spacing[4]};
  flex-wrap: wrap;
`;

const PublishToggle = styled.label.withConfig({
  shouldForwardProp: prop => prop !== '$active'
})`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing[2]};
  padding: ${tokens.spacing[2]} ${tokens.spacing[3]};
  border: 2px solid ${props => props.$active ? '#26b846' : 'rgba(0, 0, 0, 0.2)'};
  background: ${props => props.$active ? 'rgba(38, 184, 70, 0.08)' : 'transparent'};
  cursor: pointer;

  span {
    font-family: ${props => props.theme.fonts.mono};
    font-size: ${props => props.theme.fontSizes.small};
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 600;
    color: ${props => props.$active ? '#26b846' : 'rgba(0, 0, 0, 0.6)'};
  }
`;

const PasswordField = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};
  flex: 1;
  max-width: 250px;
`;

const FormActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${tokens.spacing[2]};
  padding-top: ${tokens.spacing[3]};
  border-top: 1px solid rgba(0, 0, 0, 0.1);
`;

const LinkFinderSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing[2]};
  padding: ${tokens.spacing[3]};
  background: rgba(0, 0, 0, 0.02);
  border: 1px dashed rgba(0, 0, 0, 0.15);
  margin-bottom: ${tokens.spacing[3]};
`;

const LinkFinderHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${tokens.spacing[3]};

  > span {
    font-family: ${props => props.theme.fonts.mono};
    font-size: ${props => props.theme.fontSizes.tiny};
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: rgba(0, 0, 0, 0.6);
  }
`;

const LinkFinderHint = styled.p`
  margin: 0;
  font-family: ${props => props.theme.fonts.mono};
  font-size: ${props => props.theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.5);
  font-style: italic;
`;

const PlatformStatusGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: ${tokens.spacing[2]};
`;

const PlatformStatus = styled.div.withConfig({
  shouldForwardProp: prop => prop !== '$status'
})`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: ${tokens.spacing[2]};
  border: 1px solid ${props => {
    switch (props.$status) {
      case 'found': return '#26b846';
      case 'exists': return 'rgba(38, 184, 70, 0.5)';
      case 'not_found': return 'rgba(0, 0, 0, 0.15)';
      case 'searching': return '#1890ff';
      default: return 'rgba(0, 0, 0, 0.1)';
    }
  }};
  background: ${props => {
    switch (props.$status) {
      case 'found': return 'rgba(38, 184, 70, 0.08)';
      case 'exists': return 'rgba(38, 184, 70, 0.04)';
      case 'searching': return 'rgba(24, 144, 255, 0.08)';
      default: return 'transparent';
    }
  }};

  .platform {
    font-family: ${props => props.theme.fonts.mono};
    font-size: ${props => props.theme.fontSizes.tiny};
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 600;
  }

  .status {
    font-family: ${props => props.theme.fonts.mono};
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: ${props => {
      switch (props.$status) {
        case 'found': return '#26b846';
        case 'exists': return 'rgba(38, 184, 70, 0.8)';
        case 'not_found': return 'rgba(0, 0, 0, 0.4)';
        case 'searching': return '#1890ff';
        default: return 'rgba(0, 0, 0, 0.5)';
      }
    }};
  }
`;

CuratorReleasesPanel.propTypes = {
  curator: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    profile_type: PropTypes.string,
    type: PropTypes.string,
    upcoming_releases_enabled: PropTypes.bool
  }),
  adminOverride: PropTypes.bool
};

CuratorReleasesPanel.defaultProps = {
  curator: null,
  adminOverride: false
};

export default CuratorReleasesPanel;
