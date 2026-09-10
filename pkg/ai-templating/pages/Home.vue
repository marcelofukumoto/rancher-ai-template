<script>
import StockHome from '@shell/pages/home.vue';
import OrganizerNode from '../components/OrganizerNode.vue';
import HomeTemplateEditor from '../components/HomeTemplateEditor.vue';
import {
  isTemplatingEnabled, appliedViewScopes, saveView, savedHomeTemplates, fetchTemplatingConfigMaps
} from '../templating/template-engine';
import {
  NODE_TEMPLATE, GRID_COLUMNS, emptyView, newPanel, newOrganizer, newTemplateNode,
  findNode, findParent, addChild, removeNode, moveNode, moveNodeTo, updateNode, setColSpan, tidyRoot,
  pathToNode
} from '../templating/view-model';

// The Home VIEW.
//
//   VIEW      this page. Holds one or more PANELS (they render as TABS when there's more than one).
//   PANEL     one screen, always filled by a ROOT ORGANIZER (100% x 100%).
//   ORGANIZER a full-width row on a 12-column grid. There is only one kind; organizers stack and
//             may nest (a nested one always takes the whole row).
//   TEMPLATE  a leaf rendering one stored template ConfigMap, sized by col-span-1 … col-span-12.
//
// Outside edit mode it renders SEAMLESSLY (no chrome) so the templates read as one page. "Edit Home"
// turns on outlines and drag-and-drop: drag templates between organizers, drag organizers up and
// down, and drag a template's right edge to resize it by columns. The root always keeps one empty
// organizer at the bottom to drop into. Edits are a DRAFT — nothing is published until Save.
export default {
  name:       'AiTemplatingHome',
  components: {
    StockHome, OrganizerNode, HomeTemplateEditor
  },

  // Action callbacks for the recursive OrganizerNode tree (so it never has to re-emit at each
  // level). Arrows keep `this` bound to this component.
  provide() {
    return {
      viewEditor: {
        select:       (id) => this.selectNode(id),
        move:         (id, delta) => this.moveNode(id, delta),
        remove:       (id) => this.removeNode(id),
        editTemplate: (name) => this.openTemplateEditor(name),
        beginDrag:    (id) => {
          this.ui.dragId = id;
        },
        endDrag: () => {
          this.ui.dragId = null;
        },
        dropInto:   (parentId, index) => this.dropInto(parentId, index),
        setColSpan: (id, span) => this.setColSpan(id, span),
        setHover:   (id) => {
          this.ui.hoverId = id;
        },
        // The same reactive object the tree reads for drag/hover state.
        ui: this.ui,
      },
    };
  },

  data() {
    return {
      userId:                 null,
      loaded:                 false,
      editing:                false,
      scope:                  'global', // which scope the editor is writing to
      working:                null, // working-copy VIEW while editing (a DRAFT — not published)
      snapshot:               null, // JSON of the view when editing began (for Reset)
      savedBaseline:          null, // JSON of the last PUBLISHED state (for the dirty check)
      activePanelId:          null,
      selectedNodeId:         null, // node the editor's controls act on
      editingTemplate:        null, // template name whose CONTENT is open in the split editor
      editingTemplateNewKind: null, // 'code' | 'json' when the open editor is a BRAND NEW template
      editingTemplateNewName: '', // display name for a brand new template
      saving:                 false,
      status:                 '',
      error:                  '',
      // Shared, reactive editor UI state: what's being dragged, and the innermost node under the
      // pointer (so exactly one node shows its toolbar).
      ui:                     { dragId: null, hoverId: null },
      gridColumns:            GRID_COLUMNS,
    };
  },

  async created() {
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        await fetchTemplatingConfigMaps(this.$store);

        const user = await this.$store.dispatch('auth/getUser').catch(() => null);

        this.userId = user?.id || this.$store.getters['auth/user']?.id || null;

        if (this.appliedView || savedHomeTemplates(this.$store.getters).length || attempt >= 4) {
          break;
        }
      } catch (e) { /* retry */ }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    this.syncActivePanel();
    this.loaded = true;
  },

  computed: {
    templatingEnabled() {
      return isTemplatingEnabled(this.$store.getters);
    },

    scopes() {
      return appliedViewScopes(this.$store.getters, this.userId);
    },

    // What the user sees when NOT editing (their personal Home overrides the global default).
    appliedView() {
      return this.templatingEnabled ? this.scopes.resolved : null;
    },

    // The view currently on screen — the live working copy while editing, else the applied one.
    view() {
      return this.editing ? this.working : this.appliedView;
    },

    panels() {
      return this.view?.panels || [];
    },

    activePanel() {
      return this.panels.find((p) => p.id === this.activePanelId) || this.panels[0] || null;
    },

    rootOrganizer() {
      return this.activePanel?.organizer || null;
    },

    // More than one PANEL means tabs; while editing we always show the panel manager.
    showTabs() {
      return this.editing || this.panels.length > 1;
    },

    hasContent() {
      return !!this.rootOrganizer?.children?.length;
    },

    // True when the working draft differs from the last-published state for this scope.
    dirty() {
      return this.editing && this.savedBaseline !== null && JSON.stringify(this.working) !== this.savedBaseline;
    },

    // Whether the scope being edited is currently disabled (kept, but not applied).
    scopeDisabled() {
      return !!this.working?.disabled;
    },

    templateOptions() {
      return savedHomeTemplates(this.$store.getters).map((cr) => ({
        name:        cr.metadata?.name,
        displayName: cr.spec?.displayName || cr.metadata?.name,
      }));
    },

    // The node the properties strip edits.
    selectedNode() {
      return this.rootOrganizer ? findNode(this.rootOrganizer, this.selectedNodeId) : null;
    },

    selectedIsRoot() {
      return !!this.selectedNode && this.selectedNode.id === this.rootOrganizer?.id;
    },

    selectedIsOrganizer() {
      return !!this.selectedNode && this.selectedNode.type !== NODE_TEMPLATE;
    },

    // Root -> … -> selected node. Rendered as a clickable breadcrumb because a parent organizer (the
    // panel root above all) is completely covered by its children and can't be clicked directly.
    breadcrumb() {
      if (!this.rootOrganizer) {
        return [];
      }

      const path = pathToNode(this.rootOrganizer, this.selectedNodeId);
      const chain = path.length ? path : [this.rootOrganizer];

      return chain.map((node, i) => ({
        id:    node.id,
        label: node.type === NODE_TEMPLATE ? node.template : (i === 0 ? 'Panel' : 'Organizer'),
      }));
    },
  },

  watch: {
    // If the applied view changes underneath us (or on first load), keep a valid active panel.
    appliedView() {
      if (!this.editing) {
        this.syncActivePanel();
      }
    },
  },

  methods: {
    clone(obj) {
      return JSON.parse(JSON.stringify(obj));
    },

    syncActivePanel() {
      if (!this.panels.find((p) => p.id === this.activePanelId)) {
        this.activePanelId = this.panels[0]?.id || null;
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

    // Layout edits are a DRAFT — leaving with unsaved changes discards them (after a confirm).
    async exitEdit() {
      if (this.dirty && !window.confirm('You have unsaved changes to this Home layout. Discard them?')) {
        return;
      }
      this.editing = false;
      this.working = null;
      this.snapshot = null;
      this.savedBaseline = null;
      this.editingTemplate = null;
      this.selectedNodeId = null;
      await fetchTemplatingConfigMaps(this.$store).catch(() => {});
      this.syncActivePanel();
    },

    // Load the chosen scope's published view into the working DRAFT (or an empty one).
    seedWorking() {
      const existing = this.scope === 'user' ? this.scopes.user : this.scopes.global;
      const view = existing ? this.clone(existing) : emptyView();
      const json = JSON.stringify(view);

      this.working = view;
      this.snapshot = json;
      this.savedBaseline = json;
      this.activePanelId = view.panels[0]?.id || null;
      this.selectedNodeId = view.panels[0]?.organizer?.id || null;
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
        await saveView(this.$store, this.scope, this.working, this.userId);
        this.savedBaseline = JSON.stringify(this.working);
        await fetchTemplatingConfigMaps(this.$store).catch(() => {});
        this.status = this.scope === 'user' ? 'Saved to your Home.' : 'Saved — live for everyone.';
      } catch (e) {
        this.error = e?.message || String(e);
      } finally {
        this.saving = false;
      }
    },

    // ---- tree mutations (draft only — mutate the working copy, publish on Save) ----
    workingPanel() {
      return this.working?.panels.find((p) => p.id === this.activePanelId) || null;
    },

    // Every tree change re-runs tidyRoot: loose templates get wrapped in their own organizer and the
    // root always ends with exactly one empty organizer to drop into.
    mutateTree(fn) {
      const panel = this.workingPanel();

      if (panel) {
        panel.organizer = tidyRoot(fn(panel.organizer));
      }
    },

    selectNode(id) {
      this.selectedNodeId = id;
    },

    // New children go into the selected ORGANIZER — or, if a template leaf is selected, into its
    // parent, so "add" always lands somewhere sensible.
    addTargetId() {
      const root = this.rootOrganizer;

      if (!root) {
        return null;
      }
      if (!this.selectedNode) {
        return root.id;
      }
      if (this.selectedIsOrganizer) {
        return this.selectedNode.id;
      }

      return findParent(root, this.selectedNode.id)?.id || root.id;
    },

    addTemplate(name) {
      if (!name) {
        return;
      }

      const node = newTemplateNode(name);
      let target = this.addTargetId();

      // Templates live INSIDE an organizer, never loose on the panel root — so when the root is the
      // target, drop into its trailing empty organizer (the one always kept for exactly this).
      if (target === this.rootOrganizer?.id) {
        const kids = this.rootOrganizer.children || [];
        const last = kids[kids.length - 1];

        if (last && last.type !== NODE_TEMPLATE) {
          target = last.id;
        }
      }

      this.mutateTree((root) => addChild(root, target, node));
      this.selectedNodeId = node.id;
    },

    addOrganizer() {
      const node = newOrganizer();
      const target = this.addTargetId();

      this.mutateTree((root) => addChild(root, target, node));
      this.selectedNodeId = node.id;
    },

    // ---- drag & drop ----
    dropInto(parentId, index) {
      const id = this.ui.dragId;

      this.ui.dragId = null;

      if (!id) {
        return;
      }
      this.mutateTree((root) => moveNodeTo(root, id, parentId, index));
      this.selectedNodeId = id;
    },

    setColSpan(id, span) {
      this.mutateTree((root) => setColSpan(root, id, span));
    },

    removeNode(id) {
      this.mutateTree((root) => removeNode(root, id));
      if (this.selectedNodeId === id) {
        this.selectedNodeId = this.rootOrganizer?.id || null;
      }
    },

    moveNode(id, delta) {
      this.mutateTree((root) => moveNode(root, id, delta));
    },

    // A size/padding input accepts a bare number (px) or any CSS length ('100%', '2rem').
    parseSizeInput(value) {
      const v = `${ value ?? '' }`.trim();

      if (!v) {
        return 0;
      }

      return /^\d+(\.\d+)?$/.test(v) ? Number(v) : v;
    },

    setNodeProp(key, value) {
      const id = this.selectedNodeId;

      if (!id) {
        return;
      }
      this.mutateTree((root) => updateNode(root, id, (node) => ({ ...node, [key]: value })));
    },

    setNodeSize(key, value) {
      this.setNodeProp(key, this.parseSizeInput(value));
    },

    // `box` is 'margin' or 'padding' — both are four-sided values edited the same way.
    setNodeBox(box, side, value) {
      const id = this.selectedNodeId;

      if (!id) {
        return;
      }
      const parsed = this.parseSizeInput(value);

      this.mutateTree((root) => updateNode(root, id, (node) => ({ ...node, [box]: { ...node[box], [side]: parsed } })));
    },

    // ---- panel (tab) management ----
    selectPanel(id) {
      this.activePanelId = id;
      this.selectedNodeId = this.panels.find((p) => p.id === id)?.organizer?.id || null;
    },

    addPanel() {
      const panel = newPanel(`Panel ${ this.working.panels.length + 1 }`);

      this.working.panels.push(panel);
      this.activePanelId = panel.id;
      this.selectedNodeId = panel.organizer.id;
    },

    renamePanel(panel) {
      const name = (window.prompt('Panel name:', panel.name) || '').trim();

      if (name) {
        panel.name = name;
      }
    },

    removePanel(id) {
      if (this.working.panels.length <= 1) {
        return;
      }
      this.working.panels = this.working.panels.filter((p) => p.id !== id);
      if (this.activePanelId === id) {
        this.selectPanel(this.working.panels[0]?.id);
      }
    },

    // ---- template CONTENT editor ----
    openTemplateEditor(name) {
      this.editingTemplateNewKind = null;
      this.editingTemplateNewName = '';
      this.editingTemplate = name;
    },

    // Create a BRAND NEW template (kind = 'code' | 'json'). Opens the editor blank; nothing is
    // written until the user clicks Save.
    newTemplate(kind) {
      if (!kind) {
        return;
      }

      const label = (window.prompt(`Name for the new ${ kind === 'json' ? 'JSON' : 'code' } template:`) || '').trim();

      if (!label) {
        return;
      }

      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'template';

      this.editingTemplateNewKind = kind;
      this.editingTemplateNewName = label;
      this.editingTemplate = slug;
    },

    async closeTemplateEditor() {
      this.editingTemplate = null;
      this.editingTemplateNewKind = null;
      this.editingTemplateNewName = '';
      await fetchTemplatingConfigMaps(this.$store).catch(() => {});
    },

    // ---- reset / disable ----
    reset() {
      if (!this.snapshot) {
        return;
      }
      this.working = JSON.parse(this.snapshot);
      this.syncActivePanel();
      this.activePanelId = this.working.panels[0]?.id || this.activePanelId;
      this.selectedNodeId = this.rootOrganizer?.id || null;
      this.status = 'Reverted to how it was when you started editing.';
    },

    // Disable / enable this scope's Home WITHOUT deleting it — a disabled view keeps all its panels
    // but stops being applied (the scope falls back to stock / the global default).
    toggleDisable() {
      if (this.working.disabled) {
        delete this.working.disabled;
      } else {
        this.working.disabled = true;
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
    <!-- A template's ✎ opens the single-template content editor (source + AI chat + preview). -->
    <HomeTemplateEditor
      v-if="editingTemplate"
      :name="editingTemplate"
      :new-kind="editingTemplateNewKind"
      :new-display-name="editingTemplateNewName"
      @close="closeTemplateEditor"
    />

    <template v-else>
      <!-- Compact bar: edit toggle + panel tabs (+ edit-only controls). -->
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

        <!-- PANELS render as tabs (and are managed here while editing). -->
        <div
          v-if="showTabs"
          class="ai-home__tabs"
        >
          <button
            v-for="p in panels"
            :key="p.id"
            class="ai-home__tab"
            :class="{ 'ai-home__tab--active': p.id === activePanelId }"
            @click="selectPanel(p.id)"
            @dblclick="editing && renamePanel(p)"
          >
            {{ p.name }}
            <i
              v-if="editing && panels.length > 1"
              class="icon icon-close ai-home__tab-x"
              @click.stop="removePanel(p.id)"
            />
          </button>
          <button
            v-if="editing"
            class="ai-home__tab ai-home__tab--add"
            title="Add panel"
            @click="addPanel"
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
            title="Add a template into the selected organizer"
            @change="addTemplate($event.target.value); $event.target.value = ''"
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

          <button
            class="btn btn-sm role-secondary"
            title="Add an organizer (a full-width row) into the selected organizer"
            @click="addOrganizer"
          >
            ＋ Organizer
          </button>

          <select
            class="ai-home__add"
            title="Create a new template (opens a blank editor; saves only when you click Save)"
            @change="newTemplate($event.target.value); $event.target.value = ''"
          >
            <option value="">
              ＋ New template…
            </option>
            <option value="code">
              Blank Code template
            </option>
            <option value="json">
              Blank JSON template
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
            :title="scopeDisabled
              ? 'Re-apply this Home (keeps its panels)'
              : 'Stop applying this Home without deleting it — its panels are kept; the scope falls back to stock / the global default'"
            @click="toggleDisable"
          >
            {{ scopeDisabled ? 'Enable' : 'Disable' }}
          </button>
          <span
            v-if="scopeDisabled"
            class="ai-home__disabled"
          >Disabled — not applied (panels kept)</span>
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

      <!-- Properties of the selected node: size + padding accept px numbers or CSS values like 100%. -->
      <div
        v-if="editing && selectedNode"
        class="ai-home__props"
      >
        <!-- Ancestor breadcrumb — the only reliable way to reach a parent organizer (and the panel
           root), since children cover them completely. -->
        <nav class="ai-home__crumbs">
          <template
            v-for="(crumb, i) in breadcrumb"
            :key="crumb.id"
          >
            <span
              v-if="i"
              class="ai-home__crumb-sep"
            >›</span>
            <button
              class="ai-home__crumb"
              :class="{ 'ai-home__crumb--active': crumb.id === selectedNodeId }"
              :title="`Select ${ crumb.label }`"
              @click="selectNode(crumb.id)"
            >
              {{ crumb.label }}
            </button>
          </template>
        </nav>
        <span
          v-if="selectedIsOrganizer"
          class="ai-home__lbl"
        >100% wide</span>

        <!-- Templates are sized in COLUMNS (1..12) — the same thing the drag handle changes. -->
        <template v-if="!selectedIsOrganizer">
          <label class="ai-home__lbl">col-span</label>
          <input
            class="ai-home__field ai-home__field--sm"
            type="number"
            min="1"
            :max="gridColumns"
            :value="selectedNode.colSpan"
            title="How many of the 12 columns this template takes — or drag its right edge"
            @change="setColSpan(selectedNode.id, $event.target.value)"
          >
        </template>

        <template v-if="!selectedIsRoot">
          <label class="ai-home__lbl">H</label>
          <input
            class="ai-home__field ai-home__field--sm"
            :value="selectedNode.height"
            title="Height — 'auto' fits the content, a number is px, or use any CSS length"
            @change="setNodeSize('height', $event.target.value)"
          >
        </template>

        <!-- Margin (outside) and padding (inside) — shown on the canvas as amber / teal outlines. -->
        <label class="ai-home__lbl ai-home__lbl--margin">Margin</label>
        <input
          v-for="side in ['top', 'right', 'bottom', 'left']"
          :key="`m-${ side }`"
          class="ai-home__field ai-home__field--sm"
          :value="selectedNode.margin[side]"
          :title="`Margin ${ side } — a number is px, or use % / any CSS length`"
          :placeholder="side.charAt(0).toUpperCase()"
          @change="setNodeBox('margin', side, $event.target.value)"
        >

        <label class="ai-home__lbl ai-home__lbl--padding">Padding</label>
        <input
          v-for="side in ['top', 'right', 'bottom', 'left']"
          :key="`p-${ side }`"
          class="ai-home__field ai-home__field--sm"
          :value="selectedNode.padding[side]"
          :title="`Padding ${ side } — a number is px, or use % / any CSS length`"
          :placeholder="side.charAt(0).toUpperCase()"
          @change="setNodeBox('padding', side, $event.target.value)"
        >
      </div>

      <!-- The applied VIEW (or the edit surface). Gate on templatingEnabled so the kill switch swaps
         to stock Rancher live. StockHome shows when nothing is applied. -->
      <div
        v-if="loaded && templatingEnabled && view && (editing || hasContent)"
        class="ai-home__surface"
        @mouseleave="ui.hoverId = null"
      >
        <OrganizerNode
          v-if="rootOrganizer"
          :key="rootOrganizer.id"
          :node="rootOrganizer"
          :editing="editing"
          :selected-id="selectedNodeId"
          is-root
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

  // Both bars stay pinned while the page scrolls, so the controls for whatever you have selected are
  // always reachable no matter how tall the templates are.
  &__bar {
    align-items:   center;
    background:    var(--header-bg, var(--box-bg));
    border-bottom: 1px solid var(--border);
    display:       flex;
    flex-wrap:     wrap;
    gap:           8px;
    padding:       6px 16px;
    position:      sticky;
    top:           0;
    z-index:       20;
  }

  &__props {
    align-items:   center;
    background:    var(--box-bg);
    border-bottom: 1px solid var(--border);
    display:       flex;
    flex-wrap:     wrap;
    gap:           6px;
    padding:       5px 16px;
    position:      sticky;
    top:           41px; // sits directly under the toolbar above
    z-index:       19;
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
      background:   var(--body-bg);
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

  &__disabled {
    color:      var(--muted);
    font-size:  12px;
    font-style: italic;
  }

  &__lbl {
    color:     var(--muted);
    font-size: 12px;
    margin:    0;

    // Colour-keyed to the bands drawn on the canvas: amber = margin, teal = padding.
    &--margin,
    &--padding {
      align-items: center;
      display:     flex;
      gap:         4px;

      &::before {
        border-radius: 2px;
        content:       '';
        height:        9px;
        width:         9px;
      }
    }

    &--margin::before {
      background: rgba(247, 181, 0, 0.9);
    }

    &--padding::before {
      background: rgba(0, 158, 158, 0.9);
    }
  }

  &__scope {
    display: flex;
    gap:     2px;
  }

  &__add,
  &__field {
    height:        28px;
    border:        1px solid var(--border);
    border-radius: var(--border-radius);
    background:    var(--body-bg);
    color:         var(--body-text);
    padding:       0 8px;
  }

  &__field--sm {
    width:      64px;
    padding:    0 6px;
    text-align: center;
  }

  &__crumbs {
    align-items: center;
    display:     flex;
    gap:         2px;
  }

  &__crumb {
    background:    transparent;
    border:        1px solid transparent;
    border-radius: var(--border-radius);
    color:         var(--link);
    cursor:        pointer;
    font-size:     12px;
    max-width:     180px;
    overflow:      hidden;
    padding:       2px 6px;
    text-overflow: ellipsis;
    white-space:   nowrap;

    &:hover {
      background: var(--box-bg);
    }

    &--active {
      background:   var(--box-bg);
      border-color: var(--border);
      color:        var(--body-text);
      font-weight:  600;
    }
  }

  &__crumb-sep {
    color:     var(--muted);
    font-size: 12px;
  }

  // No padding in view mode — the organizers own their spacing, so the Home renders edge-to-edge
  // (e.g. a full-bleed banner) and can match a hand-built page exactly.
  &--editing &__surface {
    padding: 12px 16px;
  }
}
</style>
