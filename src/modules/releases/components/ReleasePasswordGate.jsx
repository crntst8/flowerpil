import React, { useState } from 'react';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

const GateContainer = styled.div`
  height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: ${theme.colors.black};
  color: ${theme.colors.fpwhite};
  padding: ${theme.spacing[4]};
`;

const GateBox = styled.div`
  max-width: 400px;
  width: 100%;
  text-align: center;
  border: 1px dashed rgba(255,255,255,0.3);
  padding: ${theme.spacing[6]};
`;

const Title = styled.h1`
  font-size: ${theme.fontSizes.xl};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: ${theme.spacing[2]};
`;

const Subtitle = styled.p`
  font-size: ${theme.fontSizes.sm};
  opacity: 0.7;
  margin-bottom: ${theme.spacing[6]};
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing[3]};
`;

const Input = styled.input`
  background: transparent;
  border: 1px solid rgba(255,255,255,0.3);
  color: ${theme.colors.fpwhite};
  padding: ${theme.spacing[3]};
  font-size: ${theme.fontSizes.md};
  text-align: center;
  width: 100%;

  &::placeholder {
    color: rgba(255,255,255,0.5);
  }

  &:focus {
    outline: none;
    border-color: ${theme.colors.fpwhite};
  }
`;

const SubmitButton = styled.button`
  background: ${theme.colors.fpwhite};
  color: ${theme.colors.black};
  border: none;
  padding: ${theme.spacing[3]};
  font-size: ${theme.fontSizes.sm};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all ${theme.transitions.fast};

  &:hover {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ErrorMessage = styled.p`
  color: #ff6b6b;
  font-size: ${theme.fontSizes.sm};
  margin-top: ${theme.spacing[2]};
`;

const ReleasePasswordGate = ({ onSubmit }) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!password.trim()) {
      setError('Please enter a password');
      return;
    }

    setLoading(true);
    setError(null);

    const success = await onSubmit(password);

    if (!success) {
      setError('Incorrect password');
      setLoading(false);
    }
  };

  return (
    <GateContainer>
      <GateBox>
        <Title>Private Release</Title>
        <Subtitle>This release is password protected. Enter the password to view.</Subtitle>

        <Form onSubmit={handleSubmit}>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            autoFocus
            disabled={loading}
          />
          <SubmitButton type="submit" disabled={loading}>
            {loading ? 'Verifying...' : 'Access Release'}
          </SubmitButton>
        </Form>

        {error && <ErrorMessage>{error}</ErrorMessage>}
      </GateBox>
    </GateContainer>
  );
};

export default ReleasePasswordGate;
