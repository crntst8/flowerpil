import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import {
  Button,
  FormField,
  Input,
  Select,
  TextArea,
  PageHeader,
  SectionCard,
  SectionHeader,
  SectionTitle,
  SectionSubtitle,
  StatusBanner,
  TwoColumnGrid,
  ContentWrapper,
  Grid,
  Stack,
  StickyActionBar,
  tokens,
  theme,
} from './ui/index.jsx';
import LocationAutocomplete from '@shared/components/LocationAutocomplete.jsx';
import { useAuth } from '@shared/contexts/AuthContext';
import { cacheService } from '@shared/services/cacheService';
import { safeJson } from '@shared/utils/jsonUtils';
import { DEFAULT_CURATOR_TYPE, getCuratorTypeOptions } from '@shared/constants/curatorTypes';
import CuratorImageUploader from './CuratorImageUploader.jsx';

// Collapsible section hook for progressive disclosure
const useCollapsible = (defaultOpen = true) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const toggle = useCallback(() => setIsOpen(prev => !prev), []);
  return { isOpen, toggle };
};

// Styled components specific to this page
const CollapsibleHeader = styled(SectionHeader).withConfig({
  shouldForwardProp: (prop) => !['$isOpen', '$collapsible'].includes(prop),
})`
  cursor: ${({ $collapsible }) => $collapsible ? 'pointer' : 'default'};
  user-select: none;
  margin-bottom: ${({ $isOpen }) => $isOpen ? tokens.spacing[4] : '0'};
  padding-bottom: ${({ $isOpen }) => $isOpen ? tokens.spacing[3] : '0'};
  border-bottom: ${({ $isOpen }) => $isOpen ? `1px dashed ${theme.colors.black}` : 'none'};
`;

const CollapsibleTitle = styled(SectionTitle)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
`;

const ToggleIcon = styled.span.withConfig({
  shouldForwardProp: (prop) => !['$isOpen'].includes(prop),
})`
  font-size: 12px;
  transition: transform ${tokens.transitions.fast};
  transform: ${({ $isOpen }) => $isOpen ? 'rotate(180deg)' : 'rotate(0deg)'};
  margin-left: ${tokens.spacing[2]};
`;

const CollapsibleContent = styled.div.withConfig({
  shouldForwardProp: (prop) => !['$isOpen'].includes(prop),
})`
  display: ${({ $isOpen }) => $isOpen ? 'block' : 'none'};
  animation: ${({ $isOpen }) => $isOpen ? 'fadeIn 0.2s ease-out' : 'none'};
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

const CharCount = styled.div`
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.5);
  text-align: right;
  margin-top: ${tokens.spacing[1]};
`;

const LinkRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 2fr auto;
  gap: ${tokens.spacing[3]};
  align-items: end;
  padding: ${tokens.spacing[3]};
  border: ${theme.borders.solid} ${theme.colors.black};
  background: ${theme.colors.fpwhite};
  
  @media (max-width: 600px) {
    grid-template-columns: 1fr;
    gap: ${tokens.spacing[3]};
    
    button {
      width: 100%;
      min-height: ${tokens.sizing.touchTarget};
    }
  }
`;

const LinksList = styled.div`
  display: grid;
  gap: ${tokens.spacing[3]};
`;

const LinksGroup = styled.div`
  display: grid;
  gap: ${tokens.spacing[3]};
`;

const LinksSectionCard = styled(SectionCard)`
  margin-top: ${tokens.spacing[4]};
  margin-bottom: ${tokens.spacing[4]};
`;

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

const ensureUrlValue = (value) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^(https?:)?\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const parseLinkCollection = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch (_) {
    return [];
  }
};

const formatUpdatedFieldsMessage = (fields = []) => {
  if (!Array.isArray(fields) || fields.length === 0) {
    return 'No changes detected - profile already up to date.';
  }
  if (fields.length === 1) {
    const field = fields[0].replace(/_/g, ' ');
    return `Saved ${field}.`;
  }
  const readable = fields.map((field) => field.replace(/_/g, ' ')).join(', ');
  return `Saved ${fields.length} fields (${readable}).`;
};

export default function CuratorProfilePage() {
  const { authenticatedFetch } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [curatorId, setCuratorId] = useState(null);
  const [customFields, setCustomFields] = useState({});
  const [bioFeaturedLinks, setBioFeaturedLinks] = useState([]);
  const [useBioFeaturedOnProfile, setUseBioFeaturedOnProfile] = useState(false);
  const [selectedBioFeatured, setSelectedBioFeatured] = useState([]);
  const baseTypeOptions = useMemo(() => getCuratorTypeOptions(), []);
  const [typeOptions, setTypeOptions] = useState(baseTypeOptions);
  
  // Progressive disclosure: Identity always open, Links collapsed by default
  const identitySection = useCollapsible(true);
  const linksSection = useCollapsible(true);
  
  const [form, setForm] = useState({
    name: '',
    profile_type: '',
    bio: '',
    bio_short: '',
    location: '',
    website_url: '',
    contact_email: '',
    spotify_url: '',
    apple_url: '',
    tidal_url: '',
    bandcamp_url: ''
  });
  const [socialLinks, setSocialLinks] = useState([{ platform: '', url: '' }]);
  const [externalLinks, setExternalLinks] = useState([{ title: '', url: '' }]);
  const [profileImage, setProfileImage] = useState('');

  const applyCuratorState = (curatorPayload, mergedOptions = typeOptions) => {
    if (!curatorPayload) return;
    const c = curatorPayload;
    setCuratorId(c.id || null);

    let parsedCustom = {};
    try {
      parsedCustom = c.custom_fields
        ? (typeof c.custom_fields === 'string' ? JSON.parse(c.custom_fields) : c.custom_fields)
        : {};
    } catch (_) {
      parsedCustom = {};
    }

    const customLocationDetails = parsedCustom?.location_details;
    setCustomFields(parsedCustom && typeof parsedCustom === 'object' ? { ...parsedCustom } : {});

    const pfl = parsedCustom?.profile_featured_links || {};
    setUseBioFeaturedOnProfile(!!pfl.enabled);
    setSelectedBioFeatured(Array.isArray(pfl.selected) ? pfl.selected : []);

    const socialList = parseLinkCollection(c.social_links);
    const externalList = parseLinkCollection(c.external_links);

    const selectableTypeValues = (mergedOptions || [])
      .filter(option => !option.isHeader)
      .map(option => option.value);

    const resolvedProfileType = (() => {
      const profileType = c.profile_type;
      if (profileType && selectableTypeValues.includes(profileType)) {
        return profileType;
      }
      if (selectableTypeValues.includes(DEFAULT_CURATOR_TYPE)) {
        return DEFAULT_CURATOR_TYPE;
      }
      return selectableTypeValues[0] || DEFAULT_CURATOR_TYPE;
    })();

    setForm({
      name: c.name || '',
      profile_type: resolvedProfileType,
      bio: c.bio || '',
      bio_short: c.bio_short || '',
      location: c.location || customLocationDetails?.formatted || '',
      website_url: c.website_url || '',
      contact_email: c.contact_email || '',
      spotify_url: c.spotify_url || '',
      apple_url: c.apple_url || '',
      tidal_url: c.tidal_url || '',
      bandcamp_url: c.bandcamp_url || ''
    });
    setSocialLinks(socialList.length ? socialList : [{ platform: '', url: '' }]);
    setExternalLinks(externalList.length ? externalList : [{ title: '', url: '' }]);
    setProfileImage(c.profile_image || '');
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    let mergedTypeOptions = baseTypeOptions;

    try {
      // Load curator types first
      const typesRes = await fetch('/api/v1/admin/site-admin/curator-types');
      const typesData = await typesRes.json();
      if (typesRes.ok && Array.isArray(typesData.types)) {
        const customTypes = typesData.types.filter(type => type.custom);
        if (customTypes.length > 0) {
          mergedTypeOptions = getCuratorTypeOptions(customTypes);
        }
      }
      setTypeOptions(mergedTypeOptions);

      const res = await authenticatedFetch('/api/v1/curator/profile', {
        method: 'GET',
        credentials: 'include'
      });
      const data = await safeJson(res, { context: 'Load curator profile' });
      if (!res.ok || !data.success) throw new Error(data.message || data.error || 'Failed to load profile');
      const c = data.curator || {};
      applyCuratorState(c, mergedTypeOptions);

      // Load bio featured links for this curator to allow selection
      try {
        if (c.id) {
          const bioRes = await authenticatedFetch(`/api/v1/bio-profiles?curator_id=${encodeURIComponent(c.id)}`, { method: 'GET' });
          const bioData = await safeJson(bioRes, { context: 'Load bio profiles' });
          if (bioRes.ok && bioData.success && Array.isArray(bioData.data) && bioData.data.length > 0) {
            const profile = bioData.data[0];
            const draft = typeof profile.draft_content === 'string' ? JSON.parse(profile.draft_content) : (profile.draft_content || {});
            const links = Array.isArray(draft.featuredLinks) ? draft.featuredLinks : [];
            setBioFeaturedLinks(links);
          } else {
            setBioFeaturedLinks([]);
          }
        }
      } catch (_) {
        setBioFeaturedLinks([]);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
    const onRefresh = () => { load().catch(() => {}); };
    window.addEventListener('flowerpil:refresh', onRefresh);
    return () => window.removeEventListener('flowerpil:refresh', onRefresh);
  }, [authenticatedFetch]); // eslint-disable-line react-hooks/exhaustive-deps -- load intentionally closes over current options/state

  const onChange = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleLocationChange = (data) => {
    const formatted = data?.formatted || '';
    onChange('location', formatted);
    setCustomFields((prev) => {
      const next = { ...(prev || {}) };
      if (formatted) {
        next.location_details = {
          formatted,
          city: data?.city || '',
          country: data?.country || '',
          lat: typeof data?.lat === 'number' ? data.lat : null,
          lng: typeof data?.lng === 'number' ? data.lng : null,
          raw: data?.raw || data?.description || formatted,
          placeId: data?.placeId || ''
        };
      } else {
        delete next.location_details;
      }
      return next;
    });
  };

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    setStatus('');
    setError(null);
    try {
      const csrfToken = getCookie('csrf_token');
      const normalizeEmail = (value) => {
        const trimmed = (value || '').trim();
        return trimmed.length ? trimmed : null;
      };
      const normalizedSocial = socialLinks
        .map(l => ({ platform: (l.platform || '').trim(), url: ensureUrlValue(l.url) }))
        .filter(l => l.platform && l.url);
      const normalizedExternal = externalLinks
        .map(l => ({ title: (l.title || '').trim(), url: ensureUrlValue(l.url) }))
        .filter(l => l.title && l.url);

      // Merge profile featured link selection into custom_fields
      const mergedCustomFields = {
        ...(customFields || {}),
        profile_featured_links: {
          enabled: !!useBioFeaturedOnProfile,
          selected: [...selectedBioFeatured],
          data: selectedBioFeatured
            .map(pos => bioFeaturedLinks.find(l => l.position === pos))
            .filter(Boolean)
            .map(l => ({ position: l.position, title: l.title || '', url: l.url || '', description: l.description || '', image_url: l.image_url || null }))
        }
      };
      const hasLocationValue = !!(form.location && form.location.trim());
      if (!hasLocationValue && mergedCustomFields.location_details) {
        delete mergedCustomFields.location_details;
      }

      const payload = {
        ...form,
        location: hasLocationValue ? form.location.trim() : null,
        website_url: ensureUrlValue(form.website_url),
        contact_email: normalizeEmail(form.contact_email),
        spotify_url: ensureUrlValue(form.spotify_url),
        apple_url: ensureUrlValue(form.apple_url),
        tidal_url: ensureUrlValue(form.tidal_url),
        bandcamp_url: ensureUrlValue(form.bandcamp_url),
        social_links: normalizedSocial,
        external_links: normalizedExternal,
        profile_image: profileImage || null,
        custom_fields: mergedCustomFields
      };
      const res = await authenticatedFetch('/api/v1/curator/profile', {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
        },
        body: JSON.stringify(payload)
      });
      const data = await safeJson(res, { context: 'Save curator profile' });
      if (!res.ok || !data.success) throw new Error(data.message || data.error || 'Failed to save');
      const message = data?.updatedFields
        ? formatUpdatedFieldsMessage(data.updatedFields)
        : (data?.message || 'Profile updated successfully');
      setStatus(message);
      if (data?.curator) {
        applyCuratorState(data.curator);
      }

      // Invalidate cached playlist listings
      if (data?.changesApplied) {
        try {
          cacheService.clearPlaylistListings();
          if (curatorId) {
            const listRes = await fetch(`/api/v1/playlists?curator_id=${curatorId}`);
            const listData = await safeJson(listRes, { context: 'Fetch curator playlists for cache invalidation' });
            const list = listRes.ok && listData?.success ? (listData.data || []) : [];
            for (const pl of list) {
              cacheService.invalidatePlaylist(pl.id);
            }
          }
        } catch {
          // Cache invalidation is best-effort
        }
      }
    } catch (e) {
      const friendly = e?.message?.replace('Save curator profile: ', '') || 'Failed to save profile';
      setError(`Save failed: ${friendly}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageHeader>
        <h1>Profile Settings</h1>
        <p>Loading...</p>
      </PageHeader>
    );
  }

  return (
    <>
      <PageHeader>
        <h1>Profile Settings</h1>
      </PageHeader>

      <ContentWrapper>
        {(error || status) && (
          <StatusBanner $variant={error ? 'error' : 'success'}>
            <p>{error || status}</p>
          </StatusBanner>
        )}

        <TwoColumnGrid>
          {/* Left Column: Identity */}
          <Stack $gap={tokens.spacing[4]}>
            <SectionCard>
              <CollapsibleHeader 
                $collapsible 
                $isOpen={identitySection.isOpen} 
                onClick={identitySection.toggle}
                role="button"
                aria-expanded={identitySection.isOpen}
              >
                <CollapsibleTitle>
                  Identity
                  <ToggleIcon $isOpen={identitySection.isOpen}>▼</ToggleIcon>
                </CollapsibleTitle>
              </CollapsibleHeader>
              
              <CollapsibleContent $isOpen={identitySection.isOpen}>
                <Grid $minWidth="220px" $gap={tokens.spacing[4]}>
                  <FormField label="Name">
                    <Input 
                      value={form.name} 
                      onChange={(e) => onChange('name', e.target.value)} 
                      placeholder="Your artist/label name" 
                    />
                  </FormField>
                  
                  <FormField label="Type">
                    <Select 
                      value={form.profile_type} 
                      onChange={(e) => onChange('profile_type', e.target.value)}
                    >
                      {typeOptions.map((option) => (
                        option.isHeader ? (
                          <option
                            key={`header-${option.value}`}
                            value={option.value}
                            disabled
                          >
                            {option.label}
                          </option>
                        ) : (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        )
                      ))}
                    </Select>
                  </FormField>
                  
                  <FormField label="Location">
                    <LocationAutocomplete
                      value={form.location}
                      onChange={handleLocationChange}
                      placeholder="City, Country"
                    />
                  </FormField>
                  
                  <FormField label="Contact Email">
                    <Input 
                      type="email" 
                      value={form.contact_email} 
                      onChange={(e) => onChange('contact_email', e.target.value)} 
                      placeholder="contact@example.com" 
                    />
                  </FormField>
                  
                  <div style={{ gridColumn: '1 / -1' }}>
                    <FormField label="Short Bio (200 chars max)">
                      <Input
                        value={form.bio_short}
                        onChange={(e) => onChange('bio_short', e.target.value)}
                        placeholder="Brief description for listings and previews"
                        maxLength={200}
                      />
                      <CharCount>{form.bio_short.length}/200</CharCount>
                    </FormField>
                  </div>
                  
                  <div style={{ gridColumn: '1 / -1' }}>
                    <FormField label="Full Bio (2000 chars max)">
                      <TextArea
                        value={form.bio}
                        onChange={(e) => onChange('bio', e.target.value)}
                        placeholder="Detailed biography, background, achievements, and story..."
                        maxLength={2000}
                      />
                      <CharCount>{form.bio.length}/2000</CharCount>
                    </FormField>
                  </div>
                </Grid>
              </CollapsibleContent>
            </SectionCard>
          </Stack>

          {/* Right Column: Profile Image */}
          <Stack $gap={tokens.spacing[4]}>
            <CuratorImageUploader
              value={profileImage}
              onChange={setProfileImage}
              disabled={saving}
              label="Profile Image"
              hint="Square 1200-1500px recommended. JPG, PNG, or WebP. Changes save when you click 'Save Profile'."
              cta="Select profile image"
            />
          </Stack>
        </TwoColumnGrid>

        {/* Custom Links Section */}
        <LinksSectionCard>
          <CollapsibleHeader
            $collapsible
            $isOpen={linksSection.isOpen}
            onClick={linksSection.toggle}
            role="button"
            aria-expanded={linksSection.isOpen}
          >
            <div style={{ flex: 1 }}>
              <CollapsibleTitle>
                <span>Your Links</span>
                <ToggleIcon $isOpen={linksSection.isOpen}>▼</ToggleIcon>
              </CollapsibleTitle>
              {!linksSection.isOpen && (
                <SectionSubtitle>
                  {socialLinks.filter(l => l.platform && l.url).length + externalLinks.filter(l => l.title && l.url).length} links configured
                </SectionSubtitle>
              )}
            </div>
          </CollapsibleHeader>
          
          <CollapsibleContent $isOpen={linksSection.isOpen}>
            <Stack $gap={tokens.spacing[6]}>
              <LinksGroup>
                <FormField label="Social Links" />
                <LinksList>
                  {socialLinks.map((link, idx) => (
                    <LinkRow key={idx}>
                      <FormField label="Platform">
                        <Input 
                          value={link.platform} 
                          onChange={(e) => setSocialLinks(prev => prev.map((l,i) => i===idx ? { ...l, platform: e.target.value } : l))} 
                          placeholder="Instagram" 
                        />
                      </FormField>
                      <FormField label="URL">
                        <Input 
                          value={link.url} 
                          onChange={(e) => setSocialLinks(prev => prev.map((l,i) => i===idx ? { ...l, url: e.target.value } : l))} 
                          placeholder="https://instagram.com/..." 
                        />
                      </FormField>
                      <Button
                        $variant="dangerOutline"
                        $size="sm"
                        onClick={() => setSocialLinks(prev => prev.filter((_,i) => i!==idx))}
                        disabled={socialLinks.length === 1}
                      >
                        Remove
                      </Button>
                    </LinkRow>
                  ))}
                  <Button 
                    $variant="ghost" 
                    onClick={() => setSocialLinks(prev => [...prev, { platform: '', url: '' }])}
                  >
                    + Add Social Link
                  </Button>
                </LinksList>
              </LinksGroup>
              
              <LinksGroup>
                <FormField label="External Links" />
                <LinksList>
                  {externalLinks.map((link, idx) => (
                    <LinkRow key={idx}>
                      <FormField label="Title">
                        <Input 
                          value={link.title} 
                          onChange={(e) => setExternalLinks(prev => prev.map((l,i) => i===idx ? { ...l, title: e.target.value } : l))} 
                          placeholder="My Blog" 
                        />
                      </FormField>
                      <FormField label="URL">
                        <Input 
                          value={link.url} 
                          onChange={(e) => setExternalLinks(prev => prev.map((l,i) => i===idx ? { ...l, url: e.target.value } : l))} 
                          placeholder="https://myblog.com" 
                        />
                      </FormField>
                      <Button
                        $variant="dangerOutline"
                        $size="sm"
                        onClick={() => setExternalLinks(prev => prev.filter((_,i) => i!==idx))}
                        disabled={externalLinks.length === 1}
                      >
                        Remove
                      </Button>
                    </LinkRow>
                  ))}
                  <Button 
                    $variant="ghost" 
                    onClick={() => setExternalLinks(prev => [...prev, { title: '', url: '' }])}
                  >
                    + Add External Link
                  </Button>
                </LinksList>
              </LinksGroup>
            </Stack>
          </CollapsibleContent>
        </LinksSectionCard>
      </ContentWrapper>

      <StickyActionBar>
        <Button onClick={onSave} disabled={saving} $variant="olive" $size="lg">
          {saving ? 'Saving...' : 'Save Profile'}
        </Button>
      </StickyActionBar>
    </>
  );
}
