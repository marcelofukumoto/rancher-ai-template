<script>
import TemplateCode from '../components/TemplateCode.vue';
import HomeConfigChat from '../components/HomeConfigChat.vue';
import PlacementTree from '../components/PlacementTree.vue';
import {
  CUSTOM_VIEW, TEMPLATE_NAMESPACE, BLANK_CANVAS_NAME, CLUSTER_CANVAS_NAME, PRODUCT_NAME, EXPLORER_PRODUCT,
  allCustomViews, saveCustomView
} from '../templating/template-engine';

const MGMT_CLUSTER = 'management.cattle.io.cluster';

// A Global view runs on the (cluster-less) canvas, so it reads the MANAGEMENT store.
const GLOBAL_STARTER = `<script>
import ResourceTable from '@shell/components/ResourceTable';
export default {
  components: { ResourceTable },
  created() {
    this.$store.dispatch('management/findAll', { type: 'management.cattle.io.cluster' })
      .then((rows) => { this.rows = rows; }).catch(() => { this.rows = []; });
  },
  data() { return { rows: [] }; },
  computed: { schema() { return this.$store.getters['management/schemaFor']('management.cattle.io.cluster'); } },
};
<\/script>
<template>
  <div style="padding: 16px">
    <h1 class="mb-20">Clusters (custom view)</h1>
    <ResourceTable v-if="schema" :schema="schema" :rows="rows" :table-actions="false" :row-actions="false" />
  </div>
<\/template>`;

// A Cluster view runs inside a cluster, so it reads the CLUSTER store.
const CLUSTER_STARTER = `<script>
import ResourceTable from '@shell/components/ResourceTable';
export default {
  components: { ResourceTable },
  created() {
    this.$store.dispatch('cluster/findAll', { type: 'pod' })
      .then((rows) => { this.rows = rows; }).catch(() => { this.rows = []; });
  },
  data() { return { rows: [] }; },
  computed: { schema() { return this.$store.getters['cluster/schemaFor']('pod'); } },
};
<\/script>
<template>
  <div style="padding: 16px">
    <h1 class="mb-20">Pods (custom view)</h1>
    <ResourceTable v-if="schema" :schema="schema" :rows="rows" :table-actions="false" :row-actions="false" />
  </div>
<\/template>`;

// The Blank Canvas — an interactive Custom View editor. Load any CustomView CR, edit its SFC live
// (with an AI chat), choose its type (Global vs Cluster) and where it shows via a drag-and-drop
// placement tree, then Save back to the CR. The `blank-canvas` CR is just the default scratch doc.
const CANVAS_PREAMBLE =
`For this request, edit ONLY the CustomView custom resource (apiVersion templating.rancher.io/v1alpha1, kind CustomView) named "__CM_NAME__" in namespace "default". Keep spec.kind as "code" and put the full Vue SFC in spec.source. Do not edit any other resource.

`;

function slugify(s) {
  return `${ s }`.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default {
  name:       'BlankCanvas',
  components: {
    TemplateCode, HomeConfigChat, PlacementTree
  },

  data() {
    return {
      selectedName:     '',
      isNew:            false,
      draft:            '',
      debouncedDraft:   '',
      scope:            '', // '' = global, 'cluster' = cluster-scoped
      placement:        {}, // { group, groupLabel, weight, itemWeight }
      previewClusterId: '',
      navRefresh:       0, // bumped to rebuild the placement tree after loadCluster
      saving:           false,
      saveError:        '',
      status:           '',
      loaded:           false,
      debounceTimer:    null,
      canvasPreamble:   CANVAS_PREAMBLE,
      editorWidth:      42,
      showPlacement:    true,
    };
  },

  async created() {
    // Load custom views + the cluster list (for the preview picker), retrying until schemas exist.
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        await this.$store.dispatch('management/findAll', { type: CUSTOM_VIEW });
        await this.$store.dispatch('management/findAll', { type: MGMT_CLUSTER }).catch(() => {});

        if (this.views.length || attempt >= 4) {
          break;
        }
      } catch (e) { /* retry */ }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Inside a cluster, default to the cluster scratch (cluster type, previews live data); on the
    // global canvas, default to the global scratch.
    if (this.inCluster) {
      this.scope = 'cluster';
      this.previewClusterId = this.routeCluster;
    }

    const scratch = this.inCluster ? CLUSTER_CANVAS_NAME : BLANK_CANVAS_NAME;

    if (this.crByName(scratch)) {
      this.selectView(scratch);
    } else {
      this.selectedName = scratch;
      this.isNew = true;
      this.draft = this.inCluster ? CLUSTER_STARTER : GLOBAL_STARTER;
      this.debouncedDraft = this.draft;
    }

    this.loaded = true;
  },

  beforeUnmount() {
    clearTimeout(this.debounceTimer);
  },

  computed: {
    // When the canvas is opened inside a cluster (explorer route), the cluster store is loaded, so
    // cluster-scoped views preview against REAL data. '_' / blank = the global canvas.
    routeCluster() {
      return this.$route?.params?.cluster || '';
    },

    inCluster() {
      const c = this.routeCluster;

      return !!c && c !== '_' && c !== 'local-blank' && c !== 'BLANK_CLUSTER';
    },

    views() {
      return allCustomViews(this.$store.getters);
    },

    viewOptions() {
      const opts = this.views.map((cr) => ({
        value: cr.metadata?.name,
        label: cr.spec?.meta?.name || cr.metadata?.name,
      }));

      if (this.isNew && this.selectedName && !opts.find((o) => o.value === this.selectedName)) {
        opts.unshift({ value: this.selectedName, label: `${ this.selectedName } (new)` });
      }

      return opts;
    },

    clusters() {
      return (this.$store.getters['management/all'](MGMT_CLUSTER) || [])
        .map((c) => ({ value: c.id, label: c.nameDisplay || c.metadata?.name || c.id }));
    },

    placementProduct() {
      return this.scope === 'cluster' ? EXPLORER_PRODUCT : PRODUCT_NAME;
    },

    placementClusterId() {
      return this.scope === 'cluster' ? (this.previewClusterId || '_') : '_';
    },

    viewLabel() {
      return this.selectedName || 'This view';
    },
  },

  watch: {
    draft(val) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.debouncedDraft = val;
      }, 300);
    },

    previewClusterId() {
      // Rebuild the placement tree against the newly-selected cluster's explorer nav.
      this.navRefresh++;
    },
  },

  methods: {
    crByName(name) {
      return this.$store.getters['management/byId'](CUSTOM_VIEW, `${ TEMPLATE_NAMESPACE }/${ name }`) ||
        this.views.find((c) => c.metadata?.name === name);
    },

    selectView(name) {
      if (!name) {
        return;
      }

      this.selectedName = name;
      this.isNew = false;
      this.status = '';
      this.saveError = '';

      const spec = this.crByName(name)?.spec || {};
      const nav = spec.nav || {};

      this.draft = spec.source || '';
      this.debouncedDraft = this.draft;
      this.scope = nav.scope === 'cluster' ? 'cluster' : '';
      this.placement = {
        group:      nav.group || '',
        groupLabel: nav.groupLabel || null,
        weight:     typeof nav.weight === 'number' ? nav.weight : null,
        itemWeight: typeof nav.itemWeight === 'number' ? nav.itemWeight : null,
      };

      if (this.scope === 'cluster') {
        this.ensureCluster();
      }
    },

    newView() {
      // eslint-disable-next-line no-alert
      const raw = window.prompt('New custom view name (kebab-case):', '');
      const name = slugify(raw || '');

      if (!name) {
        return;
      }

      this.selectedName = name;
      this.isNew = true;
      this.status = '';
      this.saveError = '';
      this.placement = {};
      this.draft = this.scope === 'cluster' ? CLUSTER_STARTER : GLOBAL_STARTER;
      this.debouncedDraft = this.draft;
    },

    setScope(scope) {
      if (this.scope === scope) {
        return;
      }

      this.scope = scope;

      if (scope === 'cluster') {
        this.ensureCluster();
      }
    },

    ensureCluster() {
      if (!this.previewClusterId) {
        this.previewClusterId = this.clusters.find((c) => c.value === 'local')?.value || this.clusters[0]?.value || 'local';
      }

      // Rebuild the placement tree for this cluster's explorer nav. We deliberately do NOT call the
      // global `loadCluster` here — it hijacks the whole app (sets the current cluster, resets the
      // cluster store) and would tear down this global page. Live cluster DATA is seen by opening the
      // view inside the cluster (openInCluster), which runs it on the real cluster route.
      this.navRefresh++;
    },

    // Jump to the saved cluster-scoped view on its real cluster route, where it renders with live
    // cluster data. Requires the view to be saved (so its nav entry/route exists).
    openInCluster() {
      if (!this.selectedName || !this.previewClusterId) {
        return;
      }

      this.$router.push({
        name:   'ai-templating-cluster-view',
        params: { cluster: this.previewClusterId, pageId: this.selectedName },
      }).catch(() => {});
    },

    async saveView() {
      if (!this.selectedName) {
        return;
      }

      this.saving = true;
      this.saveError = '';
      this.status = '';

      try {
        await saveCustomView(this.$store, {
          name:       this.selectedName,
          source:     this.draft,
          kind:       'code',
          scope:      this.scope || undefined,
          group:      this.placement.group || undefined,
          groupLabel: this.placement.groupLabel || undefined,
          weight:     typeof this.placement.weight === 'number' ? this.placement.weight : undefined,
          itemWeight: typeof this.placement.itemWeight === 'number' ? this.placement.itemWeight : undefined,
        });

        await this.$store.dispatch('management/findAll', { type: CUSTOM_VIEW, opt: { force: true } });
        this.isNew = false;
        this.status = this.scope === 'cluster' ? 'Saved — added to the cluster navbar.' : 'Saved — added to the AI Templating nav.';
      } catch (e) {
        this.saveError = e?.message || String(e);
      } finally {
        this.saving = false;
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
  },
};
</script>

<template>
  <div class="ai-canvas">
    <!-- Toolbar: load / new / save, type toggle, preview cluster -->
    <div class="ai-canvas__toolbar">
      <label class="ai-canvas__lbl">View</label>
      <select
        class="ai-canvas__select"
        :value="selectedName"
        @change="selectView($event.target.value)"
      >
        <option
          v-for="o in viewOptions"
          :key="o.value"
          :value="o.value"
        >
          {{ o.label }}
        </option>
      </select>
      <button
        class="btn btn-sm role-secondary"
        @click="newView"
      >
        New
      </button>
      <button
        class="btn btn-sm role-primary"
        :disabled="saving"
        @click="saveView"
      >
        {{ saving ? 'Saving…' : 'Save' }}
      </button>

      <span class="ai-canvas__sep" />

      <label class="ai-canvas__lbl">Type</label>
      <div class="ai-canvas__toggle">
        <button
          class="btn btn-sm"
          :class="scope === '' ? 'role-primary' : 'role-secondary'"
          @click="setScope('')"
        >
          Global
        </button>
        <button
          class="btn btn-sm"
          :class="scope === 'cluster' ? 'role-primary' : 'role-secondary'"
          @click="setScope('cluster')"
        >
          Cluster
        </button>
      </div>

      <template v-if="scope === 'cluster'">
        <label class="ai-canvas__lbl">Cluster</label>
        <select
          v-model="previewClusterId"
          class="ai-canvas__select"
          :disabled="inCluster"
          :title="inCluster ? 'Editing inside this cluster — preview shows live data' : ''"
        >
          <option
            v-for="c in clusters"
            :key="c.value"
            :value="c.value"
          >
            {{ c.label }}
          </option>
        </select>
        <span
          v-if="inCluster"
          class="text-success ai-canvas__status"
        >live preview</span>
        <button
          v-else
          class="btn btn-sm role-secondary"
          :disabled="isNew"
          title="Open the saved view inside the cluster to see it with live data"
          @click="openInCluster"
        >
          Open in cluster ↗
        </button>
      </template>

      <span
        v-if="status"
        class="text-success ai-canvas__status"
      >{{ status }}</span>
      <span
        v-if="saveError"
        class="text-error ai-canvas__status"
      >{{ saveError }}</span>
    </div>

    <!-- Placement (collapsible) -->
    <div class="ai-canvas__placement">
      <button
        class="ai-canvas__phead"
        @click="showPlacement = !showPlacement"
      >
        {{ showPlacement ? '▾' : '▸' }} Placement — drag “{{ viewLabel }}” into the nav
      </button>
      <PlacementTree
        v-if="showPlacement"
        :product="placementProduct"
        :cluster-id="placementClusterId"
        :view-name="selectedName"
        :view-label="viewLabel"
        :refresh-key="navRefresh"
        :model-value="placement"
        @update:model-value="placement = $event"
      />
    </div>

    <!-- Split editor -->
    <div
      ref="split"
      class="ai-canvas__split"
    >
      <div
        class="ai-canvas__editor"
        :style="{ width: editorWidth + '%' }"
      >
        <div class="ai-canvas__bar">
          <b>Source</b>
        </div>
        <textarea
          v-model="draft"
          class="ai-canvas__code"
          spellcheck="false"
        />
        <div class="ai-canvas__chat">
          <HomeConfigChat
            agent="template-custom-view-code-builder"
            persona-label="Custom View Builder"
            :preamble="canvasPreamble"
            :config-map-name="selectedName"
          />
        </div>
      </div>
      <div
        class="ai-canvas__resizer"
        title="Drag to resize"
        @pointerdown="startResize"
      />
      <div class="ai-canvas__preview">
        <TemplateCode
          v-if="debouncedDraft"
          :key="debouncedDraft.length"
          :source="debouncedDraft"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ai-canvas {
  // Our root div is the product's `.outlet`, which core forces to `flex-direction: column`. Fill the
  // space under the app header and don't scroll the page; the split scrolls internally.
  display:        flex;
  flex-direction: column;
  height:         calc(100vh - var(--header-height, 54px));
  overflow:       hidden;

  &__toolbar {
    display:       flex;
    align-items:   center;
    gap:           8px;
    flex-wrap:     wrap;
    padding:       8px 12px;
    border-bottom: 1px solid var(--border);
    background:    var(--box-bg);
    flex:          0 0 auto;
  }

  &__lbl {
    margin: 0;
    color:  var(--muted);
  }

  &__select {
    height:        30px;
    border:        1px solid var(--border);
    border-radius: var(--border-radius);
    background:    var(--body-bg);
    color:         var(--body-text);
    padding:       0 8px;
    max-width:     240px;
  }

  &__toggle {
    display: inline-flex;
    gap:     2px;
  }

  &__sep {
    width:      1px;
    height:     22px;
    background: var(--border);
    margin:     0 4px;
  }

  &__status {
    margin-left: 4px;
  }

  &__placement {
    flex:          0 0 auto;
    padding:       8px 12px;
    border-bottom: 1px solid var(--border);
    max-height:    45%;
    overflow:      auto;
  }

  &__phead {
    background:  transparent;
    border:      none;
    color:       var(--body-text);
    font-weight: 600;
    cursor:      pointer;
    padding:     0 0 6px 0;
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

  &__bar {
    display:         flex;
    align-items:     center;
    justify-content: space-between;
    padding:         6px 10px;
    background:      var(--box-bg);
    border-bottom:   1px solid var(--border);
  }

  &__code {
    flex:        1 1 auto;
    min-height:  160px;
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
