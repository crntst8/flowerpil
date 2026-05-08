import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { useAuth } from '@shared/contexts/AuthContext';
import { useSiteSettings } from '@shared/contexts/SiteSettingsContext';

const FloatingButton = styled.button`
  position: fixed;
  z-index: 2147483000;
  bottom: clamp(16px, 4vw, 28px);
  right: clamp(16px, 4vw, 28px);
  background: rgba(15, 15, 15, 0.92);
  color: #f2f2f2;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  padding: 10px 18px;
  font-size: 0.9rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
  box-shadow: 0px 12px 32px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(14px);
  transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: 0.88;

  &:hover {
    transform: translateY(-2px);
    opacity: 1;
    box-shadow: 0px 16px 40px rgba(0, 0, 0, 0.4);
  }

  &:active {
    transform: translateY(0px) scale(0.98);
  }

  @media (max-width: 768px) {
    padding: 10px 16px;
    font-size: 0.85rem;
  }
`;

const OverlayBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(10, 10, 10, 0.55);
  z-index: 2147483500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(16px, 4vw, 32px);
  backdrop-filter: blur(4px);
`;

const OverlayCard = styled.div`
  background: rgba(15, 15, 15, 0.91);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0px 18px 60px rgba(0, 0, 0, 0.45);
  width: min(540px, 100%);
  padding: clamp(20px, 3vw, 28px);
  color: #f8f8f8;
  position: relative;
`;

const OverlayHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;

  h2 {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0;
    letter-spacing: 0.04em;
  }
`;

const CloseButton = styled.button`
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  font-size: 1.2rem;
  cursor: pointer;
  padding: 4px 6px;
  transition: color 0.2s ease;

  &:hover {
    color: #fff;
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 140px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: #fefefe;
  padding: 14px;
  font-size: 0.95rem;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s ease, background 0.2s ease;

  &:focus {
    border-color: rgba(255, 255, 255, 0.35);
    background: rgba(255, 255, 255, 0.06);
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }
`;

const ActionsRow = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
`;

const SubmitButton = styled.button`
  background: #46c529ff;
  color: #0f0f0f;
  border: none;
  padding: 10px 22px;
  font-weight: 600;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0px 12px 30px rgba(255, 106, 193, 0.32);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }
`;

const SecondaryButton = styled.button`
  background: transparent; 
  color: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 10px 22px;
  font-weight: 600;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    color: #fff;
    border-color: rgba(255, 255, 255, 0.4);
  }
`;

const StatusText = styled.p`
  margin: 12px 0 0;
  font-size: 0.85rem;
  color: ${({ $variant }) =>
    $variant === 'error'
      ? '#ff98b8'
      : $variant === 'success'
        ? '#a8ffcb'
        : 'rgba(255,255,255,0.6)'};
`;

const EmailLink = styled.a`
    color: #a8ffcb;
    text-decoration: underline;
    margin-left: 5px;
    &:hover {
        color: #fff;
    }
`;

const useIsClient = () => {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);
  return isClient;
};

const UserFeedbackWidget = () => {
  const { user, isAuthenticated, authenticatedFetch } = useAuth();
  const isClient = useIsClient();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState(null);
  const [statusVariant, setStatusVariant] = useState('info');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const closeOverlay = useCallback(() => {
    setVisible(false);
    setMessage('');
    setSubmitted(false);
    setStatus(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed) return;

    setIsSubmitting(true);
    setStatus(null);

    try {
        const payload = {
            page_url: window.location.href,
            content: trimmed,
            metadata: {
                user_agent: navigator.userAgent,
                screen_width: window.innerWidth,
                screen_height: window.innerHeight,
                app_env: import.meta.env.MODE
            }
        };

        const response = await authenticatedFetch('/api/v1/user-feedback', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            setSubmitted(true);
            setStatus('Thanks! We received your report.');
            setStatusVariant('success');
            setMessage('');
            setTimeout(() => {
                closeOverlay();
            }, 3000);
        } else {
             setStatus('Something went wrong. Please try again.');
             setStatusVariant('error');
        }

    } catch (error) {
        console.error('Feedback submit failed', error);
        setStatus('Failed to send report. Please check your connection.');
        setStatusVariant('error');
    } finally {
        setIsSubmitting(false);
    }
  }, [message, authenticatedFetch, closeOverlay]);

  const portalNode = useMemo(() => {
    if (!isClient) return null;
    let node = document.getElementById('user-feedback-root');
    if (!node) {
        node = document.createElement('div');
        node.setAttribute('id', 'user-feedback-root');
        document.body.appendChild(node);
    }
    return node;
  }, [isClient]);

  // Show for authenticated users, but hide for admins
  if (!isClient || !isAuthenticated || user?.role === 'admin') {
    return null;
  }

  const overlay = visible ? (
    <OverlayBackdrop>
      <OverlayCard>
        <OverlayHeader>
          <h2>Help / Report Issue</h2>
          <CloseButton onClick={closeOverlay} aria-label="Close form">×</CloseButton>
        </OverlayHeader>
        
        {!submitted ? (
            <>
                <p style={{marginBottom: '1rem', opacity: 0.8, fontSize: '0.9rem'}}>
                    Found a bug or have a suggestion? Let us know below.
                </p>
                <TextArea
                  value={message}
                  placeholder="Describe the issue or idea..."
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={isSubmitting}
                />
                <ActionsRow>
                  <SecondaryButton onClick={closeOverlay} disabled={isSubmitting}>Cancel</SecondaryButton>
                  <SubmitButton onClick={handleSubmit} disabled={!message.trim() || isSubmitting}>
                    {isSubmitting ? 'Sending...' : 'Submit'}
                  </SubmitButton>
                </ActionsRow>
            </>
        ) : (
            <div style={{textAlign: 'center', padding: '20px 0'}}>
                <h3 style={{color: '#a8ffcb', marginBottom: '10px'}}>Success!</h3>
                <p>Your feedback has been sent.</p>
                <p style={{fontSize: '0.9rem', marginTop: '10px', opacity: 0.8}}>
                    You can also reach us via email at 
                    <EmailLink href="mailto:dev@flowerpil.com">dev@flowerpil.com</EmailLink>
                </p>
            </div>
        )}

        {status && !submitted && <StatusText $variant={statusVariant}>{status}</StatusText>}
      </OverlayCard>
    </OverlayBackdrop>
  ) : null;

  const button = (
    <>
      <FloatingButton onClick={() => setVisible(true)} aria-label="Open help form">
        ? Help
      </FloatingButton>
      {overlay}
    </>
  );

  if (!portalNode) return null;
  return createPortal(button, portalNode);
};

export default UserFeedbackWidget;
