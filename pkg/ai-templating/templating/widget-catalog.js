// The component catalog behind the editor's "Add" tab.
//
// Two lists, and the difference between them is the whole idea:
//
//   BUILDING BLOCKS  a shape with no data yet. Drop one on the grid and it asks what to show —
//                    any resource Rancher knows about, including your own CRDs.
//   READY-MADE       the same building blocks with their data already set, so the common
//                    dashboards are one drag away.
//
// Pure data — no Vue, no store. `spec` is a WIDGET spec (see normalizeWidget in view-model.js);
// `span` is the column width the widget lands on the grid with.

import {
  MANAGEMENT, CAPI, EVENT, FLEET, LONGHORN
} from '@shell/config/types';

/** Every widget kind the renderer knows. */
export const WIDGET_TABLE = 'table';
export const WIDGET_COUNTERS = 'counters';
export const WIDGET_STATUS_SUMMARY = 'statusSummary';
export const WIDGET_LIST = 'list';
export const WIDGET_BAR_CHART = 'barChart';
export const WIDGET_TIME_SERIES = 'timeSeries';
export const WIDGET_TEXT = 'text';
export const WIDGET_LINKS = 'links';
export const WIDGET_BANNER = 'banner';
export const WIDGET_CLUSTER_TABLE = 'clusterTable';

/** The resource a fresh building block starts on — the one every Rancher install has. */
const CLUSTER = CAPI.RANCHER_CLUSTER;

/**
 * BUILDING BLOCKS — "Any resource, including your own CRDs."
 * `icon` is the little preview drawn on the tile (see CatalogTile.vue).
 */
export const BUILDING_BLOCKS = [
  {
    id:   WIDGET_TABLE,
    name: 'Table',
    desc: 'Rows of a resource with the columns you pick',
    icon: 'table',
    span: 8,
    spec: {
      kind: WIDGET_TABLE, title: 'Table', resource: CLUSTER, columns: ['state', 'name', 'provider', 'version', 'nodes', 'cpu'], sortBy: 'name'
    },
  },
  {
    id:   WIDGET_COUNTERS,
    name: 'Counters',
    desc: 'Numbers with labels, such as clusters by state',
    icon: 'counters',
    span: 4,
    spec: {
      kind: WIDGET_COUNTERS, title: 'Counters', resource: CLUSTER, groupBy: 'state'
    },
  },
  {
    id:   WIDGET_STATUS_SUMMARY,
    name: 'Status summary',
    desc: 'Items grouped by state',
    icon: 'status',
    span: 4,
    spec: {
      kind: WIDGET_STATUS_SUMMARY, title: 'Status summary', resource: CLUSTER, groupBy: 'state'
    },
  },
  {
    id:   WIDGET_LIST,
    name: 'List',
    desc: 'A compact feed: alerts, events, commits',
    icon: 'list',
    span: 4,
    spec: {
      kind: WIDGET_LIST, title: 'List', resource: CLUSTER, limit: 5, sortBy: 'name'
    },
  },
  {
    id:   WIDGET_BAR_CHART,
    name: 'Bar chart',
    desc: 'A resource grouped by one field',
    icon: 'bars',
    span: 4,
    spec: {
      kind: WIDGET_BAR_CHART, title: 'Bar chart', resource: CLUSTER, groupBy: 'version'
    },
  },
  {
    id:   WIDGET_TIME_SERIES,
    name: 'Time series',
    desc: 'A Grafana panel',
    icon: 'timeseries',
    span: 6,
    spec: { kind: WIDGET_TIME_SERIES, title: 'Metrics' },
  },
  {
    id:   WIDGET_TEXT,
    name: 'Text',
    desc: 'Markdown for runbooks and contacts',
    icon: 'text',
    span: 4,
    spec: {
      kind: WIDGET_TEXT, title: 'Text', body: ''
    },
  },
  {
    id:   WIDGET_LINKS,
    name: 'Links',
    desc: 'Your own list of links',
    icon: 'links',
    span: 4,
    spec: { kind: WIDGET_LINKS, source: 'custom' },
  },
];

/**
 * READY-MADE — "Building blocks with their data already set."
 * Each is one of the blocks above with a resource, columns and sort already chosen.
 */
export const READY_MADE = [
  {
    id:   'home-cluster-table',
    name: 'Home cluster table',
    desc: "The Home's own cluster table, exactly as it is",
    icon: 'table',
    span: 12,
    // Not the Table block pointed at clusters — the real cluster section from the stock Home, with
    // its own columns, sorting and buttons. Nothing to set up.
    spec: { kind: WIDGET_CLUSTER_TABLE, title: '' },
  },
  {
    id:   'cluster-list',
    name: 'Cluster list',
    desc: 'Table of Cluster',
    icon: 'table',
    span: 8,
    spec: {
      kind:     WIDGET_TABLE,
      title:    'Clusters',
      resource: CLUSTER,
      columns:  ['state', 'name', 'provider', 'version', 'nodes', 'cpu'],
      sortBy:   'name',
    },
  },
  {
    id:   'cluster-health',
    name: 'Cluster health',
    desc: 'Counters of Cluster by state',
    icon: 'counters',
    span: 4,
    spec: {
      kind: WIDGET_COUNTERS, title: 'Cluster health', resource: CLUSTER, groupBy: 'state'
    },
  },
  {
    id:   'active-alerts',
    name: 'Active alerts',
    desc: 'Clusters that need attention, worst first',
    icon: 'list',
    span: 4,
    // Deliberately CLUSTERS, not an Alert CRD: the Home sits outside any cluster, so cluster-scoped
    // alerts are not there to read. What a Home can genuinely answer — and what the design's own
    // alert lines are about ("prod-eu-1: node not ready") — is which clusters are unhealthy.
    spec: {
      kind: WIDGET_LIST, title: 'Active alerts', resource: CLUSTER, filter: 'state != Active', limit: 5, sortBy: 'state'
    },
  },
  {
    id:   'upgrade-status',
    name: 'Upgrade status',
    desc: 'Bar chart of Cluster by Kubernetes version',
    icon: 'bars',
    span: 4,
    spec: {
      kind: WIDGET_BAR_CHART, title: 'Upgrade status', resource: CLUSTER, groupBy: 'version'
    },
  },
  {
    id:   'longhorn-volumes',
    name: 'Longhorn volume health',
    desc: 'Status summary of Volume',
    icon: 'status',
    span: 4,
    spec: {
      kind: WIDGET_STATUS_SUMMARY, title: 'Longhorn volume health', resource: LONGHORN.VOLUMES, groupBy: 'state'
    },
  },
  {
    id:   'gitrepo-sync',
    name: 'GitRepo sync status',
    desc: 'Status summary of GitRepo',
    icon: 'status',
    span: 4,
    spec: {
      kind: WIDGET_STATUS_SUMMARY, title: 'GitRepo sync status', resource: FLEET.GIT_REPO, groupBy: 'state'
    },
  },
  {
    id:   'announcement',
    name: 'Announcement',
    desc: 'Text, editable by admins only',
    icon: 'text',
    span: 12,
    spec: {
      kind: WIDGET_TEXT, title: 'Announcement', body: 'Write your message here. **Markdown** works.'
    },
  },
  {
    id:   'welcome-banner',
    name: 'Welcome banner',
    desc: 'The Rancher banner across the top',
    icon: 'banner',
    span: 12,
    spec: { kind: WIDGET_BANNER, title: '' },
  },
  {
    id:   'community-links',
    name: 'Community links',
    desc: "Rancher's own Docs / Forums / Slack list",
    icon: 'links',
    span: 4,
    spec: { kind: WIDGET_LINKS, source: 'home' },
  },
];

/** Look up a catalog entry (either list) by id. */
export function catalogEntry(id) {
  return BUILDING_BLOCKS.find((b) => b.id === id) || READY_MADE.find((r) => r.id === id) || null;
}

/** The building block a widget kind came from — for the "Selected: Clusters (Table)" label. */
export function blockName(kind) {
  return BUILDING_BLOCKS.find((b) => b.id === kind)?.name ||
    READY_MADE.find((r) => r.spec.kind === kind)?.name ||
    kind;
}

/** Case-insensitive search over a catalog list (name + description), as the Add tab's box does. */
export function searchCatalog(list, query) {
  const needle = `${ query || '' }`.trim().toLowerCase();

  if (!needle) {
    return list;
  }

  return list.filter((entry) => `${ entry.name } ${ entry.desc }`.toLowerCase().includes(needle));
}

/**
 * The resources offered in a widget's "Resource" picker. Any type Rancher knows can be typed in,
 * but these are the ones worth suggesting.
 */
export const SUGGESTED_RESOURCES = [
  { value: CAPI.RANCHER_CLUSTER, label: 'Cluster (provisioning.cattle.io)' },
  { value: MANAGEMENT.CLUSTER, label: 'Cluster (management.cattle.io)' },
  { value: MANAGEMENT.NODE, label: 'Node (management.cattle.io)' },
  { value: MANAGEMENT.PROJECT, label: 'Project (management.cattle.io)' },
  { value: MANAGEMENT.USER, label: 'User (management.cattle.io)' },
  { value: EVENT, label: 'Event (v1)' },
  { value: FLEET.GIT_REPO, label: 'GitRepo (fleet.cattle.io)' },
  { value: FLEET.BUNDLE, label: 'Bundle (fleet.cattle.io)' },
  { value: LONGHORN.VOLUMES, label: 'Volume (longhorn.io)' },
];
