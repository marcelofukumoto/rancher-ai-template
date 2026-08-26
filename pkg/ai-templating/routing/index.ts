import { RouteRecordRaw } from 'vue-router';
import { PRODUCT_NAME, ROUTE_SETTINGS, ROUTE_VIEW } from '../templating/template-engine';

import Settings from '../pages/Settings.vue';
import TemplateView from '../pages/TemplateView.vue';

// Cluster-scoped routes for the AI Templating product. The CR-type lists use the core generic
// resource routes (registered via basicType in product.ts); these are the custom pages.
const routes: RouteRecordRaw[] = [
  {
    name:      ROUTE_SETTINGS,
    path:      `/c/:cluster/${ PRODUCT_NAME }`,
    component: Settings,
    meta:      { product: PRODUCT_NAME },
  },
  {
    name:      ROUTE_VIEW,
    path:      `/c/:cluster/${ PRODUCT_NAME }/view/:pageId`,
    component: TemplateView,
    meta:      { product: PRODUCT_NAME },
  },
];

export default routes;
