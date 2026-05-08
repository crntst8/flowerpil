import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';

import { theme } from '../styles/GlobalStyles';
import { useAuth } from '../contexts/AuthContext';

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
  max-width: 400px;
  border: ${theme.borders.dashed} ${theme.colors.red};
  padding: ${theme.spacing.xl};
  background: ${theme.colors.black};
  
  @media (max-width: ${theme.breakpoints.mobile}) {
    padding: ${theme.spacing.lg};
    max-width: none;
  }
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

const Input = styled.input.withConfig({
  shouldForwardProp: (prop) => !['hasError'].includes(prop)
})`
  background: ${theme.colors.black};
  border: ${theme.borders.dashed} ${props => props.hasError ? theme.colors.red : theme.colors.gray[300]};
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
    font-family: ${theme.fonts.mono};
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const SubmitButton = styled.button.withConfig({
  shouldForwardProp: (prop) => !['isLoading'].includes(prop)
})`
  background: ${theme.colors.black};
  border: ${theme.borders.dashed} ${theme.colors.white};
  color: ${theme.colors.white};
  padding: ${theme.spacing.md} ${theme.spacing.lg};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.body};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: ${props => props.isLoading ? 'wait' : 'pointer'};
  transition: all ${theme.transitions.fast};
  min-height: 48px;
  position: relative;
  
  &:hover:not(:disabled) {
    background: ${theme.colors.white};
    color: ${theme.colors.black};
  }
  
  &:active:not(:disabled) {
    transform: translateY(1px);
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    border-color: ${theme.colors.gray[300]};
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

const SystemInfo = styled.div`
  margin-top: ${theme.spacing.xl};
  padding-top: ${theme.spacing.lg};
  border-top: ${theme.borders.dashed} ${theme.colors.gray[300]};
  font-family: ${theme.fonts.mono};
  font-size: ${theme.fontSizes.tiny};
  color: ${theme.colors.gray[500]};
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.1em;
`;

function LoginForm({ onSuccess }) {
  const { login, isLoading, error, clearError } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [formErrors, setFormErrors] = useState({});

  // Clear errors when form data changes
  useEffect(() => {
    if (error) {
      clearError();
    }
    if (Object.keys(formErrors).length > 0) {
      setFormErrors({});
    }
  }, [formData, error, clearError]);

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
      errors.username = 'Username is required';
    } else if (formData.username.length < 3) {
      errors.username = 'Username must be at least 3 characters';
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
    
    const result = await login(formData.username, formData.password);
    
    if (result.success && onSuccess) {
      onSuccess();
    }
  };

  const hasError = (field) => {
    return formErrors[field] || (error && error.includes(field));
  };

  return (
    <LoginContainer>
      <LoginBox>
          <Link to="/home" aria-label="Go to homepage">
            <Logo src="/logo.png" alt="Flowerpil" />
          </Link>
        
        {error && (
          <ErrorMessage>
            {error}
          </ErrorMessage>
        )}
                <SystemInfo>
          SITE ADMIN LOGIN
          <br />
          <LoginLink><Link to="/curator-admin">LOOKING FOR CURATOR LOGIN?</Link>
       </LoginLink> </SystemInfo>
                 <br />

        <Form onSubmit={handleSubmit}>
          <InputGroup>
            <Label htmlFor="username"></Label>
            <Input
              id="username"
              name="username"
              type="text"
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
            <Label htmlFor="password"></Label>
            <Input
              id="password"
              name="password"
              type="password"
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
          
          <SubmitButton
            type="submit"
            disabled={isLoading || !formData.username || !formData.password}
            isLoading={isLoading}
          >
            {isLoading ? 'Authenticating' : 'Login'}
          </SubmitButton>
        </Form>
        

      </LoginBox>
    </LoginContainer>
  );
}

export default LoginForm;
