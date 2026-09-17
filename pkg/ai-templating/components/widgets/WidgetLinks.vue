<script>
import { fetchLinks } from '@shell/config/home-links';
import { processLink } from '@shell/plugins/clean-html';
import { isRancherPrime } from '@shell/config/version';
import { MANAGEMENT } from '@shell/config/types';
import { SETTING } from '@shell/config/settings';
import WidgetCard from './WidgetCard.vue';

// LINKS — "Your own list of links".
//
// With links of its own it renders those. With none it falls back to Rancher's — Docs / Forums /
// Slack / File an Issue / Get Started / SUSE Application Collection — read from the same
// `ui-custom-links` setting Rancher's own Home reads, so an admin who has customised those links
// sees their list here too.
//
// It reads that setting DIRECTLY rather than embedding Rancher's CommunityLinks component, because
// that component brings its own titled box: a box inside this widget's box, with a different title
// size and a different inset from every other widget on the grid.
export default {
  name:       'WidgetLinks',
  components: { WidgetCard },

  props: {
    widget: {
      type:    Object,
      default: () => ({}),
    },
  },

  async fetch() {
    try {
      this.rancherLinks = await fetchLinks(this.$store, this.hasSupport, false, (key) => this.t(key));
    } catch (e) {
      this.rancherLinks = {};
    }
  },

  data() {
    return { rancherLinks: {} };
  },

  computed: {
    hasSupport() {
      return isRancherPrime() || this.$store.getters['management/byId'](MANAGEMENT.SETTING, SETTING.SUPPORTED)?.value === 'true';
    },

    title() {
      return this.widget.title || this.t('customLinks.displayTitle');
    },

    // The widget's own links win; otherwise Rancher's custom links, then its enabled defaults.
    links() {
      const own = (this.widget.links || []).filter((link) => link.label && link.url);

      if (own.length) {
        return own.map((link) => ({ label: link.label, url: link.url }));
      }

      return [...(this.rancherLinks.custom || []), ...(this.rancherLinks.defaults || []).filter((link) => link.enabled)]
        .map((link) => ({ label: link.label, url: processLink(link.value) }));
    },
  },

  methods: {
    t(key, args) {
      return this.$store.getters['i18n/t'](key, args);
    },

    // A relative link stays in the app; everything else opens away from it.
    isInternal(url) {
      return `${ url }`.startsWith('/');
    },
  },
};
</script>

<template>
  <WidgetCard
    :title="title"
    :empty="!links.length"
    empty-text="No links yet — add some in this widget's settings."
  >
    <ul class="wlinks">
      <li
        v-for="(link, i) in links"
        :key="`${ link.label }-${ i }`"
      >
        <router-link
          v-if="isInternal(link.url)"
          :to="link.url"
        >
          {{ link.label }}
        </router-link>
        <a
          v-else
          :href="link.url"
          rel="nofollow noopener noreferrer"
          target="_blank"
        >
          {{ link.label }}
        </a>
      </li>
    </ul>
  </WidgetCard>
</template>

<style lang="scss" scoped>
// 12px apart, the spacing the design gives this card's content.
.wlinks {
  display:        flex;
  flex-direction: column;
  gap:            12px;
  list-style:     none;
  margin:         0;
  padding:        0;

  a {
    align-items: center;
    display:     inline-flex;
    gap:         6px;
  }
}
</style>
