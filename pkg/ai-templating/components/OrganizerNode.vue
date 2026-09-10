<script>
import TemplatePanel from './TemplatePanel.vue';
import {
  NODE_TEMPLATE, GRID_COLUMNS, cssSize, cssSides, normalizeSides, clampSpan
} from '../templating/view-model';

// Recursively renders ONE node of a panel's layout tree.
//
//   ORGANIZER → a FLEX row (wrapping) laid out in twelfths. A nested organizer always takes a whole
//               line, so organizers stack — an organizer is ALWAYS 100% wide.
//   TEMPLATE  → a leaf rendering one stored template ConfigMap, sized by its col span (1..12).
//
// Flex (not grid) is deliberate: it is what the stock Home uses, and a flex item resolves PERCENTAGE
// margins against the whole flex container. A grid item resolves them against its own grid area, so
// `margin-left: 1.75%` on a col-span-3 item silently became a quarter of what you asked for. To keep
// the columns exact even with margins, a template's flex-basis subtracts its own horizontal margins:
//     flex: 0 0 calc(<span/12>% - <margin-left> - <margin-right>)
// so basis + margins == the span's share of the row, and nothing wraps unexpectedly.
//
// Outside edit mode this renders SEAMLESSLY — no chrome. In edit mode exactly ONE node shows its
// toolbar, the selected node shows its margin/padding bands, and all chrome is painted ABOVE the
// rendered template (which is stacking-isolated so its own z-indexes can't cover the editor).
export default {
  name:       'OrganizerNode',
  components: { TemplatePanel },

  inject: {
    viewEditor: {
      default: () => ({
        select:       () => {},
        move:         () => {},
        remove:       () => {},
        editTemplate: () => {},
        beginDrag:    () => {},
        endDrag:      () => {},
        dropInto:     () => {},
        setColSpan:   () => {},
        setHover:     () => {},
        ui:           { dragId: null, hoverId: null },
      }),
    },
  },

  props: {
    node: {
      type:     Object,
      required: true,
    },
    editing: {
      type:    Boolean,
      default: false,
    },
    selectedId: {
      type:    String,
      default: '',
    },
    // The panel's root organizer: fills the panel, and can't be dragged or removed.
    isRoot: {
      type:    Boolean,
      default: false,
    },
  },

  data() {
    return {
      dropIndex: -1,
      resizing:  false,
      // Measured margin/padding in PX. The bands can't just reuse the authored values: a band is
      // absolutely positioned, so a percentage on it resolves against THIS tile, while the real
      // margin resolves against the row — a col-span-3 tile would draw the band 4x too small.
      // getComputedStyle gives the used value in px, which is exact for %, rem, anything.
      used:      null,
    };
  },

  computed: {
    isOrganizer() {
      return this.node.type !== NODE_TEMPLATE;
    },

    isSelected() {
      return this.editing && this.selectedId === this.node.id;
    },

    children() {
      return this.isOrganizer ? (this.node.children || []) : [];
    },

    isEmpty() {
      return this.isOrganizer && !this.children.length;
    },

    beingDragged() {
      return this.viewEditor.ui?.dragId === this.node.id;
    },

    dragActive() {
      return this.editing && !!this.viewEditor.ui?.dragId;
    },

    // Only ONE toolbar is ever on screen: the selected node, or the innermost node under the pointer.
    showBar() {
      return this.editing && (this.isSelected || this.viewEditor.ui?.hoverId === this.node.id);
    },

    span() {
      return clampSpan(this.node.colSpan);
    },

    margin() {
      return normalizeSides(this.node.margin);
    },

    padding() {
      return normalizeSides(this.node.padding);
    },

    /**
     * Show THIS organizer's column guides only when they mean something. Every organizer has its own
     * pitch (padding changes the content width), so drawing them all at once produces overlapping
     * lines that match nothing. At most one is shown.
     */
    showGuides() {
      if (!this.editing || !this.isOrganizer) {
        return false;
      }
      if (this.dropIndex >= 0) {
        return true;
      }

      const sel = this.selectedId;

      if (!sel) {
        return false;
      }
      if (sel === this.node.id) {
        return true;
      }

      return (this.children || []).some((c) => c.id === sel && c.type === NODE_TEMPLATE);
    },

    style() {
      const s = {
        boxSizing: 'border-box',
        margin:    cssSides(this.node.margin),
        padding:   cssSides(this.node.padding),
      };

      if (this.isRoot) {
        s.height = cssSize(this.node.height || '100%');
      } else if (this.isOrganizer) {
        // An organizer always takes a whole line, which is what makes organizers stack.
        // min-width:0 is REQUIRED: a flex item defaults to min-width:auto and so refuses to shrink
        // below its content's min-content width — a wide table would blow the row out past the page.
        // (The grid version got this free from `minmax(0, 1fr)`.)
        s.flex = '0 0 100%';
        s.minWidth = 0;
      } else {
        // Subtract this template's own horizontal margins from the basis so basis + margins is
        // exactly the span's share of the row (and a margin never pushes a sibling onto a new line).
        const pct = (this.span / GRID_COLUMNS) * 100;
        const subtract = [this.margin.left, this.margin.right]
          .filter((v) => v && v !== 0)
          .map(cssSize);

        s.flex = subtract.length ? `0 0 calc(${ pct }% - ${ subtract.join(' - ') })` : `0 0 ${ pct }%`;
        s.minWidth = 0;
      }

      const height = this.node.height;

      if (!this.isRoot && height && height !== 'auto') {
        s.height = cssSize(height);
        s.minHeight = 0;
      }

      return s;
    },

    // An organizer lays its children out as a wrapping flex row (twelfths via flex-basis).
    flexStyle() {
      if (!this.isOrganizer) {
        return null;
      }

      const s = {
        display:      'flex',
        flexWrap:     'wrap',
        alignItems:   'flex-start',
        alignContent: 'flex-start',
      };

      if (this.isRoot) {
        s.minHeight = '100%';
      }

      return s;
    },

    // The guide overlay is its own 12-track grid, so the lines always mark exact twelfths of THIS
    // organizer's content box whatever its padding.
    guideStyle() {
      return {
        display:             'grid',
        gridTemplateColumns: `repeat(${ GRID_COLUMNS }, minmax(0, 1fr))`,
      };
    },

    // ---- box-model bands (selected node only) ----
    // Four strips per box, sized from the real values. The MARGIN sits outside the element (negative
    // offsets), the PADDING inside it. Filled, no numbers — amber for margin, green for padding.
    marginBands() {
      const m = this.used?.margin;

      if (!m) {
        return [];
      }
      const px = (v) => `${ v }px`;
      const out = [];

      if (m.top) {
        out.push({
          top: px(-m.top), left: px(-m.left), right: px(-m.right), height: px(m.top)
        });
      }
      if (m.bottom) {
        out.push({
          bottom: px(-m.bottom), left: px(-m.left), right: px(-m.right), height: px(m.bottom)
        });
      }
      if (m.left) {
        out.push({
          top: 0, bottom: 0, left: px(-m.left), width: px(m.left)
        });
      }
      if (m.right) {
        out.push({
          top: 0, bottom: 0, right: px(-m.right), width: px(m.right)
        });
      }

      return out;
    },

    paddingBands() {
      const p = this.used?.padding;

      if (!p) {
        return [];
      }
      const px = (v) => `${ v }px`;
      const out = [];

      if (p.top) {
        out.push({
          top: 0, left: 0, right: 0, height: px(p.top)
        });
      }
      if (p.bottom) {
        out.push({
          bottom: 0, left: 0, right: 0, height: px(p.bottom)
        });
      }
      if (p.left) {
        out.push({
          top: 0, bottom: 0, left: 0, width: px(p.left)
        });
      }
      if (p.right) {
        out.push({
          top: 0, bottom: 0, right: 0, width: px(p.right)
        });
      }

      return out;
    },

    // Templates show their name; an organizer needs no label (its frame says what it is).
    label() {
      return this.isOrganizer ? '' : this.node.template;
    },
  },

  watch: {
    isSelected: {
      immediate: true,
      handler() {
        this.scheduleMeasure();
      },
    },
    'node.margin': {
      deep: true,
      handler() {
        this.scheduleMeasure();
      }
    },
    'node.padding': {
      deep: true,
      handler() {
        this.scheduleMeasure();
      }
    },
    'node.colSpan': {
      handler() {
        this.scheduleMeasure();
      }
    },
  },

  mounted() {
    // Re-measure when the element's own size changes (window resize, a sibling resizing, …) so a
    // percentage band keeps matching the real spacing.
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.measure());
      this.ro.observe(this.$el);
    }
  },

  beforeUnmount() {
    this.ro?.disconnect();
    this.ro = null;
  },

  methods: {
    scheduleMeasure() {
      this.$nextTick(() => this.measure());
    },

    // Read the USED margin/padding (always px, whatever unit was authored) for the band overlays.
    measure() {
      if (!this.isSelected || !this.$el?.getBoundingClientRect) {
        this.used = null;

        return;
      }

      const cs = getComputedStyle(this.$el);
      const n = (v) => Math.round((parseFloat(v) || 0) * 10) / 10;

      this.used = {
        margin: {
          top: n(cs.marginTop), right: n(cs.marginRight), bottom: n(cs.marginBottom), left: n(cs.marginLeft)
        },
        padding: {
          top: n(cs.paddingTop), right: n(cs.paddingRight), bottom: n(cs.paddingBottom), left: n(cs.paddingLeft)
        },
      };
    },

    onSelect(ev) {
      if (!this.editing) {
        return;
      }
      // Stop at the innermost node so clicking a child doesn't also select its parents.
      ev.stopPropagation();
      this.viewEditor.select(this.node.id);
    },

    onHover(ev) {
      if (!this.editing) {
        return;
      }
      ev.stopPropagation();
      this.viewEditor.setHover(this.node.id);
    },

    // ---- drag & drop ----
    onDragStart(ev) {
      if (!this.editing || this.isRoot) {
        return;
      }
      ev.stopPropagation();
      ev.dataTransfer.effectAllowed = 'move';
      // Firefox needs data set for a drag to start at all.
      ev.dataTransfer.setData('text/plain', this.node.id);
      this.viewEditor.beginDrag(this.node.id);
    },

    onDragEnd() {
      this.dropIndex = -1;
      this.viewEditor.endDrag();
    },

    // Work out where a drop would land: compare the pointer with each child's midpoint — vertically
    // for full-line children (organizers), horizontally for templates sharing a line.
    computeDropIndex(ev) {
      const zone = this.$refs.body;

      if (!zone) {
        return 0;
      }

      const kids = Array.from(zone.children).filter((el) => el.dataset && el.dataset.nodeId);

      for (let i = 0; i < kids.length; i++) {
        const r = kids[i].getBoundingClientRect();
        const full = kids[i].dataset.full === '1';
        let before;

        if (full) {
          before = ev.clientY < r.top + (r.height / 2);
        } else if (ev.clientY < r.top) {
          before = true;
        } else {
          before = ev.clientY <= r.bottom && ev.clientX < r.left + (r.width / 2);
        }

        if (before) {
          return i;
        }
      }

      return kids.length;
    },

    onDragOver(ev) {
      if (!this.editing || !this.isOrganizer || !this.viewEditor.ui?.dragId) {
        return;
      }
      // Innermost organizer wins the drop.
      ev.preventDefault();
      ev.stopPropagation();
      ev.dataTransfer.dropEffect = 'move';
      this.dropIndex = this.computeDropIndex(ev);
    },

    onDragLeave(ev) {
      // Ignore bubbling leaves from children still inside this organizer.
      if (this.$el.contains(ev.relatedTarget)) {
        return;
      }
      this.dropIndex = -1;
    },

    onDrop(ev) {
      if (!this.editing || !this.isOrganizer) {
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();

      const index = this.dropIndex >= 0 ? this.dropIndex : this.computeDropIndex(ev);

      this.dropIndex = -1;
      this.viewEditor.dropInto(this.node.id, index);
    },

    // ---- col-span resize (templates only) ----
    startResize(ev) {
      if (!this.editing || this.isOrganizer) {
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      // Selecting it makes the parent organizer show its column guides while you drag the edge.
      this.viewEditor.select(this.node.id);

      const rowEl = this.$el.parentElement;
      const rowWidth = rowEl ? rowEl.getBoundingClientRect().width : 0;
      const colWidth = rowWidth / GRID_COLUMNS;

      if (!colWidth) {
        return;
      }

      const startX = ev.clientX;
      const startSpan = this.span;

      this.resizing = true;

      const onMove = (e) => {
        const delta = Math.round((e.clientX - startX) / colWidth);
        const next = clampSpan(startSpan + delta);

        if (next !== this.span) {
          this.viewEditor.setColSpan(this.node.id, next);
        }
      };

      const onUp = () => {
        this.resizing = false;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
  },
};
</script>

<template>
  <div
    class="onode"
    :class="{
      'onode--editing': editing,
      'onode--selected': isSelected,
      'onode--organizer': isOrganizer,
      'onode--template': !isOrganizer,
      'onode--root': isRoot,
      'onode--empty': isEmpty,
      'onode--dragging': beingDragged,
      'onode--drag-active': dragActive,
    }"
    :style="style"
    :draggable="editing && !isRoot"
    :data-node-id="node.id"
    :data-full="isOrganizer ? '1' : '0'"
    @click="onSelect"
    @mouseover="onHover"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Box model of the SELECTED node: amber margin outside, green padding inside. -->
    <template v-if="isSelected">
      <div
        v-for="(band, i) in marginBands"
        :key="`m${ i }`"
        class="onode__band onode__band--margin"
        :style="band"
      />
      <div
        v-for="(band, i) in paddingBands"
        :key="`p${ i }`"
        class="onode__band onode__band--padding"
        :style="band"
      />
    </template>

    <!-- The frame is a real overlay (not an `outline`) so the rendered template can never cover it. -->
    <div
      v-if="editing"
      class="onode__frame"
    />

    <!-- Edit chrome. Only ONE of these is on screen at a time (see showBar). -->
    <div
      v-if="showBar"
      class="onode__bar"
      draggable="false"
      @dragstart.stop.prevent
    >
      <span
        v-if="label"
        class="onode__label"
      >{{ label }}</span>
      <template v-if="!isRoot">
        <button
          class="onode__btn"
          title="Move up"
          @click.stop="viewEditor.move(node.id, -1)"
        >
          ↑
        </button>
        <button
          class="onode__btn"
          title="Move down"
          @click.stop="viewEditor.move(node.id, 1)"
        >
          ↓
        </button>
        <button
          v-if="!isOrganizer"
          class="onode__btn"
          title="Edit this template's content"
          @click.stop="viewEditor.editTemplate(node.template)"
        >
          ✎
        </button>
        <button
          class="onode__btn onode__btn--danger"
          title="Remove"
          @click.stop="viewEditor.remove(node.id)"
        >
          ✕
        </button>
      </template>
    </div>

    <!-- ORGANIZER: a wrapping flex row of children, sized in twelfths. -->
    <div
      v-if="isOrganizer"
      ref="body"
      class="onode__body"
      :style="flexStyle"
    >
      <!-- 12-column guides for THIS organizer's own content box (see showGuides). -->
      <div
        v-if="showGuides"
        class="onode__guides"
        :class="{ 'onode__guides--active': dragActive }"
        :style="guideStyle"
        aria-hidden="true"
      >
        <span
          v-for="c in 12"
          :key="c"
        />
      </div>

      <template
        v-for="(child, i) in children"
        :key="child.id"
      >
        <div
          v-if="dropIndex === i"
          class="onode__drop"
        />
        <OrganizerNode
          :node="child"
          :editing="editing"
          :selected-id="selectedId"
        />
      </template>
      <div
        v-if="dropIndex >= children.length"
        class="onode__drop"
      />

      <div
        v-if="editing && isEmpty && dropIndex < 0"
        class="onode__empty-hint"
      >
        Drop a template here
      </div>
    </div>

    <!-- TEMPLATE: the rendered template, stacking-isolated so its own z-indexes (sticky table
       headers, dropdowns) can never paint over the frame, bands or toolbar. -->
    <template v-else>
      <div class="onode__content">
        <TemplatePanel :name="node.template" />
      </div>
      <div
        v-if="editing"
        class="onode__shield"
      />
      <div
        v-if="editing"
        class="onode__resize"
        :class="{ 'onode__resize--active': resizing }"
        title="Drag to resize by columns"
        @pointerdown="startResize"
      />
      <div
        v-if="resizing"
        class="onode__span"
      >
        {{ span }} / 12
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
// Stacking inside a node (all above the isolated template content at 0):
//   content 0 · children 1 · shield 2 · bands 3 · frame 4 · resize 5 · toolbar 6
.onode {
  position: relative;

  &__body {
    min-width: 0;
    position:  relative; // anchors the column guides to THIS organizer's content box

    // Same reason as the min-width on the nodes: without this a wide table inside a template makes
    // the whole flex line overflow the page instead of being constrained to its column.
    > .onode {
      min-width: 0;
    }
  }

  &--editing {
    min-height:  40px;
    user-select: none;
  }

  &--template.onode--editing {
    cursor: grab;
  }

  &--dragging {
    opacity: 0.4;
  }

  &--empty.onode--editing {
    background: var(--box-bg);
  }

  // ---- frame (always painted above the template) ----
  &__frame {
    border:         1px dashed var(--border);
    inset:          0;
    pointer-events: none;
    position:       absolute;
    z-index:        4;
  }

  &--editing:hover > &__frame {
    border-color: var(--link);
  }

  &--selected > &__frame {
    border:     2px solid var(--link);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6);
  }

  &--drag-active.onode--organizer > &__frame {
    border-color: var(--link);
  }

  &--empty.onode--drag-active > &__frame {
    border: 2px dashed var(--link);
  }

  // ---- box-model bands ----
  &__band {
    pointer-events: none;
    position:       absolute;
    z-index:        3;
  }

  &__band--margin {
    background: rgba(247, 181, 0, 0.35);
  }

  &__band--padding {
    background: rgba(0, 170, 90, 0.30);
  }

  // ---- toolbar ----
  &__bar {
    align-items:   center;
    background:    var(--body-bg);
    border:        1px solid var(--border);
    border-radius: var(--border-radius);
    display:       flex;
    gap:           1px;
    left:          2px;
    padding:       0 2px;
    position:      absolute;
    top:           2px;
    z-index:       6;
  }

  &__label {
    color:         var(--muted);
    font-size:     10px;
    margin:        0 3px;
    max-width:     160px;
    overflow:      hidden;
    text-overflow: ellipsis;
    white-space:   nowrap;
  }

  &__btn {
    background:  transparent;
    border:      none;
    color:       var(--body-text);
    cursor:      pointer;
    font-size:   11px;
    line-height: 1;
    padding:     2px 3px;

    &:hover {
      color: var(--link);
    }

    &--danger:hover {
      color: var(--error);
    }
  }

  // ---- column guides ----
  &__guides {
    inset:          0;
    pointer-events: none;
    position:       absolute;
    z-index:        0;

    span {
      border-left: 1px dashed var(--border);

      &:last-child {
        border-right: 1px dashed var(--border);
      }
    }

    &--active span {
      border-color: var(--link);
    }
  }

  &__body > .onode {
    position: relative;
    z-index:  1;
  }

  // Insertion marker shown while dragging.
  &__drop {
    background:    var(--link);
    border-radius: 2px;
    flex:          0 0 100%;
    height:        3px;
    margin:        2px 0;
    z-index:       2;
  }

  &__empty-hint {
    color:      var(--muted);
    flex:       0 0 100%;
    font-size:  12px;
    font-style: italic;
    padding:    14px;
    text-align: center;
  }

  // Traps the rendered template's stacking context at level 0, so its own z-indexes can't cover the
  // editor chrome (and steal its clicks).
  &__content {
    isolation: isolate;
    position:  relative;
    z-index:   0;
  }

  // Makes the live template inert while editing so a drag starts on the tile, not inside the page.
  &__shield {
    inset:    0;
    position: absolute;
    z-index:  2;
  }

  &__resize {
    bottom:   0;
    cursor:   col-resize;
    position: absolute;
    right:    0;
    top:      0;
    width:    8px;
    z-index:  5;

    &::after {
      background:    var(--border);
      border-radius: 2px;
      bottom:        6px;
      content:       '';
      position:      absolute;
      right:         2px;
      top:           6px;
      width:         3px;
    }

    &:hover::after,
    &--active::after {
      background: var(--link);
    }
  }

  &__span {
    background:     var(--link);
    border-radius:  var(--border-radius);
    bottom:         6px;
    color:          var(--body-bg);
    font-size:      11px;
    font-weight:    600;
    padding:        2px 6px;
    pointer-events: none;
    position:       absolute;
    right:          10px;
    z-index:        6;
  }
}
</style>
