<script>
import WidgetCard from './WidgetCard.vue';
import rows from './rows-mixin';
import { fieldValue, fieldLabel } from '../../templating/widget-data';

// TABLE — "Rows of a resource with the columns you pick".
//
// Deliberately NOT Rancher's ResourceTable: a Home widget wants a few columns, no toolbar, no
// selection and no paging — and the columns here are whatever the widget's spec asked for, which
// may be a CRD field ResourceTable has no header for. The count beside the title is the number of
// rows AFTER the filter, which is what the person who set the filter wants to know.
export default {
  name:       'WidgetTable',
  components: { WidgetCard },
  mixins:     [rows],

  computed: {
    columns() {
      const ids = this.widget.columns?.length ? this.widget.columns : ['state', 'name'];

      return ids.map((id) => ({ id, label: fieldLabel(id) }));
    },
  },

  methods: {
    cell(row, column) {
      const value = fieldValue(row, column.id);

      return value === '' || value === null || value === undefined ? '—' : `${ value }`;
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
    :empty="!rows.length"
    empty-text="No rows match this widget's filter."
  >
    <table class="wtable">
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.id"
          >
            {{ column.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, i) in visibleRows"
          :key="row.id || i"
        >
          <td
            v-for="column in columns"
            :key="column.id"
          >
            {{ cell(row, column) }}
          </td>
        </tr>
      </tbody>
    </table>
  </WidgetCard>
</template>

<style lang="scss" scoped>
// 39px rows and a single hairline under each, as the design draws them.
.wtable {
  border-collapse: collapse;
  font-size:       14px;
  width:           100%;

  th,
  td {
    padding:     0 16px 0 0;
    height:      39px;
    text-align:  left;
    white-space: nowrap;
  }

  th {
    border-bottom: 1px solid var(--border);
    color:         var(--body-text);
    font-weight:   400;
  }

  td {
    border-bottom: 1px solid var(--border);
  }

  tbody tr:last-child td {
    border-bottom: none;
  }
}
</style>
