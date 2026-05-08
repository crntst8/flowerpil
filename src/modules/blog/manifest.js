export default {
  id: 'blog',
  name: 'Blog Posts',
  version: '1.0.0',
  description: 'Blog posts feature for site admin',
  dependencies: ['common'],
  author: 'Flowerpil',
  routes: [
    { path: '/posts/:slug', component: 'BlogPostDetail' }
  ],
  events: {
    emits: ['post:viewed', 'post:loaded'],
    listens: []
  },
  features: {
    'display.posts': true,
    'display.post': true,
    'navigation.public': true
  }
};
