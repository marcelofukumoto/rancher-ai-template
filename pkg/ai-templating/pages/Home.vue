<script>
import TemplateCode from '../components/TemplateCode.vue';

// Smoke-test source: a runtime-compiled SFC that also imports a real @components component,
// so a successful render proves both the compiler AND the @shell/@components registry work
// inside the extension build. (This becomes the CR-driven Home template next.)
const DEMO_SOURCE =
`<script>
import { Banner } from '@components/Banner';
export default { components: { Banner }, data() { return { n: 3 }; } };
<\/script>
<template>
  <div>
    <Banner color="success" label="Runtime-compiled SFC rendering inside the extension" />
    <p>Math still works: {{ n }} + 4 = {{ n + 4 }}</p>
  </div>
<\/template>`;

export default {
  name:       'AiTemplatingHome',
  components: { TemplateCode },

  data() {
    return { source: DEMO_SOURCE };
  },
};
</script>

<template>
  <div class="ai-templating-home">
    <h1>AI Templating</h1>
    <TemplateCode :source="source" />
  </div>
</template>

<style lang="scss" scoped>
.ai-templating-home {
  padding: 40px;
}
</style>
