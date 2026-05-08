/**
 * WebSocket Server
 * Handles real-time communication for announcements and future features
 */

import { WebSocketServer as WSServer } from 'ws';
import { parse as parseUrl } from 'url';
import { verifyToken } from '../utils/authUtils.js';
import connectionManager from './connectionManager.js';
import logger from '../utils/logger.js';

class WebSocketServer {
  constructor() {
    this.wss = null;
    this.heartbeatInterval = null;
  }

  /**
   * Initialize WebSocket server attached to HTTP server
   * @param {http.Server} server - The HTTP server instance
   */
  initialize(server) {
    this.wss = new WSServer({ noServer: true });

    // Handle HTTP upgrade requests
    server.on('upgrade', (request, socket, head) => {
      // Parse the URL to check the path
      const { pathname } = parseUrl(request.url, true);

      // Only handle /ws path
      if (pathname === '/ws') {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    // Handle new connections
    this.wss.on('connection', (ws, request) => {
      this.handleConnection(ws, request);
    });

    // Start heartbeat to detect stale connections
    this.startHeartbeat();

    logger.info('WEBSOCKET', 'WebSocket server initialized');
  }

  /**
   * Handle new WebSocket connection
   */
  handleConnection(ws, request) {
    // Parse query params for initial auth token
    const { query } = parseUrl(request.url, true);
    let userId = null;

    // Try to authenticate from token in query string
    if (query.token) {
      try {
        const decoded = verifyToken(query.token);
        userId = decoded?.userId || decoded?.id;
      } catch (err) {
        // Invalid token, continue as anonymous
      }
    }

    // Try to authenticate from cookie
    if (!userId && request.headers.cookie) {
      const cookies = this.parseCookies(request.headers.cookie);
      if (cookies.authToken) {
        try {
          const decoded = verifyToken(cookies.authToken);
          userId = decoded?.userId || decoded?.id;
        } catch (err) {
          // Invalid token, continue as anonymous
        }
      }
    }

    // Register connection
    connectionManager.addConnection(ws, userId);

    // Mark connection as alive for heartbeat
    ws.isAlive = true;

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      authenticated: !!userId,
      userId: userId
    }));

    logger.debug('WEBSOCKET', 'Client connected', {
      userId,
      authenticated: !!userId,
      totalConnections: connectionManager.getStats().totalConnections
    });

    // Handle incoming messages
    ws.on('message', (data) => {
      this.handleMessage(ws, data);
    });

    // Handle pong responses for heartbeat
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Handle connection close
    ws.on('close', () => {
      connectionManager.removeConnection(ws);
      logger.debug('WEBSOCKET', 'Client disconnected', {
        userId: connectionManager.getUserForConnection(ws),
        totalConnections: connectionManager.getStats().totalConnections
      });
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error('WEBSOCKET', 'Connection error', { error: error.message });
      connectionManager.removeConnection(ws);
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  handleMessage(ws, data) {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'auth':
          // Client sending auth token after connection
          if (message.token) {
            try {
              const decoded = verifyToken(message.token);
              const userId = decoded?.userId || decoded?.id;
              if (userId) {
                connectionManager.authenticateConnection(ws, userId);
                ws.send(JSON.stringify({
                  type: 'auth_success',
                  userId
                }));
              }
            } catch (err) {
              ws.send(JSON.stringify({
                type: 'auth_error',
                error: 'Invalid token'
              }));
            }
          }
          break;

        case 'ping':
          // Client ping, respond with pong
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        default:
          // Unknown message type
          logger.debug('WEBSOCKET', 'Unknown message type', { type: message.type });
      }
    } catch (err) {
      logger.error('WEBSOCKET', 'Error parsing message', { error: err.message });
    }
  }

  /**
   * Start heartbeat interval to detect dead connections
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (!this.wss) return;

      for (const ws of this.wss.clients) {
        if (!ws.isAlive) {
          connectionManager.removeConnection(ws);
          return ws.terminate();
        }

        ws.isAlive = false;
        ws.ping();
      }
    }, 30000); // 30 second heartbeat
  }

  /**
   * Stop heartbeat interval
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Parse cookies from header string
   */
  parseCookies(cookieHeader) {
    const cookies = {};
    if (!cookieHeader) return cookies;

    cookieHeader.split(';').forEach((cookie) => {
      const [name, ...rest] = cookie.split('=');
      cookies[name.trim()] = rest.join('=').trim();
    });

    return cookies;
  }

  /**
   * Broadcast message to all connected clients
   * @param {object} message - The message to broadcast
   * @param {object} options - Broadcast options
   * @param {number[]} options.userIds - Optional: only send to specific users
   * @param {string} options.userType - Optional: filter by user type
   * @param {boolean} options.authenticated - Optional: only send to authenticated users
   */
  broadcast(message, options = {}) {
    const { userIds, userType, authenticated } = options;

    // If specific userIds provided, send only to them
    if (userIds && userIds.length > 0) {
      return connectionManager.sendToUsers(userIds, message);
    }

    // Otherwise broadcast with optional filter
    return connectionManager.broadcast(message, (ws, userId) => {
      // Filter by authentication status
      if (authenticated === true && !userId) {
        return false;
      }
      if (authenticated === false && userId) {
        return false;
      }

      // userType filtering would require user data lookup
      // For now, we can add this later if needed

      return true;
    });
  }

  /**
   * Send message to specific user
   * @param {number} userId - The user ID
   * @param {object} message - The message to send
   */
  sendToUser(userId, message) {
    return connectionManager.sendToUser(userId, message);
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return connectionManager.getStats();
  }

  /**
   * Shutdown the WebSocket server
   */
  shutdown() {
    this.stopHeartbeat();

    if (this.wss) {
      // Close all connections
      for (const ws of this.wss.clients) {
        ws.close(1001, 'Server shutting down');
      }
      this.wss.close();
      this.wss = null;
    }

    logger.info('WEBSOCKET', 'WebSocket server shut down');
  }
}

// Export singleton instance
export default new WebSocketServer();
