import React, { useState, useEffect } from 'react';
import styled from 'styled-components';

const ProtectionContainer = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #0a0a0a;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
`;

const ProtectionCard = styled.div`
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 4px;
  padding: 40px;
  max-width: 400px;
  width: 90%;
  text-align: center;
`;

const Logo = styled.h1`
  color: #fff;
  font-size: 2rem;
  font-weight: bold;
  margin-bottom: 8px;
  letter-spacing: 2px;
`;

const Subtitle = styled.p`
  color: #888;
  margin-bottom: 32px;
  font-size: 0.9rem;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Input = styled.input`
  background: #0a0a0a;
  border: 1px solid #333;
  border-radius: 4px;
  padding: 12px 16px;
  color: #fff;
  font-size: 1rem;
  
  &:focus {
    outline: none;
    border-color: #555;
  }
  
  &::placeholder {
    color: #666;
  }
`;

const Button = styled.button`
  background: #fff;
  color: #000;
  border: none;
  border-radius: 4px;
  padding: 12px 24px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: #f0f0f0;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ErrorMessage = styled.p`
  color: #ff4444;
  font-size: 0.9rem;
  margin-top: 8px;
`;

const STORAGE_KEY = 'flowerpil_site_access';

function SiteProtection({ children }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already authenticated
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const { timestamp, authenticated } = JSON.parse(stored);
        // Authentication expires after 24 hours
        const isExpired = Date.now() - timestamp > 24 * 60 * 60 * 1000;
        
        if (authenticated && !isExpired) {
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch (e) {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      // Send password to backend for verification
      const response = await fetch('/api/site-access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        const { token } = await response.json();
        
        // Store authentication token with timestamp
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          authenticated: true,
          token,
          timestamp: Date.now()
        }));
        setIsAuthenticated(true);
      } else {
        setError('Incorrect password');
        setPassword('');
      }
    } catch (err) {
      console.error('Site access error:', err);
      setError('Connection error - try again');
      setPassword('');
    }
  };

  // Check environment variable for site protection
  const siteProtectionEnabled = import.meta.env.VITE_SITE_PROTECTION_ENABLED === 'true';
  
  if (!siteProtectionEnabled) {
    return children;
  }

  if (isLoading) {
    return (
      <ProtectionContainer>
        <ProtectionCard>
          <Logo>FLOWERPIL</Logo>
          <Subtitle>Loading...</Subtitle>
        </ProtectionCard>
      </ProtectionContainer>
    );
  }

  if (!isAuthenticated) {
    return (
      <ProtectionContainer>
        <ProtectionCard>
          <Logo>FLOWERPIL</Logo>
          <Subtitle>Development Site - Access Required</Subtitle>
          
          <Form onSubmit={handleSubmit}>
            <Input
              type="password"
              placeholder="Enter site password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            <Button type="submit" disabled={!password.trim()}>
              Access Site
            </Button>
          </Form>
          
          {error && <ErrorMessage>{error}</ErrorMessage>}
        </ProtectionCard>
      </ProtectionContainer>
    );
  }

  return children;
}

export default SiteProtection;