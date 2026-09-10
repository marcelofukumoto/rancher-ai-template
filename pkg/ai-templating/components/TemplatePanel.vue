<script>
import TemplateCode from './TemplateCode.vue';
import TemplateResourceList from './TemplateResourceList.vue';
import TemplateOverview from './TemplateOverview.vue';
import WidgetBanner from './WidgetBanner.vue';
import WidgetLinks from './WidgetLinks.vue';
import WidgetClusterList from './WidgetClusterList.vue';
import { templateByName } from '../templating/template-engine';

// Renders ONE template as a dashboard panel, regardless of kind:
//   - code template → a runtime-compiled .vue (TemplateCode)
//   - JSON template → its declarative widgets, each dispatched to a widget renderer
// Pass `name` to resolve a stored template, or `source`/`widgets` directly (used for live preview
// of an unsaved draft).
const WIDGETS = {
  banner:       'WidgetBanner',
  links:        'WidgetLinks',
  clusterList:  'WidgetClusterList',
  resourceList: 'TemplateResourceList',
  overview:     'TemplateOverview',
};

export default {
  name:       'TemplatePanel',
  components: {
    TemplateCode, TemplateResourceList, TemplateOverview, WidgetBanner, WidgetLinks, WidgetClusterList
  },

  props: {
    name: {
      type:    String,
      default: '',
    },
    // Direct overrides for previewing a draft (bypass the stored template).
    source: {
      type:    String,
      default: null,
    },
    widgets: {
      type:    Array,
      default: null,
    },
  },

  computed: {
    resolved() {
      if (this.source !== null || this.widgets !== null) {
        return {
          kind:    this.source ? 'code' : 'json',
          source:  this.source || '',
          widgets: this.widgets || [],
        };
      }

      if (this.name) {
        return templateByName(this.$store.getters, this.name);
      }

      return {
        kind: 'missing', source: '', widgets: []
      };
    },
  },

  methods: {
    widgetComp(type) {
      return WIDGETS[type] || null;
    },
  },
};
</script>

<template>
  <div class="tpl-panel">
    <!-- Code template: a runtime-compiled .vue owns the panel. -->
    <TemplateCode
      v-if="resolved.kind === 'code' && resolved.source"
      :source="resolved.source"
    />

    <!-- JSON template: render each declarative widget. -->
    <template v-else-if="resolved.kind === 'json'">
      <template
        v-for="(w, i) in resolved.widgets"
        :key="i"
      >
        <component
          :is="widgetComp(w.type)"
          v-if="widgetComp(w.type)"
          :widget="w"
        />
        <div
          v-else
          class="text-muted tpl-panel__msg"
        >
          Unsupported widget type: {{ w.type }}
        </div>
      </template>
    </template>

    <div
      v-else
      class="text-muted tpl-panel__msg"
    >
      Template "{{ name }}" not found.
    </div>
  </div>
</template>

<style lang="scss" scoped>
.tpl-panel {
  height: 100%;

  &__msg {
    padding: 12px;
  }
}
</style>
