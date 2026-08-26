<script>
import StockHome from '@shell/pages/home.vue';
import TemplateCode from '../components/TemplateCode.vue';
import {
  HOME_TEMPLATE, TEMPLATING_CONFIG, CONFIG_ID,
  isTemplatingEnabled, appliedHomeTemplateName, homeTemplateSource
} from '../templating/template-engine';

// The extension's Home page (plugin.setHomePage). Resolves the applied HomeTemplate CR and
// renders its runtime-compiled SFC. Falls back to the STOCK Rancher Home when templating is
// off or no template is applied — so the kill switch behaves like normal Rancher.
export default {
  name:       'AiTemplatingHome',
  components: { StockHome, TemplateCode },

  async fetch() {
    try {
      await this.$store.dispatch('management/find', { type: TEMPLATING_CONFIG, id: CONFIG_ID })
        .catch(() => {});

      if (this.$store.getters['management/schemaFor'](HOME_TEMPLATE)) {
        await this.$store.dispatch('management/findAll', { type: HOME_TEMPLATE }).catch(() => {});
      }

      const user = await this.$store.dispatch('auth/getUser').catch(() => null);

      this.userId = user?.id || this.$store.getters['auth/user']?.id || null;
    } catch (e) { /* fall back to stock Home */ }
  },

  data() {
    return { userId: null };
  },

  computed: {
    templatingEnabled() {
      return isTemplatingEnabled(this.$store.getters);
    },

    appliedName() {
      return appliedHomeTemplateName(this.$store.getters, this.userId);
    },

    source() {
      if (!this.templatingEnabled) {
        return '';
      }

      return homeTemplateSource(this.$store.getters, this.appliedName);
    },
  },
};
</script>

<template>
  <TemplateCode
    v-if="source"
    :source="source"
  />
  <StockHome v-else />
</template>
