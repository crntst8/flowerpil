// Backup of original admin index.js
import React from 'react';
import { createModule } from '@core/module-loader/createModule';
import manifest from './manifest.js';
import AdminPage from './components/AdminPage.jsx';
import PlaylistForm from './components/PlaylistForm.jsx';
import TrackList from './components/TrackList.jsx';
import ImportTools from './components/ImportTools.jsx';
import ImageUpload from './components/ImageUpload.jsx';
import SpotifyImport from './components/SpotifyImport.jsx';
import SpotifyCallback from './components/SpotifyCallback.jsx';
import SoundcloudCallback from './components/SoundcloudCallback.jsx';
import CrossPlatformLinkingManager from './components/CrossPlatformLinkingManager.jsx';
import BioEditor from '../bio/components/BioEditor.jsx';
import adminStore from './store/adminStore.js';
import * as adminService from './services/adminService.js';
// Lazy-load SiteAdmin to avoid blocking module registration on heavy admin UI
const SiteAdmin = React.lazy(() => import('./components/SiteAdmin.jsx'));

export default createModule({
  ...manifest,
  store: adminStore,
  components: {
    AdminPage,
    PlaylistForm,
    TrackList,
    ImportTools,
    ImageUpload,
    SpotifyImport,
    SpotifyCallback,
    SoundcloudCallback,
    CrossPlatformLinkingManager,
    BioEditor,
    SiteAdmin,
  },
  services: adminService,
  initialize: async (context) => {
    console.log('✅ Admin module initialised');
    console.log('📁 Available components:', Object.keys(context.components || {}));
    console.log('⚙️ Available services:', Object.keys(context.services || {}));
  },
});
