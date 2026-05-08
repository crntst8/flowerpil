import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { EmptyState } from '../shared';
import {
  getUserGroups,
  createUserGroup,
  getUserGroup,
  updateUserGroup,
  deleteUserGroup,
  removeUsersFromGroup,
  groupBulkAction
} from '../../services/adminService';

const PanelContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.md};
`;

const Title = styled.h3`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  font-weight: ${theme.fontWeights.bold};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(0, 0, 0, 0.6);
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
      case 'primary':
        return `
          background: ${theme.colors.black};
          border-color: ${theme.colors.black};
          color: ${theme.colors.white};
          &:hover { background: rgba(0, 0, 0, 0.8); }
        `;
      case 'danger':
        return `
          background: rgba(220, 53, 69, 0.1);
          border-color: #dc3545;
          color: #dc3545;
          &:hover { background: rgba(220, 53, 69, 0.2); }
        `;
      case 'success':
        return `
          background: rgba(34, 197, 94, 0.1);
          border-color: #22c55e;
          color: #16a34a;
          &:hover { background: rgba(34, 197, 94, 0.2); }
        `;
      case 'warning':
        return `
          background: rgba(245, 158, 11, 0.1);
          border-color: #f59e0b;
          color: #d97706;
          &:hover { background: rgba(245, 158, 11, 0.2); }
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

const GroupsList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: ${theme.spacing.md};
`;

const GroupCard = styled.div.withConfig({
  shouldForwardProp: (prop) => !['$selected'].includes(prop)
})`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.md};
  background: ${theme.colors.white};
  border: 1px solid ${({ $selected }) => $selected ? '#6366f1' : 'rgba(0, 0, 0, 0.15)'};
  box-shadow: 2px 2px 0 ${({ $selected }) => $selected ? 'rgba(99, 102, 241, 0.2)' : 'rgba(0, 0, 0, 0.08)'};
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: ${({ $selected }) => $selected ? '#6366f1' : 'rgba(0, 0, 0, 0.3)'};
  }
`;

const GroupName = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.base};
  font-weight: ${theme.fontWeights.medium};
  color: ${theme.colors.black};
`;

const GroupDescription = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.6);
  min-height: 20px;
`;

const GroupMeta = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  color: rgba(0, 0, 0, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const MemberCount = styled.span`
  font-weight: ${theme.fontWeights.medium};
  color: #6366f1;
`;

const FormContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.1);
`;

const FormRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const FormLabel = styled.label`
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  font-weight: ${theme.fontWeights.medium};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 0, 0, 0.6);
`;

const FormInput = styled.input`
  padding: ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  border: 1px solid rgba(0, 0, 0, 0.2);
  background: ${theme.colors.white};

  &:focus {
    outline: none;
    border-color: ${theme.colors.black};
  }
`;

const FormTextarea = styled.textarea`
  padding: ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  border: 1px solid rgba(0, 0, 0, 0.2);
  background: ${theme.colors.white};
  min-height: 60px;
  resize: vertical;

  &:focus {
    outline: none;
    border-color: ${theme.colors.black};
  }
`;

const FormActions = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
`;

const DetailPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  background: rgba(99, 102, 241, 0.05);
  border: 1px solid rgba(99, 102, 241, 0.2);
`;

const DetailHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.md};
`;

const DetailTitle = styled.h4`
  margin: 0;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.base};
  font-weight: ${theme.fontWeights.medium};
  color: ${theme.colors.black};
`;

const DetailActions = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
`;

const MembersList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  max-height: 300px;
  overflow-y: auto;
`;

const MemberRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${theme.spacing.sm};
  background: ${theme.colors.white};
  border: 1px solid rgba(0, 0, 0, 0.1);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const MemberInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const MemberEmail = styled.span`
  color: ${theme.colors.black};
`;

const MemberUsername = styled.span`
  font-size: 10px;
  color: rgba(0, 0, 0, 0.5);
`;

const BulkActionsBar = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.3);
`;

const ReasonInput = styled.input`
  flex: 1;
  max-width: 300px;
  padding: 4px 8px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  border: 1px solid rgba(0, 0, 0, 0.2);
  background: ${theme.colors.white};

  &:focus {
    outline: none;
    border-color: ${theme.colors.black};
  }

  &::placeholder {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(0, 0, 0, 0.4);
  }
`;

const LoadingState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 150px;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.6);
`;

const UsersGroupsPanel = ({ onStatusChange }) => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupDetail, setGroupDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [bulkReason, setBulkReason] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUserGroups();
      setGroups(data);
    } catch (err) {
      console.error('Error loading groups:', err);
      onStatusChange?.('error', 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const loadGroupDetail = async (groupId) => {
    setLoadingDetail(true);
    try {
      const data = await getUserGroup(groupId);
      setGroupDetail(data);
    } catch (err) {
      console.error('Error loading group detail:', err);
      onStatusChange?.('error', 'Failed to load group details');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSelectGroup = (group) => {
    if (selectedGroup?.id === group.id) {
      setSelectedGroup(null);
      setGroupDetail(null);
    } else {
      setSelectedGroup(group);
      loadGroupDetail(group.id);
    }
    setBulkReason('');
  };

  const handleCreate = async () => {
    if (!createName.trim()) {
      onStatusChange?.('error', 'Group name is required');
      return;
    }

    setCreating(true);
    try {
      await createUserGroup(createName.trim(), createDescription.trim());
      setCreateName('');
      setCreateDescription('');
      setShowCreateForm(false);
      loadGroups();
      onStatusChange?.('success', 'Group created');
    } catch (err) {
      onStatusChange?.('error', err.message || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedGroup) return;
    if (!window.confirm(`Delete group "${selectedGroup.name}"? This cannot be undone.`)) return;

    try {
      await deleteUserGroup(selectedGroup.id);
      setSelectedGroup(null);
      setGroupDetail(null);
      loadGroups();
      onStatusChange?.('success', 'Group deleted');
    } catch (err) {
      onStatusChange?.('error', err.message || 'Failed to delete group');
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!selectedGroup) return;

    try {
      await removeUsersFromGroup(selectedGroup.id, [userId]);
      loadGroupDetail(selectedGroup.id);
      loadGroups();
      onStatusChange?.('success', 'Member removed');
    } catch (err) {
      onStatusChange?.('error', err.message || 'Failed to remove member');
    }
  };

  const handleBulkAction = async (action) => {
    if (!selectedGroup || !bulkReason.trim()) {
      onStatusChange?.('error', 'Reason is required');
      return;
    }

    setBulkLoading(true);
    try {
      const result = await groupBulkAction(selectedGroup.id, action, bulkReason.trim());
      const successCount = result.success || 0;
      const failCount = result.failed || 0;

      if (failCount === 0) {
        onStatusChange?.('success', `${action} applied to ${successCount} member(s)`);
      } else {
        onStatusChange?.('warning', `${action}: ${successCount} succeeded, ${failCount} failed`);
      }
      setBulkReason('');
      loadGroupDetail(selectedGroup.id);
    } catch (err) {
      onStatusChange?.('error', err.message || 'Bulk action failed');
    } finally {
      setBulkLoading(false);
    }
  };

  const members = groupDetail?.members || [];

  return (
    <PanelContainer>
      <Header>
        <Title>User Groups</Title>
        <ActionButton $variant="primary" onClick={() => setShowCreateForm(!showCreateForm)}>
          {showCreateForm ? 'Cancel' : 'New Group'}
        </ActionButton>
      </Header>

      {showCreateForm && (
        <FormContainer>
          <FormRow>
            <FormLabel>Group Name</FormLabel>
            <FormInput
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g., Beta Testers"
              disabled={creating}
            />
          </FormRow>
          <FormRow>
            <FormLabel>Description (optional)</FormLabel>
            <FormTextarea
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              placeholder="What is this group for?"
              disabled={creating}
            />
          </FormRow>
          <FormActions>
            <ActionButton $variant="primary" onClick={handleCreate} disabled={creating || !createName.trim()}>
              Create Group
            </ActionButton>
          </FormActions>
        </FormContainer>
      )}

      {loading ? (
        <LoadingState>Loading groups...</LoadingState>
      ) : groups.length === 0 ? (
        <EmptyState message="No groups created yet" />
      ) : (
        <GroupsList>
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              $selected={selectedGroup?.id === group.id}
              onClick={() => handleSelectGroup(group)}
            >
              <GroupName>{group.name}</GroupName>
              <GroupDescription>{group.description || 'No description'}</GroupDescription>
              <GroupMeta>
                <MemberCount>{group.member_count} members</MemberCount>
              </GroupMeta>
            </GroupCard>
          ))}
        </GroupsList>
      )}

      {selectedGroup && (
        <DetailPanel>
          <DetailHeader>
            <DetailTitle>{selectedGroup.name}</DetailTitle>
            <DetailActions>
              <ActionButton $variant="danger" onClick={handleDelete}>
                Delete Group
              </ActionButton>
              <ActionButton onClick={() => { setSelectedGroup(null); setGroupDetail(null); }}>
                Close
              </ActionButton>
            </DetailActions>
          </DetailHeader>

          {members.length > 0 && (
            <BulkActionsBar>
              <span style={{ fontFamily: theme.fonts.mono, fontSize: '11px' }}>
                {members.length} members
              </span>
              <ReasonInput
                value={bulkReason}
                onChange={(e) => setBulkReason(e.target.value)}
                placeholder="Reason for bulk action..."
                disabled={bulkLoading}
              />
              <ActionButton
                $variant="success"
                onClick={() => handleBulkAction('restore')}
                disabled={bulkLoading || !bulkReason.trim()}
              >
                Restore All
              </ActionButton>
              <ActionButton
                $variant="warning"
                onClick={() => handleBulkAction('suspend')}
                disabled={bulkLoading || !bulkReason.trim()}
              >
                Suspend All
              </ActionButton>
              <ActionButton
                $variant="success"
                onClick={() => handleBulkAction('unlock_exports')}
                disabled={bulkLoading || !bulkReason.trim()}
              >
                Unlock Exports
              </ActionButton>
            </BulkActionsBar>
          )}

          {loadingDetail ? (
            <LoadingState>Loading members...</LoadingState>
          ) : members.length === 0 ? (
            <EmptyState message="No members in this group. Add users from the Accounts tab." />
          ) : (
            <MembersList>
              {members.map((member) => (
                <MemberRow key={member.id}>
                  <MemberInfo>
                    <MemberEmail>{member.email}</MemberEmail>
                    {member.username && <MemberUsername>@{member.username}</MemberUsername>}
                  </MemberInfo>
                  <ActionButton onClick={() => handleRemoveMember(member.id)}>
                    Remove
                  </ActionButton>
                </MemberRow>
              ))}
            </MembersList>
          )}
        </DetailPanel>
      )}
    </PanelContainer>
  );
};

export default UsersGroupsPanel;
