// The VIEW model — the structure behind a configurable page like the Home.
//
// Vocabulary (used consistently in the code, the UI and the stored ConfigMap):
//
//   VIEW       a page (the Home is a VIEW). Holds one or more PANELS.
//   PANEL      one screen of a view. When a view has more than one PANEL they render as TABS.
//              A LAYOUT panel has a ROOT ORGANIZER that always fills it (100% x 100%); a STOCK
//              panel has no layout at all and renders Rancher's own Home, so a view can mix the
//              real Home in as a tab beside templated ones.
//   ORGANIZER  a row. It is ALWAYS the full width of whatever contains it, and lays its children out
//              on a 12-COLUMN grid. Organizers stack top-to-bottom and may nest (a nested organizer
//              takes a whole row of its parent, which is what keeps "always 100% wide" true).
//   TEMPLATE   a leaf rendering one stored template ConfigMap. Its width is a COLUMN SPAN
//              (col-span-1 … col-span-12) — drag its edge to resize.
//
// There is only ONE kind of organizer, so there is nothing to choose between: add one, drop things
// in, drag them around. The ROOT always keeps one trailing EMPTY organizer as a drop target.
//
// Pure functions — no Vue, no store.

/** Node types allowed in a panel's tree. */
export const NODE_ORGANIZER = 'organizer';
export const NODE_TEMPLATE = 'template';
export const NODE_WIDGET = 'widget';

/** True for a LEAF node — a widget or a stored template. Only organizers have children. */
export function isLeaf(node) {
  return !!node && (node.type === NODE_TEMPLATE || node.type === NODE_WIDGET);
}

/**
 * A PANEL is either a layout (a root organizer of templates) or the STOCK Rancher home rendered
 * as-is. A stock panel has no organizer and nothing to configure — it exists so a view can mix the
 * real Home in as one tab alongside templated ones.
 */
export const PANEL_LAYOUT = 'layout';
export const PANEL_STOCK = 'stock';

/** Organizers lay their children out on this many columns. */
export const GRID_COLUMNS = 12;

/** Default column span for a newly dropped widget (half a row). */
export const DEFAULT_COL_SPAN = 6;

/** The gap between widgets. One value for the whole VIEW (a view-level setting, not per widget). */
export const DEFAULT_GAP = 20;

/** One grid row. `2 rows` is two of these plus the gap between them. */
export const ROW_HEIGHT = 156;

/**
 * WIDTH is chosen from four presets rather than 12 free columns — the four that read well on a
 * dashboard. `Advanced → Column span` still exposes the raw twelfths underneath.
 */
export const WIDTH_PRESETS = [
  {
    id: 'third', label: '1/3', span: 4
  },
  {
    id: 'half', label: '1/2', span: 6
  },
  {
    id: 'twoThirds', label: '2/3', span: 8
  },
  {
    id: 'full', label: 'Full', span: GRID_COLUMNS
  },
];

/** The raw column spans offered under Advanced. */
export const COLUMN_SPANS = [4, 6, 8, 12];

/** HEIGHT presets: fit the content, or a fixed number of grid rows. */
export const HEIGHT_PRESETS = [
  {
    id: 'fit', label: 'Fit content', rows: 0
  },
  {
    id: 'rows2', label: '2 rows', rows: 2
  },
  {
    id: 'rows3', label: '3 rows', rows: 3
  },
];

/** SPACING presets set the widget's padding. Advanced overrides them with exact pixels. */
export const SPACING_PRESETS = [
  {
    id: 'compact', label: 'Compact', padding: 8
  },
  {
    id: 'default', label: 'Default', padding: 16
  },
  {
    id: 'spacious', label: 'Spacious', padding: 24
  },
];

/** The width preset a column span corresponds to (null when it matches none of them). */
export function widthPresetOf(span) {
  return WIDTH_PRESETS.find((p) => p.span === clampSpan(span))?.id || null;
}

/** Height in px for N grid rows, including the gaps they span. */
export function rowsHeight(rows, gap = DEFAULT_GAP) {
  return (rows * ROW_HEIGHT) + ((rows - 1) * gap);
}

/** The height preset a stored height corresponds to ('fit' for auto / anything unrecognized). */
export function heightPresetOf(height, gap = DEFAULT_GAP) {
  return HEIGHT_PRESETS.find((p) => p.rows && height === rowsHeight(p.rows, gap))?.id || 'fit';
}

/** The stored height for a height preset id. */
export function heightForPreset(id, gap = DEFAULT_GAP) {
  const preset = HEIGHT_PRESETS.find((p) => p.id === id);

  return preset?.rows ? rowsHeight(preset.rows, gap) : 'auto';
}

/** The spacing preset a node's padding corresponds to (null once Advanced has overridden it). */
export function spacingPresetOf(padding) {
  const p = normalizeSides(padding);
  const same = p.top === p.right && p.right === p.bottom && p.bottom === p.left;

  return (same && SPACING_PRESETS.find((s) => s.padding === p.top)?.id) || null;
}

let idSeq = 0;

function uid(prefix) {
  idSeq += 1;

  return `${ prefix }-${ Date.now().toString(36) }${ idSeq.toString(36) }`;
}

/**
 * A fresh id with the same guarantees the factories use. Exported because the editor also mints ids
 * (forking a view, duplicating one) and two of those in the same millisecond must not collide —
 * which is exactly what a hand-rolled `Date.now()` id does.
 */
export function newId(prefix = 'id') {
  return uid(prefix);
}

// ---- value normalization ----

/** Clamp a column span into 1..12. */
export function clampSpan(span) {
  const n = Math.round(Number(span));

  if (!n || Number.isNaN(n)) {
    return DEFAULT_COL_SPAN;
  }

  return Math.max(1, Math.min(GRID_COLUMNS, n));
}

/** A size is a number (px) or a CSS length string ('auto', '240px', '30%'). */
export function normalizeSize(value, fallback = 'auto') {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  return fallback;
}

/** Turn a stored size into a CSS value (240 -> '240px', '100%' -> '100%'). */
export function cssSize(value) {
  return typeof value === 'number' ? `${ value }px` : `${ value }`;
}

/**
 * Normalize a four-sided box value (margin or padding) — each side a number (px) or a CSS length
 * string ('5%', '2rem').
 */
export function normalizeSides(sides) {
  const p = sides || {};
  const side = (v) => {
    if (typeof v === 'number' && !Number.isNaN(v)) {
      return v;
    }
    if (typeof v === 'string' && v.trim()) {
      return v.trim();
    }

    return 0;
  };

  return {
    top:    side(p.top),
    right:  side(p.right),
    bottom: side(p.bottom),
    left:   side(p.left),
  };
}

/** Build a CSS `margin`/`padding` shorthand for a four-sided box value. */
export function cssSides(sides) {
  const p = normalizeSides(sides);

  return [p.top, p.right, p.bottom, p.left].map(cssSize).join(' ');
}

// ---- node factories ----

/** A new ORGANIZER (a full-width row on a 12-column grid). */
export function newOrganizer(opts = {}) {
  return {
    id:       opts.id || uid('org'),
    type:     NODE_ORGANIZER,
    height:   normalizeSize(opts.height, 'auto'),
    margin:   normalizeSides(opts.margin),
    padding:  normalizeSides(opts.padding),
    children: Array.isArray(opts.children) ? opts.children : [],
  };
}

/** A new TEMPLATE leaf, sized by its column span. */
export function newTemplateNode(template, opts = {}) {
  return {
    id:       opts.id || uid('tpl'),
    type:     NODE_TEMPLATE,
    template: template || '',
    colSpan:  clampSpan(opts.colSpan ?? DEFAULT_COL_SPAN),
    height:   normalizeSize(opts.height, 'auto'),
    margin:   normalizeSides(opts.margin),
    padding:  normalizeSides(opts.padding),
  };
}

/**
 * Normalize a WIDGET spec — the declarative description of what one widget shows. Every field is
 * optional; a widget with only a `kind` renders its own sensible default.
 *
 *   kind        which building block: table | counters | statusSummary | list | barChart |
 *               timeSeries | text | links | banner
 *   title       heading shown on the widget
 *   resource    the Rancher/Kubernetes type it reads (any kind Rancher knows, including CRDs)
 *   where       'view'   — the same clusters the view covers
 *               'custom' — only the clusters/namespaces in `targets`
 *   filter      a labels-or-fields expression: `env=prod`, `state != Active`
 *   columns     table columns to show, in order
 *   sortBy      field to sort on, `sortDir` 'asc' | 'desc'
 *   groupBy     field a bar chart / status summary groups by
 *   limit       how many rows a list shows
 *   body        markdown (text widget)
 *   links       [{ label, url }] (links widget)
 *   url         Grafana panel URL (time series widget)
 */
export function normalizeWidget(widget) {
  const w = widget && typeof widget === 'object' ? widget : {};
  const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
  const arr = (v) => (Array.isArray(v) ? v : []);

  const out = {
    kind:     str(w.kind, 'text'),
    title:    str(w.title),
    resource: str(w.resource),
    where:    w.where === 'custom' ? 'custom' : 'view',
    targets:  arr(w.targets).filter((t) => typeof t === 'string'),
    filter:   str(w.filter),
    columns:  arr(w.columns).filter((c) => typeof c === 'string'),
    sortBy:   str(w.sortBy),
    sortDir:  w.sortDir === 'desc' ? 'desc' : 'asc',
    groupBy:  str(w.groupBy),
    limit:    Number.isFinite(Number(w.limit)) && Number(w.limit) > 0 ? Math.round(Number(w.limit)) : 0,
    body:     str(w.body),
    links:    arr(w.links).filter((l) => l && typeof l === 'object').map((l) => ({ label: str(l.label), url: str(l.url) })),
    url:      str(w.url),
  };

  // `subtitle` and `image` are banner-only extras; keep them only when set so stored specs stay small.
  if (w.subtitle) {
    out.subtitle = str(w.subtitle);
  }
  if (w.image) {
    out.image = str(w.image);
  }

  return out;
}

/** A new WIDGET leaf — one building block on the grid, sized by its column span. */
export function newWidgetNode(widget, opts = {}) {
  const spec = normalizeWidget(typeof widget === 'string' ? { kind: widget } : widget);
  const padding = opts.padding ?? {
    top: 16, right: 16, bottom: 16, left: 16
  };

  return {
    id:      opts.id || uid('w'),
    type:    NODE_WIDGET,
    widget:  spec,
    colSpan: clampSpan(opts.colSpan ?? DEFAULT_COL_SPAN),
    height:  normalizeSize(opts.height, 'auto'),
    margin:  normalizeSides(opts.margin),
    padding: normalizeSides(padding),
  };
}

/** The ROOT organizer of a panel: always fills the panel (100% x 100%). */
export function newRootOrganizer(children = []) {
  return newOrganizer({
    id: uid('root'), height: '100%', children
  });
}

/**
 * A new PANEL — one named VIEW in the tab strip. Starts with one empty organizer to drop into.
 * `gap` is the space between its widgets: one value for the whole view (see the Layout tab).
 */
export function newPanel(name, opts = {}) {
  return {
    id:        opts.id || uid('panel'),
    name:      name || 'Untitled view',
    gap:       Number.isFinite(Number(opts.gap)) ? Number(opts.gap) : DEFAULT_GAP,
    organizer: ensureTrailingEmpty(newRootOrganizer(opts.children || [])),
  };
}

/** A new STOCK panel: renders the real Rancher home, with no layout of its own. */
export function newStockPanel(name) {
  return {
    id: uid('panel'), name: name || 'Home', kind: PANEL_STOCK
  };
}

/** True when a panel renders the stock Rancher home rather than a template layout. */
export function isStockPanel(panel) {
  return panel?.kind === PANEL_STOCK;
}

/** A new empty VIEW — one panel. */
export function emptyView() {
  return { panels: [newPanel('Home')] };
}

/** True when a node is an organizer holding nothing. */
export function isEmptyOrganizer(node) {
  return !!node && node.type === NODE_ORGANIZER && !(node.children || []).length;
}

/**
 * The ROOT always ends with ONE empty organizer — the "drop things here" target. Any extra trailing
 * empties are collapsed so the surface never grows a stack of blank rows.
 */
export function ensureTrailingEmpty(root) {
  const children = [...(root.children || [])];

  while (children.length && isEmptyOrganizer(children[children.length - 1])) {
    children.pop();
  }

  children.push(newOrganizer());

  return { ...root, children };
}

// ---- normalization (defensive: stored JSON is user/AI editable) ----

function normalizeNode(node) {
  if (!node || typeof node !== 'object') {
    return null;
  }

  if (node.type === NODE_WIDGET || (!node.type && node.widget)) {
    return newWidgetNode(node.widget, node);
  }

  if (node.type === NODE_TEMPLATE || (!node.type && node.template)) {
    if (!node.template) {
      return null;
    }

    // A previous format sized templates with a CSS width ('66%'); convert it to a column span.
    const colSpan = node.colSpan ?? spanFromWidth(node.width);

    return newTemplateNode(node.template, { ...node, colSpan });
  }

  let children = (Array.isArray(node.children) ? node.children : []).map(normalizeNode).filter(Boolean);

  // Legacy `gap` (a grid gap between every child) becomes a left MARGIN on each child after the
  // first — the same visible separation, expressed the way the editor now models spacing.
  if (node.gap) {
    children = children.map((child, i) => (
      i === 0 ? child : { ...child, margin: { ...child.margin, left: node.gap } }
    ));
  }

  return newOrganizer({ ...node, children });
}

/** Convert an old percentage/fraction width into a 1..12 column span. */
function spanFromWidth(width) {
  if (typeof width === 'string' && width.trim().endsWith('%')) {
    const pct = parseFloat(width);

    if (!Number.isNaN(pct) && pct > 0) {
      return clampSpan((pct / 100) * GRID_COLUMNS);
    }
  }

  return GRID_COLUMNS;
}

/**
 * Keep a panel root well-formed: 100% height, children are all ORGANIZERS (a template dropped loose
 * on the root gets its own organizer, so the shape is always root → organizers → templates), and
 * exactly one trailing empty organizer to drop into. Run after every edit.
 */
export function tidyRoot(root) {
  const children = (root.children || []).map((child) => (
    isLeaf(child) ? newOrganizer({ children: [child] }) : child
  ));

  return ensureTrailingEmpty({
    ...root, height: '100%', children
  });
}

/** Force a node to be the panel root. */
function asRoot(node) {
  const org = node && !isLeaf(node) ? normalizeNode(node) : null;

  if (org) {
    return tidyRoot(org);
  }

  // A bare template (or nothing) at the root gets wrapped so the root is always an organizer.
  const child = normalizeNode(node);

  return ensureTrailingEmpty(newRootOrganizer(child ? [newOrganizer({ children: [child] })] : []));
}

function normalizePanel(panel) {
  // A stock panel carries no organizer — there is nothing to lay out.
  const out = isStockPanel(panel) ? {
    id: panel?.id || uid('panel'), name: panel?.name || 'Home', kind: PANEL_STOCK
  } : {
    id:        panel?.id || uid('panel'),
    name:      panel?.name || 'Untitled view',
    gap:       Number.isFinite(Number(panel?.gap)) ? Number(panel.gap) : DEFAULT_GAP,
    organizer: asRoot(panel?.organizer),
  };

  // Published organization templates are marked so the UI can show (and protect) them.
  if (panel?.org) {
    out.org = true;
  }

  // Which published view this one was forked from. It MUST survive a round trip through storage,
  // or the fork and its source both show up in the bar as two views with the same name.
  if (panel?.from) {
    out.from = panel.from;
  }

  return out;
}

// ---- legacy migration ----

/**
 * Convert a LEGACY 12-column grid list ({ template, x, y, w, h, pad }) into organizer rows: panels
 * sharing a `y` become one organizer, and each keeps its column count as its col span.
 */
function gridToRows(gridPanels) {
  const items = (Array.isArray(gridPanels) ? gridPanels : [])
    .filter((p) => p && p.template)
    .map((p) => ({
      template: p.template,
      x:        Number(p.x) || 0,
      y:        Number(p.y) || 0,
      w:        clampSpan(Number(p.w) || GRID_COLUMNS),
      padding:  p.pad,
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const rows = [];

  items.forEach((item) => {
    const row = rows.find((r) => r.y === item.y);

    if (row) {
      row.items.push(item);
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  });

  return rows.map((row) => newOrganizer({ children: row.items.map((item) => newTemplateNode(item.template, { colSpan: item.w, padding: item.padding })) }));
}

/**
 * Coerce ANY stored value into a valid VIEW:
 *   - the current shape          { panels: [ { organizer } ] }
 *   - the legacy dashboard shape { tabs:   [ { panels: [grid] } ] }
 *   - the legacy single name     "home"
 */
export function migrateToView(value) {
  // Current shape.
  if (value && typeof value === 'object' && Array.isArray(value.panels)) {
    const panels = value.panels.filter((p) => p && typeof p === 'object').map(normalizePanel);
    const out = { panels: panels.length ? panels : [newPanel('Home')] };

    // Which view opens first. Dropped when it names a view that no longer exists.
    if (value.defaultPanelId && panels.some((p) => p.id === value.defaultPanelId)) {
      out.defaultPanelId = value.defaultPanelId;
    }

    if (value.disabled) {
      out.disabled = true;
    }

    return out;
  }

  // Legacy: tabs[] of grid panels[].
  if (value && typeof value === 'object' && Array.isArray(value.tabs)) {
    const panels = value.tabs
      .filter((t) => t && typeof t === 'object')
      .map((t) => ({
        id:        t.id || uid('panel'),
        name:      t.name || 'Panel',
        organizer: ensureTrailingEmpty(newRootOrganizer(gridToRows(t.panels))),
      }));
    const out = { panels: panels.length ? panels : [newPanel('Home')] };

    if (value.disabled) {
      out.disabled = true;
    }

    return out;
  }

  // Legacy: a single applied template name.
  if (typeof value === 'string' && value) {
    return {
      panels: [{
        id:        uid('panel'),
        name:      'Home',
        organizer: ensureTrailingEmpty(newRootOrganizer([
          newOrganizer({ children: [newTemplateNode(value, { colSpan: GRID_COLUMNS })] }),
        ])),
      }],
    };
  }

  return emptyView();
}

// ---- tree operations (used by the editor; all return NEW trees) ----

function mapTree(node, fn) {
  const mapped = fn(node);

  if (!mapped || isLeaf(mapped)) {
    return mapped;
  }

  return { ...mapped, children: (mapped.children || []).map((c) => mapTree(c, fn)).filter(Boolean) };
}

/** Find a node by id anywhere in the tree. */
export function findNode(root, id) {
  if (!root || !id) {
    return null;
  }
  if (root.id === id) {
    return root;
  }

  for (const child of root.children || []) {
    const hit = findNode(child, id);

    if (hit) {
      return hit;
    }
  }

  return null;
}

/** Find the PARENT organizer of a node id (null for the root or a missing id). */
export function findParent(root, id) {
  for (const child of root?.children || []) {
    if (child.id === id) {
      return root;
    }

    const hit = findParent(child, id);

    if (hit) {
      return hit;
    }
  }

  return null;
}

/**
 * The chain of nodes from the root down to `id`, inclusive — the editor renders it as a breadcrumb
 * so you can always select an ANCESTOR (the panel root especially, which its children cover).
 */
export function pathToNode(root, id) {
  if (!root) {
    return [];
  }
  if (root.id === id) {
    return [root];
  }

  for (const child of root.children || []) {
    const below = pathToNode(child, id);

    if (below.length) {
      return [root, ...below];
    }
  }

  return [];
}

/** True when `ancestorId` is (or contains) `id` — used to block dropping a node into itself. */
export function contains(root, ancestorId, id) {
  const ancestor = findNode(root, ancestorId);

  return !!ancestor && !!findNode(ancestor, id);
}

/** Replace one node (by id) with the result of `fn(node)`. */
export function updateNode(root, id, fn) {
  return mapTree(root, (node) => (node.id === id ? fn(node) : node));
}

/** Insert a node into an organizer at `index` (appends when index is omitted). */
export function insertNode(root, parentId, child, index) {
  const target = parentId || root.id;

  return mapTree(root, (node) => {
    if (node.id !== target || isLeaf(node)) {
      return node;
    }

    const children = [...(node.children || [])];
    const at = typeof index === 'number' ? Math.max(0, Math.min(children.length, index)) : children.length;

    children.splice(at, 0, child);

    return { ...node, children };
  });
}

/** Append a child to the organizer with the given id (defaults to the root). */
export function addChild(root, parentId, child) {
  return insertNode(root, parentId, child);
}

/** Remove a node by id. The root can never be removed. */
export function removeNode(root, id) {
  if (!id || root.id === id) {
    return root;
  }

  return mapTree(root, (node) => {
    if (isLeaf(node)) {
      return node;
    }

    return { ...node, children: (node.children || []).filter((c) => c.id !== id) };
  });
}

/** Move a node up (-1) or down (+1) among its siblings. */
export function moveNode(root, id, delta) {
  const parent = findParent(root, id);

  if (!parent) {
    return root;
  }

  return mapTree(root, (node) => {
    if (node.id !== parent.id) {
      return node;
    }

    const children = [...(node.children || [])];
    const from = children.findIndex((c) => c.id === id);
    const to = from + delta;

    if (from < 0 || to < 0 || to >= children.length) {
      return node;
    }

    const [moved] = children.splice(from, 1);

    children.splice(to, 0, moved);

    return { ...node, children };
  });
}

/**
 * DRAG & DROP: move an existing node into `parentId` at `index`. Dropping a node into itself (or its
 * own subtree) is refused. When moving WITHIN the same parent the index is corrected for the gap the
 * node leaves behind, so dropping "just after myself" is a no-op rather than an off-by-one.
 */
export function moveNodeTo(root, id, parentId, index) {
  if (!id || id === root.id || id === parentId || contains(root, id, parentId)) {
    return root;
  }

  const node = findNode(root, id);
  const parent = findParent(root, id);

  if (!node || !parent) {
    return root;
  }

  let at = typeof index === 'number' ? index : Number.MAX_SAFE_INTEGER;

  if (parent.id === parentId) {
    const from = (parent.children || []).findIndex((c) => c.id === id);

    if (from >= 0 && from < at) {
      at -= 1;
    }
  }

  return insertNode(removeNode(root, id), parentId, node, at);
}

/** Set a template's column span (1..12). */
export function setColSpan(root, id, span) {
  return updateNode(root, id, (node) => ({ ...node, colSpan: clampSpan(span) }));
}

/** Every template ConfigMap name referenced anywhere in a node tree. */
export function templatesInTree(root) {
  const out = [];
  const walk = (node) => {
    if (!node) {
      return;
    }
    if (node.type === NODE_TEMPLATE) {
      out.push(node.template);

      return;
    }
    if (node.type === NODE_WIDGET) {
      return;
    }
    (node.children || []).forEach(walk);
  };

  walk(root);

  return out;
}
