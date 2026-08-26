<script>
import TemplateCode from '../components/TemplateCode.vue';
import HomeConfigChat from '../components/HomeConfigChat.vue';
import { CUSTOM_VIEW, TEMPLATE_NAMESPACE, WHITE_CANVAS_NAME } from '../templating/template-engine';

const STARTER_SFC = `<script>
export default { data() { return { count: 0 }; } };
<\/script>
<template>
  <div style="padding: 24px">
    <h1>Blank Canvas</h1>
    <p>A live scratchpad. Edit on the left; it recompiles here.</p>
    <button class="btn role-primary" @click="count++">Clicked {{ count }}</button>
  </div>
<\/template>`;

// The Blank Canvas — a fast live-authoring scratchpad bound to ONE CustomView CR
// (default/white-canvas, kind code). Edit the SFC (or ask the AI); it recompiles live and Save
// persists to the CR. Ported from templating-for-ai.
const CANVAS_PREAMBLE =
`For this request, edit ONLY the CustomView custom resource (apiVersion templating.rancher.io/v1alpha1, kind CustomView) named "__CM_NAME__" in namespace "default". Keep spec.kind as "code" and put the full Vue SFC in spec.source. Do not edit any other resource.

`;

export default {
  name:       'WhiteCanvas',
  components: { TemplateCode, HomeConfigChat },

  data() {
    return {
      draft:          '',
      debouncedDraft: '',
      saving:         false,
      saveError:      '',
      loaded:         false,
      debounceTimer:  null,
      canvasPreamble: CANVAS_PREAMBLE,
      editorWidth:    42,
    };
  },

  async created() {
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        const rows = await this.$store.dispatch('management/findAll', { type: CUSTOM_VIEW });
        const cr = this.canvasCR;

        if (cr || (rows && rows.length) || attempt >= 4) {
          this.draft = cr?.spec?.source || STARTER_SFC;
          this.debouncedDraft = this.draft;
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
    canvasCR() {
      return this.$store.getters['management/byId'](CUSTOM_VIEW, `${ TEMPLATE_NAMESPACE }/${ WHITE_CANVAS_NAME }`) ||
        (this.$store.getters['management/all'](CUSTOM_VIEW) || []).find((c) => c.metadata?.name === WHITE_CANVAS_NAME);
    },

    canvasName() {
      return WHITE_CANVAS_NAME;
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
    // Drag the divider to resize the editor column (clamped 20–75%). Pointer capture keeps move/up
    // firing over the live preview and always releases, so a missed mouseup (preview re-render or a
    // link navigating mid-drag) can't leave a global listener that resizes on every mouse move.
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

    async save() {
      this.saving = true;
      this.saveError = '';

      try {
        const cr = this.canvasCR;

        if (cr) {
          cr.spec = {
            ...(cr.spec || {}), kind: 'code', source: this.draft
          };
          await cr.save();
        } else {
          const created = await this.$store.dispatch('management/create', {
            type:     CUSTOM_VIEW,
            metadata: { name: WHITE_CANVAS_NAME, namespace: TEMPLATE_NAMESPACE },
            spec:     {
              kind: 'code', meta: { id: WHITE_CANVAS_NAME, name: 'Blank Canvas' }, source: this.draft
            },
          });

          await created.save();
        }

        this.$store.dispatch('growl/success', { title: 'Blank Canvas', message: 'Saved.' }, { root: true });
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
  <div class="ai-canvas">
    <div
      ref="split"
      class="ai-canvas__split"
    >
      <div
        class="ai-canvas__editor"
        :style="{ width: editorWidth + '%' }"
      >
        <div class="ai-canvas__bar">
          <b>Blank Canvas</b>
          <button
            class="btn btn-sm role-primary"
            :disabled="saving"
            @click="save"
          >
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
        <textarea
          v-model="draft"
          class="ai-canvas__code"
          spellcheck="false"
        />
        <div
          v-if="saveError"
          class="text-error ai-canvas__err"
        >
          {{ saveError }}
        </div>
        <div class="ai-canvas__chat">
          <HomeConfigChat
            agent="template-white-canvas-builder"
            :preamble="canvasPreamble"
            :config-map-name="canvasName"
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
  // Our root div is the product's `.outlet`, which core forces to `flex-direction: column`. Keep
  // it a column that fills the space under the app header and doesn't scroll the page; the flex
  // ROW lives in the inner `&__split` so it isn't fighting the outlet rule.
  display:        flex;
  flex-direction: column;
  height:         calc(100vh - var(--header-height, 54px));
  overflow:       hidden;

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
    // width comes from the inline editorWidth%; don't let preview content shrink it past that —
    // the preview (min-width:0, overflow:auto) absorbs the remaining space and scrolls instead.
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

  &__err {
    padding: 6px 10px;
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
