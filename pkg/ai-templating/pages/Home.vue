<script>
import StockHome from '@shell/pages/home.vue';
import DashboardGrid from '../components/DashboardGrid.vue';
import HomeTemplateEditor from '../components/HomeTemplateEditor.vue';
import {
  isTemplatingEnabled, appliedDashboardScopes, saveDashboard, savedHomeTemplates,
  emptyDashboard, newTab, fetchTemplatingConfigMaps
} from '../templating/template-engine';
import { DEFAULT_PANEL, firstFreeSlot } from '../templating/dashboard-layout';

// The extension's Home page. The applied Home is a DASHBOARD — one or more tabs, each a grid of
// template panels. Outside edit mode it renders SEAMLESSLY (no titles/frames) so several templates
// read as one page, with a compact tab switcher only when there is more than one tab. "Edit Home"
// opens a layout editor: add/remove/change/drag/resize panels, manage tabs, per scope (Global or
// Your Home). Everything is stored as ConfigMaps, so it works with or without the AI. Reset restores
// the layout as it was when editing began.
export default {
  name:       'AiTemplatingHome',
  components: {
    StockHome, DashboardGrid, HomeTemplateEditor
  },

  data() {
    return {
      userId:          null,
      loaded:          false,
      editing:         false,
      scope:           'global', // which scope the editor is writing to
      working:         null, // working-copy dashboard while editing (a DRAFT — not published)
      snapshot:        null, // JSON of the dashboard when editing began (for Reset)
      savedBaseline:   null, // JSON of the last PUBLISHED state (for the dirty check)
      activeTabId:     null,
      editingTemplate: null, // template name whose CONTENT is open in the split editor
      saving:          false,
      status:          '',
      error:           '',
    };
  },

  async created() {
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        await fetchTemplatingConfigMaps(this.$store);

        const user = await this.$store.dispatch('auth/getUser').catch(() => null);

        this.userId = user?.id || this.$store.getters['auth/user']?.id || null;

        if (this.appliedDashboard || savedHomeTemplates(this.$store.getters).length || attempt >= 4) {
          break;
        }
      } catch (e) { /* retry */ }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    this.syncActiveTab();
    this.loaded = true;
  },

  computed: {
    templatingEnabled() {
      return isTemplatingEnabled(this.$store.getters);
    },

    scopes() {
      return appliedDashboardScopes(this.$store.getters, this.userId);
    },

    // What the user sees when NOT editing (their personal Home overrides the global default).
    appliedDashboard() {
      return this.templatingEnabled ? this.scopes.resolved : null;
    },

    // The dashboard currently on screen — the live working copy while editing, else the applied one.
    dashboard() {
      return this.editing ? this.working : this.appliedDashboard;
    },

    tabs() {
      return this.dashboard?.tabs || [];
    },

    activeTab() {
      return this.tabs.find((t) => t.id === this.activeTabId) || this.tabs[0] || null;
    },

    panels() {
      return this.activeTab?.panels || [];
    },

    showTabs() {
      return this.editing || this.tabs.length > 1;
    },

    // True when the working draft differs from the last-published state for this scope.
    dirty() {
      return this.editing && this.savedBaseline !== null && JSON.stringify(this.working) !== this.savedBaseline;
    },

    templateOptions() {
      return savedHomeTemplates(this.$store.getters).map((cr) => ({
        name:        cr.metadata?.name,
        displayName: cr.spec?.displayName || cr.metadata?.name,
      }));
    },
  },

  watch: {
    // If the applied dashboard changes underneath us (or on first load), keep a valid active tab.
    appliedDashboard() {
      if (!this.editing) {
        this.syncActiveTab();
      }
    },
  },

  methods: {
    clone(obj) {
      return JSON.parse(JSON.stringify(obj));
    },

    syncActiveTab() {
      const tabs = this.tabs;

      if (!tabs.find((t) => t.id === this.activeTabId)) {
        this.activeTabId = tabs[0]?.id || null;
      }
    },

    // ---- edit lifecycle ----
    toggleEditor() {
      if (this.editing) {
        this.exitEdit();
      } else {
        this.enterEdit();
      }
    },

    enterEdit() {
      this.status = '';
      this.error = '';
      this.scope = 'global';
      this.editingTemplate = null;
      this.seedWorking();
      this.editing = true;
    },

    // Exit edit mode. Layout edits are a DRAFT — nothing was published — so leaving with unsaved
    // changes discards them (after a confirm). Anything you clicked Save on is already live.
    async exitEdit() {
      if (this.dirty && !window.confirm('You have unsaved changes to this Home layout. Discard them?')) {
        return;
      }
      this.editing = false;
      this.working = null;
      this.snapshot = null;
      this.savedBaseline = null;
      this.editingTemplate = null;
      // Re-read the published state so the non-edit render is correct.
      await fetchTemplatingConfigMaps(this.$store).catch(() => {});
      this.syncActiveTab();
    },

    // Load the chosen scope's published dashboard into the working DRAFT (or an empty one).
    // `snapshot` = Reset target (edit start); `savedBaseline` = last-published state (dirty check).
    seedWorking() {
      const existing = this.scope === 'user' ? this.scopes.user : this.scopes.global;
      const dash = existing ? this.clone(existing) : emptyDashboard();
      const json = JSON.stringify(dash);

      this.working = dash;
      this.snapshot = json;
      this.savedBaseline = json;
      this.activeTabId = dash.tabs[0]?.id || null;
    },

    setScope(scope) {
      if (scope === this.scope) {
        return;
      }
      if (this.dirty && !window.confirm('Discard unsaved changes to switch scope?')) {
        return;
      }
      this.scope = scope;
      this.status = '';
      this.error = '';
      this.seedWorking();
    },

    // Publish the working draft to the current scope. Global → everyone; Your Home → just you.
    async save() {
      this.saving = true;
      this.error = '';
      this.status = '';

      try {
        await saveDashboard(this.$store, this.scope, this.working, this.userId);
        this.savedBaseline = JSON.stringify(this.working);
        await fetchTemplatingConfigMaps(this.$store).catch(() => {});
        this.status = this.scope === 'user' ? 'Saved to your Home.' : 'Saved — live for everyone.';
      } catch (e) {
        this.error = e?.message || String(e);
      } finally {
        this.saving = false;
      }
    },

    // ---- panel mutations (draft only — mutate the working copy, publish on Save) ----
    onGridUpdate(panels) {
      const tab = this.working.tabs.find((t) => t.id === this.activeTabId);

      if (tab) {
        tab.panels = panels;
      }
    },

    addPanel(templateName) {
      if (!templateName) {
        return;
      }

      const tab = this.working.tabs.find((t) => t.id === this.activeTabId);

      if (!tab) {
        return;
      }

      const slot = firstFreeSlot(tab.panels, DEFAULT_PANEL.w, DEFAULT_PANEL.h);

      tab.panels = [...tab.panels, {
        id: `panel-${ Date.now().toString(36) }`, template: templateName, ...slot, w: DEFAULT_PANEL.w, h: DEFAULT_PANEL.h
      }];
    },

    // ---- tab management ----
    selectTab(id) {
      this.activeTabId = id;
    },

    addTab() {
      const tab = newTab(`Tab ${ this.working.tabs.length + 1 }`);

      this.working.tabs.push(tab);
      this.activeTabId = tab.id;
    },

    renameTab(tab) {
      const name = (window.prompt('Tab name:', tab.name) || '').trim();

      if (name) {
        tab.name = name;
      }
    },

    removeTab(id) {
      if (this.working.tabs.length <= 1) {
        return;
      }
      this.working.tabs = this.working.tabs.filter((t) => t.id !== id);
      if (this.activeTabId === id) {
        this.activeTabId = this.working.tabs[0]?.id || null;
      }
    },

    // ---- per-panel template CONTENT editor ----
    openTemplateEditor(name) {
      this.editingTemplate = name;
    },

    closeTemplateEditor() {
      this.editingTemplate = null;
    },

    // ---- reset / clear ----
    reset() {
      if (!this.snapshot) {
        return;
      }
      this.working = JSON.parse(this.snapshot);
      this.syncActiveTab();
      this.activeTabId = this.working.tabs[0]?.id || this.activeTabId;
      this.status = 'Reverted to how it was when you started editing.';
    },

    async clearScope() {
      if (!window.confirm(`Remove the ${ this.scope === 'user' ? 'personal' : 'global' } Home dashboard?`)) {
        return;
      }
      this.saving = true;

      try {
        await saveDashboard(this.$store, this.scope, null, this.userId);
        await fetchTemplatingConfigMaps(this.$store);
        this.status = 'Removed.';
        this.seedWorking();
      } catch (e) {
        this.error = e?.message || String(e);
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
    :class="{ 'ai-home--editing': editing || editingTemplate }"
  >
    <!-- A panel's ✎ opens the classic single-template content editor (source + AI chat + preview). -->
    <HomeTemplateEditor
      v-if="editingTemplate"
      :name="editingTemplate"
      @close="closeTemplateEditor"
    />

    <template v-else>
      <!-- Compact bar: edit toggle + tabs (+ edit-only controls). Kept small so it doesn't crowd the page. -->
      <div
        v-if="loaded && templatingEnabled"
        class="ai-home__bar"
      >
        <button
          class="btn btn-sm role-secondary"
          @click="toggleEditor"
        >
          {{ editing ? 'Done' : 'Edit Home' }}
        </button>

        <!-- Tabs: compact switcher (and manager while editing) -->
        <div
          v-if="showTabs"
          class="ai-home__tabs"
        >
          <button
            v-for="t in tabs"
            :key="t.id"
            class="ai-home__tab"
            :class="{ 'ai-home__tab--active': t.id === activeTabId }"
            @click="selectTab(t.id)"
            @dblclick="editing && renameTab(t)"
          >
            {{ t.name }}
            <i
              v-if="editing && tabs.length > 1"
              class="icon icon-close ai-home__tab-x"
              @click.stop="removeTab(t.id)"
            />
          </button>
          <button
            v-if="editing"
            class="ai-home__tab ai-home__tab--add"
            title="Add tab"
            @click="addTab"
          >
            <i class="icon icon-plus" />
          </button>
        </div>

        <template v-if="editing">
          <span class="ai-home__sep" />
          <label class="ai-home__lbl">Editing</label>
          <div class="ai-home__scope">
            <button
              class="btn btn-sm"
              :class="scope === 'global' ? 'role-primary' : 'role-secondary'"
              @click="setScope('global')"
            >
              Global
            </button>
            <button
              class="btn btn-sm"
              :class="scope === 'user' ? 'role-primary' : 'role-secondary'"
              :disabled="!userId"
              @click="setScope('user')"
            >
              Your Home
            </button>
          </div>

          <select
            class="ai-home__add"
            :disabled="!templateOptions.length"
            @change="addPanel($event.target.value); $event.target.value = ''"
          >
            <option value="">
              ＋ Add template…
            </option>
            <option
              v-for="t in templateOptions"
              :key="t.name"
              :value="t.name"
            >
              {{ t.displayName }}
            </option>
          </select>

          <span class="ai-home__sep" />
          <button
            class="btn btn-sm role-primary"
            :disabled="saving || !dirty"
            title="Publish this layout to the selected scope"
            @click="save"
          >
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
          <button
            class="btn btn-sm role-secondary"
            :disabled="saving || !dirty"
            title="Restore the layout as it was when you started editing"
            @click="reset"
          >
            Reset
          </button>
          <button
            class="btn btn-sm role-link"
            :disabled="saving"
            title="Remove this scope's Home dashboard"
            @click="clearScope"
          >
            Remove
          </button>
          <span
            v-if="dirty"
            class="ai-home__dirty"
          >• Unsaved</span>

          <span
            v-if="status"
            class="text-success ml-10"
          >{{ status }}</span>
          <span
            v-if="error"
            class="text-error ml-10"
          >{{ error }}</span>
        </template>
      </div>

      <!-- Applied dashboard (or edit surface). Gate on templatingEnabled so the kill switch swaps to
         stock Rancher live. StockHome shows when nothing is applied. -->
      <div
        v-if="loaded && templatingEnabled && dashboard && (editing || panels.length)"
        class="ai-home__surface"
      >
        <DashboardGrid
          :panels="panels"
          :editing="editing"
          @update="onGridUpdate"
          @edit="openTemplateEditor"
        />
      </div>
      <StockHome v-else-if="loaded" />
    </template>
  </div>
</template>

<style lang="scss" scoped>
.ai-home {
  &--editing {
    min-height: calc(100vh - var(--header-height, 54px));
  }

  &__bar {
    align-items:   center;
    background:    var(--header-bg, var(--box-bg));
    border-bottom: 1px solid var(--border);
    display:       flex;
    flex-wrap:     wrap;
    gap:           8px;
    padding:       6px 16px;
  }

  &__tabs {
    display: flex;
    gap:     2px;
  }

  &__tab {
    align-items:   center;
    background:    transparent;
    border:        1px solid transparent;
    border-radius: var(--border-radius);
    color:         var(--body-text);
    cursor:        pointer;
    display:       flex;
    font-size:     13px;
    gap:           4px;
    padding:       3px 10px;

    &:hover {
      color: var(--link);
    }

    &--active {
      background:    var(--body-bg);
      border-color: var(--border);
      font-weight:  600;
    }

    &--add {
      padding: 3px 8px;
    }
  }

  &__tab-x {
    font-size: 10px;
    opacity:   0.6;

    &:hover {
      color:   var(--error);
      opacity: 1;
    }
  }

  &__sep {
    width:      1px;
    height:     20px;
    background: var(--border);
    margin:     0 2px;
  }

  &__dirty {
    color:       var(--warning);
    font-size:   12px;
    font-weight: 600;
  }

  &__lbl {
    color:  var(--muted);
    margin: 0;
  }

  &__scope {
    display: flex;
    gap:     2px;
  }

  &__add {
    height:        28px;
    border:        1px solid var(--border);
    border-radius: var(--border-radius);
    background:    var(--body-bg);
    color:         var(--body-text);
    padding:       0 8px;
  }

  &__surface {
    padding: 12px 16px;
  }
}
</style>
