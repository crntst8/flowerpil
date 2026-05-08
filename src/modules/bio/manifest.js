export default {
  id: 'bio',
  name: 'Bio Pages Module',
  version: '1.0.0',
  dependencies: [],
  routes: [
    { path: '/bio/:handle', component: 'PublicBioPage' }
  ],
  events: {
    emits: ['bio:viewed', 'bio:loaded'],
    listens: []
  },
  features: {
    'display.bio': true,
    'public.bio': true
  }
};
