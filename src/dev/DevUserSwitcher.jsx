import { useState, useEffect } from 'react';
import styled from 'styled-components';
import InstagramStoryGenerator from '../modules/top10/components/InstagramStoryGenerator';
import AnnouncementModal from '../modules/shared/components/announcements/AnnouncementModal';
import AnnouncementBanner from '../modules/shared/components/announcements/AnnouncementBanner';

const MOCK_TOP10_TRACKS = [
  { position: 1, artist: 'Charli XCX', title: '360' },
  { position: 2, artist: 'Sabrina Carpenter', title: 'Espresso' },
  { position: 3, artist: 'Chappell Roan', title: 'Good Luck, Babe!' },
  { position: 4, artist: 'Billie Eilish', title: 'Birds of a Feather' },
  { position: 5, artist: 'Beyonce', title: 'Texas Hold \'Em' },
  { position: 6, artist: 'Kendrick Lamar', title: 'Not Like Us' },
  { position: 7, artist: 'Ariana Grande', title: 'we can\'t be friends' },
  { position: 8, artist: 'Dua Lipa', title: 'Illusion' },
  { position: 9, artist: 'Tyler, the Creator', title: 'Noid' },
  { position: 10, artist: 'Tinashe', title: 'Nasty' },
];

// Wrapper component to use InstagramStoryGenerator's hook-like pattern
const IgPreviewRenderer = ({ tracks, curatorName, slug, onImageReady }) => {
  const generator = InstagramStoryGenerator({ tracks, curatorName, slug, onImageReady });
  return generator.canvas;
};

/**
 * Dev-only component for quick user switching during development
 * Shows a floating panel with test user accounts for instant login
 *
 * Usage: Add to your root App component:
 *   {import.meta.env.DEV && <DevUserSwitcher />}
 */

const TEST_USERS = [
  {
    email: 'curator@test.com',
    label: 'Curator (Dev)',
    color: '#2196F3',
    role: 'curator',
    curatorName: 'Dev Curator'
  },
  { email: 'demo@flowerpil.io', label: 'Demo Curator (Hidden)', color: '#111827', role: 'curator' },
  { email: 'admin@test.com', label: 'Admin', color: '#E91E63', role: 'admin' },
];

const readCsrfToken = () => {
  if (typeof document === 'undefined') return '';
  try {
    const match = document.cookie.match(/(?:^|; )csrf_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  } catch {
    return '';
  }
};

const CollapsibleSection = ({ title, children, defaultCollapsed = true }) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  return (
    <SectionContainer>
      <SectionHeader
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        $collapsed={isCollapsed}
        aria-expanded={!isCollapsed}
      >
        <SectionTitle>{title}</SectionTitle>
        <SectionToggle $collapsed={isCollapsed}>▼</SectionToggle>
      </SectionHeader>
      <SectionBody $collapsed={isCollapsed} aria-hidden={isCollapsed}>
        {children}
      </SectionBody>
    </SectionContainer>
  );
};

export const DevUserSwitcher = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Referral code generator state
  const [referralEmail, setReferralEmail] = useState('');
  const [referralName, setReferralName] = useState('');
  const [referralType, setReferralType] = useState('artist');
  const [generatedCode, setGeneratedCode] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [showReferralForm, setShowReferralForm] = useState(false);

  // Instagram preview state
  const [showIgPreview, setShowIgPreview] = useState(false);
  const [igImageUrl, setIgImageUrl] = useState(null);

  // Announcement preview state
  const [announcements, setAnnouncements] = useState([]);
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState('');
  const [previewAnnouncement, setPreviewAnnouncement] = useState(null);
  const [showAnnouncementPreview, setShowAnnouncementPreview] = useState(false);

  // Generate random email and password
  const generateRandomEmail = () => {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    return `test-${randomStr}-${timestamp}@example.com`;
  };

  const generateRandomPassword = () => {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  };

  const generateDummyCredentials = () => {
    const email = generateRandomEmail();
    const password = generateRandomPassword();
    setReferralEmail(email);
    setGeneratedPassword(password);
  };

  // Hide in production
  if (!import.meta.env.DEV) return null;

  const quickLogin = async (user) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/auth/dev/quick-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: user.email,
          curatorName: user.curatorName || null
        })
      });

      const data = await response.json();

      if (data.success) {
        console.log('✅ Quick login successful:', data.user);

        // Reload to refresh auth state
        window.location.reload();
      } else {
        console.error('❌ Quick login failed:', data.message);
        alert(`Login failed: ${data.message}`);
      }
    } catch (error) {
      console.error('❌ Quick login error:', error);
      alert('Failed to login. Is the server running?');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': readCsrfToken()
        }
      });
      window.location.reload();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const generateReferralCode = async () => {
    if (!referralEmail) {
      alert('Please generate dummy credentials first');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/dev/referrals/issue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': readCsrfToken()
        },
        credentials: 'include',
        body: JSON.stringify({
          email: referralEmail,
          curator_name: referralName || 'Dev Curator',
          curator_type: referralType || 'artist'
        })
      });

      const data = await response.json();

      if (data.success && data.code) {
        setGeneratedCode(data.code);
        const signupUrl = `${window.location.origin}/signup?referral=${data.code}`;
        console.log('✅ Referral code generated:', data.code);
        console.log('📧 Email:', referralEmail);
        console.log('🔑 Password:', generatedPassword);
        console.log('🔗 Signup URL:', signupUrl);
      } else {
        console.error('❌ Failed to generate referral code:', data.error || data.message);
        alert(`Failed: ${data.error || data.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Referral generation error:', error);
      alert('Failed to generate referral code. Is the server running?');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      console.log('✅ Copied to clipboard:', text);
    } catch (error) {
      console.error('❌ Failed to copy:', error);
    }
  };

  // Fetch announcements for preview
  const fetchAnnouncements = async () => {
    try {
      const response = await fetch('/api/v1/admin/announcements', {
        credentials: 'include',
        headers: {
          'X-CSRF-Token': readCsrfToken()
        }
      });
      const data = await response.json();
      if (data.success && data.data) {
        setAnnouncements(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch announcements:', error);
    }
  };

  // Load announcements when panel opens
  useEffect(() => {
    if (isOpen) {
      fetchAnnouncements();
    }
  }, [isOpen]);

  // Trigger announcement preview
  const triggerAnnouncementPreview = () => {
    const announcement = announcements.find(a => a.id === parseInt(selectedAnnouncementId));
    if (!announcement) {
      alert('Please select an announcement');
      return;
    }

    // Get the first variant's blocks
    const variant = announcement.variants?.[0];
    if (!variant || !variant.blocks || variant.blocks.length === 0) {
      alert('This announcement has no content blocks');
      return;
    }

    setPreviewAnnouncement({
      id: announcement.id,
      format: announcement.format,
      blocks: variant.blocks,
      header_style: variant.header_style,
    });
    setShowAnnouncementPreview(true);
  };

  const closeAnnouncementPreview = () => {
    setShowAnnouncementPreview(false);
    setPreviewAnnouncement(null);
  };

  return (
    <Container>
      <ToggleButton onClick={() => setIsOpen(!isOpen)} $isOpen={isOpen}>
        {isOpen ? '✕' : '👤'}
      </ToggleButton>

      {isOpen && (
        <Panel>
          <PanelHeader>
            <Title>Dev User Switcher</Title>
            <Subtitle>Quick login for testing</Subtitle>
          </PanelHeader>

          <UserList>
            {TEST_USERS.map((user) => (
              <UserButton
                key={user.email}
                onClick={() => quickLogin(user)}
                disabled={isLoading}
                $color={user.color}
              >
                <UserDot $color={user.color} />
                <UserLabel>{user.label}</UserLabel>
                <UserEmail>{user.email}</UserEmail>
              </UserButton>
            ))}
          </UserList>

          <Divider />

          <SectionStack>
            <CollapsibleSection title="Referral Code">
              <ActionButton
                onClick={() => setShowReferralForm(!showReferralForm)}
                disabled={isLoading}
              >
                🎫 {showReferralForm ? 'Hide' : 'Generate'} Referral Code
              </ActionButton>

              {showReferralForm && (
                <ReferralForm>
                  <ActionButton
                    onClick={generateDummyCredentials}
                    disabled={isLoading}
                    style={{ marginBottom: '12px', background: '#2196F3', borderColor: '#2196F3' }}
                  >
                    🎲 Generate Dummy Credentials
                  </ActionButton>

                  <FormRow>
                    <FormLabel>Email</FormLabel>
                    <FormInput
                      type="email"
                      value={referralEmail}
                      onChange={(e) => setReferralEmail(e.target.value)}
                      placeholder="curator@example.com"
                      disabled={isLoading}
                      readOnly
                    />
                  </FormRow>

                  {generatedPassword && (
                    <FormRow>
                      <FormLabel>Password (for signup)</FormLabel>
                      <CopyableField onClick={() => copyToClipboard(generatedPassword)}>
                        {generatedPassword}
                        <CopyIcon>📋</CopyIcon>
                      </CopyableField>
                      <CodeHint>Click to copy</CodeHint>
                    </FormRow>
                  )}

                  <FormRow>
                    <FormLabel>Curator Name</FormLabel>
                    <FormInput
                      value={referralName}
                      onChange={(e) => setReferralName(e.target.value)}
                      placeholder="Dev Curator"
                      disabled={isLoading}
                    />
                  </FormRow>
                  <FormRow>
                    <FormLabel>Curator Type</FormLabel>
                    <FormSelect
                      value={referralType}
                      onChange={(e) => setReferralType(e.target.value)}
                      disabled={isLoading}
                    >
                      <option value="artist">Artist</option>
                      <option value="curator">Curator</option>
                      <option value="label">Label</option>
                      <option value="dj">DJ</option>
                      <option value="producer">Producer</option>
                      <option value="musician">Musician</option>
                    </FormSelect>
                  </FormRow>
                  <ActionButton
                    onClick={generateReferralCode}
                    disabled={isLoading || !referralEmail}
                    style={{ marginTop: '8px' }}
                  >
                    Generate Referral Code
                  </ActionButton>
                  {generatedCode && (
                    <GeneratedCodeBox>
                      <CodeLabel>Generated Code:</CodeLabel>
                      <CodeDisplay onClick={() => copyToClipboard(generatedCode)}>
                        {generatedCode}
                        <CopyIcon>📋</CopyIcon>
                      </CodeDisplay>
                      <CodeHint>Click to copy</CodeHint>
                      <RegistrationLink>
                        Use at: <LinkText onClick={() => copyToClipboard(`${window.location.origin}/signup?referral=${generatedCode}`)}>
                          {window.location.host}/signup?referral={generatedCode}
                        </LinkText>
                      </RegistrationLink>
                    </GeneratedCodeBox>
                  )}
                </ReferralForm>
              )}
            </CollapsibleSection>

            <CollapsibleSection title="Session">
              <ActionButton onClick={logout} disabled={isLoading}>
                🚪 Logout
              </ActionButton>
            </CollapsibleSection>

            <CollapsibleSection title="Curator Dashboard Controls">
              <ActionButton
                onClick={() => {
                  localStorage.removeItem('fp:curator:hasSeenDSPModal');
                  window.location.reload();
                }}
                disabled={isLoading}
                style={{ marginBottom: '8px', background: '#9C27B0', borderColor: '#9C27B0' }}
              >
                🎵 Show First Visit DSP Modal
              </ActionButton>

              <ActionButton
                onClick={() => {
                  localStorage.removeItem('fp:curator:hasSeenBioModal');
                  window.location.reload();
                }}
                disabled={isLoading}
                style={{ marginBottom: '8px', background: '#FF6B6B', borderColor: '#FF6B6B' }}
              >
                ✏️ Show First Visit Bio Modal
              </ActionButton>
            </CollapsibleSection>

            <CollapsibleSection title="LinkOut Banner Controls">
              <ActionButton
                onClick={() => {
                  localStorage.removeItem('fp:linkout:snoozeUntil');
                  localStorage.removeItem('fp:linkout:visitStart');
                  localStorage.setItem('fp:linkout:visitStart', (Date.now() - 11000).toString());
                  window.location.reload();
                }}
                disabled={isLoading}
                style={{ marginBottom: '8px', background: '#4CAF50', borderColor: '#4CAF50' }}
              >
                👁️ Show Banner Now
              </ActionButton>

              <ActionButton
                onClick={() => {
                  localStorage.removeItem('fp:linkout:snoozeUntil');
                  localStorage.removeItem('fp:linkout:visitStart');
                  localStorage.removeItem('fp:linkout:variant');
                  window.location.reload();
                }}
                disabled={isLoading}
              >
                🔄 Reset All LinkOut Preferences
              </ActionButton>
            </CollapsibleSection>

            <CollapsibleSection title="Announcement Preview">
              <FormRow style={{ marginBottom: '8px' }}>
                <FormSelect
                  value={selectedAnnouncementId}
                  onChange={(e) => setSelectedAnnouncementId(e.target.value)}
                  disabled={isLoading}
                >
                  <option value="">Select an announcement...</option>
                  {announcements.map((a) => (
                    <option key={a.id} value={a.id}>
                      [{a.status}] {a.title} ({a.format})
                    </option>
                  ))}
                </FormSelect>
              </FormRow>

              <ActionButton
                onClick={triggerAnnouncementPreview}
                disabled={isLoading || !selectedAnnouncementId}
                style={{ marginBottom: '8px', background: '#FF9800', borderColor: '#FF9800' }}
              >
                📢 Trigger Announcement
              </ActionButton>

              <ActionButton
                onClick={fetchAnnouncements}
                disabled={isLoading}
              >
                🔄 Refresh List
              </ActionButton>
            </CollapsibleSection>

            <CollapsibleSection title="Top 10 Instagram Preview">
              <ActionButton
                onClick={() => setShowIgPreview(true)}
                disabled={isLoading}
                style={{ background: '#E91E63', borderColor: '#E91E63' }}
              >
                📸 Preview IG Story (Mock Data)
              </ActionButton>
            </CollapsibleSection>
          </SectionStack>

          <Footer>
            <kbd>⌘</kbd> + <kbd>K</kbd> to toggle
          </Footer>
        </Panel>
      )}

      {showIgPreview && (
        <IgPreviewModal onClick={() => setShowIgPreview(false)}>
          <IgPreviewContent onClick={(e) => e.stopPropagation()}>
            <IgPreviewHeader>
              <Title>Instagram Story Preview</Title>
              <CloseButton onClick={() => setShowIgPreview(false)}>✕</CloseButton>
            </IgPreviewHeader>
            <IgPreviewBody>
              <IgPreviewRenderer
                tracks={MOCK_TOP10_TRACKS}
                curatorName="Dev Curator"
                slug="dev-curator"
                onImageReady={setIgImageUrl}
              />
              {igImageUrl && (
                <IgPreviewImage src={igImageUrl} alt="Instagram Story Preview" />
              )}
            </IgPreviewBody>
            {igImageUrl && (
              <IgPreviewFooter>
                <ActionButton
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = igImageUrl;
                    link.download = 'dev-top10-instagram-story.png';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  style={{ background: '#4CAF50', borderColor: '#4CAF50' }}
                >
                  Download Image
                </ActionButton>
              </IgPreviewFooter>
            )}
          </IgPreviewContent>
        </IgPreviewModal>
      )}

      {/* Announcement Preview */}
      {showAnnouncementPreview && previewAnnouncement && (
        previewAnnouncement.format === 'modal' ? (
          <AnnouncementModal
            announcement={previewAnnouncement}
            isOpen={true}
            onDismiss={closeAnnouncementPreview}
          />
        ) : (
          <AnnouncementBanner
            announcement={previewAnnouncement}
            position={previewAnnouncement.format === 'banner_top' ? 'top' : 'bottom'}
            isOpen={true}
            onDismiss={closeAnnouncementPreview}
          />
        )
      )}
    </Container>
  );
};

// Keyboard shortcut to toggle (Cmd/Ctrl + K)
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const event = new CustomEvent('toggle-dev-switcher');
      window.dispatchEvent(event);
    }
  });
}

const Container = styled.div`
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 999999;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
`;

const ToggleButton = styled.button`
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: ${props => props.$isOpen ? '#ff5252' : '#2196F3'};
  color: white;
  border: none;
  font-size: 24px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    transform: scale(1.05);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
  }

  &:active {
    transform: scale(0.95);
  }
`;

const Panel = styled.div`
  position: absolute;
  bottom: 70px;
  right: 0;
  width: 300px;
  background: #1e1e1e;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  padding: 16px;
  color: white;
  animation: slideUp 0.2s ease;

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

const PanelHeader = styled.div`
  margin-bottom: 16px;
`;

const Title = styled.h3`
  margin: 0 0 4px 0;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
`;

const Subtitle = styled.p`
  margin: 0;
  font-size: 12px;
  color: #999;
`;

const UserList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
`;

const UserButton = styled.button`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #2a2a2a;
  border: 1px solid ${props => props.$color}40;
  border-radius: 8px;
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;

  &:hover:not(:disabled) {
    background: #333;
    border-color: ${props => props.$color};
    transform: translateX(2px);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const UserDot = styled.div`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${props => props.$color};
  flex-shrink: 0;
`;

const UserLabel = styled.div`
  font-weight: 500;
  font-size: 14px;
  flex: 1;
`;

const UserEmail = styled.div`
  font-size: 11px;
  color: #888;
  font-family: 'SF Mono', 'Monaco', monospace;
`;

const Divider = styled.div`
  height: 1px;
  background: #333;
  margin: 12px 0;
`;

const SectionStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const SectionContainer = styled.div`
  border: 1px solid #333;
  border-radius: 8px;
  background: #242424;
  overflow: hidden;
`;

const SectionHeader = styled.button`
  width: 100%;
  padding: 10px 12px;
  background: ${props => props.$collapsed ? '#242424' : '#2a2a2a'};
  border: none;
  color: #e5e5e5;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  transition: background 0.2s ease;

  &:hover {
    background: #2f2f2f;
  }

  &:focus-visible {
    outline: 2px solid #2196F3;
    outline-offset: -2px;
  }
`;

const SectionTitle = styled.span`
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 600;
`;

const SectionToggle = styled.span`
  font-size: 12px;
  color: #bbb;
  transition: transform 0.2s ease;
  transform: rotate(${props => props.$collapsed ? '0deg' : '180deg'});
`;

const SectionBody = styled.div`
  padding: ${props => props.$collapsed ? '0 12px' : '12px'};
  max-height: ${props => props.$collapsed ? '0' : '2000px'};
  overflow: hidden;
  pointer-events: ${props => props.$collapsed ? 'none' : 'auto'};
  visibility: ${props => props.$collapsed ? 'hidden' : 'visible'};
  transition: max-height 0.25s ease, padding 0.25s ease;
`;

const ActionButton = styled.button`
  width: 100%;
  padding: 10px;
  background: #333;
  border: 1px solid #444;
  border-radius: 6px;
  color: white;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: #3a3a3a;
    border-color: #555;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Footer = styled.div`
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #333;
  text-align: center;
  font-size: 11px;
  color: #666;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;

  kbd {
    background: #333;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 10px;
    border: 1px solid #444;
  }
`;

const ReferralForm = styled.div`
  margin-top: 12px;
  padding: 12px;
  background: #252525;
  border-radius: 8px;
  border: 1px solid #333;
`;

const FormRow = styled.div`
  margin-bottom: 10px;

  &:last-of-type {
    margin-bottom: 0;
  }
`;

const FormLabel = styled.label`
  display: block;
  font-size: 11px;
  color: #999;
  margin-bottom: 4px;
  font-weight: 500;
`;

const FormInput = styled.input`
  width: 100%;
  padding: 8px 10px;
  background: #1e1e1e;
  border: 1px solid #444;
  border-radius: 6px;
  color: white;
  font-size: 13px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  box-sizing: border-box;
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: #2196F3;
    background: #232323;
  }

  &::placeholder {
    color: #666;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const FormSelect = styled.select`
  width: 100%;
  padding: 8px 10px;
  background: #1e1e1e;
  border: 1px solid #444;
  border-radius: 6px;
  color: white;
  font-size: 13px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  box-sizing: border-box;
  cursor: pointer;
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: #2196F3;
    background: #232323;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const GeneratedCodeBox = styled.div`
  margin-top: 12px;
  padding: 10px;
  background: #1a1a1a;
  border-radius: 6px;
  border: 1px solid #2196F3;
`;

const CodeLabel = styled.div`
  font-size: 11px;
  color: #999;
  margin-bottom: 6px;
  font-weight: 500;
`;

const CodeDisplay = styled.div`
  background: #0d0d0d;
  padding: 10px 12px;
  border-radius: 4px;
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 13px;
  color: #2196F3;
  word-break: break-all;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  &:hover {
    background: #111;
    color: #42A5F5;
  }

  &:active {
    transform: scale(0.98);
  }
`;

const CopyIcon = styled.span`
  font-size: 16px;
  flex-shrink: 0;
`;

const CodeHint = styled.div`
  margin-top: 4px;
  font-size: 10px;
  color: #666;
  text-align: center;
`;

const CopyableField = styled.div`
  background: #0d0d0d;
  padding: 10px 12px;
  border-radius: 4px;
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 13px;
  color: #4CAF50;
  word-break: break-all;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid #444;

  &:hover {
    background: #111;
    color: #66BB6A;
    border-color: #4CAF50;
  }

  &:active {
    transform: scale(0.98);
  }
`;

const RegistrationLink = styled.div`
  margin-top: 8px;
  padding: 8px;
  background: #252525;
  border-radius: 4px;
  font-size: 11px;
  color: #999;
`;

const LinkText = styled.span`
  color: #2196F3;
  cursor: pointer;
  text-decoration: underline;
  word-break: break-all;
  display: inline-block;
  margin-top: 4px;

  &:hover {
    color: #42A5F5;
  }
`;

const IgPreviewModal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000000;
`;

const IgPreviewContent = styled.div`
  background: #1e1e1e;
  border-radius: 12px;
  padding: 20px;
  max-width: 90vw;
  max-height: 90vh;
  overflow: auto;
`;

const IgPreviewHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
`;

const CloseButton = styled.button`
  background: #333;
  border: 1px solid #444;
  border-radius: 6px;
  color: white;
  width: 32px;
  height: 32px;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: #444;
  }
`;

const IgPreviewBody = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const IgPreviewImage = styled.img`
  max-height: 70vh;
  width: auto;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
`;

const IgPreviewFooter = styled.div`
  margin-top: 16px;
  display: flex;
  justify-content: center;
`;

export default DevUserSwitcher;
