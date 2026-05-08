# WebSocket System

Real-time bidirectional communication infrastructure for Flowerpil. Supports broadcast messaging to all connected clients and targeted messaging to specific users.

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Client    │────▶│  WebSocket       │────▶│  Connection     │
│   Browser   │◀────│  Server          │◀────│  Manager        │
└─────────────┘     └──────────────────┘     └─────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   Message    │
                    │   Handlers   │
                    └──────────────┘
```

## Server Components

### WebSocketServer

Location: `server/websocket/WebSocketServer.js`

Main server class using the `ws` package. Attaches to the HTTP server on the `/ws` path.

**Initialization:**
```javascript
import { webSocketServer } from './websocket/index.js';

// After HTTP server starts
webSocketServer.initialize(httpServer);
```

**Key Methods:**
- `initialize(server)` - Attach to HTTP server
- `broadcast(message, options)` - Send to all/filtered clients
- `sendToUser(userId, message)` - Send to specific user
- `getStats()` - Get connection statistics
- `shutdown()` - Close all connections

**Options for broadcast:**
```javascript
webSocketServer.broadcast(message, {
  userIds: [1, 2, 3],        // Only to specific users
  authenticated: true,        // Only authenticated users
  authenticated: false,       // Only anonymous users
});
```

### ConnectionManager

Location: `server/websocket/connectionManager.js`

Tracks connected clients by userId for targeted messaging.

**Key Methods:**
- `addConnection(ws, userId)` - Register new connection
- `authenticateConnection(ws, userId)` - Update connection with auth
- `removeConnection(ws)` - Clean up on disconnect
- `getConnectionsForUser(userId)` - Get all connections for user
- `broadcast(message, filter)` - Send to all with optional filter
- `sendToUsers(userIds, message)` - Send to specific users
- `getStats()` - Connection statistics

**Connection tracking:**
- `userConnections` - Map of userId -> Set<WebSocket>
- `connectionToUser` - Map of WebSocket -> userId
- `allConnections` - Set of all WebSocket connections

## Client Components

### WebSocketContext

Location: `src/shared/contexts/WebSocketContext.jsx`

React context provider for WebSocket connectivity.

**Usage:**
```jsx
import { WebSocketProvider, useWebSocket } from '@shared/contexts/WebSocketContext';

// In App.jsx
<AuthProvider>
  <WebSocketProvider>
    {children}
  </WebSocketProvider>
</AuthProvider>

// In any component
function MyComponent() {
  const { connected, subscribe, send } = useWebSocket();

  useEffect(() => {
    const unsubscribe = subscribe('my-event', (data) => {
      console.log('Received:', data);
    });
    return unsubscribe;
  }, [subscribe]);

  return <div>Connected: {connected ? 'Yes' : 'No'}</div>;
}
```

**Context Value:**
```javascript
{
  connected,      // Boolean - connection status
  authenticated,  // Boolean - user authenticated via WebSocket
  subscribe,      // (type, callback) => unsubscribe
  send,          // (message) => boolean (success)
  connect,       // () => void - manual reconnect
  disconnect,    // () => void - manual disconnect
}
```

**Features:**
- Auto-reconnect with exponential backoff (max 30s)
- Heartbeat every 25s to keep connection alive
- Automatic authentication from auth token
- Event subscription/unsubscription pattern

## Protocol

### Connection

1. Client connects to `ws://host/ws` or `wss://host/ws`
2. Server sends `{ type: 'connected', authenticated: bool, userId: number|null }`
3. Client can send `{ type: 'auth', token: 'jwt...' }` to authenticate
4. Server responds with `{ type: 'auth_success', userId }` or `{ type: 'auth_error', error }`

### Message Types

**Client → Server:**
| Type | Description | Payload |
|------|-------------|---------|
| `auth` | Authenticate connection | `{ token: 'jwt...' }` |
| `ping` | Heartbeat ping | (none) |

**Server → Client:**
| Type | Description | Payload |
|------|-------------|---------|
| `connected` | Initial connection | `{ authenticated, userId }` |
| `auth_success` | Authentication successful | `{ userId }` |
| `auth_error` | Authentication failed | `{ error }` |
| `pong` | Heartbeat response | (none) |
| `announcement:push` | Real-time announcement | `{ announcement: {...} }` |

### Heartbeat

- Server pings all clients every 30 seconds
- Clients marked as dead if no pong response
- Client also sends ping every 25 seconds
- Dead connections are terminated and cleaned up

## Adding New Message Types

### Server-side

```javascript
// In your API route or service
import { webSocketServer } from '../websocket/index.js';

// Broadcast to all
webSocketServer.broadcast({
  type: 'playlist:updated',
  playlistId: 123,
  changes: {...}
});

// Send to specific user
webSocketServer.sendToUser(userId, {
  type: 'notification:new',
  notification: {...}
});
```

### Client-side

```javascript
const { subscribe } = useWebSocket();

useEffect(() => {
  const unsubscribe = subscribe('playlist:updated', (data) => {
    // Handle the event
    console.log('Playlist updated:', data.playlistId);
  });

  return unsubscribe;
}, [subscribe]);
```

## Current Integrations

### Announcements

The announcements system uses WebSocket for "Push Now" functionality:

1. Admin clicks "Push Now" on an announcement
2. Server calls `webSocketServer.broadcast()` with announcement data
3. All connected clients receive `announcement:push` event
4. AnnouncementContext adds announcement to display queue

See `docs/features/announcements.md` for details.

## Security

- WebSocket connection inherits same-origin policy
- Authentication via JWT token (query param or message)
- Connections can be anonymous or authenticated
- Server validates tokens using same `verifyToken()` as HTTP routes
- No sensitive data stored in connection state

## Error Handling

- Connection errors trigger automatic reconnect
- Parse errors in messages are logged but don't close connection
- Dead connections detected via heartbeat and cleaned up
- Graceful shutdown sends close frame to all clients

### Development: EPIPE Error Suppression

In development, the Vite dev server proxies `/ws` requests to the backend. When WebSocket connections close (page refresh, tab close, HMR reload), the proxy may attempt to write to a closed socket, causing harmless `EPIPE` errors.

These errors are suppressed via a Vite plugin in `vite.config.js`:

```javascript
function suppressWsErrors() {
  return {
    name: 'suppress-ws-errors',
    configureServer() {
      const originalError = console.error;
      console.error = (...args) => {
        const msg = args[0]?.toString?.() || '';
        if (msg.includes('ws proxy socket error') || msg.includes('EPIPE')) {
          return;
        }
        originalError.apply(console, args);
      };
    },
  };
}
```

This is development-only and does not affect production. The WebSocket reconnection logic works correctly regardless of these errors.

## Files

| File | Purpose |
|------|---------|
| `server/websocket/WebSocketServer.js` | Main server class |
| `server/websocket/connectionManager.js` | Connection tracking |
| `server/websocket/index.js` | Module exports |
| `src/shared/contexts/WebSocketContext.jsx` | React context |

## Dependencies

- `ws` - WebSocket server for Node.js
