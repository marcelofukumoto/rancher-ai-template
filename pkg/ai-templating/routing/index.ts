import { RouteRecordRaw } from 'vue-router';
import {
  PRODUCT_NAME, EXPLORER_PRODUCT, ROUTE_SETTINGS, ROUTE_TEMPLATES, ROUTE_VIEW, ROUTE_CANVAS,
  ROUTE_CLUSTER_VIEW, ROUTE_CLUSTER_CANVAS
} from '../templating/template-engine';

import Settings from '../pages/Settings.vue';
import TemplatesList from '../pages/TemplatesList.vue';
import TemplateView from '../pages/TemplateView.vue';
import BlankCanvas from '../pages/BlankCanvas.vue';

// Routes for the AI Templating product.
const routes: RouteRecordRaw[] = [
  {
    name:      ROUTE_SETTINGS,
    path:      `/c/:cluster/${ PRODUCT_NAME }`,
    component: Settings,
    meta:      { product: PRODUCT_NAME },
  },
  {
    name:      ROUTE_TEMPLATES,
    path:      `/c/:cluster/${ PRODUCT_NAME }/templates`,
    component: TemplatesList,
    meta:      { product: PRODUCT_NAME },
  },
  {
    name:      ROUTE_VIEW,
    path:      `/c/:cluster/${ PRODUCT_NAME }/view/:pageId`,
    component: TemplateView,
    meta:      { product: PRODUCT_NAME },
  },
  {
    name:      ROUTE_CANVAS,
    path:      `/c/:cluster/${ PRODUCT_NAME }/canvas`,
    component: BlankCanvas,
    meta:      { product: PRODUCT_NAME },
  },
  // Cluster-scoped custom views. meta.product = 'explorer' keeps the cluster explorer navbar active
  // (and this view highlighted in it) while :cluster gives the rendered view real cluster context.
  {
    name:      ROUTE_CLUSTER_VIEW,
    path:      `/c/:cluster/${ EXPLORER_PRODUCT }/${ PRODUCT_NAME }/:pageId`,
    component: TemplateView,
    meta:      { product: EXPLORER_PRODUCT },
  },
  // The Blank Canvas editor inside a cluster: the cluster is loaded (real cluster/* data), so
  // cluster-scoped views preview live. meta.product 'explorer' keeps the cluster navbar active.
  {
    name:      ROUTE_CLUSTER_CANVAS,
    path:      `/c/:cluster/${ EXPLORER_PRODUCT }/${ PRODUCT_NAME }-canvas`,
    component: BlankCanvas,
    meta:      { product: EXPLORER_PRODUCT },
  },
];

export default routes;
