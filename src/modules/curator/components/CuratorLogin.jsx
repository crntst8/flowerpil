import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';
import { useAuth } from '@shared/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Link } from 'react-router-dom';


const LoginContainer = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${theme.colors.black};
  padding: ${theme.spacing.lg};
 
`;
const LoginLink = styled(Link)`
  color: ${theme.colors.white};
  text-decoration: none;
  transition: all ${theme.transitions.fast};
  padding: 4px 8px;
  margin: -4px -8px;
  border-radius: 4px;
  font-weight: ${theme.fontWeights.medium};
  
  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: ${theme.colors.white};
    text-decoration: none;
  }
  
  &:active {
    background: rgba(255, 255, 255, 0.2);
  }
`;
const LoginBox = styled.div`
  width: 100%;
  max-width: 420px;
  border: ${theme.borders.solid} ${theme.colors.white};
  border-radius: 10px;
  padding: ${theme.spacing.xl};
     box-shadow:
    0 2px 8px rgba(255, 255, 255, 0.83),
    0 4px 16px rgba(255, 255, 255, 0.69),
    0 8px 32px rgba(255, 255, 255, 0.71);
  background: ${theme.colors.black};
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    padding: ${theme.spacing.lg};
    max-width: none;
    border-color: ${theme.colors.gray[300]};
  }
`;

const LogoContainer = styled.div`
  text-align: center;
  margin-bottom: ${theme.spacing.xl};
  padding-bottom: ${theme.spacing.lg};
  border-bottom: ${theme.borders.solidThin} ${theme.colors.gray[300]};
`;

const Logo = styled.img`
  max-width: 120px;
  height: auto;
  display: block;
  margin: 0 auto;
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    max-width: 100px;
  }
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
`;

const InputGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const Label = styled.label`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.white};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;
const SystemInfo = styled.div`
  margin-top: ${theme.spacing.xl};
  padding-top: ${theme.spacing.lg};
  border-top: ${theme.borders.solidThin} ${theme.colors.gray[300]};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.gray[500]};
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.1em;
`;
const TopInfo = styled.div`
  margin-top: ${theme.spacing.xl};
  padding-top: ${theme.spacing.lg};
  border-top: ${theme.borders.solidThin} ${theme.colors.gray[300]};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.h2};
  color: ${theme.colors.fpwhite};
  text-align: center;
  text-transform: none;
  letter-spacing: -0.9px;
`;
const Input = styled.input.withConfig({
  shouldForwardProp: (prop) => !['hasError'].includes(prop)
})`
  background: ${theme.colors.black};
  border: ${theme.borders.solidThin} ${props => props.hasError ? theme.colors.red : theme.colors.white};
  color: ${theme.colors.white};
  padding: ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  transition: all ${theme.transitions.fast};
  min-height: 48px;
  
  &:focus {
    outline: none;
    border-color: ${props => props.hasError ? theme.colors.red : theme.colors.white};
    background: ${theme.colors.gray[50]};
  }
  
  &::placeholder {
    color: ${theme.colors.gray[500]};
    font-family: ${theme.fonts.primary};
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    border-color: ${props => props.hasError ? theme.colors.red : theme.colors.gray[300]};
    
    &:focus {
      border-color: ${props => props.hasError ? theme.colors.red : theme.colors.white};
    }
  }
`;

const SubmitButton = styled.button.withConfig({
  shouldForwardProp: (prop) => !['isLoading'].includes(prop)
})`
  background: ${theme.colors.white};
  border: ${theme.borders.solidThin} ${theme.colors.white};
  color: ${theme.colors.black};
  padding: ${theme.spacing.md} ${theme.spacing.lg};
  font-family: ${theme.fonts.primary};
  font-size: ${theme.fontSizes.body};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: ${props => props.isLoading ? 'wait' : 'pointer'};
  transition: all ${theme.transitions.fast};
  min-height: 48px;
  position: relative;
  font-weight: bold;
  
  &:hover:not(:disabled) {
    background: ${theme.colors.black};
    color: ${theme.colors.white};
    border-color: ${theme.colors.white};
  }
  
  &:active:not(:disabled) {
    transform: translateY(1px);
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: ${theme.colors.gray[300]};
    border-color: ${theme.colors.gray[300]};
    color: ${theme.colors.gray[600]};
  }
  
  ${props => props.isLoading && `
    &::after {
      content: '';
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px dashed currentColor;
      border-top: 2px solid currentColor;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-left: ${theme.spacing.sm};
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `}
`;

const ErrorMessage = styled.div`
  background: ${theme.colors.black};
  border: ${theme.borders.dashed} ${theme.colors.red};
  color: ${theme.colors.red};
  padding: ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  text-align: center;
  margin-bottom: ${theme.spacing.lg};
  
  &::before {
    content: '⚠ ';
    margin-right: ${theme.spacing.xs};
  }
`;

const HelperRow = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-top: -${theme.spacing.sm};
`;

const HelperButton = styled.button`
  background: none;
  border: none;
  color: ${theme.colors.gray[500]};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  padding: ${theme.spacing.xs};
  transition: color ${theme.transitions.fast};

  &:hover {
    color: ${theme.colors.white};
  }

  &:focus-visible {
    outline: ${theme.borders.solidThin} ${theme.colors.white};
    outline-offset: 2px;
  }
`;

const ResetPanel = styled.div`
  margin-top: ${theme.spacing.lg};
  border: ${theme.borders.solidThin} rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
  padding: ${theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const ResetHeading = styled.h2`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.small};
  color: ${theme.colors.white};
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const ResetDescription = styled.p`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.gray[500]};
  margin: 0;
  line-height: 1.4;
`;

const ResetForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const ResetButton = styled.button.withConfig({
  shouldForwardProp: (prop) => !['isLoading'].includes(prop)
})`
  align-self: flex-end;
  background: ${theme.colors.white};
  border: ${theme.borders.solidThin} ${theme.colors.white};
  color: ${theme.colors.black};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: ${props => props.isLoading ? 'wait' : 'pointer'};
  transition: all ${theme.transitions.fast};

  &:hover:not(:disabled) {
    background: transparent;
    color: ${theme.colors.white};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ResetFeedback = styled.p.withConfig({
  shouldForwardProp: (prop) => !['$variant'].includes(prop)
})`
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${props => props.$variant === 'error' ? theme.colors.red : theme.colors.success};
  margin: 0;
`;


function CuratorLogin() {
  const {
    login,
    requestPasswordReset,
    isLoading,
    error,
    clearError,
    isAuthenticated,
    user
  } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetStatus, setResetStatus] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // Clear errors when form data changes
  useEffect(() => {
    if (error) {
      clearError();
    }
    if (Object.keys(formErrors).length > 0) {
      setFormErrors({});
    }
  }, [formData, error, clearError]);

  useEffect(() => {
    if (showResetForm && !resetEmail && formData.username) {
      setResetEmail(formData.username);
    }
  }, [showResetForm, formData.username, resetEmail]);

  // Redirect authenticated users to curator area (place after hooks to keep hook order stable)
  if (isAuthenticated && (user?.role === 'curator' || user?.role === 'admin')) {
    return <Navigate to="/curator-admin" replace />;
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateForm = () => {
    const errors = {};
    
    if (!formData.username.trim()) {
      errors.username = 'Email or username is required';
    }
    
    if (!formData.password) {
      errors.password = 'Password is required';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    await login(formData.username, formData.password);
  };

  const hasError = (field) => {
    return formErrors[field] || (error && error.includes(field));
  };

  const toggleResetForm = () => {
    setShowResetForm(prev => !prev);
    setResetError('');
    setResetStatus('');
    if (!showResetForm && formData.username) {
      setResetEmail(formData.username);
    }
  };

  const handleResetSubmit = async (event) => {
    event.preventDefault();
    setResetError('');
    setResetStatus('');

    if (!resetEmail.trim()) {
      setResetError('Email is required');
      return;
    }

    setResetLoading(true);
    try {
      const result = await requestPasswordReset(resetEmail);
      if (result.success) {
        setResetStatus(result.message || 'Check your email for the reset link.');
      } else {
        setResetError(result.error || 'Unable to send reset email');
      }
    } catch (submissionError) {
      setResetError(submissionError?.message || 'Unable to send reset email');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <LoginContainer>
      <LoginBox>
    
        <LogoContainer>
          <a href="/home" aria-label="Go to homepage">
            <Logo src="/logo.png" alt="Flowerpil" />
          </a>
          <TopInfo>Curator Login</TopInfo>

        </LogoContainer>
        
        {error && (
          <ErrorMessage>
            {error}
          </ErrorMessage>
        )}
        
        <Form onSubmit={handleSubmit}>
          <InputGroup>
            <Input
              id="username"
              name="username"
              type="email"
              placeholder="email"
              aria-label="Email"
              value={formData.username}
              onChange={handleInputChange}
              hasError={hasError('username')}
              disabled={isLoading}
              autoComplete="username"
              autoFocus
            />
            {formErrors.username && (
              <ErrorMessage>{formErrors.username}</ErrorMessage>
            )}
          </InputGroup>
          
          <InputGroup>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="password"
              aria-label="Password"
              value={formData.password}
              onChange={handleInputChange}
              hasError={hasError('password')}
              disabled={isLoading}
              autoComplete="current-password"
            />
            {formErrors.password && (
              <ErrorMessage>{formErrors.password}</ErrorMessage>
            )}
          </InputGroup>
          
          <HelperRow>
            <HelperButton type="button" onClick={toggleResetForm}>
              {showResetForm ? 'Close reset form' : 'Forgot password?'}
            </HelperButton>
          </HelperRow>
          
          <SubmitButton
            type="submit"
            disabled={isLoading || !formData.username || !formData.password}
            isLoading={isLoading}
          >
            {isLoading ? 'Signing In' : 'Sign In'}
          </SubmitButton>
        </Form>
        {showResetForm && (
          <ResetPanel>
            <ResetHeading>Reset your password</ResetHeading>
            <ResetDescription>
              Enter the email linked to your curator account and we&apos;ll send a reset link.
            </ResetDescription>
            <ResetForm onSubmit={handleResetSubmit}>
              <Input
                type="email"
                placeholder="your.email@domain.com"
                value={resetEmail}
                onChange={(event) => setResetEmail(event.target.value)}
                disabled={resetLoading}
                autoComplete="email"
              />
              <ResetButton
                type="submit"
                disabled={resetLoading || !resetEmail.trim()}
                isLoading={resetLoading}
              >
                {resetLoading ? 'Sending...' : 'Send reset link'}
              </ResetButton>
            </ResetForm>
            {resetStatus && (
              <ResetFeedback>{resetStatus}</ResetFeedback>
            )}
            {resetError && (
              <ResetFeedback $variant="error">{resetError}</ResetFeedback>
            )}
          </ResetPanel>
        )}
                                  <SystemInfo>
                    GOT A REFERAL CODE?
                     <br />
                     <LoginLink><Link to="/signup">CREATE ACCOUNT</Link>
                  </LoginLink> </SystemInfo>
      </LoginBox>
    </LoginContainer>
  );
}

export default CuratorLogin;
