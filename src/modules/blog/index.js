import { createModule } from '@core/module-loader/createModule';
import manifest from './manifest.js';
import BlogPostDetail from './components/BlogPostDetail.jsx';
import BlogPostCard from './components/BlogPostCard.jsx';
import * as blogService from './services/blogService.js';

export default createModule({
  ...manifest,
  components: {
    BlogPostDetail,
    BlogPostCard,
  },
  services: blogService,
  initialize: async (context) => {
    console.log('✅ Blog module initialised');
    console.log('📁 Available components:', Object.keys(context.components || {}));
    console.log('⚙️ Available services:', Object.keys(context.services || {}));
  },
});
