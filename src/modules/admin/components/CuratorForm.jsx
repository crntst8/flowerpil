/* eslint-disable react/prop-types */
import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme, DashedBox, Button } from '@shared/styles/GlobalStyles';
import { useAuth } from '@shared/contexts/AuthContext';
import { 
  getCuratorTypeOptions, 
  DEFAULT_CURATOR_TYPE,
  mapLegacyType 
} from '@shared/constants/curatorTypes';

const FormContainer = styled(DashedBox)`
  padding: ${theme.spacing.lg};
  
`;

const FormHeader = styled.div`
  margin-bottom: ${theme.spacing.lg};
  
  h3 {
    margin: 0 0 ${theme.spacing.sm} 0;
    color: ${theme.colors.black};
  }
    
  
  p {
    margin: 0;
    font-size: ${theme.fontSizes.small};
    color: ${theme.colors.black};
    opacity: 0.7;
  }
`;

const FormGrid = styled.div`
  display: grid;
  gap: ${theme.spacing.lg};
  margin-bottom: ${theme.spacing.lg};
  
  @media (min-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr 1fr;
  }
`;

const FormSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const FormField = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const Label = styled.label`
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
  font-weight: 500;
`;

const HelperText = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.6);
`;

const Input = styled.input`
  padding: ${theme.spacing.sm};
  border: ${theme.borders.solid} rgba(0, 0, 0, 0.4);
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  
  &::placeholder {
    color: rgba(40, 33, 33, 0.5);
  }
  
  &:focus {
    outline: none;
    border-color: rgba(255, 255, 255, 0.6);
  }
`;

const TextArea = styled.textarea`
  padding: ${theme.spacing.sm};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.4);
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
  min-height: 80px;
  resize: vertical;
  
  &::placeholder {
    color: rgba(23, 22, 22, 0.5);
  }
  
  &:focus {
    outline: none;
    border-color: rgba(74, 109, 185, 0.64);
  }
`;

const Select = styled.select`
  padding: ${theme.spacing.sm};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.4);
  background:  ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  
  option {
    background: ${theme.colors.fpwhite};
    color: ${theme.colors.black};
    
    &.category-header {
      font-weight: bold;
      color: rgba(0, 0, 0, 0.6);
      font-style: italic;
    }
    
    &:disabled {
      color: rgba(140, 132, 132, 0.5);
    }
  }
  
  &:focus {
    outline: none;
    border-color: rgba(0, 0, 0, 0.6);
  }
`;


const LinkInputsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const LinkInput = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  align-items: flex-end;
`;

const FileInput = styled.input`
  padding: ${theme.spacing.sm};
  border: ${theme.borders.solid} rgba(0, 0, 0, 0.4);
background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  
  &::file-selector-button {
    background: ${theme.colors.fpwhite};
    border: 1px solid rgba(0, 0, 0, 0.3);
    color: ${theme.colors.black};
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.small};
    padding: ${theme.spacing.xs} ${theme.spacing.sm};
    margin-right: ${theme.spacing.sm};
    cursor: pointer;
  }
  
  &:focus {
    outline: none;
    border-color: rgba(255, 255, 255, 0.6);
  }
`;

const ImagePreviewContainer = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  margin-top: ${theme.spacing.sm};
    flex-direction: column;

`;

const ImagePreview = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  align-items: left;
`;

const PreviewImage = styled.img`
  width: 100px;
  height: 100px;
  object-fit: cover;
  border: ${theme.borders.dashed} rgba(0, 0, 0, 0.4);
`;

const PreviewPlaceholder = styled.div`
  width: 100px;
  height: 100px;
  border: ${theme.borders.dashed} rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(0, 0, 0, 0.5);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-align: center;
`;

const FormActions = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  justify-content: flex-end;
  padding-top: ${theme.spacing.lg};
  border-top: ${theme.borders.dashed} rgba(0, 0, 0, 0.3);
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    flex-direction: column-reverse;
  }
`;

const StatusMessage = styled.div`
  padding: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.md};
  border: ${theme.borders.dashed} ${props => 
    props.type === 'error' ? theme.colors.danger : theme.colors.success
  };
  background: ${props => 
    props.type === 'error' ? 'rgba(229, 62, 62, 0.1)' : 'rgba(76, 175, 80, 0.1)'
  };
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.black};
`;

const CuratorForm = ({ curator, onSave, onCancel }) => {
  const { authenticatedFetch } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    profile_type: DEFAULT_CURATOR_TYPE,
    tester: false,
    spotify_oauth_approved: false,
    youtube_oauth_approved: false,
    bio: '',
    bio_short: '',
    location: '',
    website_url: '',
    contact_email: '',
    spotify_url: '',
    apple_url: '',
    tidal_url: '',
    bandcamp_url: '',
    social_links: [],
    external_links: [],
    upcoming_releases_enabled: true,
    upcoming_shows_enabled: true,
    dsp_implementation_status: 'not_yet_implemented',
    custom_fields: {},
    verification_status: 'pending',
    profile_visibility: 'public'
  });
  const [socialLinks, setSocialLinks] = useState([{ platform: '', url: '' }]);
  const [externalLinks, setExternalLinks] = useState([{ title: '', url: '' }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [profileImageFile, setProfileImageFile] = useState(null);
  const [profileImagePreview, setProfileImagePreview] = useState(null);

  const showStatus = (type, message) => {
    setStatus({ type, message });
    setTimeout(() => setStatus({ type: '', message: '' }), 5000);
  };

  // Helper functions for custom field management
  const getCustomFieldValue = (fieldName, defaultValue) => {
    const customFields = formData.custom_fields || {};
    return customFields[fieldName] !== undefined ? customFields[fieldName] : defaultValue;
  };

  const handleCustomFieldChange = (fieldName, value) => {
    setFormData(prev => ({
      ...prev,
      custom_fields: {
        ...prev.custom_fields,
        [fieldName]: value
      }
    }));
  };

  const parseJsonField = (value, fallback) => {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    if (typeof value === 'string') {
      try {
        let parsed = JSON.parse(value);
        if (typeof parsed === 'string') {
          try {
            parsed = JSON.parse(parsed);
          } catch {
            return fallback;
          }
        }
        return parsed && typeof parsed === 'object' ? parsed : fallback;
      } catch {
        return fallback;
      }
    }
    return fallback;
  };

  const normalizeFlag = (value, defaultValue = false) => {
    if (value === undefined || value === null) return defaultValue;
    if (value === true || value === false) return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 1 || value === '1') return true;
    if (value === 0 || value === '0') return false;
    return Boolean(value);
  };

  // Initialize form data when curator prop changes
  useEffect(() => {
    if (curator) {
      const customFields = parseJsonField(curator.custom_fields, {});
      setFormData({
        name: curator.name || '',
        profile_type: mapLegacyType(curator.profile_type || curator.type || DEFAULT_CURATOR_TYPE),
        tester: normalizeFlag(curator.tester, false),
        spotify_oauth_approved: normalizeFlag(curator.spotify_oauth_approved, false),
        youtube_oauth_approved: normalizeFlag(curator.youtube_oauth_approved, false),
        bio: curator.bio || '',
        bio_short: curator.bio_short || '',
        location: curator.location || '',
        website_url: curator.website_url || '',
        contact_email: curator.contact_email || '',
        spotify_url: curator.spotify_url || '',
        apple_url: curator.apple_url || '',
        tidal_url: curator.tidal_url || '',
        bandcamp_url: curator.bandcamp_url || '',
        social_links: curator.social_links || [],
        external_links: curator.external_links || [],
        upcoming_releases_enabled: normalizeFlag(curator.upcoming_releases_enabled, true),
        upcoming_shows_enabled: normalizeFlag(curator.upcoming_shows_enabled, true),
        dsp_implementation_status: curator.dsp_implementation_status || 'not_yet_implemented',
        custom_fields: customFields,
        verification_status: curator.verification_status || 'pending',
        profile_visibility: curator.profile_visibility || 'public'
      });

      // Initialize link arrays with defensive parsing
      const ensureArray = (value, defaultItem) => {
        if (!value) return [defaultItem];
        if (Array.isArray(value) && value.length > 0) return value;
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) && parsed.length > 0 ? parsed : [defaultItem];
          } catch {
            return [defaultItem];
          }
        }
        return [defaultItem];
      };

      const initialSocialLinks = ensureArray(curator.social_links, { platform: '', url: '' });
      setSocialLinks(initialSocialLinks);

      const initialExternalLinks = ensureArray(curator.external_links, { title: '', url: '' });
      setExternalLinks(initialExternalLinks);
      
      // Set existing image previews
      setProfileImageFile(null);
      setProfileImagePreview(curator.profile_image || null);
    }
  }, [curator]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSocialLinkChange = (index, field, value) => {
    setSocialLinks(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addSocialLink = () => {
    setSocialLinks(prev => [...prev, { platform: '', url: '' }]);
  };

  const removeSocialLink = (index) => {
    setSocialLinks(prev => prev.filter((_, i) => i !== index));
  };

  const handleExternalLinkChange = (index, field, value) => {
    setExternalLinks(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addExternalLink = () => {
    setExternalLinks(prev => [...prev, { title: '', url: '' }]);
  };

  const removeExternalLink = (index) => {
    setExternalLinks(prev => prev.filter((_, i) => i !== index));
  };

  const handleImageChange = (e, type) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        showStatus('error', 'Please select a valid image file');
        return;
      }
      
      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        showStatus('error', 'Image file size must be less than 5MB');
        return;
      }
      
      if (type === 'profile') {
        setProfileImageFile(file);
        // Create preview
        const reader = new FileReader();
        reader.onload = (e) => setProfileImagePreview(e.target.result);
        reader.readAsDataURL(file);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      showStatus('error', 'Curator name is required');
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare form data for submission
      const submitData = new FormData();
      
      // Add text fields
      Object.keys(formData).forEach(key => {
        if (key === 'social_links') {
          submitData.append(key, JSON.stringify(socialLinks.filter(link => link.platform && link.url)));
        } else if (key === 'external_links') {
          submitData.append(key, JSON.stringify(externalLinks.filter(link => link.title && link.url)));
        } else if (key === 'custom_fields') {
          submitData.append(key, JSON.stringify(formData[key] || {}));
        } else if (key === 'tester') {
          submitData.append(key, formData.tester ? '1' : '0');
        } else if (key === 'spotify_oauth_approved') {
          submitData.append(key, formData.spotify_oauth_approved ? '1' : '0');
        } else if (key === 'youtube_oauth_approved') {
          submitData.append(key, formData.youtube_oauth_approved ? '1' : '0');
        } else {
          submitData.append(key, formData[key] || '');
        }
      });
      
      // Add image files if selected
      if (profileImageFile) {
        submitData.append('profile_image', profileImageFile);
      }


      // Submit to API
      const url = curator.id 
        ? `/api/v1/curators/${curator.id}`
        : '/api/v1/curators';
      
      const method = curator.id ? 'PUT' : 'POST';

      const response = await authenticatedFetch(url, {
        method,
        body: submitData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save curator');
      }

      const result = await response.json();
      const savedCurator = result?.data?.curator || result?.curator;
      if (!savedCurator) {
        showStatus('error', 'Curator saved but response payload was missing data');
        return;
      }
      onSave(savedCurator);

    } catch (error) {
      showStatus('error', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormContainer>

<FormSection>
            <ImagePreviewContainer>
              <ImagePreview>
                {profileImagePreview ? (
                  <PreviewImage src={profileImagePreview} alt="Profile preview" />
                ) : (
                  <PreviewPlaceholder>No Profile Image</PreviewPlaceholder>
                )}
              </ImagePreview>
                          <FormField>
              <Label>Profile Image</Label>
              <FileInput
                type="file"
                accept="image/*"
                onChange={(e) => handleImageChange(e, 'profile')}
              />
            </FormField>
            </ImagePreviewContainer>

            <FormField>
              <Label>Biography</Label>
              <TextArea
                value={formData.bio}
                onChange={(e) => handleInputChange('bio', e.target.value)}
                placeholder="Detailed biography or description"
                rows={4}
              />
            </FormField>





          </FormSection>
      {status.message && (
        <StatusMessage type={status.type}>
          {status.message}
        </StatusMessage>
      )}

      <form onSubmit={handleSubmit}>
        <FormGrid>
          <FormSection>
            <FormField>
              <Label>Name *</Label>
              <Input
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="Enter curator name"
                required
              />
            </FormField>

            <FormField>
              <Label>Profile Type</Label>
              <Select
                value={formData.profile_type}
                onChange={(e) => handleInputChange('profile_type', e.target.value)}
              >
                {getCuratorTypeOptions().map(option => (
                  option.isHeader ? (
                    <option 
                      key={option.value} 
                      value={option.value} 
                      disabled 
                      className="category-header"
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

            <FormField>
              <Label>Tester Access</Label>
              <Select
                value={formData.tester ? 'enabled' : 'disabled'}
                onChange={(e) => handleInputChange('tester', e.target.value === 'enabled')}
              >
                <option value="disabled">Disabled</option>
                <option value="enabled">Enabled</option>
              </Select>
              <HelperText>Enables feedback widget and internal tester views for this curator.</HelperText>
            </FormField>

            <h4 style={{ color: theme.colors.black, margin: '16px 0 8px 0', fontSize: '14px', fontWeight: 600, borderTop: '1px dashed rgba(0,0,0,0.2)', paddingTop: '16px' }}>
              OAuth Access Control
            </h4>
            <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: 'rgba(0,0,0,0.6)' }}>
              Controls whether curators can export playlists to their personal streaming accounts
            </p>

            <FormField>
              <Label>Spotify OAuth Access</Label>
              <Select
                value={formData.spotify_oauth_approved ? 'approved' : 'restricted'}
                onChange={(e) => handleInputChange('spotify_oauth_approved', e.target.value === 'approved')}
              >
                <option value="restricted">Restricted (Flowerpil account only)</option>
                <option value="approved">Approved (Own account access)</option>
              </Select>
              <HelperText>Grant this curator direct Spotify library access. Limited to 25 users due to API restrictions.</HelperText>
            </FormField>

            <FormField>
              <Label>YouTube OAuth Access</Label>
              <Select
                value={formData.youtube_oauth_approved ? 'approved' : 'restricted'}
                onChange={(e) => handleInputChange('youtube_oauth_approved', e.target.value === 'approved')}
              >
                <option value="restricted">Restricted (Flowerpil account only)</option>
                <option value="approved">Approved (Own account access)</option>
              </Select>
              <HelperText>Grant this curator direct YouTube Music library access.</HelperText>
            </FormField>

            <FormField>
              <Label>DSP Implementation Status</Label>
              <Select
                value={formData.dsp_implementation_status}
                onChange={(e) => handleInputChange('dsp_implementation_status', e.target.value)}
              >
                <option value="not_yet_implemented">Not Yet Implemented</option>
                <option value="implemented">Implemented</option>
              </Select>
              <HelperText>Track whether DSP integrations (Spotify, Apple Music, TIDAL) have been set up for this curator.</HelperText>
            </FormField>

            <FormField>
              <Label>Short Bio</Label>
              <Input
                type="text"
                value={formData.bio_short}
                onChange={(e) => handleInputChange('bio_short', e.target.value)}
                placeholder="One-line description"
              />
            </FormField>

            <FormField>
              <Label>Location</Label>
              <Input
                type="text"
                value={formData.location}
                onChange={(e) => handleInputChange('location', e.target.value)}
                placeholder="City, Country"
              />
            </FormField>

            <FormField>
              <Label>Website URL</Label>
              <Input
                type="url"
                value={formData.website_url}
                onChange={(e) => handleInputChange('website_url', e.target.value)}
                placeholder="https://example.com"
              />
            </FormField>

            <FormField>
              <Label>Contact Email</Label>
              <Input
                type="email"
                value={formData.contact_email}
                onChange={(e) => handleInputChange('contact_email', e.target.value)}
                placeholder="contact@example.com"
              />
            </FormField>
          </FormSection>
          
          <FormSection>
            <h4 style={{ color: theme.colors.black, margin: '0 0 6px 0', fontSize: '16px' }}>
              DSP Links
            </h4>
            
            <FormField>
              <Label>Spotify URL</Label>
              <Input
                type="url"
                value={formData.spotify_url}
                onChange={(e) => handleInputChange('spotify_url', e.target.value)}
                placeholder="https://open.spotify.com/artist/..."
              />
            </FormField>
            
            <FormField>
              <Label>Apple Music URL</Label>
              <Input
                type="url"
                value={formData.apple_url}
                onChange={(e) => handleInputChange('apple_url', e.target.value)}
                placeholder="https://music.apple.com/artist/..."
              />
            </FormField>
            
            <FormField>
              <Label>Tidal URL</Label>
              <Input
                type="url"
                value={formData.tidal_url}
                onChange={(e) => handleInputChange('tidal_url', e.target.value)}
                placeholder="https://tidal.com/artist/..."
              />
            </FormField>
            
            <FormField>
              <Label>Bandcamp URL</Label>
              <Input
                type="url"
                value={formData.bandcamp_url}
                onChange={(e) => handleInputChange('bandcamp_url', e.target.value)}
                placeholder="https://artist.bandcamp.com"
              />
            </FormField>

            <FormField>
              <Label>Spotify API Email</Label>
              <Input
                type="email"
                value={getCustomFieldValue('spotify_api_email', '')}
                onChange={(e) => handleCustomFieldChange('spotify_api_email', e.target.value)}
                placeholder="spotify-team@example.com"
              />
            </FormField>
          </FormSection>
          
          <FormSection>

            
          </FormSection>

          
        </FormGrid>

        {/* Section Preferences */}
        <FormSection>
          <FormHeader>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#fff' }}>Section Display Preferences</h4>
            <p style={{ margin: 0, fontSize: '12px', opacity: 0.7 }}>Configure how upcoming releases and shows sections appear on the profile</p>
          </FormHeader>
          
          <FormGrid>
            <FormSection>
              <FormField>
                <Label>Upcoming Releases Section</Label>
                <Select
                  value={formData.upcoming_releases_enabled ? 'enabled' : 'disabled'}
                  onChange={(e) => handleInputChange('upcoming_releases_enabled', e.target.value === 'enabled')}
                >
                  <option value="enabled">Show Section</option>
                  <option value="disabled">Hide Section</option>
                </Select>
              </FormField>

              <FormField>
                <Label>Releases Section Default State</Label>
                <Select
                  value={getCustomFieldValue('upcoming_releases_open_on_load', false) ? 'open' : 'closed'}
                  onChange={(e) => handleCustomFieldChange('upcoming_releases_open_on_load', e.target.value === 'open')}
                  disabled={!formData.upcoming_releases_enabled}
                >
                  <option value="closed">Closed by Default</option>
                  <option value="open">Open by Default</option>
                </Select>
              </FormField>
            </FormSection>

            <FormSection>
              <FormField>
                <Label>Upcoming Shows Section</Label>
                <Select
                  value={formData.upcoming_shows_enabled ? 'enabled' : 'disabled'}
                  onChange={(e) => handleInputChange('upcoming_shows_enabled', e.target.value === 'enabled')}
                >
                  <option value="enabled">Show Section</option>
                  <option value="disabled">Hide Section</option>
                </Select>
              </FormField>

              <FormField>
                <Label>Shows Section Default State</Label>
                <Select
                  value={getCustomFieldValue('upcoming_shows_open_on_load', false) ? 'open' : 'closed'}
                  onChange={(e) => handleCustomFieldChange('upcoming_shows_open_on_load', e.target.value === 'open')}
                  disabled={!formData.upcoming_shows_enabled}
                >
                  <option value="closed">Closed by Default</option>
                  <option value="open">Open by Default</option>
                </Select>
              </FormField>
            </FormSection>
          </FormGrid>
        </FormSection>

        <FormSection>
          <FormField>
            <Label>Social Media Links</Label>
            <LinkInputsContainer>
              {socialLinks.map((link, index) => (
                <LinkInput key={index}>
                  <Input
                    type="text"
                    value={link.platform}
                    onChange={(e) => handleSocialLinkChange(index, 'platform', e.target.value)}
                    placeholder="Platform (e.g., Instagram)"
                    style={{ flex: '0 0 150px' }}
                  />
                  <Input
                    type="url"
                    value={link.url}
                    onChange={(e) => handleSocialLinkChange(index, 'url', e.target.value)}
                    placeholder="https://instagram.com/username"
                    style={{ flex: 1 }}
                  />
                  <Button
                    type="button"
                    size="small"
                    variant="danger"
                    onClick={() => removeSocialLink(index)}
                    disabled={socialLinks.length === 1}
                  >
                    ×
                  </Button>
                </LinkInput>
              ))}
              <Button
                type="button"
                size="small"
                onClick={addSocialLink}
              >
                Add Social Link
              </Button>
            </LinkInputsContainer>
          </FormField>

          <FormField>
            <Label>External Links</Label>
            <LinkInputsContainer>
              {externalLinks.map((link, index) => (
                <LinkInput key={index}>
                  <Input
                    type="text"
                    value={link.title}
                    onChange={(e) => handleExternalLinkChange(index, 'title', e.target.value)}
                    placeholder="Link title"
                    style={{ flex: '0 0 150px' }}
                  />
                  <Input
                    type="url"
                    value={link.url}
                    onChange={(e) => handleExternalLinkChange(index, 'url', e.target.value)}
                    placeholder="https://example.com"
                    style={{ flex: 1 }}
                  />
                  <Button
                    type="button"
                    size="small"
                    variant="danger"
                    onClick={() => removeExternalLink(index)}
                    disabled={externalLinks.length === 1}
                  >
                    ×
                  </Button>
                </LinkInput>
              ))}
              <Button
                type="button"
                size="small"
                onClick={addExternalLink}
              >
                Add External Link
              </Button>
            </LinkInputsContainer>
          </FormField>
        </FormSection>

        <FormActions>
          <Button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : curator.id ? 'Update Curator' : 'Create Curator'}
          </Button>
        </FormActions>
      </form>
    </FormContainer>
  );
};

export default CuratorForm;
