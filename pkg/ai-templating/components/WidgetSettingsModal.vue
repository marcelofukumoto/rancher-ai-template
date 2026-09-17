<script>
import { TABLE_COLUMNS, FIELDS } from '../templating/widget-data';
import {
  SUGGESTED_RESOURCES, blockName, WIDGET_TABLE, WIDGET_LIST, WIDGET_TEXT, WIDGET_LINKS, WIDGET_TIME_SERIES, WIDGET_BANNER
} from '../templating/widget-catalog';

// "What this widget shows" — the dialog behind a widget's ⚙.
//
// It edits a COPY and only hands it back on Done, so Cancel really does leave the widget alone. The
// fields shown depend on the building block: a table needs columns and a sort, a text note needs a
// body, a links list needs links — asking a Text widget which columns to show would be nonsense.
export default {
  name: 'WidgetSettingsModal',

  props: {
    widget: {
      type:     Object,
      required: true,
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
  },

  beforeUnmount() {
    window.removeEventListener('keydown', this.onKey);
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
    @click.self="$emit('cancel')"
  >
    <div
      class="wsm__dialog"
      role="dialog"
      aria-modal="true"
    >
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
      </div>

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
</template>

<style lang="scss" scoped>
.wsm {
  align-items:     center;
  background:      rgba(0, 0, 0, 0.35);
  display:         flex;
  inset:           0;
  justify-content: center;
  position:        fixed;
  z-index:         200;

  &__dialog {
    background:     var(--body-bg);
    border:         1px solid var(--border);
    border-radius:  4px;
    box-shadow:     0 8px 32px rgba(0, 0, 0, 0.25);
    display:        flex;
    flex-direction: column;
    max-height:     86vh;
    width:          560px;
  }

  &__head {
    align-items:     center;
    border-bottom:   1px solid var(--border);
    display:         flex;
    justify-content: space-between;
    padding:         16px 20px;
  }

  &__title {
    align-items: center;
    display:     flex;
    font-size:   16px;
    font-weight: 600;
    gap:         8px;
    margin:      0;
  }

  &__close {
    background: transparent;
    border:     none;
    color:      var(--body-text);
    cursor:     pointer;
    font-size:  16px;

    &:hover {
      color: var(--link);
    }
  }

  &__body {
    display:        flex;
    flex-direction: column;
    gap:            6px;
    overflow-y:     auto;
    padding:        20px;
  }

  &__label {
    font-size:   13px;
    font-weight: 600;
    margin-top:  10px;

    &:first-child {
      margin-top: 0;
    }
  }

  &__field {
    background:    var(--body-bg);
    border:        1px solid var(--border);
    border-radius: var(--border-radius);
    box-sizing:    border-box;
    color:         var(--body-text);
    font-family:   inherit;
    font-size:     14px;
    height:        32px;
    padding:       0 10px;
    width:         100%;

    &--area {
      height:     auto;
      padding:    8px 10px;
      resize:     vertical;
    }
  }

  &__hint {
    color:     var(--muted);
    font-size: 12px;
    margin:    0;
  }

  &__radio {
    align-items: center;
    display:     flex;
    font-size:   14px;
    gap:         8px;
  }

  // Three across, as the design lays the column checkboxes out.
  &__columns {
    display:               grid;
    gap:                   8px 16px;
    grid-template-columns: repeat(3, minmax(0, 1fr));

    label {
      align-items: center;
      display:     flex;
      font-size:   14px;
      gap:         8px;
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
    gap:             8px;
    justify-content: flex-end;
    padding:         16px 20px;
  }
}
</style>
