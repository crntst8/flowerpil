export default {
  id: 'releases',
  name: 'Releases Module',
  version: '1.0.0',
  dependencies: ['common'],
  routes: [
    { path: '/r/:id', component: 'ReleaseView' }
  ],
  events: {
    emits: ['release:viewed'],
    listens: []
  },
  features: {
    'display.releases': true,
    'navigation.public': true
  }
};
