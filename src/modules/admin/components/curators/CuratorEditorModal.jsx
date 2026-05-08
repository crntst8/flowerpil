import PropTypes from 'prop-types';
import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import {
  ModalRoot,
  ModalSurface,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  ModalCloseButton
} from '@shared/components/Modal';
import { theme, Button, Input } from '@shared/styles/GlobalStyles';
import PlaceholderArtwork from '@shared/components/PlaceholderArtwork';
import { usePlaceholderColor } from '@shared/hooks/usePlaceholderColor';
import { useAuth } from '@shared/contexts/AuthContext';
import CuratorForm from '../CuratorForm';
import {
  deleteBioProfile,
  forceLogoutCurator,
  getCuratorDetails,
  rotateCuratorFallbackFlowerColor,
  updateCuratorPassword,
  requestPasswordResetEmail
} from '../../services/adminService';

const ModalContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const PanelGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px), 1fr));
  gap: ${theme.spacing.md};
`;

const SidebarCard = styled.div`
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  padding: ${theme.spacing.sm};
  background: ${theme.colors.fpwhite};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  border-radius: 4px;
`;

const CardTitle = styled.h4`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(255, 0, 0);
`;

const AccountList = styled.ul`
  margin: 0;
  padding-left: ${theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
`;

const AccountItem = styled.li`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const AccountHeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${theme.spacing.md};
  padding: 1px;
`;

const AccountEmail = styled.span`
  font-weight: ${theme.fontWeights.medium};
  word-break: break-all;
`;

const AccountActions = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
`;

const AccountActionButton = styled(Button)`
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const PlaylistList = styled.ul`
  margin: 0;
  padding-left: ${theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
`;

const BioList = styled.ul`
  margin: 0;
  padding-left: ${theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
`;

const InlineMeta = styled.span`
  display: block;
  color: rgba(0, 0, 0, 0.6);
`;

const StatusBanner = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  border: ${theme.borders.solid} ${({ $variant }) =>
    $variant === 'error' ? theme.colors.danger : theme.colors.success};
  background: ${({ $variant }) =>
    $variant === 'error' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(34, 197, 94, 0.12)'};
  color: ${({ $variant }) =>
    $variant === 'error' ? theme.colors.danger : theme.colors.success};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border-radius: 2px;
`;

const PlaceholderRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
`;

const PlaceholderPreview = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 4px;
  overflow: hidden;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.15);
`;

const PlaceholderMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.6);
`;

const PlaceholderValue = styled.span`
  text-transform: none;
  letter-spacing: 0;
  color: rgba(0, 0, 0, 0.85);
`;

const PlaceholderSwatch = styled.span`
  display: inline-flex;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.2);
  margin-right: 6px;
  vertical-align: middle;
`;

const SummaryHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
  padding: ${theme.spacing.sm} ${theme.spacing.sm};
  border: ${theme.borders.solid} rgba(0, 0, 0, 0.12);
  background: rgba(0, 0, 0, 0.76);
  border-radius: 6px;
`;

const SummaryTitle = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;

  h3 {
    margin: 0;
    font-size: ${theme.fontSizes.large};
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: ${theme.colors.white};
  }

  span {
    font-family: ${theme.fonts.mono};
    font-size: ${theme.fontSizes.tiny};
    color: rgba(255, 255, 255, 0.6);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
`;

const BadgeRow = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
  align-items: center;
`;

const InfoBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: 999px;
  border: ${theme.borders.solid} rgba(145, 255, 0, 0.2);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ $tone }) => {
    switch ($tone) {
      case 'positive': return theme.colors.success;
      case 'warning': return '#d97706';
      default: return theme.colors.olive;
    }
  }};
  background: ${({ $tone }) => {
    switch ($tone) {
      case 'positive': return 'rgba(34, 197, 94, 0.12)';
      case 'warning': return 'rgba(217, 119, 6, 0.12)';
      default: return 'rgba(0, 0, 0, 0.04)';
    }
  }};
`;

const Divider = styled.hr`
  margin: ${theme.spacing.md} 0;
  border: none;
  border-top: ${theme.borders.dashed} rgba(0, 0, 0, 0.08);
`;

const ScrollRegion = styled.div`
  max-height: calc(80vh - 160px);
  overflow-y: auto;
  padding-right: ${theme.spacing.sm};

  @media (max-width: ${theme.breakpoints.tablet}) {
    max-height: calc(80vh - 140px);
  }
`;

const PasswordForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`; 

const DangerZone = styled.div`
  border: ${theme.borders.solidThin} rgba(220, 38, 38, 0.25);
  padding: ${theme.spacing.sm};
  background: rgba(220, 38, 38, 0.03);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.sm};
  border-radius: 4px;
`;

const DangerTitle = styled.span`
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${theme.colors.danger};
  font-size: ${theme.fontSizes.tiny};
`;

const formatDateTime = (value) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return '—';
  }
};

const CuratorEditorModal = ({
  isOpen,
  curatorId,
  onClose,
  onSaved,
  onDeleted
}) => {
  const { authenticatedFetch } = useAuth();
  const isCreateMode = !curatorId;
  const [curatorData, setCuratorData] = useState(null);
  const [adminAccounts, setAdminAccounts] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [bios, setBios] = useState([]);
  const [actionStatus, setActionStatus] = useState({ type: '', message: '' });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [resetEmailBusyId, setResetEmailBusyId] = useState(null);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [rotateBusy, setRotateBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setCuratorData(null);
      setAdminAccounts([]);
      setPlaylists([]);
      setBios([]);
      setPassword('');
      setConfirmPassword('');
      setActionStatus({ type: '', message: '' });
      return;
    }

    if (isCreateMode) {
      setCuratorData({});
      return;
    }

    const loadDetails = async () => {
      try {
        const detail = await getCuratorDetails(curatorId);
        setCuratorData(detail.curator || {});
        setAdminAccounts(detail.admin_accounts || []);
        setPlaylists(detail.playlists || []);
        setBios(detail.bios || []);
      } catch (error) {
        console.error('Failed to load curator details:', error);
        setActionStatus({
          type: 'error',
          message: error?.message || 'Failed to load curator details'
        });
      }
    };

    loadDetails();
  }, [isOpen, curatorId, isCreateMode]);

  const handleFormSaved = (updated) => {
    if (updated) {
      setCuratorData(updated);
      onSaved?.(updated);
      if (isCreateMode) {
        onClose();
      }
    }
  };

  const handleForceLogout = async () => {
    if (!curatorId) return;
    setLogoutBusy(true);
    setActionStatus({ type: '', message: '' });
    try {
      const result = await forceLogoutCurator(curatorId);
      setActionStatus({
        type: 'success',
        message: `Queued logout for ${result?.affected_accounts || 0} account(s).`
      });
    } catch (error) {
      setActionStatus({
        type: 'error',
        message: error?.message || 'Failed to force logout'
      });
    } finally {
      setLogoutBusy(false);
    }
  };

  const handleSendResetEmail = async (account) => {
    if (!account?.username) {
      setActionStatus({
        type: 'error',
        message: 'Account email is missing for this curator.'
      });
      return;
    }

    setResetEmailBusyId(account.id);
    setActionStatus({ type: '', message: '' });

    try {
      const response = await requestPasswordResetEmail(account.username);
      setActionStatus({
        type: 'success',
        message: response?.message || `Reset link sent to ${account.username}`
      });
    } catch (error) {
      setActionStatus({
        type: 'error',
        message: error?.message || 'Failed to send reset email'
      });
    } finally {
      setResetEmailBusyId(null);
    }
  };

  const handlePasswordReset = async (event) => {
    event.preventDefault();
    if (!curatorId) return;

    if (!password || !confirmPassword) {
      setActionStatus({ type: 'error', message: 'Enter and confirm the new password' });
      return;
    }
    if (password !== confirmPassword) {
      setActionStatus({ type: 'error', message: 'Passwords do not match' });
      return;
    }

    setPasswordBusy(true);
    setActionStatus({ type: '', message: '' });
    try {
      await updateCuratorPassword(curatorId, password);
      setPassword('');
      setConfirmPassword('');
      setActionStatus({ type: 'success', message: 'Password updated successfully' });
    } catch (error) {
      setActionStatus({
        type: 'error',
        message: error?.message || 'Failed to update password'
      });
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleBioDelete = async (bioId) => {
    try {
      await deleteBioProfile(bioId);
      setBios((prev) => prev.filter((bio) => bio.id !== bioId));
      setActionStatus({ type: 'success', message: 'Bio profile deleted' });
    } catch (error) {
      setActionStatus({
        type: 'error',
        message: error?.message || 'Failed to delete bio profile'
      });
    }
  };

  const handleDeleteCurator = async () => {
    if (!curatorId || deleteBusy) return;
    const confirmed = window.confirm('Delete this curator? This cannot be undone.');
    if (!confirmed) return;

    setDeleteBusy(true);
    try {
      const response = await authenticatedFetch(`/api/v1/curators/${curatorId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete curator');
      }

      onDeleted?.(curatorId);
      onClose();
    } catch (error) {
      setActionStatus({
        type: 'error',
        message: error?.message || 'Failed to delete curator'
      });
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleRotateFallbackColor = async () => {
    if (!curatorId || rotateBusy) return;
    setRotateBusy(true);
    setActionStatus({ type: '', message: '' });
    try {
      const result = await rotateCuratorFallbackFlowerColor(curatorId);
      const nextIndex = result?.fallback_flower_color_index;
      if (Number.isFinite(Number(nextIndex))) {
        setCuratorData((prev) =>
          prev ? { ...prev, fallback_flower_color_index: Number(nextIndex) } : prev
        );
      }
      setActionStatus({ type: 'success', message: 'Fallback flower color rotated.' });
    } catch (error) {
      setActionStatus({
        type: 'error',
        message: error?.message || 'Failed to rotate fallback flower color'
      });
    } finally {
      setRotateBusy(false);
    }
  };

  const playlistsPreview = useMemo(() => playlists.slice(0, 6), [playlists]);
  const biosPreview = useMemo(() => bios.slice(0, 6), [bios]);

  const fallbackColor = usePlaceholderColor(curatorData?.id, {
    colorIndex: curatorData?.fallback_flower_color_index,
    autoMark: false
  });
  const fallbackIndexLabel = Number.isFinite(Number(curatorData?.fallback_flower_color_index))
    ? `Index ${Number(curatorData?.fallback_flower_color_index)}`
    : 'Auto';

  const visibilityLabel = curatorData?.profile_visibility || 'public';
  const adminAccountCount = adminAccounts.length;
  const lastLogin = adminAccounts
    .map((account) => account.last_login)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0];

  return (
    <ModalRoot isOpen={isOpen} onDismiss={onClose}>
      <ModalSurface size="full">
        <ModalHeader>
          <ModalTitle>{isCreateMode ? 'Create Curator Account' : `Edit ${curatorData?.name || 'Curator'}`}</ModalTitle>
          <ModalCloseButton onClick={onClose} />
        </ModalHeader>
        <ModalBody>
          
          {actionStatus.message && (
            <StatusBanner $variant={actionStatus.type}>
              {actionStatus.message}
            </StatusBanner>
          )}
          <ScrollRegion>
            {!isCreateMode && curatorData && (
              <>
                <SummaryHeader>
                  <SummaryTitle>
                    <h3>{curatorData.name || 'Curator'}</h3>
                    <span>ID #{curatorData.id}</span>
                  </SummaryTitle>
                  <BadgeRow>
                    <InfoBadge>{curatorData.profile_type || curatorData.type || 'unknown type'}</InfoBadge>
                    {curatorData.tester && (
                      <InfoBadge $tone="positive">Tester</InfoBadge>
                    )}
                    {curatorData.upcoming_releases_enabled === true && (
                      <InfoBadge $tone="positive">Releases</InfoBadge>
                    )}
                    <InfoBadge>{visibilityLabel}</InfoBadge>
                    <InfoBadge>
                      Accounts: {adminAccountCount}
                    </InfoBadge>
                    <InfoBadge>
                      Last login {lastLogin ? formatDateTime(lastLogin) : '—'}
                    </InfoBadge>
                    <InfoBadge>
                      Joined {curatorData.created_at ? formatDateTime(curatorData.created_at) : '—'}
                    </InfoBadge>
                  </BadgeRow>
                </SummaryHeader>
                <Divider />
              </>
            )}
            <ModalContent>
            <SidebarCard>
                    <CardTitle>Flower</CardTitle>
                    <PlaceholderRow>
                      <PlaceholderPreview>
                        {curatorData?.id && (
                          <PlaceholderArtwork
                            itemId={curatorData.id}
                            colorIndex={curatorData.fallback_flower_color_index}
                            size="small"
                            borderRadius="6px"
                          />
                        )}
                      </PlaceholderPreview>
                      <PlaceholderMeta>
                        <PlaceholderValue>{fallbackIndexLabel}</PlaceholderValue>
                        {fallbackColor?.hex && (
                          <PlaceholderValue>
                            <PlaceholderSwatch style={{ backgroundColor: fallbackColor.hex }} />
                            {fallbackColor.hex}
                          </PlaceholderValue>
                        )}
                      </PlaceholderMeta>
                    </PlaceholderRow>
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={handleRotateFallbackColor}
                      disabled={rotateBusy || !curatorData?.id}
                    >
                      {rotateBusy ? '...' : 'Rotate'}
                    </Button>
                  </SidebarCard>
              <CuratorForm
                curator={curatorData || {}}
                onSave={handleFormSaved}
                onCancel={onClose}
              />

              {!isCreateMode && (
                <PanelGrid>
                  <SidebarCard>
                    <CardTitle>Accounts ({adminAccounts.length})</CardTitle>
                    {adminAccounts.length === 0 ? (
                      <InlineMeta>No linked accounts</InlineMeta>
                    ) : (
                      <AccountList>
                        {adminAccounts.map((account) => (
                          <AccountItem key={account.id}>
                            <AccountHeaderRow>
                              <AccountEmail>{account.username}</AccountEmail>
                              <AccountActions>
                                <AccountActionButton
                                  type="button"
                                  variant="secondary"
                                  onClick={() => handleSendResetEmail(account)}
                                  disabled={resetEmailBusyId === account.id}
                                >
                                  {resetEmailBusyId === account.id ? '...' : 'Reset'}
                                </AccountActionButton>
                              </AccountActions>
                            </AccountHeaderRow>
                            <InlineMeta>
                              Login: {formatDateTime(account.last_login)}
                            </InlineMeta>
                          </AccountItem>
                        ))}
                      </AccountList>
                    )}
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={handleForceLogout}
                      disabled={logoutBusy}
                    >
                      {logoutBusy ? '...' : 'Force Logout All'}
                    </Button>
                  </SidebarCard>

                  <SidebarCard as="form" onSubmit={handlePasswordReset}>
                    <CardTitle>Password</CardTitle>
                    <PasswordForm>
                      <Input
                        type="password"
                        placeholder="New password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                      />
                      <Input
                        type="password"
                        placeholder="Confirm"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        required
                      />
                    </PasswordForm>
                    <Button
                      size="small"
                      variant="primary"
                      type="submit"
                      disabled={passwordBusy}
                    >
                      {passwordBusy ? '...' : 'Set'}
                    </Button>
                  </SidebarCard>

                  <SidebarCard>
                    <CardTitle>Playlists ({playlists.length})</CardTitle>
                    {playlistsPreview.length === 0 ? (
                      <InlineMeta>None</InlineMeta>
                    ) : (
                      <PlaylistList>
                        {playlistsPreview.map((playlist) => (
                          <li key={playlist.id}>
                            {playlist.title || 'Untitled'}
                            <InlineMeta>
                              {playlist.published ? 'Pub' : 'Draft'} • {formatDateTime(playlist.publish_date || playlist.created_at)}
                            </InlineMeta>
                          </li>
                        ))}
                      </PlaylistList>
                    )}
                  </SidebarCard>

                  <SidebarCard>
                    <CardTitle>Bios ({bios.length})</CardTitle>
                    {biosPreview.length === 0 ? (
                      <InlineMeta>None</InlineMeta>
                    ) : (
                      <BioList>
                        {biosPreview.map((bioProfile) => (
                          <li key={bioProfile.id}>
                            {bioProfile.handle}
                            <InlineMeta>
                              {bioProfile.is_published ? 'Pub' : 'Draft'}
                              <Button
                                size="tiny"
                                variant="secondary"
                                onClick={() => handleBioDelete(bioProfile.id)}
                              >
                                Del
                              </Button>
                            </InlineMeta>
                          </li>
                        ))}
                      </BioList>
                    )}
                  </SidebarCard>

                  <SidebarCard>
                    <CardTitle>Releases Access</CardTitle>
                    <InlineMeta>
                      {curatorData?.upcoming_releases_enabled === true ? 'Enabled' : 'Disabled'}
                    </InlineMeta>
                    <Button
                      size="small"
                      variant={curatorData?.upcoming_releases_enabled === true ? 'danger' : 'primary'}
                      onClick={async () => {
                        try {
                          const newValue = curatorData?.upcoming_releases_enabled !== true;
                          const res = await authenticatedFetch(`/api/v1/curators/${curatorId}`, {
                            method: 'PUT',
                            body: JSON.stringify({ upcoming_releases_enabled: newValue })
                          });
                          if (res.ok) {
                            setCuratorData(prev => ({ ...prev, upcoming_releases_enabled: newValue }));
                            setActionStatus({ type: 'success', message: `Releases ${newValue ? 'enabled' : 'disabled'}` });
                          }
                        } catch (err) {
                          setActionStatus({ type: 'error', message: 'Failed to update releases access' });
                        }
                      }}
                    >
                      {curatorData?.upcoming_releases_enabled === true ? 'Disable' : 'Enable'}
                    </Button>
                  </SidebarCard>

                  <DangerZone>
                    <DangerTitle>Delete</DangerTitle>
                    <Button
                      variant="danger"
                      size="small"
                      onClick={handleDeleteCurator}
                      disabled={deleteBusy}
                    >
                      {deleteBusy ? '...' : 'Delete Curator'}
                    </Button>
                  </DangerZone>
                </PanelGrid>
              )}
            </ModalContent>
          </ScrollRegion>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </ModalFooter>
      </ModalSurface>
    </ModalRoot>
  );
};

export default CuratorEditorModal;

CuratorEditorModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  curatorId: PropTypes.number,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func,
  onDeleted: PropTypes.func
};
