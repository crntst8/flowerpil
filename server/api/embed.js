import express from 'express';
import fetch from 'node-fetch'; // Ensure node-fetch is available or use global if Node 18+

const router = express.Router();

const defaults = {
  bg: '#dbdbda',
  text: '#000000',
  accent: '#438eff',
  font: 'helvetica',
  variant: 'large' // 'large' (desktop/wide) or 'small' (mobile/compact)
};

const resolveApiBase = (req) => {
  const host = req.get('host') || 'localhost:3000';
  const forwarded = req.headers['x-forwarded-proto'];
  const forwardedProto = Array.isArray(forwarded)
    ? forwarded[0]
    : (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '');
  const proto = forwardedProto || req.protocol;
  const isLocalhost = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
  const protocol = isLocalhost ? 'http' : proto;
  return `${protocol}://${host}`;
};

const escHtml = (s) => String(s || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const getFontStack = (font) => {
  return font === 'PaperMono'
    ? "'Paper Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"
    : "'Helvetica Neue', Helvetica, Arial, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
};

const normalizeHex = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('#')) return null;
  const hex = trimmed.slice(1);
  if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex)) return null;
  if (hex.length === 3) {
    return hex.split('').map((ch) => ch + ch).join('');
  }
  return hex;
};

const hexToRgba = (value, alpha) => {
  const hex = normalizeHex(value);
  if (!hex) return null;
  const intVal = Number.parseInt(hex, 16);
  const r = (intVal >> 16) & 255;
  const g = (intVal >> 8) & 255;
  const b = intVal & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const parseCustomSources = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
};

const getPlatformIconPath = (platformName) => {
  if (!platformName) return '/assets/playlist-actions/website.png';
  const normalized = String(platformName).toLowerCase().trim();
  const platformMap = {
    youtube: 'youtube',
    spotify: 'spotify',
    'apple music': 'apple',
    apple: 'apple',
    tidal: 'tidal',
    bandcamp: 'bandcamp',
    soundcloud: 'soundcloud',
    mixcloud: 'mixcloud',
    discord: 'discord',
    instagram: 'instagram',
    tiktok: 'tiktok',
    reddit: 'reddit'
  };
  const iconName = platformMap[normalized];
  return iconName
    ? `/assets/playlist-actions/${iconName}.png`
    : '/assets/playlist-actions/website.png';
};

const generateCss = (options) => {
  const { bg, text, accent, font, variant } = options;
  const fontStack = getFontStack(font);
  const accentWash = hexToRgba(accent, 0.2) || 'rgba(67, 142, 255, 0.2)';

  return `
    :root {
      --fp-bg: ${escHtml(bg)};
      --fp-text: ${escHtml(text)};
      --fp-accent: ${escHtml(accent)};
      --fp-border: ${escHtml(text)};
      --fp-accent-wash: ${accentWash};
    }
    * { box-sizing: border-box; }
    body { 
      margin: 0; 
      padding: 0;
      background: var(--fp-bg); 
      color: var(--fp-text); 
      font-family: ${fontStack};
      font-size: 14px;
      line-height: 1.5;
      overflow: hidden; 
    }
    
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.3); border-radius: 3px; }
    
    .container {
      display: flex;
      flex-direction: column;
      height: 100vh;
      width: 100%;
      background: var(--fp-bg);
    }

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--fp-border);
      background: var(--fp-bg);
      flex-shrink: 0;
    }
    .logo-area { display: flex; align-items: center; gap: 8px; }
    .logo { height: 20px; width: auto; opacity: 0.9; }
    .header-title { 
      font-size: 12px; 
      font-weight: 700; 
      text-transform: uppercase; 
      letter-spacing: 0.05em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 200px;
    }
    .cta {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      text-decoration: none;
      color: var(--fp-text);
      opacity: 0.8;
      border-bottom: 1px dashed var(--fp-border);
      padding-bottom: 1px;
    }
    .cta:hover { opacity: 1; border-bottom-style: solid; }

    /* Track List / Content */
    .content {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px 16px;
    }

    /* Track Item */
    .track {
      border: 1px solid var(--fp-border);
      background: var(--fp-bg);
      display: flex;
      flex-direction: column;
      margin-bottom: 8px;
    }
    .track:last-child { margin-bottom: 0; }

    .track-main {
      display: flex;
      align-items: center;
      padding: 12px;
      gap: 16px;
      position: relative;
    }
    .track-main:hover {
      background: var(--fp-accent-wash);
    }
    
    .artwork {
      width: 100px;
      height: 100px;
      background: rgba(0, 0, 0, 0.2);
      flex-shrink: 0;
      display: grid;
      place-items: center;
      font-size: 8px;
      color: var(--fp-text);
      border: 1px solid var(--fp-border);
      overflow: hidden;
    }
    .artwork img { width: 100%; height: 100%; object-fit: cover; display: block; }
    
    .info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    
    .title {
      font-size: 16px;
      font-weight: 700;
      line-height: 1.3;
      white-space: normal;
      overflow: visible;
      word-break: keep-all;
      letter-spacing: -0.5px;
    }

    .artist {
      font-size: 14px;
      opacity: 0.85;
      white-space: normal;
      overflow: visible;
      word-break: keep-all;
      letter-spacing: -0.5px;
    }

    /* Genre Tags */
    .genre-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .genre-tag {
      display: inline-flex;
      padding: 1px 6px;
      border: 1px solid #000;
      color: #000;
      font-family: 'Paper Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    /* Quote Block */
    .quote {
      background: rgba(230, 230, 230, 0.87);
      color: #000;
      border-bottom: 1px dashed olive;
      padding: 12px;
      font-size: 11px;
      line-height: 1.2;
    }

    /* Preview Button */
    .preview-btn {
      width: 48px;
      height: 48px;
      border: 1px solid var(--fp-border);
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
    }
    .preview-btn:hover { background: var(--fp-accent-wash); }
    .preview-btn.playing { background: rgba(76, 175, 80, 0.2); border-color: #4caf50; }
    .preview-btn svg { width: 20px; height: 20px; }

    /* Large Variant (Desktop) */
    .variant-large .track-main { padding: 16px; }
    .variant-large .artwork { width: 100px; height: 100px; }
    .variant-large .title { font-size: 16px; }
    .variant-large .artist { font-size: 14px; }
    .variant-large .actions {
      display: flex;
      gap: 8px;
      margin-left: 12px;
    }
    
    /* Small Variant (Mobile) */
    .variant-small .track-main { padding: 8px 12px; }
    .variant-small .artwork { width: 80px; height: 80px; }
    .variant-small .actions { display: none; }
    .variant-small .mobile-actions {
      display: flex;
      border-top: 1px solid var(--fp-border);
      background: rgba(0, 0, 0, 0.05);
      gap: 2px;
      padding: 8px;
    }
    .variant-small .action-btn {
      flex: 1;
      height: 48px;
      border: 1px solid var(--fp-border);
    }

    /* Action Buttons */
    .action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border: 1px solid var(--fp-border);
      background: transparent;
      color: var(--fp-text);
      text-decoration: none;
      cursor: pointer;
      transition: background 0.2s, border-color 0.2s;
    }
    .action-btn:hover { background: var(--fp-accent-wash); border-color: var(--fp-text); }
    .action-btn img { width: 24px; height: 24px; opacity: 0.7; }
  `;
};

const renderTrackHtml = (track, variant) => {
  const isLarge = variant === 'large';

  const links = [];
  if (track.id) {
    links.push({
      url: `/track/${track.id}`,
      icon: '/assets/playlist-actions/share.png',
      title: 'Share track',
      external: false
    });
  }
  if (track.tidal_url || track.tidal_id) links.push({ url: track.tidal_url || `https://tidal.com/browse/track/${track.tidal_id}`, icon: '/assets/playlist-actions/tidal.svg', title: 'Tidal' });
  if (track.apple_music_url || track.apple_id) links.push({ url: track.apple_music_url || `https://music.apple.com/song/${track.apple_id}?mt=1&app=music`, icon: '/icons/apple.png', title: 'Apple Music' });
  if (track.spotify_url || track.spotify_id) links.push({ url: track.spotify_url || `https://open.spotify.com/track/${track.spotify_id}`, icon: '/assets/playlist-actions/spotify.svg', title: 'Spotify' });
  if (track.youtube_music_url || track.youtube_music_id) links.push({ url: track.youtube_music_url || `https://music.youtube.com/watch?v=${track.youtube_music_id}`, icon: '/assets/playlist-actions/youtube.png', title: 'YouTube Music' });
  if (track.bandcamp_url) links.push({ url: track.bandcamp_url, icon: '/assets/playlist-actions/bandcamp.svg', title: 'Bandcamp' });
  if (track.soundcloud_url) links.push({ url: track.soundcloud_url, icon: '/assets/playlist-actions/soundcloud.svg', title: 'SoundCloud' });
  if (track.qobuz_url) links.push({ url: track.qobuz_url, icon: '/assets/playlist-actions/qobuz.png', title: 'Qobuz' });

  const customSources = parseCustomSources(track.custom_sources);
  customSources.forEach((source) => {
    if (!source?.url || !source?.name) return;
    links.push({
      url: source.url,
      icon: getPlatformIconPath(source.name),
      title: source.name
    });
  });

  const actionsHtml = links.map((l) => {
    const href = escHtml(l.url);
    const title = escHtml(l.title);
    const icon = escHtml(l.icon);
    const rel = l.external === false ? 'noopener' : 'noopener noreferrer';
    return `<a href="${href}" target="_blank" rel="${rel}" class="action-btn" title="${title}"><img src="${icon}" alt="${title}"></a>`;
  }).join('');

  // Quote block
  const quoteHtml = track.quote
    ? `<div class="quote">${escHtml(track.quote)}</div>`
    : '';

  // Genre tags
  const genreHtml = track.genre
    ? `<div class="genre-tags"><span class="genre-tag">${escHtml(track.genre)}</span></div>`
    : '';

  // Preview button - check both preview_url and deezer_preview_url
  const previewUrl = track.preview_url || track.deezer_preview_url;
  const previewBtnHtml = previewUrl
    ? `<button class="preview-btn" onclick="togglePreview(this, '${escHtml(previewUrl)}')" title="Play preview">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
       </button>`
    : '';

  return `
    <div class="track ${isLarge ? 'variant-large' : 'variant-small'}">
      ${quoteHtml}
      <div class="track-main">
        ${previewBtnHtml}
        <div class="artwork">
          ${track.artwork_url ? `<img src="${track.artwork_url}" alt="Art">` : 'NO ART'}
        </div>
        <div class="info">
          <div class="artist">${escHtml(track.artist)}</div>
          <div class="title">${escHtml(track.title)}</div>
          ${genreHtml}
        </div>
        ${isLarge ? `<div class="actions">${actionsHtml}</div>` : ''}
      </div>
      ${!isLarge ? `<div class="mobile-actions">${actionsHtml}</div>` : ''}
    </div>
  `;
};

// --- ROUTES ---

// 1. Single Track Embed
router.get('/embed/track/:trackId', async (req, res) => {
  const { trackId } = req.params;
  const options = { ...defaults, ...req.query };
  const { variant } = options;

  try {
    const apiBase = resolveApiBase(req);
    
    // Use internal service or fetch from public API
    // Since we are in the same server, we could potentially call controllers directly, 
    // but fetching via localhost is safer for decoupled logic unless performance is critical.
    // However, authentication might be tricky if endpoints require it. 
    // Public endpoints are fine.
    
    const trackRes = await fetch(`${apiBase}/api/public/tracks/${trackId}`);
    if (!trackRes.ok) return res.status(404).send('Track not found');
    
    const trackData = await trackRes.json();
    const track = trackData?.data || trackData?.track;
    if (trackData?.success === false || !track) {
      return res.status(404).send('Track not found');
    }

    const css = generateCss(options);
    const trackHtml = renderTrackHtml(track, variant);
    
    const html = `<!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escHtml(track.title)} - Embed</title>
        <style>${css} body, html { height: auto; margin: 0; padding: 0; overflow: hidden; } .track { margin-bottom: 0; }</style>
      </head>
      <body>
        ${trackHtml}
        <script>
          let currentAudio = null;
          function togglePreview(btn, url) {
            if (currentAudio && !currentAudio.paused) {
              currentAudio.pause();
              document.querySelectorAll('.preview-btn').forEach(b => b.classList.remove('playing'));
              if (currentAudio.src === url) { currentAudio = null; return; }
            }
            currentAudio = new Audio(url);
            currentAudio.play();
            btn.classList.add('playing');
            currentAudio.onended = () => btn.classList.remove('playing');
          }
        </script>
      </body>
      </html>`;

    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', 'frame-ancestors *');
    res.setHeader('Permissions-Policy', 'clipboard-write=*, autoplay=*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(html);

  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading track');
  }
});

// 2. Playlist Embed (New & Legacy support)
router.get(['/embed/playlist/:playlistId', '/embed/:playlistId'], async (req, res) => {
  const { playlistId } = req.params;
  const options = { ...defaults, ...req.query };
  const { variant } = options;

  try {
    const apiBase = resolveApiBase(req);
    
    const playlistRes = await fetch(`${apiBase}/api/v1/public/playlists/${playlistId}`);
    if (!playlistRes.ok) return res.status(404).send('Playlist not found');
    
    const playlistData = await playlistRes.json();
    const playlist = playlistData.data;

    const tracksRes = await fetch(`${apiBase}/api/v1/public/playlists/${playlistId}/tracks`);
    const tracksData = await tracksRes.json();
    const tracks = tracksData.data || [];

    const css = generateCss(options);
    const tracksHtml = tracks.map(t => renderTrackHtml(t, variant)).join('');

    const html = `<!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escHtml(playlist.title)} - Embed</title>
        <style>${css}</style>
      </head>
      <body>
        <div class="container">
          <div class="header">
             <div class="logo-area">
               <img src="/logo.png" class="logo" alt="Flowerpil">
               <span class="header-title">${escHtml(playlist.title)}</span>
             </div>
             <a href="/home" target="_blank" class="cta">Find Playlists</a>
          </div>
          <div class="content">
            ${tracksHtml}
          </div>
        </div>
        <script>
          let currentAudio = null;
          function togglePreview(btn, url) {
            if (currentAudio && !currentAudio.paused) {
              currentAudio.pause();
              document.querySelectorAll('.preview-btn').forEach(b => b.classList.remove('playing'));
              if (currentAudio.src === url) { currentAudio = null; return; }
            }
            currentAudio = new Audio(url);
            currentAudio.play();
            btn.classList.add('playing');
            currentAudio.onended = () => btn.classList.remove('playing');
          }
        </script>
      </body>
      </html>`;

    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', 'frame-ancestors *');
    res.setHeader('Permissions-Policy', 'clipboard-write=*, autoplay=*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(html);

  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading playlist');
  }
});

export default router;
