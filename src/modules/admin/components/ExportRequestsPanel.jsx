import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme, Button } from '@shared/styles/GlobalStyles';
import { useAuth } from '@shared/contexts/AuthContext';
import { safeJson } from '@shared/utils/jsonUtils';
import MarkExportFailedModal from './MarkExportFailedModal.jsx';
import { deleteExportRequest } from '../services/adminService';

export default function ExportRequestsPanel() {
  const { authenticatedFetch } = useAuth();
  const [pendingRequests, setPendingRequests] = useState([]);
  const [completedRequests, setCompletedRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [markingFailed, setMarkingFailed] = useState(null);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const res = await authenticatedFetch('/api/v1/admin/requests?limit=200', { method: 'GET' });
      const json = await safeJson(res, { context: 'Load export requests (admin)' });
      if (json?.success) {
        const all = Array.isArray(json.data) ? json.data : [];
        const pendingStatuses = new Set(['pending', 'auth_required', 'in_progress']);
        setPendingRequests(all.filter((req) => pendingStatuses.has(req.status)));
        setCompletedRequests(all.filter((req) => !pendingStatuses.has(req.status)));
      } else {
        setPendingRequests([]);
        setCompletedRequests([]);
      }
    } catch (error) {
      console.error('Failed to load export requests:', error);
      setPendingRequests([]);
      setCompletedRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const executeExport = async (requestId) => {
    setExecuting(requestId);
    try {
      const res = await authenticatedFetch(`/api/v1/export-requests/${requestId}/execute`, {
        method: 'POST'
      });
      const json = await safeJson(res, { context: 'Execute export' });
      if (!json.success) throw new Error(json.error || 'Export failed');

      await loadRequests();
      alert('Export completed successfully');
    } catch (error) {
      alert(`Export failed: ${error.message}`);
    } finally {
      setExecuting(null);
    }
  };

  const handleDelete = async (requestId) => {
    if (!window.confirm('Remove this completed export request?')) {
      return;
    }
    setDeletingId(requestId);
    try {
      await deleteExportRequest(requestId);
      await loadRequests();
    } catch (error) {
      alert(error?.message || 'Failed to delete export request');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Panel>
      <Header>
        <h3>Export Requests</h3>
        <Button onClick={loadRequests}>Refresh</Button>
      </Header>

      {loading ? (
        <LoadingState>Loading...</LoadingState>
      ) : (
        <>
          <SectionHeader>Pending</SectionHeader>
          {pendingRequests.length === 0 ? (
            <EmptyState>No pending export requests</EmptyState>
          ) : (
            <RequestsList>
              {pendingRequests.map(req => {
                const destinations = (() => {
                  try {
                    return JSON.parse(req.destinations || '[]');
                  } catch {
                    return [];
                  }
                })();

                return (
                  <RequestCard key={req.id}>
                    <RequestInfo>
                      <PlaylistTitle>{req.playlist_title || 'Untitled Playlist'}</PlaylistTitle>
                      <CuratorName>by {req.curator_name || 'Unknown'}</CuratorName>
                      <Platforms>
                        Platforms: {destinations.length > 0 ? destinations.join(', ') : 'None'}
                      </Platforms>
                      <Timestamp>
                        {req.created_at ? new Date(req.created_at).toLocaleDateString() : 'Unknown date'}
                      </Timestamp>
                    </RequestInfo>

                    <RequestActions>
                      <Button
                        variant="primary"
                        onClick={() => executeExport(req.id)}
                        disabled={executing === req.id}
                      >
                        {executing === req.id ? 'Exporting...' : 'Export Now'}
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => setMarkingFailed(req)}
                      >
                        Mark Failed
                      </Button>
                    </RequestActions>
                  </RequestCard>
                );
              })}
            </RequestsList>
          )}

          <SectionHeader>Completed / Failed</SectionHeader>
          {completedRequests.length === 0 ? (
            <EmptyState>No completed requests yet</EmptyState>
          ) : (
            <RequestsList>
              {completedRequests.map(req => {
                const destinations = (() => {
                  try {
                    return JSON.parse(req.destinations || '[]');
                  } catch {
                    return [];
                  }
                })();

                return (
                  <RequestCard key={req.id}>
                    <RequestInfo>
                      <PlaylistTitle>{req.playlist_title || 'Untitled Playlist'}</PlaylistTitle>
                      <CuratorName>by {req.curator_name || 'Unknown'}</CuratorName>
                      <Platforms>
                        Platforms: {destinations.length > 0 ? destinations.join(', ') : 'None'}
                      </Platforms>
                      <Timestamp>
                        {req.updated_at ? new Date(req.updated_at).toLocaleDateString() : 'Unknown date'} • {req.status}
                      </Timestamp>
                    </RequestInfo>
                    <RequestActions>
                      <Button
                        variant="danger"
                        onClick={() => handleDelete(req.id)}
                        disabled={deletingId === req.id}
                      >
                        {deletingId === req.id ? 'Removing…' : 'Remove'}
                      </Button>
                    </RequestActions>
                  </RequestCard>
                );
              })}
            </RequestsList>
          )}
        </>
      )}

      <MarkExportFailedModal
        isOpen={!!markingFailed}
        onClose={() => setMarkingFailed(null)}
        request={markingFailed}
        onSuccess={loadRequests}
      />
    </Panel>
  );
}

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;

  h3 {
    font-family: ${theme.fonts.mono};
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
  }
`;

const LoadingState = styled.div`
  padding: ${theme.spacing.lg};
  text-align: center;
  font-family: ${theme.fonts.mono};
  color: ${theme.colors.black[500]};
  border: ${theme.borders.dashed} ${theme.colors.black[300]};
`;

const EmptyState = styled.div`
  padding: ${theme.spacing.lg};
  text-align: center;
  font-family: ${theme.fonts.mono};
  color: ${theme.colors.black[500]};
  border: ${theme.borders.dashed} ${theme.colors.black[300]};
`;

const RequestsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const SectionHeader = styled.h4`
  margin: ${theme.spacing.md} 0 ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(0, 0, 0, 0.7);
`;

const RequestCard = styled.div`
  border: ${theme.borders.solid} ${theme.colors.black};
  padding: ${theme.spacing.md};
  background: ${theme.colors.fpwhite};
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;

  &:hover {
    background: ${theme.colors.black[50]};
  }
`;

const RequestInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  flex: 1;
  min-width: 200px;
`;

const PlaylistTitle = styled.div`
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  font-weight: ${theme.fontWeights.bold};
  color: ${theme.colors.black};
`;

const CuratorName = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: 12px;
  color: ${theme.colors.black[600]};
`;

const Platforms = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: 12px;
  color: ${theme.colors.black};
  text-transform: uppercase;
`;

const Timestamp = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: 11px;
  color: ${theme.colors.black[500]};
`;

const RequestActions = styled.div`
  display: flex;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
`;
