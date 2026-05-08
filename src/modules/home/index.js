import { createModule } from '@core/module-loader/createModule';
import manifest from './manifest.js';
import LandingPage from './components/LandingPage.jsx';
import LandingHeader from './components/LandingHeader.jsx';
import AccordionMenu from './components/AccordionMenu.jsx';
import FeedPlaylistCard from './components/FeedPlaylistCard.jsx';
import DiscoverPage from './components/DiscoverPage.jsx';
import ReleasesPage from './components/ReleasesPage.jsx';
import AustraliaPage from './components/AustraliaPage.jsx';

export default createModule({
  ...manifest,
  store: null,
  components: {
    LandingPage,
    LandingHeader,
    AccordionMenu,
    FeedPlaylistCard,
    DiscoverPage,
    ReleasesPage,
    AustraliaPage,
  },
  services: {},
  initialize: async (context) => {
    console.log('✅ Home module initialised');
    console.log('📁 Available components:', Object.keys(context.components || {}));
  },
});
