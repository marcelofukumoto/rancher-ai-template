// Runtime template engine (extension edition).
//
// Reads templates from CRDs (templating.rancher.io) in the local/Rancher cluster via the
// MANAGEMENT store — so custom views, Home templates and the kill-switch config are GLOBAL —
// and registers custom-view pages under this extension's own "AI Templating" product nav.
//
// This replaces the in-core ConfigMap engine: instead of ConfigMaps in each cluster + a
// loadCluster hook, an extension owns a product and registers nav from an onEnter nav hook.

import { DSL, ROOT } from '@shell/store/type-map';
import { BLANK_CLUSTER } from '@shell/store/store-types.js';

// ---- Steve types for the CRDs (group.kind, lowercased) ----
export const CUSTOM_VIEW = 'templating.rancher.io.customview';
export const HOME_TEMPLATE = 'templating.rancher.io.hometemplate';
export const TEMPLATING_CONFIG = 'templating.rancher.io.templatingconfig';

// The TemplatingConfig singleton (kill switch + applied-Home pointer).
export const CONFIG_NAMESPACE = 'default';
export const CONFIG_NAME = 'config';
export const CONFIG_ID = `${ CONFIG_NAMESPACE }/${ CONFIG_NAME }`;

// Namespace we read/write CustomView + HomeTemplate CRs in.
export const TEMPLATE_NAMESPACE = 'default';

// This extension's product + route names (kept here so registerNav and routing/index.ts agree).
export const PRODUCT_NAME = 'ai-templating';
export const ROUTE_SETTINGS = 'ai-templating-settings';
export const ROUTE_VIEW = 'ai-templating-view';
export const ROUTE_CANVAS = 'ai-templating-canvas';

// Cluster-scoped custom views (spec.nav.scope === 'cluster') register into the core `explorer`
// product so they appear in a cluster's navbar WITH cluster context — not under our global product.
// ROUTE_CLUSTER_VIEW keeps the explorer product active (its route meta.product = 'explorer') and
// carries a real :cluster, so the rendered view can use the `cluster` store.
export const EXPLORER_PRODUCT = 'explorer';
export const ROUTE_CLUSTER_VIEW = 'ai-templating-cluster-view';
const CLUSTER_SCOPE = 'cluster';

// The Blank Canvas — a single CustomView CR used as a fast live-authoring scratchpad.
export const WHITE_CANVAS_NAME = 'white-canvas';

const DEFAULT_GROUP = 'customViews';
const DEFAULT_GROUP_WEIGHT = 50;

// Templates loaded for the current pass; read back by the generic view page via getPageRef().
let loadedTemplates = [];

// Nav-entry names registered last pass, per product (to drop entries whose CR was deleted).
let registeredNames = [];
let registeredClusterNames = [];

export function getLoadedTemplates() {
  return loadedTemplates;
}

/** Find a page (and its parent template) by page id across all loaded templates. */
export function getPageRef(pageId) {
  for (const template of loadedTemplates) {
    const page = (template.pages || []).find((p) => p.id === pageId);

    if (page) {
      return { template, page };
    }
  }

  return null;
}

/**
 * Build the internal template shape from a CustomView CR. spec is already an object (no
 * JSON.parse): { kind, meta{id,name,icon}, nav{...}, template{pages:[...]}, source }.
 */
function parseCustomView(cr) {
  const spec = cr.spec || {};
  const meta = spec.meta || {};
  const id = meta.id || cr.metadata?.name;

  if (!id) {
    console.warn('[template-engine] CustomView missing meta.id', cr.id); // eslint-disable-line no-console

    return null;
  }

  const name = meta.name || id;
  const metadata = {
    id, name, icon: meta.icon
  };

  if (spec.kind === 'code') {
    if (!spec.source) {
      console.warn('[template-engine] code CustomView missing spec.source', cr.id); // eslint-disable-line no-console

      return null;
    }

    return {
      kind:  'code',
      metadata,
      nav:   spec.nav,
      pages: [{
        id, name, source: spec.source, hidden: !!(meta.hidden || spec.nav?.hidden)
      }],
    };
  }

  const pages = spec.template?.pages;

  if (!Array.isArray(pages)) {
    console.warn('[template-engine] template CustomView missing spec.template.pages', cr.id); // eslint-disable-line no-console

    return null;
  }

  return {
    kind: 'template', metadata, nav: spec.nav, pages
  };
}

function extractTemplates(crs) {
  return (crs || []).map(parseCustomView).filter(Boolean);
}

// ---- GLOBAL KILL SWITCH (TemplatingConfig CR) ----
// spec.enabled === false disables everything. Absent, or true, means enabled (the default).
export function isTemplatingEnabled(getters) {
  const cr = getters['management/byId']?.(TEMPLATING_CONFIG, CONFIG_ID);

  return !cr || cr.spec?.enabled !== false;
}

/**
 * Flip (or set) the kill switch: ensure the TemplatingConfig CR exists, write spec.enabled,
 * and re-register nav. Home reacts on its own via the reactive management getter.
 */
export async function toggleTemplating(store, enabled) {
  const desired = typeof enabled === 'boolean' ? enabled : !isTemplatingEnabled(store.getters);
  const existing = store.getters['management/byId'](TEMPLATING_CONFIG, CONFIG_ID);

  if (existing) {
    existing.spec = { ...(existing.spec || {}), enabled: desired };
    await existing.save();
  } else {
    const cr = await store.dispatch('management/create', {
      type:     TEMPLATING_CONFIG,
      metadata: { name: CONFIG_NAME, namespace: CONFIG_NAMESPACE },
      spec:     { enabled: desired },
    });

    await cr.save();
  }

  reloadCustomViews(store);

  return desired;
}

// ---- HOME resolution (applied HomeTemplate) ----
/** The HomeTemplate name applied for a user: config.spec.home.users[userId] || .global. */
export function appliedHomeTemplateName(getters, userId) {
  const cr = getters['management/byId']?.(TEMPLATING_CONFIG, CONFIG_ID);
  const home = cr?.spec?.home || {};

  return (userId && home.users?.[userId]) || home.global || null;
}

/** All saved HomeTemplate CRs (for the editor's template picker). */
export function savedHomeTemplates(getters) {
  return getters['management/all']?.(HOME_TEMPLATE) || [];
}

/** SFC source of a HomeTemplate by name (empty string if none). */
export function homeTemplateSource(getters, name) {
  if (!name) {
    return '';
  }

  const byId = getters['management/byId']?.(HOME_TEMPLATE, `${ TEMPLATE_NAMESPACE }/${ name }`);
  const cr = byId || savedHomeTemplates(getters).find((h) => h.metadata?.name === name);

  return cr?.spec?.source || '';
}

// ---- NAV registration (into this extension's product) ----
function navGroup(group) {
  if (!group) {
    return DEFAULT_GROUP;
  }

  return `${ group }`.toLowerCase() === ROOT ? ROOT : group;
}

/** A template is cluster-scoped when its nav asks for it — those go in the cluster (explorer) nav. */
function isClusterScoped(template) {
  return (template.nav || {}).scope === CLUSTER_SCOPE;
}

// Register nav entries for one product (our global product OR the core explorer product). Returns
// the names it registered so the caller can track staleness per product. `clusterScoped` picks the
// route: cluster views route to ROUTE_CLUSTER_VIEW with NO cluster param (the Nav injects the
// current cluster); global views route to ROUTE_VIEW under BLANK_CLUSTER.
function registerNavFor(store, product, templates, clusterScoped) {
  const {
    virtualType, basicType, weightGroup, labelGroup
  } = DSL({ commit: store.commit }, product);

  const namesByGroup = {};
  const pushName = (group, name) => {
    namesByGroup[group] = namesByGroup[group] || [];
    namesByGroup[group].push(name);
  };

  templates.forEach((template) => {
    const nav = template.nav || {};
    const group = navGroup(nav.group);
    const groupWeight = typeof nav.weight === 'number' ? nav.weight : DEFAULT_GROUP_WEIGHT;

    if (group !== ROOT) {
      labelGroup(group, nav.groupLabel || 'Custom Views');
      weightGroup(group, groupWeight, true);
    }

    (template.pages || []).forEach((page) => {
      if (page.hidden) {
        return;
      }

      const name = `custom-view-${ page.id }`;

      pushName(group, name);

      const route = clusterScoped ? { name: ROUTE_CLUSTER_VIEW, params: { pageId: page.id } } : { name: ROUTE_VIEW, params: { pageId: page.id, cluster: BLANK_CLUSTER } };

      virtualType({
        label:      page.name,
        group,
        namespaced: false,
        name,
        icon:       template.metadata?.icon || 'compass',
        weight:     -10,
        route,
        exact:      true,
      });
    });
  });

  Object.entries(namesByGroup).forEach(([group, names]) => basicType(names, group));

  return Object.values(namesByGroup).flat();
}

// Register a nav entry per RENDERED custom-view page (the actual runtime-compiled views). Global
// views go in our product's nav; cluster-scoped ones go in the core `explorer` product so they show
// in a cluster's navbar with cluster context. The CR-type LISTS (Custom Views / Home Templates
// management) are registered separately as proper resource lists in product.ts.
function registerNav(store) {
  const global = loadedTemplates.filter((t) => !isClusterScoped(t));
  const cluster = loadedTemplates.filter(isClusterScoped);

  const currentNames = registerNavFor(store, PRODUCT_NAME, global, false);
  const currentClusterNames = registerNavFor(store, EXPLORER_PRODUCT, cluster, true);

  pruneStale(store, PRODUCT_NAME, registeredNames, currentNames);
  pruneStale(store, EXPLORER_PRODUCT, registeredClusterNames, currentClusterNames);

  registeredNames = currentNames;
  registeredClusterNames = currentClusterNames;

  refreshSideNav();
}

// Force the core SideNav to rebuild its groups. Our virtualTypes register into the type-map AFTER
// the nav has already built (especially on a hard reload that lands directly in a cluster), and the
// SideNav only rebuilds on a few watched values — none of which our registration changes. Rather
// than fight that, find the SideNav instance in the live component tree and call getGroups().
function refreshSideNav() {
  try {
    const app = window.$globalApp;
    const root = app?.$?.subTree;

    if (!root) {
      return;
    }

    const seen = new Set();
    const stack = [root];

    while (stack.length) {
      const vnode = stack.pop();

      if (!vnode || typeof vnode !== 'object' || seen.has(vnode)) {
        continue;
      }
      seen.add(vnode);

      const comp = vnode.component;

      if (comp?.proxy && typeof comp.proxy.getGroups === 'function') {
        comp.proxy.getGroups();

        return;
      }

      if (comp?.subTree) {
        stack.push(comp.subTree);
      }

      if (Array.isArray(vnode.children)) {
        vnode.children.forEach((c) => stack.push(c));
      }
    }
  } catch (e) { /* best-effort nav refresh */ }
}

/** Drop nav entries (in `product`) whose CR was deleted since the last pass. */
function pruneStale(store, product, previous, current) {
  const currentSet = new Set(current);
  const stale = previous.filter((name) => !currentSet.has(name));

  if (stale.length) {
    store.commit('type-map/removeTypes', { product, names: stale });
  }
}

/** Remove all dynamic rendered-view nav entries (disabled state), in both products. The static
 * product nav (Settings + CR-type lists) stays, so the feature can be managed / turned back on. */
function clearEngineNav(store) {
  if (registeredNames.length) {
    store.commit('type-map/removeTypes', { product: PRODUCT_NAME, names: registeredNames });
    registeredNames = [];
  }

  if (registeredClusterNames.length) {
    store.commit('type-map/removeTypes', { product: EXPLORER_PRODUCT, names: registeredClusterNames });
    registeredClusterNames = [];
  }
}

/**
 * Load CustomView CRs and (re)register nav. Called from the extension's onEnter nav hook and
 * from reloadCustomViews. Swallows errors so a bad template never blocks navigation.
 */
export async function loadCustomViews(store) {
  loadedTemplates = [];

  try {
    // Load the kill-switch config first, then bail (Sources-only) if disabled.
    try {
      await store.dispatch('management/find', { type: TEMPLATING_CONFIG, id: CONFIG_ID });
    } catch (e) { /* absent/forbidden -> treated as enabled */ }

    if (!isTemplatingEnabled(store.getters)) {
      clearEngineNav(store);

      return;
    }

    if (store.getters['management/schemaFor'](CUSTOM_VIEW)) {
      const crs = await store.dispatch('management/findAll', { type: CUSTOM_VIEW });

      loadedTemplates = extractTemplates(crs);
    }

    registerNav(store);
  } catch (e) {
    console.warn('[template-engine] loadCustomViews failed', e); // eslint-disable-line no-console
  }
}

/** Live re-registration from the store cache (no fetch). */
export function reloadCustomViews(store) {
  try {
    loadedTemplates = [];

    if (!isTemplatingEnabled(store.getters)) {
      clearEngineNav(store);

      return;
    }

    if (store.getters['management/schemaFor'](CUSTOM_VIEW)) {
      loadedTemplates = extractTemplates(store.getters['management/all'](CUSTOM_VIEW));
    }

    registerNav(store);
  } catch (e) {
    console.warn('[template-engine] reloadCustomViews failed', e); // eslint-disable-line no-console
  }
}
