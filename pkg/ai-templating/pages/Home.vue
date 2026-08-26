<script>
import StockHome from '@shell/pages/home.vue';
import { RcButton } from '@components/RcButton';
import TemplateCode from '../components/TemplateCode.vue';
import HomeConfigChat from '../components/HomeConfigChat.vue';
import {
  HOME_TEMPLATE, TEMPLATING_CONFIG, TEMPLATE_NAMESPACE,
  isTemplatingEnabled, appliedHomeTemplateName, homeTemplateSource
} from '../templating/template-engine';

// The extension's Home page (registered under the home layout in index.ts). Renders the applied
// HomeTemplate CR (runtime-compiled), with an in-page editor: a live-editable draft of the SFC
// (with live preview) + the AI chat, and Save persists to the HomeTemplate CR. Falls back to the
// stock Rancher Home when off / unset.
//
// CRs are loaded in created() (setHomePage/router routes skip Nuxt fetch()), and `source` is
// resolved into a data property (the management/all factory getter isn't reactive from a computed).
export default {
  name:       'AiTemplatingHome',
  components: {
    StockHome, RcButton, TemplateCode, HomeConfigChat
  },

  data() {
    return {
      source:         '',
      appliedName:    null,
      loaded:         false,
      showEditor:     false,
      draft:          '',
      debouncedDraft: '',
      saving:         false,
      saveError:      '',
      debounceTimer:  null,
    };
  },

  async created() {
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        await this.$store.dispatch('management/findAll', { type: TEMPLATING_CONFIG });
        const hts = await this.$store.dispatch('management/findAll', { type: HOME_TEMPLATE });
        const g = this.$store.getters;

        this.appliedName = appliedHomeTemplateName(g, null);

        const src = isTemplatingEnabled(g) ? homeTemplateSource(g, this.appliedName) : '';

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
    previewSource() {
      return this.showEditor ? this.debouncedDraft : this.source;
    },

    appliedCR() {
      if (!this.appliedName) {
        return null;
      }

      const byId = this.$store.getters['management/byId'](HOME_TEMPLATE, `${ TEMPLATE_NAMESPACE }/${ this.appliedName }`);

      return byId || (this.$store.getters['management/all'](HOME_TEMPLATE) || [])
        .find((h) => h.metadata?.name === this.appliedName);
    },
  },

  watch: {
    draft(val) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.debouncedDraft = val;
      }, 300);
    },

    // When the chat (or another editor) saves the CR, refresh the editor + preview.
    source(val) {
      if (!this.showEditor) {
        this.draft = val;
        this.debouncedDraft = val;
      }
    },
  },

  methods: {
    toggleEditor() {
      this.showEditor = !this.showEditor;

      if (this.showEditor) {
        this.draft = this.source;
        this.debouncedDraft = this.source;
        this.saveError = '';
      }
    },

    async saveHome() {
      const cr = this.appliedCR;

      if (!cr) {
        this.saveError = 'No applied HomeTemplate to save to.';

        return;
      }

      this.saving = true;
      this.saveError = '';

      try {
        cr.spec = { ...(cr.spec || {}), source: this.draft };
        await cr.save();
        this.source = this.draft;

        this.$store.dispatch('growl/success', {
          title:   'Home template',
          message: `Saved "${ this.appliedName }".`,
        }, { root: true });
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
  <div class="ai-home">
    <RcButton
      v-if="loaded && (source || appliedName)"
      class="ai-home__toggle"
      size="small"
      @click="toggleEditor"
    >
      {{ showEditor ? 'Close editor' : 'Edit Home' }}
    </RcButton>

    <!-- Editor: draft + AI chat on the left, live preview on the right. -->
    <div
      v-if="showEditor"
      class="ai-home__split"
    >
      <div class="ai-home__editor">
        <div class="ai-home__editbar">
          <span class="text-muted">
            Editing <b>{{ appliedName || '(none)' }}</b>
          </span>
          <RcButton
            size="small"
            :disabled="saving"
            @click="saveHome"
          >
            Save
          </RcButton>
        </div>
        <textarea
          v-model="draft"
          class="ai-home__code"
          spellcheck="false"
        />
        <div
          v-if="saveError"
          class="text-error ai-home__err"
        >
          {{ saveError }}
        </div>
        <div class="ai-home__chat">
          <HomeConfigChat :config-map-name="appliedName" />
        </div>
      </div>
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

    <!-- Normal render. -->
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
  position: relative;

  &__toggle {
    position: absolute;
    top:      12px;
    right:    16px;
    z-index:  10;
  }

  &__split {
    display: flex;
    gap:     12px;
    height:  calc(100vh - 100px);
    padding: 12px;
  }

  &__editor {
    display:        flex;
    flex-direction: column;
    width:          42%;
    min-width:      360px;
    border:         1px solid var(--border);
    border-radius:  var(--border-radius);
    overflow:       hidden;
  }

  &__editbar {
    display:         flex;
    align-items:     center;
    justify-content: space-between;
    padding:         6px 10px;
    background:      var(--box-bg);
    border-bottom:   1px solid var(--border);
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
    border:        1px solid var(--border);
    border-radius: var(--border-radius);
    overflow:      auto;
  }
}
</style>
