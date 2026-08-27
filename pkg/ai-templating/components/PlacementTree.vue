<script>
import { navTreeFor } from '../templating/template-engine';

// The extension's default "Custom Views" group key (engine's navGroup maps an empty group to this).
const DEFAULT_GROUP = 'customViews';
const ROOT = 'root';

// Interactive nav-placement picker. Renders the REAL target nav (the global product's groups, or a
// cluster's explorer groups) and lets the user drag "this view" into a group / between items. It
// emits a placement { group, groupLabel, weight, itemWeight } where:
//   - group      : which nav group ('' = default Custom Views, 'root' = top level, else a group key)
//   - groupLabel : set ONLY when creating a new group (so joining a core group doesn't relabel it)
//   - weight     : the GROUP's position (set ONLY for a new group we own)
//   - itemWeight : the view's position WITHIN its group (higher = higher up)
export default {
  name: 'PlacementTree',

  props: {
    // 'ai-templating' (global) or 'explorer' (cluster).
    product:    { type: String, required: true },
    // Cluster id whose explorer nav to read (only used for the explorer product).
    clusterId:  { type: String, default: '_' },
    // The CR name of the view being placed (to exclude its own current entry from the tree).
    viewName:   { type: String, default: '' },
    // Display label for the "this view" chip/marker.
    viewLabel:  { type: String, default: 'This view' },
    // eslint-disable-next-line vue/require-default-prop
    modelValue: { type: Object, default: () => ({}) },
    // Bumped by the parent to force a tree rebuild (e.g. after loadCluster).
    refreshKey: { type: [String, Number], default: 0 },
  },

  emits: ['update:modelValue'],

  data() {
    return {
      newGroupName: '',
      overKey:      '',
      dragging:     false,
    };
  },

  computed: {
    // The view's own nav-entry name, filtered out of the tree so it doesn't show twice.
    selfName() {
      return this.viewName ? `custom-view-${ this.viewName }` : '';
    },

    // Normalised group key the view currently targets.
    placedGroup() {
      const g = this.modelValue?.group;

      if (g === ROOT) {
        return ROOT;
      }

      return g || DEFAULT_GROUP;
    },

    // Groups (desc by weight) with our view's own entry removed. Always includes the target group,
    // the default group and a root group so every drop destination is reachable.
    displayGroups() {
      // Read refreshKey so this computed re-evaluates when the parent bumps it (e.g. after loadCluster).
      if (this.refreshKey === Number.NEGATIVE_INFINITY) {
        return [];
      }

      const raw = navTreeFor(this.$store, this.product, this.clusterId) || [];
      const byName = {};

      raw.forEach((g) => {
        byName[g.name] = {
          name:   g.name,
          label:  g.label,
          weight: g.weight,
          items:  (g.items || []).filter((it) => it.name !== this.selfName),
        };
      });

      // Ensure the destinations we always want to offer exist.
      if (!byName[ROOT]) {
        byName[ROOT] = {
          name: ROOT, label: 'Top level', weight: 1000, items: []
        };
      }
      if (!byName[DEFAULT_GROUP]) {
        byName[DEFAULT_GROUP] = {
          name: DEFAULT_GROUP, label: 'Custom Views', weight: 50, items: []
        };
      }
      if (!byName[this.placedGroup]) {
        byName[this.placedGroup] = {
          name:   this.placedGroup,
          label:  this.modelValue?.groupLabel || this.placedGroup,
          weight: this.modelValue?.weight ?? 50,
          items:  [],
        };
      }

      return Object.values(byName)
        .map((g) => ({ ...g, items: [...g.items].sort((a, b) => (b.weight || 0) - (a.weight || 0)) }))
        .sort((a, b) => (b.weight || 0) - (a.weight || 0));
    },

    // Index within the target group where the view currently lands (for the "here" marker).
    placedItemIndex() {
      const group = this.displayGroups.find((g) => g.name === this.placedGroup);

      if (!group) {
        return 0;
      }

      const iw = typeof this.modelValue?.itemWeight === 'number' ? this.modelValue.itemWeight : Number.POSITIVE_INFINITY;

      // Items are sorted desc; the view sits above the first item with a lower weight.
      const idx = group.items.findIndex((it) => (it.weight || 0) < iw);

      return idx === -1 ? group.items.length : idx;
    },
  },

  methods: {
    // A weight that sits strictly between two neighbours (desc order: above > below).
    midWeight(above, below) {
      const a = typeof above === 'number' ? above : null;
      const b = typeof below === 'number' ? below : null;

      if (a !== null && b !== null) {
        return (a + b) / 2;
      }
      if (b !== null) {
        return b + 1;
      }
      if (a !== null) {
        return a - 1;
      }

      return 0;
    },

    slugify(s) {
      return `${ s }`.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'group';
    },

    onDragStart(e) {
      this.dragging = true;
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', 'view');
        e.dataTransfer.effectAllowed = 'move';
      }
    },

    onDragEnd() {
      this.dragging = false;
      this.overKey = '';
    },

    // Drop the view into an existing group at item position `index` (0 = top). Joining a group does
    // NOT set groupLabel/weight, so a core group (Workloads, ...) keeps its own label + position.
    dropIntoGroup(group, index) {
      const items = group.items || [];
      const above = items[index - 1]?.weight;
      const below = items[index]?.weight;
      const itemWeight = this.midWeight(above, below);
      const groupKey = group.name === DEFAULT_GROUP ? '' : group.name;

      this.overKey = '';
      this.$emit('update:modelValue', {
        group:      groupKey,
        groupLabel: null,
        weight:     null,
        itemWeight,
      });
    },

    // Create a new group (named by the input) positioned between the groups around slot `boundary`.
    dropNewGroup(boundaryIndex) {
      const name = this.newGroupName.trim();

      if (!name) {
        return;
      }

      const groups = this.displayGroups;
      const above = groups[boundaryIndex - 1]?.weight;
      const below = groups[boundaryIndex]?.weight;
      const weight = this.midWeight(above, below);

      this.overKey = '';
      this.$emit('update:modelValue', {
        group:      this.slugify(name),
        groupLabel: name,
        weight,
        itemWeight: 0,
      });
    },
  },
};
</script>

<template>
  <div class="pt">
    <div class="pt__controls">
      <div
        class="pt__chip"
        draggable="true"
        title="Drag me into the nav below"
        @dragstart="onDragStart"
        @dragend="onDragEnd"
      >
        <i class="icon icon-move" /> {{ viewLabel }}
        <span class="pt__hint">drag into the nav →</span>
      </div>
      <input
        v-model="newGroupName"
        class="pt__newgroup"
        placeholder="New group name (then drop between groups)"
      >
    </div>

    <div class="pt__tree">
      <template
        v-for="(g, gi) in displayGroups"
        :key="g.name"
      >
        <!-- Boundary drop zone for placing a NEW group here (only while a name is typed). -->
        <div
          v-if="newGroupName && dragging"
          class="pt__gzone"
          :class="{ over: overKey === `gz${ gi }` }"
          @dragover.prevent
          @dragenter="overKey = `gz${ gi }`"
          @dragleave="overKey = ''"
          @drop="dropNewGroup(gi)"
        >
          ＋ place “{{ newGroupName }}” here
        </div>

        <div
          class="pt__group"
          :class="{ target: g.name === placedGroup }"
        >
          <div
            class="pt__ghead"
            @dragover.prevent
            @drop="dropIntoGroup(g, 0)"
          >
            {{ g.label }}
          </div>

          <!-- top marker -->
          <div
            v-if="g.name === placedGroup && placedItemIndex === 0"
            class="pt__here"
          >
            ● {{ viewLabel }}
          </div>

          <template
            v-for="(it, ii) in g.items"
            :key="it.name"
          >
            <div
              class="pt__slot"
              :class="{ over: overKey === `${ g.name }:${ ii }` }"
              @dragover.prevent
              @dragenter="overKey = `${ g.name }:${ ii }`"
              @dragleave="overKey = ''"
              @drop="dropIntoGroup(g, ii)"
            />
            <div class="pt__item">
              {{ it.label }}
            </div>
            <div
              v-if="g.name === placedGroup && placedItemIndex === ii + 1"
              class="pt__here"
            >
              ● {{ viewLabel }}
            </div>
          </template>

          <div
            class="pt__slot pt__slot--end"
            :class="{ over: overKey === `${ g.name }:end` }"
            @dragover.prevent
            @dragenter="overKey = `${ g.name }:end`"
            @dragleave="overKey = ''"
            @drop="dropIntoGroup(g, g.items.length)"
          />
        </div>
      </template>

      <div
        v-if="newGroupName && dragging"
        class="pt__gzone"
        :class="{ over: overKey === 'gzEnd' }"
        @dragover.prevent
        @dragenter="overKey = 'gzEnd'"
        @dragleave="overKey = ''"
        @drop="dropNewGroup(displayGroups.length)"
      >
        ＋ place “{{ newGroupName }}” at the bottom
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.pt {
  display:        flex;
  flex-direction: column;
  gap:            8px;

  &__controls {
    display:     flex;
    gap:         8px;
    align-items: center;
    flex-wrap:   wrap;
  }

  &__chip {
    display:       inline-flex;
    align-items:   center;
    gap:           6px;
    padding:       4px 10px;
    border-radius: var(--border-radius);
    background:    var(--primary);
    color:         var(--primary-text, #fff);
    cursor:        grab;
    user-select:   none;

    &:active {
      cursor: grabbing;
    }
  }

  &__hint {
    opacity:   0.8;
    font-size: 11px;
  }

  &__newgroup {
    flex:          1 1 220px;
    height:        30px;
    border:        1px solid var(--border);
    border-radius: var(--border-radius);
    background:    var(--body-bg);
    color:         var(--body-text);
    padding:       0 8px;
  }

  &__tree {
    border:        1px solid var(--border);
    border-radius: var(--border-radius);
    padding:       8px;
    max-height:    340px;
    overflow:      auto;
    background:    var(--body-bg);
  }

  &__group {
    margin-bottom: 6px;
    border-radius: var(--border-radius);

    &.target {
      background: var(--accent-btn, rgba(0, 120, 0, 0.06));
      outline:    1px dashed var(--primary);
    }
  }

  &__ghead {
    font-weight:   600;
    padding:       4px 6px;
    border-bottom: 1px solid var(--border);
  }

  &__item {
    padding:   3px 6px 3px 16px;
    color:     var(--muted);
    font-size: 13px;
  }

  &__slot {
    height:     6px;
    margin:     0 6px;
    border-radius: 3px;

    &.over {
      background: var(--primary);
      height:     8px;
    }
  }

  &__here {
    padding:      2px 6px 2px 12px;
    color:        var(--primary);
    font-weight:  600;
    font-size:    12px;
  }

  &__gzone {
    padding:       4px 6px;
    margin:        3px 0;
    border:        1px dashed var(--border);
    border-radius: var(--border-radius);
    color:         var(--muted);
    font-size:     12px;
    text-align:    center;

    &.over {
      border-color: var(--primary);
      color:        var(--primary);
      background:    var(--accent-btn, rgba(0, 120, 0, 0.06));
    }
  }
}
</style>
