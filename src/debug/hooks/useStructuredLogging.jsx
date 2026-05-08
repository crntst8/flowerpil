import { useCallback, useRef, useEffect } from 'react';
import { logger } from '../services/logger.js';

/**
 * Hook for structured logging in React components
 * Replaces console.log with categorized, searchable logs
 * 
 * Usage:
 * const log = useStructuredLogging('BioEditor');
 * log.bio.editorLoaded(handle, contentLength);
 * log.performance.componentRender('BioEditor', renderTime);
 */
export const useStructuredLogging = (componentName) => {
  const renderStartTime = useRef(null);
  const mountTime = useRef(Date.now());

  // Track component render performance
  useEffect(() => {
    renderStartTime.current = Date.now();
  });

  useEffect(() => {
    const renderDuration = renderStartTime.current ? Date.now() - renderStartTime.current : 0;
    if (renderDuration > 0) {
      logger.performance.componentRender(componentName, renderDuration);
    }
  });

  // Track component mount/unmount
  useEffect(() => {
    const mountDuration = Date.now() - mountTime.current;
    logger.performance.componentRender(`${componentName}:mount`, mountDuration);

    return () => {
      logger.performance.componentRender(`${componentName}:unmount`, 0);
    };
  }, [componentName]);

  // Return logger with component context
  return {
    ...logger,
    // Add component-specific logging methods
    debug: useCallback((message, data = {}) => {
      logger.performance.componentRender(`${componentName}:debug`, 0);
      console.log(`[${componentName}]`, message, data);
    }, [componentName]),
    
    error: useCallback((error, context = {}) => {
      logger.api.error('COMPONENT', componentName, error, 500);
      console.error(`[${componentName}]`, error, context);
    }, [componentName])
  };
};

/**
 * Hook specifically for tracking bio page editor operations
 */
export const useBioEditorLogging = (handle) => {
  const log = useStructuredLogging('BioEditor');

  return {
    ...log,
    trackLinkOperation: useCallback((operation, linkType, position) => {
      switch (operation) {
        case 'add':
          log.bio.linkAdded(handle, linkType, position);
          break;
        case 'remove':
          log.bio.validationError(handle, [`Link removed at position ${position}`]);
          break;
        case 'reorder':
          log.bio.linkAdded(handle, `reorder-${linkType}`, position);
          break;
      }
    }, [handle, log]),

    trackValidation: useCallback((errors) => {
      if (errors.length > 0) {
        log.bio.validationError(handle, errors);
      }
    }, [handle, log]),

    trackPublish: useCallback((success, errorMessage = null) => {
      log.bio.publishAttempt(handle, success);
      if (!success && errorMessage) {
        log.bio.validationError(handle, [errorMessage]);
      }
    }, [handle, log])
  };
};

/**
 * Hook for tracking audio preview operations
 */
export const useAudioPreviewLogging = () => {
  const log = useStructuredLogging('AudioPreview');

  return {
    ...log,
    trackPlay: useCallback((trackId, title) => {
      log.audio.trackStarted(trackId, title);
    }, [log]),

    trackStop: useCallback((trackId) => {
      log.audio.trackStopped(trackId);
    }, [log]),

    trackError: useCallback((trackId, error) => {
      log.audio.contextError(error, trackId);
    }, [log]),

    previewNotFound: useCallback((trackId, reason) => {
      log.audio.previewLoadFailed(trackId, reason);
    }, [log])
  };
};

/**
 * Hook for API request logging
 */
export const useApiLogging = () => {
  const log = useStructuredLogging('ApiClient');

  return {
    ...log,
    trackRequest: useCallback((method, endpoint, startTime) => {
      const duration = Date.now() - startTime;
      log.api.request(method, endpoint, null, duration);
    }, [log]),

    trackError: useCallback((method, endpoint, error, statusCode) => {
      log.api.error(method, endpoint, error, statusCode);
    }, [log])
  };
};