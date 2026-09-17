<script>
// The box every widget sits in: a bordered card with a title, an optional count beside it, and the
// widget's own content below. One component so a Table, a Bar chart and a Text note all read as the
// same kind of thing on the grid.
export default {
  name: 'WidgetCard',

  props: {
    title: {
      type:    String,
      default: '',
    },
    // Shown as a small pill beside the title (the "42" next to Clusters). null hides it.
    count: {
      type:    [Number, String],
      default: null,
    },
    loading: {
      type:    Boolean,
      default: false,
    },
    error: {
      type:    String,
      default: '',
    },
    // An empty widget says so rather than drawing a blank card.
    empty: {
      type:    Boolean,
      default: false,
    },
    emptyText: {
      type:    String,
      default: 'Nothing to show.',
    },
  },
};
</script>

<template>
  <div class="wcard">
    <header
      v-if="title || count !== null"
      class="wcard__head"
    >
      <h3 class="wcard__title">
        {{ title }}
      </h3>
      <span
        v-if="count !== null"
        class="wcard__count"
      >{{ count }}</span>
    </header>

    <div class="wcard__body">
      <p
        v-if="error"
        class="wcard__msg wcard__msg--error"
      >
        {{ error }}
      </p>
      <p
        v-else-if="loading"
        class="wcard__msg"
      >
        Loading…
      </p>
      <p
        v-else-if="empty"
        class="wcard__msg"
      >
        {{ emptyText }}
      </p>
      <slot v-else />
    </div>
  </div>
</template>

<style lang="scss" scoped>
// Sizes come straight from the design: title 18/600, body 14, the card a 1px border at radius 4.
.wcard {
  background:     var(--simple-box-bg, var(--body-bg));
  border:         1px solid var(--border);
  border-radius:  4px;
  box-sizing:     border-box;
  display:        flex;
  flex-direction: column;
  height:         100%;
  min-height:     0;
  overflow:       hidden;
  padding:        20px 24px;

  &__head {
    align-items:   center;
    display:       flex;
    flex:          0 0 auto;
    gap:           10px;
    margin-bottom: 16px;
  }

  &__title {
    font-size:   18px;
    font-weight: 600;
    line-height: 1.2;
    margin:      0;
  }

  &__count {
    background:    var(--default);
    border-radius: 10px;
    color:         var(--body-text);
    font-size:     12px;
    line-height:   1;
    padding:       4px 8px;
  }

  &__body {
    flex:      1 1 auto;
    font-size: 14px;
    min-height: 0;
    overflow:  auto;
  }

  &__msg {
    color:     var(--muted);
    font-size: 14px;
    margin:    0;

    &--error {
      color: var(--error);
    }
  }
}
</style>
