"""YouTube Music playlist operations."""

from .auth import get_ytmusic_client, get_unauthenticated_client
from .search import search_track
from utils.url_parser import parse_youtube_music_url
from utils.matching import get_best_thumbnail, get_artist_names


def get_user_playlists(oauth_json):
    """
    Get user's library playlists.

    Args:
        oauth_json: OAuth JSON for authentication

    Returns:
        List of playlist dicts with id, title, trackCount, thumbnail
    """
    ytmusic = get_ytmusic_client(oauth_json)

    try:
        playlists = ytmusic.get_library_playlists(limit=100)
    except Exception as e:
        raise Exception(f'Failed to get playlists: {str(e)}')

    return [
        {
            'id': p.get('playlistId'),
            'title': p.get('title', 'Untitled'),
            'trackCount': p.get('count', 0),
            'thumbnail': get_best_thumbnail(p.get('thumbnails', []))
        }
        for p in playlists if p.get('playlistId')
    ]


def get_playlist_tracks(playlist_id, oauth_json=None):
    """
    Get tracks from a playlist.

    Args:
        playlist_id: YouTube Music playlist ID
        oauth_json: Optional OAuth JSON (needed for private playlists)

    Returns:
        Dict with playlist info and tracks list
    """
    if oauth_json:
        ytmusic = get_ytmusic_client(oauth_json)
    else:
        ytmusic = get_unauthenticated_client()

    try:
        playlist = ytmusic.get_playlist(playlist_id, limit=None)
    except Exception as e:
        raise Exception(f'Failed to get playlist: {str(e)}')

    tracks = []
    for i, item in enumerate(playlist.get('tracks', [])):
        # Skip unavailable tracks
        if not item.get('videoId'):
            continue

        # Get duration in milliseconds
        duration_seconds = item.get('duration_seconds', 0)
        if not duration_seconds and item.get('duration'):
            # Parse duration string like "3:45"
            parts = item['duration'].split(':')
            if len(parts) == 2:
                duration_seconds = int(parts[0]) * 60 + int(parts[1])
            elif len(parts) == 3:
                duration_seconds = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])

        track = {
            'position': i + 1,
            'title': item.get('title', ''),
            'artist': get_artist_names(item.get('artists', [])),
            'album': item.get('album', {}).get('name', '') if item.get('album') else '',
            'duration': item.get('duration', ''),
            'duration_ms': duration_seconds * 1000,
            'youtube_music_id': item.get('videoId'),
            'isrc': None,  # Not available in public API
            'artwork_url': get_best_thumbnail(item.get('thumbnails', []))
        }
        tracks.append(track)

    return {
        'playlist': {
            'id': playlist_id,
            'title': playlist.get('title', 'YouTube Music Playlist'),
            'description': playlist.get('description', ''),
            'image': get_best_thumbnail(playlist.get('thumbnails', [])),
            'trackCount': len(tracks),
            'author': playlist.get('author', {}).get('name', '')
        },
        'tracks': tracks
    }


def import_playlist_by_url(url):
    """
    Import playlist from a YouTube Music URL (unauthenticated).

    Args:
        url: YouTube Music playlist URL

    Returns:
        Dict with playlist info and tracks
    """
    parsed = parse_youtube_music_url(url)
    if not parsed:
        raise ValueError('Invalid YouTube Music URL')

    return get_playlist_tracks(parsed['id'])


def create_playlist(oauth_json, playlist_data, tracks):
    """
    Create a new playlist and add tracks.

    Args:
        oauth_json: OAuth JSON for authentication
        playlist_data: Dict with 'title', 'description', 'isPublic'
        tracks: List of track dicts with 'youtube_music_id' or search metadata

    Returns:
        Dict with playlistId, playlistUrl, tracksAdded, totalTracks
    """
    ytmusic = get_ytmusic_client(oauth_json)

    # Create the playlist
    title = playlist_data.get('title', 'Flowerpil Export')
    description = playlist_data.get('description', '')
    if description:
        description = f'{description}\n\nExported from Flowerpil'
    else:
        description = 'Exported from Flowerpil'

    is_public = playlist_data.get('isPublic', True)
    privacy_status = 'PUBLIC' if is_public else 'PRIVATE'

    try:
        playlist_id = ytmusic.create_playlist(
            title=title,
            description=description,
            privacy_status=privacy_status
        )
    except Exception as e:
        raise Exception(f'Failed to create playlist: {str(e)}')

    # Collect video IDs for tracks
    video_ids = []
    failed_tracks = []

    for i, track in enumerate(tracks):
        # Use existing YouTube Music ID if available
        if track.get('youtube_music_id'):
            video_ids.append(track['youtube_music_id'])
            continue

        # Search for the track
        search_result = search_track({
            'artist': track.get('artist', ''),
            'title': track.get('title', ''),
            'album': track.get('album', ''),
            'duration_ms': track.get('duration_ms', 0),
            'isrc': track.get('isrc')
        }, oauth_json)

        if search_result.get('videoId'):
            video_ids.append(search_result['videoId'])
        else:
            failed_tracks.append({
                'index': i,
                'artist': track.get('artist', ''),
                'title': track.get('title', '')
            })

    # Add tracks to playlist in batches (YouTube Music limits batch size)
    batch_size = 25
    added_count = 0

    for i in range(0, len(video_ids), batch_size):
        batch = video_ids[i:i + batch_size]
        try:
            ytmusic.add_playlist_items(playlist_id, batch)
            added_count += len(batch)
        except Exception as e:
            # Log but continue with remaining batches
            print(f'Warning: Failed to add batch {i // batch_size}: {str(e)}')

    return {
        'success': True,
        'playlistId': playlist_id,
        'playlistUrl': f'https://music.youtube.com/playlist?list={playlist_id}',
        'tracksAdded': added_count,
        'totalTracks': len(tracks),
        'failedTracks': failed_tracks
    }


def add_tracks_to_playlist(oauth_json, playlist_id, tracks):
    """
    Add tracks to an existing playlist.

    Args:
        oauth_json: OAuth JSON for authentication
        playlist_id: Target playlist ID
        tracks: List of track dicts with 'youtube_music_id' or search metadata

    Returns:
        Dict with tracksAdded count
    """
    ytmusic = get_ytmusic_client(oauth_json)

    video_ids = []
    for track in tracks:
        if track.get('youtube_music_id'):
            video_ids.append(track['youtube_music_id'])
        else:
            search_result = search_track({
                'artist': track.get('artist', ''),
                'title': track.get('title', ''),
                'album': track.get('album', ''),
                'duration_ms': track.get('duration_ms', 0)
            }, oauth_json)
            if search_result.get('videoId'):
                video_ids.append(search_result['videoId'])

    if video_ids:
        try:
            ytmusic.add_playlist_items(playlist_id, video_ids)
        except Exception as e:
            raise Exception(f'Failed to add tracks: {str(e)}')

    return {'tracksAdded': len(video_ids)}
