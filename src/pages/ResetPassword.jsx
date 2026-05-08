import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import { Link, useSearchParams } from 'react-router-dom';
import { theme } from '@shared/styles/GlobalStyles';
import { useAuth } from '@shared/contexts/AuthContext';

const PageWrapper = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${theme.colors.black};
  padding: ${theme.spacing.lg};
`;

const Card = styled.div`
  width: 100%;
  max-width: 420px;
  border: ${theme.borders.solid} ${theme.colors.white};
  border-radius: 12px;
  padding: ${theme.spacing.xl};
  background: rgba(0, 0, 0, 0.94);
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};

  @media (max-width: ${theme.breakpoints.mobile}) {
    padding: ${theme.spacing.lg};
    border-color: ${theme.colors.gray[300]};
  }
`;

const Header = styled.header`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  align-items: flex-start;
`;

const Title = styled.h1`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: ${theme.colors.white};
  margin: 0;
`;

const Subtitle = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.gray[500]};
  margin: 0;
  line-height: 1.4;
`;

const LogoLink = styled.a`
  display: inline-block;
  margin-bottom: ${theme.spacing.sm};
`;

const Logo = styled.img`
  width: 120px;
  height: auto;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const Label = styled.label`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.gray[500]};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const Input = styled.input`
  width: 100%;
  background: ${theme.colors.black};
  border: ${theme.borders.solidThin} ${theme.colors.white};
  color: ${theme.colors.white};
  padding: ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  transition: border-color ${theme.transitions.fast};

  &:focus {
    outline: none;
    border-color: ${theme.colors.primary};
  }

  &::placeholder {
    color: ${theme.colors.gray[500]};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const SubmitButton = styled.button`
  background: ${theme.colors.white};
  border: ${theme.borders.solidThin} ${theme.colors.white};
  color: ${theme.colors.black};
  padding: ${theme.spacing.md} ${theme.spacing.lg};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: all ${theme.transitions.fast};
  font-weight: bold;

  &:hover:not(:disabled) {
    background: transparent;
    color: ${theme.colors.white};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Feedback = styled.div.withConfig({
  shouldForwardProp: (prop) => !['$variant'].includes(prop)
})`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  line-height: 1.5;
  color: ${props => {
    if (props.$variant === 'error') return theme.colors.red;
    if (props.$variant === 'success') return theme.colors.success;
    return theme.colors.gray[500];
  }};
`;

const RequirementList = styled.ul`
  margin: 0;
  padding-left: ${theme.spacing.lg};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.gray[500]};
  display: grid;
  gap: ${theme.spacing.xs};
`;

const Footer = styled.footer`
  border-top: ${theme.borders.solidThin} rgba(255, 255, 255, 0.12);
  padding-top: ${theme.spacing.md};
  display: flex;
  justify-content: space-between;
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.gray[500]};
`;

const FooterLink = styled(Link)`
  color: ${theme.colors.white};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(token ? '' : 'The reset link is missing or has expired.');
  const [requirements, setRequirements] = useState([]);

  const tokenPreview = useMemo(() => {
    if (!token) return '';
    return `${token.slice(0, 6)}...${token.slice(-4)}`;
  }, [token]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!token) return;

    setError('');
    setStatus('');
    setRequirements([]);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      const result = await resetPassword(token, password);
      if (result.success) {
        setStatus(result.message || 'Password updated successfully.');
        setPassword('');
        setConfirmPassword('');
      } else {
        setError(result.error || 'Unable to reset password');
        if (Array.isArray(result.requirements) && result.requirements.length) {
          setRequirements(result.requirements);
        }
      }
    } catch (submitError) {
      setError(submitError?.message || 'Unable to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  const disableInputs = submitting || Boolean(status);

  return (
    <PageWrapper>
      <Card>
        <Header>
          <LogoLink href="/home" aria-label="Go to homepage">
            <Logo src="/logo.png" alt="Flowerpil" />
          </LogoLink>
          <Title>Reset password</Title>
          <Subtitle>
            {token
              ? 'Choose a new password to finish resetting your curator account.'
              : 'This reset link cannot be used. Request a new link to continue.'}
          </Subtitle>
          {token && (
            <Subtitle>
              Token reference: {tokenPreview}
            </Subtitle>
          )}
        </Header>

        {error && (
          <Feedback $variant="error">{error}</Feedback>
        )}
        {requirements.length > 0 && (
          <RequirementList>
            {requirements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </RequirementList>
        )}
        {status && (
          <Feedback $variant="success">{status}</Feedback>
        )}

        <Form onSubmit={handleSubmit}>
          <div>
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              placeholder="Enter a new password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={disableInputs || !token}
              autoComplete="new-password"
            />
          </div>

          <div>
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="Repeat the new password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={disableInputs || !token}
              autoComplete="new-password"
            />
          </div>

          <SubmitButton
            type="submit"
            disabled={
              !token ||
              disableInputs ||
              !password ||
              !confirmPassword ||
              password !== confirmPassword
            }
          >
            {submitting ? 'Updating...' : 'Update password'}
          </SubmitButton>
        </Form>

        <Footer>
          <span>Need a fresh link? Use the forgot password option.</span>
          <FooterLink to="/curator-admin/login">Return to login</FooterLink>
        </Footer>
      </Card>
    </PageWrapper>
  );
}

export default ResetPasswordPage;
