import React, { useState, useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import styled from 'styled-components';
import { theme } from '@shared/styles/GlobalStyles';

const BioPageContainer = styled.div`
  min-height: 100vh;
  width: 100%;
  background: ${theme.colors.black};
  color: ${theme.colors.white};
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ${theme.fonts.mono};
`;

const MessageBox = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl};
  border: ${theme.borders.dashed} ${theme.colors.gray[300]};
  max-width: 500px;
  
  h1 {
    font-size: ${theme.fontSizes.large};
    margin-bottom: ${theme.spacing.md};
  }
  
  p {
    font-size: ${theme.fontSizes.body};
    color: ${theme.colors.gray[400]};
    margin-bottom: ${theme.spacing.lg};
  }
  
  a {
    color: ${theme.colors.white};
    text-decoration: none;
    border: ${theme.borders.dashed} ${theme.colors.gray[300]};
    padding: ${theme.spacing.sm} ${theme.spacing.md};
    display: inline-block;
    transition: border-color 0.2s ease;
    
    &:hover {
      border-color: ${theme.colors.white};
    }
  }
`;

const PublicBioPage = () => {
  const { handle } = useParams();
  const [bioProfile, setBioProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadBioProfile = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/v1/bio-profiles/public/${handle}`);
        
        if (!response.ok) {
          throw new Error(`Bio page not found: ${response.status}`);
        }
        
        const data = await response.json();
        setBioProfile(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (handle) {
      loadBioProfile();
    }
  }, [handle]);

  // For now, redirect to the backend-rendered version
  // This is a temporary solution until we implement full React rendering
  useEffect(() => {
    if (handle && !loading && !error) {
      // Redirect to backend-rendered bio page
      window.location.href = `/api/v1/bio/${handle}`;
    }
  }, [handle, loading, error]);

  if (loading) {
    return (
      <BioPageContainer>
        <MessageBox>
          <h1>Loading bio page...</h1>
          <p>Please wait while we load {handle}'s bio page.</p>
        </MessageBox>
      </BioPageContainer>
    );
  }

  if (error) {
    return (
      <BioPageContainer>
        <MessageBox>
          <h1>Bio page not found</h1>
          <p>The handle "{handle}" doesn't exist or hasn't been published.</p>
          <a href="/">← Back to home</a>
        </MessageBox>
      </BioPageContainer>
    );
  }

  return (
    <BioPageContainer>
      <MessageBox>
        <h1>Redirecting...</h1>
        <p>Taking you to {handle}'s bio page...</p>
      </MessageBox>
    </BioPageContainer>
  );
};

export default PublicBioPage;