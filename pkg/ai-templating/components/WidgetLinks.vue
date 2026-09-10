<script>
import CommunityLinks from '@shell/components/CommunityLinks.vue';

// Links widget (JSON template building block). It renders the stock CommunityLinks box exactly as
// the real Home does — Docs / Forums / Slack / File an Issue / Get Started / SUSE Application
// Collection. There is deliberately NO configuration: those links are already managed by Rancher
// itself (the ui-* settings), so there is nothing useful to override here.
//
// Widget spec:
//   { type: 'links' }
export default {
  name:       'WidgetLinks',
  components: { CommunityLinks },

  props: {
    widget: {
      type:    Object,
      default: () => ({}),
    },
  },
};
</script>

<template>
  <div class="wl">
    <CommunityLinks />
  </div>
</template>

<style lang="scss" scoped>
// Match the stock Home: box titles are 16px there (a page-level rule the panel doesn't inherit), and
// links have a 15px gap.
.wl {
  :deep(h2) {
    font-size: 16px;
  }

  :deep(.support-link:not(:last-child)) {
    margin-bottom: 15px;
  }
}
</style>
