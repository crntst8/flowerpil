/**
 * Launches the YouTube Music OAuth flow and opens a popup.
 * The caller can optionally receive the state value via onPendingState to track callbacks.
 */
export async function launchYouTubeMusicOAuth({ fetcher = fetch, onPendingState } = {}) {
  let response;
  let payload = {};

  try {
    response = await fetcher('/api/v1/export/auth/youtube_music/url', {
      method: 'GET',
      credentials: 'include'
    });
    payload = await response.json().catch(() => ({}));
  } catch (err) {
    throw new Error(err?.message || 'Failed to start YouTube Music authentication');
  }

  if (!response?.ok || !payload?.success || !payload?.data?.authUrl) {
    throw new Error(payload?.error || 'Failed to start YouTube Music authentication');
  }

  const { authUrl, state } = payload.data;

  if (state && typeof onPendingState === 'function') {
    onPendingState(state);
  }

  const popup = window.open(
    authUrl,
    'youtube-music-oauth',
    'width=600,height=700,scrollbars=yes,resizable=yes'
  );

  if (!popup || popup.closed || typeof popup.closed === 'undefined') {
    window.location.href = authUrl;
  }

  return { authUrl, state };
}
