export default {
  id: 'admin',
  name: 'Admin Module',
  version: '1.0.0',
  dependencies: ['common'],
  routes: [
    { path: '/admin', component: 'AdminPage' },
    { path: '/admin/cross-platform', component: 'CrossPlatformLinkingManager' },
    { path: '/admin/bio-editor', component: 'BioEditor' },
    { path: '/auth/spotify/callback', component: 'SpotifyCallback' },
    { path: '/auth/soundcloud/callback', component: 'SoundcloudCallback' }
  ],
  events: {
    emits: ['playlist:created', 'playlist:updated', 'playlist:deleted'],
    listens: ['user:authenticated']
  },
  features: {
    'import.spotify': true,
    'import.apple': false,
    'import.tidal': false,
    'import.text': true,
    'upload.images': true,
    'crud.playlists': true,
    'cross-platform.linking': true,
    'cross-platform.apple': true,
    'cross-platform.tidal': true
  }
};
