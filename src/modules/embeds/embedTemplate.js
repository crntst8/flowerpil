// Builds the same HTML structure as /embed route, but can inline data for preview.
export function buildEmbedHTML({ playlistId, theme, data }) {
  const cfg = Object.assign({
    bg: '#000000', text: '#ffffff', accent: '#ff3ea5', font: 'helvetica',
    fullBorder: false, rowDividers: true, borderColor: '#ffffff', actions: true,
    trackWidth: 0, trackHeight: 0, width: 0, height: 0, logoSize: 24, trackBg: '#0a0a0a'
  }, theme || {});

  const fontStack = cfg.font === 'mono'
    ? "'Paper Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"
    : "'Helvetica Neue', Helvetica, Arial, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

  const containerStyle = [
    cfg.width ? `max-width:${Number(cfg.width)}px` : '',
    cfg.height ? `max-height:${Number(cfg.height)}px; overflow:auto` : ''
  ].filter(Boolean).join(';');
  const trackStyle = [
    cfg.trackWidth ? `max-width:${Number(cfg.trackWidth)}px` : '',
    cfg.trackHeight ? `min-height:${Number(cfg.trackHeight)}px` : ''
  ].filter(Boolean).join(';');
  const trackStyleInline = trackStyle ? `${trackStyle};` : '';

  const isDev = typeof window !== 'undefined' && window.location && window.location.port === '3001';
  const API_BASE = (typeof window !== 'undefined' && window.location)
    ? (isDev ? `${window.location.protocol}//api.flowerpil.io` : `${window.location.origin}`)
    : '';
  const ASSET_BASE = (typeof window !== 'undefined' && window.location)
    ? `${window.location.origin}`
    : '';
  const UPLOAD_BASE = API_BASE; // uploads served by API server

  const css = `
    :root { --fp-bg:${cfg.bg}; --fp-text:${cfg.text}; --fp-accent:${cfg.accent}; --fp-border:${cfg.borderColor}; --fp-track-bg:${cfg.trackBg || 'transparent'}; }
    *{box-sizing:border-box}
    body{margin:0;background:var(--fp-bg);color:var(--fp-text);font-family:${fontStack}}
    .hdr{display:flex;flex-direction:column;justify-content:center;align-items:center;padding:8px 0 4px}
    .hdr img.logo{height:${Number(cfg.logoSize||24)}px;opacity:.8}
    .open{font-family:${fontStack};font-size:10px;opacity:.7;margin-top:4px;text-transform:uppercase;letter-spacing:.04em}
    .open a{color:var(--fp-text);text-decoration:none;border-bottom:1px solid rgba(255,255,255,0.3)}
    .open a:hover{border-bottom-color:#fff}
    .wrap{padding:12px;${containerStyle};${cfg.fullBorder ? `border:1px solid var(--fp-border);` : ''}}
    
    /* Track row container matches ExpandableTrack border box */
    .track{border:1px solid rgba(255,255,255,0.2);margin-bottom:8px;background:var(--fp-track-bg);${trackStyleInline}}
    .track:last-child{margin-bottom:0}
    
    /* Main content area */
    .t-main{display:flex;align-items:center;gap:16px;padding:12px}
    
    /* Artwork (placeholder or image) */
    .t-art{width:60px;height:60px;flex-shrink:0;border:1px solid rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.2);font-family:${fontStack};font-size:8px;color:rgba(255,255,255,0.5);overflow:hidden}
    .t-art img{width:100%;height:100%;object-fit:cover;display:block}
   
    /* Content + actions */
    .t-body{display:flex;align-items:center;gap:12px;flex:1;min-width:0}
    /* Ensure artwork always precedes text */
    .t-art{order:0}
    .t-body{order:1}
    .t-text{font-family:${fontStack};line-height:1.6;flex:1;min-width:0;display:grid;grid-template-columns:1fr;row-gap:4px}
    .t-meta{display:flex;flex-direction:column;min-width:0}
    .t-artist{opacity:.9;font-size:12px;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .t-title{text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    
    /* Desktop actions cluster (DSP + other icons) */
    .t-actions{display:flex;align-items:center;gap:6px;flex-shrink:0}
    .btn{display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;background:transparent;border:1px solid rgba(67,142,255,0.4);text-decoration:none;color:var(--fp-text);cursor:pointer}
    .btn:hover{border-color:#fff;background:rgba(67,142,255,0.4)}
    .ico{width:24px;height:24px;opacity:.7;display:block}
    /* Mobile action bar (separate row like ExpandableTrack) */
    .t-mbar{display:none}
    /* Responsive: mirror ExpandableTrack mobile behavior */
    @media (max-width: 640px){
      .t-main{flex-direction:row;align-items:center;gap:8px;padding:8px}
      .t-art{width:72px;height:72px;align-self:center}
      .t-body{flex:1;flex-direction:column;align-items:stretch;gap:6px}
      .t-text{row-gap:2px}
      .t-actions{display:none}
      .t-mbar{display:flex;align-items:center;justify-content:space-between;width:100%;gap:2px;padding:8px;border-top:1px solid rgba(255,255,255,0.2)}
      .t-mbar .btn{flex:1;min-width:44px;max-width:none;height:48px}
      .btn{width:44px;height:48px;min-width:44px;-webkit-tap-highlight-color:transparent}
      .ico{width:24px;height:24px}
    }
  `;

  const bootstrapData = data ? `window.__EMBED_DATA=${JSON.stringify(data)};` : '';
  const loader = `
    (async function(){
      const API_BASE = ${JSON.stringify(API_BASE)};
      const ASSET_BASE = ${JSON.stringify(ASSET_BASE)};
      const UPLOAD_BASE = ${JSON.stringify(UPLOAD_BASE)};
      function scaleRowText(row){
        try{
          const text = row.querySelector('.t-text');
          if(!text) return;
          const avail = text.getBoundingClientRect().width || 0;
          if(!avail) return;
          const target = 23; // chars
          const k = 0.58; // approx px per char per 1px font-size
          const maxTitle = 14, maxArtist = 12, minSize = 10;
          const title = row.querySelector('.t-title');
          const artist = row.querySelector('.t-artist');
          if (title){ title.style.fontSize = Math.max(minSize, Math.min(maxTitle, Math.floor(avail/(target*k)))) + 'px'; }
          if (artist){ artist.style.fontSize = Math.max(minSize-1, Math.min(maxArtist, Math.floor(avail/(target*k)) - 1)) + 'px'; }
        }catch(_){ }
      }
      function rescaleAll(){
        document.querySelectorAll('.track').forEach(scaleRowText);
      }
      try{
        let p,t;
        if (window.__EMBED_DATA){
          p = { success:true, data: window.__EMBED_DATA.playlist };
          t = { success:true, data: window.__EMBED_DATA.tracks };
        } else {
          const pid = ${JSON.stringify(String(playlistId || ''))};
          const pRes = await fetch(API_BASE + '/api/v1/public/playlists/' + pid); p = await pRes.json();
          const tRes = await fetch(API_BASE + '/api/v1/public/playlists/' + pid + '/tracks'); t = await tRes.json();
        }
        if(!p.success) throw new Error('Playlist not found');
        const list = t.data || [];
        const container = document.getElementById('tracks');
        container.innerHTML='';
        list.forEach((item)=>{
          const row=document.createElement('div');row.className='track';
          const main=document.createElement('div');main.className='t-main';
          const art=document.createElement('div');art.className='t-art';
          if (item.artwork_url){
            var aurl = String(item.artwork_url);
            if (!/^https?:/i.test(aurl)) { aurl = UPLOAD_BASE + (aurl.startsWith('/') ? aurl : '/' + aurl); }
            art.innerHTML = '<img src="'+aurl+'" alt="Artwork" />';
          } else {
            art.textContent='NO ART';
          }
          // Text block
          const body=document.createElement('div');body.className='t-body';
          const meta=document.createElement('div');meta.className='t-meta';
          const title=document.createElement('div');title.className='t-title';title.textContent=String(item.title||'');
          const artist=document.createElement('div');artist.className='t-artist';artist.textContent=String(item.artist||'');
          meta.appendChild(artist);meta.appendChild(title);
          // Actions cluster
          const acts=document.createElement('div');acts.className='t-actions';
          if(item.tidal_url){acts.innerHTML += '<a class="btn" href="'+item.tidal_url+'" target="_blank" rel="noopener" title="Listen on Tidal"><img class="ico" src="' + ASSET_BASE + '/assets/playlist-actions/tidal.svg" alt="Tidal" /></a>';}
          if(item.apple_music_url){acts.innerHTML += '<a class="btn" href="'+item.apple_music_url+'" target="_blank" rel="noopener" title="Listen on Apple Music"><img class="ico" src="' + ASSET_BASE + '/icons/apple.png" alt="Apple" /></a>';}
          if(item.spotify_url){acts.innerHTML += '<a class="btn" href="'+item.spotify_url+'" target="_blank" rel="noopener" title="Listen on Spotify"><img class="ico" src="' + ASSET_BASE + '/assets/playlist-actions/spotify.svg" alt="Spotify" /></a>';}
          if(item.bandcamp_url){acts.innerHTML += '<a class="btn" href="'+item.bandcamp_url+'" target="_blank" rel="noopener" title="Listen on Bandcamp"><img class="ico" src="' + ASSET_BASE + '/icons/bandcamp.png" alt="Bandcamp" /></a>';}
          if(item.preview_url){acts.innerHTML += '<a class="btn" href="'+item.preview_url+'" target="_blank" rel="noopener" title="Preview">▶</a>';}
          // Show Copy and Info icons as placeholders for parity with PlaylistView
          acts.innerHTML += '<span class="btn" title="Copy">⎘</span>';
          acts.innerHTML += '<span class="btn" title="Info">ⓘ</span>';
          // Assemble (desktop cluster)
          const textWrap=document.createElement('div');textWrap.className='t-text';
          textWrap.appendChild(meta);
          body.appendChild(textWrap);body.appendChild(acts);
          main.appendChild(art);main.appendChild(body);
          // Mobile action bar (same actions)
          const mbar=document.createElement('div');mbar.className='t-mbar';
          mbar.innerHTML = acts.innerHTML; // duplicate actions for mobile bar
          row.appendChild(main);
          row.appendChild(mbar);
          container.appendChild(row);
          scaleRowText(row);
        });
        window.addEventListener('resize', rescaleAll);
      }catch(e){ /* swallow in preview embed */ }
    })();
  `;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Playlist Embed</title><style>${css}</style></head><body><div class="hdr"><img class="logo" src="${ASSET_BASE}/logo-bg.png" alt="Flowerpil"/><div class="open"><a id="openLink" href="#" target="_blank" rel="noopener">Open in Flowerpil →</a></div></div><div class="wrap"><div id="tracks"></div></div><script>${bootstrapData}${loader};(function(){try{var pid=${JSON.stringify(String(playlistId||''))};var link=document.getElementById('openLink');if(link){link.href='${ASSET_BASE}/playlists/'+pid;}}catch(e){}})();</script></body></html>`;
}

export function buildEmbedSrc({ base, playlistId, theme }) {
  const params = new URLSearchParams();
  if (theme?.bg) params.set('bg', theme.bg);
  if (theme?.text) params.set('text', theme.text);
  if (theme?.accent) params.set('accent', theme.accent);
  if (theme?.font === 'mono') params.set('font', 'PaperMono');
  if (theme?.fullBorder) params.set('border', 'true');
  if (theme?.rowDividers === false) params.set('dividers', 'false');
  if (theme?.borderColor) params.set('borderColor', theme.borderColor);
  if (theme?.trackWidth) params.set('track_w', String(theme.trackWidth));
  if (theme?.trackHeight) params.set('track_h', String(theme.trackHeight));
  if (theme?.width) params.set('width', String(theme.width));
  if (theme?.height) params.set('height', String(theme.height));
  if (theme?.actions === false) params.set('actions', 'false');
  const qs = params.toString();
  return `${base}/embed/${encodeURIComponent(playlistId)}${qs ? `?${qs}` : ''}`;
}
