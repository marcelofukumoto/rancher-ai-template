# Prompts — build these pages with the AI, not by hand

These are the natural-language prompts that (should) reproduce the gallery pages through the
**editor chat** instead of hand-written YAML. Paste one into the Blank Canvas chat (for Custom Views)
or the Home editor chat (for Home pages) with the matching `(S)` doc selected, and let the agent
write `spec.source`.

> **Naming:** create each as `<name>-s` with a display name ending in **“(S)”** (e.g.
> `cluster-vitals-s` → “Cluster Vitals (S)”) so the AI-generated versions sit next to the hand-built
> ones for comparison.

---

## Custom Views (Blank Canvas — Cluster type)

**Cluster Vitals (S)**
> Build a cluster vitals dashboard. Read pods and nodes from the cluster store. Show three things:
> (1) an SVG donut chart of pods grouped by phase — Running green, Pending amber, Failed red,
> Succeeded blue — with the total pod count in the middle and a small legend; (2) a row of KPI tiles:
> running pods, pending pods, failed pods, and nodes ready; (3) a grid of small squares, one per pod,
> each coloured by its phase. Use only plain CSS and inline SVG, no charting library.

**Deployment Control Panel (S)**
> List every deployment from the cluster store. For each row show the name, namespace, an availability
> bar (available ÷ desired replicas), and a “− / +” pair of buttons that scale the deployment by
> writing spec.replicas and saving. Disable the buttons while a save is in flight.

**Namespace Heatmap (S)**
> Read all pods and group them by namespace. Render one tile per namespace whose background colour
> goes from green (few pods) to red (many pods) using an HSL interpolation, with the pod count and
> namespace name on each tile. Sort busiest first.

**Image Inventory (S)**
> Read all pods, collect every container image (including init containers) and count how many pods use
> each. Show a ranked list, one row per image, with an inline bar proportional to its usage count.

**Ops Traffic Lights (S)**
> Show four “traffic light” circles — Nodes, Deployments, Pods, Jobs. Green when everything is healthy,
> amber for a small number of problems, red for many: nodes not Ready, deployments below desired
> replicas, pods not Running/Succeeded, jobs with failures. Give each light a glow and a one-line
> detail underneath.

---

## Home pages (Home editor — management store)

**Fleet Command (S)**
> Build a Home page for a Rancher admin. Read management.cattle.io.cluster. Show three big KPI tiles
> (total clusters, active, need-attention) and a small bar chart of clusters by provider.

**Command Launcher (S)**
> Build a Home page that is a big centred search box titled “Where to?”. Read
> management.cattle.io.cluster and, as the user types, live-filter a grid of cluster cards; clicking a
> card routes to that cluster’s explorer (c-cluster-explorer).

**Cluster Weather (S)**
> Build a playful Home page that reports the fleet as weather. Read management.cattle.io.cluster; if
> all are active show a big ☀️ “Sunny”, a few down → ⛅ “Partly cloudy”, many down → ⛈️ “Stormy”, with a
> one-line summary. Centre it, make the emoji huge.

---

## Note on running these (current state)

The **Blank Canvas chat is wired to `template-custom-view-code-builder`**, which is a *confirm-then-
create* persona: it replies with a plan and calls `createKubernetesResource` behind a human-validation
gate. The lightweight in-page chat has no “approve” button, so that agent **describes but never
writes** — the live loop stalls.

The persona built for live, no-confirmation editing is **`template-blank-canvas-builder`** (it writes
`spec.source` directly). To make the “prompt → page” loop actually work in the canvas, either:
- point the canvas chat back at `template-blank-canvas-builder`, or
- drop `humanValidationTools` from the code-builder (and let it update in place), or
- add a confirm affordance to `HomeConfigChat`.

Until then, these prompts are the source of truth for regenerating the pages once the writing agent is
selected.
