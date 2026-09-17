<script>
import StockHome from '@shell/pages/home.vue';
import OrganizerNode from '../components/OrganizerNode.vue';
import HomeTemplateEditor from '../components/HomeTemplateEditor.vue';
import HomeViewBar from '../components/HomeViewBar.vue';
import EditViewSidebar from '../components/EditViewSidebar.vue';
import WidgetSettingsModal from '../components/WidgetSettingsModal.vue';
import { isTemplatingEnabled, appliedViewScopes, saveView, fetchTemplatingConfigMaps } from '../templating/template-engine';
import {
  DEFAULT_GAP, GRID_COLUMNS, isLeaf, newId, newPanel, newWidgetNode, isStockPanel,
  findNode, addChild, insertNode, removeNode, moveNode, moveNodeTo, updateNode,
  setColSpan, tidyRoot, heightForPreset, newRootOrganizer, ensureTrailingEmpty, SPACING_PRESETS
} from '../templating/view-model';

// The Home.
//
//   VIEW       one named dashboard — "Cluster overview", "Upgrade week". Views are the tabs in the
//              bar at the top, and each is edited, renamed, duplicated and deleted on its own.
//   WIDGET     one building block on a view's grid (a table, counters, a bar chart, …), sized in
//              twelfths and configured in place through its ⚙.
//   ROW        structure, not something you configure: widgets wrap onto rows, and a row is only
//              visible while editing as the dashed area you drop into.
//
// WHERE VIEWS LIVE. Your views are saved to YOUR account; the views an admin publishes live in the
// organization's scope and appear in the same bar. Editing one of those does not change what
// everyone else sees — it forks the view into your account first, which is what lets the editing
// bar promise "Changes are saved to your account only" without an asterisk. Publishing is the
// separate, deliberate step in the ⋮ menu.
//
// Edits are a DRAFT: nothing is written until Save.
export default {
  name:       'AiTemplatingHome',
  components: {
    StockHome, OrganizerNode, HomeTemplateEditor, HomeViewBar, EditViewSidebar, WidgetSettingsModal
  },

  // Action callbacks for the recursive OrganizerNode tree (so it never has to re-emit at each
  // level). Arrows keep `this` bound to this component.
  provide() {
    return {
      viewEditor: {
        select:    (id) => this.selectNode(id),
        move:      (id, delta) => this.moveNode(id, delta),
        remove:    (id) => this.removeNode(id),
        configure: (id) => {
          this.settingsNodeId = id;
        },
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
      working:                null, // working copy of YOUR views while editing (a DRAFT)
      snapshot:               null, // JSON of the draft when editing began (for Cancel)
      savedBaseline:          null, // JSON of the last SAVED state (for the dirty check)
      activePanelId:          null,
      // True once the active view is a DELIBERATE choice (you clicked it, or an action moved you to
      // it) rather than the fallback taken while the config was still loading.
      pinnedView:             false,
      selectedNodeId:         null,
      newPanelId:             null, // the view being created, while it has never been saved
      startedFrom:            '', // what a new view was started from, for the bar's "From …"
      settingsNodeId:         null, // widget whose settings dialog is open
      lizPreviewId:           null, // Liz's preview widget, on the grid but not yet part of the view
      editingTemplate:        null, // stored template whose CONTENT is open in the split editor
      editingTemplateNewKind: null,
      editingTemplateNewName: '',
      saving:                 false,
      error:                  '',
      // Shared, reactive editor UI state: what is being dragged (an existing node, or a catalog
      // entry on its way in), and the innermost node under the pointer.
      ui:                     {
        dragId: null, hoverId: null, dragEntry: null, dragLabel: '', showBoxModel: false
      },
    };
  },

  async created() {
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        await fetchTemplatingConfigMaps(this.$store);

        const user = await this.$store.dispatch('auth/getUser').catch(() => null);

        this.userId = user?.id || this.$store.getters['auth/user']?.id || null;

        if (this.scopes.user || this.scopes.global || attempt >= 4) {
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

    // Your saved views (what the editor writes).
    myViews() {
      return this.scopes.user?.panels || [];
    },

    // The views an admin published for the organization.
    orgViews() {
      return this.scopes.global?.panels || [];
    },

    // What a brand-new view is seeded from: the organization template. A stock view is skipped —
    // it has no grid, so starting from it would give you nothing to edit.
    orgTemplate() {
      return this.orgViews.find((p) => !isStockPanel(p)) || null;
    },

    // Every view in the bar: the organization's, then your own.
    //
    // A view you have forked takes its source's PLACE rather than being appended — the bar has to
    // stay still. Editing "Cluster overview" must not make it jump to the end of the strip.
    views() {
      const mine = this.editing ? (this.working?.panels || []) : this.myViews;
      const forks = new Map(mine.filter((p) => p.from).map((p) => [p.from, p]));
      const orgIds = new Set(this.orgViews.map((p) => p.id));

      const published = this.orgViews.map((p) => forks.get(p.id) || { ...p, org: true });
      const own = mine.filter((p) => !p.from || !orgIds.has(p.from));

      return [...published, ...own];
    },

    activeView() {
      return this.views.find((p) => p.id === this.activePanelId) || this.views[0] || null;
    },

    defaultViewId() {
      return this.scopes.user?.defaultPanelId || '';
    },

    isNewView() {
      return !!this.newPanelId && this.newPanelId === this.activePanelId;
    },

    // A STOCK view renders Rancher's own Home and has no layout to edit.
    activeIsStock() {
      return isStockPanel(this.activeView);
    },

    rootOrganizer() {
      return this.activeView?.organizer || null;
    },

    gap() {
      return this.activeView?.gap ?? DEFAULT_GAP;
    },

    hasContent() {
      return this.activeIsStock || !!this.rootOrganizer?.children?.some((child) => child.children?.length || isLeaf(child));
    },

    // True when the draft differs from the last saved state.
    dirty() {
      return this.editing && this.savedBaseline !== null && JSON.stringify(this.working) !== this.savedBaseline;
    },

    // The node the Layout tab acts on — never a row, which has nothing to lay out.
    selectedNode() {
      const node = this.rootOrganizer ? findNode(this.rootOrganizer, this.selectedNodeId) : null;

      return node && isLeaf(node) ? node : null;
    },

    settingsNode() {
      return this.rootOrganizer && this.settingsNodeId ? findNode(this.rootOrganizer, this.settingsNodeId) : null;
    },

    // Liz needs the AI agent CRD to be installed before offering to build anything.
    lizEnabled() {
      return !!this.$store.getters['management/schemaFor']('ai.cattle.io.aiagentconfig');
    },

    // The starting points a brand-new view offers: empty, or a copy of any view you already have.
    startingPoints() {
      return this.views
        .filter((p) => p.id !== this.newPanelId && !isStockPanel(p))
        .map((p) => ({ id: p.id, label: `Copy ${ p.name }` }));
    },
  },

  watch: {
    // If what is applied changes underneath us (or on first load), keep a valid active view.
    scopes() {
      if (!this.editing) {
        this.syncActivePanel();
      }
    },
  },

  methods: {
    clone(obj) {
      return JSON.parse(JSON.stringify(obj));
    },

    /**
     * Open on your default view, or the first one there is.
     *
     * The config arrives in pieces — the organization's views resolve before your own — so the
     * first pass can only fall back to the first view there is. That fallback is NOT a choice, and
     * this runs again when the rest lands: your default still wins. A view you actually picked
     * (`pinnedView`) is never moved underneath you.
     */
    syncActivePanel() {
      if (this.pinnedView && this.views.find((p) => p.id === this.activePanelId)) {
        return;
      }

      const preferred = this.views.find((p) => p.id === this.defaultViewId);

      if (preferred) {
        this.activePanelId = preferred.id;
        this.selectedNodeId = null;

        return;
      }

      if (!this.views.find((p) => p.id === this.activePanelId)) {
        this.activePanelId = this.views[0]?.id || null;
        this.selectedNodeId = null;
      }
    },

    // Move to a view on purpose — and remember that it was on purpose.
    setActiveView(id) {
      this.activePanelId = id;
      this.pinnedView = true;
      this.selectedNodeId = null;
    },

    selectPanel(id) {
      this.setActiveView(id);
    },

    // ---- edit lifecycle ----------------------------------------------------------------------

    // The draft is always YOUR views. Editing a published view forks it into your account first, so
    // an edit can never change what the organization sees by accident.
    enterEdit() {
      this.error = '';
      this.working = this.scopes.user ? this.clone(this.scopes.user) : { panels: [] };

      const active = this.activeView;

      if (active?.org) {
        const fork = {
          ...this.clone(active), id: newId('panel'), org: undefined, from: active.id
        };

        delete fork.org;
        this.working.panels.push(fork);
        this.setActiveView(fork.id);
      } else if (!this.working.panels.length) {
        const first = newPanel('My Home');

        this.working.panels.push(first);
        this.setActiveView(first.id);
      }

      this.snapshot = JSON.stringify(this.working);
      this.savedBaseline = this.snapshot;
      this.editing = true;
      this.selectedNodeId = null;
    },

    cancelEdit() {
      if (this.dirty && !window.confirm('Discard the changes to this view?')) {
        return;
      }
      this.leaveEdit();
    },

    async leaveEdit() {
      this.editing = false;
      this.working = null;
      this.snapshot = null;
      this.savedBaseline = null;
      this.newPanelId = null;
      this.startedFrom = '';
      this.selectedNodeId = null;
      this.settingsNodeId = null;
      this.lizPreviewId = null;
      await fetchTemplatingConfigMaps(this.$store).catch(() => {});
      this.syncActivePanel();
    },

    /**
     * A fork that still matches the published view it came from is not a decision you made — it is
     * just where the editor had to put the draft. Saving it would leave a duplicate in the bar
     * forever, so those are dropped on the way out.
     */
    pruneUntouchedForks() {
      const strip = (panel) => {
        const copy = { ...panel };

        delete copy.id;
        delete copy.from;
        delete copy.org;

        return JSON.stringify(copy);
      };
      const sources = new Map(this.orgViews.map((p) => [p.id, strip(p)]));
      const dropped = new Set();

      this.working.panels = this.working.panels.filter((panel) => {
        const untouched = panel.from && sources.get(panel.from) === strip(panel);

        if (untouched) {
          dropped.add(panel.id);
        }

        return !untouched;
      });

      // Looking at one that just went? Fall back to the published view it mirrored.
      if (dropped.has(this.activePanelId)) {
        this.activePanelId = null;
        this.pinnedView = false;
      }
      if (this.working.defaultPanelId && dropped.has(this.working.defaultPanelId)) {
        delete this.working.defaultPanelId;
      }
    },

    // Publish the draft to your account.
    async save({ keepEditing = false } = {}) {
      this.saving = true;
      this.error = '';

      try {
        this.discardLizPreview();
        this.pruneUntouchedForks();
        await saveView(this.$store, 'user', this.working, this.userId);
        this.savedBaseline = JSON.stringify(this.working);
        this.newPanelId = null;
        this.startedFrom = '';
        await fetchTemplatingConfigMaps(this.$store).catch(() => {});

        if (!keepEditing) {
          await this.leaveEdit();
        }
      } catch (e) {
        this.error = e?.message || String(e);
      } finally {
        this.saving = false;
      }
    },

    // Keep the view you started from as it was, and save your changes as a view of their own.
    async saveAsNewView() {
      const panel = this.workingPanel();

      if (!panel) {
        return;
      }

      const copy = {
        ...this.clone(panel), id: newId('panel'), name: `${ panel.name } copy`
      };

      delete copy.from;

      // The original goes back to how it was saved; the copy carries the edits.
      const baseline = JSON.parse(this.savedBaseline);
      const original = baseline.panels.find((p) => p.id === panel.id);

      if (original) {
        Object.assign(panel, this.clone(original));
      } else {
        this.working.panels = this.working.panels.filter((p) => p.id !== panel.id);
      }

      this.working.panels.push(copy);
      this.setActiveView(copy.id);

      await this.save();
    },

    // ---- view (tab) actions ------------------------------------------------------------------

    workingPanel() {
      return this.working?.panels.find((p) => p.id === this.activePanelId) || null;
    },

    renameView(name) {
      const panel = this.workingPanel();

      if (panel) {
        panel.name = name;
      }
    },

    // "Rename" from the ⋮ menu: there is one place a view is named — the bar — so this opens the
    // editor and puts the cursor in it rather than inventing a second naming dialog.
    startRename() {
      if (!this.editing) {
        this.enterEdit();
      }
      this.$nextTick(() => this.$refs.bar?.$el?.querySelector('.vbar__name')?.select());
    },

    // A new view starts from the organization template when there is one — the design's "From the
    // organization template. Not saved yet."
    newView() {
      if (!this.editing) {
        this.enterEdit();
      }

      const template = this.orgTemplate;
      const panel = template ? {
        ...this.clone(template), id: newId('panel'), name: 'Untitled view', org: undefined, from: undefined
      } : newPanel('Untitled view');

      delete panel.org;
      delete panel.from;

      this.working.panels.push(panel);
      this.setActiveView(panel.id);
      this.newPanelId = panel.id;
      this.startedFrom = template ? 'the organization template' : '';
      this.selectedNodeId = null;
    },

    // The starting-point chips on a brand-new view: swap what it was seeded with.
    startFrom(sourceId) {
      const panel = this.workingPanel();

      if (!panel) {
        return;
      }

      const source = sourceId ? this.views.find((p) => p.id === sourceId) : null;

      panel.organizer = source ? this.clone(source.organizer) : ensureTrailingEmpty(newRootOrganizer());
      panel.gap = source?.gap ?? DEFAULT_GAP;
      this.startedFrom = source ? source.name : '';
      this.selectedNodeId = null;
    },

    async duplicateView() {
      const source = this.activeView;

      if (!source) {
        return;
      }

      const draft = this.scopes.user ? this.clone(this.scopes.user) : { panels: [] };
      const copy = {
        ...this.clone(source), id: newId('panel'), name: `${ source.name } copy`
      };

      delete copy.org;
      delete copy.from;
      draft.panels.push(copy);

      await this.persist(draft, copy.id);
    },

    // Your default is the view the Home opens on. Setting it on a published view forks that view
    // into your account first, for the same reason editing does.
    async setDefaultView() {
      const active = this.activeView;

      if (!active) {
        return;
      }

      const draft = this.scopes.user ? this.clone(this.scopes.user) : { panels: [] };
      let id = active.id;

      if (active.org) {
        const fork = {
          ...this.clone(active), id: newId('panel'), from: active.id
        };

        delete fork.org;
        draft.panels.push(fork);
        id = fork.id;
      }

      draft.defaultPanelId = id;
      await this.persist(draft, id);
    },

    // Publish the view to everyone. It joins the organization's scope, which is the only thing on
    // this page that is not personal — so it asks first.
    async publishView() {
      const source = this.editing ? this.workingPanel() : this.activeView;

      if (!source || !window.confirm(`Publish “${ source.name }” as an organization template? Everyone will see it in their Home.`)) {
        return;
      }

      const org = this.scopes.global ? this.clone(this.scopes.global) : { panels: [] };
      const published = { ...this.clone(source), id: source.from || source.id };

      delete published.org;
      delete published.from;

      const at = org.panels.findIndex((p) => p.id === published.id || p.name === published.name);

      if (at >= 0) {
        org.panels.splice(at, 1, published);
      } else {
        org.panels.push(published);
      }

      this.saving = true;
      this.error = '';

      try {
        await saveView(this.$store, 'global', org, this.userId);
        await this.linkToPublished(source, published.id);
        await fetchTemplatingConfigMaps(this.$store).catch(() => {});
      } catch (e) {
        this.error = e?.message || String(e);
      } finally {
        this.saving = false;
      }
    },

    /**
     * After publishing, YOUR copy becomes a fork of the view you just published.
     *
     * Without this the bar would show the same view twice — once as yours, once as the
     * organization's — which is not two views, it is one view and its shadow.
     */
    async linkToPublished(source, publishedId) {
      if (source.org || source.from === publishedId) {
        return;
      }

      if (this.editing) {
        const panel = this.workingPanel();

        if (panel) {
          panel.from = publishedId;
        }

        return;
      }

      const draft = this.scopes.user ? this.clone(this.scopes.user) : null;
      const mine = draft?.panels.find((p) => p.id === source.id);

      if (mine) {
        mine.from = publishedId;
        await saveView(this.$store, 'user', draft, this.userId);
      }
    },

    async deleteView() {
      const active = this.activeView;

      if (!active || !window.confirm(`Delete the view “${ active.name }”?`)) {
        return;
      }

      // A published view is not yours to delete — hiding it means keeping an empty fork of it.
      if (active.org) {
        this.error = 'That view is published for the organization. An administrator has to remove it.';

        return;
      }

      if (this.editing) {
        this.working.panels = this.working.panels.filter((p) => p.id !== active.id);
        this.activePanelId = null;
        this.pinnedView = false;
        await this.save();

        return;
      }

      const draft = this.clone(this.scopes.user);

      draft.panels = draft.panels.filter((p) => p.id !== active.id);
      await this.persist(draft, null);
    },

    // Write a whole user-scope draft straight through (the view-mode actions, which have no draft).
    async persist(draft, activeId) {
      this.saving = true;
      this.error = '';

      try {
        await saveView(this.$store, 'user', draft, this.userId);
        await fetchTemplatingConfigMaps(this.$store).catch(() => {});
        this.activePanelId = activeId || null;
        this.pinnedView = !!activeId;
        this.syncActivePanel();
      } catch (e) {
        this.error = e?.message || String(e);
      } finally {
        this.saving = false;
      }
    },

    // ---- grid mutations (draft only) ----------------------------------------------------------

    // Every tree change re-runs tidyRoot: loose widgets get wrapped in their own row and the view
    // always ends with exactly one empty row to drop into.
    //
    // A STOCK view has no tree at all — it is Rancher's own Home rendered as a view — so every edit
    // here is a no-op rather than a crash. The drawer says as much (see `activeIsStock`).
    mutateTree(fn) {
      const panel = this.workingPanel();

      if (panel && panel.organizer) {
        panel.organizer = tidyRoot(fn(panel.organizer));
      }
    },

    selectNode(id) {
      this.selectedNodeId = id;
    },

    // Where a widget lands when it is CLICKED in the catalog rather than dragged.
    //
    // It fills the LAST ROW while there is room for it, and only starts a new one when there is
    // not. Clicking Cluster health, Active alerts and Upgrade status in turn therefore builds the
    // row of three you were picturing, instead of three rows of one.
    addTargetId(span = 12) {
      const root = this.rootOrganizer;

      if (!root) {
        return null;
      }

      const rows = (root.children || []).filter((child) => !isLeaf(child));
      const filled = rows.filter((row) => (row.children || []).length);
      const last = filled[filled.length - 1];

      if (last) {
        const used = (last.children || []).reduce((total, child) => total + (child.colSpan || 0), 0);

        if (used + span <= GRID_COLUMNS) {
          return last.id;
        }
      }

      // No room (or nothing placed yet): the trailing empty row, which tidyRoot always keeps.
      const trailing = rows[rows.length - 1];

      return trailing && !(trailing.children || []).length ? trailing.id : root.id;
    },

    addFromCatalog(entry, at) {
      if (!entry) {
        return;
      }

      const node = newWidgetNode(entry.spec, { colSpan: entry.span });

      if (at) {
        this.mutateTree((root) => insertNode(root, at.parentId, node, at.index));
      } else {
        this.mutateTree((root) => addChild(root, this.addTargetId(node.colSpan), node));
      }

      this.selectedNodeId = node.id;
    },

    // ---- drag & drop --------------------------------------------------------------------------

    // A drag from the catalog carries the entry itself; a drag on the grid carries a node id.
    onCatalogDragStart(entry, ev) {
      this.ui.dragEntry = entry;
      this.ui.dragLabel = entry.name;

      if (ev?.dataTransfer) {
        ev.dataTransfer.effectAllowed = 'copy';
        ev.dataTransfer.setData('text/plain', entry.id);
      }
    },

    onCatalogDragEnd() {
      this.ui.dragEntry = null;
      this.ui.dragLabel = '';
    },

    dropInto(parentId, index) {
      const entry = this.ui.dragEntry;
      const id = this.ui.dragId;

      this.ui.dragId = null;
      this.ui.dragEntry = null;
      this.ui.dragLabel = '';

      if (entry) {
        this.addFromCatalog(entry, { parentId, index });

        return;
      }

      if (!id) {
        return;
      }

      this.mutateTree((root) => moveNodeTo(root, id, parentId, index));
      this.selectedNodeId = id;
    },

    // ---- layout of the selected widget --------------------------------------------------------

    setColSpan(id, span) {
      this.mutateTree((root) => setColSpan(root, id, span));
    },

    setSelectedWidth(span) {
      if (this.selectedNodeId) {
        this.setColSpan(this.selectedNodeId, span);
      }
    },

    setSelectedHeight(presetId) {
      this.setNodeProp('height', heightForPreset(presetId, this.gap));
    },

    setSelectedSpacing(presetId) {
      const preset = SPACING_PRESETS.find((p) => p.id === presetId);

      if (!preset) {
        return;
      }

      this.setNodeProp('padding', {
        top: preset.padding, right: preset.padding, bottom: preset.padding, left: preset.padding
      });
    },

    setNodeProp(key, value) {
      const id = this.selectedNodeId;

      if (!id) {
        return;
      }
      this.mutateTree((root) => updateNode(root, id, (node) => ({ ...node, [key]: value })));
    },

    // `box` is 'margin' or 'padding' — both are four-sided values edited the same way, in pixels.
    setNodeBox(box, side, value) {
      const id = this.selectedNodeId;

      if (!id) {
        return;
      }

      const px = Math.max(0, Math.round(Number(value) || 0));

      this.mutateTree((root) => updateNode(root, id, (node) => ({ ...node, [box]: { ...node[box], [side]: px } })));
    },

    setGap(value) {
      const panel = this.workingPanel();

      if (panel) {
        panel.gap = Math.max(0, Math.min(64, Math.round(Number(value) || 0)));
      }
    },

    removeNode(id) {
      this.mutateTree((root) => removeNode(root, id));
      if (this.selectedNodeId === id) {
        this.selectedNodeId = null;
      }
      if (this.settingsNodeId === id) {
        this.settingsNodeId = null;
      }
      if (this.lizPreviewId === id) {
        this.lizPreviewId = null;
      }
    },

    moveNode(id, delta) {
      this.mutateTree((root) => moveNode(root, id, delta));
    },

    // ---- widget settings ----------------------------------------------------------------------

    applySettings(spec) {
      const id = this.settingsNodeId;

      this.settingsNodeId = null;

      if (!id) {
        return;
      }

      this.mutateTree((root) => updateNode(root, id, (node) => ({ ...node, widget: spec })));
    },

    removeConfigured() {
      const id = this.settingsNodeId;

      this.settingsNodeId = null;
      if (id) {
        this.removeNode(id);
      }
    },

    // ---- Liz ----------------------------------------------------------------------------------

    // Liz's widget is put on the grid as a PREVIEW: a real widget with real data, marked so it is
    // obviously not part of the view yet. "Add to view" just drops the mark.
    onLizPreview({ widget, span, state }) {
      this.discardLizPreview();

      if (state === 'preview' && widget) {
        const node = newWidgetNode(widget, { colSpan: span || 6 });

        node.preview = true;
        this.mutateTree((root) => addChild(root, this.addTargetId(node.colSpan), node));
        this.lizPreviewId = node.id;
        this.selectedNodeId = node.id;
      } else if (state === 'add' && widget) {
        const node = newWidgetNode(widget, { colSpan: span || 6 });

        this.mutateTree((root) => addChild(root, this.addTargetId(node.colSpan), node));
        this.selectedNodeId = node.id;
      }
    },

    discardLizPreview() {
      if (this.lizPreviewId) {
        const id = this.lizPreviewId;

        this.lizPreviewId = null;
        this.mutateTree((root) => removeNode(root, id));
      }
    },

    // ---- stored-template content editor --------------------------------------------------------

    openTemplateEditor(name) {
      this.editingTemplateNewKind = null;
      this.editingTemplateNewName = '';
      this.editingTemplate = name;
    },

    async closeTemplateEditor() {
      this.editingTemplate = null;
      this.editingTemplateNewKind = null;
      this.editingTemplateNewName = '';
      await fetchTemplatingConfigMaps(this.$store).catch(() => {});
    },
  },
};
</script>

<template>
  <div
    class="ai-home"
    :class="{ 'ai-home--editing': editing || editingTemplate }"
  >
    <!-- A stored template's ⚙ opens the single-template content editor (source + AI chat + preview). -->
    <HomeTemplateEditor
      v-if="editingTemplate"
      :name="editingTemplate"
      :new-kind="editingTemplateNewKind"
      :new-display-name="editingTemplateNewName"
      @close="closeTemplateEditor"
    />

    <!-- While editing the page splits: the view keeps the full width it will really have, and every
       control lives in the drawer beside it. -->
    <div
      v-else
      class="ai-home__layout"
    >
      <div class="ai-home__main">
        <HomeViewBar
          v-if="loaded && templatingEnabled"
          ref="bar"
          :views="views"
          :active-id="activePanelId"
          :editing="editing"
          :is-new="isNewView"
          :default-id="defaultViewId"
          :dirty="dirty"
          :saving="saving"
          :started-from="startedFrom"
          @select="selectPanel"
          @edit="enterEdit"
          @cancel="cancelEdit"
          @save="save()"
          @save-as-new="saveAsNewView"
          @rename="renameView"
          @rename-start="startRename"
          @new-view="newView"
          @duplicate="duplicateView"
          @set-default="setDefaultView"
          @publish="publishView"
          @delete="deleteView"
        />

        <p
          v-if="error"
          class="ai-home__error"
        >
          {{ error }}
        </p>

        <!-- The active VIEW (or the edit surface). Gate on templatingEnabled so the kill switch
           swaps to stock Rancher live. StockHome shows when nothing is applied. -->
        <div
          v-if="loaded && templatingEnabled && activeView && (editing || hasContent)"
          class="ai-home__surface"
          @mouseleave="ui.hoverId = null"
        >
          <!-- A STOCK view is Rancher's own Home, kept as a tab — nothing to edit. -->
          <StockHome v-if="activeIsStock" />
          <OrganizerNode
            v-else-if="rootOrganizer"
            :key="`${ activePanelId }-${ rootOrganizer.id }`"
            :node="rootOrganizer"
            :editing="editing"
            :selected-id="selectedNodeId"
            :gap="gap"
            is-root
          />
        </div>
        <StockHome v-else-if="loaded" />
      </div>

      <EditViewSidebar
        v-if="editing"
        :view="activeView"
        :selected="selectedNode"
        :is-default="activePanelId === defaultViewId"
        :liz-enabled="lizEnabled"
        :is-stock="activeIsStock"
        :is-new="isNewView"
        :started-from="startedFrom"
        :starting-points="startingPoints"
        @close="cancelEdit"
        @add="addFromCatalog"
        @drag-start="onCatalogDragStart"
        @drag-end="onCatalogDragEnd"
        @start-from="startFrom"
        @set-width="setSelectedWidth"
        @set-height="setSelectedHeight"
        @set-spacing="setSelectedSpacing"
        @set-box="setNodeBox"
        @set-col-span="setSelectedWidth"
        @advanced="ui.showBoxModel = $event"
        @set-gap="setGap"
        @set-name="renameView"
        @set-default="setDefaultView"
        @publish="publishView"
        @delete="deleteView"
        @liz-preview="onLizPreview"
      />
    </div>

    <WidgetSettingsModal
      v-if="settingsNode && settingsNode.type === 'widget'"
      :key="settingsNode.id"
      :widget="settingsNode.widget"
      @done="applySettings"
      @cancel="settingsNodeId = null"
      @remove="removeConfigured"
    />
  </div>
</template>

<style lang="scss" scoped>
.ai-home {
  &--editing {
    min-height: calc(100vh - var(--header-height, 54px));
  }

  // While editing, the page and the controls sit side by side: the view keeps a real, full-width
  // column (so what you see is what it will look like) and every control lives in the drawer.
  &__layout {
    display: block;
  }

  &--editing &__layout {
    align-items: flex-start;
    display:     flex;
  }

  &__main {
    min-width: 0;
  }

  &--editing &__main {
    flex: 1 1 auto;
  }

  // 20px around the grid in BOTH modes, so a view looks the same whether or not you are editing it.
  &__surface {
    padding: 20px;
  }

  &__error {
    color:     var(--error);
    font-size: 13px;
    margin:    8px 20px 0;
  }
}
</style>
