import { createModule } from '@core/module-loader/createModule';
import manifest from './manifest.js';
import PlaylistView from './components/PlaylistView.jsx';
import PlaylistList from './components/PlaylistList.jsx';
import PlaylistCard from './components/PlaylistCard.jsx';
import TidalExportCallback from './components/TidalExportCallback.jsx';
import YouTubeMusicExportCallback from './components/YouTubeMusicExportCallback.jsx';
import PerfectSundaysPage from './components/PerfectSundaysPage.jsx';
import SearchResultsPage from './components/SearchResultsPage.jsx';
import playlistStore from './store/playlistStore.js';
import * as playlistService from './services/playlistService.js';

export default createModule({
  ...manifest,
  store: playlistStore,
  components: {
    PlaylistView,
    PlaylistList,
    PlaylistCard,
    TidalExportCallback,
    YouTubeMusicExportCallback,
    PerfectSundaysPage,
    SearchResultsPage,
  },
  services: playlistService,
  initialize: async (context) => {
    console.log('✅ Playlists module initialised');
    console.log('📁 Available components:', Object.keys(context.components || {}));
    console.log('⚙️ Available services:', Object.keys(context.services || {}));
  },
});
