import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { theme } from '../styles/GlobalStyles';
import { useAuth } from '../contexts/AuthContext';
import LoginForm from './LoginForm';

const LoadingContainer = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${theme.colors.black};
`;

const LoadingBox = styled.div`
  border: ${theme.borders.dashed} ${theme.colors.gray[300]};
  padding: ${theme.spacing.xl};
  text-align: center;
`;

const LoadingText = styled.div`
  font-family: ${theme.fonts.mono};
  color: ${theme.colors.white};
  font-size: ${theme.fontSizes.body};
  text-transform: uppercase;
  letter-spacing: 0.1em;
  
  &::after {
    content: '.';
    animation: ellipsis 1.5s infinite;
  }
  
  @keyframes ellipsis {
    0% { content: '.'; }
    33% { content: '..'; }
    66% { content: '...'; }
  }
`;

const LoadingSpinner = styled.div`
  width: 32px;
  height: 32px;
  border: 2px dashed ${theme.colors.gray[300]};
  border-top: 2px solid ${theme.colors.white};
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto ${theme.spacing.lg};
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

function LoadingScreen() {
  return (
    <LoadingContainer>
      <LoadingBox>
        <LoadingSpinner />
        <LoadingText>
          Verifying Access
        </LoadingText>
      </LoadingBox>
    </LoadingContainer>
  );
}

function PrivateRoute({ children, requireAuth = true, redirectTo = null, allowedRoles = ['admin'] }) {
  const bypassAuth = typeof window !== 'undefined' && window.localStorage.getItem('flowerpil:e2e-auth-bypass') === 'true';
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (bypassAuth) {
    return children;
  }

  // Show loading screen while checking authentication
  if (isLoading) {
    return <LoadingScreen />;
  }

  // If authentication is required but user is not authenticated
  if (requireAuth && !isAuthenticated) {
    // If a redirect path is specified, navigate there
    if (redirectTo) {
      return (
        <Navigate
          to={redirectTo}
          state={{ from: location.pathname }}
          replace
        />
      );
    }

    // Otherwise, show the login form inline
    return (
      <LoginForm
        onSuccess={() => {
          // Login successful, component will re-render with authenticated state
          console.log('Login successful, user authenticated');
        }}
      />
    );
  }

  // If user is authenticated but doesn't have required role
  if (requireAuth && isAuthenticated && !allowedRoles.includes(user?.role)) {
    console.warn(`Access denied: User role '${user?.role}' not in allowed roles:`, allowedRoles);

    // Redirect users to appropriate dashboard based on their role
    const isCuratorRoute = location.pathname.startsWith('/curator-admin');
    const isAdminRoute = location.pathname.startsWith('/admin');

    if (isCuratorRoute && user?.role !== 'curator' && user?.role !== 'admin') {
      // Non-curator trying to access curator routes
      return <Navigate to="/home" replace />;
    } else if (isAdminRoute && user?.role !== 'admin') {
      // Non-admin trying to access admin routes
      return <Navigate to="/home" replace />;
    }

    // Fallback: redirect to home
    return <Navigate to="/home" replace />;
  }

  // User is authenticated and authorized, render children
  return children;
}

// Higher-order component version for easier usage
export function withAuthGuard(Component, options = {}) {
  return function AuthGuardedComponent(props) {
    return (
      <PrivateRoute {...options}>
        <Component {...props} />
      </PrivateRoute>
    );
  };
}

// Hook for imperative auth checks
export function useAuthGuard() {
  const { isAuthenticated, user, isLoading } = useAuth();
  
  return {
    isAuthenticated,
    isAdmin: user?.role === 'admin',
    isCurator: user?.role === 'curator',
    isLoading,
    canAccess: (allowedRoles = ['admin']) => {
      if (!isAuthenticated) return false;
      const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
      return rolesArray.includes(user?.role);
    }
  };
}

export default PrivateRoute;
