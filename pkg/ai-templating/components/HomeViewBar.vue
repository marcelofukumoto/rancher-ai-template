<script>
// The bar under the app header — the Home's own navigation, and the only place a view is switched,
// renamed, created or published.
//
// It has two faces:
//
//   VIEW MODE  "Home", the views as tabs, then edit (✎) and the overflow menu (⋮).
//   EDIT MODE  the active view's name becomes editable in place, the other tabs go quiet because
//              you are editing THIS one, and the right-hand side turns into Cancel / Save as new
//              view / Save. The bar tints blue so it is obvious the page is in a different mode.
//
// It owns no state beyond the open menu: everything else is emitted to the Home page.
export default {
  name: 'HomeViewBar',

  props: {
    views: {
      type:    Array,
      default: () => [],
    },
    activeId: {
      type:    String,
      default: '',
    },
    editing: {
      type:    Boolean,
      default: false,
    },
    // A brand-new view that has never been saved — Figma's "New view" state.
    isNew: {
      type:    Boolean,
      default: false,
    },
    // The view this user opens the Home on.
    defaultId: {
      type:    String,
      default: '',
    },
    dirty: {
      type:    Boolean,
      default: false,
    },
    saving: {
      type:    Boolean,
      default: false,
    },
    // Where a new view was started from, shown beside "New view".
    startedFrom: {
      type:    String,
      default: '',
    },
  },

  emits: [
    'select', 'edit', 'cancel', 'save', 'save-as-new', 'rename', 'rename-start',
    'new-view', 'duplicate', 'set-default', 'publish', 'delete'
  ],

  data() {
    return { menuOpen: false };
  },

  computed: {
    activeView() {
      return this.views.find((v) => v.id === this.activeId) || null;
    },

    // "Changes are saved to your account only." — unless this view IS the organization template, in
    // which case saving it changes what everyone sees, and the bar must say so.
    editingHint() {
      if (this.isNew) {
        return this.startedFrom ? `From ${ this.startedFrom }. Not saved yet.` : 'Not saved yet.';
      }

      return this.activeView?.org ? 'Changes are published to everyone.' : 'Changes are saved to your account only.';
    },

    isDefault() {
      return !!this.activeId && this.activeId === this.defaultId;
    },
  },

  methods: {
    toggleMenu() {
      this.menuOpen = !this.menuOpen;
    },

    closeMenu() {
      this.menuOpen = false;
    },

    run(event) {
      this.closeMenu();
      this.$emit(event);
    },

    onName(ev) {
      this.$emit('rename', ev.target.value);
    },
  },
};
</script>

<template>
  <div
    class="vbar"
    :class="{ 'vbar--editing': editing }"
  >
    <h1 class="vbar__home">
      Home
    </h1>

    <!-- The views. While editing, the one being edited is renamed in place and the rest go quiet:
       you cannot switch away mid-edit without deciding what to do with your changes. -->
    <div class="vbar__views">
      <!-- One keyed slot per view, with the tab and the name box as branches INSIDE it. Keeping
         the key on a stable wrapper is what stops Vue reusing a <button> as the <input> (or the
         other way round) when the active view changes. -->
      <div
        v-for="view in views"
        :key="view.id"
        class="vbar__slot"
      >
        <input
          v-if="editing && view.id === activeId"
          class="vbar__name"
          :value="view.name"
          aria-label="View name"
          @input="onName"
        >
        <button
          v-else
          class="vbar__view"
          :class="{ 'vbar__view--active': !editing && view.id === activeId }"
          :disabled="editing"
          @click="$emit('select', view.id)"
        >
          {{ view.name }}
        </button>
      </div>
    </div>

    <template v-if="editing">
      <i class="icon icon-edit vbar__pencil" />
      <span class="vbar__mode">{{ isNew ? 'New view' : 'Editing' }}</span>
      <span class="vbar__hint">{{ editingHint }}</span>

      <button
        class="btn role-secondary vbar__btn"
        @click="$emit('cancel')"
      >
        Cancel
      </button>
      <button
        v-if="!isNew"
        class="btn role-secondary vbar__btn"
        :disabled="saving"
        @click="$emit('save-as-new')"
      >
        Save as new view
      </button>
      <button
        class="btn role-primary vbar__btn"
        :disabled="saving || (!dirty && !isNew)"
        @click="$emit('save')"
      >
        {{ saving ? 'Saving…' : 'Save' }}
      </button>
    </template>

    <template v-else>
      <button
        class="vbar__icon-btn"
        title="Edit this view"
        aria-label="Edit this view"
        @click="$emit('edit')"
      >
        <i class="icon icon-edit" />
      </button>

      <div
        class="vbar__menu-wrap"
        @mouseleave="closeMenu"
      >
        <button
          class="vbar__icon-btn"
          :class="{ 'vbar__icon-btn--on': menuOpen }"
          title="More"
          aria-label="More view actions"
          :aria-expanded="menuOpen ? 'true' : 'false'"
          @click="toggleMenu"
        >
          <i class="icon icon-actions" />
        </button>

        <ul
          v-if="menuOpen"
          class="vbar__menu"
        >
          <li>
            <button @click="run('new-view')">
              New view
            </button>
          </li>
          <li>
            <button @click="run('duplicate')">
              Duplicate this view
            </button>
          </li>
          <li>
            <button @click="run('rename-start')">
              Rename
            </button>
          </li>
          <li>
            <button
              :disabled="isDefault"
              @click="run('set-default')"
            >
              {{ isDefault ? 'This is my default' : 'Set as my default' }}
            </button>
          </li>
          <li class="vbar__menu-sep" />
          <li>
            <button @click="run('publish')">
              Publish as organization template
            </button>
          </li>
          <li class="vbar__menu-sep" />
          <li>
            <button
              :disabled="views.length < 2"
              @click="run('delete')"
            >
              Delete view
            </button>
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
// 57px tall, 20px side padding, a hairline under it — and a blue wash while editing.
.vbar {
  align-items:   center;
  background:    var(--header-bg, var(--body-bg));
  border-bottom: 1px solid var(--border);
  box-sizing:    border-box;
  display:       flex;
  gap:           12px;
  min-height:    57px;
  padding:       0 20px;
  position:      sticky;
  top:           0;
  z-index:       20;

  &--editing {
    background: var(--nav-active, rgba(61, 152, 211, 0.08));
  }

  &__home {
    flex:        0 0 auto;
    font-size:   18px;
    font-weight: 400;
    margin:      0 20px 0 0;
  }

  // One row, always. When the bar runs out of room the hint gives way first (below), then the
  // strip of views scrolls — it never wraps onto a second line.
  &__views {
    align-items: center;
    display:     flex;
    flex:        0 1 auto;
    gap:         1px;
    min-width:   0;
    overflow-x:  auto;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  // A view tab: 30px tall, 12px of side padding, and the active one filled in the primary colour.
  &__view {
    background:    transparent;
    border:        none;
    flex:          0 0 auto;
    border-radius: var(--border-radius);
    color:         var(--body-text);
    cursor:        pointer;
    font-size:     14px;
    height:        30px;
    padding:       0 12px;

    &:hover:not(:disabled):not(&--active) {
      background: var(--accent-btn);
    }

    &--active {
      background: var(--primary);
      color:      var(--primary-text);
    }

    &:disabled {
      color:  var(--muted);
      cursor: default;
    }
  }

  // The active view's name, edited where the tab was.
  &__slot {
    display: flex;
    flex:    0 0 auto;
  }

  &__name {
    background:    var(--body-bg);
    border:        1px solid var(--primary);
    border-radius: var(--border-radius);
    box-sizing:    border-box;
    color:         var(--body-text);
    font-size:     14px;
    height:        33px;
    padding:       0 10px;
    width:         180px;
  }

  &__pencil {
    color:     var(--body-text);
    flex:      0 0 auto;
    font-size: 16px;
  }

  &__mode {
    flex:        0 0 auto;
    font-size:   14px;
    font-weight: 700;
    white-space: nowrap;
  }

  // The hint gives way first when the bar gets tight — the buttons never do. It also takes the
  // slack, which is what pushes Cancel / Save to the right edge.
  &__hint {
    color:         var(--muted);
    flex:          1 1 0;
    font-size:     14px;
    min-width:     0;
    overflow:      hidden;
    text-overflow: ellipsis;
    white-space:   nowrap;
  }

  &__btn {
    flex:        0 0 auto;
    height:      32px;
    min-width:   0;
    white-space: nowrap;
  }

  // ---- icon buttons + overflow menu ----
  &__icon-btn {
    align-items:    center;
    flex:           0 0 auto;
    background:     transparent;
    border:         1px solid var(--border);
    border-radius:  var(--border-radius);
    color:          var(--body-text);
    cursor:         pointer;
    display:        flex;
    height:         32px;
    justify-content: center;
    width:          36px;

    &:hover,
    &--on {
      background:   var(--accent-btn);
      border-color: var(--primary);
      color:        var(--primary);
    }

    i {
      font-size: 14px;
    }
  }

  &__menu-wrap {
    position: relative;
  }

  &__menu {
    background:    var(--body-bg);
    border:        1px solid var(--border);
    border-radius: var(--border-radius);
    box-shadow:    0 2px 10px rgba(0, 0, 0, 0.15);
    left:          0;
    list-style:    none;
    margin:        4px 0 0;
    min-width:     260px;
    padding:       8px 0;
    position:      absolute;
    top:           100%;
    z-index:       30;

    button {
      background:  transparent;
      border:      none;
      color:       var(--body-text);
      cursor:      pointer;
      display:     block;
      font-size:   14px;
      line-height: 20px;
      padding:     6px 16px;
      text-align:  left;
      width:       100%;

      &:hover:not(:disabled) {
        background: var(--accent-btn);
      }

      &:disabled {
        color:  var(--muted);
        cursor: default;
      }
    }
  }

  &__menu-sep {
    background: var(--border);
    height:     1px;
    margin:     8px 0;
  }
}
</style>
