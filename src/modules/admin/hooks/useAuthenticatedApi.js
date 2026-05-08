import { useCallback } from 'react';
import { useAuth } from '@shared/contexts/AuthContext';
import { AdminApiError } from '../utils/adminApi';

// Hook for handling authenticated API calls in admin components
export function useAuthenticatedApi() {
  const { authenticatedFetch, isAuthenticated } = useAuth();
  
  // Enhanced error handler for admin operations
  const handleApiError = useCallback((error) => {
    console.error('Admin API error:', error);
    
    // If it's an authentication error, the AuthContext will handle logout
    if (error instanceof AdminApiError && error.authRequired) {
      console.warn('Authentication required, user will be redirected to login');
      // Note: AuthContext already handles logout on 401, so no need to call logout here
      return;
    }
    
    // Re-throw other errors for component handling
    throw error;
  }, []);
  
  // Wrapper for admin API calls that handles auth errors
  const callAdminApi = useCallback(async (apiFunction, ...args) => {
    if (!isAuthenticated) {
      throw new AdminApiError('Not authenticated', 401, { authRequired: true });
    }
    
    try {
      return await apiFunction(...args);
    } catch (error) {
      handleApiError(error);
    }
  }, [isAuthenticated, handleApiError]);
  
  return {
    callAdminApi,
    authenticatedFetch,
    handleApiError,
    isAuthenticated
  };
}

export default useAuthenticatedApi;
