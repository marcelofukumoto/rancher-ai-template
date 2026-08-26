<script>
import ResourceTable from '@shell/components/ResourceTable.vue';
import { Checkbox } from '@components/Form/Checkbox';
import { NAME, NAMESPACE, AGE } from '@shell/config/table-headers';
import {
  CUSTOM_VIEW, TEMPLATING_CONFIG, CONFIG_ID, isTemplatingEnabled, toggleTemplating
} from '../templating/template-engine';

// Management list of CustomView CRs + the global kill-switch toggle. This is the control panel
// for the whole feature; it stays reachable even when templating is off so it can be turned
// back on. Rows are real CustomView resources, so their standard row actions work.
export default {
  name:       'CustomViewSources',
  components: { ResourceTable, Checkbox },

  async fetch() {
    this.loading = true;

    try {
      await this.$store.dispatch('management/find', { type: TEMPLATING_CONFIG, id: CONFIG_ID })
        .catch(() => {});

      if (this.schema) {
        await this.$store.dispatch('management/findAll', { type: CUSTOM_VIEW });
      }
    } finally {
      this.loading = false;
    }
  },

  data() {
    return { loading: true, toggling: false };
  },

  computed: {
    enabled() {
      return isTemplatingEnabled(this.$store.getters);
    },

    schema() {
      return this.$store.getters['management/schemaFor'](CUSTOM_VIEW);
    },

    rows() {
      return this.schema ? this.$store.getters['management/all'](CUSTOM_VIEW) : [];
    },

    headers() {
      return [NAME, NAMESPACE, AGE];
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
  <div class="custom-view-sources">
    <h1 class="mb-10">
      Custom View Sources
    </h1>
    <p class="text-muted mb-20">
      <code>CustomView</code> resources (templating.rancher.io) that define custom views. Edit a
      row's YAML to change it — views update after re-entering the product.
    </p>

    <div
      class="templating-switch mb-20"
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

    <ResourceTable
      v-if="schema"
      :schema="schema"
      :rows="rows"
      :headers="headers"
      :loading="loading"
      :namespaced="true"
    />
    <div
      v-else
      class="text-error"
    >
      The CustomView CRD isn't available in this cluster (install the extension's CRDs), or you
      lack permission to list it.
    </div>
  </div>
</template>

<style lang="scss" scoped>
.templating-switch {
  border:        1px solid var(--border);
  border-radius: var(--border-radius);
  padding:       12px 16px;
  background:    var(--box-bg);

  &--off {
    border-color: var(--warning);
  }

  code {
    padding: 1px 4px;
  }
}
</style>
