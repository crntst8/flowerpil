import { createModule } from '@core/module-loader/createModule';
import manifest from './manifest.js';
import FeaturePieceList from './components/FeaturePieceList.jsx';
import FeaturePieceView from './components/FeaturePieceView.jsx';
import FeaturePieceEditor from './components/FeaturePieceEditor.jsx';
import * as featurePiecesService from './services/featurePiecesService.js';

export default createModule({
  ...manifest,
  components: {
    FeaturePieceList,
    FeaturePieceView,
    FeaturePieceEditor,
  },
  services: featurePiecesService,
  initialize: async (context) => {
    console.log('Feature Pieces module initialized');
  },
});
