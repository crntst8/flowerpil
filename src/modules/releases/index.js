import { createModule } from '@core/module-loader/createModule';
import manifest from './manifest.js';
import ReleaseView from './components/ReleaseView.jsx';
import ReleasePasswordGate from './components/ReleasePasswordGate.jsx';
import ReleaseActionRow from './components/ReleaseActionRow.jsx';
import ReleaseImageModal from './components/ReleaseImageModal.jsx';
import * as releaseService from './services/releaseService.js';

export default createModule({
  ...manifest,
  components: {
    ReleaseView,
    ReleasePasswordGate,
    ReleaseActionRow,
    ReleaseImageModal,
  },
  services: releaseService,
  initialize: async (context) => {
    console.log('Releases module initialised');
    console.log('Available components:', Object.keys(context.components || {}));
    console.log('Available services:', Object.keys(context.services || {}));
  },
});
