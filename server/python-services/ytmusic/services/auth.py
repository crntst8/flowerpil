"""YouTube Music OAuth device flow authentication."""

import os
import json
import time
import requests
from ytmusicapi import YTMusic
from ytmusicapi.auth.oauth import OAuthCredentials


# Google OAuth endpoints
DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code'
TOKEN_URL = 'https://oauth2.googleapis.com/token'

# Scopes required for YouTube Music
SCOPES = 'https://www.googleapis.com/auth/youtube'


def get_oauth_credentials():
    """Get OAuth credentials from environment."""
    client_id = os.environ.get('YOUTUBE_CLIENT_ID')
    client_secret = os.environ.get('YOUTUBE_CLIENT_SECRET')

    if not client_id or not client_secret:
        raise ValueError('YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET must be set')

    return client_id, client_secret


def start_device_flow():
    """
    Start the OAuth device authorization flow.

    Returns:
        dict with device_code, user_code, verification_url, expires_in, interval
    """
    client_id, _ = get_oauth_credentials()

    response = requests.post(DEVICE_CODE_URL, data={
        'client_id': client_id,
        'scope': SCOPES
    })

    if response.status_code != 200:
        raise Exception(f'Failed to start device flow: {response.text}')

    data = response.json()

    return {
        'device_code': data['device_code'],
        'user_code': data['user_code'],
        'verification_url': data['verification_url'],
        'expires_in': data['expires_in'],
        'interval': data.get('interval', 5)
    }


def poll_for_token(device_code):
    """
    Poll for the token after user enters the code.

    Args:
        device_code: The device code from start_device_flow

    Returns:
        dict with status ('pending', 'success', 'error') and oauth_data on success
    """
    client_id, client_secret = get_oauth_credentials()

    response = requests.post(TOKEN_URL, data={
        'client_id': client_id,
        'client_secret': client_secret,
        'device_code': device_code,
        'grant_type': 'urn:ietf:params:oauth:grant-type:device_code'
    })

    data = response.json()

    if 'error' in data:
        error = data['error']
        if error == 'authorization_pending':
            return {'status': 'pending'}
        elif error == 'slow_down':
            return {'status': 'pending', 'slow_down': True}
        elif error == 'expired_token':
            return {'status': 'error', 'error': 'Device code expired'}
        elif error == 'access_denied':
            return {'status': 'error', 'error': 'Access denied by user'}
        else:
            return {'status': 'error', 'error': data.get('error_description', error)}

    # Success - build oauth JSON for ytmusicapi
    oauth_data = {
        'access_token': data['access_token'],
        'refresh_token': data.get('refresh_token'),
        'token_type': data.get('token_type', 'Bearer'),
        'expires_in': data.get('expires_in', 3600),
        'expires_at': int(time.time()) + data.get('expires_in', 3600),
        'scope': data.get('scope', SCOPES)
    }

    return {
        'status': 'success',
        'oauth_data': oauth_data
    }


def refresh_token(oauth_json):
    """
    Refresh an expired access token.

    Args:
        oauth_json: The stored OAuth JSON (as string or dict)

    Returns:
        Updated oauth_data dict
    """
    client_id, client_secret = get_oauth_credentials()

    if isinstance(oauth_json, str):
        oauth_data = json.loads(oauth_json)
    else:
        oauth_data = oauth_json

    refresh_token_value = oauth_data.get('refresh_token')
    if not refresh_token_value:
        raise ValueError('No refresh token available')

    response = requests.post(TOKEN_URL, data={
        'client_id': client_id,
        'client_secret': client_secret,
        'refresh_token': refresh_token_value,
        'grant_type': 'refresh_token'
    })

    if response.status_code != 200:
        raise Exception(f'Failed to refresh token: {response.text}')

    data = response.json()

    # Update oauth data with new access token
    oauth_data['access_token'] = data['access_token']
    oauth_data['expires_in'] = data.get('expires_in', 3600)
    oauth_data['expires_at'] = int(time.time()) + data.get('expires_in', 3600)

    # Refresh token may be rotated
    if 'refresh_token' in data:
        oauth_data['refresh_token'] = data['refresh_token']

    return oauth_data


def get_ytmusic_client(oauth_json):
    """
    Create an authenticated YTMusic client.

    Args:
        oauth_json: OAuth JSON string or dict

    Returns:
        Authenticated YTMusic instance
    """
    client_id, client_secret = get_oauth_credentials()

    if isinstance(oauth_json, str):
        oauth_data = json.loads(oauth_json)
    else:
        oauth_data = oauth_json

    # Check if token needs refresh
    expires_at = oauth_data.get('expires_at', 0)
    if expires_at and time.time() > expires_at - 300:  # 5 min buffer
        oauth_data = refresh_token(oauth_data)

    # Create YTMusic with OAuth credentials
    return YTMusic(
        auth=json.dumps(oauth_data) if isinstance(oauth_data, dict) else oauth_data,
        oauth_credentials=OAuthCredentials(
            client_id=client_id,
            client_secret=client_secret
        )
    )


def get_unauthenticated_client():
    """Create an unauthenticated YTMusic client for public operations."""
    return YTMusic()
