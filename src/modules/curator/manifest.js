export default {
  id: 'curator',
  name: 'Curator Module',
  version: '1.0.0',
  dependencies: ['common'],
  routes: [
    { path: '/curator-admin', component: 'CuratorDashboard' },
    { path: '/curator-admin/profile', component: 'CuratorProfilePage' },
    { path: '/curator-admin/bio', component: 'CuratorBioPage' },
    { path: '/curator-admin/playlists', component: 'CuratorPlaylists' },
    { path: '/curator-admin/playlists/new', component: 'CuratorPlaylistCreate' },
    { path: '/curator-admin/dev/onboarding-test', component: 'OnboardingTest' },
    { path: '/curator-admin/login', component: 'CuratorLogin' },
    { path: '/signup', component: 'CuratorSignup' }
  ],
  events: {
    emits: [],
    listens: ['user:authenticated']
  },
  features: {}
};
