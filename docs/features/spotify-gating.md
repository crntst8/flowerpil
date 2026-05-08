# Spotify OAuth Gating

## Overview

Due to Spotify's API limitations (25 user limit for development apps), direct OAuth access to curator Spotify accounts is restricted. This document describes the gating system that controls who can use their own Spotify/YouTube accounts vs the Flowerpil shared accounts.

## How It Works

### Default Behavior (Non-Approved Curators)

- **Import**: Curators paste public Spotify playlist URLs to import tracks (no OAuth required)
- **Export**: Playlists are exported to Spotify via the Flowerpil account
- **No OAuth prompt**: Curators are not prompted to connect their Spotify account

### Approved Curators

Admins can grant specific curators full OAuth access, which enables:
- **Library Import**: Browse and import from their own Spotify library
- **Direct Export**: Export playlists directly to their own Spotify account
- **Account Selection**: Choose between Flowerpil or personal account for exports

## Database Schema

Two columns on the `curators` table control OAuth access:

```sql
spotify_oauth_approved  INTEGER DEFAULT 0  -- 0=restricted, 1=approved
youtube_oauth_approved  INTEGER DEFAULT 0  -- 0=restricted, 1=approved
```

### Migration

Migration `092_dsp_oauth_gating.js` adds these columns and auto-grandfathers existing curators who already have active OAuth tokens.

## Admin Controls

Admins can toggle OAuth access for individual curators via:

**Location**: Site Admin > Curators > [Curator Name] > Edit

**Fields**:
- **Spotify OAuth Access**: Restricted / Approved
- **YouTube OAuth Access**: Restricted / Approved

## API Endpoints

### Check Approval Status

```
GET /api/v1/curator/oauth-approval-status
```

Returns:
```json
{
  "success": true,
  "data": {
    "spotify_oauth_approved": false,
    "youtube_oauth_approved": false
  }
}
```

Used by frontend components to conditionally show OAuth options.

## Affected Components

### Onboarding (`CuratorSignupDSPStep.jsx`)
- Removed Spotify email collection step
- All platforms now show "Connect after signup" hint

### First Visit Modal (`FirstVisitDSPModal.jsx`)
- "Login to connect" section shows only TIDAL and Apple Music
- Spotify/YouTube listed under "Paste URLs from"
- Info box explains Flowerpil account usage for Spotify/YouTube

### Import Modal (`ImportModal.jsx`)
- Checks `oauth-approval-status` on mount
- For non-approved Spotify: Shows URL input (paste-only mode)
- For approved Spotify: Shows library browser with playlist selection

### Export UI (`CuratorPlaylistCreate.jsx`)
- For non-approved Spotify/YouTube:
  - Hides "My Account" button
  - Shows "Exporting via Flowerpil account"
  - Displays API limitation note
- For approved curators: Shows full account type selector

## User-Facing Messages

### Export Stage (Non-Approved)
```
Due to API limitations, direct account access is restricted.
Contact dev@flowerpil.com to request access.
```

### First Visit Modal
```
Note: Spotify and YouTube exports always use our Flowerpil accounts due to API limitations.
```

## Granting Access

To grant a curator Spotify OAuth access:

1. Add their email to the Spotify Developer Dashboard
2. Go to Site Admin > Curators > [Curator]
3. Set "Spotify OAuth Access" to "Approved"
4. Curator can now connect their account in DSP settings

## Technical Notes

- Existing curators with active tokens were auto-grandfathered during migration
- The gating is enforced at the UI level; backend endpoints still function for approved users
- YouTube follows the same pattern as Spotify
- Apple Music and TIDAL are not gated (no API user limits)
