// Runtime template engine (extension edition) — ConfigMap storage.
//
// Custom views, Home templates and the kill-switch config are stored as labeled ConfigMaps in the
// local cluster's `default` namespace, read via the MANAGEMENT store (Steve `/v1/`). ConfigMaps are
// used (instead of a templating.rancher.io CRD) because the Rancher AI MCP server can only write a
// fixed allow-list of kinds — ConfigMaps are on it, custom CRDs are not — so this is what lets the
// AI agents actually edit templates. The SFC lives in data['view.vue']; metadata/nav are JSON.

import { DSL, ROOT } from '@shell/store/type-map';
import { BLANK_CLUSTER } from '@shell/store/store-types.js';

// ---- ConfigMap storage ----
export const CONFIGMAP = 'configmap';
export const TEMPLATE_NAMESPACE = 'default';

// One marker label selects every templating ConfigMap (so we load only these, not the whole cluster);
// a type label distinguishes them.
export const LABEL_MARKER = 'templates.rancher.io/ai-templating';
export const LABEL_TYPE = 'templates.rancher.io/type';
export const TYPE_VIEW = 'custom-view';
export const TYPE_HOME = 'home-template';
export const TYPE_CONFIG = 'config';

// ConfigMap data keys.
export const SFC_KEY = 'view.vue'; // the Vue SFC (what the AI edits)

// The singleton config ConfigMap (kill switch + applied-Home pointer).
export const CONFIG_NAME = 'templating-config';
export const CONFIG_ID = `${ TEMPLATE_NAMESPACE }/${ CONFIG_NAME }`;

// This extension's product + route names (kept here so registerNav and routing/index.ts agree).
export const PRODUCT_NAME = 'ai-templating';
export const ROUTE_SETTINGS = 'ai-templating-settings';
export const ROUTE_TEMPLATES = 'ai-templating-templates';
export const ROUTE_VIEW = 'ai-templating-view';
export const ROUTE_CANVAS = 'ai-templating-canvas';

// Cluster-scoped custom views (nav.scope === 'cluster') register into the core `explorer` product so
// they appear in a cluster's navbar WITH cluster context — not under our global product.
export const EXPLORER_PRODUCT = 'explorer';
export const ROUTE_CLUSTER_VIEW = 'ai-templating-cluster-view';
export const ROUTE_CLUSTER_CANVAS = 'ai-templating-cluster-canvas';
const CLUSTER_SCOPE = 'cluster';

// Scratch ConfigMaps the Blank Canvas defaults to: one global, one per-cluster (cluster-scoped).
export const BLANK_CANVAS_NAME = 'blank-canvas';
export const CLUSTER_CANVAS_NAME = 'cluster-canvas';

const DEFAULT_GROUP = 'customViews';
const DEFAULT_GROUP_WEIGHT = 50;

// Load-time cache. Populated once (findAll) so getters below are cheap + reactive off the store.
let loadedTemplates = [];
let registeredNames = [];
let registeredClusterNames = [];

// ---- ConfigMap helpers ----
function safeParse(str, fallback) {
  if (!str) {
    return fallback;
  }
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}

function labelOf(cm, key) {
  return cm?.metadata?.labels?.[key];
}

/** Every templating ConfigMap currently in the management store cache (marker-labeled). */
function templatingCMs(getters) {
  return (getters['management/all']?.(CONFIGMAP) || []).filter((cm) => labelOf(cm, LABEL_MARKER) === 'true');
}

function cmsOfType(getters, type) {
  return templatingCMs(getters).filter((cm) => labelOf(cm, LABEL_TYPE) === type);
}

function cmById(getters, name) {
  return getters['management/byId']?.(CONFIGMAP, `${ TEMPLATE_NAMESPACE }/${ name }`) ||
    templatingCMs(getters).find((cm) => cm.metadata?.name === name);
}

/** Normalize a custom-view ConfigMap into the internal { id, metadata, spec } shape used everywhere. */
function cmToView(cm) {
  const d = cm.data || {};

  return {
    id:       cm.id,
    metadata: cm.metadata,
    spec:     {
      kind:     d.kind || 'code',
      meta:     safeParse(d.meta, {}),
      nav:      safeParse(d.nav, {}),
      source:   d[SFC_KEY] || d.source || '',
      template: safeParse(d.template, null),
    },
  };
}

/** Build the ConfigMap `data` object for a custom view. */
function viewData({
  kind, meta, nav, source, template
}) {
  const data = {
    kind: kind || 'code', [SFC_KEY]: source || '', meta: JSON.stringify(meta || {})
  };

  if (nav && Object.keys(nav).length) {
    data.nav = JSON.stringify(nav);
  }
  if (template) {
    data.template = JSON.stringify(template);
  }

  return data;
}

const viewLabels = { [LABEL_MARKER]: 'true', [LABEL_TYPE]: TYPE_VIEW };
const homeLabels = { [LABEL_MARKER]: 'true', [LABEL_TYPE]: TYPE_HOME };
const configLabels = { [LABEL_MARKER]: 'true', [LABEL_TYPE]: TYPE_CONFIG };

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

/** Build the internal template shape from a normalized view ({ id, metadata, spec }). */
function parseCustomView(view) {
  const spec = view.spec || {};
  const meta = spec.meta || {};
  const id = meta.id || view.metadata?.name;

  if (!id) {
    return null;
  }

  const name = meta.name || id;
  const metadata = {
    id, name, icon: meta.icon
  };

  if (spec.kind === 'code') {
    if (!spec.source) {
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
    return null;
  }

  return {
    kind: 'template', metadata, nav: spec.nav, pages
  };
}

function extractTemplates(getters) {
  return cmsOfType(getters, TYPE_VIEW).map(cmToView).map(parseCustomView).filter(Boolean);
}

// ---- GLOBAL KILL SWITCH (config ConfigMap) ----
// data.enabled === 'false' disables everything. Absent, or 'true', means enabled (the default).
export function isTemplatingEnabled(getters) {
  const cm = cmById(getters, CONFIG_NAME);

  return !cm || cm.data?.enabled !== 'false';
}

/** Flip (or set) the kill switch, then re-register nav. */
export async function toggleTemplating(store, enabled) {
  const desired = typeof enabled === 'boolean' ? enabled : !isTemplatingEnabled(store.getters);
  const existing = cmById(store.getters, CONFIG_NAME);

  if (existing) {
    existing.data = { ...(existing.data || {}), enabled: desired ? 'true' : 'false' };
    await existing.save();
  } else {
    const cm = await store.dispatch('management/create', {
      type:     CONFIGMAP,
      metadata: {
        name: CONFIG_NAME, namespace: TEMPLATE_NAMESPACE, labels: configLabels
      },
      data: { enabled: desired ? 'true' : 'false' },
    });

    await cm.save();
  }

  reloadCustomViews(store);

  return desired;
}

// ---- HOME resolution (applied Home template) ----
function homeConfig(getters) {
  return safeParse(cmById(getters, CONFIG_NAME)?.data?.home, {});
}

/** The Home template name applied for a user: home.users[userId] || home.global. */
export function appliedHomeTemplateName(getters, userId) {
  return appliedHomeScopes(getters, userId).resolved;
}

/**
 * The applied Home template names split by scope, plus the one THIS user actually sees.
 * A per-user pick (home.users[userId]) overrides the global default, so `resolved = user || global`.
 * Lets the editor identify each template correctly (global default vs. your personal Home).
 */
export function appliedHomeScopes(getters, userId) {
  const home = homeConfig(getters);
  const global = home.global || null;
  const user = (userId && home.users?.[userId]) || null;

  return {
    global, user, resolved: user || global
  };
}

/** All saved Home templates (normalized) for the editor's picker. */
export function savedHomeTemplates(getters) {
  return cmsOfType(getters, TYPE_HOME).map((cm) => ({
    metadata: cm.metadata,
    spec:     { displayName: cm.data?.displayName || cm.metadata?.name, source: cm.data?.[SFC_KEY] || cm.data?.source || '' },
  }));
}

/** SFC source of a Home template by name (empty string if none). */
export function homeTemplateSource(getters, name) {
  if (!name) {
    return '';
  }

  const cm = cmById(getters, name);

  return cm?.data?.[SFC_KEY] || cm?.data?.source || '';
}

// ---- HOME DASHBOARD (grid of template panels, in tabs) ----
// The applied Home per scope is a DASHBOARD — one or more tabs, each a 12-column grid of template
// panels ({ template, x, y, w, h }). It is stored inline in the config ConfigMap's home.{global,users}
// (replacing the legacy single-template-name string, which is migrated on read to a 1-panel dashboard).

let idSeq = 0;

function uid(prefix) {
  idSeq += 1;

  return `${ prefix }-${ Date.now().toString(36) }${ idSeq.toString(36) }`;
}

export function newTab(name) {
  return {
    id: uid('tab'), name: name || 'Tab', panels: []
  };
}

export function emptyDashboard() {
  return { tabs: [newTab('Home')] };
}

/** Coerce a stored home value (undefined | legacy string | dashboard object) into a valid dashboard. */
export function migrateToDashboard(value) {
  if (value && typeof value === 'object' && Array.isArray(value.tabs)) {
    const tabs = value.tabs
      .filter((t) => t && typeof t === 'object')
      .map((t) => ({
        id:     t.id || uid('tab'),
        name:   t.name || 'Tab',
        panels: (Array.isArray(t.panels) ? t.panels : [])
          .filter((p) => p && p.template)
          .map((p) => ({
            id:       p.id || uid('panel'),
            template: p.template,
            x:        Number(p.x) || 0,
            y:        Number(p.y) || 0,
            w:        Number(p.w) || 6,
            h:        Number(p.h) || 5,
          })),
      }));

    return { tabs: tabs.length ? tabs : [newTab('Home')] };
  }

  if (typeof value === 'string' && value) {
    // Legacy single applied template -> one tab, one full-width panel.
    return {
      tabs: [{
        id:     uid('tab'),
        name:   'Home',
        panels: [{
          id: uid('panel'), template: value, x: 0, y: 0, w: 12, h: 8
        }],
      }],
    };
  }

  return emptyDashboard();
}

/**
 * Applied Home dashboards split by scope + the one THIS user actually sees (user overrides global).
 * `global`/`user` are null when that scope has nothing applied; `resolved` is the migrated dashboard
 * (or null) the user should see.
 */
export function appliedDashboardScopes(getters, userId) {
  const home = homeConfig(getters);
  const rawGlobal = home.global || null;
  const rawUser = (userId && home.users?.[userId]) || null;
  const rawResolved = rawUser || rawGlobal;

  return {
    global:    rawGlobal ? migrateToDashboard(rawGlobal) : null,
    user:      rawUser ? migrateToDashboard(rawUser) : null,
    resolved:  rawResolved ? migrateToDashboard(rawResolved) : null,
    hasGlobal: !!rawGlobal,
    hasUser:   !!rawUser,
  };
}

// ---- NAV registration (unchanged from the CRD version) ----
function navGroup(group) {
  if (!group) {
    return DEFAULT_GROUP;
  }

  return `${ group }`.toLowerCase() === ROOT ? ROOT : group;
}

function isClusterScoped(template) {
  return (template.nav || {}).scope === CLUSTER_SCOPE;
}

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

    if (group !== ROOT) {
      if (!nav.group) {
        labelGroup(group, 'Custom Views');
        weightGroup(group, DEFAULT_GROUP_WEIGHT, true);
      } else {
        if (nav.groupLabel) {
          labelGroup(group, nav.groupLabel);
        }
        if (typeof nav.weight === 'number') {
          weightGroup(group, nav.weight, true);
        }
      }
    }

    (template.pages || []).forEach((page) => {
      if (page.hidden) {
        return;
      }

      const name = `custom-view-${ page.id }`;

      pushName(group, name);

      const route = clusterScoped ? { name: ROUTE_CLUSTER_VIEW, params: { pageId: page.id } } : { name: ROUTE_VIEW, params: { pageId: page.id, cluster: BLANK_CLUSTER } };
      const itemWeight = typeof nav.itemWeight === 'number' ? nav.itemWeight : -10;

      virtualType({
        label:      page.name,
        group,
        namespaced: false,
        name,
        icon:       template.metadata?.icon || 'compass',
        weight:     itemWeight,
        route,
        exact:      true,
      });
    });
  });

  Object.entries(namesByGroup).forEach(([group, names]) => basicType(names, group));

  return Object.values(namesByGroup).flat();
}

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

// Force the core SideNav to rebuild its groups (our virtualTypes register after the nav has built).
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

function pruneStale(store, product, previous, current) {
  const currentSet = new Set(current);
  const stale = previous.filter((name) => !currentSet.has(name));

  if (stale.length) {
    store.commit('type-map/removeTypes', { product, names: stale });
  }
}

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

// Fetch the templating ConfigMaps (marker-labeled only) into the management store cache. Shared by
// the nav loader and the editors so we never pull every ConfigMap in the cluster.
export async function fetchTemplatingConfigMaps(store) {
  if (!store.getters['management/schemaFor'](CONFIGMAP)) {
    return [];
  }

  const url = `/v1/configmaps?labelSelector=${ encodeURIComponent(`${ LABEL_MARKER }=true`) }`;

  return store.dispatch('management/findAll', { type: CONFIGMAP, opt: { url, force: true } }).catch(() => []);
}

// Load templating ConfigMaps (marker-labeled only) and (re)register nav.
export async function loadCustomViews(store) {
  loadedTemplates = [];

  try {
    await fetchTemplatingConfigMaps(store);

    if (!isTemplatingEnabled(store.getters)) {
      clearEngineNav(store);

      return;
    }

    loadedTemplates = extractTemplates(store.getters);
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

    loadedTemplates = extractTemplates(store.getters);
    registerNav(store);
  } catch (e) {
    console.warn('[template-engine] reloadCustomViews failed', e); // eslint-disable-line no-console
  }
}

// ---- CUSTOM VIEW EDITOR helpers (Blank Canvas) ----

/** All custom views (normalized { id, metadata, spec }) for the editor's Load picker. */
export function allCustomViews(getters) {
  return cmsOfType(getters, TYPE_VIEW).map(cmToView);
}

/** One custom view by name (normalized), or null. */
export function customViewByName(getters, name) {
  const cm = cmById(getters, name);

  return cm && labelOf(cm, LABEL_TYPE) === TYPE_VIEW ? cmToView(cm) : null;
}

/** Create-or-update a custom-view ConfigMap from the editor, then re-register nav. */
export async function saveCustomView(store, opts) {
  const {
    name, source, kind = 'code', displayName, icon, scope, group, groupLabel, weight, itemWeight
  } = opts;

  const nav = {};

  if (scope) {
    nav.scope = scope;
  }
  if (group) {
    nav.group = group;
  }
  if (groupLabel) {
    nav.groupLabel = groupLabel;
  }
  if (typeof weight === 'number' && !Number.isNaN(weight)) {
    nav.weight = weight;
  }
  if (typeof itemWeight === 'number' && !Number.isNaN(itemWeight)) {
    nav.itemWeight = itemWeight;
  }

  const meta = { id: name, name: displayName || name };

  if (icon) {
    meta.icon = icon;
  }

  const existing = cmById(store.getters, name);

  if (existing && labelOf(existing, LABEL_TYPE) === TYPE_VIEW) {
    const prevMeta = safeParse(existing.data?.meta, {});

    existing.data = viewData({
      kind, meta: { ...prevMeta, ...meta }, nav, source
    });
    await existing.save();
  } else {
    const cm = await store.dispatch('management/create', {
      type:     CONFIGMAP,
      metadata: {
        name, namespace: TEMPLATE_NAMESPACE, labels: viewLabels
      },
      data: viewData({
        kind, meta, nav, source
      }),
    });

    await cm.save();
  }

  reloadCustomViews(store);
}

/** Create-or-update a Home template ConfigMap (used by the Home editor). */
export async function saveHomeTemplate(store, { name, source, displayName }) {
  const existing = cmById(store.getters, name);
  const data = { [SFC_KEY]: source || '', displayName: displayName || name };

  if (existing && labelOf(existing, LABEL_TYPE) === TYPE_HOME) {
    existing.data = { ...(existing.data || {}), ...data };
    await existing.save();

    return existing;
  }

  const cm = await store.dispatch('management/create', {
    type:     CONFIGMAP,
    metadata: {
      name, namespace: TEMPLATE_NAMESPACE, labels: homeLabels
    },
    data,
  });

  await cm.save();

  return cm;
}

/** Persist the applied-Home map back onto the config ConfigMap (create it if missing). */
async function persistHome(store, home) {
  const existing = cmById(store.getters, CONFIG_NAME);

  if (existing && labelOf(existing, LABEL_TYPE) === TYPE_CONFIG) {
    existing.data = {
      ...(existing.data || {}), enabled: existing.data?.enabled === 'false' ? 'false' : 'true', home: JSON.stringify(home)
    };
    await existing.save();
  } else {
    const cm = await store.dispatch('management/create', {
      type:     CONFIGMAP,
      metadata: {
        name: CONFIG_NAME, namespace: TEMPLATE_NAMESPACE, labels: configLabels
      },
      data: { enabled: 'true', home: JSON.stringify(home) },
    });

    await cm.save();
  }
}

/** Repoint the applied Home (global or per-user) to a Home template name. */
export async function applyHome(store, scope, name, userId) {
  const home = safeParse(cmById(store.getters, CONFIG_NAME)?.data?.home, {});

  if (scope === 'user') {
    if (!userId) {
      return;
    }
    home.users = { ...(home.users || {}), [userId]: name };
  } else {
    home.global = name;
  }

  await persistHome(store, home);
}

/** Persist a whole Home DASHBOARD (tabs + panels) for a scope. Passing null clears that scope. */
export async function saveDashboard(store, scope, dashboard, userId) {
  const home = safeParse(cmById(store.getters, CONFIG_NAME)?.data?.home, {});

  if (scope === 'user') {
    if (!userId) {
      return;
    }
    if (dashboard) {
      home.users = { ...(home.users || {}), [userId]: dashboard };
    } else if (home.users) {
      delete home.users[userId];
    }
  } else if (dashboard) {
    home.global = dashboard;
  } else {
    delete home.global;
  }

  await persistHome(store, home);
}

/** Unset the applied Home for a scope (global default, or this user's personal pick). */
export async function clearHome(store, scope, userId) {
  const home = safeParse(cmById(store.getters, CONFIG_NAME)?.data?.home, {});

  if (scope === 'user') {
    if (!userId || !home.users) {
      return;
    }
    delete home.users[userId];
  } else {
    delete home.global;
  }

  await persistHome(store, home);
}

/**
 * Build the target nav as { group -> items } for the placement UI, using the same type-map getTree
 * the SideNav uses.
 */
export function navTreeFor(store, product, clusterId) {
  try {
    const all = store.getters['type-map/allTypes'](product, ['basic']) || {};
    const tree = store.getters['type-map/getTree'](product, 'basic', all.basic || {}, clusterId, 'both', null, null) || [];

    return tree.map((grp) => ({
      name:   grp.name,
      label:  (grp.label || grp.name || '').replace(/<[^>]*>/g, '').trim(),
      weight: grp.weight,
      items:  (grp.children || []).map((c) => ({
        name:   c.name,
        label:  (c.labelDisplay || c.label || c.name || '').replace(/<[^>]*>/g, '').trim(),
        weight: c.weight,
      })),
    }));
  } catch (e) {
    console.warn('[template-engine] navTreeFor failed', e); // eslint-disable-line no-console

    return [];
  }
}
