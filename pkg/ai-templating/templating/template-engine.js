// Runtime template engine (extension edition).
//
// Reads templates from CRDs (templating.rancher.io) in the local/Rancher cluster via the
// MANAGEMENT store — so custom views, Home templates and the kill-switch config are GLOBAL —
// and registers custom-view pages under this extension's own "AI Templating" product nav.
//
// This replaces the in-core ConfigMap engine: instead of ConfigMaps in each cluster + a
// loadCluster hook, an extension owns a product and registers nav from an onEnter nav hook.

import { DSL, ROOT } from '@shell/store/type-map';

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
export const ROUTE_SOURCES = 'ai-templating-sources';
export const ROUTE_VIEW = 'ai-templating-view';

const SOURCES_TYPE = 'custom-view-sources';
const DEFAULT_GROUP = 'customViews';
const DEFAULT_GROUP_WEIGHT = 50;

// Templates loaded for the current pass; read back by the generic view page via getPageRef().
let loadedTemplates = [];

// Nav-entry names registered last pass (to drop entries whose CR was deleted).
let registeredNames = [];

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

function addSourcesEntry({ virtualType, labelGroup, weightGroup }, pushName) {
  labelGroup(DEFAULT_GROUP, 'Custom Views');
  weightGroup(DEFAULT_GROUP, DEFAULT_GROUP_WEIGHT, true);

  if (pushName) {
    pushName(DEFAULT_GROUP, SOURCES_TYPE);
  }

  virtualType({
    label:      'Custom View Sources',
    group:      DEFAULT_GROUP,
    namespaced: false,
    name:       SOURCES_TYPE,
    icon:       'file',
    weight:     -100,
    route:      { name: ROUTE_SOURCES },
    exact:      true,
  });
}

function registerNav(store) {
  const {
    virtualType, basicType, weightGroup, labelGroup
  } = DSL({ commit: store.commit }, PRODUCT_NAME);

  const namesByGroup = {};
  const pushName = (group, name) => {
    namesByGroup[group] = namesByGroup[group] || [];
    namesByGroup[group].push(name);
  };

  loadedTemplates.forEach((template) => {
    const nav = template.nav || {};
    const group = navGroup(nav.group);
    const groupWeight = typeof nav.weight === 'number' ? nav.weight : DEFAULT_GROUP_WEIGHT;

    if (group !== ROOT) {
      if (nav.groupLabel) {
        labelGroup(group, nav.groupLabel);
      }
      weightGroup(group, groupWeight, true);
    }

    (template.pages || []).forEach((page) => {
      if (page.hidden) {
        return;
      }

      const name = `custom-view-${ page.id }`;

      pushName(group, name);

      virtualType({
        label:      page.name,
        group,
        namespaced: false,
        name,
        icon:       template.metadata?.icon || 'compass',
        weight:     -10,
        route:      { name: ROUTE_VIEW, params: { pageId: page.id } },
        exact:      true,
      });
    });
  });

  // The Custom View Sources control entry is ALWAYS present.
  addSourcesEntry({
    virtualType, labelGroup, weightGroup
  }, pushName);

  Object.entries(namesByGroup).forEach(([group, names]) => basicType(names, group));

  const currentNames = Object.values(namesByGroup).flat();
  const currentSet = new Set(currentNames);
  const staleNames = registeredNames.filter((name) => !currentSet.has(name));

  if (staleNames.length) {
    store.commit('type-map/removeTypes', { product: PRODUCT_NAME, names: staleNames });
  }

  registeredNames = currentNames;
}

/** Disabled-state nav: only the Sources control entry, so the feature can be turned back on. */
function registerSourcesOnly(store) {
  const {
    virtualType, labelGroup, weightGroup, basicType
  } = DSL({ commit: store.commit }, PRODUCT_NAME);

  addSourcesEntry({
    virtualType, labelGroup, weightGroup
  });
  basicType([SOURCES_TYPE], DEFAULT_GROUP);

  const staleNames = registeredNames.filter((name) => name !== SOURCES_TYPE);

  if (staleNames.length) {
    store.commit('type-map/removeTypes', { product: PRODUCT_NAME, names: staleNames });
  }
  registeredNames = [SOURCES_TYPE];
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
      registerSourcesOnly(store);

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
      registerSourcesOnly(store);

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
