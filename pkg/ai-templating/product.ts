import { IPlugin } from '@shell/core/types';
import { BLANK_CLUSTER } from '@shell/store/store-types.js';
import {
  PRODUCT_NAME, EXPLORER_PRODUCT, ROUTE_SETTINGS, ROUTE_CANVAS, ROUTE_CLUSTER_CANVAS,
  CUSTOM_VIEW, HOME_TEMPLATE, TEMPLATING_CONFIG
} from './templating/template-engine';

// The "AI Templating" product — a TOP-LEVEL global product (like Continuous Delivery / Cluster
// Management): inStore 'management', no cluster switcher. Registers standard resource lists for the
// CR types (CustomView / HomeTemplate / TemplatingConfig) + Settings + Blank Canvas. The dynamic
// RENDERED custom-view pages are added at runtime by the engine (index.ts onEnter nav hook).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function init($extension: IPlugin, store: any): void {
  const {
    product, configureType, virtualType, basicType, weightType
  } = $extension.DSL(store, PRODUCT_NAME);

  product({
    icon:                'compass',
    inStore:             'management',
    removable:           false,
    showClusterSwitcher: false,
    weight:              -1,
    to:                  { name: ROUTE_SETTINGS, params: { cluster: BLANK_CLUSTER } },
  });

  [HOME_TEMPLATE, CUSTOM_VIEW, TEMPLATING_CONFIG].forEach((type) => {
    configureType(type, { isCreatable: true });
  });

  weightType(HOME_TEMPLATE, 102, true);
  weightType(CUSTOM_VIEW, 101, true);
  weightType(TEMPLATING_CONFIG, 100, true);

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

  basicType(['ai-templating-settings', 'ai-templating-canvas', HOME_TEMPLATE, CUSTOM_VIEW, TEMPLATING_CONFIG]);

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
