<script>
import ResourceSummary from '@shell/components/ResourceSummary.vue';
import { colorForState } from '@shell/plugins/dashboard-store/resource-class';
import { ucFirst } from '@shell/utils/string';
import WidgetCard from './WidgetCard.vue';
import rows from './rows-mixin';
import { groupRows } from '../../templating/widget-data';

// COUNTERS — "Numbers with labels, such as clusters by state".
//
// Each number is Rancher's own ResourceSummary: the count card from the cluster dashboard, which is
// a SimpleBox with the number, its name, and amber/red chips when some of what it counts is
// unhealthy. It is fed `spoofedCounts` rather than left to count for itself, so it reports exactly
// what this widget's resource and filter selected.
//
// The FIRST card is the total, and it is the one that carries the chips — "42 clusters, 3 of them
// in trouble" is the shape of the question people actually ask. The rest are the groups.
export default {
  name:       'WidgetCounters',
  components: { ResourceSummary, WidgetCard },
  mixins:     [rows],

  computed: {
    // A plural noun for the total, taken from the resource's own schema so a CRD reads properly too.
    totalLabel() {
      const label = `${ this.schema?.attributes?.kind || this.widget.resource?.split('.').pop() || 'items' }`.toLowerCase();

      return label.endsWith('s') ? label : `${ label }s`;
    },

    // How many of the rows are in a warning or an error state, by Rancher's own reckoning.
    health() {
      return this.rows.reduce((acc, row) => {
        const color = colorForState(row.stateDisplay || row.state || '');

        if (color === 'text-error') {
          acc.errorCount += 1;
        } else if (color === 'text-warning') {
          acc.warningCount += 1;
        }

        return acc;
      }, { warningCount: 0, errorCount: 0 });
    },

    counters() {
      const total = {
        key:          '__total',
        name:         this.totalLabel,
        total:        this.rows.length,
        useful:       this.rows.length - this.health.warningCount - this.health.errorCount,
        warningCount: this.health.warningCount,
        errorCount:   this.health.errorCount,
      };

      if (!this.widget.groupBy) {
        return [total];
      }

      const groups = groupRows(this.rows, this.widget.groupBy).map((g) => ({
        key:          g.label,
        name:         ucFirst(g.label),
        total:        g.count,
        useful:       g.count,
        // A group IS one state, so its own chip would just repeat its number.
        warningCount: 0,
        errorCount:   0,
      }));

      return [total, ...groups];
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
      <ResourceSummary
        v-for="counter in counters"
        :key="counter.key"
        :spoofed-counts="counter"
      />
    </div>
  </WidgetCard>
</template>

<style lang="scss" scoped>
.wcounters {
  display:               grid;
  gap:                   12px;
  // ResourceSummary lays its number, name and chips out in ONE row (the cluster dashboard gives it
  // a third of a full-width page). Below about 200px those collide, so that is the floor: a narrow
  // widget stacks the cards, a wide one puts several across.
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));

  :deep(.container) {
    height:    100%;
    margin:    0;
    min-width: 0;
  }

  :deep(h1) {
    margin-bottom: 0;
  }
}
</style>
