"""YouTube Music URL parsing utilities."""

import re
from urllib.parse import urlparse, parse_qs


def parse_youtube_music_url(url):
    """
    Parse YouTube Music playlist URLs.

    Supports:
    - https://music.youtube.com/playlist?list=PLxxxxxx
    - https://www.youtube.com/playlist?list=PLxxxxxx
    - https://music.youtube.com/browse/VLxxxxxx (video list)

    Returns:
        dict with 'type' and 'id' keys, or None if invalid
    """
    if not url:
        return None

    try:
        parsed = urlparse(url)
    except Exception:
        return None

    # Must be YouTube domain
    if not any(domain in parsed.netloc for domain in ['youtube.com', 'youtu.be']):
        return None

    # Check for playlist parameter
    query_params = parse_qs(parsed.query)
    if 'list' in query_params:
        playlist_id = query_params['list'][0]
        return {'type': 'playlist', 'id': playlist_id}

    # Check for browse path (VL prefix = Video List)
    browse_match = re.search(r'/browse/(VL[A-Za-z0-9_-]+)', parsed.path)
    if browse_match:
        return {'type': 'playlist', 'id': browse_match.group(1)}

    # Check for direct playlist path
    playlist_match = re.search(r'/playlist/([A-Za-z0-9_-]+)', parsed.path)
    if playlist_match:
        return {'type': 'playlist', 'id': playlist_match.group(1)}

    return None


def is_youtube_music_url(url):
    """Check if URL is a valid YouTube Music URL."""
    return parse_youtube_music_url(url) is not None
