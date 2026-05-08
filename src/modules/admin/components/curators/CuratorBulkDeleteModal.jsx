import React, { useEffect, useMemo, useState } from 'react';
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
import { theme, Button } from '@shared/styles/GlobalStyles';
import {
  deleteCurator,
  getCuratorDetails
} from '../../services/adminService';

const ModalContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const WarningBanner = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: 8px;
  border: ${theme.borders.solidMedium} ${theme.colors.danger};
  background: rgba(220, 38, 38, 0.08);
  color: ${theme.colors.danger};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};

  strong {
    font-weight: ${theme.fontWeights.bold};
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
`;

const SummaryRow = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  flex-wrap: wrap;
`;

const MetricCard = styled.div`
  display: inline-flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border-radius: 999px;
  border: ${theme.borders.dashed} rgba(0, 0, 0, 0.2);
  background: rgba(0, 0, 0, 0.03);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: ${theme.colors.black};
`;

const ScrollGroups = styled.div`
  max-height: calc(65vh - 200px);
  overflow-y: auto;
  padding-right: ${theme.spacing.sm};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const CuratorItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border-radius: 6px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  background: ${theme.colors.fpwhite};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.small};
`;

const CuratorName = styled.div`
  font-weight: ${theme.fontWeights.medium};
  color: ${theme.colors.black};
`;

const CuratorMeta = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.6);
`;

const StatusBanner = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  border: ${theme.borders.dashed} ${({ $variant }) =>
    $variant === 'error' ? theme.colors.danger : theme.colors.success};
  background: ${({ $variant }) =>
    $variant === 'error' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(34, 197, 94, 0.12)'};
  color: ${({ $variant }) =>
    $variant === 'error' ? theme.colors.danger : theme.colors.success};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border-radius: 2px;
`;

const ProgressBanner = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  border: ${theme.borders.dashed} rgba(0, 0, 0, 0.2);
  background: rgba(0, 0, 0, 0.03);
  color: ${theme.colors.black};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border-radius: 2px;
`;

const CuratorBulkDeleteModal = ({
  isOpen,
  curatorIds,
  onClose,
  onDeleted
}) => {
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [curatorData, setCuratorData] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({ current: 0, total: 0 });
  const [status, setStatus] = useState({ type: '', message: '' });

  const totalCurators = curatorData.length;
  const totalPlaylists = useMemo(
    () => curatorData.reduce((sum, detail) => sum + (detail.playlists?.length || 0), 0),
    [curatorData]
  );

  useEffect(() => {
    if (!isOpen) {
      setCuratorData([]);
      setStatus({ type: '', message: '' });
      setLoading(false);
      setLoadingMessage('');
      setDeleteProgress({ current: 0, total: 0 });
      return;
    }

    const load = async () => {
      setLoading(true);
      setLoadingMessage('Loading curator details…');
      try {
        const detailPromises = curatorIds.map(async (id, index) => {
          setLoadingMessage(`Loading curator ${index + 1} of ${curatorIds.length}…`);
          const detail = await getCuratorDetails(id);
          return detail;
        });
        const details = await Promise.all(detailPromises);
        setCuratorData(details);
      } catch (error) {
        console.error('Failed to load curator details:', error);
        setStatus({
          type: 'error',
          message: error?.message || 'Failed to load curator data'
        });
      } finally {
        setLoading(false);
        setLoadingMessage('');
      }
    };

    if (curatorIds.length > 0) {
      load();
    }
  }, [isOpen, curatorIds]);

  const handleDelete = async () => {
    if (curatorData.length === 0) {
      setStatus({ type: 'error', message: 'No curators to delete' });
      return;
    }

    setDeleting(true);
    setStatus({ type: '', message: '' });
    setDeleteProgress({ current: 0, total: curatorData.length });

    const errors = [];
    let successCount = 0;

    try {
      for (let i = 0; i < curatorData.length; i++) {
        const curator = curatorData[i];
        setDeleteProgress({ current: i + 1, total: curatorData.length });

        try {
          await deleteCurator(curator.curator.id);
          successCount++;
        } catch (error) {
          console.error(`Failed to delete curator ${curator.curator.name}:`, error);
          errors.push({
            name: curator.curator.name,
            error: error?.message || 'Unknown error'
          });
        }
      }

      if (errors.length === 0) {
        setStatus({
          type: 'success',
          message: `Successfully deleted ${successCount} curator${successCount === 1 ? '' : 's'}.`
        });
        // Wait a moment to show success message, then close
        setTimeout(() => {
          onDeleted?.();
          onClose();
        }, 1500);
      } else {
        setStatus({
          type: 'error',
          message: `Deleted ${successCount} curator${successCount === 1 ? '' : 's'}. Failed to delete ${errors.length}: ${errors.map(e => e.name).join(', ')}`
        });
      }
    } catch (error) {
      console.error('Bulk delete failed:', error);
      setStatus({
        type: 'error',
        message: error?.message || 'Failed to delete curators'
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ModalRoot isOpen={isOpen} onDismiss={onClose}>
      <ModalSurface size="large">
        <ModalHeader>
          <ModalTitle>Delete Curators</ModalTitle>
          <ModalCloseButton onClick={onClose} />
        </ModalHeader>
        <ModalBody>
          <ModalContent>
            <WarningBanner>
              <strong>⚠ Warning: This action cannot be undone</strong>
              <div>
                Deleting these curators will permanently remove:
              </div>
              <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                <li>All curator profile data</li>
                <li>All associated playlists ({totalPlaylists} total)</li>
                <li>All linked admin user accounts</li>
                <li>All referral data</li>
              </ul>
            </WarningBanner>

            <SummaryRow>
              <MetricCard>Curators to delete: {totalCurators}</MetricCard>
              <MetricCard>Playlists to delete: {totalPlaylists}</MetricCard>
            </SummaryRow>

            {status.message && (
              <StatusBanner $variant={status.type}>{status.message}</StatusBanner>
            )}

            {deleting && (
              <ProgressBanner>
                Deleting {deleteProgress.current} of {deleteProgress.total}…
              </ProgressBanner>
            )}

            {loading ? (
              <StatusBanner $variant="default">
                {loadingMessage || 'Loading curator data…'}
              </StatusBanner>
            ) : totalCurators === 0 ? (
              <StatusBanner $variant="default">
                Select at least one curator to enable delete.
              </StatusBanner>
            ) : (
              <ScrollGroups>
                {curatorData.map(detail => (
                  <CuratorItem key={detail.curator?.id}>
                    <CuratorName>{detail.curator?.name || 'Unknown Curator'}</CuratorName>
                    <CuratorMeta>
                      {detail.curator?.profile_type || detail.curator?.type || '—'} •
                      {' '}{detail.playlists?.length || 0} playlist{(detail.playlists?.length || 0) === 1 ? '' : 's'} •
                      {' '}{detail.curator?.contact_email || 'No email'}
                    </CuratorMeta>
                  </CuratorItem>
                ))}
              </ScrollGroups>
            )}
          </ModalContent>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            disabled={deleting || totalCurators === 0}
          >
            {deleting
              ? `Deleting ${deleteProgress.current}/${deleteProgress.total}…`
              : `Delete ${totalCurators} Curator${totalCurators === 1 ? '' : 's'}`}
          </Button>
        </ModalFooter>
      </ModalSurface>
    </ModalRoot>
  );
};

export default CuratorBulkDeleteModal;
