import { isAdminUser } from '@shell/store/type-map';
import {
  CRDS, AGENT_CRS, SEED_CRS
} from './manifests';

// Auto-install the extension's cluster dependencies when an admin loads it: the
// templating.rancher.io CRDs, the AIAgentConfig builder agents, and a default TemplatingConfig +
// HomeTemplate so the custom Home works out of the box. Idempotent (skips anything already
// present) and admin-gated. This is the "installed through the extension" path, since the stock
// UIPlugin Helm chart has no slot for extra manifests.

const CRD_TYPE = 'apiextensions.k8s.io.customresourcedefinition';
const AGENT_TYPE = 'ai.cattle.io.aiagentconfig';

let ranThisSession = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function steveTypeFor(apiVersion: string, kind: string): string {
  return `${ apiVersion.split('/')[0] }.${ kind.toLowerCase() }`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureCR(store: any, type: string, manifest: any): Promise<boolean> {
  const ns = manifest.metadata?.namespace;
  const id = ns ? `${ ns }/${ manifest.metadata.name }` : manifest.metadata.name;

  if (store.getters['management/byId'](type, id)) {
    return false;
  }

  const res = await store.dispatch('management/create', {
    type,
    metadata: manifest.metadata,
    spec:     manifest.spec,
  });

  await res.save();

  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureInstalled(store: any): Promise<void> {
  if (ranThisSession || !isAdminUser(store.getters)) {
    return;
  }
  ranThisSession = true;

  try {
    // 1. CRDs — create any whose CR type isn't yet served by Steve.
    for (const crd of CRDS) {
      const crType = `${ crd.spec.group }.${ crd.spec.names.singular }`;

      if (store.getters['management/schemaFor'](crType)) {
        continue;
      }

      try {
        const res = await store.dispatch('management/create', {
          type: CRD_TYPE, metadata: crd.metadata, spec: crd.spec,
        });

        await res.save();
      } catch (e) { /* already exists / race — fine */ }
    }

    // 2. AIAgentConfig builder agents (only if the ai.cattle.io CRD is present).
    if (store.getters['management/schemaFor'](AGENT_TYPE)) {
      await store.dispatch('management/findAll', { type: AGENT_TYPE }).catch(() => {});

      for (const agent of AGENT_CRS) {
        await ensureCR(store, AGENT_TYPE, agent).catch(() => {});
      }
    }

    // 3. Seed a default TemplatingConfig + HomeTemplate so the custom Home works immediately.
    for (const cr of SEED_CRS) {
      const type = steveTypeFor(cr.apiVersion, cr.kind);

      if (!store.getters['management/schemaFor'](type)) {
        continue; // schema may not be live yet right after CRD creation — seeds on a later load.
      }

      await store.dispatch('management/findAll', { type }).catch(() => {});
      await ensureCR(store, type, cr).catch(() => {});
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ai-templating] ensureInstalled failed', e);
  }
}
