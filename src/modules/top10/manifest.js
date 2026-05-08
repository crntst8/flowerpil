export default {
  id: 'top10',
  name: 'Top 10 Module',
  version: '1.0.0',
  dependencies: ['common'],
  routes: [
    { path: '/top10/start', component: 'Top10Onboarding' },
    { path: '/top10/browse', component: 'Top10List' },
    { path: '/top10/:slug', component: 'Top10View' },
    { path: '/top10', component: 'Top10Redirect' }
  ],
  events: {
    emits: ['top10:created', 'top10:published', 'top10:viewed'],
    listens: ['user:authenticated']
  },
  features: {
    'top10.onboarding': true,
    'top10.editor': true,
    'top10.public-view': true,
    'top10.import': true,
    'top10.export': true
  }
};
