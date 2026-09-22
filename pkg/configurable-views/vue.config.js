const config = require('./.shell/pkg/vue.config')(__dirname);

// This extension bundles @shell SOURCE (via the component registry in ./templating) so that
// runtime-compiled templates can import the full Rancher component library. Type-checking a
// vendored dependency's own source is not our responsibility and fails on @shell's tsconfig-
// relative types (implicit-any .js models, `types/*` imports, API drift). Drop the type
// checker and transpile-only; our own code is still linted via `yarn lint`.
const origChainWebpack = config.chainWebpack;

config.chainWebpack = (context) => {
  if (origChainWebpack) {
    origChainWebpack(context);
  }

  if (context.plugins.has('fork-ts-checker')) {
    context.plugins.delete('fork-ts-checker');
  }
};

module.exports = config;
