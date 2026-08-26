<script>
import StockHome from '@shell/pages/home.vue';
import TemplateCode from '../components/TemplateCode.vue';
import HomeConfigChat from '../components/HomeConfigChat.vue';
import {
  HOME_TEMPLATE, TEMPLATING_CONFIG, TEMPLATE_NAMESPACE, CONFIG_NAME, CONFIG_NAMESPACE, CONFIG_ID,
  isTemplatingEnabled, appliedHomeTemplateName, homeTemplateSource, savedHomeTemplates
} from '../templating/template-engine';

const STARTER_SFC = `<script>
export default {};
<\/script>
<template>
  <div style="padding: 40px">
    <h1>New Home template</h1>
  </div>
<\/template>`;

// The extension's Home page. Renders the APPLIED HomeTemplate CR, plus an in-page editor with the
// full SAVED/APPLIED workflow (ported from templating-for-ai):
//   - pick which SAVED template to edit (many HomeTemplate CRs)
//   - New / Save (persist to the SELECTED template)
//   - Apply to Global / Apply to My User (repoint TemplatingConfig.spec.home.{global,users})
// Editing previews the SELECTED draft live; closing returns to the applied render.
export default {
  name:       'AiTemplatingHome',
  components: {
    StockHome, TemplateCode, HomeConfigChat
  },

  data() {
    return {
      source:         '',
      appliedName:    null,
      userId:         null,
      loaded:         false,
      showEditor:     false,
      selectedName:   '',
      draft:          '',
      debouncedDraft: '',
      saving:         false,
      saveError:      '',
      applyStatus:    '',
      debounceTimer:  null,
      editorWidth:    42,
    };
  },

  async created() {
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        await this.$store.dispatch('management/findAll', { type: TEMPLATING_CONFIG });
        const hts = await this.$store.dispatch('management/findAll', { type: HOME_TEMPLATE });
        const user = await this.$store.dispatch('auth/getUser').catch(() => null);

        this.userId = user?.id || this.$store.getters['auth/user']?.id || null;
        this.appliedName = appliedHomeTemplateName(this.$store.getters, this.userId);

        const src = isTemplatingEnabled(this.$store.getters) ? homeTemplateSource(this.$store.getters, this.appliedName) : '';

        if (src || (hts && hts.length) || attempt >= 4) {
          this.source = src;
          break;
        }
      } catch (e) { /* retry */ }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    this.loaded = true;
  },

  beforeUnmount() {
    clearTimeout(this.debounceTimer);
  },

  computed: {
    templatingEnabled() {
      return isTemplatingEnabled(this.$store.getters);
    },

    templates() {
      return savedHomeTemplates(this.$store.getters).map((cr) => ({
        name:        cr.metadata?.name,
        displayName: cr.spec?.displayName || cr.metadata?.name,
      }));
    },

    previewSource() {
      return this.showEditor ? this.debouncedDraft : this.source;
    },
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
    savedCR(name) {
      return this.$store.getters['management/byId'](HOME_TEMPLATE, `${ TEMPLATE_NAMESPACE }/${ name }`) ||
        savedHomeTemplates(this.$store.getters).find((h) => h.metadata?.name === name);
    },

    toggleEditor() {
      this.showEditor = !this.showEditor;

      if (this.showEditor) {
        this.saveError = '';
        this.applyStatus = '';
        this.selectSaved(this.appliedName || this.templates[0]?.name || '');
      }
    },

    selectSaved(name) {
      this.selectedName = name;
      this.draft = (name && this.savedCR(name)?.spec?.source) || '';
      this.debouncedDraft = this.draft;
    },

    // Drag the divider to resize the editor column (clamped 20–75%). Uses pointer capture on the
    // handle so move/up keep firing even while the cursor is over the live preview, and always
    // release. Without capture a missed mouseup — e.g. the preview re-rendering or a link inside it
    // navigating mid-drag — would leave a global listener that resizes the editor on every later
    // mouse move (the "it keeps resizing when I navigate" bug).
    startResize(e) {
      e.preventDefault();
      const container = this.$refs.split;
      const handle = e.currentTarget;

      try {
        handle.setPointerCapture(e.pointerId);
      } catch (err) { /* unsupported — listeners below still clean up on pointerup */ }

      const onMove = (ev) => {
        const rect = container.getBoundingClientRect();
        const pct = ((ev.clientX - rect.left) / rect.width) * 100;

        this.editorWidth = Math.max(20, Math.min(75, pct));
      };
      const onUp = (ev) => {
        try {
          handle.releasePointerCapture(ev.pointerId);
        } catch (err) { /* ignore */ }
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
      };

      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    },

    // Persist the draft to the SELECTED saved template. Does NOT change what is applied.
    async saveHome() {
      if (!this.selectedName) {
        return;
      }

      this.saving = true;
      this.saveError = '';
      this.applyStatus = '';

      try {
        const cr = this.savedCR(this.selectedName);

        if (cr) {
          cr.spec = { ...(cr.spec || {}), source: this.draft };
          await cr.save();
        }

        if (this.selectedName === this.appliedName) {
          this.source = this.draft;
        }

        this.applyStatus = 'Saved.';
      } catch (e) {
        this.saveError = e?.message || String(e);
      } finally {
        this.saving = false;
      }
    },

    // Repoint the applied Home (global or per-user) to the selected template.
    async applyTo(scope) {
      const key = scope === 'user' ? this.userId : 'global';

      if (!this.selectedName || (scope === 'user' && !key)) {
        return;
      }

      this.saving = true;
      this.saveError = '';

      try {
        const existing = this.$store.getters['management/byId'](TEMPLATING_CONFIG, CONFIG_ID);
        const home = { ...(existing?.spec?.home || {}) };

        if (scope === 'user') {
          home.users = { ...(home.users || {}), [key]: this.selectedName };
        } else {
          home.global = this.selectedName;
        }

        if (existing) {
          existing.spec = {
            ...(existing.spec || {}), enabled: existing.spec?.enabled !== false, home
          };
          await existing.save();
        } else {
          const cr = await this.$store.dispatch('management/create', {
            type:     TEMPLATING_CONFIG,
            metadata: { name: CONFIG_NAME, namespace: CONFIG_NAMESPACE },
            spec:     { enabled: true, home },
          });

          await cr.save();
        }

        this.appliedName = appliedHomeTemplateName(this.$store.getters, this.userId);
        this.applyStatus = scope === 'user' ? 'Applied to your user.' : 'Applied globally.';
      } catch (e) {
        this.saveError = e?.message || String(e);
      } finally {
        this.saving = false;
      }
    },

    // Create a new SAVED template and switch the editor to it.
    async newTemplate() {
      const label = (window.prompt('Name for the new saved Home template:') || '').trim();

      if (!label) {
        return;
      }

      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'template';

      this.saving = true;
      this.saveError = '';

      try {
        const cr = await this.$store.dispatch('management/create', {
          type:     HOME_TEMPLATE,
          metadata: { name: slug, namespace: TEMPLATE_NAMESPACE },
          spec:     { displayName: label, source: STARTER_SFC },
        });

        await cr.save();
        await this.$store.dispatch('management/findAll', { type: HOME_TEMPLATE, opt: { force: true } });
        this.selectSaved(slug);
        this.applyStatus = `Created "${ label }".`;
      } catch (e) {
        this.saveError = e?.message || String(e);
      } finally {
        this.saving = false;
      }
    },
  },
};
</script>

<template>
  <div
    class="ai-home"
    :class="{ 'ai-home--editing': showEditor }"
  >
    <!-- Edit bar -->
    <div
      v-if="loaded && templatingEnabled"
      class="ai-home__editbar"
    >
      <button
        class="btn btn-sm role-secondary"
        @click="toggleEditor"
      >
        {{ showEditor ? 'Close editor' : 'Edit Home' }}
      </button>

      <template v-if="showEditor">
        <label class="ai-home__label">Editing</label>
        <select
          class="ai-home__select"
          :value="selectedName"
          @change="selectSaved($event.target.value)"
        >
          <option
            v-for="t in templates"
            :key="t.name"
            :value="t.name"
          >
            {{ t.displayName }}{{ t.name === appliedName ? ' (applied)' : '' }}
          </option>
        </select>
        <button
          class="btn btn-sm role-secondary"
          :disabled="saving"
          @click="newTemplate"
        >
          New
        </button>
        <button
          class="btn btn-sm role-primary"
          :disabled="saving"
          @click="saveHome"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <span class="ai-home__sep" />
        <button
          class="btn btn-sm role-secondary"
          :disabled="saving"
          title="Make this template the Home page everyone sees by default"
          @click="applyTo('global')"
        >
          Apply to Global
        </button>
        <button
          class="btn btn-sm role-secondary"
          :disabled="saving || !userId"
          title="Make this template your personal Home page"
          @click="applyTo('user')"
        >
          Apply to My User
        </button>
        <span
          v-if="applyStatus"
          class="text-success ml-10"
        >{{ applyStatus }}</span>
        <span
          v-if="saveError"
          class="text-error ml-10"
        >{{ saveError }}</span>
      </template>
    </div>

    <!-- Editor: draft + chat (left), live preview (right) -->
    <div
      v-if="showEditor"
      ref="split"
      class="ai-home__split"
    >
      <div
        class="ai-home__editor"
        :style="{ width: editorWidth + '%' }"
      >
        <textarea
          v-model="draft"
          class="ai-home__code"
          spellcheck="false"
        />
        <div class="ai-home__chat">
          <HomeConfigChat :config-map-name="selectedName" />
        </div>
      </div>
      <div
        class="ai-home__resizer"
        title="Drag to resize"
        @pointerdown="startResize"
      />
      <div class="ai-home__preview">
        <TemplateCode
          v-if="previewSource"
          :key="debouncedDraft.length"
          :source="previewSource"
        />
        <div
          v-else
          class="text-muted p-20"
        >
          Nothing to preview.
        </div>
      </div>
    </div>

    <!-- Normal render -->
    <template v-else>
      <TemplateCode
        v-if="source"
        :source="source"
      />
      <StockHome v-else-if="loaded" />
    </template>
  </div>
</template>

<style lang="scss" scoped>
.ai-home {
  // While editing, fill the space under the app header and DON'T scroll the page — the editor
  // and preview scroll internally instead. (--header-height falls back to the standard 54px.)
  &--editing {
    display:        flex;
    flex-direction: column;
    height:         calc(100vh - var(--header-height, 54px));
    overflow:       hidden;
  }

  &__editbar {
    display:       flex;
    align-items:   center;
    gap:           8px;
    padding:       8px 16px;
    border-bottom: 1px solid var(--border);
    background:    var(--box-bg);
    flex-wrap:     wrap;
    flex:          0 0 auto;
  }

  &__label {
    margin: 0 0 0 8px;
    color:  var(--muted);
  }

  &__select {
    height:        30px;
    border:        1px solid var(--border);
    border-radius: var(--border-radius);
    background:    var(--body-bg);
    color:         var(--body-text);
    padding:       0 8px;
  }

  &__sep {
    width:      1px;
    height:     22px;
    background: var(--border);
    margin:     0 4px;
  }

  &__split {
    display:    flex;
    gap:        0;
    flex:       1 1 auto;
    min-height: 0;
    padding:    12px;
    overflow:   hidden;
  }

  &__editor {
    display:        flex;
    flex-direction: column;
    // width comes from the inline editorWidth%; don't let a wide preview (a full dashboard render)
    // shrink the editor past it — the preview (min-width:0, overflow:auto) absorbs + scrolls instead.
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
