<script>
import ProgressBarMulti from '@shell/components/ProgressBarMulti.vue';
import { colorForState, stateSort } from '@shell/plugins/dashboard-store/resource-class';
import { ucFirst } from '@shell/utils/string';
import { sortBy } from '@shell/utils/sort';
import WidgetCard from './WidgetCard.vue';
import rows from './rows-mixin';
import { groupRows } from '../../templating/widget-data';

// STATUS SUMMARY — "Items grouped by state".
//
// Drawn by Rancher's own ProgressBarMulti, the same component behind every state breakdown in the
// product (FleetSummaryGraph, AppSummaryGraph, WorkloadHealthScale). The colours come from
// `colorForState` and the ordering from `stateSort`, so "Error" is the same red here as everywhere
// else and the worst states sort to the front — neither of which a hand-rolled bar would get right
// for a state it had never been taught.
export default {
  name:       'WidgetStatusSummary',
  components: { ProgressBarMulti, WidgetCard },
  mixins:     [rows],

  computed: {
    // ProgressBarMulti's shape: { label, color (a bg-* class), value }, worst first.
    parts() {
      const groups = groupRows(this.rows, this.widget.groupBy || 'state').map((g) => {
        const textColor = colorForState(g.label);

        return {
          label: ucFirst(g.label),
          color: textColor.replace(/text-/, 'bg-'),
          textColor,
          value: g.count,
          sort:  stateSort(textColor, g.label),
        };
      });

      return sortBy(groups, 'sort:desc');
    },
  },
};
</script>

<template>
  <WidgetCard
    :title="widget.title"
    :count="loading || error ? null : rows.length"
    :loading="loading"
    :error="error"
    :empty="!parts.length"
    :empty-text="emptyText"
  >
    <ProgressBarMulti
      :values="parts"
      class="mb-20"
    />
    <ul class="wstatus__legend">
      <li
        v-for="part in parts"
        :key="part.label"
      >
        <span
          class="wstatus__dot"
          :class="part.color"
        />
        <span class="wstatus__name">{{ part.label }}</span>
        <span class="wstatus__count">{{ part.value }}</span>
      </li>
    </ul>
  </WidgetCard>
</template>

<style lang="scss" scoped>
.wstatus {
  &__legend {
    display:        flex;
    flex-direction: column;
    gap:            8px;
    list-style:     none;
    margin:         0;
    padding:        0;

    li {
      align-items: center;
      display:     flex;
      gap:         8px;
    }
  }

  &__dot {
    border-radius: 2px;
    display:       inline-block;
    height:        9px;
    width:         9px;
  }

  &__name {
    flex: 1 1 auto;
  }

  &__count {
    font-weight: 600;
  }
}
</style>
