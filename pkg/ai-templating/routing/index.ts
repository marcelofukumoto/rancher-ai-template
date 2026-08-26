import { RouteRecordRaw } from 'vue-router';
import { PRODUCT_NAME, ROUTE_SOURCES, ROUTE_VIEW } from '../templating/template-engine';

import CustomViewSources from '../pages/CustomViewSources.vue';
import TemplateView from '../pages/TemplateView.vue';

// Cluster-scoped routes for the AI Templating product. meta.product ties them to the product
// nav so the side-nav + product switcher work.
const routes: RouteRecordRaw[] = [
  {
    name:      ROUTE_SOURCES,
    path:      `/c/:cluster/${ PRODUCT_NAME }`,
    component: CustomViewSources,
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
