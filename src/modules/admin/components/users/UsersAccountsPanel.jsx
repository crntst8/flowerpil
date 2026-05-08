import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { SearchFilter, EmptyState } from '../shared';
import { getPublicUsers, bulkUserAction, getUserGroups, addUsersToGroup } from '../../services/adminService';
import UserBadge from './UserBadge';
import UserAuditModal from './UserAuditModal';
import EmailComposeModal from './EmailComposeModal';

const PanelContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const ToolbarRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
`;

const SearchWrapper = styled.div`
  flex: 1;
  min-width: 200px;
  max-width: 400px;
`;

const StatsRow = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  color: rgba(0, 0, 0, 0.6);
`;

const StatItem = styled.span`
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const UsersTable = styled.div`
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(0, 0, 0, 0.15);
  background: ${theme.colors.white};
`;

const TableHeader = styled.div`
  display: grid;
  grid-template-columns: 32px 60px 1fr 140px 100px 100px 80px;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background: rgba(0, 0, 0, 0.05);
  border-bottom: 1px solid rgba(0, 0, 0, 0.15);
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  font-weight: ${theme.fontWeights.bold};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(0, 0, 0, 0.6);

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 32px 50px 1fr 80px 80px;

    > :nth-child(5),
    > :nth-child(6) {
      display: none;
    }
  }
`;

const TableRow = styled.div.withConfig({
  shouldForwardProp: (prop) => !['$status', '$selected'].includes(prop)
})`
  display: grid;
  grid-template-columns: 32px 60px 1fr 140px 100px 100px 80px;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  transition: background 0.15s ease;
  cursor: pointer;

  background: ${({ $status, $selected }) => {
    if ($selected) return 'rgba(99, 102, 241, 0.08)';
    switch ($status) {
      case 'suspended': return 'rgba(245, 158, 11, 0.05)';
      case 'restricted': return 'rgba(249, 115, 22, 0.05)';
      case 'revoked': return 'rgba(220, 53, 69, 0.05)';
      default: return 'transparent';
    }
  }};

  &:hover {
    background: ${({ $selected }) => $selected ? 'rgba(99, 102, 241, 0.12)' : 'rgba(0, 0, 0, 0.03)'};
  }

  &:last-child {
    border-bottom: none;
  }

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 32px 50px 1fr 80px 80px;

    > :nth-child(5),
    > :nth-child(6) {
      display: none;
    }
  }
`;

const CellId = styled.div`
  color: rgba(0, 0, 0, 0.5);
  font-size: 11px;
`;

const CellEmail = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
`;

const EmailText = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const UsernameText = styled.span`
  font-size: 10px;
  color: rgba(0, 0, 0, 0.5);
`;

const CellBadges = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

const CellStatus = styled.div``;

const StatusBadge = styled.span.withConfig({
  shouldForwardProp: (prop) => !['$status'].includes(prop)
})`
  display: inline-flex;
  padding: 2px 6px;
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

const CellExports = styled.div`
  font-size: 11px;
  color: ${({ $unlocked }) => $unlocked ? '#16a34a' : 'rgba(0, 0, 0, 0.4)'};
`;

const CellAction = styled.div``;

const AuditButton = styled.button`
  padding: 4px 8px;
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  font-weight: ${theme.fontWeights.medium};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.2);
  color: ${theme.colors.black};
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: rgba(0, 0, 0, 0.1);
  }
`;

const Pagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.md};
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-top: none;
  background: rgba(0, 0, 0, 0.02);
`;

const PaginationInfo = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  color: rgba(0, 0, 0, 0.6);
`;

const PaginationButtons = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
`;

const PageButton = styled.button`
  padding: 6px 12px;
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  font-weight: ${theme.fontWeights.medium};
  background: ${theme.colors.white};
  border: 1px solid rgba(0, 0, 0, 0.2);
  color: ${theme.colors.black};
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.05);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const LoadingOverlay = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${theme.spacing.xl};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.6);
`;

const Checkbox = styled.input.attrs({ type: 'checkbox' })`
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: ${theme.colors.black};
`;

const CellCheckbox = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const BulkActionBar = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.md};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.3);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const SelectionCount = styled.span`
  font-weight: ${theme.fontWeights.medium};
  color: #4f46e5;
`;

const BulkActionButtons = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  margin-left: auto;
`;

const BulkButton = styled.button.withConfig({
  shouldForwardProp: (prop) => !['$variant'].includes(prop)
})`
  padding: 4px 10px;
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  font-weight: ${theme.fontWeights.medium};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 1px solid;
  cursor: pointer;
  transition: all 0.15s ease;

  ${({ $variant }) => {
    switch ($variant) {
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
      case 'danger':
        return `
          background: rgba(220, 53, 69, 0.1);
          border-color: #dc3545;
          color: #dc3545;
          &:hover { background: rgba(220, 53, 69, 0.2); }
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

const ClearSelectionButton = styled.button`
  padding: 4px 10px;
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  font-weight: ${theme.fontWeights.medium};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: transparent;
  border: 1px solid rgba(0, 0, 0, 0.2);
  color: rgba(0, 0, 0, 0.6);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
  }
`;

const BulkReasonInput = styled.input`
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

const GroupDropdownContainer = styled.div`
  position: relative;
  display: inline-block;
`;

const GroupDropdownButton = styled.button`
  padding: 4px 10px;
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  font-weight: ${theme.fontWeights.medium};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid #6366f1;
  color: #4f46e5;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: rgba(99, 102, 241, 0.2);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const GroupDropdownMenu = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 100;
  min-width: 200px;
  margin-top: 4px;
  padding: ${theme.spacing.xs};
  background: ${theme.colors.white};
  border: 1px solid rgba(0, 0, 0, 0.2);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
`;

const GroupDropdownItem = styled.button`
  display: block;
  width: 100%;
  padding: ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-align: left;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const GroupDropdownEmpty = styled.div`
  padding: ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.5);
  text-align: center;
`;

const UsersAccountsPanel = ({ onStatusChange }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkReason, setBulkReason] = useState('');
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // Email and groups state
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [groups, setGroups] = useState([]);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const [groupActionLoading, setGroupActionLoading] = useState(false);

  // Load groups on mount
  useEffect(() => {
    const loadGroups = async () => {
      try {
        const groupsData = await getUserGroups();
        setGroups(groupsData);
      } catch (err) {
        console.error('Error loading groups:', err);
      }
    };
    loadGroups();
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPublicUsers({
        page,
        limit: 25,
        search: search.trim() || undefined
      });
      setUsers(data.users || []);
      setPagination(data.pagination || { total: 0, totalPages: 1 });
    } catch (err) {
      console.error('Error loading users:', err);
      if (onStatusChange) {
        onStatusChange('error', 'Failed to load users');
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, onStatusChange]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  // Clear selection when page or search changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, search]);

  const handleUserClick = (userId) => {
    setSelectedUserId(userId);
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setSelectedUserId(null);
  };

  const handleUserUpdated = () => {
    loadUsers();
    if (onStatusChange) {
      onStatusChange('success', 'User updated successfully');
    }
  };

  // Selection handlers
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(new Set(users.map(u => u.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectUser = (userId, e) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setBulkReason('');
  };

  const isAllSelected = users.length > 0 && selectedIds.size === users.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < users.length;

  // Bulk action handler
  const handleBulkAction = async (action) => {
    if (selectedIds.size === 0) return;
    if (!bulkReason.trim()) {
      onStatusChange?.('error', 'Reason is required for bulk actions');
      return;
    }

    setBulkActionLoading(true);
    try {
      const result = await bulkUserAction({
        userIds: Array.from(selectedIds),
        action,
        reason: bulkReason.trim()
      });

      const successCount = result.success || 0;
      const failCount = result.failed || 0;

      if (failCount === 0) {
        onStatusChange?.('success', `${action} applied to ${successCount} user(s)`);
      } else {
        onStatusChange?.('warning', `${action}: ${successCount} succeeded, ${failCount} failed`);
      }

      clearSelection();
      loadUsers();
    } catch (err) {
      console.error('Bulk action error:', err);
      onStatusChange?.('error', err.message || 'Bulk action failed');
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Add to group handler
  const handleAddToGroup = async (groupId) => {
    if (selectedIds.size === 0) return;

    setGroupActionLoading(true);
    setShowGroupDropdown(false);
    try {
      await addUsersToGroup(groupId, Array.from(selectedIds));
      const group = groups.find(g => g.id === groupId);
      onStatusChange?.('success', `Added ${selectedIds.size} user(s) to ${group?.name || 'group'}`);
      clearSelection();
    } catch (err) {
      console.error('Error adding to group:', err);
      onStatusChange?.('error', err.message || 'Failed to add users to group');
    } finally {
      setGroupActionLoading(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showGroupDropdown) return;

    const handleClickOutside = (e) => {
      if (!e.target.closest('[data-group-dropdown]')) {
        setShowGroupDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showGroupDropdown]);

  return (
    <PanelContainer>
      <ToolbarRow>
        <SearchWrapper>
          <SearchFilter
            value={search}
            onChange={setSearch}
            placeholder="Search by email or username..."
          />
        </SearchWrapper>
        <StatsRow>
          <StatItem>Total: {pagination.total}</StatItem>
        </StatsRow>
      </ToolbarRow>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <BulkActionBar>
          <SelectionCount>{selectedIds.size} selected</SelectionCount>
          <BulkReasonInput
            value={bulkReason}
            onChange={(e) => setBulkReason(e.target.value)}
            placeholder="Reason for bulk action..."
            disabled={bulkActionLoading}
          />
          <BulkActionButtons>
            <BulkButton
              $variant="success"
              onClick={() => handleBulkAction('restore')}
              disabled={bulkActionLoading || !bulkReason.trim()}
            >
              Restore
            </BulkButton>
            <BulkButton
              $variant="warning"
              onClick={() => handleBulkAction('suspend')}
              disabled={bulkActionLoading || !bulkReason.trim()}
            >
              Suspend
            </BulkButton>
            <BulkButton
              $variant="success"
              onClick={() => handleBulkAction('unlock_exports')}
              disabled={bulkActionLoading || !bulkReason.trim()}
            >
              Unlock Exports
            </BulkButton>
            <BulkButton
              onClick={() => setEmailModalOpen(true)}
              disabled={bulkActionLoading}
            >
              Email
            </BulkButton>
            <GroupDropdownContainer data-group-dropdown>
              <GroupDropdownButton
                onClick={() => setShowGroupDropdown(!showGroupDropdown)}
                disabled={groupActionLoading || groups.length === 0}
              >
                Add to Group
              </GroupDropdownButton>
              {showGroupDropdown && (
                <GroupDropdownMenu>
                  {groups.length === 0 ? (
                    <GroupDropdownEmpty>No groups available</GroupDropdownEmpty>
                  ) : (
                    groups.map((group) => (
                      <GroupDropdownItem
                        key={group.id}
                        onClick={() => handleAddToGroup(group.id)}
                        disabled={groupActionLoading}
                      >
                        {group.name} ({group.member_count || 0})
                      </GroupDropdownItem>
                    ))
                  )}
                </GroupDropdownMenu>
              )}
            </GroupDropdownContainer>
            <ClearSelectionButton onClick={clearSelection} disabled={bulkActionLoading}>
              Clear
            </ClearSelectionButton>
          </BulkActionButtons>
        </BulkActionBar>
      )}

      {loading ? (
        <LoadingOverlay>Loading users...</LoadingOverlay>
      ) : users.length === 0 ? (
        <EmptyState
          message={search ? 'No users match your search' : 'No public users found'}
        />
      ) : (
        <>
          <UsersTable>
            <TableHeader>
              <CellCheckbox>
                <Checkbox
                  checked={isAllSelected}
                  ref={el => { if (el) el.indeterminate = isSomeSelected; }}
                  onChange={handleSelectAll}
                />
              </CellCheckbox>
              <div>ID</div>
              <div>Email / Username</div>
              <div>Badges</div>
              <div>Status</div>
              <div>Exports</div>
              <div>Action</div>
            </TableHeader>
            {users.map((user) => (
              <TableRow
                key={user.id}
                $status={user.status}
                $selected={selectedIds.has(user.id)}
                onClick={() => handleUserClick(user.id)}
              >
                <CellCheckbox onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.has(user.id)}
                    onChange={(e) => handleSelectUser(user.id, e)}
                  />
                </CellCheckbox>
                <CellId>{user.id}</CellId>
                <CellEmail>
                  <EmailText>{user.email}</EmailText>
                  {user.username && (
                    <UsernameText>@{user.username}</UsernameText>
                  )}
                </CellEmail>
                <CellBadges>
                  {user.badges?.map((badge, idx) => (
                    <UserBadge key={idx} badge={badge} showIcon={false} />
                  ))}
                </CellBadges>
                <CellStatus>
                  <StatusBadge $status={user.status || 'active'}>
                    {user.status || 'active'}
                  </StatusBadge>
                </CellStatus>
                <CellExports $unlocked={user.exports_unlocked}>
                  {user.exports_unlocked ? 'Unlocked' : 'Locked'}
                </CellExports>
                <CellAction>
                  <AuditButton
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUserClick(user.id);
                    }}
                  >
                    Audit
                  </AuditButton>
                </CellAction>
              </TableRow>
            ))}
          </UsersTable>

          <Pagination>
            <PaginationInfo>
              Page {page} of {pagination.totalPages}
            </PaginationInfo>
            <PaginationButtons>
              <PageButton
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </PageButton>
              <PageButton
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
              >
                Next
              </PageButton>
            </PaginationButtons>
          </Pagination>
        </>
      )}

      <UserAuditModal
        isOpen={modalOpen}
        onClose={handleModalClose}
        userId={selectedUserId}
        onUserUpdated={handleUserUpdated}
      />

      <EmailComposeModal
        isOpen={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        selectedUserIds={Array.from(selectedIds)}
        onEmailSent={() => {
          onStatusChange?.('success', 'Email sent successfully');
          clearSelection();
        }}
      />
    </PanelContainer>
  );
};

export default UsersAccountsPanel;
