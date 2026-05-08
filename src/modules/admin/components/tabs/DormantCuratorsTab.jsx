import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { format } from 'date-fns';
import { theme, Button } from '@shared/styles/GlobalStyles';
import {
  ModalRoot,
  ModalSurface,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  ModalCloseButton
} from '@shared/components/Modal/Modal';
import { getDormantCurators, sendEmailToDormantCurators } from '../../services/adminService';

const TabWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xl};
`;

const SurfaceCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  padding: clamp(${theme.spacing.md}, 3vw, ${theme.spacing.xl});
  border-radius: 14px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  background: ${theme.colors.fpwhite};
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.06);
`;

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
`;

const HeadingGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.xs};
`;

const SectionTitle = styled.h2`
  margin: 0;
  font-size: clamp(1.25rem, 2vw, 1.6rem);
  font-family: ${theme.fonts.primary};
  text-transform: uppercase;
  letter-spacing: -0.9px;
`;

const MetaText = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.58);
  letter-spacing: 0.05em;
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  flex-wrap: wrap;
`;

const GhostButton = styled(Button)`
  background: transparent;
  border-color: rgba(0, 0, 0, 0.28);
  color: ${theme.colors.black};
  text-transform: none;
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.04em;
  padding: ${theme.spacing.xs} ${theme.spacing.sm};

  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.05);
    border-color: ${theme.colors.black};
  }
`;

const TableShell = styled.div`
  border-radius: 12px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  background: ${theme.colors.fpwhite};
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.02);
`;

const TableScroll = styled.div`
  max-height: 520px;
  overflow-y: auto;
  position: relative;
`;

const TableHeaderRow = styled.div`
  display: grid;
  grid-template-columns: 40px 1.5fr 1.8fr 0.8fr 1.2fr 1.2fr 2fr 1fr;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: rgba(255, 255, 255, 0.92);
  border-bottom: ${theme.borders.solidThin} rgba(0, 0, 0, 0.12);
  position: sticky;
  top: 0;
  z-index: 2;
  backdrop-filter: blur(4px);

  @media (max-width: ${theme.breakpoints.tablet}) {
    display: none;
  }
`;

const DataRow = styled.div`
  display: grid;
  grid-template-columns: 40px 1.5fr 1.8fr 0.8fr 1.2fr 1.2fr 2fr 1fr;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-bottom: ${theme.borders.solidThin} rgba(0, 0, 0, 0.05);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  align-items: center;
  background: ${({ $selected }) => ($selected ? 'rgba(99, 102, 241, 0.08)' : 'transparent')};
  transition: background 0.15s ease-in-out;

  &:hover {
    background: ${({ $selected }) => ($selected ? 'rgba(99, 102, 241, 0.12)' : 'rgba(0, 0, 0, 0.04)')};
  }

  @media (max-width: ${theme.breakpoints.tablet}) {
    grid-template-columns: 1fr;
  }
`;

const TableCell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
`;

const CellText = styled.span`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const DraftTitles = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: ${theme.fontSizes.tiny};
  color: rgba(0, 0, 0, 0.6);
  max-height: 60px;
  overflow-y: auto;
`;

const DraftTitle = styled.span`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Checkbox = styled.input`
  width: 16px;
  height: 16px;
  cursor: pointer;
`;

const EmptyState = styled.div`
  padding: ${theme.spacing.xl};
  text-align: center;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.6);
`;

const ActionBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background: rgba(0, 0, 0, 0.02);
  border-radius: 10px;
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.08);
`;

const SelectionInfo = styled.span`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: rgba(0, 0, 0, 0.6);
`;

// Email Modal Styled Components
const FormContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
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
  min-height: 150px;
  resize: vertical;

  &:focus {
    outline: none;
    border-color: ${theme.colors.black};
  }
`;

const RecipientInfo = styled.div`
  padding: ${theme.spacing.sm};
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.3);
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: #4f46e5;
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

const ButtonRow = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
`;

const ErrorMessage = styled.div`
  padding: ${theme.spacing.sm};
  background: rgba(220, 53, 69, 0.1);
  border: 1px solid ${theme.colors.error};
  color: ${theme.colors.error};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const SuccessMessage = styled.div`
  padding: ${theme.spacing.sm};
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid #22c55e;
  color: #16a34a;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
`;

const formatDate = (value) => {
  if (!value) return '-';
  try {
    return format(new Date(value), 'dd MMM yyyy');
  } catch {
    return '-';
  }
};

const DormantCuratorsTab = () => {
  const [curators, setCurators] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTarget, setEmailTarget] = useState(null); // null = selected, or curator object for individual

  const loadCurators = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getDormantCurators();
      setCurators(data);
      setSelectedIds(new Set());
    } catch (err) {
      console.error('Failed to load dormant curators:', err);
      setError(err?.message || 'Failed to load dormant curators');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCurators();
  }, [loadCurators]);

  const handleSelectAll = useCallback((e) => {
    if (e.target.checked) {
      setSelectedIds(new Set(curators.map((c) => c.id)));
    } else {
      setSelectedIds(new Set());
    }
  }, [curators]);

  const handleSelectOne = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleEmailSelected = useCallback(() => {
    setEmailTarget(null);
    setEmailModalOpen(true);
  }, []);

  const handleEmailIndividual = useCallback((curator) => {
    setEmailTarget(curator);
    setEmailModalOpen(true);
  }, []);

  const curatorsWithEmail = useMemo(() => {
    return curators.filter((c) => c.email);
  }, [curators]);

  const selectedCuratorsWithEmail = useMemo(() => {
    return curators.filter((c) => selectedIds.has(c.id) && c.email);
  }, [curators, selectedIds]);

  const allSelected = curators.length > 0 && selectedIds.size === curators.length;

  return (
    <TabWrapper>
      <SurfaceCard>
        <HeaderRow>
          <HeadingGroup>
            <SectionTitle>Dormant Curators</SectionTitle>
            <MetaText>
              Curators who have draft playlists but never published
            </MetaText>
          </HeadingGroup>
          <HeaderActions>
            <GhostButton onClick={loadCurators} disabled={loading}>
              {loading ? 'Loading...' : 'Refresh'}
            </GhostButton>
          </HeaderActions>
        </HeaderRow>

        {error && <MetaText style={{ color: theme.colors.error }}>{error}</MetaText>}

        <ActionBar>
          <SelectionInfo>
            {selectedIds.size > 0
              ? `${selectedIds.size} curator${selectedIds.size === 1 ? '' : 's'} selected (${selectedCuratorsWithEmail.length} with email)`
              : `${curators.length} dormant curator${curators.length === 1 ? '' : 's'} (${curatorsWithEmail.length} with email)`}
          </SelectionInfo>
          <HeaderActions>
            <Button
              onClick={handleEmailSelected}
              disabled={selectedCuratorsWithEmail.length === 0}
              variant="primary"
            >
              Email Selected ({selectedCuratorsWithEmail.length})
            </Button>
            <Button
              onClick={() => {
                setSelectedIds(new Set(curatorsWithEmail.map((c) => c.id)));
                setEmailTarget(null);
                setEmailModalOpen(true);
              }}
              disabled={curatorsWithEmail.length === 0}
            >
              Email All ({curatorsWithEmail.length})
            </Button>
          </HeaderActions>
        </ActionBar>

        <TableShell role="table" aria-label="Dormant curators">
          <TableScroll>
            <TableHeaderRow role="row">
              <span role="columnheader">
                <Checkbox
                  type="checkbox"
                  checked={allSelected}
                  onChange={handleSelectAll}
                  aria-label="Select all"
                />
              </span>
              <span role="columnheader">Name</span>
              <span role="columnheader">Email</span>
              <span role="columnheader">Drafts</span>
              <span role="columnheader">Created</span>
              <span role="columnheader">Last Activity</span>
              <span role="columnheader">Draft Titles</span>
              <span role="columnheader">Actions</span>
            </TableHeaderRow>

            {loading ? (
              <EmptyState role="row">Loading dormant curators...</EmptyState>
            ) : curators.length === 0 ? (
              <EmptyState role="row">No dormant curators found.</EmptyState>
            ) : (
              curators.map((curator) => (
                <DataRow
                  key={curator.id}
                  role="row"
                  $selected={selectedIds.has(curator.id)}
                >
                  <TableCell>
                    <Checkbox
                      type="checkbox"
                      checked={selectedIds.has(curator.id)}
                      onChange={() => handleSelectOne(curator.id)}
                      aria-label={`Select ${curator.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <CellText title={curator.name}>{curator.name}</CellText>
                  </TableCell>
                  <TableCell>
                    <CellText title={curator.email || 'No email'}>
                      {curator.email || <span style={{ color: 'rgba(0,0,0,0.4)' }}>No email</span>}
                    </CellText>
                  </TableCell>
                  <TableCell>
                    <CellText>{curator.draftCount}</CellText>
                  </TableCell>
                  <TableCell>
                    <CellText>{formatDate(curator.createdAt)}</CellText>
                  </TableCell>
                  <TableCell>
                    <CellText>{formatDate(curator.lastActivity)}</CellText>
                  </TableCell>
                  <TableCell>
                    <DraftTitles>
                      {curator.draftTitles.slice(0, 3).map((title, i) => (
                        <DraftTitle key={i} title={title}>
                          {title || 'Untitled'}
                        </DraftTitle>
                      ))}
                      {curator.draftTitles.length > 3 && (
                        <DraftTitle style={{ fontStyle: 'italic' }}>
                          +{curator.draftTitles.length - 3} more
                        </DraftTitle>
                      )}
                    </DraftTitles>
                  </TableCell>
                  <TableCell>
                    <GhostButton
                      onClick={() => handleEmailIndividual(curator)}
                      disabled={!curator.email}
                      title={curator.email ? 'Send email' : 'No email address'}
                    >
                      Email
                    </GhostButton>
                  </TableCell>
                </DataRow>
              ))
            )}
          </TableScroll>
        </TableShell>
      </SurfaceCard>

      <EmailModal
        isOpen={emailModalOpen}
        onClose={() => {
          setEmailModalOpen(false);
          setEmailTarget(null);
        }}
        target={emailTarget}
        selectedCurators={emailTarget ? [emailTarget] : selectedCuratorsWithEmail}
        onEmailSent={loadCurators}
      />
    </TabWrapper>
  );
};

// Email Modal Component
const EmailModal = ({ isOpen, onClose, target, selectedCurators, onEmailSent }) => {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setSubject('');
      setBody('');
      setError(null);
      setSuccess(null);
    }
  }, [isOpen]);

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      setError('Subject and body are required');
      return;
    }

    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const curatorIds = selectedCurators.map((c) => c.id);
      const result = await sendEmailToDormantCurators({
        curatorIds,
        subject: subject.trim(),
        body: body.trim()
      });

      const sent = result.sent || 0;
      const failed = result.failed || 0;

      if (failed === 0) {
        setSuccess(`Email sent to ${sent} curator${sent === 1 ? '' : 's'}`);
      } else {
        setSuccess(`Email sent to ${sent} curator${sent === 1 ? '' : 's'}, ${failed} failed`);
      }

      onEmailSent?.();

      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  const recipientLabel = target
    ? target.name
    : `${selectedCurators.length} curator${selectedCurators.length === 1 ? '' : 's'}`;

  return (
    <ModalRoot isOpen={isOpen} onClose={onClose}>
      <ModalSurface $size="lg">
        <ModalCloseButton />
        <ModalHeader>
          <ModalTitle>Email Dormant Curator{selectedCurators.length === 1 ? '' : 's'}</ModalTitle>
        </ModalHeader>

        <ModalBody>
          <FormContainer>
            {error && <ErrorMessage>{error}</ErrorMessage>}
            {success && <SuccessMessage>{success}</SuccessMessage>}

            <RecipientInfo>
              Sending to: {recipientLabel}
            </RecipientInfo>

            <FormRow>
              <FormLabel>Subject</FormLabel>
              <FormInput
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject..."
                disabled={sending}
              />
            </FormRow>

            <FormRow>
              <FormLabel>Body</FormLabel>
              <FormTextarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your email message..."
                disabled={sending}
              />
            </FormRow>
          </FormContainer>
        </ModalBody>

        <ModalFooter>
          <ButtonRow>
            <ActionButton onClick={onClose} disabled={sending}>
              Cancel
            </ActionButton>
            <ActionButton
              $variant="primary"
              onClick={handleSend}
              disabled={sending || !subject.trim() || !body.trim()}
            >
              {sending ? 'Sending...' : 'Send Email'}
            </ActionButton>
          </ButtonRow>
        </ModalFooter>
      </ModalSurface>
    </ModalRoot>
  );
};

export default DormantCuratorsTab;
