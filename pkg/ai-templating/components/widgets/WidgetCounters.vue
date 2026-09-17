<script>
import CountBox from '@shell/components/CountBox.vue';
import { colorForState } from '@shell/plugins/dashboard-store/resource-class';
import { ucFirst } from '@shell/utils/string';
import WidgetCard from './WidgetCard.vue';
import rows from './rows-mixin';
import { groupRows } from '../../templating/widget-data';

// COUNTERS — "Numbers with labels, such as clusters by state".
//
// Each number is Rancher's own CountBox, so a count here is the same tile the product uses on its
// cluster dashboard — same type scale, same colour treatment. The first is always the TOTAL,
// because "42 clusters" is the number people look for first; the rest are the groups.
//
// A group's colour comes from `colorForState`, so "Error" is red and "Active" is green without this
// widget deciding what those words mean.
//
// NOT `compact`: that lays the label beside the number, and a state name of any length
// ("Reconciling", "Provisioning") then runs out of its tile. Stacked is also what the design draws.
export default {
  name:       'WidgetCounters',
  components: { CountBox, WidgetCard },
  mixins:     [rows],

  computed: {
    // A plural noun for the total, taken from the resource's own schema so a CRD reads properly too.
    totalLabel() {
      const label = `${ this.schema?.attributes?.kind || this.widget.resource?.split('.').pop() || 'items' }`.toLowerCase();

      return label.endsWith('s') ? label : `${ label }s`;
    },

    counters() {
      const total = {
        key: '__total', label: this.totalLabel, count: this.rows.length, color: null
      };

      if (!this.widget.groupBy) {
        return [total];
      }

      const groups = groupRows(this.rows, this.widget.groupBy).map((g) => ({
        key:   g.label,
        label: ucFirst(g.label),
        count: g.count,
        // CountBox takes a CSS variable NAME; Rancher's state classes map onto the same words.
        color: `--${ colorForState(g.label).replace(/^text-/, '') }`,
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
      <CountBox
        v-for="counter in counters"
        :key="counter.key"
        :name="counter.label"
        :count="counter.count"
        :primary-color-var="counter.color || '--primary'"
      />
    </div>
  </WidgetCard>
</template>

<style lang="scss" scoped>
.wcounters {
  display:               grid;
  gap:                   12px;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
}
</style>
