import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { theme, MainBox } from '@shared/styles/GlobalStyles';
import { buildEmbedHTML } from './embedTemplate';
import InfoModal from '@shared/components/InfoModal.jsx';

const Wrapper = styled.div`
  display: grid;
  gap: ${theme.spacing.xl};
  max-width: 1400px;
`;

const PageHeader = styled(MainBox)`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  background: ${theme.colors.black};
  box-shadow: 0 24px 48px -30px rgba(15, 14, 23, 0.5);
  padding: ${theme.spacing.lg} ${theme.spacing.xl};
  max-width: 100%;
  margin-bottom: ${theme.spacing.xl};

  h1 {
    margin: 0;
    font-family: ${theme.fonts.primary};
    color: ${theme.colors.fpwhite};
    text-transform: capitalize;
    letter-spacing: -0.9px;
  }

  p {
    margin: 0;
    font-family: ${theme.fonts.primary};
    font-size: ${theme.fontSizes.body};
    color: ${theme.colors.fpwhite};
    opacity: 0.9;
  }

  @media (max-width: 600px) {
    padding: ${theme.spacing.md};
    margin-bottom: ${theme.spacing.md};
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: ${theme.spacing.md};
  align-items: start;
  ${'' /* Responsive */}
  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const Panel = styled.div`

  border: ${theme.borders.solid} ${theme.colors.blackAct};
  padding: ${theme.spacing.sm};
  background: ${theme.colors.fpwhite};
`;

const H3 = styled.h3`
  margin: 0 0 ${theme.spacing.sm};
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: ${theme.spacing.sm};
  align-items: center;
  margin-bottom: ${theme.spacing.sm};
`;

const Label = styled.label`
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.6em;
  background: transparent;
  color: ${theme.colors.black};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.4);
  &:focus { outline: none; border-color: ${theme.colors.fpwhiteIn}; background: rgba(255,255,255,0.05); }
`;

const Select = styled.select`
  width: 100%;
  padding: 8px;
  background: transparent;
  color: ${theme.colors.black};
  border: ${theme.borders.solidThin} rgba(0, 0, 0, 0.4);
  font-family: ${theme.fonts.mono};
  text-transform: uppercase;
`;

const Toggle = styled.input``;

const Button = styled.button`
  background: transparent;
  color: ${theme.colors.black};
  font-family: ${theme.fonts.mono};
  border: ${theme.borders.solidThin} rgba(67, 142, 255, 0.6);
  padding: 8px 12px;
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:hover { border-color: ${theme.colors.white}; background: rgba(255,255,255,0.05); }
`;

// Square color picker with swatch filling to border
const ColorInput = styled.input.attrs({ type: 'color' })`
  -webkit-appearance: none;
  appearance: none;
  width: 32px;
  height: 32px;
  padding: 0;
  background: transparent;
  border: ${theme.borders.solidThin} rgba(67, 142, 255, 0.4);
  cursor: pointer;
  &:hover { border-color: ${theme.colors.white}; }
  &::-webkit-color-swatch-wrapper { padding: 0; }
  &::-webkit-color-swatch { border: none; }
  &::-moz-color-swatch { border: none; }
`;

const PreviewWrap = styled.div`
  min-height: 600px;
  border: ${theme.borders.dashed} ${theme.colors.gray[300]};
  padding: ${theme.spacing.sm};
  background: ${theme.colors.fpwhite};
  display: flex;
  flex-direction: column;
`;

export default function EmbedsPanel({ curatorId, publishedPlaylists }){
  const embedsInfoBlock = useMemo(() => ({
    title: 'Embed Configuration',
    intro: 'Customize how your playlists look when embedded on external websites.',
    bullets: [
      { title: 'Visual Customization', text: 'Set colors, fonts, borders, and sizing for your embed player' },
      { title: 'Copy Embed Code', text: 'Generate iframe code to paste directly into your website or blog' },
      { title: 'Live Preview', text: 'See exactly how your embed will look before copying the code' },
      { title: 'Per-Playlist', text: 'Each playlist gets its own embed with global style settings applied' },
    ],
    tip: 'Embed playlists on your artist website, blog, or social media profiles',
    footerNote: 'Only published playlists can be embedded',
  }), []);

  const [settings, setSettings] = useState({
    bg: '#dadada', text: '#000000', accent: '#ff3ea5', borderColor: '#dadadada',
    trackBg: '#dadada',
    font: 'helvetica', fullBorder: false, logoSize: 28
  });
  const [currentPlaylistId, setCurrentPlaylistId] = useState(null);
  const [currentData, setCurrentData] = useState(null);
  const iframeRef = useRef(null);

  // Load existing settings
  useEffect(() => {
    (async () => {
      try {
        // Prefer local settings to avoid CSRF saves; fallback to server read-only defaults
        const local = localStorage.getItem('fp_embed_settings_v1');
        if (local) {
          try { setSettings(prev => ({ ...prev, ...JSON.parse(local) })); } catch {}
        } else {
          const res = await fetch('/api/v1/curator/embed/settings', { credentials: 'include' });
          const json = await res.json();
          if (res.ok && json.success) setSettings(prev => ({ ...prev, ...json.data }));
        }
      } catch {}
    })();
  }, []);

  // pick first published playlist by default for preview
  useEffect(() => {
    if (!currentPlaylistId && publishedPlaylists?.length) {
      setCurrentPlaylistId(publishedPlaylists[0].id);
    }
  }, [publishedPlaylists, currentPlaylistId]);

  // Load playlist data for preview (parent fetch to avoid CORS)
  useEffect(() => {
    (async () => {
      if (!currentPlaylistId) return;
      try {
        const [pRes, tRes] = await Promise.all([
          fetch(`/api/v1/public/playlists/${currentPlaylistId}`),
          fetch(`/api/v1/public/playlists/${currentPlaylistId}/tracks`)
        ]);
        const p = await pRes.json();
        const t = await tRes.json();
        if (pRes.ok && p.success && tRes.ok && t.success) {
          setCurrentData({ playlist: p.data, tracks: t.data });
        }
      } catch {}
    })();
  }, [currentPlaylistId]);

  // Render preview via blob iframe (exact HTML)
  const renderPreview = () => {
    if (!iframeRef.current || !currentData) return;
    const html = buildEmbedHTML({ playlistId: currentPlaylistId, theme: settings, data: currentData });
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    iframeRef.current.src = url;
  };

  useEffect(() => { renderPreview(); /* eslint-disable-next-line */ }, [settings, currentData, currentPlaylistId]);

  // Persist locally whenever settings change (no manual save)
  useEffect(() => {
    try { localStorage.setItem('fp_embed_settings_v1', JSON.stringify(settings)); } catch {}
  }, [settings]);

  const copyEmbed = async () => {
    const { protocol, port } = window.location;
    const base = port === '3001' ? `${protocol}//api.flowerpil.io` : `${protocol}//api.flowerpil.io`;
    const params = new URLSearchParams();
    params.set('bg', settings.bg);
    params.set('text', settings.text);
    params.set('accent', settings.accent);
    if (settings.font === 'mono') params.set('font', 'PaperMono');
    if (settings.fullBorder) params.set('border', 'true');
    if (settings.borderColor) params.set('borderColor', settings.borderColor);
    if (settings.trackBg) params.set('track_bg', settings.trackBg);
    if (settings.logoSize) params.set('logo', String(settings.logoSize));
    // removed rowDividers/track_w/track_h/actions from params
    const qs = params.toString();
    const src = `${base}/embed/${currentPlaylistId}${qs ? `?${qs}` : ''}`;
    const code = `<iframe src="${src}" width="100%" height="${settings.height || 420}" frameborder="0" style="border:0;max-width:100%;" allow="autoplay; clipboard-write"></iframe>`;
    try { await navigator.clipboard.writeText(code); alert('Embed code copied'); } catch { alert('Copy failed'); }
  };

  return (
    <Wrapper>
      <PageHeader>
        <h1>
          Playlist Embeds
          <InfoModal {...embedsInfoBlock} />
        </h1>
        <p>Create customizable embed codes for your playlists to use on external websites</p>
      </PageHeader>

      <Grid>
      
      <Panel>
        <Row>
          <Label>Playlist</Label>
          <Select value={currentPlaylistId || ''} onChange={(e)=>setCurrentPlaylistId(Number(e.target.value))}>
            {(publishedPlaylists||[]).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </Select>
        </Row>

        <Row>
          <Label>Logo Size</Label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 56px', gap:8, alignItems:'center' }}>
            <input 
              type="range" min={24} max={64} step={1}
              value={settings.logoSize}
              onChange={(e)=>setSettings(s=>({ ...s, logoSize: Number(e.target.value) }))}
              style={{ width:'100%' }}
            />
            <Input type="number" min={24} max={64} value={settings.logoSize} onChange={(e)=>setSettings(s=>({ ...s, logoSize: Number(e.target.value) }))} />
          </div>
        </Row>
                <Row>
          <Label>Track Background</Label>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <Input value={settings.trackBg} placeholder="#0a0a0a" onChange={(e)=>setSettings(s=>({ ...s, trackBg: e.target.value }))} />
            <ColorInput aria-label="Track background color" value={settings.trackBg} onChange={(e)=>setSettings(s=>({ ...s, trackBg: e.target.value }))} />
          </div>
        </Row>
        
        <Row>
          <Label>Background</Label>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <Input value={settings.bg} placeholder="#000000" onChange={(e)=>setSettings(s=>({ ...s, bg: e.target.value }))} />
            <ColorInput aria-label="Background color" value={settings.bg} onChange={(e)=>setSettings(s=>({ ...s, bg: e.target.value }))} />
          </div>
        </Row>
        <Row>
          <Label>Text</Label>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <Input value={settings.text} placeholder="#ffffff" onChange={(e)=>setSettings(s=>({ ...s, text: e.target.value }))} />
            <ColorInput aria-label="Text color" value={settings.text} onChange={(e)=>setSettings(s=>({ ...s, text: e.target.value }))} />
          </div>
        </Row>
        <Row>
          <Label>Accent</Label>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <Input value={settings.accent} placeholder="#ff3ea5" onChange={(e)=>setSettings(s=>({ ...s, accent: e.target.value }))} />
            <ColorInput aria-label="Accent color" value={settings.accent} onChange={(e)=>setSettings(s=>({ ...s, accent: e.target.value }))} />
          </div>
        </Row>
        <Row>
          <Label>Border Color</Label>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <Input value={settings.borderColor} placeholder="#ffffff" onChange={(e)=>setSettings(s=>({ ...s, borderColor: e.target.value }))} />
            <ColorInput aria-label="Border color" value={settings.borderColor} onChange={(e)=>setSettings(s=>({ ...s, borderColor: e.target.value }))} />
          </div>
        </Row>
        <Row>
          <Label>Font</Label>
          <Select value={settings.font} onChange={(e)=>setSettings(s=>({ ...s, font: e.target.value }))}>
            <option value="helvetica">Helvetica Neue</option>
            <option value="mono">Paper Mono</option>
          </Select>
        </Row>
        <Row><Label>Full Border</Label><Toggle type="checkbox" checked={settings.fullBorder} onChange={(e)=>setSettings(s=>({ ...s, fullBorder: e.target.checked }))} /></Row>
        { /* Removed Row Dividers, Track Width/Height, Actions controls */ }
        <div style={{ display: 'flex', gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
          <Button onClick={copyEmbed} disabled={!currentPlaylistId}>Copy Embed Code</Button>
        </div>
      </Panel>
      <Panel>
       <PreviewWrap>
          <iframe ref={iframeRef} title="Embed Preview" style={{ width: '100%', height: '100%', minHeight: '580px', border: 0, flex: 1 }} />
        </PreviewWrap>
      </Panel>
    </Grid>
    </Wrapper>
  );
}
