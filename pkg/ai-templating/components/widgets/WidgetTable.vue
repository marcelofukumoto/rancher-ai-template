<script>
import ResourceTable from '@shell/components/ResourceTable.vue';
import { STATE, NAME, NAMESPACE, AGE } from '@shell/config/table-headers';
import WidgetCard from './WidgetCard.vue';
import rows from './rows-mixin';
import { fieldLabel } from '../../templating/widget-data';

// TABLE — "Rows of a resource with the columns you pick".
//
// Rendered by Rancher's own ResourceTable, so a table here behaves like every other table in the
// product: the real state badges, the real name links, sorting, paging, the same empty state. It is
// handed a schema and rows and told not to offer bulk actions or row menus, because a widget on a
// Home is for reading.
//
// The columns a person ticks are mapped onto Rancher's REAL header definitions where one exists
// (State, Name, Namespace, Created) so those columns get their proper formatters; the rest become
// plain value columns driven by this extension's own field readers.
const { formatter, ...NAME_NO_LINK } = NAME;

const REAL_HEADERS = {
  state:     STATE,
  // Rancher's NAME column links into the resource's detail page, which needs a cluster context the
  // Home does not have — the link silently renders nothing. The stock Home's own cluster table
  // drops the same formatter for the same reason, so this keeps the header and drops the link.
  name:      NAME_NO_LINK,
  namespace: NAMESPACE,
  created:   AGE,
};

export default {
  name:       'WidgetTable',
  components: { ResourceTable, WidgetCard },
  mixins:     [rows],

  computed: {
    headers() {
      const ids = this.widget.columns?.length ? this.widget.columns : ['state', 'name'];

      return ids.map((id) => REAL_HEADERS[id] || {
        name:   id,
        label:  fieldLabel(id),
        // The extension's own readers understand the friendly field names ("provider", "K8s
        // version") and fall through to a dotted path for anything else, including CRD fields.
        value:  (row) => this.cell(row, id),
        sort:   false,
        search: false,
      });
    },

    // ResourceTable paginates for us; a widget on a Home wants a short table, so the spec's limit
    // becomes the page size rather than a hard cut.
    perPage() {
      return this.widget.limit || 10;
    },
  },

  methods: {
    cell(row, id) {
      const value = this.fieldValue(row, id);

      return value === '' || value === null || value === undefined ? '—' : value;
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
    :empty="!loading && !error && !rows.length"
    :empty-text="emptyText"
  >
    <ResourceTable
      v-if="schema"
      :schema="schema"
      :rows="rows"
      :headers="headers"
      :loading="loading"
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
// ResourceTable brings its own top margin for the toolbar it is not showing here.
.wcard :deep(.sortable-table-header) {
  margin-bottom: 0;
}
</style>
