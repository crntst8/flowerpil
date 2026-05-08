"""YouTube Music track search and matching."""

from .auth import get_unauthenticated_client, get_ytmusic_client
from utils.matching import (
    calculate_match_score,
    is_good_match,
    get_artist_names,
    normalize_string
)


def search_track(query_data, oauth_json=None):
    """
    Search for a track by ISRC or metadata.

    Args:
        query_data: Dict with 'isrc', 'artist', 'title', 'album', 'duration_ms'
        oauth_json: Optional OAuth JSON for authenticated search

    Returns:
        Dict with videoId, confidence, source, title, artist or None
    """
    if oauth_json:
        ytmusic = get_ytmusic_client(oauth_json)
    else:
        ytmusic = get_unauthenticated_client()

    # Try ISRC search first (YouTube Music doesn't officially support ISRC,
    # but sometimes includes it in metadata that the search might match)
    isrc = query_data.get('isrc')
    if isrc:
        try:
            results = ytmusic.search(isrc, filter='songs', limit=5)
            for result in results:
                if is_good_match(result, query_data, threshold=75):
                    return {
                        'videoId': result.get('videoId'),
                        'confidence': 95,
                        'source': 'isrc_search',
                        'title': result.get('title', ''),
                        'artist': get_artist_names(result.get('artists', [])),
                        'album': result.get('album', {}).get('name', '') if result.get('album') else ''
                    }
        except Exception:
            pass  # Fall through to metadata search

    # Metadata search
    artist = query_data.get('artist', '')
    title = query_data.get('title', '')

    if not artist and not title:
        return {'videoId': None, 'confidence': 0}

    query = f'{artist} {title}'.strip()

    try:
        results = ytmusic.search(query, filter='songs', limit=10)
    except Exception as e:
        return {'videoId': None, 'confidence': 0, 'error': str(e)}

    if not results:
        return {'videoId': None, 'confidence': 0}

    # Score all candidates
    best_match = None
    best_score = 0

    for result in results:
        score = calculate_match_score(result, query_data)
        if score > best_score:
            best_score = score
            best_match = result

    if best_match and best_score >= 70:
        return {
            'videoId': best_match.get('videoId'),
            'confidence': min(best_score, 100),
            'source': 'metadata_search',
            'title': best_match.get('title', ''),
            'artist': get_artist_names(best_match.get('artists', [])),
            'album': best_match.get('album', {}).get('name', '') if best_match.get('album') else ''
        }

    return {'videoId': None, 'confidence': 0}


def search_tracks_batch(tracks, oauth_json=None):
    """
    Search for multiple tracks.

    Args:
        tracks: List of track dicts with 'isrc', 'artist', 'title', 'album', 'duration_ms'
        oauth_json: Optional OAuth JSON

    Returns:
        List of search results matching input order
    """
    results = []

    for track in tracks:
        try:
            result = search_track(track, oauth_json)
            result['input_index'] = tracks.index(track)
            results.append(result)
        except Exception as e:
            results.append({
                'videoId': None,
                'confidence': 0,
                'error': str(e),
                'input_index': tracks.index(track)
            })

    return results


def search_by_video_id(video_id, oauth_json=None):
    """
    Get track details by video ID.

    Args:
        video_id: YouTube Music video ID
        oauth_json: Optional OAuth JSON

    Returns:
        Track details dict or None
    """
    if oauth_json:
        ytmusic = get_ytmusic_client(oauth_json)
    else:
        ytmusic = get_unauthenticated_client()

    try:
        song = ytmusic.get_song(video_id)
        if not song:
            return None

        video_details = song.get('videoDetails', {})

        return {
            'videoId': video_id,
            'title': video_details.get('title', ''),
            'artist': video_details.get('author', ''),
            'duration_seconds': int(video_details.get('lengthSeconds', 0)),
            'thumbnail': video_details.get('thumbnail', {}).get('thumbnails', [{}])[-1].get('url')
        }
    except Exception:
        return None
