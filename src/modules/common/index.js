import { createModule } from '@core/module-loader/createModule';
import manifest from './manifest.js';

export default createModule({
  ...manifest,
  components: {},
  services: {},
  initialize: async () => {},
});
