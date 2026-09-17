// What a widget SHOWS, worked out from its spec — shared by every widget renderer so a filter or a
// column means the same thing whichever building block you dropped.
//
// One idea runs through the whole file: a widget names fields the way a person would ("state",
// "provider", "K8s version"), not the way the API stores them. FIELDS maps those names onto a
// resource, and anything not in the map falls through to a dotted path (`spec.nodeName`), so any
// CRD still works without being taught here.
//
// Pure functions — no Vue. `rows` are Steve/Norman resource instances.

import { get } from '@shell/utils/object';
import { parseSi, formatSi, createMemoryFormat } from '@shell/utils/units';

/**
 * The fields a widget can filter, sort, group and tabulate on. `value` reads one off a row; `label`
 * is what the settings dialog and the table header call it.
 *
 * Order matters — it is the order the Columns checkboxes appear in.
 */
export const FIELDS = [
  {
    id: 'state', label: 'State', value: (row) => row.stateDisplay || row.state || ''
  },
  {
    id: 'name', label: 'Name', value: (row) => row.nameDisplay || get(row, 'metadata.name') || row.name || ''
  },
  {
    id: 'provider', label: 'Provider', value: (row) => providerOf(row)
  },
  {
    id: 'version', label: 'K8s version', value: (row) => versionOf(row)
  },
  {
    id: 'nodes', label: 'Nodes', value: (row) => nodeCountOf(row)
  },
  {
    id: 'cpu', label: 'CPU', value: (row) => cpuOf(row)
  },
  {
    id: 'memory', label: 'Memory', value: (row) => memoryOf(row)
  },
  {
    id: 'pods', label: 'Pods', value: (row) => podsOf(row)
  },
  {
    id: 'created', label: 'Created', value: (row) => get(row, 'metadata.creationTimestamp') || ''
  },
  {
    id: 'namespace', label: 'Namespace', value: (row) => get(row, 'metadata.namespace') || ''
  },
  {
    id: 'type', label: 'Type', value: (row) => typeOf(row)
  },
  {
    id: 'message', label: 'Message', value: (row) => row.message || get(row, 'status.message') || ''
  },
];

const FIELD_BY_ID = FIELDS.reduce((acc, f) => {
  acc[f.id] = f;

  return acc;
}, {});

/** The columns a table offers — every field that makes sense in a column, in FIELDS order. */
export const TABLE_COLUMNS = FIELDS;

/** A field's human label ('K8s version'), falling back to the raw path for a CRD field. */
export function fieldLabel(id) {
  return FIELD_BY_ID[id]?.label || id;
}

// ---- per-resource readers ----------------------------------------------------------------------
// Rancher spreads the same idea over several shapes (a provisioning cluster, a management cluster,
// a node). These read whichever one the row actually is, and return '' when it is neither.

// How Rancher writes the distros in its own tables. Anything else (an imported or local cluster)
// has no distro to name, so only the provider is shown.
const DISTROS = {
  rke2: 'RKE2', k3s: 'K3s', rke: 'RKE', k3s1: 'K3s'
};

function providerOf(row) {
  const provider = row.machineProviderDisplay || row.machineProvider || row.provider ||
    get(row, 'status.provider') || get(row, 'mgmt.status.provider') || '';
  const distro = DISTROS[`${ row.provisioner || row.kubernetesDistro || '' }`.toLowerCase()] || '';

  if (provider && distro) {
    return `${ distro } · ${ provider }`;
  }

  return provider || distro || '';
}

function versionOf(row) {
  return row.kubernetesVersion ||
    get(row, 'spec.kubernetesVersion') ||
    get(row, 'status.version.gitVersion') ||
    get(row, 'mgmt.status.version.gitVersion') ||
    get(row, 'status.kubernetesVersion') ||
    '';
}

function nodeCountOf(row) {
  const nodes = Number(get(row, 'status.nodeCount') ?? get(row, 'mgmt.status.nodeCount'));

  return Number.isFinite(nodes) && nodes > 0 ? nodes : '';
}

function cpuOf(row) {
  const cpu = get(row, 'status.allocatable.cpu') ?? get(row, 'mgmt.status.allocatable.cpu');

  if (cpu === undefined || cpu === null) {
    return '';
  }

  const cores = Math.round(parseSi(cpu));

  // A cluster still coming up reports 0 — it has no CPU to report yet, which is not "0 cores".
  return Number.isFinite(cores) && cores > 0 ? `${ cores } cores` : '';
}

function memoryOf(row) {
  const memory = get(row, 'status.allocatable.memory') ?? get(row, 'mgmt.status.allocatable.memory');

  if (memory === undefined || memory === null) {
    return '';
  }

  const bytes = parseSi(memory);

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '';
  }

  const format = createMemoryFormat(bytes);

  return formatSi(bytes, format);
}

// An Event's `type` is its severity (Normal / Warning); on most other resources `type` is the Steve
// type id ("provisioning.cattle.io.cluster"), which is the same for every row and so says nothing.
// Only the former is worth showing.
function typeOf(row) {
  const type = `${ row.type || '' }`;

  return type.includes('.') ? '' : type;
}

function podsOf(row) {
  const pods = Number(get(row, 'status.allocatable.pods') ?? get(row, 'mgmt.status.allocatable.pods'));

  return Number.isFinite(pods) && pods > 0 ? `${ pods }` : '';
}

// ---- where a resource lives ---------------------------------------------------------------------

/**
 * Which store to read a type from.
 *
 * NOT `currentStore`: that answers "where does this type live when you are INSIDE a cluster", and
 * sends anything cluster-scoped — a Fleet GitRepo, a Longhorn Volume, an Event — to the `cluster`
 * store. The Home is not inside a cluster, so that store is empty here, and a widget asking it
 * reports the type as missing when it is installed and readable all along.
 *
 * The Home reads the local cluster through MANAGEMENT (Steve /v1), so prefer whichever store
 * actually has a schema for the type, management first.
 */
export function storeForType(getters, type) {
  if (!type) {
    return 'management';
  }

  const stores = ['management', getters['currentStore'](type), 'cluster'];

  return stores.find((store) => store && getters[`${ store }/schemaFor`]?.(type)) || 'management';
}

// ---- a type's own columns -----------------------------------------------------------------------

/**
 * The columns Rancher itself defines for a type, via its type-map.
 *
 * This matters because the columns worth showing are a property of the RESOURCE, not of this
 * extension: a Cluster has a provider and a Kubernetes version, a User has a username and a last
 * login, and a CRD has whatever its own list page declares. A fixed list of generic fields can only
 * ever be wrong for most types.
 *
 * Returns `{ id, label, sortable, header }` per column, where `header` is Rancher's real header
 * definition — pass it to a table verbatim and the column gets its proper formatter and value.
 */
export function typeColumns(getters, resource) {
  if (!resource) {
    return [];
  }

  const schema = getters[`${ storeForType(getters, resource) }/schemaFor`]?.(resource);

  if (!schema) {
    return [];
  }

  const headers = getters['type-map/headersFor']?.(schema) || [];

  return headers.map((header) => ({
    id:       header.name,
    label:    header.labelKey ? getters['i18n/t'](header.labelKey) : (header.label || header.name),
    sortable: !!header.sort,
    header,
  }));
}

/**
 * Rancher's header, minus the link into the resource's detail page.
 *
 * That link needs a cluster context the Home does not have, and without one it renders an empty
 * cell — the stock Home's own cluster table drops the same formatter for the same reason.
 */
export function withoutDetailLink(header) {
  if (header?.formatter !== 'LinkDetail') {
    return header;
  }

  const { formatter, ...rest } = header;

  return rest;
}

// ---- reading a field ----------------------------------------------------------------------------

/**
 * One field off one row. A known field id uses its reader; anything else is treated as a dotted
 * path, so `spec.nodeName` or a CRD's own field works with no extra plumbing. A leading `label:`
 * (or `labels.`) reads a Kubernetes label instead.
 */
export function fieldValue(row, field) {
  if (!row || !field) {
    return '';
  }

  if (FIELD_BY_ID[field]) {
    return FIELD_BY_ID[field].value(row) ?? '';
  }

  const label = field.match(/^(?:label:|labels\.)(.+)$/);

  if (label) {
    return get(row, 'metadata.labels')?.[label[1]] ?? '';
  }

  return get(row, field) ?? '';
}

// ---- filtering ----------------------------------------------------------------------------------

const OPERATORS = ['>=', '<=', '!=', '==', '=', '>', '<'];

/**
 * Parse a filter expression into clauses. Written the way the hint describes it — "Labels or
 * fields, such as env=prod or state != Active" — so several clauses are comma separated and ALL
 * must match:
 *
 *   state != Active, env=prod          → [{ field: 'state', op: '!=', value: 'Active' }, …]
 *   prod                               → [{ field: '', op: 'contains', value: 'prod' }]
 *
 * A bare word with no operator matches the row's name.
 */
export function parseFilter(expression) {
  return `${ expression || '' }`
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const op = OPERATORS.find((candidate) => part.includes(candidate));

      if (!op) {
        return {
          field: 'name', op: 'contains', value: part
        };
      }

      const at = part.indexOf(op);

      return {
        field: part.slice(0, at).trim(),
        op:    op === '==' ? '=' : op,
        value: part.slice(at + op.length).trim(),
      };
    });
}

function clauseMatches(row, clause) {
  const actual = fieldValue(row, clause.field);
  const a = `${ actual }`.trim().toLowerCase();
  const b = `${ clause.value }`.trim().toLowerCase();

  switch (clause.op) {
  case 'contains':
    return a.includes(b);
  case '!=':
    return a !== b;
  case '>':
  case '<':
  case '>=':
  case '<=': {
    const left = parseFloat(actual);
    const right = parseFloat(clause.value);

    if (Number.isNaN(left) || Number.isNaN(right)) {
      return false;
    }

    return clause.op === '>' ? left > right : clause.op === '<' ? left < right : clause.op === '>=' ? left >= right : left <= right;
  }
  default:
    return a === b;
  }
}

/** Keep the rows matching EVERY clause of a filter expression (no filter keeps everything). */
export function applyFilter(rows, expression) {
  const clauses = parseFilter(expression);

  if (!clauses.length) {
    return rows;
  }

  return (rows || []).filter((row) => clauses.every((clause) => clauseMatches(row, clause)));
}

// ---- sorting & grouping -------------------------------------------------------------------------

/** Sort rows by a field. Numbers compare as numbers, everything else as lower-cased text. */
export function applySort(rows, field, dir = 'asc') {
  if (!field) {
    return rows;
  }

  const sign = dir === 'desc' ? -1 : 1;

  return [...(rows || [])].sort((a, b) => {
    const left = fieldValue(a, field);
    const right = fieldValue(b, field);
    const ln = parseFloat(left);
    const rn = parseFloat(right);

    if (!Number.isNaN(ln) && !Number.isNaN(rn) && `${ ln }` === `${ left }`.trim() && `${ rn }` === `${ right }`.trim()) {
      return (ln - rn) * sign;
    }

    return `${ left }`.toLowerCase().localeCompare(`${ right }`.toLowerCase()) * sign;
  });
}

/**
 * Count rows per distinct value of a field, biggest group first — what the counters, the status
 * summary and the bar chart all draw. Empty values are grouped under "Unknown".
 */
export function groupRows(rows, field) {
  const counts = new Map();

  (rows || []).forEach((row) => {
    const key = `${ fieldValue(row, field) }`.trim() || 'Unknown';

    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * The colour a state reads as, reusing Rancher's own state colours so a widget agrees with the rest
 * of the product. Falls back to the neutral "info" colour for anything unrecognized.
 */
export function stateColor(label) {
  const key = `${ label }`.toLowerCase();

  if (['active', 'running', 'healthy', 'ready', 'bound', 'completed', 'succeeded', 'attached'].includes(key)) {
    return 'success';
  }
  if (['error', 'failed', 'critical', 'unavailable', 'expired', 'notready', 'not ready', 'detached'].includes(key)) {
    return 'error';
  }
  if (['warning', 'degraded', 'updating', 'upgrading', 'pending', 'provisioning', 'waiting', 'unknown'].includes(key)) {
    return 'warning';
  }

  return 'info';
}
