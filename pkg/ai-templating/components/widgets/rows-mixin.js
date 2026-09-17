// Every data-backed widget reads its rows the same way: fetch the spec's resource once, then apply
// the spec's Where / Filter / Sort. Mixing this in gives a widget `rows` (what to draw), `loading`
// and `error` without repeating any of it.
//
// "Where" is deliberately coarse, matching the settings dialog:
//   view    — the same clusters the view covers (everything the user can see)
//   custom  — only the clusters or namespaces named in `targets`
// Cluster scoping is a server-side concept we can only approximate from the Home (which is not
// inside a cluster), so a custom `targets` list matches on the row's cluster or namespace name.

import { applyFilter, applySort, fieldValue } from '../../templating/widget-data';

export default {
  props: {
    widget: {
      type:     Object,
      required: true,
    },
  },

  async fetch() {
    await this.loadRows();
  },

  data() {
    return {
      allRows: [], loading: true, error: ''
    };
  },

  computed: {
    inStore() {
      return this.widget.resource ? this.$store.getters['currentStore'](this.widget.resource) : 'management';
    },

    schema() {
      return this.widget.resource ? this.$store.getters[`${ this.inStore }/schemaFor`](this.widget.resource) : null;
    },

    // Rows after Where + Filter + Sort — what the widget actually draws.
    rows() {
      const scoped = this.widget.where === 'custom' && this.widget.targets?.length ? this.allRows.filter((row) => this.inTargets(row)) : this.allRows;
      const filtered = applyFilter(scoped, this.widget.filter);

      return applySort(filtered, this.widget.sortBy, this.widget.sortDir);
    },

    // What a list caps itself at (0 means no cap).
    visibleRows() {
      return this.widget.limit ? this.rows.slice(0, this.widget.limit) : this.rows;
    },
  },

  watch: {
    // The resource is the only thing a re-fetch depends on — everything else is applied client-side.
    'widget.resource'() {
      this.loadRows();
    },
  },

  methods: {
    async loadRows() {
      this.error = '';

      if (!this.widget.resource) {
        this.allRows = [];
        this.loading = false;

        return;
      }

      this.loading = true;

      try {
        if (!this.schema) {
          this.allRows = [];
          this.error = `Rancher has no "${ this.widget.resource }" here — the type may not be installed, or you may not have permission to see it.`;

          return;
        }

        this.allRows = await this.$store.dispatch(`${ this.inStore }/findAll`, { type: this.widget.resource }) || [];
      } catch (e) {
        this.allRows = [];
        this.error = e?.message || `Could not load ${ this.widget.resource }.`;
      } finally {
        this.loading = false;
      }
    },

    inTargets(row) {
      const targets = this.widget.targets.map((t) => t.toLowerCase());
      const candidates = [fieldValue(row, 'namespace'), row.clusterName, row.spec?.clusterName].filter(Boolean);

      return candidates.some((c) => targets.includes(`${ c }`.toLowerCase()));
    },
  },
};
