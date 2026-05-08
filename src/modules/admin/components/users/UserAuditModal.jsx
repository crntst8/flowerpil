import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import {
  ModalRoot,
  ModalSurface,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  ModalCloseButton
} from '@shared/components/Modal/Modal';
import {
  getPublicUser,
  suspendUser,
  unsuspendUser,
  restrictUser,
  revokeUser,
  unlockUserExports,
  updateUserBadge
} from '../../services/adminService';
import UserBadge from './UserBadge';

const LoadingState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.6);
`;

const ErrorState = styled.div`
  padding: ${theme.spacing.md};
  background: rgba(220, 53, 69, 0.1);
  border: 1px solid ${theme.colors.error};
  color: ${theme.colors.error};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const SectionTitle = styled.h3`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  font-weight: ${theme.fontWeights.bold};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(0, 0, 0, 0.6);
  border-bottom: 1px dashed rgba(0, 0, 0, 0.2);
  padding-bottom: ${theme.spacing.xs};
`;

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: ${theme.spacing.xs} ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const InfoLabel = styled.span`
  color: rgba(0, 0, 0, 0.6);
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.05em;
`;

const InfoValue = styled.span`
  color: ${theme.colors.black};
  word-break: break-word;
`;

const StatusBadge = styled.span.withConfig({
  shouldForwardProp: (prop) => !['$status'].includes(prop)
})`
  display: inline-flex;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: ${theme.fontWeights.medium};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 1px solid;
  background: ${({ $status }) => {
    switch ($status) {
      case 'active': return 'rgba(34, 197, 94, 0.15)';
      case 'suspended': return 'rgba(245, 158, 11, 0.15)';
      case 'restricted': return 'rgba(249, 115, 22, 0.15)';
      case 'revoked': return 'rgba(220, 53, 69, 0.15)';
      case 'pending': return 'rgba(99, 102, 241, 0.15)';
      default: return 'rgba(0, 0, 0, 0.08)';
    }
  }};
  border-color: ${({ $status }) => {
    switch ($status) {
      case 'active': return '#22c55e';
      case 'suspended': return '#f59e0b';
      case 'restricted': return '#f97316';
      case 'revoked': return '#dc3545';
      case 'pending': return '#6366f1';
      default: return 'rgba(0, 0, 0, 0.3)';
    }
  }};
  color: ${({ $status }) => {
    switch ($status) {
      case 'active': return '#16a34a';
      case 'suspended': return '#d97706';
      case 'restricted': return '#ea580c';
      case 'revoked': return '#dc3545';
      case 'pending': return '#4f46e5';
      default: return 'rgba(0, 0, 0, 0.7)';
    }
  }};
`;

const BadgesList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.xs};
`;

const ActionHistory = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  max-height: 200px;
  overflow-y: auto;
`;

const ActionItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: ${theme.spacing.sm};
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.08);
  font-family: ${theme.fonts.mono};
  font-size: 11px;
`;

const ActionMeta = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  color: rgba(0, 0, 0, 0.5);
  font-size: 10px;
`;

const ActionReason = styled.div`
  color: ${theme.colors.black};
`;

const ActionsPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.1);
`;

const ActionButtons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.sm};
`;

const ActionButton = styled.button.withConfig({
  shouldForwardProp: (prop) => !['$variant'].includes(prop)
})`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  font-weight: ${theme.fontWeights.medium};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 1px solid;
  cursor: pointer;
  transition: all 0.15s ease;

  ${({ $variant }) => {
    switch ($variant) {
      case 'danger':
        return `
          background: rgba(220, 53, 69, 0.1);
          border-color: ${theme.colors.error};
          color: ${theme.colors.error};
          &:hover { background: rgba(220, 53, 69, 0.2); }
        `;
      case 'warning':
        return `
          background: rgba(245, 158, 11, 0.1);
          border-color: #f59e0b;
          color: #d97706;
          &:hover { background: rgba(245, 158, 11, 0.2); }
        `;
      case 'success':
        return `
          background: rgba(34, 197, 94, 0.1);
          border-color: #22c55e;
          color: #16a34a;
          &:hover { background: rgba(34, 197, 94, 0.2); }
        `;
      default:
        return `
          background: rgba(0, 0, 0, 0.05);
          border-color: rgba(0, 0, 0, 0.2);
          color: ${theme.colors.black};
          &:hover { background: rgba(0, 0, 0, 0.1); }
        `;
    }
  }}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ReasonInput = styled.textarea`
  width: 100%;
  min-height: 60px;
  padding: ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  border: 1px solid rgba(0, 0, 0, 0.2);
  background: ${theme.colors.white};
  resize: vertical;

  &:focus {
    outline: none;
    border-color: ${theme.colors.black};
  }
`;

const ReasonLabel = styled.label`
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 0, 0, 0.6);
`;

const EmptyState = styled.div`
  padding: ${theme.spacing.md};
  text-align: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.5);
`;

const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatActionType = (type) => {
  const labels = {
    suspend: 'Suspended',
    unsuspend: 'Restored',
    restrict: 'Restricted',
    revoke: 'Revoked',
    unlock_exports: 'Exports Unlocked',
    badge_add: 'Badge Added',
    badge_remove: 'Badge Removed'
  };
  return labels[type] || type;
};

const UserAuditModal = ({ isOpen, onClose, userId, onUserUpdated }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userData, setUserData] = useState(null);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (isOpen && userId) {
      loadUserData();
    }
  }, [isOpen, userId]);

  const loadUserData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPublicUser(userId);
      setUserData(data);
    } catch (err) {
      console.error('Error loading user data:', err);
      setError(err.message || 'Failed to load user data');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (actionFn, actionName) => {
    if (!reason.trim()) {
      setError('Reason is required for this action');
      return;
    }

    setActionLoading(true);
    setError(null);
    try {
      await actionFn(userId, reason.trim());
      setReason('');
      await loadUserData();
      if (onUserUpdated) {
        onUserUpdated();
      }
    } catch (err) {
      console.error(`Error performing ${actionName}:`, err);
      setError(err.message || `Failed to ${actionName}`);
    } finally {
      setActionLoading(false);
    }
  };

  const user = userData?.user;
  const actions = userData?.actionHistory || [];

  return (
    <ModalRoot isOpen={isOpen} onClose={onClose}>
      <ModalSurface $size="lg">
        <ModalCloseButton />
        <ModalHeader>
          <ModalTitle>User Audit</ModalTitle>
        </ModalHeader>

        <ModalBody>
          {loading && <LoadingState>Loading user data...</LoadingState>}

          {error && <ErrorState>{error}</ErrorState>}

          {!loading && user && (
            <>
              <Section>
                <SectionTitle>Account Information</SectionTitle>
                <InfoGrid>
                  <InfoLabel>User ID</InfoLabel>
                  <InfoValue>{user.id}</InfoValue>

                  <InfoLabel>Email</InfoLabel>
                  <InfoValue>{user.email}</InfoValue>

                  <InfoLabel>Username</InfoLabel>
                  <InfoValue>{user.username || 'N/A'}</InfoValue>

                  <InfoLabel>Status</InfoLabel>
                  <InfoValue>
                    <StatusBadge $status={user.status || 'active'}>
                      {user.status || 'active'}
                    </StatusBadge>
                  </InfoValue>

                  <InfoLabel>User Type</InfoLabel>
                  <InfoValue>{user.user_type || 'public'}</InfoValue>

                  <InfoLabel>Active</InfoLabel>
                  <InfoValue>{user.is_active ? 'Yes' : 'No'}</InfoValue>

                  <InfoLabel>Exports Unlocked</InfoLabel>
                  <InfoValue>{user.exports_unlocked ? 'Yes' : 'No'}</InfoValue>

                  <InfoLabel>Created</InfoLabel>
                  <InfoValue>{formatDate(user.created_at)}</InfoValue>

                  <InfoLabel>Badges</InfoLabel>
                  <InfoValue>
                    {user.badges?.length > 0 ? (
                      <BadgesList>
                        {user.badges.map((badge, idx) => (
                          <UserBadge key={idx} badge={badge} />
                        ))}
                      </BadgesList>
                    ) : (
                      'None'
                    )}
                  </InfoValue>
                </InfoGrid>
              </Section>

              <Section>
                <SectionTitle>Import Usage (Last 24h)</SectionTitle>
                <InfoGrid>
                  <InfoLabel>Imports</InfoLabel>
                  <InfoValue>{userData.importUsage?.last24h || 0}</InfoValue>
                </InfoGrid>
              </Section>

              {userData.exportRequest && (
                <Section>
                  <SectionTitle>Export Access Request</SectionTitle>
                  <InfoGrid>
                    <InfoLabel>Status</InfoLabel>
                    <InfoValue>
                      <StatusBadge $status={userData.exportRequest.status}>
                        {userData.exportRequest.status}
                      </StatusBadge>
                    </InfoValue>
                    <InfoLabel>Requested</InfoLabel>
                    <InfoValue>{formatDate(userData.exportRequest.created_at)}</InfoValue>
                  </InfoGrid>
                </Section>
              )}

              <Section>
                <SectionTitle>Action History</SectionTitle>
                {actions.length > 0 ? (
                  <ActionHistory>
                    {actions.map((action, idx) => (
                      <ActionItem key={idx}>
                        <ActionMeta>
                          <span>{formatActionType(action.action_type)}</span>
                          <span>{formatDate(action.created_at)}</span>
                        </ActionMeta>
                        <ActionReason>{action.reason}</ActionReason>
                      </ActionItem>
                    ))}
                  </ActionHistory>
                ) : (
                  <EmptyState>No actions recorded</EmptyState>
                )}
              </Section>

              <ActionsPanel>
                <SectionTitle>Admin Actions</SectionTitle>

                <div>
                  <ReasonLabel>Reason (required)</ReasonLabel>
                  <ReasonInput
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Enter reason for action..."
                    disabled={actionLoading}
                  />
                </div>

                <ActionButtons>
                  {(user.status === 'suspended' || user.status === 'restricted') && (
                    <ActionButton
                      $variant="success"
                      onClick={() => handleAction(unsuspendUser, 'restore')}
                      disabled={actionLoading || !reason.trim()}
                    >
                      Restore
                    </ActionButton>
                  )}

                  {user.status !== 'suspended' && user.status !== 'revoked' && (
                    <ActionButton
                      $variant="warning"
                      onClick={() => handleAction(suspendUser, 'suspend')}
                      disabled={actionLoading || !reason.trim()}
                    >
                      Suspend
                    </ActionButton>
                  )}

                  {user.status !== 'restricted' && user.status !== 'revoked' && (
                    <ActionButton
                      $variant="warning"
                      onClick={() => handleAction(restrictUser, 'restrict')}
                      disabled={actionLoading || !reason.trim()}
                    >
                      Restrict
                    </ActionButton>
                  )}

                  {user.status !== 'revoked' && (
                    <ActionButton
                      $variant="danger"
                      onClick={() => handleAction(revokeUser, 'revoke')}
                      disabled={actionLoading || !reason.trim()}
                    >
                      Revoke Access
                    </ActionButton>
                  )}

                  {!user.exports_unlocked && (
                    <ActionButton
                      $variant="success"
                      onClick={() => handleAction(unlockUserExports, 'unlock exports')}
                      disabled={actionLoading || !reason.trim()}
                    >
                      Unlock Exports
                    </ActionButton>
                  )}
                </ActionButtons>
              </ActionsPanel>
            </>
          )}
        </ModalBody>

        <ModalFooter>
          <ActionButton onClick={onClose}>Close</ActionButton>
        </ModalFooter>
      </ModalSurface>
    </ModalRoot>
  );
};

export default UserAuditModal;
