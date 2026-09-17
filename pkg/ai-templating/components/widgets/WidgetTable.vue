<script>
import PaginatedResourceTable from '@shell/components/PaginatedResourceTable.vue';
import { STATE, NAME, NAMESPACE, AGE } from '@shell/config/table-headers';
import WidgetCard from './WidgetCard.vue';
import {
  applyFilter, applySort, fieldValue, fieldLabel, storeForType, typeColumns, withoutDetailLink
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
// It is KEYED on the resource. The table fetches for the schema it was built with and does not
// re-fetch when that prop changes, so pointing a widget at a different type left the old type's
// rows on screen until a reload. Keying it makes a new resource a new table. The sort is in the key
// for the same reason: a column's default sort is read once, when the table is built.
//
// Columns come from the RESOURCE first: Rancher defines real headers per type, so a User gets a
// username and a last login while a Cluster gets a provider and a Kubernetes version, each with its
// proper formatter and sort. Only where the type declares nothing does this fall back to a generic
// header, and then to a value column on this extension's own field readers — which is what keeps an
// arbitrary CRD field working.
//
// Rancher's NAME column links into the resource's detail page, which needs a cluster context the
// Home does not have; the link silently renders nothing. The stock Home's own cluster table drops
// the same formatter for the same reason (see withoutDetailLink for the type's own headers).
const { formatter, ...NAME_NO_LINK } = NAME;

const GENERIC_HEADERS = {
  state:     STATE,
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

    // What the type itself declares, keyed by column id.
    typeHeaders() {
      return Object.fromEntries(typeColumns(this.$store.getters, this.widget.resource).map((c) => [c.id, c.header]));
    },

    headers() {
      const ids = this.widget.columns?.length ? this.widget.columns : ['state', 'name'];

      return ids.map((id) => {
        const header = this.headerFor(id);

        // Sorting goes through the COLUMN wherever the column can do it: the header knows which
        // path it really sorts on, which a field reader never taught this type cannot. Marking the
        // header is how SortableTable is told to open that way — it has no prop for the direction.
        if (id === this.widget.sortBy && header.sort) {
          return {
            ...header, defaultSort: true, defaultSortDescending: this.widget.sortDir === 'desc'
          };
        }

        return header;
      });
    },

    // True when the table is sorting for us, and this widget must not sort on top of it.
    sortsItself() {
      return this.headers.some((h) => h.defaultSort);
    },

    // The table pages for us, so the spec's limit is a page size rather than a hard cut.
    perPage() {
      return this.widget.limit || 10;
    },
  },

  methods: {
    headerFor(id) {
      const own = this.typeHeaders[id];

      if (own) {
        return withoutDetailLink(own);
      }

      return GENERIC_HEADERS[id] || {
        name:   id,
        label:  fieldLabel(id),
        value:  (row) => this.cell(row, id),
        sort:   false,
        search: false,
      };
    },

    cell(row, id) {
      const value = fieldValue(row, id);

      return value === '' || value === null || value === undefined ? '—' : value;
    },

    // Applied to whichever rows the table has, however it got them.
    filterRows(rows) {
      const scoped = this.widget.where === 'custom' && this.widget.targets?.length ? (rows || []).filter((row) => this.inTargets(row)) : rows;
      const filtered = applyFilter(scoped, this.widget.filter);

      return this.sortsItself ? filtered : applySort(filtered, this.widget.sortBy, this.widget.sortDir);
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
      :key="`${ widget.resource }|${ widget.sortBy }|${ widget.sortDir }`"
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
