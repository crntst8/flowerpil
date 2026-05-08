import { createModule } from '@core/module-loader/createModule';
import manifest from './manifest.js';
import AboutPage from './components/AboutPage.jsx';

export default createModule({
  ...manifest,
  components: {
    AboutPage,
  },
  initialize: async () => {
    console.log('✅ About module initialised');
  },
});
