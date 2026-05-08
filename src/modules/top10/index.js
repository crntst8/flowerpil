/**
 * Top10 Module Entry
 *
 * Public user Top 10 playlists with DSP import, editing, and publishing
 */

import { createModule } from '@core/module-loader/createModule';
import manifest from './manifest.js';
import Top10Onboarding from './components/Top10Onboarding.jsx';
import Top10Editor from './components/Top10Editor.jsx';
import Top10View from './components/Top10View.jsx';
import Top10Redirect from './components/Top10Redirect.jsx';
import Top10List from './components/Top10List.jsx';

export default createModule({
  ...manifest,
  components: {
    Top10Onboarding,
    Top10Editor,
    Top10View,
    Top10Redirect,
    Top10List,
  },
  services: {},
  initialize: async (context) => {
    if (import.meta.env?.DEV) {
      console.log('✅ Top10 module initialized');
      console.log('📁 Available components:', Object.keys(context.components || {}));
    }
  },
});
