<script>
import { askAgent, extractJson } from '../templating/agent-client';
import { normalizeWidget } from '../templating/view-model';
import { blockName, catalogEntry } from '../templating/widget-catalog';
import { fieldLabel } from '../templating/widget-data';

// LIZ — she turns a sentence into a widget.
//
// This is the drawer's other FACE, not a box inside the Add tab: the design gives Liz the whole
// 380px slot, titled by the drawer header, with a Go back out of her. So there is no heading in
// here — the header is the heading.
//
// The important part is not the asking, it is the READ-BACK. Liz answers with a widget spec, and
// this panel shows, in plain words, how she read the sentence: which building block, which
// resource, where, what filter, what sort, what title. You approve a thing you can see rather than
// a thing you have to trust — and either way the widget is an ordinary widget afterwards, with the
// same settings dialog as one you dragged on yourself.
const AGENT = 'template-widget-describer';

export default {
  name: 'LizWidgetPanel',

  props: {
    viewName: {
      type:    String,
      default: '',
    },
  },

  emits: ['preview'],

  data() {
    return {
      prompt: '',
      busy:   false,
      error:  '',
      widget: null, // the spec Liz came back with, previewed on the grid but not yet part of the view
      span:   6,
    };
  },

  computed: {
    // The read-back, in the order the design lists it.
    readBack() {
      if (!this.widget) {
        return [];
      }

      const rows = [
        { label: 'Widget', value: blockName(this.widget.kind) },
        { label: 'Resource', value: this.widget.resource || '—' },
        { label: 'Where', value: this.widget.where === 'custom' ? (this.widget.targets.join(', ') || 'Selected clusters') : 'The same clusters as the view' },
      ];

      if (this.widget.filter) {
        rows.push({ label: 'Filter', value: this.widget.filter });
      }
      if (this.widget.groupBy) {
        rows.push({ label: 'Grouped by', value: fieldLabel(this.widget.groupBy) });
      }
      if (this.widget.sortBy) {
        rows.push({ label: 'Sort', value: `${ fieldLabel(this.widget.sortBy) }, ${ this.widget.sortDir === 'desc' ? 'descending' : 'ascending' }` });
      }

      rows.push({ label: 'Title', value: this.widget.title || '—' });

      return rows;
    },
  },

  methods: {
    async create() {
      const text = this.prompt.trim();

      if (!text || this.busy) {
        return;
      }

      this.busy = true;
      this.error = '';
      this.widget = null;

      try {
        const reply = await askAgent({ agent: AGENT, prompt: text });
        const spec = extractJson(reply);

        if (!spec?.kind) {
          throw new Error('Liz answered, but not with a widget. Try describing it a different way.');
        }

        this.widget = normalizeWidget(spec);
        this.span = catalogEntry(this.widget.kind)?.span || 6;

        // Put it on the grid as a PREVIEW straight away — the design's "I put a preview on the
        // grid", so you judge the real widget with real data, not a description of one.
        this.$emit('preview', {
          widget: this.widget, span: this.span, state: 'preview'
        });
      } catch (e) {
        this.error = e?.message || 'Could not reach Liz.';
      } finally {
        this.busy = false;
      }
    },

    add() {
      this.$emit('preview', {
        widget: this.widget, span: this.span, state: 'add'
      });
      this.reset();
    },

    discard() {
      this.$emit('preview', { state: 'discard' });
      this.reset();
    },

    reset() {
      this.widget = null;
      this.prompt = '';
      this.error = '';
    },
  },
};
</script>

<template>
  <section class="liz">
    <textarea
      v-model="prompt"
      class="liz__input"
      rows="2"
      placeholder="Pods in prod that restarted more than 3 times in the last hour, worst first"
      :disabled="busy"
    />

    <div class="liz__actions">
      <p class="liz__hint">
        Liz builds it from the same building blocks. You can change everything afterwards.
      </p>
      <button
        class="btn btn-sm role-primary"
        :disabled="busy || !prompt.trim()"
        @click="create"
      >
        {{ busy ? 'Thinking…' : 'Create' }}
      </button>
    </div>

    <p
      v-if="error"
      class="liz__error"
    >
      {{ error }}
    </p>

    <template v-if="widget">
      <h5 class="liz__read-title">
        Here is how I read that
      </h5>
      <dl class="liz__read">
        <template
          v-for="row in readBack"
          :key="row.label"
        >
          <dt>{{ row.label }}</dt>
          <dd>{{ row.value }}</dd>
        </template>
      </dl>
      <p class="liz__hint">
        The preview is on the grid. Add it, or adjust the settings on the widget first.
      </p>
      <div class="liz__buttons">
        <button
          class="btn btn-sm role-secondary"
          @click="discard"
        >
          Discard
        </button>
        <button
          class="btn btn-sm role-primary"
          @click="add"
        >
          Add to view
        </button>
      </div>
    </template>
  </section>
</template>

<style lang="scss" scoped>
.liz {
  display:        flex;
  flex:           1 1 auto;
  flex-direction: column;
  gap:            14px;
  overflow-y:     auto;
  padding:        16px;

  // A column flex container shrinks its items before it overflows; nothing in here shrinks.
  > * {
    flex: 0 0 auto;
  }

  &__title {
    align-items: center;
    display:     flex;
    font-size:   14px;
    font-weight: 600;
    gap:         8px;
    margin:      0;
  }

  &__input {
    background:    var(--body-bg);
    border:        1px solid var(--border);
    border-radius: var(--border-radius);
    box-sizing:    border-box;
    color:         var(--body-text);
    font-family:   inherit;
    font-size:     14px;
    padding:       8px 10px;
    resize:        vertical;
    width:         100%;
  }

  &__actions {
    align-items: flex-end;
    display:     flex;
    gap:         12px;
  }

  &__hint {
    color:       var(--muted);
    flex:        1 1 auto;
    font-size:   12px;
    line-height: 1.35;
    margin:      0;
  }

  &__error {
    color:     var(--error);
    font-size: 12px;
    margin:    0;
  }

  &__read-title {
    font-size:   13px;
    font-weight: 700;
    margin:      4px 0 0;
  }

  // Label / value pairs, the labels in a fixed column so they line up like the design's table.
  &__read {
    display:               grid;
    font-size:             13px;
    gap:                   6px 12px;
    grid-template-columns: 84px minmax(0, 1fr);
    margin:                0;

    dt {
      color: var(--muted);
    }

    dd {
      margin:     0;
      overflow:   hidden;
      text-overflow: ellipsis;
    }
  }

  &__buttons {
    display:         flex;
    gap:             8px;
    justify-content: flex-end;
  }
}
</style>
