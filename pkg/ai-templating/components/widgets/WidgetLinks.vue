<script>
import CommunityLinks from '@shell/components/CommunityLinks.vue';
import WidgetCard from './WidgetCard.vue';

// LINKS — "Your own list of links".
//
// With links of its own it renders those. With none it falls back to Rancher's community links
// (Docs / Forums / Slack / File an Issue / Get Started / SUSE Application Collection), which are
// already managed by Rancher's ui-* settings — so the default needs no configuration at all and an
// admin who has customised those settings sees their own list here too.
export default {
  name:       'WidgetLinks',
  components: { CommunityLinks, WidgetCard },

  props: {
    widget: {
      type:    Object,
      default: () => ({}),
    },
  },

  computed: {
    links() {
      return (this.widget.links || []).filter((link) => link.label && link.url);
    },
  },
};
</script>

<template>
  <WidgetCard
    v-if="links.length"
    :title="widget.title"
  >
    <ul class="wlinks">
      <li
        v-for="link in links"
        :key="`${ link.label }-${ link.url }`"
      >
        <a
          :href="link.url"
          rel="nofollow noopener noreferrer"
          target="_blank"
        >
          {{ link.label }}
          <i class="icon icon-external-link" />
        </a>
      </li>
    </ul>
  </WidgetCard>

  <!-- Rancher's own links already come in their own box, so they are NOT wrapped in a card — that
     would draw a box inside a box, and this way the widget is pixel-for-pixel the stock Home's. -->
  <CommunityLinks v-else />
</template>

<style lang="scss" scoped>
.wlinks {
  display:        flex;
  flex-direction: column;
  gap:            15px;
  list-style:     none;
  margin:         0;
  padding:        0;

  a {
    align-items: center;
    display:     inline-flex;
    gap:         6px;
  }

  i {
    font-size: 12px;
  }
}

// Match the stock Home, where the box title is 16px and links are 15px apart.
:deep(.community-links h2) {
  font-size: 16px;
}

:deep(.support-link:not(:last-child)) {
  margin-bottom: 15px;
}
</style>
