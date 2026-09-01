// Grid math for the Home dashboard — a self-contained 12-column layout engine (no library).
// Ported from the proto-configurable-dashboards prototype, adapted so a placed item is a TEMPLATE
// PANEL ({ id, template, x, y, w, h }) rather than a widget. Pure functions, no Vue/store.

/** Number of columns every dashboard grid is divided into. */
export const GRID_COLUMNS = 12;
/** Height of a single grid row, in pixels. */
export const GRID_ROW_HEIGHT = 56;
/** Default size of a newly added panel. */
export const DEFAULT_PANEL = { w: 6, h: 5 };
/** Smallest a panel may be resized to. */
export const MIN_PANEL = { w: 2, h: 2 };

export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function byPosition(a, b) {
  return a.y - b.y || a.x - b.x;
}

/**
 * Pull every panel as far up as it will go without colliding, so the grid never ends up with holes
 * above a panel once something is moved or removed.
 */
export function compact(panels) {
  const placed = [];

  [...panels].sort(byPosition).forEach((panel) => {
    const next = { ...panel };

    while (next.y > 0 && !placed.some((p) => overlaps(p, { ...next, y: next.y - 1 }))) {
      next.y--;
    }

    placed.push(next);
  });

  return placed;
}

/**
 * Place `moved` at its new position and push anything it now sits on top of down out of the way.
 * Everything else keeps its relative order.
 */
export function resolveCollisions(panels, moved) {
  const placed = [{ ...moved }];
  const others = panels.filter((p) => p.id !== moved.id).sort(byPosition);

  others.forEach((panel) => {
    const next = { ...panel };
    let guard = 0;
    let hit = placed.find((p) => overlaps(p, next));

    while (hit && guard++ < 100) {
      next.y = hit.y + hit.h;
      hit = placed.find((p) => overlaps(p, next));
    }

    placed.push(next);
  });

  return placed;
}

/** Clamp a panel so it stays inside the grid. */
export function clampToGrid(panel) {
  const w = Math.max(1, Math.min(GRID_COLUMNS, panel.w));

  return {
    ...panel,
    w,
    h: Math.max(1, panel.h),
    x: Math.max(0, Math.min(GRID_COLUMNS - w, panel.x)),
    y: Math.max(0, panel.y),
  };
}

/** Number of rows the given layout occupies. */
export function gridRows(panels) {
  return panels.reduce((max, p) => Math.max(max, p.y + p.h), 0);
}

/** First free position for a panel of the given size (falls to the bottom if the grid is full). */
export function firstFreeSlot(panels, w, h) {
  const maxY = gridRows(panels);

  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x <= GRID_COLUMNS - w; x++) {
      const candidate = {
        id: '', x, y, w, h
      };

      if (!panels.some((existing) => overlaps(existing, candidate))) {
        return { x, y };
      }
    }
  }

  return { x: 0, y: maxY };
}
