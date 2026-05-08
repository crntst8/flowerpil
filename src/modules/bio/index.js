import { createModule } from '@core/module-loader/createModule';
import manifest from './manifest.js';
import PublicBioPage from './components/PublicBioPage';

export default createModule({
  ...manifest,
  components: {
    PublicBioPage,
  }
});
