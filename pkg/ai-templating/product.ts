import { IPlugin } from '@shell/core/types';
import { PRODUCT_NAME, ROUTE_SOURCES } from './templating/template-engine';

// The "AI Templating" product. Registers the product shell + the always-present Custom View
// Sources control page. Dynamic per-CustomView pages are added at runtime by the engine's
// registerNav (from the onEnter nav hook in index.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function init($extension: IPlugin, store: any): void {
  const { product, virtualType, basicType } = $extension.DSL(store, PRODUCT_NAME);

  product({
    icon:                'compass',
    removable:           false,
    showClusterSwitcher: true,
    weight:              -1,
    to:                  { name: ROUTE_SOURCES },
  });

  virtualType({
    labelKey:   'aiTemplating.sources.label',
    name:       'custom-view-sources',
    namespaced: false,
    icon:       'file',
    route:      { name: ROUTE_SOURCES },
  });

  basicType(['custom-view-sources']);
}
