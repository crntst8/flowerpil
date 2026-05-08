export default {
  id: 'playlists',
  name: 'Playlists Module',
  version: '1.0.0',
  dependencies: ['common'],
  routes: [
    { path: '/playlists', component: 'PlaylistList' },
    { path: '/playlists/:id', component: 'PlaylistView' },
    { path: '/playlist/:id', component: 'PlaylistView' },
    { path: '/search', component: 'SearchResultsPage' },
    { path: '/perf', component: 'PerfectSundaysPage' },
    { path: '/auth/tidal/export/callback', component: 'TidalExportCallback' },
    { path: '/auth/tidal/callback', component: 'TidalExportCallback' },
    { path: '/auth/youtube-music/callback', component: 'YouTubeMusicExportCallback' }
  ],
  events: {
    emits: ['playlist:viewed', 'playlist:loaded'],
    listens: []
  },
  features: {
    'display.playlists': true,
    'display.playlist': true,
    'display.tracks': true,
    'navigation.public': true
  }
};
