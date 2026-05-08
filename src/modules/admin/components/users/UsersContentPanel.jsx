import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { EmptyState } from '../shared';
import {
  getExportAccessRequests,
  approveExportRequest,
  denyExportRequest
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

const RefreshButton = styled.button`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: 11px;
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

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const RequestsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const RequestCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.md};
  background: ${theme.colors.white};
  border: 1px solid rgba(0, 0, 0, 0.15);
  box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.08);
`;

const RequestHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${theme.spacing.md};
`;

const RequestInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const RequestEmail = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  font-weight: ${theme.fontWeights.medium};
  color: ${theme.colors.black};
`;

const RequestMeta = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  color: rgba(0, 0, 0, 0.5);
`;

const RequestId = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  color: rgba(0, 0, 0, 0.4);
`;

const ActionButtons = styled.div`
  display: flex;
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
      case 'approve':
        return `
          background: rgba(34, 197, 94, 0.1);
          border-color: #22c55e;
          color: #16a34a;
          &:hover { background: rgba(34, 197, 94, 0.2); }
        `;
      case 'deny':
        return `
          background: rgba(220, 53, 69, 0.1);
          border-color: ${theme.colors.error};
          color: ${theme.colors.error};
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

const ReasonInput = styled.input`
  flex: 1;
  padding: ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  border: 1px solid rgba(0, 0, 0, 0.2);
  background: ${theme.colors.white};
  min-width: 200px;

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

const RequestActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  padding-top: ${theme.spacing.sm};
  border-top: 1px dashed rgba(0, 0, 0, 0.1);
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

const ErrorState = styled.div`
  padding: ${theme.spacing.md};
  background: rgba(220, 53, 69, 0.1);
  border: 1px solid ${theme.colors.error};
  color: ${theme.colors.error};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
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

const UsersContentPanel = ({ onStatusChange }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [reasons, setReasons] = useState({});

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getExportAccessRequests();
      setRequests(data.requests || []);
    } catch (err) {
      console.error('Error loading export requests:', err);
      setError(err.message || 'Failed to load export requests');
      if (onStatusChange) {
        onStatusChange('error', 'Failed to load export requests');
      }
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleReasonChange = (requestId, value) => {
    setReasons((prev) => ({
      ...prev,
      [requestId]: value
    }));
  };

  const handleApprove = async (requestId) => {
    setActionLoading((prev) => ({ ...prev, [requestId]: true }));
    try {
      await approveExportRequest(requestId, reasons[requestId] || 'Approved');
      await loadRequests();
      setReasons((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      if (onStatusChange) {
        onStatusChange('success', 'Export access approved');
      }
    } catch (err) {
      console.error('Error approving request:', err);
      if (onStatusChange) {
        onStatusChange('error', err.message || 'Failed to approve request');
      }
    } finally {
      setActionLoading((prev) => ({ ...prev, [requestId]: false }));
    }
  };

  const handleDeny = async (requestId) => {
    const reason = reasons[requestId]?.trim();
    if (!reason) {
      if (onStatusChange) {
        onStatusChange('error', 'Reason is required to deny a request');
      }
      return;
    }

    setActionLoading((prev) => ({ ...prev, [requestId]: true }));
    try {
      await denyExportRequest(requestId, reason);
      await loadRequests();
      setReasons((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      if (onStatusChange) {
        onStatusChange('success', 'Export access denied');
      }
    } catch (err) {
      console.error('Error denying request:', err);
      if (onStatusChange) {
        onStatusChange('error', err.message || 'Failed to deny request');
      }
    } finally {
      setActionLoading((prev) => ({ ...prev, [requestId]: false }));
    }
  };

  return (
    <PanelContainer>
      <Header>
        <Title>Pending Export Access Requests</Title>
        <RefreshButton onClick={loadRequests} disabled={loading}>
          Refresh
        </RefreshButton>
      </Header>

      {loading && <LoadingState>Loading requests...</LoadingState>}

      {error && <ErrorState>{error}</ErrorState>}

      {!loading && !error && requests.length === 0 && (
        <EmptyState message="No pending export access requests" />
      )}

      {!loading && !error && requests.length > 0 && (
        <RequestsList>
          {requests.map((request) => (
            <RequestCard key={request.id}>
              <RequestHeader>
                <RequestInfo>
                  <RequestEmail>{request.email || request.username || `User #${request.user_id}`}</RequestEmail>
                  <RequestMeta>
                    Requested: {formatDate(request.created_at)}
                  </RequestMeta>
                </RequestInfo>
                <RequestId>#{request.id}</RequestId>
              </RequestHeader>

              <RequestActions>
                <ReasonInput
                  value={reasons[request.id] || ''}
                  onChange={(e) => handleReasonChange(request.id, e.target.value)}
                  placeholder="Reason (required for deny)"
                  disabled={actionLoading[request.id]}
                />
                <ActionButtons>
                  <ActionButton
                    $variant="approve"
                    onClick={() => handleApprove(request.id)}
                    disabled={actionLoading[request.id]}
                  >
                    Approve
                  </ActionButton>
                  <ActionButton
                    $variant="deny"
                    onClick={() => handleDeny(request.id)}
                    disabled={actionLoading[request.id] || !reasons[request.id]?.trim()}
                  >
                    Deny
                  </ActionButton>
                </ActionButtons>
              </RequestActions>
            </RequestCard>
          ))}
        </RequestsList>
      )}
    </PanelContainer>
  );
};

export default UsersContentPanel;
