<script>
import StockHome from '@shell/pages/home.vue';
import TemplateCode from '../components/TemplateCode.vue';
import HomeConfigChat from '../components/HomeConfigChat.vue';
import {
  isTemplatingEnabled, appliedHomeScopes, homeTemplateSource, savedHomeTemplates,
  saveHomeTemplate, applyHome, clearHome, fetchTemplatingConfigMaps
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

  // The applied Home (global + per-user) and the rendered `source` are COMPUTED off the store, so they
  // stay correct as ConfigMaps load/change — applying, removing or editing a template re-resolves them
  // reactively (no reload, no stale one-shot state). created() just primes the store and resolves the
  // current user id.
  async created() {
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        await fetchTemplatingConfigMaps(this.$store);

        const user = await this.$store.dispatch('auth/getUser').catch(() => null);

        this.userId = user?.id || this.$store.getters['auth/user']?.id || null;

        if (this.templates.length || attempt >= 4) {
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

    // The applied Home template names split by scope + the one THIS user actually sees (user || global).
    appliedScopes() {
      return appliedHomeScopes(this.$store.getters, this.userId);
    },

    appliedGlobalName() {
      return this.appliedScopes.global;
    },

    appliedUserName() {
      return this.appliedScopes.user;
    },

    appliedName() {
      return this.appliedScopes.resolved;
    },

    appliedGlobalDisplay() {
      return this.displayNameOf(this.appliedGlobalName);
    },

    appliedUserDisplay() {
      return this.displayNameOf(this.appliedUserName);
    },

    // Source rendered when the editor is closed: the applied Home template's SFC (empty when templating
    // is off or nothing is applied, so the normal render falls back to stock Rancher). TemplateCode
    // watches this and recompiles, so apply/remove/edit all reflect live.
    source() {
      return (this.templatingEnabled && this.appliedName) ? homeTemplateSource(this.$store.getters, this.appliedName) : '';
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
      return savedHomeTemplates(this.$store.getters).find((h) => h.metadata?.name === name);
    },

    // Friendly display name for a saved template's internal name (falls back to the name itself).
    displayNameOf(name) {
      if (!name) {
        return null;
      }

      return this.templates.find((t) => t.name === name)?.displayName || name;
    },

    // How a template is applied, for the picker: your personal Home, the global default, or both.
    appliedLabel(name) {
      const tags = [];

      if (name && name === this.appliedUserName) {
        tags.push('your Home');
      }
      if (name && name === this.appliedGlobalName) {
        tags.push('applied globally');
      }

      return tags.length ? ` (${ tags.join(', ') })` : '';
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

    // The AI wrote the selected Home template ConfigMap — pull the new source into the editor. The
    // normal-render `source` is computed off the store, so if the edited template is the applied one
    // it updates on its own.
    async onAgentApplied() {
      await fetchTemplatingConfigMaps(this.$store);
      const src = this.savedCR(this.selectedName)?.spec?.source;

      if (src) {
        this.draft = src;
        this.debouncedDraft = src;
      }
    },

    // Drag the divider to resize the editor column (clamped 20–75%). Listeners live on WINDOW, not
    // the handle: window always receives pointerup no matter where the cursor is when released (over
    // the re-rendering preview, off-screen, ...), so the drag can't get "stuck" and leak a move
    // listener that resizes on every later mouse move. (setPointerCapture is deliberately NOT used —
    // capture can be lost when the editor re-renders mid-drag, which is exactly what stuck it before.)
    startResize(e) {
      e.preventDefault();
      const container = this.$refs.split;

      if (!container) {
        return;
      }

      // Anchor the drag to the grab point: track the delta from where the pointer went down, not the
      // pointer's absolute position. The handle sits a few px to the right of the editor's edge, so
      // absolute tracking would snap (jump) the pane to the cursor on the first move.
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

        await saveHomeTemplate(this.$store, {
          name: this.selectedName, source: this.draft, displayName: cr?.spec?.displayName
        });

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
        await applyHome(this.$store, scope, this.selectedName, this.userId);
        // Force-refresh the config ConfigMap so the applied/source computeds re-resolve — closing the
        // editor then shows the just-applied template (and marks it) live, no reload needed.
        await fetchTemplatingConfigMaps(this.$store);

        this.applyStatus = scope === 'user' ? 'Applied to your user.' : 'Applied globally.';
      } catch (e) {
        this.saveError = e?.message || String(e);
      } finally {
        this.saving = false;
      }
    },

    // Unset the applied Home for a scope. Removing the global default (with no personal pick) reverts
    // everyone to stock Rancher; removing your personal Home falls back to the global default — both
    // live (computeds re-resolve off the refreshed store), with no reload.
    async removeApply(scope) {
      const current = scope === 'user' ? this.appliedUserName : this.appliedGlobalName;

      if (!current || (scope === 'user' && !this.userId)) {
        return;
      }

      this.saving = true;
      this.saveError = '';
      this.applyStatus = '';

      try {
        await clearHome(this.$store, scope, this.userId);
        await fetchTemplatingConfigMaps(this.$store);

        this.applyStatus = scope === 'user' ? 'Removed your personal Home.' : 'Removed the global Home.';
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
        await saveHomeTemplate(this.$store, {
          name: slug, source: STARTER_SFC, displayName: label
        });
        await fetchTemplatingConfigMaps(this.$store);
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
            {{ t.displayName }}{{ appliedLabel(t.name) }}
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
        <div class="ai-home__applies">
          <div class="ai-home__apply-row">
            <span class="ai-home__scope">Global</span>
            <span
              class="ai-home__applied-name"
              :class="{ 'ai-home__applied-name--empty': !appliedGlobalName }"
              :title="appliedGlobalName ? 'The Home everyone sees by default' : 'No global Home — everyone sees stock Rancher'"
            >{{ appliedGlobalDisplay || 'none' }}</span>
            <button
              class="btn btn-sm role-secondary"
              :disabled="saving || !selectedName"
              title="Make the selected (Editing) template the Home everyone sees by default"
              @click="applyTo('global')"
            >
              Apply selected
            </button>
            <button
              v-if="appliedGlobalName"
              class="btn btn-sm role-link"
              :disabled="saving"
              title="Remove the global Home (revert everyone to stock Rancher)"
              @click="removeApply('global')"
            >
              Remove
            </button>
          </div>
          <div class="ai-home__apply-row">
            <span class="ai-home__scope">Your Home</span>
            <span
              class="ai-home__applied-name"
              :class="{ 'ai-home__applied-name--empty': !appliedUserName }"
              :title="appliedUserName ? 'Your personal Home (overrides the global default)' : 'No personal Home — you see the global default'"
            >{{ appliedUserDisplay || 'none' }}</span>
            <button
              class="btn btn-sm role-secondary"
              :disabled="saving || !userId || !selectedName"
              title="Make the selected (Editing) template your personal Home page"
              @click="applyTo('user')"
            >
              Apply selected
            </button>
            <button
              v-if="appliedUserName"
              class="btn btn-sm role-link"
              :disabled="saving"
              title="Remove your personal Home (fall back to the global default)"
              @click="removeApply('user')"
            >
              Remove
            </button>
          </div>
        </div>
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
          <HomeConfigChat
            :config-map-name="selectedName"
            @applied="onAgentApplied"
          />
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

    <!-- Normal render. Gate on templatingEnabled so the kill switch (⌘/Ctrl+Shift+.) swaps between
         the templated Home and stock Rancher LIVE, without a reload. -->
    <template v-else>
      <TemplateCode
        v-if="templatingEnabled && source"
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

  &__applies {
    display:        flex;
    flex-direction: column;
    gap:            4px;
  }

  &__apply-row {
    display:     flex;
    align-items: center;
    gap:         6px;
  }

  &__scope {
    min-width:      68px;
    color:          var(--muted);
    font-size:      11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  &__applied-name {
    min-width:     120px;
    padding:       2px 8px;
    border:        1px solid var(--border);
    border-radius: var(--border-radius);
    background:    var(--body-bg);
    font-weight:   600;
    font-size:     12px;

    &--empty {
      color:       var(--muted);
      font-weight: 400;
      font-style:  italic;
    }
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
