<script>
import TemplateCode from './TemplateCode.vue';
import { savedHomeTemplates, homeTemplateSource } from '../templating/template-engine';
import {
  GRID_COLUMNS, GRID_ROW_HEIGHT, MIN_PANEL, clampToGrid, compact, gridRows, resolveCollisions
} from '../templating/dashboard-layout';

// The Home dashboard grid. Renders a tab's template PANELS in a 12-column grid.
//
// Outside edit mode it is SEAMLESS — no frame, title, border or gap — so several templates read as
// one page. In edit mode each panel gains a thin dashed frame with a drag grip, a "change template"
// picker, a remove button and a resize handle; a shield over the body makes the template inert so the
// whole tile can be dragged (and its own buttons don't fire). All mutations emit `update(panels)`.
export default {
  name:       'DashboardGrid',
  components: { TemplateCode },

  props: {
    panels: {
      type:    Array,
      default: () => [],
    },
    editing: {
      type:    Boolean,
      default: false,
    },
  },

  emits: ['update', 'edit'],

  data() {
    return {
      working: null, // live layout while dragging/resizing
      drag:    null, // active drag state
    };
  },

  computed: {
    layout() {
      return this.working || this.panels;
    },

    templateOptions() {
      return savedHomeTemplates(this.$store.getters).map((cr) => ({
        name:        cr.metadata?.name,
        displayName: cr.spec?.displayName || cr.metadata?.name,
      }));
    },

    rowCount() {
      const rows = gridRows(this.layout);

      return this.editing ? Math.max(rows + 2, 8) : Math.max(rows, 1);
    },

    gridStyle() {
      return { height: `${ this.rowCount * GRID_ROW_HEIGHT }px` };
    },
  },

  beforeUnmount() {
    this.detach();
  },

  methods: {
    sourceFor(name) {
      return homeTemplateSource(this.$store.getters, name);
    },

    tileStyle(panel) {
      return {
        left:   `${ (panel.x / GRID_COLUMNS) * 100 }%`,
        width:  `${ (panel.w / GRID_COLUMNS) * 100 }%`,
        top:    `${ panel.y * GRID_ROW_HEIGHT }px`,
        height: `${ panel.h * GRID_ROW_HEIGHT }px`,
      };
    },

    cellWidth() {
      return (this.$refs.grid?.clientWidth || GRID_COLUMNS) / GRID_COLUMNS;
    },

    attach() {
      window.addEventListener('pointermove', this.onPointerMove);
      window.addEventListener('pointerup', this.onPointerUp);
      window.addEventListener('pointercancel', this.onPointerUp);
      window.addEventListener('blur', this.onPointerUp);
    },

    detach() {
      window.removeEventListener('pointermove', this.onPointerMove);
      window.removeEventListener('pointerup', this.onPointerUp);
      window.removeEventListener('pointercancel', this.onPointerUp);
      window.removeEventListener('blur', this.onPointerUp);
    },

    beginDrag(mode, panel, ev) {
      if (!this.editing || ev.button !== 0) {
        return;
      }
      ev.preventDefault();

      this.drag = {
        mode,
        id:        panel.id,
        startX:    ev.clientX,
        startY:    ev.clientY,
        orig:      { ...panel },
        base:      this.panels.map((p) => ({ ...p })),
        cellWidth: this.cellWidth(),
      };
      this.working = this.drag.base;
      this.attach();
    },

    onPointerMove(ev) {
      const state = this.drag;

      if (!state) {
        return;
      }

      const dx = Math.round((ev.clientX - state.startX) / state.cellWidth);
      const dy = Math.round((ev.clientY - state.startY) / GRID_ROW_HEIGHT);

      const moved = state.mode === 'move' ? clampToGrid({
        ...state.orig, x: state.orig.x + dx, y: state.orig.y + dy
      }) : clampToGrid({
        ...state.orig,
        w: Math.max(MIN_PANEL.w, state.orig.w + dx),
        h: Math.max(MIN_PANEL.h, state.orig.h + dy),
      });

      this.working = resolveCollisions(state.base, moved);
    },

    onPointerUp() {
      if (this.drag && this.working) {
        this.$emit('update', compact(this.working));
      }
      this.drag = null;
      this.working = null;
      this.detach();
    },

    changeTemplate(panel, name) {
      if (!name || name === panel.template) {
        return;
      }
      this.$emit('update', this.layout.map((p) => (p.id === panel.id ? { ...p, template: name } : p)));
    },

    removePanel(panel) {
      this.$emit('update', compact(this.layout.filter((p) => p.id !== panel.id)));
    },
  },
};
</script>

<template>
  <div
    ref="grid"
    class="dash-grid"
    :class="{ 'dash-grid--editing': editing }"
    :style="gridStyle"
  >
    <div
      v-if="editing && !layout.length"
      class="dash-grid__empty"
    >
      Add a template to get started.
    </div>

    <div
      v-for="panel in layout"
      :key="panel.id"
      class="dash-grid__tile"
      :class="{ 'dash-grid__tile--dragging': drag && drag.id === panel.id, 'dash-grid__tile--editing': editing }"
      :style="tileStyle(panel)"
    >
      <!-- Edit chrome: grip / change-template / remove -->
      <div
        v-if="editing"
        class="dash-grid__bar"
        @pointerdown="beginDrag('move', panel, $event)"
      >
        <span
          class="dash-grid__grip"
          aria-hidden="true"
        />
        <select
          class="dash-grid__pick"
          :value="panel.template"
          title="Change template"
          @pointerdown.stop
          @change="changeTemplate(panel, $event.target.value)"
        >
          <option
            v-for="t in templateOptions"
            :key="t.name"
            :value="t.name"
          >
            {{ t.displayName }}
          </option>
        </select>
        <button
          type="button"
          class="dash-grid__edit"
          title="Edit this template's content"
          @pointerdown.stop
          @click="$emit('edit', panel.template)"
        >
          <i class="icon icon-edit" />
        </button>
        <button
          type="button"
          class="dash-grid__x"
          title="Remove"
          @pointerdown.stop
          @click="removePanel(panel)"
        >
          <i class="icon icon-close" />
        </button>
      </div>

      <div class="dash-grid__body">
        <TemplateCode
          v-if="sourceFor(panel.template)"
          :source="sourceFor(panel.template)"
        />
        <div
          v-else
          class="dash-grid__missing"
        >
          Template "{{ panel.template }}" not found.
        </div>
        <!-- In edit mode the template is inert so the whole tile drags and its buttons don't fire -->
        <div
          v-if="editing"
          class="dash-grid__shield"
          @pointerdown="beginDrag('move', panel, $event)"
        />
      </div>

      <span
        v-if="editing"
        class="dash-grid__resize"
        title="Drag to resize"
        @pointerdown.stop="beginDrag('resize', panel, $event)"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.dash-grid {
  position:   relative;
  width:      100%;
  transition: height 0.1s linear;

  &--editing {
    background-image:
      linear-gradient(to right, var(--border) 1px, transparent 1px),
      linear-gradient(to bottom, var(--border) 1px, transparent 1px);
    background-size: calc(100% / 12) 56px;
    border-radius:  4px;
  }

  &__empty {
    align-items:    center;
    border:         1px dashed var(--border);
    border-radius:  4px;
    color:          var(--muted);
    display:        flex;
    height:         100%;
    justify-content: center;
  }

  &__tile {
    position:   absolute;
    transition: left 0.12s ease, top 0.12s ease, width 0.12s ease, height 0.12s ease;

    // Seamless outside edit: no padding/border/gap so panels read as one page.
    &--editing {
      padding: 4px;
    }

    &--dragging {
      transition: none;
      z-index:    10;
    }
  }

  &__bar {
    align-items:   center;
    background:    var(--nav-bg, var(--box-bg));
    border:        1px dashed var(--border);
    border-bottom: none;
    cursor:        grab;
    display:       flex;
    gap:           6px;
    height:        26px;
    padding:       0 6px;
  }

  &__grip {
    background-image: radial-gradient(var(--muted) 1px, transparent 1px);
    background-size:  3px 3px;
    height:           12px;
    width:            10px;
    flex:             0 0 auto;
  }

  &__pick {
    background:    var(--body-bg);
    border:        1px solid var(--border);
    border-radius: var(--border-radius);
    color:         var(--body-text);
    font-size:     11px;
    height:        20px;
    max-width:     220px;
  }

  &__edit {
    background:   transparent;
    border:       none;
    color:        var(--muted);
    cursor:       pointer;
    line-height:  1;
    margin-left:  auto;
    padding:      2px 4px;

    &:hover {
      color: var(--primary);
    }
  }

  &__x {
    background:   transparent;
    border:       none;
    color:        var(--muted);
    cursor:       pointer;
    line-height:  1;
    padding:      2px 4px;

    &:hover {
      color: var(--error);
    }
  }

  &__body {
    height:   100%;
    min-height: 0;
    overflow: auto;
    position: relative;
  }

  &__tile--editing &__body {
    border:   1px dashed var(--border);
    height:   calc(100% - 26px);
  }

  &__shield {
    cursor:   grab;
    inset:    0;
    position: absolute;
  }

  &__missing {
    color:   var(--muted);
    padding: 12px;
  }

  &__resize {
    border-bottom: 2px solid var(--muted);
    border-right:  2px solid var(--muted);
    bottom:        6px;
    cursor:        nwse-resize;
    height:        10px;
    position:      absolute;
    right:         6px;
    width:         10px;
  }
}
</style>
