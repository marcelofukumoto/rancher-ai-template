<script>
import { TABLE_COLUMNS, FIELDS } from '../templating/widget-data';
import {
  SUGGESTED_RESOURCES, blockName, WIDGET_TABLE, WIDGET_LIST, WIDGET_TEXT, WIDGET_LINKS, WIDGET_TIME_SERIES, WIDGET_BANNER
} from '../templating/widget-catalog';

// "What this widget shows" — the panel behind a widget's ⚙.
//
// IN PLACE, deliberately: it opens beside the widget it belongs to, over a page that stays lit,
// because the thing you are describing is right there and you want to keep seeing it. A centred
// modal over a dimmed page would hide exactly what you are configuring.
//
// It edits a COPY and only hands it back on Done, so Cancel really does leave the widget alone. The
// fields shown depend on the building block: a table needs columns and a sort, a text note needs a
// body, a links list needs links — asking a Text widget which columns to show would be nonsense.
const PANEL_WIDTH = 400;
const MARGIN = 12;

export default {
  name: 'WidgetSettingsModal',

  props: {
    widget: {
      type:     Object,
      required: true,
    },
    // Where on screen the widget sits, so the panel can open next to it.
    anchor: {
      type:    Object,
      default: null,
    },
  },

  emits: ['done', 'cancel', 'remove'],

  data() {
    return {
      draft:     JSON.parse(JSON.stringify(this.widget)),
      resources: SUGGESTED_RESOURCES,
      columns:   TABLE_COLUMNS,
      fields:    FIELDS,
    };
  },

  computed: {
    // Sit against the widget's left edge and stay on screen. Falls back to the middle of the
    // viewport when we were not told where the widget is.
    position() {
      const a = this.anchor;
      const bar = document.querySelector('.vbar');
      // Never over the view bar: Cancel and Save live there and stay reachable with this open.
      const floor = bar ? Math.round(bar.getBoundingClientRect().bottom) + 8 : MARGIN;

      if (!a) {
        return {
          left: '50%', top: `${ floor }px`, transform: 'translateX(-50%)'
        };
      }

      const maxLeft = window.innerWidth - PANEL_WIDTH - MARGIN;
      const left = Math.max(MARGIN, Math.min(a.left, maxLeft));
      const top = Math.max(floor, Math.min(a.top, window.innerHeight - 200));

      return { left: `${ left }px`, top: `${ top }px` };
    },

    // "Clusters: what this table shows" — the widget's own title, then what kind of thing it is.
    heading() {
      const what = blockName(this.draft.kind).toLowerCase();

      return `${ this.draft.title || blockName(this.draft.kind) }: what this ${ what } shows`;
    },

    // Which sections apply to this building block.
    readsData() {
      return ![WIDGET_TEXT, WIDGET_LINKS, WIDGET_TIME_SERIES, WIDGET_BANNER].includes(this.draft.kind);
    },

    hasColumns() {
      return this.draft.kind === WIDGET_TABLE;
    },

    hasSort() {
      return [WIDGET_TABLE, WIDGET_LIST].includes(this.draft.kind);
    },

    hasGroupBy() {
      return ['counters', 'statusSummary', 'barChart'].includes(this.draft.kind);
    },

    hasLimit() {
      return this.draft.kind === WIDGET_LIST;
    },

    // The suggested list, plus whatever this widget already points at (which may be a CRD that is
    // not on the list) so the picker never silently drops it.
    resourceOptions() {
      const known = this.resources.some((r) => r.value === this.draft.resource);

      return known || !this.draft.resource ? this.resources : [{ value: this.draft.resource, label: this.draft.resource }, ...this.resources];
    },

    targetsText: {
      get() {
        return (this.draft.targets || []).join(', ');
      },
      set(value) {
        this.draft.targets = `${ value }`.split(',').map((t) => t.trim()).filter(Boolean);
      },
    },

    linksText: {
      get() {
        return (this.draft.links || []).map((l) => `${ l.label } ${ l.url }`).join('\n');
      },
      set(value) {
        this.draft.links = `${ value }`.split('\n').map((line) => {
          const at = line.trim().lastIndexOf(' ');

          return at < 0 ? null : { label: line.trim().slice(0, at).trim(), url: line.trim().slice(at + 1).trim() };
        }).filter((l) => l && l.label && l.url);
      },
    },
  },

  mounted() {
    // Escape closes it, like every other dialog in the product.
    this.onKey = (ev) => {
      if (ev.key === 'Escape') {
        this.$emit('cancel');
      }
    };
    window.addEventListener('keydown', this.onKey);

    // With no scrim there is nothing to click "through" to, so a click anywhere outside closes it.
    // Deferred past this tick so the very click that opened it does not immediately close it.
    this.onOutside = (ev) => {
      if (!this.$el?.contains(ev.target)) {
        this.$emit('cancel');
      }
    };
    setTimeout(() => document.addEventListener('mousedown', this.onOutside), 0);
  },

  beforeUnmount() {
    window.removeEventListener('keydown', this.onKey);
    document.removeEventListener('mousedown', this.onOutside);
  },

  methods: {
    toggleColumn(id) {
      const columns = [...(this.draft.columns || [])];
      const at = columns.indexOf(id);

      if (at >= 0) {
        columns.splice(at, 1);
      } else {
        // Keep the canonical field order so the table reads the same however they were ticked.
        columns.push(id);
        columns.sort((a, b) => this.columns.findIndex((c) => c.id === a) - this.columns.findIndex((c) => c.id === b));
      }

      this.draft.columns = columns;
    },

    hasColumn(id) {
      return (this.draft.columns || []).includes(id);
    },
  },
};
</script>

<template>
  <div
    class="wsm"
    :style="position"
    role="dialog"
    aria-label="Widget settings"
  >
    <div class="wsm__dialog">
      <header class="wsm__head">
        <h3 class="wsm__title">
          <i class="icon icon-gear" />
          {{ heading }}
        </h3>
        <button
          class="wsm__close"
          title="Close"
          aria-label="Close"
          @click="$emit('cancel')"
        >
          <i class="icon icon-close" />
        </button>
      </header>

      <div class="wsm__body">
        <label class="wsm__label">Title</label>
        <input
          v-model="draft.title"
          class="wsm__field"
        >

        <template v-if="readsData">
          <label class="wsm__label">Resource</label>
          <select
            v-model="draft.resource"
            class="wsm__field"
          >
            <option
              v-for="option in resourceOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
          <p class="wsm__hint">
            Any kind Rancher knows, including your own CRDs.
          </p>

          <label class="wsm__label">Where</label>
          <label class="wsm__radio">
            <input
              v-model="draft.where"
              type="radio"
              value="view"
            >
            Same as the view (all clusters I can see)
          </label>
          <label class="wsm__radio">
            <input
              v-model="draft.where"
              type="radio"
              value="custom"
            >
            Only these clusters or namespaces
          </label>
          <input
            v-if="draft.where === 'custom'"
            v-model="targetsText"
            class="wsm__field"
            placeholder="prod-eu-1, prod-us-2"
          >

          <label class="wsm__label">Filter</label>
          <input
            v-model="draft.filter"
            class="wsm__field"
            placeholder="state != Active"
          >
          <p class="wsm__hint">
            Labels or fields, such as env=prod or state != Active.
          </p>
        </template>

        <template v-if="hasColumns">
          <label class="wsm__label">Columns</label>
          <div class="wsm__columns">
            <label
              v-for="column in columns"
              :key="column.id"
            >
              <input
                type="checkbox"
                :checked="hasColumn(column.id)"
                @change="toggleColumn(column.id)"
              >
              {{ column.label }}
            </label>
          </div>
          <p class="wsm__hint">
            Columns appear in this order. Untick one to drop it from the table.
          </p>
        </template>

        <template v-if="hasGroupBy">
          <label class="wsm__label">Group by</label>
          <select
            v-model="draft.groupBy"
            class="wsm__field"
          >
            <option
              v-for="field in fields"
              :key="field.id"
              :value="field.id"
            >
              {{ field.label }}
            </option>
          </select>
        </template>

        <template v-if="hasSort">
          <label class="wsm__label">Sort by</label>
          <div class="wsm__pair">
            <select
              v-model="draft.sortBy"
              class="wsm__field"
            >
              <option value="">
                Nothing
              </option>
              <option
                v-for="field in fields"
                :key="field.id"
                :value="field.id"
              >
                {{ field.label }}
              </option>
            </select>
            <select
              v-model="draft.sortDir"
              class="wsm__field"
            >
              <option value="asc">
                Ascending
              </option>
              <option value="desc">
                Descending
              </option>
            </select>
          </div>
        </template>

        <template v-if="hasLimit">
          <label class="wsm__label">Show at most</label>
          <input
            v-model.number="draft.limit"
            class="wsm__field"
            type="number"
            min="0"
          >
          <p class="wsm__hint">
            0 shows every row that matches.
          </p>
        </template>

        <template v-if="draft.kind === 'text'">
          <label class="wsm__label">Text</label>
          <textarea
            v-model="draft.body"
            class="wsm__field wsm__field--area"
            rows="6"
          />
          <p class="wsm__hint">
            Markdown — headings, **bold**, lists and links all work.
          </p>
        </template>

        <template v-if="draft.kind === 'links'">
          <label class="wsm__label">Links</label>
          <textarea
            v-model="linksText"
            class="wsm__field wsm__field--area"
            rows="6"
            placeholder="Runbook https://wiki.example.com/runbook"
          />
          <p class="wsm__hint">
            One per line: the label, then the URL. Leave empty for Rancher's own community links.
          </p>
        </template>

        <template v-if="draft.kind === 'timeSeries'">
          <label class="wsm__label">Grafana panel URL</label>
          <input
            v-model="draft.url"
            class="wsm__field"
            placeholder="https://grafana.example.com/d-solo/abc/dashboard?panelId=2"
          >
          <p class="wsm__hint">
            Take it from Grafana's Share → Embed on the panel you want.
          </p>
        </template>

        <template v-if="draft.kind === 'banner'">
          <label class="wsm__label">Subtitle</label>
          <input
            v-model="draft.subtitle"
            class="wsm__field"
          >
          <label class="wsm__label">Background image</label>
          <input
            v-model="draft.image"
            class="wsm__field"
            placeholder="Leave empty for the Rancher banner"
          >
        </template>


        <footer class="wsm__foot">
          <button
            class="btn btn-sm role-secondary"
            @click="$emit('remove')"
          >
            Remove from view
          </button>
          <button
            class="btn btn-sm role-primary"
            @click="$emit('done', draft)"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// 400px wide, sitting over the page rather than behind a scrim. Sizes are the design's: a 42px
// header, a 14/16/16 body whose fields are 8px apart, controls 24px tall, and a 32px footer row.
.wsm {
  position: fixed;
  z-index:  200;

  &__dialog {
    background:     var(--body-bg);
    border:         1px solid var(--border);
    border-radius:  4px;
    box-shadow:     0 8px 32px rgba(0, 0, 0, 0.25);
    display:        flex;
    flex-direction: column;
    max-height:     min(86vh, 720px);
    width:          400px;
  }

  &__head {
    align-items:     center;
    border-bottom:   1px solid var(--border);
    box-sizing:      border-box;
    display:         flex;
    gap:             8px;
    height:          42px;
    padding:         12px 12px 12px 16px;
  }

  &__title {
    align-items: center;
    display:     flex;
    flex:        1 1 auto;
    font-size:   14px;
    font-weight: 700;
    gap:         8px;
    // Pinned, or the default line box makes the 42px header grow to 48.
    line-height: 17px;
    margin:      0;
    min-width:   0;
    overflow:    hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    i {
      flex:      0 0 auto;
      font-size: 16px;
    }
  }

  &__close {
    background:  transparent;
    border:      none;
    color:       var(--body-text);
    cursor:      pointer;
    display:     flex;
    font-size:   16px;
    line-height: 1;
    min-height:  0;
    padding:     0;

    &:hover {
      color: var(--link);
    }
  }

  &__body {
    display:        flex;
    flex-direction: column;
    gap:            8px;
    overflow-y:     auto;
    padding:        14px 16px 16px;

    // Same reason as the drawer: a column flex container squashes fixed-height controls before it
    // agrees to overflow, so nothing in here shrinks.
    > * {
      flex: 0 0 auto;
    }
  }

  // A field's label sits 6px above its control; the 8px between FIELDS comes from the body's gap.
  &__label {
    color:         var(--muted);
    display:       block;
    font-size:     12px;
    font-weight:   700;
    line-height:   14px;
    margin-bottom: 6px;
  }

  &__field {
    background:    var(--body-bg);
    border:        1px solid var(--border);
    border-radius: var(--border-radius);
    box-sizing:    border-box;
    color:         var(--body-text);
    font-family:   inherit;
    font-size:     14px;
    height:        24px;
    padding:       0 8px;
    width:         100%;

    &--area {
      height:  auto;
      padding: 6px 8px;
      resize:  vertical;
    }
  }

  &__hint {
    color:       var(--muted);
    font-size:   12px;
    line-height: 14px;
    margin:      6px 0 0;
  }

  &__radio {
    align-items: center;
    display:     flex;
    font-size:   14px;
    gap:         8px;
    line-height: 17px;
  }

  // Three across, as the design lays the column checkboxes out.
  &__columns {
    display:               grid;
    gap:                   4px 12px;
    grid-template-columns: repeat(3, minmax(0, 1fr));

    label {
      align-items: center;
      display:     flex;
      font-size:   14px;
      gap:         6px;
    }
  }

  &__pair {
    display:               grid;
    gap:                   8px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  &__foot {
    border-top:      1px solid var(--border);
    display:         flex;
    gap:             12px;
    justify-content: flex-end;
    margin-top:      6px;
    padding-top:     12px;
  }
}
</style>
