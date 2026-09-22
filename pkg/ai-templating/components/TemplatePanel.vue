<script setup lang="ts">
import { computed, type Component } from 'vue';
import { useStore } from 'vuex';
import TemplateResourceList from './TemplateResourceList.vue';
import WidgetOverview from './widgets/WidgetOverview.vue';
import WidgetBanner from './widgets/WidgetBanner.vue';
import WidgetLinks from './widgets/WidgetLinks.vue';
import WidgetClusterTable from './widgets/WidgetClusterTable.vue';
import { templateByName } from '../templating/template-engine';
import type { TemplateWidget } from '../templating/types';

const WIDGETS: Record<string, Component> = {
  banner:       WidgetBanner,
  links:        WidgetLinks,
  clusterList:  WidgetClusterTable,
  resourceList: TemplateResourceList,
  overview:     WidgetOverview,
};

const props = defineProps<{
  /** Name of a stored template ConfigMap. */
  name?: string;
  /** Widgets to render directly, bypassing storage — used to preview an unsaved draft. */
  widgets?: TemplateWidget[] | null;
}>();

const store = useStore();

const resolved = computed(() => {
  if (props.widgets) {
    return { kind: 'json', widgets: props.widgets };
  }

  return props.name ? templateByName(store.getters, props.name) : { kind: 'missing', widgets: [] };
});

const widgetComp = (type: string): Component | null => WIDGETS[type] || null;
</script>

<template>
  <div class="tpl-panel">
    <template v-if="resolved.kind === 'json'">
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
      v-else-if="resolved.kind === 'code'"
      class="text-muted tpl-panel__msg"
    >
      "{{ name }}" is a code template. Those are no longer supported — rebuild it as widgets.
    </div>

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
