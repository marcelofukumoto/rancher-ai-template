import { importTypes } from '@rancher/auto-import';
import { IPlugin } from '@shell/core/types';
import { loadCustomViews } from './templating/template-engine';
import routing from './routing/index';
import Home from './pages/Home.vue';

// Init the package
export default function(plugin: IPlugin): void {
  // Auto-import model, detail, edit, list, i18n from the folders
  importTypes(plugin);

  // Provide plugin metadata from package.json
  plugin.metadata = require('./package.json');

  // The "AI Templating" product + its cluster-scoped routes (Custom View Sources + the generic
  // view page). Dynamic per-CustomView nav pages are added at runtime by loadCustomViews below.
  plugin.addProduct(require('./product'));
  plugin.addRoutes(routing);

  // Register custom-view nav when the user enters the product (an extension can't hook every
  // loadCluster; onEnter is the package-scoped equivalent). Re-runs on each entry, so newly
  // created CustomView CRs appear after re-entering the product.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugin.addNavHooks({ onEnter: (store: any) => loadCustomViews(store) });

  // Take over the Rancher Home page: render the applied HomeTemplate CR (runtime-compiled).
  plugin.setHomePage(Home);
}
