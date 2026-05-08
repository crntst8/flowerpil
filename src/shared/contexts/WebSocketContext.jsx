import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@shared/contexts/AuthContext';

const WebSocketContext = createContext(null);

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

// Determine WebSocket URL based on current location
function getWebSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws`;
}

export function WebSocketProvider({ children }) {
  const { isAuthenticated, getToken } = useAuth();
  const [connected, setConnected] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const listenersRef = useRef(new Map());
  // Store auth functions in refs to avoid recreating callbacks
  const isAuthenticatedRef = useRef(isAuthenticated);
  const getTokenRef = useRef(getToken);
  const isConnectingRef = useRef(false);
  const intentionalCloseRef = useRef(false);

  // Keep refs in sync
  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
    getTokenRef.current = getToken;
  }, [isAuthenticated, getToken]);

  // Subscribe to a message type
  const subscribe = useCallback((type, callback) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type).add(callback);

    // Return unsubscribe function
    return () => {
      const listeners = listenersRef.current.get(type);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          listenersRef.current.delete(type);
        }
      }
    };
  }, []);

  // Emit message to listeners
  const emit = useCallback((type, data) => {
    const listeners = listenersRef.current.get(type);
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error('[WebSocket] Listener error:', error);
        }
      });
    }
  }, []);

  // Send message to server
  const send = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  // Connect to WebSocket server - stable callback that uses refs
  const connect = useCallback(() => {
    // Prevent duplicate connection attempts
    if (isConnectingRef.current) {
      return;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }
    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    isConnectingRef.current = true;
    intentionalCloseRef.current = false;

    try {
      const url = getWebSocketUrl();
      wsRef.current = new WebSocket(url);

      wsRef.current.onopen = () => {
        console.log('[WebSocket] Connected');
        isConnectingRef.current = false;
        setConnected(true);
        reconnectAttemptsRef.current = 0;

        // Authenticate if we have a token (use refs for current values)
        if (isAuthenticatedRef.current) {
          const token = getTokenRef.current?.();
          if (token) {
            wsRef.current?.send(JSON.stringify({ type: 'auth', token }));
          }
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          // Handle built-in message types
          switch (message.type) {
            case 'connected':
              setAuthenticated(message.authenticated);
              break;
            case 'auth_success':
              setAuthenticated(true);
              break;
            case 'auth_error':
              setAuthenticated(false);
              break;
            case 'pong':
              // Heartbeat response, ignore
              break;
            default:
              // Emit to subscribers
              emit(message.type, message);
          }
        } catch (error) {
          console.error('[WebSocket] Message parse error:', error);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('[WebSocket] Disconnected', event.code, event.reason);
        isConnectingRef.current = false;
        setConnected(false);
        setAuthenticated(false);
        wsRef.current = null;

        // Attempt to reconnect unless intentionally closed
        if (!intentionalCloseRef.current) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;
          console.log(`[WebSocket] Reconnecting in ${delay}ms...`);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        isConnectingRef.current = false;
      };
    } catch (error) {
      console.error('[WebSocket] Connection failed:', error);
      isConnectingRef.current = false;
    }
  }, [emit]); // Only depends on emit which is stable

  // Disconnect from WebSocket server
  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnect');
      wsRef.current = null;
    }

    isConnectingRef.current = false;
    setConnected(false);
    setAuthenticated(false);
  }, []);

  // Connect on mount, disconnect on unmount - run once
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run on mount/unmount

  // Re-authenticate when auth state changes
  useEffect(() => {
    if (connected && isAuthenticated) {
      const token = getToken?.();
      if (token) {
        send({ type: 'auth', token });
      }
    }
  }, [connected, isAuthenticated, getToken, send]);

  // Heartbeat to keep connection alive
  useEffect(() => {
    if (!connected) return;

    const interval = setInterval(() => {
      send({ type: 'ping' });
    }, 25000);

    return () => clearInterval(interval);
  }, [connected, send]);

  // Handle page visibility changes - reconnect when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Check if connection is dead and reconnect
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          console.log('[WebSocket] Page visible, reconnecting...');
          reconnectAttemptsRef.current = 0; // Reset backoff
          connect();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [connect]);

  const value = {
    connected,
    authenticated,
    subscribe,
    send,
    connect,
    disconnect,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export default WebSocketContext;
