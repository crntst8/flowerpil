import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';

const ConsentContext = createContext();

const defaultConsentState = {
  status: 'unknown',
  policyVersion: 'unknown',
  timestamp: null
};

export const useConsent = () => {
  const context = useContext(ConsentContext);
  if (!context) {
    throw new Error('useConsent must be used within a ConsentProvider');
  }
  return context;
};

export const ConsentProvider = ({ children }) => {
  const [consent, setConsent] = useState(defaultConsentState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadConsent = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      const response = await fetch('/api/v1/consent', {
        credentials: 'include',
        cache: 'no-store'
      });
      const data = await response.json();

      if (data.success && data.data) {
        setConsent({
          status: data.data.status || 'unknown',
          policyVersion: data.data.policy_version || 'unknown',
          timestamp: data.data.timestamp || null
        });
      } else {
        throw new Error(data.error || 'Failed to load consent state');
      }
    } catch (err) {
      console.warn('[Consent] Failed to load consent state', err);
      if (!silent) {
        setError(err.message || 'Failed to load consent state');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  const updateConsent = useCallback(async ({ status, policyVersion, source } = {}) => {
    const response = await fetch('/api/v1/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        status,
        policy_version: policyVersion,
        source
      })
    });

    const data = await response.json();
    if (data.success && data.data) {
      setConsent({
        status: data.data.status || 'unknown',
        policyVersion: data.data.policy_version || 'unknown',
        timestamp: data.data.timestamp || null
      });
      return data.data;
    }

    throw new Error(data.error || 'Failed to update consent state');
  }, []);

  useEffect(() => {
    loadConsent();
  }, [loadConsent]);

  const value = {
    ...consent,
    loading,
    error,
    refreshConsent: loadConsent,
    updateConsent
  };

  return (
    <ConsentContext.Provider value={value}>
      {children}
    </ConsentContext.Provider>
  );
};

export default ConsentContext;
