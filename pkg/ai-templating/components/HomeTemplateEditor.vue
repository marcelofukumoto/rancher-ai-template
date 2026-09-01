<script>
import TemplateCode from './TemplateCode.vue';
import HomeConfigChat from './HomeConfigChat.vue';
import { homeTemplateSource, savedHomeTemplates, saveHomeTemplate, fetchTemplatingConfigMaps } from '../templating/template-engine';

// The classic single-template content editor, extracted from the old Home page so it can be opened
// for ANY home template (e.g. from a dashboard panel's ✎). Split view: SFC source + AI chat on the
// left, live preview on the right. Has its OWN Save (writes the template ConfigMap immediately) — this
// edits a template's CONTENT, which is separate from the dashboard's draft-until-save LAYOUT.
export default {
  name:       'HomeTemplateEditor',
  components: { TemplateCode, HomeConfigChat },

  props: {
    name: {
      type:     String,
      required: true,
    },
  },

  emits: ['close', 'saved'],

  data() {
    return {
      draft:          '',
      debouncedDraft: '',
      savedSource:    '',
      saving:         false,
      saveError:      '',
      status:         '',
      debounceTimer:  null,
      editorWidth:    42,
    };
  },

  computed: {
    displayName() {
      const t = savedHomeTemplates(this.$store.getters).find((c) => c.metadata?.name === this.name);

      return t?.spec?.displayName || this.name;
    },

    dirty() {
      return this.draft !== this.savedSource;
    },
  },

  created() {
    this.savedSource = homeTemplateSource(this.$store.getters, this.name);
    this.draft = this.savedSource;
    this.debouncedDraft = this.draft;
  },

  beforeUnmount() {
    clearTimeout(this.debounceTimer);
  },

  watch: {
    draft(val) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.debouncedDraft = val;
      }, 300);
    },
  },

  methods: {
    async save() {
      this.saving = true;
      this.saveError = '';
      this.status = '';

      try {
        await saveHomeTemplate(this.$store, {
          name: this.name, source: this.draft, displayName: this.displayName
        });
        this.savedSource = this.draft;
        this.status = 'Saved.';
        this.$emit('saved', this.name);
      } catch (e) {
        this.saveError = e?.message || String(e);
      } finally {
        this.saving = false;
      }
    },

    // The AI wrote the template ConfigMap — pull the new source back into the editor + preview.
    async onAgentApplied() {
      await fetchTemplatingConfigMaps(this.$store);
      const src = homeTemplateSource(this.$store.getters, this.name);

      if (src) {
        this.draft = src;
        this.debouncedDraft = src;
        this.savedSource = src;
        this.$emit('saved', this.name);
      }
    },

    // Drag the divider to resize the editor column (window-level listeners so the drag never sticks).
    startResize(e) {
      e.preventDefault();
      const container = this.$refs.split;

      if (!container) {
        return;
      }

      const startX = e.clientX;
      const startWidth = this.editorWidth;
      const totalWidth = container.getBoundingClientRect().width || 1;

      const onMove = (ev) => {
        const deltaPct = ((ev.clientX - startX) / totalWidth) * 100;

        this.editorWidth = Math.max(20, Math.min(75, startWidth + deltaPct));
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        window.removeEventListener('blur', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      window.addEventListener('blur', onUp);
    },
  },
};
</script>

<template>
  <div class="tpl-editor">
    <div class="tpl-editor__bar">
      <button
        class="btn btn-sm role-secondary"
        @click="$emit('close')"
      >
        <i class="icon icon-chevron-left" /> Back
      </button>
      <span class="tpl-editor__title">
        Editing template <b>{{ displayName }}</b>
      </span>
      <button
        class="btn btn-sm role-primary"
        :disabled="saving || !dirty"
        @click="save"
      >
        {{ saving ? 'Saving…' : 'Save' }}
      </button>
      <span
        v-if="dirty && !saving"
        class="tpl-editor__dirty"
      >• Unsaved</span>
      <span
        v-if="status && !dirty"
        class="text-success ml-10"
      >{{ status }}</span>
      <span
        v-if="saveError"
        class="text-error ml-10"
      >{{ saveError }}</span>
    </div>

    <div
      ref="split"
      class="tpl-editor__split"
    >
      <div
        class="tpl-editor__pane"
        :style="{ width: editorWidth + '%' }"
      >
        <textarea
          v-model="draft"
          class="tpl-editor__code"
          spellcheck="false"
        />
        <div class="tpl-editor__chat">
          <HomeConfigChat
            :config-map-name="name"
            @applied="onAgentApplied"
          />
        </div>
      </div>
      <div
        class="tpl-editor__resizer"
        title="Drag to resize"
        @pointerdown="startResize"
      />
      <div class="tpl-editor__preview">
        <TemplateCode
          v-if="debouncedDraft"
          :key="debouncedDraft.length"
          :source="debouncedDraft"
        />
        <div
          v-else
          class="text-muted p-20"
        >
          Nothing to preview.
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.tpl-editor {
  display:        flex;
  flex-direction: column;
  height:         calc(100vh - var(--header-height, 54px));
  overflow:       hidden;

  &__bar {
    align-items:   center;
    background:    var(--header-bg, var(--box-bg));
    border-bottom: 1px solid var(--border);
    display:       flex;
    gap:           8px;
    padding:       8px 16px;
    flex:          0 0 auto;
  }

  &__title {
    color: var(--muted);
  }

  &__dirty {
    color:     var(--warning);
    font-size: 12px;
  }

  &__split {
    display:    flex;
    flex:       1 1 auto;
    min-height: 0;
    padding:    12px;
    overflow:   hidden;
  }

  &__pane {
    display:        flex;
    flex-direction: column;
    flex:           0 0 auto;
    min-width:      280px;
    border:         1px solid var(--border);
    border-radius:  var(--border-radius);
    overflow:       hidden;
  }

  &__resizer {
    flex:          0 0 8px;
    margin:        0 2px;
    cursor:        col-resize;
    border-radius: 4px;
    background:    var(--border);
    user-select:   none;
    touch-action:  none;

    &:hover {
      background: var(--primary);
    }
  }

  &__code {
    flex:        1 1 auto;
    min-height:  180px;
    border:      none;
    padding:     10px;
    font-family: monospace;
    font-size:   12px;
    resize:      none;
    background:  var(--body-bg);
    color:       var(--body-text);
  }

  &__chat {
    height:     45%;
    min-height: 220px;
    border-top: 1px solid var(--border);
    overflow:   hidden;
  }

  &__preview {
    flex:          1 1 auto;
    min-width:     0;
    border:        1px solid var(--border);
    border-radius: var(--border-radius);
    overflow:      auto;
  }
}
</style>
