<script>
import { Checkbox } from '@components/Form/Checkbox';
import { TEMPLATING_CONFIG, CONFIG_ID, isTemplatingEnabled, toggleTemplating } from '../templating/template-engine';

// AI Templating settings — the global kill switch. Always reachable (even when off) so the
// feature can be turned back on. The CR lists (Custom Views / Home Templates) are standard
// Rancher resource lists registered by the product.
export default {
  name:       'AiTemplatingSettings',
  components: { Checkbox },

  async fetch() {
    await this.$store.dispatch('management/find', { type: TEMPLATING_CONFIG, id: CONFIG_ID })
      .catch(() => {});
  },

  data() {
    return { toggling: false };
  },

  computed: {
    enabled() {
      return isTemplatingEnabled(this.$store.getters);
    },
  },

  methods: {
    async onToggle(value) {
      if (this.toggling) {
        return;
      }
      this.toggling = true;

      try {
        const now = await toggleTemplating(this.$store, value);

        this.$store.dispatch('growl/success', {
          title:   'AI templating',
          message: now ? 'Templating enabled.' : 'Templating disabled — showing stock Rancher.',
        }, { root: true });
      } catch (e) {
        this.$store.dispatch('growl/error', {
          title:   'Could not change templating',
          message: e?.message || String(e),
        }, { root: true });
      } finally {
        this.toggling = false;
      }
    },
  },
};
</script>

<template>
  <div class="ai-templating-settings">
    <h1 class="mb-10">
      AI Templating
    </h1>
    <p class="text-muted mb-20">
      Custom views, Home templates and the applied Home are defined by
      <code>templating.rancher.io</code> resources — see <b>Custom Views</b> and
      <b>Home Templates</b> in the nav.
    </p>

    <div
      class="templating-switch"
      :class="{ 'templating-switch--off': !enabled }"
    >
      <Checkbox
        :value="enabled"
        :disabled="toggling"
        label="Custom view templating enabled"
        @update:value="onToggle"
      />
      <p class="text-muted mt-5 mb-0">
        When off, Rancher ignores every CustomView / HomeTemplate and behaves like stock Rancher.
        This page stays available so you can turn it back on.
      </p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.templating-switch {
  border:        1px solid var(--border);
  border-radius: var(--border-radius);
  padding:       12px 16px;
  background:    var(--box-bg);
  max-width:     640px;

  &--off {
    border-color: var(--warning);
  }

  code {
    padding: 1px 4px;
  }
}
</style>
