import express from 'express';
import { getQueries } from '../database/db.js';
import { authMiddleware } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Store active SSE connections
const connections = new Map();

/**
 * SSE endpoint for real-time updates
 * Supports: export progress, cross-linking progress, and other background tasks
 */
router.get('/events', authMiddleware, (req, res) => {
  const userId = req.user?.id;
  const curatorId = req.user?.curator_id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Set headers for SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Disable nginx buffering
  });

  // Store connection
  const connectionId = `${userId}-${Date.now()}`;
  const connection = {
    id: connectionId,
    userId,
    curatorId,
    response: res,
    lastHeartbeat: Date.now()
  };

  connections.set(connectionId, connection);

  logger.info('SSE', `Client connected: ${connectionId} (user ${userId})`);

  // Send initial connection event
  sendEvent(res, 'connected', {
    connection_id: connectionId,
    timestamp: new Date().toISOString()
  });

  // Heartbeat to keep connection alive
  const heartbeatInterval = setInterval(() => {
    sendEvent(res, 'heartbeat', { timestamp: new Date().toISOString() });
    connection.lastHeartbeat = Date.now();
  }, 30000); // Every 30 seconds

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    connections.delete(connectionId);
    logger.info('SSE', `Client disconnected: ${connectionId}`);
  });
});

/**
 * Send SSE event to a specific connection
 */
function sendEvent(res, event, data) {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (error) {
    logger.error('SSE', 'Error sending event', error);
  }
}

/**
 * Broadcast export progress update to all connections for a user
 */
export function broadcastExportProgress(requestId, userId, curatorId, progressData) {
  for (const [connectionId, connection] of connections) {
    if (connection.userId === userId || connection.curatorId === curatorId) {
      sendEvent(connection.response, 'export_progress', {
        request_id: requestId,
        ...progressData,
        timestamp: new Date().toISOString()
      });
    }
  }
}

/**
 * Broadcast cross-linking progress update
 */
export function broadcastLinkingProgress(playlistId, userId, curatorId, progressData) {
  for (const [connectionId, connection] of connections) {
    if (connection.userId === userId || connection.curatorId === curatorId) {
      sendEvent(connection.response, 'linking_progress', {
        playlist_id: playlistId,
        ...progressData,
        timestamp: new Date().toISOString()
      });
    }
  }
}

/**
 * Broadcast generic progress update
 */
export function broadcastProgress(userId, curatorId, eventType, data) {
  for (const [connectionId, connection] of connections) {
    if (connection.userId === userId || connection.curatorId === curatorId) {
      sendEvent(connection.response, eventType, {
        ...data,
        timestamp: new Date().toISOString()
      });
    }
  }
}

/**
 * Get active connection count
 */
export function getConnectionCount() {
  return connections.size;
}

/**
 * Clean up stale connections (no heartbeat for 2 minutes)
 */
setInterval(() => {
  const now = Date.now();
  const staleThreshold = 2 * 60 * 1000; // 2 minutes

  for (const [connectionId, connection] of connections) {
    if (now - connection.lastHeartbeat > staleThreshold) {
      try {
        connection.response.end();
      } catch (error) {
        // Connection already closed
      }
      connections.delete(connectionId);
      logger.info('SSE', `Cleaned up stale connection: ${connectionId}`);
    }
  }
}, 60000); // Check every minute

export default router;
