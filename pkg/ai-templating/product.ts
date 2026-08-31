import { IPlugin } from '@shell/core/types';
import { BLANK_CLUSTER } from '@shell/store/store-types.js';
import {
  PRODUCT_NAME, EXPLORER_PRODUCT, ROUTE_SETTINGS, ROUTE_TEMPLATES, ROUTE_CANVAS, ROUTE_CLUSTER_CANVAS
} from './templating/template-engine';

// The "AI Templating" product — a TOP-LEVEL global product (like Continuous Delivery / Cluster
// Management): inStore 'management', no cluster switcher. Templates are stored as labeled ConfigMaps
// (not a CRD), so there are no CR-type resource lists — just Settings + Blank Canvas; the dynamic
// RENDERED custom-view pages are added at runtime by the engine (index.ts onEnter nav hook).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function init($extension: IPlugin, store: any): void {
  const { product, virtualType, basicType } = $extension.DSL(store, PRODUCT_NAME);

  product({
    icon:                'compass',
    inStore:             'management',
    removable:           false,
    showClusterSwitcher: false,
    weight:              -1,
    to:                  { name: ROUTE_SETTINGS, params: { cluster: BLANK_CLUSTER } },
  });

  // Settings (kill-switch toggle) — always reachable. `exact` so it only highlights on its own
  // route: its path `/c/_/ai-templating` is a prefix of every product route, and without exact the
  // <router-link> active match would light Settings up on every sub-page.
  virtualType({
    labelKey:   'aiTemplating.settings.label',
    name:       'ai-templating-settings',
    namespaced: false,
    icon:       'gear',
    weight:     103,
    exact:      true,
    route:      { name: ROUTE_SETTINGS, params: { cluster: BLANK_CLUSTER } },
  });

  // Blank Canvas — a fast live-authoring scratchpad.
  virtualType({
    labelKey:   'aiTemplating.canvas.label',
    name:       'ai-templating-canvas',
    namespaced: false,
    icon:       'compass',
    weight:     104,
    exact:      true,
    route:      { name: ROUTE_CANVAS, params: { cluster: BLANK_CLUSTER } },
  });

  // Templates — a list of every custom view + Home template ConfigMap.
  virtualType({
    labelKey:   'aiTemplating.templates.label',
    name:       'ai-templating-templates',
    namespaced: false,
    icon:       'list-flat',
    weight:     105,
    exact:      true,
    route:      { name: ROUTE_TEMPLATES, params: { cluster: BLANK_CLUSTER } },
  });

  basicType(['ai-templating-templates', 'ai-templating-settings', 'ai-templating-canvas']);

  // Also surface the Blank Canvas editor INSIDE every cluster (the core `explorer` product), so
  // cluster-scoped views can be authored where the cluster is loaded and previews show real data.
  // Registered statically here (not from the runtime engine) so it's present before the nav builds.
  const explorer = $extension.DSL(store, EXPLORER_PRODUCT);

  explorer.virtualType({
    labelKey:   'aiTemplating.canvas.label',
    name:       'ai-templating-cluster-canvas',
    namespaced: false,
    icon:       'compass',
    weight:     -5,
    exact:      true,
    route:      { name: ROUTE_CLUSTER_CANVAS },
  });
  explorer.basicType(['ai-templating-cluster-canvas'], 'root'); // 'root' = top-level cluster nav
}
