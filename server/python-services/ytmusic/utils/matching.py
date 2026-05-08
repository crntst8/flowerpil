"""Track matching and confidence scoring utilities."""

import re
import unicodedata


def normalize_string(s):
    """Normalize string for comparison."""
    if not s:
        return ''
    # Convert to lowercase
    s = s.lower()
    # Remove accents/diacritics
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    # Remove common suffixes/prefixes
    s = re.sub(r'\s*[\(\[].*(remaster|remix|live|version|edit|radio|extended|original|feat\.|ft\.).*[\)\]]', '', s, flags=re.IGNORECASE)
    # Remove punctuation and extra whitespace
    s = re.sub(r'[^\w\s]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def get_shared_words(s1, s2):
    """Get set of shared words between two strings."""
    words1 = set(normalize_string(s1).split())
    words2 = set(normalize_string(s2).split())
    return words1 & words2


def calculate_title_score(result_title, query_title):
    """Calculate title match score (0-40 points)."""
    norm_result = normalize_string(result_title)
    norm_query = normalize_string(query_title)

    if norm_result == norm_query:
        return 40

    shared = get_shared_words(result_title, query_title)
    query_words = set(normalize_string(query_title).split())

    if not query_words:
        return 0

    ratio = len(shared) / len(query_words)
    return int(ratio * 35)


def calculate_artist_score(result_artists, query_artist):
    """Calculate artist match score (0-35 points)."""
    if not result_artists:
        return 0

    # Combine all result artists
    result_combined = ' '.join([a.get('name', '') for a in result_artists])

    norm_result = normalize_string(result_combined)
    norm_query = normalize_string(query_artist)

    if norm_result == norm_query or norm_query in norm_result:
        return 35

    shared = get_shared_words(result_combined, query_artist)
    query_words = set(normalize_string(query_artist).split())

    if not query_words:
        return 0

    ratio = len(shared) / len(query_words)
    return int(ratio * 30)


def calculate_album_score(result_album, query_album):
    """Calculate album match score (0-15 points)."""
    if not result_album or not query_album:
        return 0

    norm_result = normalize_string(result_album)
    norm_query = normalize_string(query_album)

    if norm_result == norm_query:
        return 15

    shared = get_shared_words(result_album, query_album)
    query_words = set(normalize_string(query_album).split())

    if not query_words:
        return 0

    ratio = len(shared) / len(query_words)
    return int(ratio * 12)


def calculate_duration_score(result_duration_ms, query_duration_ms, tolerance_ms=5000):
    """Calculate duration match score (0-10 points)."""
    if not result_duration_ms or not query_duration_ms:
        return 0

    # Ensure both values are integers (may come as strings from JSON)
    try:
        result_ms = int(result_duration_ms)
        query_ms = int(query_duration_ms)
    except (ValueError, TypeError):
        return 0

    diff = abs(result_ms - query_ms)

    if diff <= tolerance_ms:
        return 10
    elif diff <= tolerance_ms * 2:
        return 7
    elif diff <= tolerance_ms * 4:
        return 4
    else:
        return 0


def calculate_match_score(result, query_data):
    """
    Calculate overall match score for a search result.

    Args:
        result: YouTube Music search result dict
        query_data: Dict with 'artist', 'title', 'album', 'duration_ms' keys

    Returns:
        int: Score from 0-100
    """
    title_score = calculate_title_score(
        result.get('title', ''),
        query_data.get('title', '')
    )

    artist_score = calculate_artist_score(
        result.get('artists', []),
        query_data.get('artist', '')
    )

    album_name = ''
    if result.get('album'):
        album_name = result['album'].get('name', '') if isinstance(result['album'], dict) else result['album']

    album_score = calculate_album_score(
        album_name,
        query_data.get('album', '')
    )

    # Convert duration from seconds to ms if needed
    result_duration_ms = result.get('duration_seconds', 0) * 1000
    duration_score = calculate_duration_score(
        result_duration_ms,
        query_data.get('duration_ms', 0)
    )

    return title_score + artist_score + album_score + duration_score


def is_good_match(result, query_data, threshold=70):
    """Check if a result is a good match based on metadata."""
    return calculate_match_score(result, query_data) >= threshold


def get_artist_names(artists):
    """Extract artist names from artists list."""
    if not artists:
        return ''
    return ', '.join([a.get('name', '') for a in artists if a.get('name')])


def get_best_thumbnail(thumbnails):
    """Get the best quality thumbnail URL from a list."""
    if not thumbnails:
        return None

    # Sort by width (larger = better)
    sorted_thumbs = sorted(
        thumbnails,
        key=lambda t: t.get('width', 0) * t.get('height', 0),
        reverse=True
    )

    return sorted_thumbs[0].get('url') if sorted_thumbs else None
