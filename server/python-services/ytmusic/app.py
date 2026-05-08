"""
YouTube Music API Microservice for Flowerpil.

Flask application that wraps ytmusicapi for use by the Node.js backend.
Provides OAuth device flow, playlist operations, and track search.
"""

import os
import json
import logging
from functools import wraps
from flask import Flask, request, jsonify

from services.auth import (
    start_device_flow,
    poll_for_token,
    refresh_token as refresh_oauth_token,
    get_ytmusic_client
)
from services.search import search_track, search_tracks_batch
from services.playlist import (
    get_user_playlists,
    get_playlist_tracks,
    import_playlist_by_url,
    create_playlist,
    add_tracks_to_playlist
)
from utils.url_parser import is_youtube_music_url

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)


def get_oauth_from_request():
    """Extract OAuth JSON from request header."""
    oauth_header = request.headers.get('X-OAuth-Token')
    if not oauth_header:
        return None
    return oauth_header


def require_auth(f):
    """Decorator to require OAuth authentication."""
    @wraps(f)
    def decorated(*args, **kwargs):
        oauth_json = get_oauth_from_request()
        if not oauth_json:
            return jsonify({'error': 'Authentication required', 'code': 'AUTH_REQUIRED'}), 401
        return f(oauth_json, *args, **kwargs)
    return decorated


def handle_errors(f):
    """Decorator to handle exceptions and return JSON errors."""
    @wraps(f)
    def decorated(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except ValueError as e:
            logger.warning(f'Validation error: {str(e)}')
            return jsonify({'error': str(e)}), 400
        except Exception as e:
            logger.error(f'Internal error: {str(e)}', exc_info=True)
            return jsonify({'error': str(e)}), 500
    return decorated


# Health check
@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'service': 'ytmusic',
        'version': '1.0.0'
    })


# Authentication endpoints
@app.route('/auth/device-code', methods=['POST'])
@handle_errors
def device_code():
    """Start OAuth device flow."""
    result = start_device_flow()
    logger.info(f'Started device flow, user_code: {result.get("user_code")}')
    return jsonify(result)


@app.route('/auth/poll', methods=['POST'])
@handle_errors
def poll():
    """Poll for OAuth token completion."""
    data = request.json or {}
    device_code = data.get('device_code')

    if not device_code:
        return jsonify({'error': 'device_code required'}), 400

    result = poll_for_token(device_code)

    if result.get('status') == 'success':
        logger.info('Device auth completed successfully')

    return jsonify(result)


@app.route('/auth/refresh', methods=['POST'])
@handle_errors
def refresh():
    """Refresh an OAuth token."""
    oauth_json = get_oauth_from_request()
    if not oauth_json:
        return jsonify({'error': 'OAuth token required'}), 400

    result = refresh_oauth_token(oauth_json)
    return jsonify({
        'success': True,
        'oauth_data': result
    })


@app.route('/auth/validate', methods=['POST'])
@handle_errors
def validate():
    """Validate an OAuth token by making a test request."""
    oauth_json = get_oauth_from_request()
    if not oauth_json:
        return jsonify({'valid': False, 'error': 'No token provided'})

    try:
        ytmusic = get_ytmusic_client(oauth_json)
        # Try to get account info as validation
        account = ytmusic.get_account_info()
        return jsonify({
            'valid': True,
            'account': {
                'name': account.get('accountName', ''),
                'channelHandle': account.get('channelHandle', '')
            }
        })
    except Exception as e:
        return jsonify({'valid': False, 'error': str(e)})


# Playlist endpoints
@app.route('/playlists', methods=['GET'])
@require_auth
@handle_errors
def list_playlists(oauth_json):
    """List user's library playlists."""
    playlists = get_user_playlists(oauth_json)
    return jsonify({'playlists': playlists})


@app.route('/playlist/<playlist_id>', methods=['GET'])
@handle_errors
def get_playlist(playlist_id):
    """Get playlist tracks by ID."""
    oauth_json = get_oauth_from_request()  # Optional for public playlists
    result = get_playlist_tracks(playlist_id, oauth_json)
    return jsonify(result)


@app.route('/playlist/import-url', methods=['POST'])
@handle_errors
def import_url():
    """Import playlist from YouTube Music URL."""
    data = request.json or {}
    url = data.get('url')

    if not url:
        return jsonify({'error': 'URL required'}), 400

    if not is_youtube_music_url(url):
        return jsonify({'error': 'Invalid YouTube Music URL'}), 400

    result = import_playlist_by_url(url)
    return jsonify(result)


@app.route('/playlist/create', methods=['POST'])
@require_auth
@handle_errors
def create_new_playlist(oauth_json):
    """Create a new playlist and add tracks."""
    data = request.json or {}
    playlist_data = data.get('playlist', {})
    tracks = data.get('tracks', [])

    if not playlist_data.get('title'):
        return jsonify({'error': 'Playlist title required'}), 400

    result = create_playlist(oauth_json, playlist_data, tracks)
    return jsonify(result)


@app.route('/playlist/<playlist_id>/tracks', methods=['POST'])
@require_auth
@handle_errors
def add_playlist_tracks(oauth_json, playlist_id):
    """Add tracks to an existing playlist."""
    data = request.json or {}
    tracks = data.get('tracks', [])

    if not tracks:
        return jsonify({'error': 'No tracks provided'}), 400

    result = add_tracks_to_playlist(oauth_json, playlist_id, tracks)
    return jsonify(result)


# Search endpoints
@app.route('/search/track', methods=['POST'])
@handle_errors
def search_single_track():
    """Search for a track by ISRC or metadata."""
    data = request.json or {}
    oauth_json = get_oauth_from_request()  # Optional

    if not data.get('artist') and not data.get('title') and not data.get('isrc'):
        return jsonify({'error': 'At least one of artist, title, or isrc required'}), 400

    result = search_track(data, oauth_json)
    return jsonify(result)


@app.route('/search/batch', methods=['POST'])
@handle_errors
def search_batch():
    """Search for multiple tracks."""
    data = request.json or {}
    tracks = data.get('tracks', [])
    oauth_json = get_oauth_from_request()  # Optional

    if not tracks:
        return jsonify({'error': 'No tracks provided'}), 400

    results = search_tracks_batch(tracks, oauth_json)
    return jsonify({'results': results})


# Error handlers
@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Not found'}), 404


@app.errorhandler(500)
def internal_error(e):
    logger.error(f'Internal server error: {str(e)}', exc_info=True)
    return jsonify({'error': 'Internal server error'}), 500


if __name__ == '__main__':
    port = int(os.environ.get('YTMUSIC_SERVICE_PORT', 3001))
    debug = os.environ.get('FLASK_ENV') == 'development'

    logger.info(f'Starting YouTube Music service on port {port}')
    app.run(host='127.0.0.1', port=port, debug=debug)
