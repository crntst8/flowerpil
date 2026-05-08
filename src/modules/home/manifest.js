export default {
  id: 'home',
  name: 'Home Module',
  version: '1.0.0',
  dependencies: ['common'],
  routes: [
    { path: '/home', component: 'LandingPage' },
    { path: '/discover', component: 'DiscoverPage' },
    { path: '/releases', component: 'ReleasesPage' },
    { path: '/australia', component: 'AustraliaPage' }
  ],
  events: { emits: ['home:viewed','home:loaded'], listens: [] },
  features: {
    'display.landing': true,
    'navigation.accordion': true,
    'feed.playlists': true,
    'navigation.tabs': true,
  }
};