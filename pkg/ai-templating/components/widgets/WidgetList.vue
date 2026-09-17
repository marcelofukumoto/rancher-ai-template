<script>
import WidgetCard from './WidgetCard.vue';
import rows from './rows-mixin';
import { fieldValue, stateColor } from '../../templating/widget-data';

// LIST — "A compact feed: alerts, events, commits".
//
// One line per row: a lead word (its state / type, coloured), the row's name, and whatever message
// it carries. That is the shape of every feed on a dashboard, so the widget does not try to be
// configurable beyond the resource, the filter and how many lines to show.
export default {
  name:       'WidgetList',
  components: { WidgetCard },
  mixins:     [rows],

  methods: {
    lead(row) {
      return fieldValue(row, 'type') || fieldValue(row, 'state') || '';
    },

    leadColor(row) {
      return stateColor(this.lead(row));
    },

    name(row) {
      return fieldValue(row, 'name');
    },

    message(row) {
      return fieldValue(row, 'message');
    },
  },
};
</script>

<template>
  <WidgetCard
    :title="widget.title"
    :loading="loading"
    :error="error"
    :empty="!rows.length"
    empty-text="Nothing here right now."
  >
    <ul class="wlist">
      <li
        v-for="(row, i) in visibleRows"
        :key="row.id || i"
      >
        <span
          v-if="lead(row)"
          class="wlist__lead"
          :class="`wlist__lead--${ leadColor(row) }`"
        >{{ lead(row) }}</span>
        <span class="wlist__text">
          <span class="wlist__name">{{ name(row) }}</span>
          <template v-if="message(row)">: {{ message(row) }}</template>
        </span>
      </li>
    </ul>
  </WidgetCard>
</template>

<style lang="scss" scoped>
.wlist {
  display:        flex;
  flex-direction: column;
  gap:            8px;
  list-style:     none;
  margin:         0;
  padding:        0;

  li {
    display: flex;
    gap:     12px;
  }

  &__lead {
    flex:        0 0 auto;
    font-weight: 600;
    min-width:   64px;

    &--success {
      color: var(--success);
    }

    &--warning {
      color: var(--warning);
    }

    &--error {
      color: var(--error);
    }

    &--info {
      color: var(--body-text);
    }
  }

  &__text {
    min-width:     0;
    overflow:      hidden;
    text-overflow: ellipsis;
    white-space:   nowrap;
  }

  &__name {
    font-weight: 500;
  }
}
</style>
