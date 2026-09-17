<script>
import WidgetCard from './WidgetCard.vue';
import rows from './rows-mixin';
import { groupRows, stateColor } from '../../templating/widget-data';

// STATUS SUMMARY — "Items grouped by state".
//
// One stacked bar showing the whole population at a glance, with a legend underneath. This is the
// shape that answers "is anything unhealthy?" without reading any numbers, which is why the colours
// are Rancher's own state colours rather than a chart palette.
export default {
  name:       'WidgetStatusSummary',
  components: { WidgetCard },
  mixins:     [rows],

  computed: {
    groups() {
      const field = this.widget.groupBy || 'state';
      const total = this.rows.length || 1;

      return groupRows(this.rows, field).map((g) => ({
        ...g,
        color:   stateColor(g.label),
        percent: (g.count / total) * 100,
      }));
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
    :empty="!groups.length"
    :empty-text="emptyText"
  >
    <div class="wstatus">
      <div class="wstatus__bar">
        <span
          v-for="group in groups"
          :key="group.label"
          class="wstatus__seg"
          :class="`wstatus__seg--${ group.color }`"
          :style="{ width: `${ group.percent }%` }"
          :title="`${ group.label }: ${ group.count }`"
        />
      </div>
      <ul class="wstatus__legend">
        <li
          v-for="group in groups"
          :key="group.label"
        >
          <span
            class="wstatus__dot"
            :class="`wstatus__seg--${ group.color }`"
          />
          <span class="wstatus__name">{{ group.label }}</span>
          <span class="wstatus__count">{{ group.count }}</span>
        </li>
      </ul>
    </div>
  </WidgetCard>
</template>

<style lang="scss" scoped>
.wstatus {
  &__bar {
    border-radius: 4px;
    display:       flex;
    height:        10px;
    overflow:      hidden;
    width:         100%;
  }

  &__seg {
    display: block;
    height:  100%;

    &--success {
      background: var(--success);
    }

    &--warning {
      background: var(--warning);
    }

    &--error {
      background: var(--error);
    }

    &--info {
      background: var(--info);
    }
  }

  &__dot {
    border-radius: 2px;
    display:       inline-block;
    height:        9px;
    width:         9px;
  }

  &__legend {
    display:         flex;
    flex-direction:  column;
    gap:             8px;
    list-style:      none;
    margin:          16px 0 0;
    padding:         0;

    li {
      align-items: center;
      display:     flex;
      gap:         8px;
    }
  }

  &__name {
    flex: 1 1 auto;
  }

  &__count {
    font-weight: 600;
  }
}
</style>
