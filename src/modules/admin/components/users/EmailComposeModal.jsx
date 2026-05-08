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
  sendEmailToUsers,
  getEmailTemplates,
  getUserGroups
} from '../../services/adminService';

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

const FormSelect = styled.select`
  padding: ${theme.spacing.sm};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  border: 1px solid rgba(0, 0, 0, 0.2);
  background: ${theme.colors.white};
  cursor: pointer;

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

const EmailComposeModal = ({
  isOpen,
  onClose,
  selectedUserIds = [],
  onEmailSent
}) => {
  const [recipientType, setRecipientType] = useState('selected');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [templates, setTemplates] = useState([]);
  const [groups, setGroups] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
      // Reset form
      setRecipientType(selectedUserIds.length > 0 ? 'selected' : 'all');
      setSelectedGroupId('');
      setSubject('');
      setBody('');
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, selectedUserIds.length]);

  const loadData = async () => {
    try {
      const [templatesData, groupsData] = await Promise.all([
        getEmailTemplates(),
        getUserGroups()
      ]);
      setTemplates(templatesData);
      setGroups(groupsData);
    } catch (err) {
      console.error('Error loading data:', err);
    }
  };

  const handleTemplateSelect = (e) => {
    const templateId = e.target.value;
    if (!templateId) return;

    const template = templates.find(t => t.id === parseInt(templateId, 10));
    if (template) {
      setSubject(template.subject);
      setBody(template.body);
    }
  };

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      setError('Subject and body are required');
      return;
    }

    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const params = {
        subject: subject.trim(),
        body: body.trim()
      };

      if (recipientType === 'selected') {
        params.userIds = selectedUserIds;
      } else if (recipientType === 'group') {
        params.groupId = parseInt(selectedGroupId, 10);
      } else if (recipientType === 'all') {
        params.sendToAll = true;
      }

      const result = await sendEmailToUsers(params);

      const sent = result.sent || 0;
      const failed = result.failed || 0;

      if (failed === 0) {
        setSuccess(`Email sent to ${sent} recipient(s)`);
      } else {
        setSuccess(`Email sent to ${sent} recipient(s), ${failed} failed`);
      }

      onEmailSent?.();

      // Close after delay
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  const getRecipientCount = () => {
    if (recipientType === 'selected') {
      return selectedUserIds.length;
    }
    if (recipientType === 'group' && selectedGroupId) {
      const group = groups.find(g => g.id === parseInt(selectedGroupId, 10));
      return group?.member_count || 0;
    }
    if (recipientType === 'all') {
      return 'all users';
    }
    return 0;
  };

  const canSend = () => {
    if (!subject.trim() || !body.trim()) return false;
    if (recipientType === 'selected' && selectedUserIds.length === 0) return false;
    if (recipientType === 'group' && !selectedGroupId) return false;
    return true;
  };

  return (
    <ModalRoot isOpen={isOpen} onClose={onClose}>
      <ModalSurface $size="lg">
        <ModalCloseButton />
        <ModalHeader>
          <ModalTitle>Compose Email</ModalTitle>
        </ModalHeader>

        <ModalBody>
          <FormContainer>
            {error && <ErrorMessage>{error}</ErrorMessage>}
            {success && <SuccessMessage>{success}</SuccessMessage>}

            <FormRow>
              <FormLabel>Recipients</FormLabel>
              <FormSelect
                value={recipientType}
                onChange={(e) => setRecipientType(e.target.value)}
                disabled={sending}
              >
                {selectedUserIds.length > 0 && (
                  <option value="selected">Selected Users ({selectedUserIds.length})</option>
                )}
                <option value="all">All Public Users</option>
                <option value="group">User Group</option>
              </FormSelect>
            </FormRow>

            {recipientType === 'group' && (
              <FormRow>
                <FormLabel>Select Group</FormLabel>
                <FormSelect
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  disabled={sending}
                >
                  <option value="">Choose a group...</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name} ({group.member_count} members)
                    </option>
                  ))}
                </FormSelect>
              </FormRow>
            )}

            <RecipientInfo>
              Sending to: {getRecipientCount()} {recipientType === 'all' ? '' : 'recipient(s)'}
            </RecipientInfo>

            {templates.length > 0 && (
              <FormRow>
                <FormLabel>Use Template (optional)</FormLabel>
                <FormSelect onChange={handleTemplateSelect} disabled={sending}>
                  <option value="">Select a template...</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </FormSelect>
              </FormRow>
            )}

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
              disabled={sending || !canSend()}
            >
              {sending ? 'Sending...' : 'Send Email'}
            </ActionButton>
          </ButtonRow>
        </ModalFooter>
      </ModalSurface>
    </ModalRoot>
  );
};

export default EmailComposeModal;
