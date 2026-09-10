<script>
import TemplatePanel from './TemplatePanel.vue';
import HomeConfigChat from './HomeConfigChat.vue';
import {
  templateByName, savedHomeTemplates, saveHomeTemplate, saveTemplateJson, fetchTemplatingConfigMaps
} from '../templating/template-engine';

// Blank starters for a NEW template (escaped closing tags so this SFC still parses).
const STARTER_CODE = `<script>
export default {};
<\/script>
<template>
  <div style="padding: 24px">
    <h1>New template</h1>
  </div>
<\/template>`;
const STARTER_JSON = JSON.stringify([{ type: 'banner', title: 'New block' }], null, 2);

// The single-template content editor, opened for any home template (e.g. from a dashboard panel's ✎).
// Handles BOTH template kinds:
//   - code → edit the .vue SFC source, with the AI chat, live preview.
//   - json → edit the declarative widget JSON, live preview (the "configurable JSON" path).
// Split view: source/JSON on the left, live preview on the right. Has its OWN Save (writes the
// template ConfigMap immediately) — separate from the dashboard's draft-until-save LAYOUT.
export default {
  name:       'HomeTemplateEditor',
  components: { TemplatePanel, HomeConfigChat },

  props: {
    name: {
      type:     String,
      required: true,
    },
    // When set ('code' | 'json'), this is a BRAND NEW template of that kind — start blank, and it is
    // only created in the cluster when the user clicks Save.
    newKind: {
      type:    String,
      default: null,
    },
    newDisplayName: {
      type:    String,
      default: '',
    },
  },

  emits: ['close', 'saved'],

  data() {
    return {
      kind:           'code',
      isNew:          false,
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
      if (this.isNew) {
        return this.newDisplayName || this.name;
      }
      const t = savedHomeTemplates(this.$store.getters).find((c) => c.metadata?.name === this.name);

      return t?.spec?.displayName || this.name;
    },

    isJson() {
      return this.kind === 'json';
    },

    // A never-saved new template is always "dirty" so Save is enabled to create it.
    dirty() {
      return this.isNew || this.draft !== this.savedSource;
    },

    // Parsed widgets for the JSON preview (empty while the JSON is invalid).
    parsedWidgets() {
      if (!this.isJson) {
        return [];
      }
      try {
        const v = JSON.parse(this.debouncedDraft || '[]');

        return Array.isArray(v) ? v : (v.widgets || []);
      } catch (e) {
        return [];
      }
    },

    // Live JSON validity of the current draft (not debounced) for the error hint.
    jsonError() {
      if (!this.isJson || !this.draft.trim()) {
        return '';
      }
      try {
        JSON.parse(this.draft);

        return '';
      } catch (e) {
        return e?.message || 'Invalid JSON';
      }
    },
  },

  created() {
    if (this.newKind) {
      // Brand new template — start blank; nothing is written until Save.
      this.isNew = true;
      this.kind = this.newKind === 'json' ? 'json' : 'code';
      this.savedSource = this.isJson ? STARTER_JSON : STARTER_CODE;
    } else {
      const resolved = templateByName(this.$store.getters, this.name);

      this.kind = resolved.kind === 'json' ? 'json' : 'code';
      this.savedSource = this.isJson ? JSON.stringify(resolved.widgets || [], null, 2) : resolved.source;
    }

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
        if (this.isJson) {
          const parsed = JSON.parse(this.draft || '[]');
          const widgets = Array.isArray(parsed) ? parsed : (parsed.widgets || []);

          await saveTemplateJson(this.$store, {
            name: this.name, widgets, displayName: this.displayName
          });
        } else {
          await saveHomeTemplate(this.$store, {
            name: this.name, source: this.draft, displayName: this.displayName
          });
        }
        this.savedSource = this.draft;
        this.isNew = false;
        this.status = 'Saved.';
        // Refresh so a newly-created template appears in the Add-template picker / lists.
        await fetchTemplatingConfigMaps(this.$store).catch(() => {});
        this.$emit('saved', this.name);
      } catch (e) {
        this.saveError = e?.message || String(e);
      } finally {
        this.saving = false;
      }
    },

    // The AI agent wrote the template ConfigMap — pull the new content back into the editor (kind-aware).
    async onAgentApplied() {
      await fetchTemplatingConfigMaps(this.$store);
      const resolved = templateByName(this.$store.getters, this.name);
      const next = this.isJson ? JSON.stringify(resolved.widgets || [], null, 2) : resolved.source;

      if (next) {
        this.draft = next;
        this.debouncedDraft = next;
        this.savedSource = next;
        this.isNew = false;
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
        {{ isNew ? 'New' : 'Editing' }} {{ isJson ? 'JSON template' : 'template' }} <b>{{ displayName }}</b>
      </span>
      <button
        class="btn btn-sm role-primary"
        :disabled="saving || !dirty || !!jsonError"
        @click="save"
      >
        {{ saving ? 'Saving…' : 'Save' }}
      </button>
      <span
        v-if="jsonError"
        class="text-error ml-10"
      >Invalid JSON: {{ jsonError }}</span>
      <span
        v-else-if="dirty && !saving"
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
          :placeholder="isJson ? '[ { \&quot;type\&quot;: \&quot;banner\&quot;, \&quot;title\&quot;: \&quot;Welcome\&quot; } ]' : ''"
        />
        <!-- AI chat: the Home Editor (code SFC) or the Home JSON Builder (declarative widgets). -->
        <div class="tpl-editor__chat">
          <HomeConfigChat
            v-if="isJson"
            :config-map-name="name"
            agent="template-home-json-builder"
            persona-label="Home JSON Builder"
            @applied="onAgentApplied"
          />
          <HomeConfigChat
            v-else
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
        <TemplatePanel
          v-if="isJson"
          :key="debouncedDraft.length"
          :widgets="parsedWidgets"
        />
        <TemplatePanel
          v-else-if="debouncedDraft"
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
    padding:       12px;
  }
}
</style>
