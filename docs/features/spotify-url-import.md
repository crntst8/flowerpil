# Spotify URL Import (No Authentication)

## Overview

The Spotify URL import feature allows curators to import public Spotify playlists by simply pasting a URL, without requiring any Spotify authentication. This is achieved by using Flowerpil's application-level client credentials instead of curator OAuth tokens.

## Key Benefits

- **No authentication required** - Curators don't need to connect their Spotify account
- **Preview before importing** - Summary card with track listing shown before confirmation
- **Public playlists only** - Works with any publicly accessible Spotify playlist
- **Full metadata** - Imports tracks with complete metadata and artwork
- **Cross-platform linking** - Automatically triggers track matching across DSPs

## Architecture

### Backend Components

#### 1. SpotifyService Methods
**File:** `server/services/spotifyService.js`

**extractPlaylistId(url)**
- Parses Spotify playlist URLs to extract the playlist ID
- Supports multiple URL formats:
  - `https://open.spotify.com/playlist/{id}`
  - `https://open.spotify.com/playlist/{id}?si=...`
  - `spotify:playlist:{id}`
- Returns playlist ID string or null if invalid

**getPublicPlaylistDetails(playlistId)**
- Fetches public playlist using client credentials token
- Calls `getClientCredentialsToken()` for app-level access
- Returns full playlist details with tracks
- Throws error for private playlists (403)

#### 2. API Endpoint
**File:** `server/api/spotify.js`

**POST /api/v1/spotify/import-url**

Request body:
```json
{
  "url": "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"
}
```

Response (success):
```json
{
  "success": true,
  "data": {
    "spotifyPlaylist": {
      "name": "Today's Top Hits",
      "description": "The biggest songs right now.",
      "image": "https://i.scdn.co/image/...",
      "spotify_url": "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"
    },
    "tracks": [
      {
        "position": 1,
        "title": "Song Title",
        "artist": "Artist Name",
        "album": "Album Name",
        "year": 2025,
        "duration": "3:45",
        "spotify_id": "abc123",
        "isrc": "USRC12345678",
        "explicit": false,
        "artwork_url": "/uploads/artwork-123.jpg",
        "album_artwork_url": "https://i.scdn.co/image/...",
        "preview_url": "https://p.scdn.co/mp3-preview/..."
      }
    ]
  },
  "message": "Successfully processed 50 tracks from \"Today's Top Hits\""
}
```

Response (errors):
```json
// Invalid URL
{
  "success": false,
  "error": "Invalid Spotify playlist URL. Please use a valid URL like: https://open.spotify.com/playlist/..."
}

// Private playlist
{
  "success": false,
  "error": "This playlist is private and cannot be imported. Only public Spotify playlists can be imported via URL."
}

// Not found
{
  "success": false,
  "error": "Spotify playlist not found. Please check the URL and try again."
}
```

### Frontend Integration

Curator UI imports public Spotify playlist URLs via the unified URL import system (`POST /api/v1/url-import/jobs`) under the "Paste URL" tab.

`POST /api/v1/spotify/import-url` remains available for legacy/internal surfaces that still call it.

## User Flow

1. **Curator opens import section** in playlist creator or editor
2. **Clicks "Paste URL" tab**
3. **Pastes Spotify playlist URL** in text area (auto-detected as Spotify)
4. **URL validates automatically** after 500ms pause
5. **Preview shown** - summary card with playlist title, track count, platform icon, and first 10 tracks listed
6. **Curator selects merge mode** (append or replace) and confirms import
7. **Import begins** with progress indicator
8. **Tracks appear** in playlist with full metadata
9. **Cross-linking starts** automatically in background
10. **Result panel** shows added/skipped/unmatched counts

## Progress Tracking

Import progress goes through phases:

1. **Fetching (5-50%)** - Retrieving playlist from Spotify API
2. **Saving (50-85%)** - Processing tracks and artwork
3. **Linking (85-100%)** - Cross-platform track matching

Progress indicator updates:
- CuratorPlaylistCreate: Visual progress bar with phase labels
- CuratorPlaylists: Status messages in feedback area

## Error Handling

### Invalid URL Format
- Detected client-side during validation
- Error message: "Invalid Spotify playlist URL"
- No API call made

### Private Playlist
- Detected by Spotify API (403 Forbidden)
- Error message: "This playlist is private and cannot be imported. Only public Spotify playlists can be imported via URL."
- User must use authenticated import instead

### Playlist Not Found
- Detected by Spotify API (404 Not Found)
- Error message: "Spotify playlist not found. Please check the URL and try again."

### Network/Server Errors
- Generic error handling for timeouts, server errors
- User-friendly fallback message
- Progress state cleaned up

## Client Credentials vs User Authentication

### Client Credentials (This Feature)
- **Authentication**: Flowerpil app credentials only
- **Access**: Public playlists only
- **Token**: Cached app-level token
- **Use case**: Quick imports of public playlists
- **User experience**: No OAuth flow required

### User Authentication (Existing Import)
- **Authentication**: Curator's Spotify account
- **Access**: Public and private playlists
- **Token**: User access token in `export_oauth_tokens`
- **Use case**: Importing curator's own playlists
- **User experience**: Requires OAuth authorization

## Rate Limiting

The Spotify service includes built-in rate limiting:
- **Queue-based**: Requests queued and processed sequentially
- **Throttling**: 8 requests per second (125ms between requests)
- **Retry logic**: Exponential backoff for 429 errors
- **Respects headers**: Uses Retry-After header when provided

## Implementation Files

### Backend
- `server/services/spotifyService.js` - URL parsing and public playlist fetch
- `server/api/spotify.js` - `/import-url` endpoint

### Frontend
- `src/modules/curator/components/CuratorPlaylistCreate.jsx` - Creator UI and logic
- `src/modules/curator/components/CuratorPlaylists.jsx` - Editor UI and logic

## Testing

### Manual Testing
1. Test valid public playlist URL
2. Test invalid URL format
3. Test private playlist URL (should fail gracefully)
4. Test non-existent playlist URL
5. Test with large playlist (100+ tracks)
6. Test preview card and track listing display
7. Test merge mode selection (append vs replace)
8. Test progress tracking
9. Test cross-linking trigger
10. Test result panel (added/skipped/unmatched counts)

### Edge Cases
- Empty playlists (0 tracks)
- Very large playlists (1000+ tracks)
- Playlists with local files (filtered out)
- Playlists with deleted tracks (handled)
- Network timeouts (error handling)
- Concurrent imports (queue system)

## Future Enhancements

Potential improvements:
- Support for album URLs
- Support for track URLs (create single-track playlist)
- Batch URL import (multiple playlists at once)
- Option to skip cross-linking for faster imports
