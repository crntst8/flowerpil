import { createModule } from '@core/module-loader/createModule';
import manifest from './manifest.js';
import CuratorProfile from './components/CuratorProfile';
import CuratorListPage from './components/CuratorList';

// Create curator module
const curatorModule = createModule({
  ...manifest,
  components: {
    CuratorListPage,
    CuratorProfile
  },
  
  // Module initialization
  initialize: async () => {
    console.log('📄 Curator module initialized');
    return true;
  },
  
  // Module cleanup
  cleanup: () => {
    console.log('📄 Curator module cleaned up');
  }
});

export default curatorModule;
