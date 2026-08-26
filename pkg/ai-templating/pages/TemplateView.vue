<script>
import { getPageRef } from '../templating/template-engine';
import TemplateResourceList from '../components/TemplateResourceList.vue';
import TemplateOverview from '../components/TemplateOverview.vue';
import TemplateCode from '../components/TemplateCode.vue';

// The single generic "engine mount" page. The :pageId route param selects which page to
// render; the page + its parent template come from the runtime registry (loadCustomViews).
export default {
  name:       'TemplateView',
  components: {
    TemplateResourceList, TemplateOverview, TemplateCode
  },

  computed: {
    pageRef() {
      return getPageRef(this.$route.params.pageId);
    },

    template() {
      return this.pageRef?.template;
    },

    page() {
      return this.pageRef?.page;
    },

    widgets() {
      return this.page?.widgets || [];
    },
  },

  methods: {
    componentForWidget(widget) {
      switch (widget.type) {
      case 'resourceList':
        return 'TemplateResourceList';
      case 'overview':
        return 'TemplateOverview';
      default:
        return null;
      }
    },
  },
};
</script>

<template>
  <div class="template-page">
    <template v-if="page">
      <h1 class="mb-20">
        {{ page.name }}
        <span class="text-muted template-page__source">— {{ template.metadata.name }}</span>
      </h1>

      <!-- Code view: a runtime-compiled .vue owns the whole page. -->
      <TemplateCode
        v-if="page.source"
        :key="page.id"
        :source="page.source"
      />

      <!-- Data view: render each JSON widget. -->
      <template
        v-for="(widget, i) in widgets"
        v-else
        :key="`${ page.id }:${ i }`"
      >
        <component
          :is="componentForWidget(widget)"
          v-if="componentForWidget(widget)"
          :widget="widget"
        />
        <div
          v-else
          class="text-muted"
        >
          Unsupported widget type: {{ widget.type }}
        </div>
      </template>
    </template>

    <div
      v-else
      class="text-muted"
    >
      No custom view found for "{{ $route.params.pageId }}".
    </div>
  </div>
</template>

<style lang="scss" scoped>
.template-page {
  &__source {
    font-size: 0.7em;
  }
}
</style>
