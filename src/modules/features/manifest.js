export default {
  id: 'features',
  name: 'Feature Pieces',
  version: '1.0.0',
  description: 'Premium editorial feature pieces with long-form content',
  dependencies: ['common'],
  author: 'Flowerpil',
  routes: [
    { path: '/features', component: 'FeaturePieceList' },
    { path: '/features/new', component: 'FeaturePieceEditor' },
    { path: '/features/:id/edit', component: 'FeaturePieceEditor' },
    { path: '/features/:slug', component: 'FeaturePieceView' }
  ],
  events: {
    emits: ['feature:viewed', 'feature:published'],
    listens: []
  },
  features: {
    'display.features': true,
    'display.feature': true,
    'editor.feature': true,
    'navigation.public': true
  }
};
