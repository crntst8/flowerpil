export default {
  id: 'curators',
  name: 'Curators Module',
  version: '1.0.0',
  dependencies: ['playlists'],
  routes: [
    { path: '/curators', component: 'CuratorListPage' },
    { path: '/curator/:name', component: 'CuratorProfile' }
  ],
  events: {
    emits: [],
    listens: []
  },
  features: {}
};
