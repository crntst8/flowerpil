import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { MainBox, Button, theme } from '@shared/styles/GlobalStyles';
import { adminGet, adminPost, adminPut } from '../utils/adminApi';

const FeedbackContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
`;

const ReportCard = styled(MainBox)`
  background: ${theme.colors.fpwhite};
  padding: ${theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  border-left: 4px solid ${({ $status }) => 
    $status === 'resolved' ? theme.colors.success : theme.colors.warning};
  opacity: ${({ $status }) => ($status === 'resolved' ? 0.7 : 1)};
`;

const ReportHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: ${theme.spacing.sm};
`;

const UserInfo = styled.div`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.gray600};
  
  span {
    color: ${theme.colors.black};
    font-weight: 600;
  }
`;

const MetaInfo = styled.div`
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.gray500};
`;

const Content = styled.p`
  margin: ${theme.spacing.sm} 0;
  white-space: pre-wrap;
  font-size: ${theme.fontSizes.base};
`;

const Actions = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  justify-content: flex-end;
  margin-top: ${theme.spacing.sm};
`;

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: #fff;
  padding: 24px;
  border-radius: 8px;
  width: 500px;
  max-width: 90%;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Input = styled.input`
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: inherit;
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 150px;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: inherit;
  resize: vertical;
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

const UserFeedbackPanel = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [replyModal, setReplyModal] = useState(null); // { id, email, subject }
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminGet('/api/v1/user-feedback/admin?limit=50');
      if (res.success) {
        setReports(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch feedback:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleResolve = async (id) => {
    if (!window.confirm('Mark this report as resolved?')) return;
    try {
        await adminPut(`/api/v1/user-feedback/admin/${id}/resolve`);
        setReports(prev => prev.map(r => r.id === id ? { ...r, status: 'resolved' } : r));
    } catch (err) {
        alert('Failed to resolve');
    }
  };

  const openReplyModal = (report) => {
    const userEmail = report.curator_email || report.admin_username || ''; 
    setReplyModal({
        id: report.id,
        email: userEmail,
        subject: `Re: Feedback on ${new URL(report.page_url).pathname}`
    });
    setReplyBody(`Hi ${report.curator_name || 'there'},

Thanks for your feedback.

`);
  };

  const sendReply = async () => {
    if (!replyBody.trim()) return;
    setSending(true);
    try {
        await adminPost(`/api/v1/user-feedback/admin/${replyModal.id}/reply`, {
            recipientEmail: replyModal.email,
            subject: replyModal.subject,
            body: replyBody
        });
        alert('Email sent!');
        setReplyModal(null);
    } catch (err) {
        alert('Failed to send email: ' + err.message);
    } finally {
        setSending(false);
    }
  };

  return (
    <FeedbackContainer>
        <div style={{display:'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <h3>User Feedback</h3>
            <Button size="small" variant="secondary" onClick={fetchReports}>Refresh</Button>
        </div>

        {loading && <p>Loading...</p>}

        {!loading && reports.length === 0 && <p>No feedback reports yet.</p>}

        {reports.map(report => {
            const displayEmail = report.curator_email || report.admin_username;
            return (
                <ReportCard key={report.id} $status={report.status}>
                    <ReportHeader>
                        <UserInfo>
                            <span>{report.curator_name || report.admin_username}</span> 
                            {displayEmail && ` <${displayEmail}>`}
                        </UserInfo>
                        <MetaInfo>
                            {formatDate(report.created_at)} • {report.status}
                        </MetaInfo>
                    </ReportHeader>
                    <div style={{fontSize: '0.85em', color: '#666', marginTop: '4px'}}>
                        Page: <a href={report.page_url} target="_blank" rel="noreferrer">{report.page_url}</a>
                    </div>
                    <Content>{report.content}</Content>
                    <Actions>
                        {displayEmail && (
                            <Button size="small" variant="primary" onClick={() => openReplyModal(report)}>
                                Reply via Email
                            </Button>
                        )}
                        {report.status !== 'resolved' && (
                            <Button size="small" variant="secondary" onClick={() => handleResolve(report.id)}>
                                Resolve
                            </Button>
                        )}
                    </Actions>
                </ReportCard>
            );
        })}

        {replyModal && (
            <ModalOverlay onClick={() => setReplyModal(null)}>
                <ModalContent onClick={e => e.stopPropagation()}>
                    <h3>Reply to {replyModal.email}</h3>
                    <Input 
                        value={replyModal.subject} 
                        onChange={e => setReplyModal({...replyModal, subject: e.target.value})}
                        placeholder="Subject"
                    />
                    <TextArea 
                        value={replyBody}
                        onChange={e => setReplyBody(e.target.value)}
                        placeholder="Message body..."
                    />
                    <div style={{display: 'flex', justifyContent: 'flex-end', gap: '8px'}}>
                        <Button variant="secondary" onClick={() => setReplyModal(null)}>Cancel</Button>
                        <Button variant="primary" disabled={sending} onClick={sendReply}>
                            {sending ? 'Sending...' : 'Send Email'}
                        </Button>
                    </div>
                </ModalContent>
            </ModalOverlay>
        )}
    </FeedbackContainer>
  );
};

export default UserFeedbackPanel;
