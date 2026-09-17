<script>
import WidgetCard from './WidgetCard.vue';
import rows from './rows-mixin';
import { groupRows } from '../../templating/widget-data';

// BAR CHART — "A resource grouped by one field".
//
// Horizontal bars, longest first, each scaled against the biggest group rather than the total: the
// question this answers is "which version are most clusters on?", and relative length reads that
// far better than a share-of-total bar would.
export default {
  name:       'WidgetBarChart',
  components: { WidgetCard },
  mixins:     [rows],

  computed: {
    bars() {
      const groups = groupRows(this.rows, this.widget.groupBy || 'state');
      const max = groups[0]?.count || 1;

      return groups.map((g) => ({ ...g, percent: (g.count / max) * 100 }));
    },
  },
};
</script>

<template>
  <WidgetCard
    :title="widget.title"
    :loading="loading"
    :error="error"
    :empty="!bars.length"
  >
    <ul class="wbars">
      <li
        v-for="bar in bars"
        :key="bar.label"
      >
        <span class="wbars__label">{{ bar.label }}</span>
        <span class="wbars__track">
          <span
            class="wbars__fill"
            :style="{ width: `${ bar.percent }%` }"
          />
        </span>
        <span class="wbars__count">{{ bar.count }}</span>
      </li>
    </ul>
  </WidgetCard>
</template>

<style lang="scss" scoped>
.wbars {
  display:        flex;
  flex-direction: column;
  gap:            8px;
  list-style:     none;
  margin:         0;
  padding:        0;

  li {
    align-items: center;
    display:     flex;
    gap:         12px;
  }

  &__label {
    flex:          0 0 72px;
    overflow:      hidden;
    text-overflow: ellipsis;
    white-space:   nowrap;
  }

  &__track {
    flex:    1 1 auto;
    display: block;
    height:  14px;
  }

  &__fill {
    background:    var(--primary);
    border-radius: 2px;
    display:       block;
    height:        100%;
    min-width:     2px;
  }

  &__count {
    color:      var(--muted);
    flex:       0 0 auto;
    min-width:  24px;
    text-align: right;
  }
}
</style>
