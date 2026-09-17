<script>
import PaginatedResourceTable from '@shell/components/PaginatedResourceTable.vue';
import { STATE, NAME, NAMESPACE, AGE } from '@shell/config/table-headers';
import WidgetCard from './WidgetCard.vue';
import {
  applyFilter, applySort, fieldValue, fieldLabel, storeForType
} from '../../templating/widget-data';

// TABLE — "Rows of a resource with the columns you pick".
//
// Rendered by Rancher's PaginatedResourceTable, which is the component built for exactly this:
// "ResourceList like capabilities outside of List pages", its own words — the resource fetch,
// SERVER-SIDE pagination where the backend supports it, and the plumbing that goes with them. So
// this widget does not fetch at all; it says what to show and hands the rest over.
//
// That is why the widget's own Where/Filter/Sort arrive as `localFilter`: the table owns the rows,
// and a filter is something applied to them on the way past, not a reason to fetch them ourselves.
//
// Columns map onto Rancher's REAL header definitions where one exists (State, Name, Namespace,
// Created) so those get their proper formatters; the rest become value columns on this extension's
// field readers, which is what keeps a CRD field working.
const { formatter, ...NAME_NO_LINK } = NAME;

const REAL_HEADERS = {
  state:     STATE,
  // Rancher's NAME column links into the resource's detail page, which needs a cluster context the
  // Home does not have — the link silently renders nothing. The stock Home's own cluster table
  // drops the same formatter for the same reason.
  name:      NAME_NO_LINK,
  namespace: NAMESPACE,
  created:   AGE,
};

export default {
  name:       'WidgetTable',
  components: { PaginatedResourceTable, WidgetCard },

  props: {
    widget: {
      type:     Object,
      required: true,
    },
  },

  computed: {
    inStore() {
      return storeForType(this.$store.getters, this.widget.resource);
    },

    schema() {
      return this.widget.resource ? this.$store.getters[`${ this.inStore }/schemaFor`](this.widget.resource) : null;
    },

    headers() {
      const ids = this.widget.columns?.length ? this.widget.columns : ['state', 'name'];

      return ids.map((id) => REAL_HEADERS[id] || {
        name:   id,
        label:  fieldLabel(id),
        value:  (row) => this.cell(row, id),
        sort:   false,
        search: false,
      });
    },

    // The table pages for us, so the spec's limit is a page size rather than a hard cut.
    perPage() {
      return this.widget.limit || 10;
    },
  },

  methods: {
    cell(row, id) {
      const value = fieldValue(row, id);

      return value === '' || value === null || value === undefined ? '—' : value;
    },

    // Applied to whichever rows the table has, however it got them.
    filterRows(rows) {
      const scoped = this.widget.where === 'custom' && this.widget.targets?.length ? (rows || []).filter((row) => this.inTargets(row)) : rows;

      return applySort(applyFilter(scoped, this.widget.filter), this.widget.sortBy, this.widget.sortDir);
    },

    inTargets(row) {
      const targets = this.widget.targets.map((t) => t.toLowerCase());
      const candidates = [fieldValue(row, 'namespace'), row.clusterName, row.spec?.clusterName].filter(Boolean);

      return candidates.some((c) => targets.includes(`${ c }`.toLowerCase()));
    },
  },
};
</script>

<template>
  <WidgetCard
    :title="widget.title"
    :error="schema ? '' : `Rancher has no &quot;${ widget.resource }&quot; here — the type may not be installed, or you may not have permission to see it.`"
  >
    <PaginatedResourceTable
      v-if="schema"
      :schema="schema"
      :headers="headers"
      :pagination-headers="headers"
      :override-in-store="inStore"
      :local-filter="filterRows"
      :table-actions="false"
      :row-actions="false"
      :namespaced="false"
      :groupable="false"
      :search="false"
      :rows-per-page="perPage"
      key-field="id"
    />
  </WidgetCard>
</template>

<style lang="scss" scoped>
// The table brings its own top margin for the toolbar it is not showing here.
.wcard :deep(.sortable-table-header) {
  margin-bottom: 0;
}
</style>
