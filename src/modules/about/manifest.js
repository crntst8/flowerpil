export default {
  id: 'about',
  name: 'About Module',
  version: '1.0.0',
  dependencies: ['common'],
  routes: [
    { path: '/about', component: 'AboutPage' }
  ],
  events: {
    emits: ['about:viewed'],
    listens: []
  },
  features: {
    'display.about': true,
    'navigation.public': true
  }
};
