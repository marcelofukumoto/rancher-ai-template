# AI Templating — Example Gallery

A set of ready-made **Home** pages and **Custom Views** for the AI Templating extension, each
crafted around a real *role* and *angle*. Use them as-is, or as starting points to remix in the
editors.

Apply them all with:

```sh
kubectl apply -f persona-examples.yaml
```

- **HomeTemplates** become selectable in the **Home editor** (open `/home`, click **Edit Home**).
- **Global CustomViews** appear under the **AI Templating** product nav.
- **Cluster CustomViews** (`spec.nav.scope: cluster`) appear in **every cluster's navbar**, grouped
  by `spec.nav.group`.

Everything is authored and tweaked in the **Blank Canvas** editor (a live Custom View editor with an
AI chat, a Global/Cluster type toggle, and drag-and-drop nav placement) or the **Home editor**.

---

## The angles

Two axes shape these examples. **Roles** decide *what* a view shows; **personas** decide *how* you
build and drive it.

### Roles — *what* you manage

| Role | Cares about | Example built for them |
|------|-------------|------------------------|
| **App Developer** | specific workloads | App Launcher home, My Workloads, Portable Bundle |
| **Feature Developer** | one feature (e.g. Harvester) | Virtual Machines |
| **Cluster Admin** | a cluster's health & capacity | Fleet Health home, Node Capacity |
| **Rancher Admin** | the whole fleet | Fleet Overview |

### Personas — *how* you build it

| Persona | Style | Where they live in this extension |
|---------|-------|-----------------------------------|
| **AI Developer** — "ask AI, don't care how it works" | describe it, let the chat write the SFC | the **chat** in the Blank Canvas / Home editor (`Custom View Builder`) |
| **Click Developer** — "mouse-based edits" | drag the view into the nav, tweak the source by hand | the **drag-and-drop placement tree** + the source editor |
| **Cloud Developer** — "everything in the cloud, portability" | cluster-less, portable views | the **Global Blank Canvas** (`/c/_/ai-templating/canvas`) + the **Portable Bundle** view |
| **Local Developer** — "speed + host access" | live data, host reachability | the **Cluster Blank Canvas** (inside a cluster) + the **Service Access** view |

> The same example serves a role but can be *created* by any persona: the AI Developer asks for it,
> the Click Developer drags it into place, the Cloud/Local Developer decides whether it's global or
> cluster-scoped.

---

## Home examples

The Home page runs **outside any cluster**, so Home templates read the **management store**
(`management.cattle.io.*`) — the fleet, not one cluster's workloads.

### 🩺 Cluster Admin — Fleet Health  (`home-cluster-admin`)
A health-first landing page: a success/warning **Banner** summarizing how many clusters are active
vs. need attention, over the full clusters **ResourceTable** (state, version, provider, capacity).
- **Role:** Cluster Admin · **Store:** management · **Types:** `management.cattle.io.cluster`
- **Persona note:** an *AI Developer* gets here with "make my home a fleet health dashboard";
  a *Cluster Admin* applies it globally so every operator lands on health.

### 🚀 App Developer — App Launcher  (`home-app-developer`)
A grid of cluster cards, each with a **Workloads →** button that jumps straight to that cluster's
workload dashboard. Optimized for "get me to my apps in one click".
- **Role:** App Developer · **Store:** management · **Route:** `c-cluster-explorer-workload-dashboard`
- **Persona note:** a *Cloud Developer* likes this as their portable front door — it's cluster-less
  and works from anywhere; a *Click Developer* rearranges the cards by editing the grid.

---

## Custom View examples

Custom Views are pages compiled from a Vue SFC. **Cluster-scoped** views read the **cluster store**
(`cluster/findAll`) and preview live in the **Cluster Blank Canvas**; **global** views read the
**management store**.

| View | Role | Scope | Nav group | Reads |
|------|------|-------|-----------|-------|
| **My Workloads** (`app-workloads`) | App Developer | cluster | My Apps | `apps.deployment` |
| **Portable Bundle** (`portable-bundle`) | Cloud Developer | cluster | My Apps | deployment, service, ingress, configmap |
| **Node Capacity** (`node-capacity`) | Cluster Admin | cluster | Ops | `node` |
| **Service Access** (`service-access`) | Local Developer | cluster | Ops | `service` (non-ClusterIP) |
| **Fleet Overview** (`fleet-overview`) | Rancher Admin | **global** | Admin | `management.cattle.io.cluster` |
| **Virtual Machines** (`harvester-vms`) | Feature Developer | cluster | (top level) | `kubevirt.io.virtualmachine` |

### 📦 App Developer — My Workloads  (`app-workloads`)
Your deployments in one table with a "N / M fully available" summary line. The everyday "are my
apps healthy?" page.
- **Persona note:** the *AI Developer* asks "show my deployments with a ready count"; the *Click
  Developer* drops it into the **My Apps** group right under Workloads.

### 🌐 Cloud Developer — Portable Bundle  (`portable-bundle`)
The **cloud-portable** slice of an app on one page — Deployments, Services, Ingresses and ConfigMaps
stacked together. "Move these and the app moves with you."
- **Persona note:** the *Cloud Developer*'s signature view — nothing host-specific, everything you'd
  carry between clusters. Author it in the **Global** canvas so it isn't tied to one cluster.

### 📊 Cluster Admin — Node Capacity  (`node-capacity`)
The node table focused on CPU / memory / pod headroom across the cluster — capacity planning at a
glance.
- **Persona note:** a *Cluster Admin* pins this in the **Ops** group; an *AI Developer* can ask to
  "add a warning banner when any node is over 80% pods".

### 🔌 Local Developer — Service Access  (`service-access`)
Only the services you can actually reach from your host — **NodePort** and **LoadBalancer** (ClusterIP
filtered out) — with their ports. The fast local-dev loop.
- **Persona note:** the *Local Developer*'s view — built in the **Cluster** canvas where the data is
  live and the ports are real.

### 🛰️ Rancher Admin — Fleet Overview  (`fleet-overview`)
A **global** view (under AI Templating → Admin) listing every cluster with a "Managing N clusters"
banner. The fleet at a glance without leaving the admin surface.
- **Persona note:** the *Rancher Admin*'s home base. Global scope = one page for the whole fleet.

### 🖥️ Feature Developer — Virtual Machines  (`harvester-vms`)
A Harvester VM list (`kubevirt.io.virtualmachine`). On a non-Harvester cluster it shows a friendly
**Banner** explaining the CRD isn't present — a good pattern for feature-gated views.
- **Persona note:** the *Feature Developer* owns one feature end-to-end; this view is the "does my
  feature exist here, and what's running?" check.

---

## Creative gallery — use & abuse

`kubectl apply -f creative-examples.yaml`

These push what a runtime-compiled SFC can really do — **SVG charts, interactivity, live search,
aggregation** — all with the Rancher component library + plain CSS/SVG, **no extra dependencies**.

### 📈 Data-viz (no charting library)

| View | What makes it interesting |
|------|---------------------------|
| **Cluster Vitals** (`cluster-vitals`) | a hand-rolled **SVG donut** of pod phases + KPI tiles + a "pulse" grid with one coloured dot per pod. *Cluster Admin.* |
| **Namespace Heatmap** (`namespace-heatmap`) | every namespace as a tile, background **HSL-interpolated** green→red by pod count. *Cluster Admin.* |
| **Image Inventory** (`image-inventory`) | every container image ranked, each row an **inline usage bar**. *Feature / Security.* |
| **Storage Treemap** (`storage-treemap`) | PVCs as a **CSS-grid treemap** — tiles span more cells the more disk they request. *Cluster Admin.* |
| **Fleet Command** home (`home-fleet-command`) | big **KPI tiles** + a provider-distribution **bar chart**. *Rancher Admin.* |

### ⚡ Interactivity & live data

| View | What makes it interesting |
|------|---------------------------|
| **Deployment Control Panel** (`deploy-control`) | **+/− buttons that actually scale** — writes `spec.replicas` via `resource.save()`, with a live availability bar. The *Click Developer*'s dream. *App Developer.* |
| **Command Launcher** home (`home-command-launcher`) | a hero **type-to-filter** search that live-filters cluster cards and jumps on click. *Cloud / Local Developer.* |
| **Event Ticker** (`event-ticker`) | the cluster's recent events as a **feed**, warnings tinted red, newest first. *Cluster Admin / SRE.* |

### 🧮 Aggregation & insight

| View | What makes it interesting |
|------|---------------------------|
| **Restart Leaderboard** (`restart-leaderboard`) | the **flappiest pods** ranked by total container restarts, badge-coloured by severity. *Cluster Admin.* |
| **Traffic Lights** (`traffic-lights`) | one glowing **status light** per subsystem (nodes / deployments / pods / jobs). *Cluster Admin.* |
| **Workload Board** (`workload-board`) | deployments as a **kanban**, columned by namespace, cards flagged red when degraded. *App Developer.* |

### 🎈 Playful

| View | What makes it interesting |
|------|---------------------------|
| **Cluster Weather** home (`home-cluster-weather`) | a giant **emoji forecast** — ☀️ sunny when healthy, ⛈️ stormy when clusters are down. *AI Developer's "just make it fun".* |

### Techniques you can steal

- **SVG donut** — one `<circle r="15.9155">` per segment (circumference ≈ 100), `stroke-dasharray="pct 100-pct"` + a running `stroke-dashoffset`. No library.
- **Heatmap colour** — `background: hsl(${140 - ratio*140}, 62%, 42%)` maps 0→1 to green→red.
- **Write-back** — mutate the fetched resource and persist: `d.spec.replicas = n; await d.save();`.
- **Live filter** — bind an `<input v-model="q">` and filter a computed list; instant, no round-trip.
- **CSS treemap** — `grid-auto-flow: dense` + per-tile `grid-column/row: span N` bucketed by value.
- **Inline bars** — an absolutely-positioned `.bar` with `width: ${value/max*100}%` behind the row text.

---

## How each persona builds these

- **AI Developer** — open the Blank Canvas, pick **New**, choose **Global** or **Cluster**, then ask
  the **Custom View Builder** chat: *"list my NodePort services with their ports."* It writes the
  SFC into `spec.source`; the preview updates live. Same loop in the Home editor for Home pages.
- **Click Developer** — edit the SFC by hand in the source pane, then drag the **"this view"** chip
  into the nav tree to set its group and position (writes `spec.nav.group` / `weight` /
  `itemWeight`). No YAML required.
- **Cloud Developer** — work in the **Global** Blank Canvas (`/c/_/ai-templating/canvas`). Views are
  cluster-less and portable; the **Portable Bundle** is the canonical example.
- **Local Developer** — work in the **Cluster** Blank Canvas (open **Blank Canvas** from inside a
  cluster's navbar). The cluster is loaded, so `cluster/*` data previews live — ideal for **Service
  Access** and other host-reachability views.

---

## Anatomy of an example (for remixers)

Each example is one CR. A cluster-scoped code view looks like:

```yaml
apiVersion: templating.rancher.io/v1alpha1
kind: CustomView
metadata: { name: my-view, namespace: default }
spec:
  kind: code                       # 'code' = a Vue SFC in spec.source
  meta: { id: my-view, name: My View, icon: list-flat }
  nav:
    scope: cluster                 # omit for a global (AI Templating product) view
    group: my-apps                 # collapsible section; 'root' = top level; omit = "Custom Views"
    groupLabel: My Apps            # label for a new group (omit when joining an existing one)
    weight: 97                     # group position (higher = higher up)
    # itemWeight: 10               # position WITHIN the group (higher = higher up)
  source: |                        # the SFC: one <script> + one <template> [+ <style scoped>]
    <script> ... </script>
    <template> ... </template>
```

SFC rules (runtime-compiled): **Options API only**, `this.$store` is available, load in `created()`
(not Nuxt `fetch`), prefer the component library (`ResourceTable`, `Banner`, …) over raw HTML, real
Steve type strings (`apps.deployment`, `service`, `management.cattle.io.cluster`, …), Vue 3 (never
`this.$set`), `<style scoped>` is plain CSS.
