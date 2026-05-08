# Instagram Sharing

## Playlists
- Entry point lives in `src/modules/playlists/components/PlaylistView.jsx` where the Share action opens `src/modules/playlists/components/PlaylistShareModal.jsx`.
- Story image generation uses `generatePlaylistStoryImage()` from `src/modules/home/utils/shareImageGenerator.js`, which now delegates to the shared template renderer in `src/modules/curators/utils/curatorShareImageGenerator.js`.
- The playlist share image uses the same template as curator profiles (`public/assets/instagram/template-ig-profile.png`) with the playlist title centered under the image.
- Artwork is resolved from `playlist.image_url_large`, falling back to `playlist.image_url_original` and `playlist.image`.
- Share flow is handled in `handleShareToStory()` inside `src/modules/playlists/components/PlaylistShareModal.jsx`, which prefers `navigator.share()` with a File and falls back to downloading the PNG while copying the playlist URL to the clipboard.

## Top 10
- Entry point lives in `src/modules/top10/components/Top10View.jsx` where the Share button toggles `Top10InstagramShareModal`.
- Image generation happens inside `generateImage()` in `src/modules/top10/components/Top10InstagramShareModal.jsx`, which draws a 1080x1920 canvas with track list typography and the footer image from `public/ig-bottom.png`.
- The modal guides the user to save the preview image and uses `handleCopyUrl()` to copy the public link (`/top10/:slug`) for the Instagram link sticker.

## Curator Profiles
- Entry point lives in `src/modules/curators/components/CuratorProfile.jsx`, which shows the Share to Instagram button only when `useAuth().isAuthenticated` is true and opens `CuratorShareModal`.
- Story image generation uses `generateCuratorStoryImage()` in `src/modules/curators/utils/curatorShareImageGenerator.js`, which delegates to `generateTemplateStoryImage()` for the shared canvas layout.
- The generator draws `public/assets/instagram/template-ig-profile.png`, places the profile image, and renders the curator name with dynamic sizing to keep it on one line.
- `resolveProfileImageUrls()` in `src/modules/curators/utils/curatorShareImageGenerator.js` handles `/uploads/` paths via `resolveApiBaseUrl()` and appends `?cors=1` for canvas-safe loading, with same-origin and fallback attempts.
- R2 image URLs are attempted through the `/images` proxy first so staging/dev can load images without cross-origin canvas issues.
- Share flow is handled in `handleShareToStory()` inside `src/modules/curators/components/CuratorShareModal.jsx`, which prefers `navigator.share()` and falls back to downloading the PNG while copying the curator URL to the clipboard.

## Assets and Canvas Loading
- `public/assets/instagram/template-ig-profile.png` is the profile share canvas template.
- `public/ig-bottom.png` is the Top 10 footer image used in `Top10InstagramShareModal.jsx`.
- `public/logo.png` is used by `loadLogo()` in `src/modules/home/utils/shareImageGenerator.js` for playlist story headers.
- Canvas loaders (`loadImage()` in `src/modules/home/utils/shareImageGenerator.js` and `src/modules/curators/utils/curatorShareImageGenerator.js`) set `crossOrigin="anonymous"` for R2 or external URLs so the canvas can export a PNG.
 - The `/images` Cloudflare Pages Function proxies R2 images on staging/dev (`functions/images/[[path]].js`), and `vite.config.dev.js` proxies `/images` to `https://images.flowerpil.io` locally.
