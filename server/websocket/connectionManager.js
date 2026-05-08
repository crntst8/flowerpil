/**
 * WebSocket Connection Manager
 * Tracks connected clients by userId for targeted messaging
 */

class ConnectionManager {
  constructor() {
    // Map of userId -> Set of WebSocket connections
    this.userConnections = new Map();
    // Map of WebSocket -> userId (for cleanup)
    this.connectionToUser = new Map();
    // All connections (including unauthenticated)
    this.allConnections = new Set();
  }

  /**
   * Register a new connection
   * @param {WebSocket} ws - The WebSocket connection
   * @param {number|null} userId - The authenticated user ID, or null for anonymous
   */
  addConnection(ws, userId = null) {
    this.allConnections.add(ws);

    if (userId) {
      this.connectionToUser.set(ws, userId);

      if (!this.userConnections.has(userId)) {
        this.userConnections.set(userId, new Set());
      }
      this.userConnections.get(userId).add(ws);
    }
  }

  /**
   * Update connection with authenticated user
   * @param {WebSocket} ws - The WebSocket connection
   * @param {number} userId - The authenticated user ID
   */
  authenticateConnection(ws, userId) {
    // Remove from previous user if re-authenticating
    const previousUserId = this.connectionToUser.get(ws);
    if (previousUserId && previousUserId !== userId) {
      const previousSet = this.userConnections.get(previousUserId);
      if (previousSet) {
        previousSet.delete(ws);
        if (previousSet.size === 0) {
          this.userConnections.delete(previousUserId);
        }
      }
    }

    this.connectionToUser.set(ws, userId);

    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId).add(ws);
  }

  /**
   * Remove a connection
   * @param {WebSocket} ws - The WebSocket connection to remove
   */
  removeConnection(ws) {
    this.allConnections.delete(ws);

    const userId = this.connectionToUser.get(ws);
    if (userId) {
      const userSockets = this.userConnections.get(userId);
      if (userSockets) {
        userSockets.delete(ws);
        if (userSockets.size === 0) {
          this.userConnections.delete(userId);
        }
      }
      this.connectionToUser.delete(ws);
    }
  }

  /**
   * Get all connections for a specific user
   * @param {number} userId - The user ID
   * @returns {Set<WebSocket>} Set of connections
   */
  getConnectionsForUser(userId) {
    return this.userConnections.get(userId) || new Set();
  }

  /**
   * Get user ID for a connection
   * @param {WebSocket} ws - The WebSocket connection
   * @returns {number|null} The user ID or null
   */
  getUserForConnection(ws) {
    return this.connectionToUser.get(ws) || null;
  }

  /**
   * Broadcast message to all connected clients
   * @param {object} message - The message to send
   * @param {function} filter - Optional filter function (ws, userId) => boolean
   */
  broadcast(message, filter = null) {
    const payload = JSON.stringify(message);
    let count = 0;

    for (const ws of this.allConnections) {
      if (ws.readyState === 1) { // WebSocket.OPEN
        const userId = this.connectionToUser.get(ws);
        if (!filter || filter(ws, userId)) {
          ws.send(payload);
          count++;
        }
      }
    }

    return count;
  }

  /**
   * Send message to specific users
   * @param {number[]} userIds - Array of user IDs to send to
   * @param {object} message - The message to send
   */
  sendToUsers(userIds, message) {
    const payload = JSON.stringify(message);
    let count = 0;

    for (const userId of userIds) {
      const connections = this.userConnections.get(userId);
      if (connections) {
        for (const ws of connections) {
          if (ws.readyState === 1) {
            ws.send(payload);
            count++;
          }
        }
      }
    }

    return count;
  }

  /**
   * Send message to a single user
   * @param {number} userId - The user ID
   * @param {object} message - The message to send
   */
  sendToUser(userId, message) {
    return this.sendToUsers([userId], message);
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      totalConnections: this.allConnections.size,
      authenticatedUsers: this.userConnections.size,
      connectionsByUser: Array.from(this.userConnections.entries()).map(([userId, conns]) => ({
        userId,
        connections: conns.size
      }))
    };
  }
}

export default new ConnectionManager();
