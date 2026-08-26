import { importTypes } from '@rancher/auto-import';
import { IPlugin } from '@shell/core/types';
import Home from './pages/Home.vue';

// Init the package
export default function(plugin: IPlugin): void {
  // Auto-import model, detail, edit, list, i18n from the folders
  importTypes(plugin);

  // Provide plugin metadata from package.json
  plugin.metadata = require('./package.json');

  // Take over the Rancher Home page. The extension owns /home and (once ported) renders the
  // applied template's runtime-compiled SFC, with the in-page editor + AI chat.
  plugin.setHomePage(Home);

  // TODO(port): plugin.addProduct(require('./product')) for the Custom Views product + pages,
  // plugin.addNavHooks(...) for runtime nav registration, and the CRD-backed engine.
}
