// Curator module entry
import { createModule } from '@core/module-loader/createModule';
import manifest from './manifest.js';
import CuratorDashboard from './components/CuratorDashboard.jsx';
import CuratorProfilePage from './components/CuratorProfilePage.jsx';
import CuratorBioPage from './components/CuratorBioPage.jsx';
import OnboardingTest from './components/OnboardingTest.jsx';
import CuratorSignup from './components/CuratorSignup.jsx';
import CuratorPlaylists from './components/CuratorPlaylists.jsx';
import CuratorPlaylistCreate from './components/CuratorPlaylistCreate.jsx';
import CuratorLogin from './components/CuratorLogin.jsx';

export default createModule({
  ...manifest,
  components: {
    CuratorDashboard,
    CuratorProfilePage,
    CuratorBioPage,
    CuratorPlaylists,
    CuratorPlaylistCreate,
    OnboardingTest,
    CuratorLogin,
    CuratorSignup,
  },
  services: {},
});
