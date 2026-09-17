<script>
import CountGauge from '@shell/components/CountGauge.vue';
import { colorForState } from '@shell/plugins/dashboard-store/resource-class';
import { ucFirst } from '@shell/utils/string';
import WidgetCard from './WidgetCard.vue';
import rows from './rows-mixin';
import { groupRows } from '../../templating/widget-data';

// COUNTERS — "Numbers with labels, such as clusters by state".
//
// Each number is Rancher's own CountGauge, the richest count it has: a gradient box with a ring
// showing the healthy share, the count, its label, and warning/error tallies beside it. It is what
// the cluster explorer and the cluster glance panel both use.
//
// The FIRST gauge is the TOTAL, and it is the one that carries the alert tallies — "24 clusters, 17
// of them unwell" is the shape of the question people ask. The rest are the groups, each tinted by
// its own state so an error group is red without this widget deciding what "error" means.
const COLOR_VARS = {
  'text-success': '--success',
  'text-info':    '--info',
  'text-warning': '--warning',
  'text-error':   '--error',
};

export default {
  name:       'WidgetCounters',
  components: { CountGauge, WidgetCard },
  mixins:     [rows],

  computed: {
    // A plural noun for the total, taken from the resource's own schema so a CRD reads properly too.
    totalLabel() {
      const label = `${ this.schema?.attributes?.kind || this.widget.resource?.split('.').pop() || 'items' }`.toLowerCase();

      return label.endsWith('s') ? label : `${ label }s`;
    },

    // How many rows are in a warning or an error state, by Rancher's own reckoning.
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
      const { warningCount, errorCount } = this.health;
      const total = {
        key:    '__total',
        name:   this.totalLabel,
        total:  this.rows.length,
        // The ring fills with what is HEALTHY, so the unwell share reads at a glance.
        useful: this.rows.length - warningCount - errorCount,
        warningCount,
        errorCount,
        color:  '--primary',
      };

      if (!this.widget.groupBy) {
        return [total];
      }

      const groups = groupRows(this.rows, this.widget.groupBy).map((g) => ({
        key:          g.label,
        name:         ucFirst(g.label),
        total:        this.rows.length,
        // A group's ring shows its share of everything counted.
        useful:       g.count,
        // Its own alert tally would just repeat its number.
        warningCount: 0,
        errorCount:   0,
        color:        COLOR_VARS[colorForState(g.label)] || '--primary',
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
      <CountGauge
        v-for="counter in counters"
        :key="counter.key"
        :name="counter.name"
        :total="counter.total"
        :useful="counter.useful"
        :warning-count="counter.warningCount"
        :error-count="counter.errorCount"
        :primary-color-var="counter.color"
      />
    </div>
  </WidgetCard>
</template>

<style lang="scss" scoped>
.wcounters {
  display:               grid;
  gap:                   12px;
  // A gauge is a ring beside a number; below about 150px the two stop fitting side by side.
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}
</style>
