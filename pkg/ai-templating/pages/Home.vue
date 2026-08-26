<script>
import StockHome from '@shell/pages/home.vue';
import TemplateCode from '../components/TemplateCode.vue';
import {
  HOME_TEMPLATE, TEMPLATING_CONFIG,
  isTemplatingEnabled, appliedHomeTemplateName, homeTemplateSource
} from '../templating/template-engine';

// The extension's Home page (plugin.setHomePage). Resolves the applied HomeTemplate CR and
// renders its runtime-compiled SFC; falls back to the STOCK Rancher Home when off / unset.
//
// Two gotchas this handles:
//  - setHomePage's bare route does NOT run Nuxt-style `async fetch()`, so we load in created().
//  - The management/all() factory getter isn't reliably reactive from a computed here, so we
//    resolve `source` into a DATA property once the CRs are loaded (with a short retry because
//    created() can run before the management store is ready to serve the CRD types).
export default {
  name:       'AiTemplatingHome',
  components: { StockHome, TemplateCode },

  data() {
    return { source: '', loaded: false };
  },

  async created() {
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        await this.$store.dispatch('management/findAll', { type: TEMPLATING_CONFIG });
        const hts = await this.$store.dispatch('management/findAll', { type: HOME_TEMPLATE });
        const g = this.$store.getters;
        const user = await this.$store.dispatch('auth/getUser').catch(() => null);
        const userId = user?.id || g['auth/user']?.id || null;
        const applied = appliedHomeTemplateName(g, userId);
        const src = isTemplatingEnabled(g) ? homeTemplateSource(g, applied) : '';

        // eslint-disable-next-line no-console
        console.log('[ai-home]', {
          attempt, hts: (hts || []).length, applied, srcLen: src.length, enabled: isTemplatingEnabled(g)
        });

        if (src || (hts && hts.length) || attempt >= 4) {
          this.source = src;
          break;
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[ai-home] load error', e?.message || e);
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    this.loaded = true;
  },
};
</script>

<template>
  <TemplateCode
    v-if="source"
    :source="source"
  />
  <StockHome v-else-if="loaded" />
  <div
    v-else
    class="ai-templating-home__loading"
  />
</template>
