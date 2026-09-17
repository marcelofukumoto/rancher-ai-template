<script>
import WidgetCard from './WidgetCard.vue';
import rows from './rows-mixin';
import { groupRows } from '../../templating/widget-data';

// COUNTERS — "Numbers with labels, such as clusters by state".
//
// The first counter is always the TOTAL, because "42 clusters" is the number people look for first;
// the rest are the groups, biggest first. With no `groupBy` it is just the total.
export default {
  name:       'WidgetCounters',
  components: { WidgetCard },
  mixins:     [rows],

  computed: {
    // A plural noun for the total, taken from the resource's own schema so a CRD reads properly too.
    totalLabel() {
      const label = this.schema?.attributes?.kind || this.widget.resource?.split('.').pop() || 'items';

      return `${ label }`.toLowerCase() + (label.endsWith('s') ? '' : 's');
    },

    counters() {
      const total = { label: this.totalLabel, count: this.rows.length };

      if (!this.widget.groupBy) {
        return [total];
      }

      return [total, ...groupRows(this.rows, this.widget.groupBy).map((g) => ({ label: g.label.toLowerCase(), count: g.count }))];
    },
  },
};
</script>

<template>
  <WidgetCard
    :title="widget.title"
    :loading="loading"
    :error="error"
  >
    <div class="wcounters">
      <div
        v-for="counter in counters"
        :key="counter.label"
        class="wcounters__item"
      >
        <span class="wcounters__value">{{ counter.count }}</span>
        <span class="wcounters__label">{{ counter.label }}</span>
      </div>
    </div>
  </WidgetCard>
</template>

<style lang="scss" scoped>
// 28/700 over a 14/400 label, the pair repeated across the card.
.wcounters {
  display:   flex;
  flex-wrap: wrap;
  gap:       12px 40px;

  &__item {
    display:        flex;
    flex-direction: column;
    gap:            6px;
  }

  &__value {
    font-size:   28px;
    font-weight: 700;
    line-height: 1;
  }

  &__label {
    color:     var(--body-text);
    font-size: 14px;
  }
}
</style>
