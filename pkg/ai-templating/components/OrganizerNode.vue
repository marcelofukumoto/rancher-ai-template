<script>
import TemplatePanel from './TemplatePanel.vue';
import WidgetHost from './widgets/WidgetHost.vue';
import {
  NODE_WIDGET, GRID_COLUMNS, DEFAULT_GAP, isLeaf, cssSize, cssSides, normalizeSides, clampSpan
} from '../templating/view-model';

// Recursively renders ONE node of a panel's layout tree.
//
//   ORGANIZER → a FLEX row (wrapping) laid out in twelfths. A nested organizer always takes a whole
//               line, so organizers stack — an organizer is ALWAYS 100% wide. Rows are STRUCTURE,
//               not something you configure, so in edit mode they show no chrome of their own.
//   WIDGET    → a leaf rendering one building block from the catalog, sized by its col span (1..12).
//   TEMPLATE  → a leaf rendering one stored template ConfigMap, sized the same way.
//
// Flex (not grid) is deliberate: it is what the stock Home uses, and a flex item resolves PERCENTAGE
// margins against the whole flex container. A grid item resolves them against its own grid area, so
// `margin-left: 1.75%` on a col-span-3 item silently became a quarter of what you asked for. To keep
// the columns exact even with margins, a template's flex-basis subtracts its own horizontal margins:
//     flex: 0 0 calc(<span/12>% - <margin-left> - <margin-right>)
// so basis + margins == the span's share of the row, and nothing wraps unexpectedly.
//
// Outside edit mode this renders SEAMLESSLY — no chrome. In edit mode every WIDGET wears its own
// header ("Drag to move", settings, remove), the selected node shows its margin/padding bands, and
// all chrome is painted ABOVE the rendered widget (which is stacking-isolated so its own z-indexes
// can't cover the editor).
export default {
  name:       'OrganizerNode',
  components: { TemplatePanel, WidgetHost },

  inject: {
    viewEditor: {
      default: () => ({
        select:       () => {},
        move:         () => {},
        remove:       () => {},
        configure:    () => {},
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
    // The gap between widgets — one value for the whole VIEW, handed down the tree unchanged.
    gap: {
      type:    Number,
      default: DEFAULT_GAP,
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
      return !isLeaf(this.node);
    },

    isWidget() {
      return this.node.type === NODE_WIDGET;
    },

    // A widget Liz built and put on the grid to be judged. It renders with real data like any
    // other, but wears a different colour and says plainly that it is not part of the view yet.
    isPreview() {
      return !!this.node.preview;
    },

    isSelected() {
      return this.editing && this.selectedId === this.node.id;
    },

    // The margin/padding bands answer "where do these pixels go?", which is only a question while
    // you are typing pixels — so they are drawn only when the Layout tab's Advanced panel is open.
    // Left on permanently they cover most of a small widget in green and fight with its own chrome.
    showBoxModel() {
      return this.isSelected && !!this.viewEditor.ui?.showBoxModel;
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

    // Something is on its way onto the grid: either a widget already on it being moved, or a
    // catalog entry being dragged in from the drawer. Both light up the drop targets.
    dragActive() {
      const ui = this.viewEditor.ui;

      return this.editing && !!(ui?.dragId || ui?.dragEntry);
    },

    // Every LEAF wears its header while editing (that header is how you drag it), so unlike the
    // hover-only chrome this replaced, the grid reads the same whatever the pointer is over.
    showBar() {
      return this.editing && !this.isOrganizer;
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

      return (this.children || []).some((c) => c.id === sel && isLeaf(c));
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
        // The span's share of a 12-column row that has a GAP between every column: a span-s widget
        // covers s columns plus the (s-1) gaps it swallows, where a column is (100% - 11 gaps)/12.
        // Written out rather than using a CSS grid because the row is a flex line (see the note at
        // the top of this file), and this is the arithmetic a grid would do for us.
        const gaps = (GRID_COLUMNS - 1) * this.gap;
        const own = (this.span - 1) * this.gap;
        const subtract = [this.margin.left, this.margin.right]
          .filter((v) => v && v !== 0)
          .map(cssSize);
        const basis = `calc((100% - ${ gaps }px) * ${ this.span } / ${ GRID_COLUMNS } + ${ own }px${ subtract.length ? ` - ${ subtract.join(' - ') }` : '' })`;

        s.flex = `0 0 ${ basis }`;
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
        gap:          `${ this.gap }px`,
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
        gap:                 `${ this.gap }px`,
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

    // What the empty row at the bottom of the view invites you to do. While something is being
    // dragged it names it ("Drop here to add a Table") so the target is unmistakable.
    barLabel() {
      return this.isPreview ? 'Preview from Liz. Not yet part of the view.' : 'Drag to move';
    },

    dropHint() {
      const label = this.viewEditor.ui?.dragLabel;

      return label ? `Drop here to add a ${ label }` : 'Drop a component here';
    },

    // Kept for the drag/hover logic below: a row has no header, a leaf does.
    label() {
      return this.isOrganizer ? '' : this.barLabel;
    },
  },

  watch: {
    showBoxModel: {
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
      if (!this.showBoxModel || !this.$el?.getBoundingClientRect) {
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
      if (!this.editing || !this.isOrganizer || !this.dragActive) {
        return;
      }
      // Innermost organizer wins the drop.
      ev.preventDefault();
      ev.stopPropagation();
      ev.dataTransfer.dropEffect = this.viewEditor.ui?.dragEntry ? 'copy' : 'move';
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
      'onode--leaf': !isOrganizer,
      'onode--root': isRoot,
      'onode--empty': isEmpty,
      'onode--dragging': beingDragged,
      'onode--drag-active': dragActive,
      'onode--preview': isPreview,
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
    <template v-if="showBoxModel">
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

    <!-- The frame is a real overlay (not an `outline`) so the rendered widget can never cover it.
       Only WIDGETS get one: a row is structure, and outlining every row buries the grid in boxes. -->
    <div
      v-if="editing && (!isOrganizer || isEmpty)"
      class="onode__frame"
    />

    <!-- A widget's own header: grab it to move the widget, or reach its settings and remove. -->
    <div
      v-if="showBar"
      class="onode__bar"
    >
      <i
        class="onode__grip icon"
        :class="isPreview ? 'icon-chat' : 'icon-drag'"
      />
      <span class="onode__label">{{ barLabel }}</span>
      <span class="onode__bar-gap" />
      <button
        class="onode__btn"
        :title="isWidget ? 'What this widget shows' : `Edit this template's content`"
        @click.stop="isWidget ? viewEditor.configure(node.id) : viewEditor.editTemplate(node.template)"
      >
        <i class="icon icon-gear" />
      </button>
      <button
        v-if="!isPreview"
        class="onode__btn onode__btn--danger"
        title="Remove from view"
        @click.stop="viewEditor.remove(node.id)"
      >
        <i class="icon icon-close" />
      </button>
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
          :gap="gap"
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
        {{ dropHint }}
      </div>
    </div>

    <!-- LEAF: the rendered widget (or stored template), stacking-isolated so its own z-indexes
       (sticky table headers, dropdowns) can never paint over the frame, bands or header. -->
    <template v-else>
      <div class="onode__content">
        <WidgetHost
          v-if="isWidget"
          :widget="node.widget"
        />
        <TemplatePanel
          v-else
          :name="node.template"
        />
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

  &--leaf.onode--editing {
    cursor: grab;
  }

  &--dragging {
    opacity: 0.4;
  }

  // The trailing empty row is the drop target, and says so: a tinted, dashed panel.
  &--empty.onode--editing {
    background:    rgba(61, 152, 211, 0.06);
    border-radius: 4px;
  }

  &--empty.onode--drag-active {
    background: rgba(61, 152, 211, 0.12);
  }

  // ---- frame (always painted above the widget) ----
  &__frame {
    border:         1px dashed var(--link);
    border-radius:  4px;
    inset:          0;
    pointer-events: none;
    position:       absolute;
    z-index:        4;
  }

  // The selected widget reads as selected without moving anything: a solid border of the same
  // weight, plus a soft ring, so nothing on the grid shifts by a pixel when you click it.
  &--selected > &__frame {
    border-style: solid;
    box-shadow:   0 0 0 2px rgba(61, 152, 211, 0.25);
  }

  &--empty.onode--drag-active > &__frame {
    border-width: 2px;
  }

  // Liz's preview: the same chrome in green, so it is unmistakably a proposal and not yet yours.
  &--preview > &__frame {
    border-color: var(--success);
  }

  &--preview > &__bar {
    background: rgba(0, 170, 90, 0.12);
  }

  &--preview > &__bar &__label,
  &--preview > &__bar &__grip {
    color: var(--success);
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

  // ---- widget header ----
  // A 24px strip along the top of the widget, inside its dashed frame: grip + "Drag to move" on the
  // left, settings and remove on the right.
  &__bar {
    align-items:  center;
    background:   var(--subtle-border, var(--box-bg));
    box-sizing:   border-box;
    display:      flex;
    gap:          8px;
    height:       24px;
    left:         0;
    padding:      0 6px;
    position:     absolute;
    right:        0;
    top:          0;
    z-index:      6;
  }

  &__grip {
    color:     var(--muted);
    font-size: 14px;
  }

  &__label {
    color:         var(--muted);
    font-size:     12px;
    overflow:      hidden;
    text-overflow: ellipsis;
    white-space:   nowrap;
  }

  &__bar-gap {
    flex: 1 1 auto;
  }

  &__btn {
    align-items: center;
    background:  transparent;
    border:      none;
    color:       var(--body-text);
    cursor:      pointer;
    display:     flex;
    font-size:   14px;
    line-height: 1;
    padding:     2px;

    &:hover {
      color: var(--link);
    }

    &--danger:hover {
      color: var(--error);
    }
  }

  // The header sits over the widget, so push the widget itself down by exactly its height — nothing
  // is ever hidden underneath it.
  &--editing.onode--leaf > &__content {
    padding-top: 24px;
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
    align-items:    center;
    color:          var(--link);
    display:        flex;
    flex:           0 0 100%;
    font-size:      14px;
    justify-content: center;
    min-height:     78px;
    text-align:     center;
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
