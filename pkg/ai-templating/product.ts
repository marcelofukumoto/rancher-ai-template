import { IPlugin } from '@shell/core/types';
import {
  PRODUCT_NAME, ROUTE_SETTINGS, CUSTOM_VIEW, HOME_TEMPLATE, TEMPLATING_CONFIG
} from './templating/template-engine';

// The "AI Templating" product.
//
// Registers PROPER Rancher resource lists for the CR types (CustomView / HomeTemplate /
// TemplatingConfig) — so they get the standard ResourceTable + create/edit-YAML + row actions for
// free — plus a Settings page for the kill switch. The CRs are global (local cluster), so the
// lists are `localOnly` (hidden on downstream clusters). The dynamic RENDERED custom-view pages
// are added at runtime by the engine (index.ts onEnter nav hook).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function init($extension: IPlugin, store: any): void {
  const {
    product, configureType, virtualType, basicType, weightType
  } = $extension.DSL(store, PRODUCT_NAME);

  product({
    icon:                'compass',
    removable:           false,
    showClusterSwitcher: true,
    weight:              -1,
    to:                  { name: ROUTE_SETTINGS },
    typeStoreMap:        {
      [CUSTOM_VIEW]:       'management',
      [HOME_TEMPLATE]:     'management',
      [TEMPLATING_CONFIG]: 'management',
    },
  });

  // Standard resource lists — local-only (the CRs live in the local/Rancher cluster).
  [HOME_TEMPLATE, CUSTOM_VIEW, TEMPLATING_CONFIG].forEach((type) => {
    configureType(type, { isCreatable: true, localOnly: true });
  });

  weightType(HOME_TEMPLATE, 102, true);
  weightType(CUSTOM_VIEW, 101, true);
  weightType(TEMPLATING_CONFIG, 100, true);

  // Settings (kill-switch toggle) — always reachable.
  virtualType({
    labelKey:   'aiTemplating.settings.label',
    name:       'ai-templating-settings',
    namespaced: false,
    icon:       'gear',
    weight:     103,
    route:      { name: ROUTE_SETTINGS },
  });

  basicType(['ai-templating-settings', HOME_TEMPLATE, CUSTOM_VIEW, TEMPLATING_CONFIG]);
}
